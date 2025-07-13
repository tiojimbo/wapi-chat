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
      qrCode: session.qrCode
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
    const { jid, message, options } = req.body;

    if (!jid || !message) {
      return res.status(400).json({ error: 'jid e message são obrigatórios' });
    }

    const result = await WhatsAppManager.sendMessage(sessionId, jid, message, options);
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
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

// Listar conversas do usuário logado (com filtro de busca)
router.get('/conversations', async (req, res) => {
  try {
    const { sessionId, q } = req.query;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório' });
    }
    // Obter número conectado (JID) da sessão
    const session = WhatsAppManager.getSession(sessionId);
    const phone_jid = session?.phone || null;
    if (!phone_jid) {
      return res.status(400).json({ error: 'Sessão não conectada' });
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
    // Buscar conversas no Supabase
    let query = SupabaseService.getClient()
      .from('whatsapp_conversations')
      .select(`id, last_message_preview, last_message_at, unread_count, whatsapp_contacts:contact_id (profile_name, wa_id)`)
      .eq('phone_number_id', phone_number_id)
      .order('last_message_at', { ascending: false })
      .limit(50);
    if (q) {
      query = query.ilike('whatsapp_contacts.profile_name', `%${q}%`);
    }
    const { data, error } = await query;
    if (error) {
      logger.error('Erro ao buscar conversas:', error);
      return res.status(500).json({ error: 'Erro ao buscar conversas' });
    }
    res.json({ conversations: data });
  } catch (error) {
    logger.error('Erro ao listar conversas:', error);
    res.status(500).json({ error: 'Erro ao listar conversas' });
  }
});

module.exports = router; 