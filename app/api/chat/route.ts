import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { ModelTier, buildSystemPrompt, MODEL_BY_TIER } from '@/lib/athenos';
import { tools, executeTool } from '@/lib/tools';
import { getUserMemories, formatMemoriesForPrompt, extractFact, saveMemory } from '@/lib/memory';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const AVAILABLE_MODELS: ModelTier[] = ['sophocles', 'athena'];

function isValidModel(model: unknown): model is ModelTier {
  return typeof model === 'string' && ['sophocles', 'socrates', 'ares', 'athena'].includes(model);
}

// Check if user has access to a specific persona tier
// Currently a placeholder — will be replaced with real Stripe/Paddle subscription check
async function userHasAccessToTier(userEmail: string | undefined, tier: ModelTier): Promise<boolean> {
  // Sophocles is free for all (including anonymous)
  if (tier === 'sophocles') return true;
  
  // Admin/founder emails get full access to all tiers (dev + production)
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  
  if (userEmail && adminEmails.includes(userEmail.toLowerCase())) {
    return true;
  }
  
  // All other users: non-sophocles tiers require Strategist subscription
  // PLACEHOLDER: currently always returns false (no paid users yet)
  // TODO: when Stripe/Paddle integration lands, query user's subscription status here
  return false;
}

function shouldFallback(error: any): boolean {
  const status = error?.status || error?.response?.status;
  // Do NOT fallback on 400 Bad Request
  if (status === 400) return false;
  return true;
}

async function callAnthropicWithRetry(client: Anthropic, params: any, maxRetries = 2) {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (err: any) {
      lastError = err;
      // Only retry on 529 (overloaded) — other errors fail immediately
      if (err.status !== 529 || attempt === maxRetries) {
        throw err;
      }
      // Exponential backoff: 1s, 2s, 4s...
      const delayMs = Math.pow(2, attempt) * 1000;
      console.log(`[Provider:anthropic] 529 Overloaded, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function callAIProvider(
  messages: Message[],
  enhancedSystemPrompt: string,
  model: ModelTier
): Promise<{ reply: string; provider: 'anthropic' | 'openai' }> {
  // 1. Try Anthropic
  console.log('[Provider:anthropic] Attempting...');
  try {
    let currentMessages: any[] = [...messages];
    let replyText = '';
    let iterations = 0;
    const MAX_ITERATIONS = 6;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await callAnthropicWithRetry(client, {
        model: MODEL_BY_TIER[model],
        max_tokens: 1024,
        system: enhancedSystemPrompt,
        tools: tools,
        messages: currentMessages,
      });

      if (response.stop_reason === 'tool_use') {
        const toolUseBlock = response.content.find((block: any) => block.type === 'tool_use') as any;
        if (!toolUseBlock) break;

        // Server-side tools (web_search) are executed by Anthropic infrastructure.
        // Their results are already embedded in response.content — no manual execution needed.
        if (toolUseBlock.name === 'web_search') {
          currentMessages.push({
            role: 'assistant',
            content: response.content,
          });
          continue;
        }

        // Client-side tools (get_weather) — execute locally and return result.
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
        const textBlocks = response.content.filter((block: any) => block.type === 'text');
        replyText = textBlocks.map((block: any) => block.text).join('');
        break;
      }
    }

    if (!replyText || replyText.trim().length === 0) {
      const finalResponse = await callAnthropicWithRetry(client, {
        model: MODEL_BY_TIER[model],
        max_tokens: 1024,
        system: enhancedSystemPrompt,
        messages: currentMessages,
      });
      const textBlocks = finalResponse.content.filter((block: any) => block.type === 'text');
      replyText = textBlocks.map((block: any) => block.text).join('') || 'No pude completar la búsqueda. ¿Podés reformular tu pregunta?';
    }

    if (!replyText) throw new Error('Unexpected response type');

    console.log('[Provider:anthropic] Success');
    return { reply: replyText, provider: 'anthropic' };
  } catch (error: any) {
    console.error(`[Provider:anthropic] Failed after retries: ${error.message || 'Unknown error'}`);
    if (!shouldFallback(error)) throw error;
  }

  // 2. Try OpenAI
  if (process.env.ENABLE_OPENAI_FALLBACK === 'true') {
    try {
      console.log('[Provider:openai] Attempting fallback...');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const fullMessages = [
        { role: 'system', content: enhancedSystemPrompt },
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
  } else {
    console.log('[Provider:openai] Skipped (ENABLE_OPENAI_FALLBACK not set)');
  }

  // All failed
  throw new Error('NO_PROVIDER_AVAILABLE');
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

    // Gating: check if user has access to selected persona
    const hasAccess = await userHasAccessToTier(user?.email, model);
    if (!hasAccess) {
      return NextResponse.json(
        { 
          error: 'STRATEGIST_REQUIRED', 
          message: `${model} is available on Strategist plan only. Upgrade to access deep reasoning.`,
          upgradeUrl: '/upgrade'
        },
        { status: 403 }
      );
    }

    const systemPrompt = buildSystemPrompt(model);

    // Fetch user memories
    let memories: string[] = [];
    if (user) {
      memories = await getUserMemories(supabase, user.id);
    }
    
    // Inject memories into system prompt
    const memoryContext = formatMemoriesForPrompt(memories);
    const enhancedSystemPrompt = memoryContext 
      ? `${systemPrompt}\n\n${memoryContext}` 
      : systemPrompt;

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

    const { reply: replyText, provider } = await callAIProvider(messages, enhancedSystemPrompt, model);

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

    // Fire-and-forget: extract and save memory in background
    // Don't await — user gets response immediately
    if (user && messages.length > 0) {
      const lastUserMessage = messages[messages.length - 1].content;
      
      // Run in background (don't block response)
      (async () => {
        try {
          const fact = await extractFact(client, lastUserMessage, memories);
          if (fact) {
            await saveMemory(supabase, user.id, fact);
          }
        } catch (err) {
          console.error('Background memory task failed:', err);
        }
      })();
    }

    return NextResponse.json({
      reply: replyText,
      provider,
      conversationId: conversationId,
    });

  } catch (error) {
    console.error('Chat API error:', error);
    if (error instanceof Error && (error.message === 'ALL_PROVIDERS_FAILED' || error.message === 'NO_PROVIDER_AVAILABLE')) {
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