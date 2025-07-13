import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  try {
    const { sessionId } = params;
    
    const backendRes = await fetch(`${BACKEND_URL}/api/whatsapp/sessions/${sessionId}`, {
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

export async function DELETE(req: NextRequest, { params }: { params: { sessionId: string } }) {
  try {
    const { sessionId } = params;
    
    const backendRes = await fetch(`${BACKEND_URL}/api/whatsapp/sessions/${sessionId}`, {
      method: 'DELETE',
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