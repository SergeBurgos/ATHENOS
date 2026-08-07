import Anthropic from '@anthropic-ai/sdk';
import { ATHENOS_BASE_PROMPT, MODEL_BY_TIER } from '@/lib/athenos';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const VALID_MINDS = new Set(['Athena', 'Socrates', 'Ares', 'Sophocles']);

export const AGENT_BLUEPRINT_INSTRUCTION = `You are a blueprint generator. Your task is to produce a structured plan for any given goal.

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

export const MODEL = MODEL_BY_TIER['athena'];

interface Step {
  title: string;
  note: string;
  mind: string;
}

export interface Blueprint {
  title: string;
  steps: Step[];
}

export type BlueprintHistoryEntry = { role: 'user' | 'assistant'; content: string };

// Build a compact transcript from the agent conversation to inform the plan.
function renderHistory(history: BlueprintHistoryEntry[]): string {
  if (!history || history.length === 0) return '';
  return history
    .map((m) => `${m.role === 'user' ? 'Usuario' : 'Agente'}: ${m.content}`)
    .join('\n');
}

export function sanitizeBlueprint(raw: Blueprint): Blueprint {
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

/**
 * Generate a structured blueprint from a goal and, optionally, the full agent
 * conversation that led to it. Keeps the old goal-only behavior when no
 * history is provided (backwards compatible). Throws on generation/parse
 * failure (caller handles the 50x status).
 */
export async function generateBlueprint(
  goal: string,
  history?: BlueprintHistoryEntry[]
): Promise<Blueprint> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('no_api_key');

  const systemPrompt = `${ATHENOS_BASE_PROMPT}\n\n${AGENT_BLUEPRINT_INSTRUCTION}`;

  let userContent = `The goal: ${goal}`;
  if (history && history.length > 0) {
    const transcript = renderHistory(history);
    const truncated = transcript.slice(-12000);
    userContent = `The goal: ${goal}\n\nContext (conversation between the user and the agent):\n${truncated}\n\nBase the plan on this full context, not only the goal.`;
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  if (response.stop_reason === 'refusal') throw new Error('refusal');

  const contentBlock = response.content.find(b => b.type === 'text') as any;
  let text = contentBlock?.text || '';

  text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('bad_generation');
  }
  const jsonStr = text.slice(firstBrace, lastBrace + 1);

  let blueprint: Blueprint;
  try {
    blueprint = JSON.parse(jsonStr);
  } catch {
    throw new Error('bad_generation');
  }

  return sanitizeBlueprint(blueprint);
}