// Shared speech helpers for the dedicated /api/stt and /api/tts endpoints.
// The configuration mirrors exactly what /api/voice uses inline, so the voice
// agent and the new endpoints stay consistent. /api/voice itself is left
// untouched to avoid any risk of breaking the existing voice screen.

export const STT_ENDPOINT =
  'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true&mimetype=audio/webm';

export const TTS_ENDPOINT =
  'https://api.elevenlabs.io/v1/text-to-speech/DGZn7qxTby0ozBhDeasK/stream';

export const TTS_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
};

// Transcribe an audio buffer (webm/opus) to text using Deepgram Nova-3.
// Returns the trimmed transcript (may be an empty string if no speech).
export async function speechToText(audioBuffer: ArrayBuffer): Promise<string> {
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) throw new Error('Missing DEEPGRAM_API_KEY');

  const response = await fetch(STT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Token ${deepgramApiKey}`,
      'Content-Type': 'audio/webm',
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('STT failed:', response.status, err);
    throw new Error('Speech-to-text failed');
  }

  const data: any = await response.json();
  return (data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '').trim();
}

// Stream text-to-speech via ElevenLabs (mp3). Returns the raw fetch Response
// so the caller can pipe its .body through with a matching Content-Type.
export async function textToSpeech(text: string): Promise<Response> {
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsApiKey) throw new Error('Missing ELEVENLABS_API_KEY');

  const ttsResponse = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'xi-api-key': elevenLabsApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
      output_format: 'mp3_44100_128',
      voice_settings: TTS_VOICE_SETTINGS,
    }),
  });

  if (!ttsResponse.ok || !ttsResponse.body) {
    const err = await ttsResponse.text();
    console.error('TTS streaming failed:', ttsResponse.status, err);
    throw new Error('Text-to-speech streaming failed');
  }

  return ttsResponse;
}