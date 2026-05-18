import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { buildVoiceSystemPrompt } from '@/lib/athenos';
import { readFile } from 'fs/promises';
import path from 'path';
import { tools, executeTool } from '@/lib/tools';
import { getUserMemories, formatMemoriesForPrompt, extractFact, saveMemory } from '@/lib/memory';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  messages: any[],
  enhancedSystemPrompt: string
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

      const finalMessage = await callAnthropicWithRetry(anthropic, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: enhancedSystemPrompt,
        tools: tools,
        messages: currentMessages,
      });

      const currentContent = finalMessage.content;
      let isToolUse = false;
      let toolUseBlocks: any[] = [];

      if (finalMessage.stop_reason === 'tool_use') {
        isToolUse = true;
        toolUseBlocks = currentContent.filter((block: any) => block.type === 'tool_use');
      }

      if (isToolUse && toolUseBlocks.length > 0) {
        const toolUseBlock = toolUseBlocks[0];

        // Server-side tools (web_search) are executed by Anthropic infrastructure.
        // Their results are already embedded in currentContent — no manual execution needed.
        if (toolUseBlock.name === 'web_search') {
          currentMessages.push({
            role: 'assistant',
            content: currentContent,
          });
          continue;
        }

        // Client-side tools (get_weather) — execute locally and return result.
        const toolResult = await executeTool(toolUseBlock.name, toolUseBlock.input);

        currentMessages.push({
          role: 'assistant',
          content: currentContent,
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
        const textBlocks = currentContent.filter((block: any) => block.type === 'text');
        replyText = textBlocks.map((block: any) => block.text).join('');
        break;
      }
    }

    if (!replyText || replyText.trim().length === 0) {
      const finalResponse = await callAnthropicWithRetry(anthropic, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: enhancedSystemPrompt,
        messages: currentMessages,
      });
      const textBlocks = finalResponse.content.filter((block: any) => block.type === 'text');
      replyText = textBlocks.map((block: any) => block.text).join('') || 'No pude completar la búsqueda...';
    }

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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioBlob = formData.get('audio') as Blob;
    const historyStr = formData.get('history') as string;
    let history: Array<{ role: 'user' | 'assistant', content: string }> = [];
    try {
      if (historyStr) history = JSON.parse(historyStr);
    } catch (e) { }

    if (!audioBlob) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    }

    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

    if (!elevenLabsApiKey || !deepgramApiKey) {
      console.error('Missing API keys:', { elevenLabs: !!elevenLabsApiKey, deepgram: !!deepgramApiKey });
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // 1. STT: Deepgram Nova-3
    const audioBuffer = await audioBlob.arrayBuffer();
    const sttResponse = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true',
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${deepgramApiKey}`,
          'Content-Type': 'audio/webm',
        },
        body: audioBuffer,
      }
    );

    if (!sttResponse.ok) {
      const err = await sttResponse.text();
      console.error('STT failed:', err);
      return NextResponse.json({ error: 'Speech-to-text failed' }, { status: 500 });
    }

    const sttData = await sttResponse.json();
    const transcript = (sttData.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let memories: string[] = [];
    if (user) {
      memories = await getUserMemories(supabase, user.id);
    }

    const systemPrompt = buildVoiceSystemPrompt();
    const memoryContext = formatMemoriesForPrompt(memories);
    const enhancedSystemPrompt = memoryContext 
      ? `${systemPrompt}\n\n${memoryContext}` 
      : systemPrompt;

    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    if (wordCount < 3) {
      const fallbackPath = path.join(process.cwd(), 'public', 'audio', 'no-audio-detected.mp3');
      const fallbackAudio = await readFile(fallbackPath);
      return new NextResponse(fallbackAudio, {
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    }

    // 2. LLM: AI Provider with Tool Support
    const messages = [...history, { role: 'user', content: transcript }];
    const { reply: replyText } = await callAIProvider(messages, enhancedSystemPrompt);

    if (user && transcript) {
      (async () => {
        try {
          const fact = await extractFact(anthropic, transcript, memories);
          if (fact) {
            await saveMemory(supabase, user.id, fact);
          }
        } catch (err) {
          console.error('Background memory task failed:', err);
        }
      })();
    }

    // 3. TTS: ElevenLabs Streaming
    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/DGZn7qxTby0ozBhDeasK/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: replyText,
        model_id: 'eleven_flash_v2_5',
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!ttsResponse.ok || !ttsResponse.body) {
      const err = await ttsResponse.text();
      console.error('TTS streaming failed:', ttsResponse.status, err);
      return NextResponse.json({ error: 'Text-to-speech streaming failed' }, { status: 500 });
    }

    // 4. Return streaming audio
    return new Response(ttsResponse.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'X-User-Transcript': encodeURIComponent(transcript),
        'X-Assistant-Reply': encodeURIComponent(replyText),
        'Transfer-Encoding': 'chunked',
      },
    });

  } catch (error) {
    console.error('Voice API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to process voice request', details: errorMessage }, { status: 500 });
  }
}
