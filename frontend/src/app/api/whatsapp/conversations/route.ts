import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  const q = searchParams.get('q');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId é obrigatório' }, { status: 400 });
  }

  // Monta a URL do backend
  const backendUrl = new URL('/api/whatsapp/conversations', BACKEND_URL);
  backendUrl.searchParams.set('sessionId', sessionId);
  if (q) backendUrl.searchParams.set('q', q);

  try {
    const backendRes = await fetch(backendUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao conectar ao backend', details: err.message }, { status: 500 });
  }
} 