import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { conversationId: string } }) {
  try {
    const { conversationId } = params;

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId é obrigatório' }, { status: 400 });
    }

    // Buscar detalhes da conversa no backend
    const backendRes = await fetch(`${BACKEND_URL}/api/whatsapp/conversations/${conversationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao buscar conversa', details: err.message }, { status: 500 });
  }
}