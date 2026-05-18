import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// Fetch all memories for a user
export async function getUserMemories(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('content')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Failed to fetch memories:', error);
      return [];
    }
    
    return (data || []).map(m => m.content);
  } catch (err) {
    console.error('Memory fetch error:', err);
    return [];
  }
}

// Format memories as context for system prompt
export function formatMemoriesForPrompt(memories: string[]): string {
  if (memories.length === 0) return '';
  
  return `
WHAT YOU KNOW ABOUT THE USER (from previous conversations):
${memories.map(m => `- ${m}`).join('\n')}

Use this knowledge naturally in your responses. Don't list it back unless asked.
`;
}

// Extract a new fact from a user message (returns null if no fact worth saving)
export async function extractFact(
  client: Anthropic,
  userMessage: string,
  existingMemories: string[]
): Promise<string | null> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `You analyze user messages for personal facts worth remembering long-term. 

Return facts about: name, age, location, job/role, family, pets, preferences, ongoing projects, recurring topics, important relationships.

DO NOT return: temporary states (mood today), one-off questions (capital of X), conversation context.

Existing memories about this user:
${existingMemories.length > 0 ? existingMemories.map(m => `- ${m}`).join('\n') : '(none)'}

If the message contains a NEW personal fact not already in memories, respond with a single concise sentence stating that fact. Example: "User's name is Santiago." or "User lives in Tegucigalpa, Honduras."

If no new personal fact, respond with exactly: NONE

Be conservative. When in doubt, return NONE.`,
      messages: [{ role: 'user', content: userMessage }],
    });
    
    const textBlock = response.content.find((b: any) => b.type === 'text') as any;
    const result = textBlock?.text?.trim() || 'NONE';
    
    if (result === 'NONE' || result.length < 10) return null;
    
    return result;
  } catch (err) {
    console.error('Memory extraction failed:', err);
    return null;
  }
}

// Save a fact to memories table
export async function saveMemory(
  supabase: SupabaseClient,
  userId: string,
  content: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('memories')
      .insert({ user_id: userId, content });
    
    if (error) {
      console.error('Failed to save memory:', error);
      return false;
    }
    
    console.log(`[memory] Saved: "${content}"`);
    return true;
  } catch (err) {
    console.error('Memory save error:', err);
    return false;
  }
}
