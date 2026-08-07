import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/auth';
import { speechToText } from '@/lib/speech';

export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedClient(req);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const formData = await req.formData();
    const audioBlob = formData.get('audio') as Blob | null;

    if (!audioBlob) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    }

    const audioBuffer = await audioBlob.arrayBuffer();
    if (audioBuffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty audio' }, { status: 400 });
    }

    let text: string;
    try {
      text = await speechToText(audioBuffer);
    } catch (err: any) {
      console.error('STT endpoint failed:', err?.message || err);
      return NextResponse.json({ error: 'Speech-to-text failed' }, { status: 500 });
    }

    return NextResponse.json({ text });
  } catch (error: any) {
    console.error('STT API error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}