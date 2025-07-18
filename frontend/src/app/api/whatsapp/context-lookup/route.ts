import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Configuração do Supabase (mesmo do backend)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  try {
    const { conversationId, sessionId } = await req.json();

    if (!conversationId || !sessionId) {
      return NextResponse.json({ 
        error: 'conversationId e sessionId são obrigatórios' 
      }, { status: 400 });
    }

    console.log(`[ContextLookup] Iniciando busca contextual para conversationId: ${conversationId}, sessionId: ${sessionId}`);

    // Debug: Verificar se há dados no ClickUp
    const { data: debugSpaces } = await supabase.from('clickup_spaces').select('name').limit(3);
    const { data: debugLists } = await supabase.from('clickup_lists').select('name').limit(3);
    const { data: debugTasks } = await supabase.from('clickup_tasks').select('name').limit(3);
    
    console.log(`[ContextLookup] DEBUG - Spaces no DB: ${debugSpaces?.length || 0}`);
    console.log(`[ContextLookup] DEBUG - Lists no DB: ${debugLists?.length || 0}`);
    console.log(`[ContextLookup] DEBUG - Tasks no DB: ${debugTasks?.length || 0}`);

    // 1. Buscar conversa
    let conversation = null;
    let convError = null;
    
    if (isNaN(Number(conversationId))) {
      // Buscar pelo wa_id diretamente
      const { data: contactData, error: contactError } = await supabase
        .from('whatsapp_contacts')
        .select('id, wa_id, profile_name')
        .eq('wa_id', conversationId)
        .single();
      
      if (contactData) {
        conversation = {
          id: `contact_${contactData.id}`,
          wa_id: contactData.wa_id,
          whatsapp_contacts: contactData
        };
      } else {
        convError = contactError;
      }
    } else {
      // Buscar conversa normal
      const { data: convData, error: convErr } = await supabase
        .from('whatsapp_conversations')
        .select(`
          id,
          conversation_id,
          whatsapp_contacts!inner(
            id,
            wa_id,
            profile_name
          )
        `)
        .eq('id', conversationId)
        .limit(1);
      
      conversation = convData?.[0];
      convError = convErr;
    }

    if (convError || !conversation) {
      console.error(`[ContextLookup] Erro ao buscar conversa:`, convError);
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
    }

    // Detectar se é grupo pelo padrão do wa_id
    const searchValue = conversation.wa_id || conversation.whatsapp_contacts?.wa_id;
    const isGroup = (searchValue && searchValue.includes('@g.us')) || false;

    console.log(`[ContextLookup] Conversa encontrada:`, { 
      id: conversation.id, 
      wa_id: searchValue, 
      isGroup: isGroup 
    });

    if (!searchValue) {
      return NextResponse.json({ error: 'ID da conversa/contato não encontrado' }, { status: 400 });
    }

    let contextData = null;
    let searchType = '';
    let targetLocation = '';

    if (isGroup) {
      // Cenário: GRUPO (Projeto)
      searchType = 'projeto';
      targetLocation = 'Projetos > Painel de Projetos > Projetos Externos';
      
      console.log(`[ContextLookup] Detectado como GRUPO - Buscando projeto com ID: ${searchValue}`);
    } else {
      // Cenário: CONVERSA DIRETA (Prospect)
      searchType = 'prospect';
      targetLocation = 'Comercial > Vendas > Social Selling';
      
      const cleanNumber = searchValue.replace(/[^0-9]/g, '');
      console.log(`[ContextLookup] Detectado como CONVERSA DIRETA - Buscando prospect com número: ${cleanNumber}`);
    }

    const response = {
      success: true,
      conversationId,
      isGroup,
      searchType,
      searchValue,
      targetLocation,
      contextData,
      message: contextData 
        ? `${searchType === 'projeto' ? 'Projeto' : 'Prospect'} encontrado com sucesso`
        : `Nenhum ${searchType} encontrado para este ${isGroup ? 'grupo' : 'contato'}`,
      debug: {
        spacesInDB: debugSpaces?.length || 0,
        listsInDB: debugLists?.length || 0,
        tasksInDB: debugTasks?.length || 0,
        sampleSpaces: debugSpaces?.map(s => s.name) || [],
        sampleLists: debugLists?.map(l => l.name) || []
      }
    };

    console.log(`[ContextLookup] Resposta final:`, response);
    
    return NextResponse.json(response);

  } catch (err: any) {
    console.error('Erro durante busca contextual:', err);
    return NextResponse.json({ 
      error: 'Erro ao processar busca contextual', 
      details: err.message 
    }, { status: 500 });
  }
}