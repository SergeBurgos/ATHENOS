import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthenticatedClient } from '@/lib/auth';
import { ATHENOS_BASE_PROMPT, MODEL_BY_TIER } from '@/lib/athenos';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const VALID_MINDS = new Set(['Athena', 'Socrates', 'Ares', 'Sophocles']);

const AGENT_BLUEPRINT_INSTRUCTION = `You are a blueprint generator. Your task is to produce a structured plan for any given goal.

Return ONLY a JSON object with NO markdown fences, NO preamble, NO commentary. The response must be parseable as JSON directly.

The JSON shape:
{
  "title": string (max 60 characters, a concise name for this blueprint),
  "steps": [
    {
      "title": string (max 40 characters, imperative verb phrase),
      "note": string (max 90 characters, what to do or keep in mind),
      "mind": "Athena" | "Socrates" | "Ares" | "Sophocles"
    }
  ]
}

Rules:
- Title must be ≤ 60 chars.
- Generate 4 to 6 steps. Each step title ≤ 40 chars (imperative form), note ≤ 90 chars.
- Assign each step to the mind whose strength matches:
  - "Athena" — strategy, analysis, deep reasoning, decision-making
  - "Socrates" — questioning assumptions, review, reflection, critical thinking
  - "Ares" — execution, action, building, implementation
  - "Sophocles" — writing, communication, drafting, presentation
- Steps must be in logical execution order.
- Language: All user-facing text (title and note) must be in the same language as the user's goal. The JSON structure and mind names ("Athena", "Socrates", "Ares", "Sophocles") remain in English.
- Output ONLY the JSON object. No fence, no text before or after.`;

const MODEL = MODEL_BY_TIER['athena'];

interface Step {
  title: string;
  note: string;
  mind: string;
}

interface Blueprint {
  title: string;
  steps: Step[];
}

function sanitizeBlueprint(raw: Blueprint): Blueprint {
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 80) : '';
  if (!title) throw new Error('invalid_title');

  const steps: Step[] = Array.isArray(raw.steps) ? raw.steps : [];
  if (steps.length < 3) throw new Error('too_few_steps');

  const sanitizedSteps = steps.slice(0, 6).map(s => ({
    title: typeof s.title === 'string' ? s.title.trim().slice(0, 60) : '',
    note: typeof s.note === 'string' ? s.note.trim().slice(0, 120) : '',
    mind: VALID_MINDS.has(s.mind) ? s.mind : 'Athena',
  }));

  return { title, steps: sanitizedSteps };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawGoal = body?.goal;
    const goal = typeof rawGoal === 'string' ? rawGoal.trim() : '';

    if (!goal) {
      return NextResponse.json({ error: 'goal required' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
    }

    const { user, error: authError } = await getAuthenticatedClient(req);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const systemPrompt = `${ATHENOS_BASE_PROMPT}\n\n${AGENT_BLUEPRINT_INSTRUCTION}`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: `The goal: ${goal}` }],
    });

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'refusal' }, { status: 502 });
    }

    const contentBlock = response.content.find(b => b.type === 'text') as any;
    let text = contentBlock?.text || '';

    text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return NextResponse.json({ error: 'bad_generation' }, { status: 502 });
    }
    const jsonStr = text.slice(firstBrace, lastBrace + 1);

    let blueprint: Blueprint;
    try {
      blueprint = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: 'bad_generation' }, { status: 502 });
    }

    const sanitized = sanitizeBlueprint(blueprint);

    return NextResponse.json(sanitized);
  } catch (error: any) {
    console.error('agent-blueprint error:', error?.message || error);
    return NextResponse.json({ error: 'upstream' }, { status: 502 });
  }
}
