import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthenticatedClient } from '@/lib/auth';
import { ATHENOS_BASE_PROMPT, TIER_PROMPTS, MODEL_BY_TIER } from '@/lib/athenos';
import type { ModelTier } from '@/lib/athenos';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const VALID_MODELS: ModelTier[] = ['sophocles', 'socrates', 'ares', 'athena'];

const PERSONA_NAMES: Record<ModelTier, string> = {
  sophocles: 'Sophocles',
  socrates: 'Socrates',
  ares: 'Ares',
  athena: 'Athena',
};

function isValidModel(m: unknown): m is ModelTier {
  return typeof m === 'string' && VALID_MODELS.includes(m as ModelTier);
}

interface TranscriptEntry {
  speaker: 'a' | 'b';
  text: string;
}

function createDialogueStream(params: any): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      try {
        const streamResult = client.messages.stream(params);

        for await (const event of streamResult) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send({ type: 'delta', text: event.delta.text });
          }
        }

        send({ type: 'done' });
        controller.close();
      } catch (err: any) {
        console.error('[dialogue] stream error:', err?.message || err);
        try {
          send({ type: 'error', message: 'Ocurrió un error generando el diálogo. Intentá de nuevo.' });
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
    const { supabase, user, error: authError } = await getAuthenticatedClient(req);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Please sign in.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { topic, a, b, next, transcript, synthesis, history } = body;

    if (!topic || typeof topic !== 'string' || !topic.trim() || !a || !b) {
      return new Response(
        JSON.stringify({ error: 'topic, a and b are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidModel(a) || !isValidModel(b)) {
      return new Response(
        JSON.stringify({ error: 'Invalid mind ID' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const truncatedHistory = typeof history === 'string' ? history.slice(-6000) : '';
    const entries: TranscriptEntry[] = Array.isArray(transcript) ? transcript : [];

    if (synthesis === true) {
      const nombreA = PERSONA_NAMES[a];
      const nombreB = PERSONA_NAMES[b];

      const renderedDialogue = entries
        .map(e => `${PERSONA_NAMES[e.speaker === 'a' ? a : b]}: ${e.text}`)
        .join('\n');

      const instruction = `${nombreA} y ${nombreB} — dos de las mentes de Athenos — acaban de dialogar sobre el tema del usuario. Escribe la síntesis que AMBAS respaldan: 1-2 frases, primera persona plural, texto plano, sin prefijos de nombre, genuinamente extraída de lo dicho.`;

      const systemPrompt = `${ATHENOS_BASE_PROMPT}\n\n${instruction}`;

      let userContent = '';
      if (truncatedHistory) userContent += `${truncatedHistory}\n\n`;
      userContent += `Tema: ${topic.trim()}`;
      if (renderedDialogue) userContent += `\n\n${renderedDialogue}`;
      userContent += '\n\nAhora la síntesis compartida.';

      return createDialogueStream({
        model: MODEL_BY_TIER['athena'],
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });
    }

    if (next !== 'a' && next !== 'b') {
      return new Response(
        JSON.stringify({ error: 'next must be a or b' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const speakerId: ModelTier = next === 'b' ? b : a;
    const otherId = next === 'b' ? a : b;
    const otherName = PERSONA_NAMES[otherId];

    const turnInstruction = `Estás en un diálogo hablado corto y agudo con ${otherName} — otra mente de Athenos — sobre el tema del usuario. Responde directo al último punto, en tu propia voz. 1-3 frases, texto plano, sin prefijos de nombre, sin listas. Discrepa cuando genuinamente lo veas distinto; concede cuando la otra tenga razón. Mantenlo útil para quien escucha.`;

    const systemPrompt = `${ATHENOS_BASE_PROMPT}\n\n${TIER_PROMPTS[speakerId]}\n\n${turnInstruction}`;

    let opening = '';
    if (truncatedHistory) opening += `${truncatedHistory}\n\n`;
    opening += `Tema del diálogo: ${topic.trim()}`;

    const messages: any[] = [
      { role: 'user', content: opening },
    ];

    for (const entry of entries) {
      const role = entry.speaker === next ? 'assistant' : 'user';
      messages.push({ role, content: entry.text });
    }

    return createDialogueStream({
      model: MODEL_BY_TIER[speakerId],
      max_tokens: 500,
      system: systemPrompt,
      messages,
    });

  } catch (error: any) {
    console.error('[dialogue] error:', error?.message || error);
    return new Response(
      JSON.stringify({ type: 'error', message: 'Error interno del servidor.' }),
      { status: 500, headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } }
    );
  }
}
