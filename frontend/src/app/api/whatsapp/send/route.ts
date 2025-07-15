import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, jid, message, conversationId, options } = body;

    if (!sessionId || !jid || !message || !conversationId) {
      return NextResponse.json({ error: 'sessionId, jid, message e conversationId são obrigatórios' }, { status: 400 });
    }

    // Enviar mensagem para o backend
    const backendRes = await fetch(`${BACKEND_URL}/api/whatsapp/sessions/${sessionId}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jid, message, conversationId, options }),
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao enviar mensagem', details: err.message }, { status: 500 });
  }
}