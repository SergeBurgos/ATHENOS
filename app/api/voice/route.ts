import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildVoiceSystemPrompt } from '@/lib/athenos';
import { readFile } from 'fs/promises';
import path from 'path';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
    if (!elevenLabsApiKey) {
      return NextResponse.json({ error: 'ElevenLabs API key missing' }, { status: 500 });
    }

    // 1. STT: ElevenLabs Scribe
    const sttFormData = new FormData();
    sttFormData.append('file', audioBlob);
    sttFormData.append('model_id', 'scribe_v2');

    const sttResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey,
      },
      body: sttFormData,
    });

    if (!sttResponse.ok) {
      const err = await sttResponse.text();
      console.error('STT failed:', err);
      return NextResponse.json({ error: 'Speech-to-text failed' }, { status: 500 });
    }

    const sttData = await sttResponse.json();
    const transcript = (sttData.text || '').trim();

    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    if (wordCount < 3) {
      const fallbackPath = path.join(process.cwd(), 'public', 'audio', 'no-audio-detected.mp3');
      const fallbackAudio = await readFile(fallbackPath);
      return new NextResponse(fallbackAudio, {
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    }

    // 2. LLM: Anthropic Haiku Streaming
    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: buildVoiceSystemPrompt(),
      messages: [...history, { role: 'user', content: transcript }],
    });

    let replyText = '';
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        replyText += chunk.delta.text;
      }
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
