import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildVoiceSystemPrompt } from '@/lib/athenos';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioBlob = formData.get('audio') as Blob;

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
    const transcript = sttData.text;

    if (!transcript || !transcript.trim()) {
      return NextResponse.json({ error: 'No speech detected' }, { status: 400 });
    }

    // 2. LLM: Anthropic Haiku
    const llmResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: buildVoiceSystemPrompt(),
      messages: [{ role: 'user', content: transcript }],
    });

    const textContent = llmResponse.content[0];
    if (textContent.type !== 'text') {
      throw new Error('Unexpected Claude response type');
    }
    const replyText = textContent.text;

    // 3. TTS: ElevenLabs
    const ttsResponse = await fetch('https://api.elevenlabs.io/v1/text-to-speech/DGZn7qxTby0ozBhDeasK', {
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

    if (!ttsResponse.ok) {
      const err = await ttsResponse.text();
      console.error('TTS failed:', err);
      return NextResponse.json({ error: 'Text-to-speech failed' }, { status: 500 });
    }

    const audioBuffer = await ttsResponse.arrayBuffer();

    // 4. Return audio
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });

  } catch (error) {
    console.error('Voice API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to process voice request', details: errorMessage }, { status: 500 });
  }
}
