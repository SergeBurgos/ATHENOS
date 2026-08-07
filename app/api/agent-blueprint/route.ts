import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/auth';
import { generateBlueprint, Blueprint, BlueprintHistoryEntry } from '@/lib/agentBlueprint';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawGoal = body?.goal;
    const goal = typeof rawGoal === 'string' ? rawGoal.trim() : '';

    if (!goal) {
      return NextResponse.json({ error: 'goal required' }, { status: 400 });
    }

    const { user, error: authError } = await getAuthenticatedClient(req);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    // Optional full conversation history informing the plan.
    let history: BlueprintHistoryEntry[] | undefined;
    if (Array.isArray(body?.history)) {
      history = body.history
        .filter((h: any) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .map((h: any) => ({ role: h.role, content: h.content }));
    }

    let sanitized: Blueprint;
    try {
      sanitized = await generateBlueprint(goal, history);
    } catch (err: any) {
      const code = err?.message;
      if (code === 'no_api_key') {
        return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
      }
      if (code === 'refusal' || code === 'bad_generation') {
        return NextResponse.json({ error: code }, { status: 502 });
      }
      throw err;
    }

    return NextResponse.json(sanitized);
  } catch (error: any) {
    console.error('agent-blueprint error:', error?.message || error);
    return NextResponse.json({ error: 'upstream' }, { status: 502 });
  }
}