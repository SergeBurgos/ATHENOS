import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ATHENOS_SYSTEM_PROMPT = `You are ATHENOS, an all-in-one AI super-agent designed to save time and execute tasks for entrepreneurs and professionals.

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [] } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }

    // Build conversation history for Claude
    const messages: Message[] = [
      ...history,
      { role: 'user', content: message },
    ];

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: ATHENOS_SYSTEM_PROMPT,
      messages: messages,
    });

    const textContent = response.content[0];
    if (textContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    return NextResponse.json({
      reply: textContent.text,
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