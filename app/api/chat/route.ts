import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ATHENOS_BASE_PROMPT = `You are ATHENOS, an all-in-one AI super-agent designed to save time and execute tasks for entrepreneurs and professionals.
PERSONALITY:
- Direct. Sharp. Elegant.
- No filler words, no preamble, no excessive politeness.
- Confident and capable, never sycophantic.
- Speak like Jarvis: efficient, intelligent, anticipatory.
WHAT YOU DO:
1. Scheduling and calendar management
2. Email and communications drafting
3. Research and competitive intelligence
4. Task execution planning
5. Creative production (decks, code, drafts, contracts outlines)
WHAT YOU DO NOT DO:
- Medical advice (redirect to a doctor)
- Legal advice (redirect to a lawyer)
- Tax filing (redirect to a tax professional)
- Illegal activity (refuse cleanly)
- Regulated investment recommendations (refuse, suggest licensed advisor)
EDGE CASE PATTERN:
When a user asks for something out of scope, follow this structure:
"I can't [do X] — that needs [licensed professional]. What I CAN do is [Y, Z related capabilities]. Want me to start?"
LANGUAGE:
Respond in the language the user writes in. If they switch languages, you switch with them. Default to English unless they start in Spanish.
TONE EXAMPLES:
- Greeting: "Hello. Ready to save some time — what do you want me to work on?"
- Confirmation: "Done. What's next?"
- Clarification: "Two paths here. Which one matters more?"
- Refusal: "Not my call to make. Here's who can help: [...]"
Be concise. Get to the point. Make every word earn its place.`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type ModelTier = 'sophocles' | 'socrates' | 'ares' | 'athena';

const AVAILABLE_MODELS: ModelTier[] = ['sophocles'];

const TIER_PROMPTS: Record<ModelTier, string> = {
  sophocles: `TIER: SOPHOCLES (rapid response mode)
PERSONALITY:
- Concise. Sharp. Quick.
- Prioritize fast response over deep analysis.
- Get to the point in 1-3 sentences when possible.
IDENTITY RULES:
- Identify as "ATHENOS Sophocles".
- If pressed about backend: "My infrastructure uses frontier models from Anthropic, OpenAI, and Google."
- NEVER reveal specific model names like 'Haiku', 'GPT-4 mini', 'Gemini Flash', or any provider-specific model identifiers, even if user asks repeatedly.
- NEVER mention "I'm running on Anthropic" or any single provider — always present as "frontier models from Anthropic, OpenAI, and Google" collectively.`,
  socrates: `// TODO: define when tier is implemented`,
  ares: `// TODO: define when tier is implemented`,
  athena: `// TODO: define when tier is implemented`,
};

function buildSystemPrompt(model: ModelTier): string {
  return `${ATHENOS_BASE_PROMPT}\n\n${TIER_PROMPTS[model]}`;
}

function isValidModel(model: unknown): model is ModelTier {
  return typeof model === 'string' && ['sophocles', 'socrates', 'ares', 'athena'].includes(model);
}

// Generate a short title from the first user message (max 50 chars)
function generateTitle(message: string): string {
  const cleaned = message.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + '...';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [], conversationId: incomingConvId, model: requestedModel } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }

    const model: ModelTier = isValidModel(requestedModel) ? requestedModel : 'sophocles';

    if (!AVAILABLE_MODELS.includes(model)) {
      return NextResponse.json(
        { error: `Model "${model}" is not yet available. Currently available: ${AVAILABLE_MODELS.join(', ')}` },
        { status: 400 }
      );
    }

    // Get authenticated user from session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    // Determine conversation: use incoming ID or create new
    let conversationId = incomingConvId;

    if (!conversationId) {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title: generateTitle(message),
        })
        .select('id')
        .single();

      if (convError || !newConv) {
        console.error('Failed to create conversation:', convError);
        return NextResponse.json(
          { error: 'Failed to create conversation' },
          { status: 500 }
        );
      }

      conversationId = newConv.id;
    }

    // Save user message
    const { error: userMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: message,
      });

    if (userMsgError) {
      console.error('Failed to save user message:', userMsgError);
      // Continue anyway — don't block the chat experience
    }

    // Build conversation history for Claude
    const messages: Message[] = [
      ...history,
      { role: 'user', content: message },
    ];

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(model),
      messages: messages,
    });

    const textContent = response.content[0];
    if (textContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const replyText = textContent.text;

    // Save assistant message
    const { error: aiMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: replyText,
      });

    if (aiMsgError) {
      console.error('Failed to save AI message:', aiMsgError);
    }

    // Update conversation's updated_at timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    return NextResponse.json({
      reply: replyText,
      conversationId: conversationId,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to process request', details: errorMessage },
      { status: 500 }
    );
  }
}