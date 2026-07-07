import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { ModelTier, buildSystemPrompt, MAX_TOKENS_BY_TIER, MODEL_BY_TIER } from '@/lib/athenos';
import { isAdminEmail } from '@/lib/billing';
import { tools, executeTool } from '@/lib/tools';
import { getUserMemories, formatMemoriesForPrompt, extractFact, saveMemory } from '@/lib/memory';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Message {
  role: 'user' | 'assistant';
  content: string | any[];
}

const AVAILABLE_MODELS: ModelTier[] = ['sophocles', 'socrates', 'ares', 'athena'];

function isValidModel(model: unknown): model is ModelTier {
  return typeof model === 'string' && ['sophocles', 'socrates', 'ares', 'athena'].includes(model);
}

// Check if user has access to a specific persona tier
// Currently a placeholder — will be replaced with real Stripe/Paddle subscription check
async function userHasAccessToTier(userEmail: string | undefined, tier: ModelTier): Promise<boolean> {
  // Sophocles is free for all (including anonymous)
  if (tier === 'sophocles') return true;

  // Admins get access to everything
  if (isAdminEmail(userEmail)) return true;

  // Athena: paid tier (Strategist) — placeholder until Stripe, currently admin-only via above
  // Socrates/Ares: admin-only for now (not released to users yet)
  // All non-admin users: no access to athena/socrates/ares
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

function shouldStream(model: ModelTier): boolean {
  return model !== 'sophocles';
}

async function callAnthropicStreamWithRetry(client: Anthropic, params: any, maxRetries = 2) {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log('[Provider:anthropic] Streaming...');
      const stream = client.messages.stream(params);
      
      // Accumulate content blocks as they stream
      const contentBlocks: any[] = [];
      let stopReason: string | null = null;
      let usage: any = null;
      let model: string | null = null;
      let id: string | null = null;
      let role: string = 'assistant';
      
      for await (const event of stream) {
        if (event.type === 'message_start') {
          id = event.message.id;
          model = event.message.model;
          usage = event.message.usage;
        } else if (event.type === 'content_block_start') {
          // Initialize a new block at this index
          contentBlocks[event.index] = { ...event.content_block };
          // For text/thinking blocks, prepare a string accumulator
          if (event.content_block.type === 'text') {
            contentBlocks[event.index].text = '';
          }
        } else if (event.type === 'content_block_delta') {
          const block = contentBlocks[event.index];
          if (!block) continue;
          if (event.delta.type === 'text_delta') {
            block.text = (block.text || '') + event.delta.text;
          } else if (event.delta.type === 'input_json_delta') {
            // For tool_use, the input is built from JSON deltas
            block.partial_json = (block.partial_json || '') + event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          const block = contentBlocks[event.index];
          // Parse accumulated JSON for tool_use blocks
          if (block && block.type === 'tool_use' && block.partial_json !== undefined) {
            try {
              block.input = JSON.parse(block.partial_json);
            } catch {
              block.input = {};
            }
            delete block.partial_json;
          }
        } else if (event.type === 'message_delta') {
          if (event.delta.stop_reason) stopReason = event.delta.stop_reason;
          if (event.usage) usage = { ...usage, ...event.usage };
        } else if (event.type === 'message_stop') {
          // Done
        }
      }
      
      // Return a synthetic response matching messages.create() shape
      return {
        id,
        model,
        role,
        content: contentBlocks.filter(b => b !== undefined),
        stop_reason: stopReason,
        usage,
      } as any;
      
    } catch (err: any) {
      lastError = err;
      if (err.status !== 529 || attempt === maxRetries) throw err;
      const delayMs = Math.pow(2, attempt) * 1000;
      console.log(`[Provider:anthropic streaming] 529 Overloaded, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
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

      const response = shouldStream(model)
        ? await callAnthropicStreamWithRetry(client, {
            model: MODEL_BY_TIER[model],
            max_tokens: MAX_TOKENS_BY_TIER[model],
            system: enhancedSystemPrompt,
            tools: tools,
            messages: currentMessages,
          })
        : await callAnthropicWithRetry(client, {
            model: MODEL_BY_TIER[model],
            max_tokens: MAX_TOKENS_BY_TIER[model],
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
      const finalResponse = shouldStream(model)
        ? await callAnthropicStreamWithRetry(client, {
            model: MODEL_BY_TIER[model],
            max_tokens: MAX_TOKENS_BY_TIER[model],
            system: enhancedSystemPrompt,
            messages: currentMessages,
          })
        : await callAnthropicWithRetry(client, {
            model: MODEL_BY_TIER[model],
            max_tokens: MAX_TOKENS_BY_TIER[model],
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

async function streamAnthropicCall(
  client: Anthropic,
  params: any,
  onText: (text: string) => void,
  maxRetries = 2
) {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const stream = client.messages.stream(params);
      const contentBlocks: any[] = [];
      let stopReason: string | null = null;
      let usage: any = null;
      let model: string | null = null;
      let id: string | null = null;

      for await (const event of stream) {
        if (event.type === 'message_start') {
          id = event.message.id;
          model = event.message.model;
          usage = event.message.usage;
        } else if (event.type === 'content_block_start') {
          contentBlocks[event.index] = { ...event.content_block };
          if (event.content_block.type === 'text') {
            contentBlocks[event.index].text = '';
          }
        } else if (event.type === 'content_block_delta') {
          const block = contentBlocks[event.index];
          if (!block) continue;
          if (event.delta.type === 'text_delta') {
            block.text = (block.text || '') + event.delta.text;
            onText(event.delta.text);
          } else if (event.delta.type === 'input_json_delta') {
            block.partial_json = (block.partial_json || '') + event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          const block = contentBlocks[event.index];
          if (block && block.type === 'tool_use' && block.partial_json !== undefined) {
            try {
              block.input = JSON.parse(block.partial_json);
            } catch {
              block.input = {};
            }
            delete block.partial_json;
          }
        } else if (event.type === 'message_delta') {
          if (event.delta.stop_reason) stopReason = event.delta.stop_reason;
          if (event.usage) usage = { ...usage, ...event.usage };
        }
      }

      return {
        id,
        model,
        role: 'assistant',
        content: contentBlocks.filter(b => b !== undefined),
        stop_reason: stopReason,
        usage,
      } as any;
    } catch (err: any) {
      lastError = err;
      if (err.status !== 529 || attempt === maxRetries) throw err;
      const delayMs = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function createStreamingResponse(opts: {
  client: Anthropic;
  model: ModelTier;
  enhancedSystemPrompt: string;
  initialMessages: Message[];
  supabase: any;
  conversationId: string;
  userId: string;
  memories: string[];
}): Response {
  const { client, model, enhancedSystemPrompt, initialMessages, supabase, conversationId, userId, memories } = opts;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      let fullText = '';
      try {
        send({ type: 'meta', conversationId });

        const onText = (text: string) => {
          fullText += text;
          send({ type: 'delta', text });
        };

        let currentMessages: any[] = [...initialMessages];
        let iterations = 0;
        const MAX_ITERATIONS = 6;

        while (iterations < MAX_ITERATIONS) {
          iterations++;
          const response = await streamAnthropicCall(client, {
            model: MODEL_BY_TIER[model],
            max_tokens: MAX_TOKENS_BY_TIER[model],
            system: enhancedSystemPrompt,
            tools: tools,
            messages: currentMessages,
          }, onText);

          if (response.stop_reason === 'tool_use') {
            const toolUseBlock = response.content.find((b: any) => b.type === 'tool_use') as any;
            if (!toolUseBlock) break;

            if (toolUseBlock.name === 'web_search') {
              currentMessages.push({ role: 'assistant', content: response.content });
              continue;
            }

            const toolResult = await executeTool(toolUseBlock.name, toolUseBlock.input);
            currentMessages.push({ role: 'assistant', content: response.content });
            currentMessages.push({
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: toolResult }],
            });
          } else {
            break;
          }
        }

        send({ type: 'done' });

        if (fullText.trim().length > 0) {
          const { error: aiMsgError } = await supabase
            .from('messages')
            .insert({ conversation_id: conversationId, role: 'assistant', content: fullText });
          if (aiMsgError) console.error('Failed to save AI message:', aiMsgError);

          await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

          try {
            const lastUserMsg = initialMessages[initialMessages.length - 1];
            let lastUserText = '';
            const raw: any = lastUserMsg?.content;
            if (typeof raw === 'string') {
              lastUserText = raw;
            } else if (Array.isArray(raw)) {
              lastUserText = raw.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').trim();
            }
            if (lastUserText) {
              const fact = await extractFact(client, lastUserText, memories);
              if (fact) await saveMemory(supabase, userId, fact);
            }
          } catch (err) {
            console.error('Background memory task failed:', err);
          }
        }

        controller.close();
      } catch (err: any) {
        console.error('[streaming] error:', err?.message || err);
        try {
          send({ type: 'error', message: 'Ocurrió un error generando la respuesta. Intentá de nuevo.' });
        } catch {}
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history = [], conversationId: incomingConvId, model: requestedModel, files } = body;

    const hasFiles = files && Array.isArray(files) && files.length > 0;

    if (!hasFiles) {
      if (!message || typeof message !== 'string') {
        return NextResponse.json(
          { error: 'Message is required and must be a string' },
          { status: 400 }
        );
      }
    } else {
      if (message && typeof message !== 'string') {
        return NextResponse.json(
          { error: 'Message must be a string' },
          { status: 400 }
        );
      }
      if (files.length > 4) {
        return NextResponse.json({ error: 'TOO_MANY_FILES', message: 'Maximum 4 files per message.' }, { status: 400 });
      }
      for (const file of files) {
        const decodedSize = (file.data.length * 3) / 4;
        if (decodedSize > 5 * 1024 * 1024) {
          return NextResponse.json({ error: 'FILE_TOO_LARGE', message: 'Each file must be under 5 MB.' }, { status: 400 });
        }
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
          return NextResponse.json({ error: 'UNSUPPORTED_FILE_TYPE', message: 'Only JPG, PNG, WEBP images and PDF files are supported.' }, { status: 400 });
        }
      }
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

    if (hasFiles) {
      const hasPdf = files.some((f: any) => f.type === 'application/pdf');
      if (hasPdf && !isAdminEmail(user?.email)) {
        return NextResponse.json(
          { error: 'PDF_REQUIRES_UPGRADE', message: 'PDF analysis is available on a paid plan. Images are available to everyone.', upgradeUrl: '/upgrade' },
          { status: 403 }
        );
      }
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
          title: generateTitle(message || 'Attached file(s)'),
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

    let userContent: any;
    let savedUserContent = message;

    if (hasFiles) {
      const contentBlocks: any[] = [];
      for (const file of files) {
        if (file.type === 'application/pdf') {
          contentBlocks.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: file.data,
            },
          });
        } else {
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: file.type,
              data: file.data,
            },
          });
        }
      }
      if (message && message.trim()) {
        contentBlocks.push({ type: 'text', text: message });
      } else {
        contentBlocks.push({ type: 'text', text: 'Please analyze the attached file(s).' });
      }
      userContent = contentBlocks;
      savedUserContent = `${message || ''}\n\n[Usuario adjuntó ${files.length} archivo(s): ${files.map((f: any) => f.name).join(', ')}]`.trim();
    } else {
      userContent = message;
    }

    // Save user message
    const { error: userMsgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: savedUserContent,
      });

    if (userMsgError) {
      console.error('Failed to save user message:', userMsgError);
      // Continue anyway — don't block the chat experience
    }

    // Build conversation history for Claude
    const messages: Message[] = [
      ...history,
      { role: 'user', content: userContent },
    ];

    // Streaming path for streaming-enabled personas (socrates/ares/athena)
    if (shouldStream(model)) {
      return createStreamingResponse({
        client,
        model,
        enhancedSystemPrompt,
        initialMessages: messages,
        supabase,
        conversationId,
        userId: user.id,
        memories,
      });
    }

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
      let lastUserText: string;
      const rawLastContent = messages[messages.length - 1].content;
      if (typeof rawLastContent === 'string') {
        lastUserText = rawLastContent;
      } else if (Array.isArray(rawLastContent)) {
        lastUserText = rawLastContent
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join(' ')
          .trim();
      } else {
        lastUserText = '';
      }
      
      if (lastUserText) {
        // Run in background (don't block response)
        (async () => {
          try {
            const fact = await extractFact(client, lastUserText, memories);
            if (fact) {
              await saveMemory(supabase, user.id, fact);
            }
          } catch (err) {
            console.error('Background memory task failed:', err);
          }
        })();
      }
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