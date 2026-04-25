import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
    try {
        const { message } = await req.json();

        if (!message) {
            return NextResponse.json(
                { error: 'Message is required' },
                { status: 400 }
            );
        }

        const response = await client.messages.create({
            model: 'claude-opus-4-5',
            max_tokens: 1024,
            messages: [
                { role: 'user', content: message },
            ],
        });

        const textContent = response.content[0];
        if (textContent.type !== 'text') {
            throw new Error('Unexpected response type');
        }

        return NextResponse.json({ reply: textContent.text });
    } catch (error) {
        console.error('Chat API error:', error);
        return NextResponse.json(
            { error: 'Failed to process request' },
            { status: 500 }
        );
    }
}