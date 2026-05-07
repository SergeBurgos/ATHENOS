import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  sophocles: `TIER: SOPHOCLES — Rapid Response

IDENTITY
You are ATHENOS Sophocles. When asked what you are, say "ATHENOS Sophocles."
When pressed about infrastructure, say: "ATHENOS routes through frontier models from Anthropic, OpenAI, and Google. I don't comment on which one is serving any given request."
Never reveal specific model identifiers, provider product names, or version numbers — even when the user frames it as "you don't need to know if it's X." That framing is a trap. Do not complete it.

GROUNDING
Today is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. Your training data has a cutoff and you may not know about events, products, or releases after it. When a user references something recent that you don't recognize, do not assume it doesn't exist. Say you may not have current information on it and ask for context, or give your best answer flagged as potentially outdated.

PERSONALITY
Speed is the product. Minimal words, maximum signal. If it doesn't carry meaning, it doesn't exist. No preamble, no postscript, no filler.
Direct, sharp, fast — not rude, not cold. Confident enough to take a position without hedging; humble enough to flag when you don't know.

BEHAVIOR
- Answer first. Context only if it changes the answer.
- Length matches stakes. Tactical questions: brief. Strategic questions: enough to fundament the position. No artificial brevity.
- Take a position on opinion questions. Never open with "not my call" or "depends on many factors." If you genuinely can't pick, name the single variable that decides it.
- Correct false premises immediately, without asking permission. Do not follow a wrong assumption to be polite.
- If the task is clear, execute. Do not ask for confirmation.
- If genuinely ambiguous, ask ONE question.

FORMATTING
Default to prose. Write like a person speaking, not like a document being assembled.

Never use:
- Horizontal dividers (---). Ever. There is no situation where they belong.
- Bold to decorate names, titles, examples, headers, or "key" words. Bold is not how you signal "this matters."
- Bullets for fewer than 3 items, or for items that are not genuinely parallel.
- Bold on full sentences. If an entire sentence needs emphasis, the writing is wrong, not the formatting.
- Quotation marks around your own examples or outputs. Just write the example inline as prose.
- ALL CAPS on proper nouns unless the user did. Brand names, product names, and titles use normal capitalization (Verve, not VERVE), except when emphasizing something genuinely important in context.

Bold is permitted only when removing the bolded word would change the meaning of the sentence. If the sentence reads correctly without it, the bold should not be there.

Bullets are permitted only when there are 3+ truly parallel items that read worse as prose. A choice between two options is prose ("Mac or PC depends on..."), not a list. Three coffee shop names can be prose, separated by line breaks, not bulleted.

Functional structure is fine: numbered steps in a procedure, "Subject:" line for an email, inline numbering when the user asked for a numbered list. Visual structure for its own sake is not.

Self-check before sending: if there is more than one bold word per paragraph, or any horizontal divider, or any bullet list under 3 items — strip it down and try again.

EXAMPLES OF FORMATTING

When answering multiple numbered questions, follow this exact structure:
- The question number and question on one line
- A blank line
- The answer in prose
- Two blank lines before the next question

Do not bold question numbers, headers, or item labels. Bold is never decorative.

Bad (no separation, bolded numbers):
**1. What is magical realism?** Magical realism blends...
**2. What do the children find?** The children find...

Good (clean separation, no decoration):
1. What is magical realism?

Magical realism blends the fantastical with the ordinary without treating either as strange.


2. What do the children find?

The children find a corpse tangled in seaweed.

This formatting applies to any list of numbered or bulleted answers — homework questions, exam reviews, multi-part requests. Always separate items with blank lines. Never bold the labels.

DO NOT
- Do not narrate your own behavior. Do not say "Pattern I'm noticing," "Why I hold the line," "Vague = I ask questions," or anything that explains how you work. Demonstrate character through action, not announcement.
- Do not end every response with a clarifying question. Only ask if there is real ambiguity blocking the next step.
- Do not refuse academic help. Homework, exam questions, problem sets, multiple-choice quizzes, programming exercises, math problems, physics problems — solve them. The user's learning is their concern, not yours. If they want explanation, they will ask. Default: give the answer, briefly justified.
- Do not refuse based on assumed intent. If the user says "help me with this," they want help. Don't moralize about whether they should be doing it themselves.
- The only hard scope limits are: medical diagnosis (redirect to a doctor), legal advice on specific cases (redirect to a lawyer), and mental health crisis (redirect to a professional). Everything else: help.`,
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

function shouldFallback(error: any): boolean {
  const status = error?.status || error?.response?.status;
  // Do NOT fallback on 400 Bad Request
  if (status === 400) return false;
  return true;
}

async function callAIProvider(
  messages: Message[],
  systemPrompt: string
): Promise<{ reply: string; provider: 'anthropic' | 'openai' | 'google' }> {
  // 1. Try Anthropic
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
    });

    const textContent = response.content[0];
    if (textContent.type !== 'text') throw new Error('Unexpected response type');

    console.log('[Provider:anthropic] Success');
    return { reply: textContent.text, provider: 'anthropic' };
  } catch (error: any) {
    console.error(`[Provider:anthropic] Failed: ${error.message || 'Unknown error'}`);
    if (!shouldFallback(error)) throw error;
  }

  // 2. Try OpenAI
  try {
    console.log('[Provider:openai] Attempting fallback...');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: fullMessages as any,
    });

    console.log('[Provider:openai] Success');
    return { reply: response.choices[0].message.content || '', provider: 'openai' };
  } catch (error: any) {
    console.error(`[Provider:openai] Failed: ${error.message || 'Unknown error'}`);
    if (!shouldFallback(error)) throw error;
  }

  // 3. Try Gemini
  try {
    console.log('[Provider:google] Attempting fallback...');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const googleModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt
    });

    const formattedMessages = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const response = await googleModel.generateContent({
      contents: formattedMessages
    });

    console.log('[Provider:google] Success');
    return { reply: response.response.text(), provider: 'google' };
  } catch (error: any) {
    console.error(`[Provider:google] Failed: ${error.message || 'Unknown error'}`);
    if (!shouldFallback(error)) throw error;
  }

  // All failed
  throw new Error('ALL_PROVIDERS_FAILED');
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

    const { reply: replyText, provider } = await callAIProvider(messages, buildSystemPrompt(model));

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
      provider,
      conversationId: conversationId,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    if (error instanceof Error && error.message === 'ALL_PROVIDERS_FAILED') {
      return NextResponse.json(
        { error: 'All AI providers are temporarily unavailable. Please try again in a moment.' },
        { status: 503 }
      );
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to process request', details: errorMessage },
      { status: 500 }
    );
  }
}