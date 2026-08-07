import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthenticatedClient } from '@/lib/auth';
import { ATHENOS_BASE_PROMPT, MODEL_BY_TIER } from '@/lib/athenos';
import { generateBlueprint, BlueprintHistoryEntry } from '@/lib/agentBlueprint';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const AGENT_MODEL = MODEL_BY_TIER['athena'];

interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

// [DECISIÓN NECESARIA] Tool 'generate_plan':
// Pasa un único parámetro 'goal' (resumen enriquecido que el modelo compone del
// contexto, en el idioma del usuario). Elegí este formato porque da al modelo un
// estado explícito de "es momento de generar" y a la vez un resumen aprovechable.
// El backend además envía TODO el historial de la conversación a generateBlueprint,
// así el plan se informa por el contexto completo aunque el resumen sea parcial.
const generatePlanTool: Anthropic.Messages.Tool = {
  name: 'generate_plan',
  description:
    'Genera el plan estructurado cuando ya tienes suficiente contexto sobre el objetivo del usuario, o cuando el usuario pide explícitamente el plan. Pasa un resumen conciso y enriquecido del objetivo y las restricciones clave en el idioma del usuario. El backend también recibe todo el historial de la conversación.',
  input_schema: {
    type: 'object',
    properties: {
      goal: {
        type: 'string',
        description: 'Resumen conciso del objetivo del plan, con las restricciones relevantes, en el idioma del usuario.',
      },
    },
    required: ['goal'],
  },
};

// [DECISIÓN NECESARIA] Comportamiento del Agente.
// Hereda ATHENOS_BASE_PROMPT (personalidad + regla de idioma + neuro-os si el
// modelo lo usara). Solo se entrega la tool generate_plan (sin web_search), así
// que el Agente no buscará por web.
const AGENT_SYSTEM_PROMPT = `${ATHENOS_BASE_PROMPT}

You are now in AGENT mode: you help the user plan projects and tasks step by step, the core of Athena.

PLANNING FLOW:
- When the user asks for something, first ask 2-4 clarifying questions that GENUINELY change the plan — objective, scope, budget, constraints, timeline. Ask only the ones that materially matter. Never a generic "tell me more"; never ten questions. Be concise and conversational, like a consultant, not an interrogation.
- Once you have sufficient context, propose generating the plan, for example: "Con esto ya puedo armarte un plan, ¿lo genero?"
- If the user asks for the plan before you are sure, generate it right away, without insisting on more questions.
- To generate the plan call the generate_plan tool. Do not output a plan yourself as prose — the backend builds it. Until you call the tool you only reply with questions or proposals.
- After a plan already exists, if the user asks for changes, refinements, or additions, call generate_plan again to produce an updated version that incorporates the new input. Treat each refinement as a new call to generate_plan, not as prose.
- If the user is just discussing or asking questions about the plan (not requesting changes), answer conversationally without regenerating.
- Respond in the user's language.`;

const generateTitle = (message: string): string => {
  const cleaned = message.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + '...';
};

function extractAssistantText(content: any): string {
  return (content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();
}

async function callAgentModel(systemPrompt: string, messages: AgentMessage[]) {
  const baseParams = {
    model: AGENT_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    tools: [generatePlanTool],
    messages,
  };
  try {
    return await client.messages.create(baseParams);
  } catch (err: any) {
    if (err?.status === 529) {
      return await client.messages.create(baseParams);
    }
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [], conversationId: incomingConvId } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required and must be a string' }, { status: 400 });
    }

    if (!Array.isArray(history)) {
      return NextResponse.json({ error: 'history must be an array' }, { status: 400 });
    }

    const { supabase, user, error: authError } = await getAuthenticatedClient(req);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    // Resolve conversation: validate ownership of a client-supplied id, else create new.
    let conversationId = incomingConvId;
    if (conversationId) {
      const { data: ownedConv, error: lookupErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (lookupErr || !ownedConv) conversationId = null;
    }

    if (!conversationId) {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, title: generateTitle(message) })
        .select('id')
        .single();

      if (convError || !newConv) {
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
      }
      conversationId = newConv.id;
    }

    // Persist the user message.
    const { error: userMsgError } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'user', content: message });
    if (userMsgError) console.error('Failed to save user message:', userMsgError);

    // Build message array for the model: sanitized history + current message.
    const historyEntries: AgentMessage[] = history
      .filter((h: any) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
      .map((h: any) => ({ role: h.role, content: h.content }));
    const messages: AgentMessage[] = [...historyEntries, { role: 'user', content: message }];

    const response = await callAgentModel(AGENT_SYSTEM_PROMPT, messages);

    const reply = extractAssistantText(response.content);
    const toolBlock = (response.content || []).find(
      (b: any) => b.type === 'tool_use' && b.name === 'generate_plan'
    ) as any;

    // Persist the conversational reply (if any).
    if (reply) {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: reply,
        metadata: { kind: 'agent' },
      });
    }

    if (toolBlock) {
      const goal = typeof toolBlock.input?.goal === 'string' ? toolBlock.input.goal : message;

      const fullHistory: BlueprintHistoryEntry[] = [
        ...historyEntries.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ];

      let blueprint: any;
      try {
        blueprint = await generateBlueprint(goal, fullHistory);
      } catch (genErr: any) {
        console.error('[agent] plan generation failed:', genErr?.message || genErr);
        await touchConversation(supabase, conversationId);
        return NextResponse.json({ reply, conversationId, plan: null, error: 'plan_generation_failed' });
      }

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: blueprint.title,
        metadata: { kind: 'agent_plan', title: blueprint.title, steps: blueprint.steps },
      });
      await touchConversation(supabase, conversationId);

      return NextResponse.json({ reply, conversationId, plan: blueprint });
    }

    await touchConversation(supabase, conversationId);
    return NextResponse.json({ reply, conversationId, plan: null });
  } catch (error: any) {
    console.error('Agent API error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

async function touchConversation(supabase: any, conversationId: string) {
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}