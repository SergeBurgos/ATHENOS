import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ModelTier, buildSystemPrompt } from '@/lib/athenos';
import { tools, executeTool } from '@/lib/tools';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const AVAILABLE_MODELS: ModelTier[] = ['sophocles'];

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
    let currentMessages: any[] = [...messages];
    let replyText = '';
    let iterations = 0;
    const MAX_ITERATIONS = 3;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools: tools,
        messages: currentMessages,
      });

      if (response.stop_reason === 'tool_use') {
        const toolUseBlock = response.content.find((block: any) => block.type === 'tool_use') as any;
        if (!toolUseBlock) break;

        const toolResult = await executeTool(toolUseBlock.name, toolUseBlock.input);

        currentMessages.push({
          role: 'assistant',
          content: response.content,
        });
        currentMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: toolResult,
            },
          ],
        });
      } else {
        const textBlock = response.content.find((block: any) => block.type === 'text') as any;
        replyText = textBlock?.text || '';
        break;
      }
    }

    if (!replyText) throw new Error('Unexpected response type');

    console.log('[Provider:anthropic] Success');
    return { reply: replyText, provider: 'anthropic' };
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