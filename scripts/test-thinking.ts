import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function testThinking() {
  console.log('=== Test 1: Sonnet with thinking, no tools ===');
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      thinking: {
        type: 'enabled',
        budget_tokens: 2000,
      },
      messages: [
        {
          role: 'user',
          content: 'Si tengo 17 manzanas y le doy 3 a cada uno de mis 4 amigos, ¿cuántas me quedan? Pensalo paso a paso.',
        },
      ],
    } as any); // `as any` because thinking may not be in SDK types yet
    
    console.log('SUCCESS — Sonnet supports thinking.');
    console.log('Stop reason:', response.stop_reason);
    console.log('Content blocks:');
    for (const block of response.content) {
      console.log('  - type:', (block as any).type);
      if ((block as any).type === 'thinking') {
        console.log('    thinking length:', (block as any).thinking?.length || 0, 'chars');
        console.log('    thinking preview:', ((block as any).thinking || '').slice(0, 200), '...');
      }
      if ((block as any).type === 'text') {
        console.log('    text:', (block as any).text);
      }
    }
  } catch (err: any) {
    console.error('FAILED — Sonnet thinking error:');
    console.error('  status:', err.status);
    console.error('  message:', err.message);
    if (err.error) console.error('  error body:', JSON.stringify(err.error, null, 2));
  }
  
  console.log('\n=== Test 2: Opus with thinking, no tools ===');
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 4096,
      thinking: {
        type: 'enabled',
        budget_tokens: 2000,
      },
      messages: [
        {
          role: 'user',
          content: 'Si tengo 17 manzanas y le doy 3 a cada uno de mis 4 amigos, ¿cuántas me quedan? Pensalo paso a paso.',
        },
      ],
    } as any);
    
    console.log('SUCCESS — Opus supports thinking.');
    console.log('Stop reason:', response.stop_reason);
    for (const block of response.content) {
      console.log('  - type:', (block as any).type);
      if ((block as any).type === 'thinking') {
        console.log('    thinking length:', (block as any).thinking?.length || 0, 'chars');
      }
    }
  } catch (err: any) {
    console.error('FAILED — Opus thinking error:');
    console.error('  status:', err.status);
    console.error('  message:', err.message);
    if (err.error) console.error('  error body:', JSON.stringify(err.error, null, 2));
  }
  
  console.log('\n=== Test 3: Sonnet with thinking + web_search tool ===');
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      thinking: {
        type: 'enabled',
        budget_tokens: 2000,
      },
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
        } as any,
      ],
      messages: [
        {
          role: 'user',
          content: '¿Cuál es la población actual de Tegucigalpa?',
        },
      ],
    } as any);
    
    console.log('SUCCESS — Sonnet supports thinking + tools.');
    console.log('Stop reason:', response.stop_reason);
    console.log('Content block types:', response.content.map((b: any) => b.type).join(', '));
  } catch (err: any) {
    console.error('FAILED — Sonnet thinking + tools error:');
    console.error('  status:', err.status);
    console.error('  message:', err.message);
    if (err.error) console.error('  error body:', JSON.stringify(err.error, null, 2));
  }
  
  console.log('\n=== All tests done ===');
}

testThinking().catch(console.error);
