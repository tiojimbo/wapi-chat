const express = require('express');
const router = express.Router();
const WhatsAppManager = require('../services/baileys/WhatsAppManager');
const logger = require('../utils/logger');
const SupabaseService = require('../services/supabase/SupabaseService');

// Rota para criar uma sessão e exibir o QR Code no terminal
router.post('/session', async (req, res) => {
  const { sessionId } = req.body;
  try {
    const result = await WhatsAppManager.createSession(sessionId || 'teste');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar nova sessão WhatsApp
router.post('/sessions', async (req, res) => {
  try {
    const { sessionId, name } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório' });
    }

    const existingSession = WhatsAppManager.getSession(sessionId);
    if (existingSession) {
      return res.status(409).json({ error: 'Sessão já existe' });
    }

    const result = await WhatsAppManager.createSession(sessionId, { name });
    res.json(result);
  } catch (error) {
    logger.error('Erro ao criar sessão:', error);
    res.status(500).json({ error: 'Erro ao criar sessão' });
  }
});

// Listar todas as sessões
router.get('/sessions', (req, res) => {
  try {
    const sessions = WhatsAppManager.getAllSessions();
    res.json({ sessions });
  } catch (error) {
    logger.error('Erro ao listar sessões:', error);
    res.status(500).json({ error: 'Erro ao listar sessões' });
  }
});

// Obter status de uma sessão específica
router.get('/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = WhatsAppManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    res.json({
      sessionId,
      state: session.state,
      lastSeen: session.lastSeen,
      qrCode: session.qrCode,
      phone: session.phone
    });
  } catch (error) {
    logger.error('Erro ao obter sessão:', error);
    res.status(500).json({ error: 'Erro ao obter sessão' });
  }
});

// Deletar sessão
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const deleted = await WhatsAppManager.deleteSession(sessionId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    res.json({ message: 'Sessão deletada com sucesso' });
  } catch (error) {
    logger.error('Erro ao deletar sessão:', error);
    res.status(500).json({ error: 'Erro ao deletar sessão' });
  }
});

// Enviar mensagem
router.post('/sessions/:sessionId/send', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { jid, message, conversationId, options } = req.body;

    logger.info(`[SEND] Tentativa de envio - SessionId: ${sessionId}, JID: ${jid}, ConversationId: ${conversationId}, Message: ${JSON.stringify(message)}`);

    if (!jid || !message || !conversationId) {
      return res.status(400).json({ error: 'jid, message e conversationId são obrigatórios' });
    }

    // Verificar se a sessão existe e está conectada
    const session = WhatsAppManager.getSession(sessionId);
    if (!session) {
      logger.error(`[SEND] Sessão ${sessionId} não encontrada`);
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    if (session.state !== 'connected') {
      logger.error(`[SEND] Sessão ${sessionId} não está conectada. Estado atual: ${session.state}`);
      return res.status(400).json({ error: `Sessão não está conectada. Estado: ${session.state}` });
    }

    // Converter mensagem de string para formato Baileys
    let messageObject;
    if (typeof message === 'string') {
      messageObject = { text: message };
    } else if (typeof message === 'object' && message !== null) {
      messageObject = message;
    } else {
      return res.status(400).json({ error: 'Formato de mensagem inválido' });
    }

    logger.info(`[SEND] Enviando mensagem formatada: ${JSON.stringify(messageObject)}`);
    const result = await WhatsAppManager.sendMessage(sessionId, jid, messageObject, options);
    logger.info(`[SEND] Mensagem enviada com sucesso: ${JSON.stringify(result)}`);
    
    // Salvar mensagem diretamente na conversa existente
    try {
      // Obter informações da sessão para o from_number
      const phone_jid = session.phone || '';
      const extractNumber = (jid) => (jid || '').split(':')[0].replace(/[^0-9]/g, '').slice(0, 20);
      const fromNumber = extractNumber(phone_jid);
      const toNumber = extractNumber(jid);
      
      // Mapear tipo de mensagem
      const typeMap = {
        text: 'text'
      };
      const messageType = messageObject.text ? 'text' : 'unknown';
      
      const messageData = {
        conversation_id: conversationId,
        wamid: result.key?.id || `manual-${Date.now()}`,
        type: messageType,
        from_number: fromNumber,
        to_number: toNumber,
        timestamp: new Date().toISOString(),
        text_body: messageObject.text || null,
        status: 'sent'
      };
      
      logger.info(`[SEND] Salvando mensagem na conversa ${conversationId}:`, JSON.stringify(messageData, null, 2));
      const saveResult = await SupabaseService.insertWhatsappMessage(messageData);
      
      if (saveResult.error) {
        logger.error(`[SEND] Erro ao salvar mensagem:`, saveResult.error);
      } else {
        logger.info(`[SEND] ✅ Mensagem salva com sucesso na conversa ${conversationId}, ID: ${saveResult.id}`);
        
        // Atualizar última mensagem da conversa
        await SupabaseService.getClient()
          .from('whatsapp_conversations')
          .update({
            last_message_preview: messageObject.text || '[mensagem]',
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', conversationId);
      }
    } catch (saveError) {
      logger.error(`[SEND] Erro ao salvar mensagem na conversa:`, saveError);
    }
    
    res.json({ success: true, result });
  } catch (error) {
    logger.error(`[SEND] Erro ao enviar mensagem para sessão ${req.params.sessionId}:`, error);
    res.status(500).json({ error: error.message || 'Erro ao enviar mensagem' });
  }
});

// Obter QR Code de uma sessão
router.get('/sessions/:sessionId/qr', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = WhatsAppManager.getSession(sessionId);
    logger.info(`[QR ENDPOINT] Sessão: ${sessionId}, state: ${session?.state}, qrCode: ${!!session?.qrCode}`);
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    if (session.state !== 'qr_ready' || !session.qrCode) {
      return res.status(400).json({ error: 'QR Code não disponível' });
    }

    res.json({ qrCode: session.qrCode });
  } catch (error) {
    logger.error('Erro ao obter QR Code:', error);
    res.status(500).json({ error: 'Erro ao obter QR Code' });
  }
});

// Reconectar sessão
router.post('/sessions/:sessionId/reconnect', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = WhatsAppManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    if (session.state === 'connected') {
      return res.status(400).json({ error: 'Sessão já está conectada' });
    }

    await WhatsAppManager.reconnectSession(sessionId);
    res.json({ message: 'Reconexão iniciada' });
  } catch (error) {
    logger.error('Erro ao reconectar sessão:', error);
    res.status(500).json({ error: 'Erro ao reconectar sessão' });
  }
});

// Sincronizar contatos do WhatsApp
router.post('/sessions/:sessionId/sync-contacts', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = WhatsAppManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    if (session.state !== 'connected') {
      return res.status(400).json({ error: 'Sessão não está conectada' });
    }

    logger.info(`[${sessionId}] Sincronização de contatos solicitada via API`);
    const result = await WhatsAppManager.syncContacts(sessionId);
    res.json(result);
  } catch (error) {
    logger.error('Erro ao sincronizar contatos:', error);
    res.status(500).json({ error: 'Erro ao sincronizar contatos' });
  }
});

// Listar conversas do usuário logado (com filtro de busca) + contatos sincronizados
router.get('/conversations', async (req, res) => {
  try {
    const { sessionId, q } = req.query;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório' });
    }
    
    // Obter número conectado (JID) da sessão
    const session = WhatsAppManager.getSession(sessionId);
    const phone_jid = session?.phone || null;
    
    // Se a sessão não estiver conectada, retornar lista vazia ao invés de erro
    if (!phone_jid) {
      logger.info(`[CONVERSATIONS] Sessão ${sessionId} não conectada ainda - retornando lista vazia`);
      return res.json({ 
        conversations: [], 
        message: 'Sessão não conectada - conecte via QR Code para ver contatos' 
      });
    }
    
    // Extrair apenas o número do telefone do JID (formato: 556198278919:70@s.whatsapp.net -> 556198278919)
    const phone_number = phone_jid.split(':')[0];
    
    // Buscar o UUID do número no Supabase
    let { data: phoneData, error: phoneError } = await SupabaseService.getClient()
      .from('whatsapp_phone_numbers')
      .select('id')
      .eq('phone_number_id', phone_number)
      .single();
    
    // Se o número não existe, criar um novo registro
    if (!phoneData || !phoneData.id) {
      const { data: newPhoneData, error: createError } = await SupabaseService.getClient()
        .from('whatsapp_phone_numbers')
        .insert({
          phone_number_id: phone_number,
          display_phone_number: phone_number,
          verified_name: 'WhatsApp Business'
        })
        .select('id')
        .single();
      
      if (createError || !newPhoneData) {
        logger.error('Erro ao criar número no banco:', createError);
        return res.status(500).json({ error: 'Erro ao criar número no banco' });
      }
      phoneData = newPhoneData;
    }
    const phone_number_id = phoneData.id;
    
    // 1. Buscar conversas existentes (com mensagens)
    let conversationsQuery = SupabaseService.getClient()
      .from('whatsapp_conversations')
      .select(`id, last_message_preview, last_message_at, unread_count, whatsapp_contacts:contact_id (id, profile_name, wa_id)`)
      .eq('phone_number_id', phone_number_id)
      .order('last_message_at', { ascending: false })
      .limit(50);
    
    if (q) {
      conversationsQuery = conversationsQuery.ilike('whatsapp_contacts.profile_name', `%${q}%`);
    }
    
    const { data: conversations, error: conversationsError } = await conversationsQuery;
    if (conversationsError) {
      logger.error('Erro ao buscar conversas:', conversationsError);
      return res.status(500).json({ error: 'Erro ao buscar conversas' });
    }
    
    // 2. Buscar todos os contatos sincronizados (sem conversa ainda)
    let contactsQuery = SupabaseService.getClient()
      .from('whatsapp_contacts')
      .select('id, profile_name, wa_id')
      .not('profile_name', 'is', null)
      .order('profile_name', { ascending: true })
      .limit(100);
    
    if (q) {
      contactsQuery = contactsQuery.ilike('profile_name', `%${q}%`);
    }
    
    const { data: allContacts, error: contactsError } = await contactsQuery;
    if (contactsError) {
      logger.error('Erro ao buscar contatos:', contactsError);
    }
    
    // 3. Mesclar resultados - evitar duplicatas
    const existingContactIds = new Set(conversations?.map(conv => conv.whatsapp_contacts?.id) || []);
    const contactsWithoutConversations = (allContacts || [])
      .filter(contact => !existingContactIds.has(contact.id))
      .map(contact => ({
        id: `contact_${contact.id}`, // ID único para contatos sem conversa
        last_message_preview: 'Iniciar conversa',
        last_message_at: null,
        unread_count: 0,
        whatsapp_contacts: {
          id: contact.id,
          profile_name: contact.profile_name,
          wa_id: contact.wa_id
        },
        is_contact_only: true // Flag para identificar que é só um contato
      }));
    
    // 4. Combinar conversas existentes + contatos sincronizados
    const allResults = [
      ...(conversations || []),
      ...contactsWithoutConversations
    ];
    
    // 5. Ordenar: conversas com mensagens primeiro, depois contatos alfabeticamente
    allResults.sort((a, b) => {
      // Conversas com mensagens sempre primeiro
      if (a.last_message_at && !b.last_message_at) return -1;
      if (!a.last_message_at && b.last_message_at) return 1;
      
      // Se ambos têm mensagens, ordenar por data
      if (a.last_message_at && b.last_message_at) {
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      }
      
      // Se ambos são só contatos, ordenar alfabeticamente
      const nameA = a.whatsapp_contacts?.profile_name || a.whatsapp_contacts?.wa_id || '';
      const nameB = b.whatsapp_contacts?.profile_name || b.whatsapp_contacts?.wa_id || '';
      return nameA.localeCompare(nameB);
    });
    
    logger.info(`[CONVERSATIONS] Retornando ${conversations?.length || 0} conversas + ${contactsWithoutConversations.length} contatos = ${allResults.length} total`);
    
    res.json({ conversations: allResults });
  } catch (error) {
    logger.error('Erro ao listar conversas:', error);
    res.status(500).json({ error: 'Erro ao listar conversas' });
  }
});

// Criar/obter conversa para um contato específico
router.post('/conversations/get-or-create', async (req, res) => {
  try {
    const { sessionId, contactId } = req.body;
    
    if (!sessionId || !contactId) {
      return res.status(400).json({ error: 'sessionId e contactId são obrigatórios' });
    }
    
    // Obter número conectado (JID) da sessão
    const session = WhatsAppManager.getSession(sessionId);
    const phone_jid = session?.phone || null;
    if (!phone_jid) {
      return res.status(400).json({ error: 'Sessão não conectada' });
    }
    
    // Extrair apenas o número do telefone do JID
    const phone_number = phone_jid.split(':')[0];
    
    // Buscar o UUID do número no Supabase
    let { data: phoneData } = await SupabaseService.getClient()
      .from('whatsapp_phone_numbers')
      .select('id')
      .eq('phone_number_id', phone_number)
      .single();
    
    if (!phoneData || !phoneData.id) {
      return res.status(400).json({ error: 'Número do telefone não encontrado' });
    }
    
    const phone_number_id = phoneData.id;
    
    // Verificar se já existe uma conversa para este contato
    let { data: existingConversation } = await SupabaseService.getClient()
      .from('whatsapp_conversations')
      .select(`id, last_message_preview, last_message_at, unread_count, whatsapp_contacts:contact_id (id, profile_name, wa_id)`)
      .eq('phone_number_id', phone_number_id)
      .eq('contact_id', contactId)
      .single();
    
    if (existingConversation) {
      logger.info(`[GET_OR_CREATE] Conversa existente encontrada: ${existingConversation.id}`);
      return res.json({ conversation: existingConversation });
    }
    
    // Se não existe, criar uma nova conversa
    const { data: newConversation, error: createError } = await SupabaseService.getClient()
      .from('whatsapp_conversations')
      .insert({
        phone_number_id: phone_number_id,
        contact_id: contactId,
        last_message_preview: 'Conversa iniciada',
        last_message_at: new Date().toISOString(),
        unread_count: 0
      })
      .select(`id, last_message_preview, last_message_at, unread_count, whatsapp_contacts:contact_id (id, profile_name, wa_id)`)
      .single();
    
    if (createError) {
      logger.error('Erro ao criar nova conversa:', createError);
      return res.status(500).json({ error: 'Erro ao criar conversa' });
    }
    
    logger.info(`[GET_OR_CREATE] Nova conversa criada: ${newConversation.id}`);
    res.json({ conversation: newConversation });
    
  } catch (error) {
    logger.error('Erro ao obter/criar conversa:', error);
    res.status(500).json({ error: 'Erro ao obter/criar conversa' });
  }
});

// Buscar histórico de mensagens de uma conversa
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit } = req.query;
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId é obrigatório' });
    }
    const { messages, error } = await SupabaseService.getMessagesByConversation(conversationId, limit ? parseInt(limit) : 50);
    if (error) {
      return res.status(500).json({ error });
    }
    res.json({ messages });
  } catch (error) {
    logger.error('Erro ao buscar histórico de mensagens:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico de mensagens' });
  }
});

// Obter detalhes de uma conversa específica
router.get('/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId é obrigatório' });
    }

    // Buscar conversa com contato no Supabase
    const { data, error } = await SupabaseService.getClient()
      .from('whatsapp_conversations')
      .select(`
        id,
        conversation_id,
        phone_number_id,
        status,
        last_message_at,
        last_message_preview,
        unread_count,
        whatsapp_contacts:contact_id (
          id,
          wa_id,
          profile_name,
          formatted_name
        )
      `)
      .eq('id', conversationId)
      .single();

    if (error) {
      logger.error('Erro ao buscar conversa:', error);
      return res.status(500).json({ error: 'Erro ao buscar conversa' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    res.json({ conversation: data });
  } catch (error) {
    logger.error('Erro ao obter conversa:', error);
    res.status(500).json({ error: 'Erro ao obter conversa' });
  }
});

module.exports = router; 