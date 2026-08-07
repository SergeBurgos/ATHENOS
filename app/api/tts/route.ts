import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/auth';
import { textToSpeech } from '@/lib/speech';

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedClient(req);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // [DECISIÓN NECESARIA] El TTS siempre usa la voz fija del Agent (la misma
    // que /api/voice). Se admite 'text' obligatorio; 'voice' es ignorado por
    // ahora y queda como extensión si luego se soportan varias voces/mentes.
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    // Cap input size to keep requests sane for a spoken reply.
    if (text.length > 4000) {
      return NextResponse.json({ error: 'text too long' }, { status: 400 });
    }

    let ttsResponse: Response;
    try {
      ttsResponse = await textToSpeech(text);
    } catch (err: any) {
      console.error('TTS endpoint failed:', err?.message || err);
      return NextResponse.json({ error: 'Text-to-speech failed' }, { status: 500 });
    }

    // Pipe the ElevenLabs mp3 stream straight through.
    return new Response(ttsResponse.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (error: any) {
    console.error('TTS API error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}