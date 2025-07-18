import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function POST(req: NextRequest) {
  try {
    // Tentar chamar o backend para sincronização
    const backendRes = await fetch(`${BACKEND_URL}/api/whatsapp/sync-clickup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (backendRes.ok) {
      const data = await backendRes.json();
      return NextResponse.json(data);
    } else {
      // Se backend não estiver disponível, retornar mensagem informativa
      return NextResponse.json({ 
        success: false, 
        error: 'Backend não disponível. Execute a sincronização manualmente pelo backend.',
        details: 'Para sincronizar dados do ClickUp, inicie o backend e execute a sincronização.'
      }, { status: 503 });
    }
  } catch (err: any) {
    console.error('Erro ao executar sincronização:', err);
    return NextResponse.json({ 
      success: false,
      error: 'Erro ao conectar com o backend para sincronização',
      details: err.message
    }, { status: 500 });
  }
}