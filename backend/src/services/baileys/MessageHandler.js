const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const SupabaseService = require('../../services/supabase/SupabaseService');
const cache = require('../../utils/cache');

/**
 * Normaliza o wa_id removendo sufixos do WhatsApp
 * @param {string} wa_id - ID bruto do WhatsApp
 * @returns {string} ID normalizado sem sufixos
 */
function normalizeWaId(wa_id) {
  if (!wa_id) return '';
  return wa_id.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

/**
 * Função centralizada para encontrar ou criar uma conversa
 * Garante que uma conversa sempre seja identificada pela mesma combinação
 * independente da direção da mensagem
 * @param {string} phone_number_id - ID do número da sessão
 * @param {string} contact_id - ID do contato
 * @param {string} last_message_preview - Preview da última mensagem
 * @param {string} last_message_at - Timestamp da última mensagem
 * @returns {Promise<string|null>} ID da conversa ou null se erro
 */
async function findOrCreateConversation(phone_number_id, contact_id, last_message_preview, last_message_at) {
  try {
    // Primeiro, buscar uma conversa existente
    const { data: existingConv, error: findError } = await SupabaseService.getClient()
      .from('whatsapp_conversations')
      .select('id')
      .eq('phone_number_id', phone_number_id)
      .eq('contact_id', contact_id)
      .single();

    if (existingConv && !findError) {
      // Atualizar conversa existente
      await SupabaseService.getClient()
        .from('whatsapp_conversations')
        .update({
          last_message_preview,
          last_message_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingConv.id);
      
      logger.info(`Conversa existente atualizada: ${phone_number_id} <-> ${contact_id}`);
      return existingConv.id;
    }

    // Se não existe, criar nova conversa
    const { data: newConv, error: createError } = await SupabaseService.getClient()
      .from('whatsapp_conversations')
      .insert({
        phone_number_id,
        contact_id,
        last_message_preview,
        last_message_at,
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (createError) {
      logger.error('Erro ao criar nova conversa:', createError);
      return null;
    }

    logger.info(`Nova conversa criada: ${phone_number_id} <-> ${contact_id}`);
    return newConv?.id || null;

  } catch (error) {
    logger.error('Erro na função findOrCreateConversation:', error);
    return null;
  }
}

  // SOLUÇÃO TEMPORÁRIA - Gerar URL local para mídia
  function generateTempMediaUrl(sessionId, filename) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    return `${baseUrl}/api/media/${sessionId}/${filename}`;
  }
  

/**
 * Handler universal para mensagens recebidas do Baileys
 * @param {object} msg - Mensagem recebida
 * @param {string} sessionId - ID da sessão
 */
async function handleIncomingMessage(msg, sessionId) {
  if (!msg || !msg.message) {
    logger.warn(`[${sessionId}] Mensagem vazia ou sem payload.`);
    return;
  }

  // Identificação básica do tipo de mensagem
  const types = Object.keys(msg.message);
  const mainType = types[0];

  // Upsert de contato no Supabase (com cache)
  const wa_id_raw = msg.key.participant || msg.key.remoteJid;
  const wa_id = normalizeWaId(wa_id_raw);
  let profile_name = msg.pushName || null;
  
  // Log detalhado para debug do pushName e outras informações de contato
  logger.info(`[${sessionId}] [INCOMING] Informações de contato detectadas:`, {
    wa_id: wa_id,
    pushName: msg.pushName,
    verifiedBizName: msg.verifiedBizName,
    participant: msg.key?.participant,
    remoteJid: msg.key?.remoteJid,
    fromMe: msg.key?.fromMe
  });
  
  if (profile_name) {
    logger.info(`[${sessionId}] [INCOMING] ✅ pushName capturado: "${profile_name}" para contato: ${wa_id}`);
  } else {
    logger.warn(`[${sessionId}] [INCOMING] ⚠️  Nenhum pushName para contato: ${wa_id} - tentando outras fontes`);
    
    // Tentar extrair nome de outras fontes da mensagem
    if (msg.verifiedBizName) {
      profile_name = msg.verifiedBizName;
      logger.info(`[${sessionId}] [INCOMING] ✅ Nome comercial verificado encontrado: ${profile_name}`);
    }
  }
  let contactId = null;
  const contactCacheKey = `contact:${wa_id}@s.whatsapp.net`;
  if (cache.has(contactCacheKey)) {
    const cachedContactId = cache.get(contactCacheKey);
    
    // Verificar se o contato do cache ainda existe no banco
    try {
      const { data: existingContact, error: contactError } = await SupabaseService.getClient()
        .from('whatsapp_contacts')
        .select('id, profile_name')
        .eq('id', cachedContactId)
        .single();
      
      if (existingContact && !contactError) {
        contactId = cachedContactId;
        logger.info(`[${sessionId}] Contato validado do cache: ${wa_id}`);
        
        // Se temos nome na mensagem, verificar se precisa atualizar contato existente
        if (profile_name && !existingContact.profile_name) {
          try {
            await SupabaseService.upsertWhatsappContact(wa_id, profile_name);
            logger.info(`[${sessionId}] Contato atualizado com nome: ${wa_id} -> ${profile_name}`);
          } catch (updateErr) {
            logger.debug(`[${sessionId}] Não foi possível atualizar contato: ${updateErr.message}`);
          }
        }
      } else {
        // Contato do cache não existe mais no banco, limpar cache e fazer upsert
        logger.warn(`[${sessionId}] Contato do cache não existe mais no banco: ${cachedContactId}, fazendo upsert`);
        cache.delete(contactCacheKey);
        
        const { id, error } = await SupabaseService.upsertWhatsappContact(wa_id, profile_name);
        if (id) {
          logger.info(`[${sessionId}] Contato re-criado: ${wa_id}${profile_name ? ` com nome: ${profile_name}` : ''}`);
          contactId = id;
          cache.set(contactCacheKey, id);
        } else {
          logger.error(`[${sessionId}] Erro ao re-criar contato: ${error}`);
        }
      }
    } catch (validationErr) {
      logger.error(`[${sessionId}] Erro ao validar contato do cache: ${validationErr.message}`);
      // Em caso de erro, limpar cache e fazer upsert
      cache.delete(contactCacheKey);
      
      const { id, error } = await SupabaseService.upsertWhatsappContact(wa_id, profile_name);
      if (id) {
        logger.info(`[${sessionId}] Contato registrado após erro de validação: ${wa_id}${profile_name ? ` com nome: ${profile_name}` : ''}`);
        contactId = id;
        cache.set(contactCacheKey, id);
      } else {
        logger.error(`[${sessionId}] Erro ao registrar contato após erro de validação: ${error}`);
      }
    }
  } else {
    try {
      const { id, error } = await SupabaseService.upsertWhatsappContact(wa_id, profile_name);
      if (id) {
        logger.info(`[${sessionId}] Contato registrado/atualizado: ${wa_id}${profile_name ? ` com nome: ${profile_name}` : ''}`);
        contactId = id;
        cache.set(contactCacheKey, id);
      } else {
        logger.error(`[${sessionId}] Erro ao registrar contato: ${error}`);
      }
    } catch (err) {
      logger.error(`[${sessionId}] Erro inesperado ao registrar contato:`, err);
    }
  }

  // Primeiro, extrair o tipo de mensagem e resumo
  let resumo = '';
  let isMedia = false;
  let filePath = null;
  let publicUrl = null; // Corrigir escopo: declarar antes do bloco de mídia
  switch (mainType) {
    case 'conversation':
    case 'extendedTextMessage':
      resumo = msg.message.conversation || msg.message.extendedTextMessage?.text || '[texto]';
      break;
    case 'imageMessage':
      resumo = '[imagem]';
      isMedia = true;
      break;
    case 'videoMessage':
      resumo = '[vídeo]';
      isMedia = true;
      break;
    case 'audioMessage':
      resumo = '[áudio]';
      isMedia = true;
      break;
    case 'documentMessage':
      resumo = '[documento]';
      isMedia = true;
      break;
    case 'stickerMessage':
      resumo = '[sticker]';
      isMedia = true;
      break;
    default:
      resumo = `[tipo: ${mainType}]`;
  }

  logger.info(`[${sessionId}] Mensagem recebida (${mainType}): ${resumo}`);

  // Download automático de mídia
  if (isMedia) {
    try {
      const mediaBuffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        {
          logger,
          reuploadRequest: null // Para casos de mídia expirada, pode ser ajustado depois
        }
      );
      // Pasta de destino: ./sessions/<sessionId>/media
      const mediaDir = path.join(__dirname, '../../../sessions', sessionId, 'media');
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }
      // Nome do arquivo: timestamp_tipo.ext
      const timestamp = Date.now();
      let ext = '.bin';
      if (mainType === 'imageMessage') ext = '.jpg';
      if (mainType === 'videoMessage') ext = '.mp4';
      if (mainType === 'audioMessage') ext = '.ogg';
      if (mainType === 'documentMessage') ext = '.pdf';
      if (mainType === 'stickerMessage') ext = '.webp';
      const filename = `${timestamp}_${mainType}${ext}`;
      filePath = path.join(mediaDir, filename);
      fs.writeFileSync(filePath, mediaBuffer);
      logger.info(`[${sessionId}] Mídia salva em: ${filePath}`);

      // Compressão automática de imagens
      if (mainType === 'imageMessage') {
        const compressedPath = path.join(mediaDir, `${timestamp}_${mainType}_compressed.jpg`);
        await sharp(mediaBuffer)
          .jpeg({ quality: 70 })
          .toFile(compressedPath);
        logger.info(`[${sessionId}] Imagem comprimida salva em: ${compressedPath}`);
      }

      // Backup automático no Supabase Storage
      const bucket = 'whatsapp-media';
      const storagePath = `${sessionId}/${mainType}/${filename}`;
      const contentTypeMap = {
        imageMessage: 'image/jpeg',
        videoMessage: 'video/mp4',
        audioMessage: 'audio/ogg',
        documentMessage: 'application/pdf',
        stickerMessage: 'image/webp',
      };
      const contentType = contentTypeMap[mainType] || 'application/octet-stream';
      const uploadResult = await SupabaseService.uploadFileToStorage(bucket, storagePath, mediaBuffer, contentType);
      publicUrl = uploadResult.publicUrl; // Corrigir escopo: atribuir aqui
      if (publicUrl) {
        logger.info(`[${sessionId}] Backup no Supabase Storage: ${publicUrl}`);
      } else {
        logger.error(`[${sessionId}] Falha no backup Supabase Storage: ${uploadResult.error}`);
      }
    } catch (err) {
      logger.error(`[${sessionId}] Erro ao baixar/comprimir mídia:`, err);
    }
  }

  // Aqui, futuramente: salvar no banco, compressão, etc.

  // --- NOVO: Upsert de conversa no Supabase ---
  if (contactId) {
    try {
      const WhatsAppManager = require('./WhatsAppManager');
      const session = WhatsAppManager.getSession(sessionId);
      const phone_jid = session?.phone || null;
      logger.info(`[${sessionId}] JID da sessão: ${phone_jid}`);
      if (phone_jid) {
        const phone_number = phone_jid.split(':')[0];
        logger.info(`[${sessionId}] Buscando UUID do número para phone_number: ${phone_number}`);
        let { data: phoneData, error: phoneError } = await SupabaseService.getClient()
          .from('whatsapp_phone_numbers')
          .select('id')
          .eq('phone_number_id', phone_number)
          .single();
        if (phoneError) {
          logger.error(`[${sessionId}] Erro ao buscar UUID do número: ${JSON.stringify(phoneError)}`);
        }
        if (phoneData && phoneData.id) {
          logger.info(`[${sessionId}] UUID do número encontrado: ${phoneData.id}`);
          
          // Buscar conversa existente usando a função centralizada
          let conversationId = await findOrCreateConversation(phoneData.id, contactId, resumo, new Date(Number(msg.messageTimestamp) * 1000).toISOString());
          
          if (!conversationId) {
            logger.error(`[${sessionId}] Não foi possível encontrar ou criar conversa`);
            return;
          }
          
          // Salvar mensagem individual
          // Verificar se já existe mensagem com o mesmo wamid
          const existing = await SupabaseService.getClient()
            .from('whatsapp_messages')
            .select('id')
            .eq('wamid', msg.key.id)
            .single();
          if (existing.data && existing.data.id) {
            logger.warn(`[${sessionId}] Mensagem com wamid já existe, ignorando inserção: ${msg.key.id}`);
            return;
          }
          
          // Mapear mainType para tipo curto aceito pelo banco
          const typeMap = {
            conversation: 'text',
            extendedTextMessage: 'text',
            imageMessage: 'image',
            videoMessage: 'video',
            audioMessage: 'audio',
            documentMessage: 'document',
            stickerMessage: 'sticker'
          };
          
          // Se não estiver no typeMap, salva como 'unknown' para evitar erro de ENUM
          const typeShort = typeMap[mainType] || 'unknown';
          
          // Extrair apenas o número puro (sem JID, sufixos ou domínio)
          const extractNumber = (jid) => (jid || '').split(':')[0].replace(/[^0-9]/g, '').slice(0, 20);
          const fromNumber = extractNumber(msg.key.participant || msg.key.remoteJid);
          const toNumber = extractNumber(msg.key.remoteJid);
          
          const messageData = {
            conversation_id: conversationId,
            wamid: msg.key.id,
            type: typeShort,
            from_number: fromNumber,
            to_number: toNumber,
            timestamp: new Date(Number(msg.messageTimestamp) * 1000).toISOString(),
            text_body: (mainType === 'conversation' || mainType === 'extendedTextMessage') ? (msg.message.conversation || msg.message.extendedTextMessage?.text || null) : null,
            media_url: (isMedia && typeof publicUrl === 'string') ? publicUrl : null,
            status: null // Pode ser ajustado depois
          };
          
          logger.info(`[${sessionId}] [DEBUG] Salvando mensagem no banco:`, messageData);
          const result = await SupabaseService.insertWhatsappMessage(messageData);
          logger.info(`[${sessionId}] [DEBUG] Resultado do insertWhatsappMessage:`, result);
        } else {
          logger.error(`[${sessionId}] Não foi possível encontrar UUID do número para JID: ${phone_jid} - erro: ${JSON.stringify(phoneError)}`);
        }
      } else {
        logger.error(`[${sessionId}] Sessão não possui phone_jid válido!`);
      }
    } catch (err) {
      logger.error(`[${sessionId}] Erro inesperado ao registrar conversa: ${err}`);
    }
  }
}

/**
 * Handler para mensagens enviadas (outgoing)
 * @param {object} msg - Mensagem enviada
 * @param {string} sessionId - ID da sessão
 */
async function handleOutgoingMessage(msg, sessionId) {
  if (!msg || !msg.message) {
    logger.warn(`[${sessionId}] Mensagem enviada vazia ou sem payload.`);
    return;
  }

  // Debug completo da mensagem para entender a estrutura
  logger.info(`[${sessionId}] [OUTGOING_DEBUG] Estrutura completa da mensagem:`, JSON.stringify({
    key: msg.key,
    messageTimestamp: msg.messageTimestamp,
    pushName: msg.pushName,
    verifiedBizName: msg.verifiedBizName,
    message: Object.keys(msg.message),
    participant: msg.key?.participant,
    remoteJid: msg.key?.remoteJid
  }, null, 2));

  // Identificação básica do tipo de mensagem
  const types = Object.keys(msg.message);
  const mainType = types[0];

  // Primeiro, extrair o tipo de mensagem e resumo
  let resumo = '';
  switch (mainType) {
    case 'conversation':
    case 'extendedTextMessage':
      resumo = msg.message.conversation || msg.message.extendedTextMessage?.text || '[texto]';
      break;
    case 'imageMessage':
      resumo = '[imagem]';
      break;
    case 'videoMessage':
      resumo = '[vídeo]';
      break;
    case 'audioMessage':
      resumo = '[áudio]';
      break;
    case 'documentMessage':
      resumo = '[documento]';
      break;
    case 'stickerMessage':
      resumo = '[sticker]';
      break;
    default:
      resumo = `[tipo: ${mainType}]`;
  }

  // Identificar se mensagem vem do dispositivo móvel (sincronizada) ou da API web
  const isFromMobile = !msg.key.id?.startsWith('manual-');
  const source = isFromMobile ? 'DISPOSITIVO_MÓVEL' : 'API_WEB';
  
  logger.info(`[${sessionId}] [OUTGOING] [${source}] Processando mensagem enviada (${mainType}): ${resumo}`);

  try {
    // Obter contato da mensagem (destinatário)
    const wa_id_raw = msg.key.remoteJid;
    const wa_id = normalizeWaId(wa_id_raw);
    let contactId = null;
    const contactCacheKey = `contact:${wa_id}@s.whatsapp.net`;
    
    if (cache.has(contactCacheKey)) {
      contactId = cache.get(contactCacheKey);
      logger.info(`[${sessionId}] Contato destinatário obtido do cache: ${wa_id}`);
    } else {
      // Buscar contato existente no banco
      const { data: existingContact } = await SupabaseService.getClient()
        .from('whatsapp_contacts')
        .select('id')
        .eq('wa_id', wa_id)
        .single();
      
      if (existingContact) {
        contactId = existingContact.id;
        cache.set(contactCacheKey, contactId);
        logger.info(`[${sessionId}] Contato destinatário encontrado no banco: ${wa_id}`);
      } else {
        // Tentar buscar informações do contato usando estratégias aprimoradas
        let profile_name = null;
        try {
          const WhatsAppManager = require('./WhatsAppManager');
          const session = WhatsAppManager.getSession(sessionId);
          if (session && session.sock) {
            logger.info(`[${sessionId}] [${source}] Buscando informações do contato: ${wa_id}`);
            
            // Estratégia 1: Verificar se o contato já existe no banco com nome
            try {
              const { data: existingContactWithName } = await SupabaseService.getClient()
                .from('whatsapp_contacts')
                .select('profile_name')
                .eq('wa_id', wa_id)
                .not('profile_name', 'is', null)
                .single();
              
              if (existingContactWithName && existingContactWithName.profile_name) {
                profile_name = existingContactWithName.profile_name;
                logger.info(`[${sessionId}] [${source}] Nome obtido do banco: ${profile_name}`);
              }
            } catch (dbErr) {
              logger.debug(`[${sessionId}] [${source}] Contato não encontrado no banco com nome`);
            }
            
            // Estratégia 2: Tentar perfil comercial
            if (!profile_name) {
              try {
                const businessProfile = await session.sock.getBusinessProfile(wa_id);
                if (businessProfile && businessProfile.description) {
                  profile_name = businessProfile.description;
                  logger.info(`[${sessionId}] [${source}] Nome do perfil comercial obtido: ${profile_name}`);
                }
              } catch (businessErr) {
                logger.debug(`[${sessionId}] Perfil comercial não disponível para ${wa_id}`);
              }
            }
            
            // Estratégia 3: Para dispositivo móvel, implementar busca diferida mais agressiva
            if (!profile_name && isFromMobile) {
              logger.info(`[${sessionId}] [DISPOSITIVO_MÓVEL] Implementando busca diferida para: ${wa_id}`);
              
              // Tentar onWhatsApp para confirmar existência
              try {
                const [result] = await session.sock.onWhatsApp(wa_id);
                if (result && result.exists) {
                  logger.debug(`[${sessionId}] [DISPOSITIVO_MÓVEL] Número confirmado no WhatsApp: ${wa_id}`);
                }
              } catch (whatsappErr) {
                logger.debug(`[${sessionId}] onWhatsApp failed para ${wa_id}: ${whatsappErr.message}`);
              }
            }
          }
        } catch (fetchErr) {
          logger.debug(`[${sessionId}] Não foi possível buscar informações do contato ${wa_id}: ${fetchErr.message}`);
        }
        
        // Criar contato (com nome se conseguiu obter, senão null)
        const { id, error } = await SupabaseService.upsertWhatsappContact(wa_id, profile_name);
        if (id) {
          contactId = id;
          cache.set(contactCacheKey, id);
          logger.info(`[${sessionId}] [${source}] Contato destinatário criado: ${wa_id}${profile_name ? ` com nome: ${profile_name}` : ' (apenas número)'}`);
          
          // Se é do dispositivo móvel e não conseguimos o nome, usar listener temporário
          // (os contatos já devem ter sido sincronizados na conexão)
          if (isFromMobile && !profile_name) {
            logger.info(`[${sessionId}] [DISPOSITIVO_MÓVEL] Configurando listener para capturar nome: ${wa_id}`);
            
            // Verificar se a sincronização automática já foi feita
            const cache = require('../../utils/cache');
            const lastSync = cache.get(`last_sync_${sessionId}`);
            
            if (!lastSync) {
              logger.warn(`[${sessionId}] [DISPOSITIVO_MÓVEL] Sincronização automática ainda não foi executada`);
              // Tentar buscar no banco se o contato já foi sincronizado
              setTimeout(async () => {
                await updateContactFromSync(sessionId, wa_id, id);
              }, 1000);
            }
            
            // Configurar listener para mensagens futuras
            setupTemporaryContactListener(sessionId, wa_id, id);
          }
        } else {
          logger.error(`[${sessionId}] Erro ao criar contato destinatário: ${error}`);
        }
      }
    }

    if (contactId) {
      const WhatsAppManager = require('./WhatsAppManager');
      const session = WhatsAppManager.getSession(sessionId);
      const phone_jid = session?.phone || null;
      
      if (phone_jid) {
        const phone_number = phone_jid.split(':')[0];
        
        let { data: phoneData, error: phoneError } = await SupabaseService.getClient()
          .from('whatsapp_phone_numbers')
          .select('id')
          .eq('phone_number_id', phone_number)
          .single();
          
        if (phoneData && phoneData.id) {
          // Buscar conversa existente usando a função centralizada
          let conversationId = await findOrCreateConversation(phoneData.id, contactId, resumo, new Date(Number(msg.messageTimestamp) * 1000).toISOString());
          
          if (!conversationId) {
            logger.error(`[${sessionId}] Não foi possível encontrar ou criar conversa`);
            return;
          }
          
          // Salvar mensagem individual
          if (conversationId) {
            // Verificar se já existe mensagem com o mesmo wamid
            const existing = await SupabaseService.getClient()
              .from('whatsapp_messages')
              .select('id')
              .eq('wamid', msg.key.id)
              .single();
              
            if (existing.data && existing.data.id) {
              logger.warn(`[${sessionId}] Mensagem enviada com wamid já existe, ignorando inserção: ${msg.key.id}`);
              return;
            }
            
            // Mapear mainType para tipo curto aceito pelo banco
            const typeMap = {
              conversation: 'text',
              extendedTextMessage: 'text',
              imageMessage: 'image',
              videoMessage: 'video',
              audioMessage: 'audio',
              documentMessage: 'document',
              stickerMessage: 'sticker'
            };
            
            const typeShort = typeMap[mainType] || 'unknown';
            
            // Extrair apenas o número puro
            const extractNumber = (jid) => (jid || '').split(':')[0].replace(/[^0-9]/g, '').slice(0, 20);
            const fromNumber = extractNumber(phone_jid); // Nossa sessão é quem enviou
            const toNumber = extractNumber(wa_id); // Destinatário
            
            logger.info(`[${sessionId}] [OUTGOING] Debug info: phone_jid=${phone_jid}, wa_id=${wa_id}, fromNumber=${fromNumber}, toNumber=${toNumber}`);
            
            const messageData = {
              conversation_id: conversationId,
              wamid: msg.key.id,
              type: typeShort,
              from_number: fromNumber,
              to_number: toNumber,
              timestamp: new Date(Number(msg.messageTimestamp) * 1000).toISOString(),
              text_body: (mainType === 'conversation' || mainType === 'extendedTextMessage') ? (msg.message.conversation || msg.message.extendedTextMessage?.text || null) : null,
              status: 'sent' // Mensagens enviadas por nós começam como 'sent'
            };
            
            logger.info(`[${sessionId}] [OUTGOING] Salvando mensagem enviada no banco:`, JSON.stringify(messageData, null, 2));
            const result = await SupabaseService.insertWhatsappMessage(messageData);
            logger.info(`[${sessionId}] [OUTGOING] Resultado do insertWhatsappMessage (enviada):`, result);
            
            if (result.error) {
              logger.error(`[${sessionId}] [OUTGOING] FALHA ao salvar mensagem:`, result.error);
            } else {
              logger.info(`[${sessionId}] [OUTGOING] ✅ Mensagem salva com sucesso, ID: ${result.id}`);
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error(`[${sessionId}] Erro ao processar mensagem enviada:`, err);
  }
}

/**
 * Tenta buscar o nome de um contato após um delay, específico para mensagens do dispositivo móvel
 * @param {string} sessionId - ID da sessão
 * @param {string} wa_id - WhatsApp ID do contato
 * @param {string} contactId - ID do contato no banco
 */
async function attemptDeferredContactNameFetch(sessionId, wa_id, contactId) {
  try {
    logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Tentando buscar nome para: ${wa_id}`);
    
    // Verificar se o contato já foi atualizado com nome
    const { data: currentContact, error: contactError } = await SupabaseService.getClient()
      .from('whatsapp_contacts')
      .select('profile_name')
      .eq('id', contactId)
      .single();
    
    if (contactError) {
      logger.error(`[${sessionId}] [BUSCA_DIFERIDA] Erro ao verificar contato atual: ${JSON.stringify(contactError)}`);
      return;
    }
    
    if (currentContact && currentContact.profile_name) {
      logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Contato já possui nome: ${currentContact.profile_name}`);
      return;
    }
    
    logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Contato atual sem nome, continuando busca...`);
    
    const WhatsAppManager = require('./WhatsAppManager');
    const session = WhatsAppManager.getSession(sessionId);
    
    if (!session || !session.sock) {
      logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Sessão não disponível`);
      return;
    }

    let profile_name = null;

    // Estratégias aprimoradas de busca
    const strategies = [
      // 1. Tentar buscar via query direta de contatos do WhatsApp
      async () => {
        try {
          const phoneNumber = wa_id;
          logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Estratégia 1: Buscando informações para número: ${phoneNumber}`);
          
          // Tentar múltiplas abordagens de busca
          const approaches = [
            // Abordagem 1: onWhatsApp com informações extras
            async () => {
              const result = await session.sock.onWhatsApp(phoneNumber);
              logger.info(`[${sessionId}] [BUSCA_DIFERIDA] onWhatsApp result:`, JSON.stringify(result));
              return null; // onWhatsApp não retorna nome
            },
            
            // Abordagem 2: Tentar fetchStatus que pode ter informações de perfil
            async () => {
              try {
                const status = await session.sock.fetchStatus(wa_id);
                logger.info(`[${sessionId}] [BUSCA_DIFERIDA] fetchStatus result:`, JSON.stringify(status));
                return status?.status || null;
              } catch (err) {
                logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] fetchStatus falhou: ${err.message}`);
                return null;
              }
            }
          ];
          
          for (const approach of approaches) {
            const result = await approach();
            if (result) return result;
          }
          
          return null;
        } catch (err) {
          logger.error(`[${sessionId}] [BUSCA_DIFERIDA] Estratégia 1 erro geral: ${err.message}`);
          return null;
        }
      },
      
      // 2. Buscar perfil comercial
      async () => {
        try {
          logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Estratégia 2: Buscando perfil comercial...`);
          const businessProfile = await session.sock.getBusinessProfile(wa_id);
          logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Business profile result:`, JSON.stringify(businessProfile));
          return businessProfile?.description || null;
        } catch (err) {
          logger.error(`[${sessionId}] [BUSCA_DIFERIDA] Perfil comercial erro: ${err.message}`);
          return null;
        }
      },
      
      // 2. Verificar mensagens recentes do contato no banco para capturar pushName
      async () => {
        try {
          const { data: recentMessages } = await SupabaseService.getClient()
            .from('whatsapp_messages')
            .select('text_body')
            .eq('from_number', wa_id)
            .order('timestamp', { ascending: false })
            .limit(5);
          
          // Esta estratégia não funciona diretamente, mas pode ajudar em logs
          if (recentMessages && recentMessages.length > 0) {
            logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Encontradas ${recentMessages.length} mensagens recentes do contato`);
          }
          return null;
        } catch (err) {
          return null;
        }
      },
      
      // 3. Tentar uma abordagem alternativa - verificar se conseguimos acessar dados do contato
      async () => {
        try {
          // Tentar acessar a foto do perfil (indica que o contato existe e é acessível)
          await session.sock.profilePictureUrl(wa_id);
          logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Contato acessível via profilePictureUrl`);
          
          // Para contatos móveis, tentar uma estratégia de "indução"
          // Simular que estamos digitando para o contato (isso pode disparar sincronização)
          try {
            await session.sock.sendPresenceUpdate('composing', wa_id);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await session.sock.sendPresenceUpdate('paused', wa_id);
            logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Presença enviada para induzir sincronização`);
          } catch (presenceErr) {
            logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Falha ao enviar presença: ${presenceErr.message}`);
          }
          
          return null; // Estas estratégias não retornam nome diretamente
        } catch (err) {
          return null;
        }
      },
      
      // 4. Estratégia mais agressiva - tentar solicitar atualizações de contato
      async () => {
        try {
          logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Estratégia 4: Tentativa agressiva de sincronização...`);
          const phoneNumber = wa_id;
          
          // Tentar forçar uma sincronização enviando uma presença
          try {
            await session.sock.sendPresenceUpdate('available');
            await new Promise(resolve => setTimeout(resolve, 500));
            await session.sock.sendPresenceUpdate('unavailable');
            logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Presença global enviada para sincronização`);
          } catch (presErr) {
            logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Falha ao enviar presença global: ${presErr.message}`);
          }
          
          // Verificar se existe contato com mesmo número mas nome diferente
          const { data: otherContact } = await SupabaseService.getClient()
            .from('whatsapp_contacts')
            .select('profile_name')
            .eq('wa_id', phoneNumber)
            .not('profile_name', 'is', null)
            .single();
          
          if (otherContact?.profile_name) {
            logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Nome encontrado em outro registro: ${otherContact.profile_name}`);
            return otherContact.profile_name;
          }
          
          return null;
        } catch (err) {
          logger.error(`[${sessionId}] [BUSCA_DIFERIDA] Estratégia 4 erro: ${err.message}`);
          return null;
        }
      },
      
      // 5. Estratégia de "indução de resposta" - tentar fazer o contato responder
      async () => {
        try {
          logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Estratégia 5: Tentando induzir resposta do contato...`);
          
          // Esta é uma estratégia mais agressiva que tenta fazer o contato responder
          // para que possamos capturar o pushName na resposta
          
          // 1. Marcar como lido para mostrar atividade
          try {
            await session.sock.readMessages([{
              remoteJid: wa_id,
              id: 'sync_' + Date.now(),
              participant: undefined
            }]);
            logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Mensagem marcada como lida`);
          } catch (readErr) {
            logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Falha ao marcar como lida: ${readErr.message}`);
          }
          
          // 2. Enviar presença de digitação (pode aparecer para o contato)
          try {
            await session.sock.sendPresenceUpdate('composing', wa_id);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 segundos digitando
            await session.sock.sendPresenceUpdate('paused', wa_id);
            logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Presença de digitação enviada para induzir resposta`);
          } catch (presErr) {
            logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Falha ao enviar presença: ${presErr.message}`);
          }
          
          // 3. Tentar obter informações do perfil de forma mais direta
          try {
            const profilePicUrl = await session.sock.profilePictureUrl(wa_id, 'image');
            if (profilePicUrl) {
              logger.info(`[${sessionId}] [BUSCA_DIFERIDA] ✅ Foto do perfil obtida: ${profilePicUrl.substring(0, 50)}...`);
              
              // Se conseguimos a foto, o contato existe e está acessível
              // Vamos tentar uma última estratégia: buscar no status
              try {
                const status = await session.sock.fetchStatus(wa_id);
                if (status && status.status && status.status.length > 0) {
                  // Se o status contém apenas texto sem emoji, pode ser um nome
                  const statusText = status.status.trim();
                  if (statusText && !/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(statusText)) {
                    logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Status como possível nome: ${statusText}`);
                    return statusText.length <= 50 ? statusText : null; // Limitar tamanho razoável
                  }
                }
              } catch (statusErr) {
                logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Status não disponível: ${statusErr.message}`);
              }
            }
          } catch (picErr) {
            logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Foto do perfil não acessível: ${picErr.message}`);
          }
          
          return null;
        } catch (err) {
          logger.error(`[${sessionId}] [BUSCA_DIFERIDA] Estratégia 5 erro: ${err.message}`);
          return null;
        }
      }
    ];

    // Executar estratégias sequencialmente
    for (let i = 0; i < strategies.length; i++) {
      try {
        logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Executando estratégia ${i + 1}...`);
        const name = await strategies[i]();
        logger.info(`[${sessionId}] [BUSCA_DIFERIDA] Estratégia ${i + 1} retornou: ${name || 'null'}`);
        if (name && name.trim()) {
          profile_name = name.trim();
          logger.info(`[${sessionId}] [BUSCA_DIFERIDA] ✅ Nome encontrado via estratégia ${i + 1}: ${profile_name}`);
          break;
        }
      } catch (strategyErr) {
        logger.error(`[${sessionId}] [BUSCA_DIFERIDA] ❌ Estratégia ${i + 1} falhou: ${strategyErr.message}`);
      }
    }

    // Se encontrou um nome, atualizar o contato
    if (profile_name) {
      const { error: updateError } = await SupabaseService.getClient()
        .from('whatsapp_contacts')
        .update({ profile_name: profile_name })
        .eq('id', contactId);
      
      if (!updateError) {
        logger.info(`[${sessionId}] [BUSCA_DIFERIDA] ✅ Contato atualizado com nome: ${wa_id} -> ${profile_name}`);
        
        // Limpar cache para forçar reload
        const contactCacheKey = `contact:${wa_id}@s.whatsapp.net`;
        cache.delete(contactCacheKey);
      } else {
        logger.error(`[${sessionId}] [BUSCA_DIFERIDA] Erro ao atualizar contato: ${updateError}`);
      }
    } else {
      logger.debug(`[${sessionId}] [BUSCA_DIFERIDA] Nenhum nome encontrado para: ${wa_id}`);
    }
    
  } catch (err) {
    logger.error(`[${sessionId}] [BUSCA_DIFERIDA] Erro inesperado: ${err.message}`);
  }
}

/**
 * Sincroniza todos os contatos salvos no WhatsApp da sessão
 * @param {string} sessionId - ID da sessão
 */
async function syncAllWhatsAppContacts(sessionId) {
  try {
    logger.info(`[${sessionId}] [SYNC_CONTACTS] Iniciando sincronização completa de contatos...`);
    
    const WhatsAppManager = require('./WhatsAppManager');
    const session = WhatsAppManager.getSession(sessionId);
    
    if (!session || !session.sock) {
      logger.error(`[${sessionId}] [SYNC_CONTACTS] Sessão não disponível`);
      return;
    }

    // Verificar se já foi feita sincronização recente (cache por 30 minutos)
    const syncCacheKey = `sync_contacts_${sessionId}`;
    if (cache.has(syncCacheKey)) {
      logger.info(`[${sessionId}] [SYNC_CONTACTS] Sincronização já realizada recentemente`);
      return;
    }

    let contactsCount = 0;
    let updatedCount = 0;

    try {
      // Estratégia 1: Tentar múltiplas formas de acessar contatos
      const contactMethods = [
        // Método 1: getContacts direto
        async () => {
          if (typeof session.sock.getContacts === 'function') {
            logger.info(`[${sessionId}] [SYNC_CONTACTS] Tentando getContacts()...`);
            return await session.sock.getContacts();
          }
          return null;
        },
        
        // Método 2: Tentar acessar via sock.store (se ainda existir algum vestígio)
        async () => {
          if (session.sock.store && session.sock.store.contacts) {
            logger.info(`[${sessionId}] [SYNC_CONTACTS] Tentando sock.store.contacts...`);
            const contacts = Object.values(session.sock.store.contacts);
            return contacts;
          }
          return null;
        },
        
        // Método 3: Tentar usar authState para obter informações
        async () => {
          try {
            logger.info(`[${sessionId}] [SYNC_CONTACTS] Tentando buscar via histórico de chats...`);
            // Esta é uma estratégia experimental para buscar chats recentes
            const chats = await session.sock.getChats();
            if (chats && chats.length > 0) {
              logger.info(`[${sessionId}] [SYNC_CONTACTS] Encontrados ${chats.length} chats`);
              return chats.filter(chat => chat.id.endsWith('@s.whatsapp.net') && (chat.name || chat.notify));
            }
          } catch (chatsErr) {
            logger.debug(`[${sessionId}] [SYNC_CONTACTS] getChats falhou: ${chatsErr.message}`);
          }
          return null;
        }
      ];
      
      let contacts = null;
      for (let i = 0; i < contactMethods.length; i++) {
        try {
          contacts = await contactMethods[i]();
          if (contacts && contacts.length > 0) {
            logger.info(`[${sessionId}] [SYNC_CONTACTS] Método ${i + 1} retornou ${contacts.length} contatos`);
            break;
          }
        } catch (methodErr) {
          logger.debug(`[${sessionId}] [SYNC_CONTACTS] Método ${i + 1} falhou: ${methodErr.message}`);
        }
      }
      
      if (contacts && contacts.length > 0) {
        logger.info(`[${sessionId}] [SYNC_CONTACTS] Processando ${contacts.length} contatos encontrados...`);
        
        for (const contact of contacts) {
          if (contact.id && (contact.name || contact.notify)) {
            const wa_id = contact.id.replace('@s.whatsapp.net', '');
            const name = contact.name || contact.notify;
            
            try {
              await SupabaseService.upsertWhatsappContact(wa_id, name);
              contactsCount++;
              logger.info(`[${sessionId}] [SYNC_CONTACTS] ✅ Sincronizado: ${wa_id} -> ${name}`);
            } catch (upsertErr) {
              logger.debug(`[${sessionId}] [SYNC_CONTACTS] Erro ao salvar contato ${wa_id}: ${upsertErr.message}`);
            }
          }
        }
        updatedCount = contactsCount;
      } else {
        logger.warn(`[${sessionId}] [SYNC_CONTACTS] Nenhum contato encontrado através dos métodos diretos`);
      }
    } catch (getContactsErr) {
      logger.error(`[${sessionId}] [SYNC_CONTACTS] Erro geral na obtenção de contatos: ${getContactsErr.message}`);
    }

    // Estratégia 2: Tentar usar query de números conhecidos
    if (contactsCount === 0) {
      try {
        logger.info(`[${sessionId}] [SYNC_CONTACTS] Tentando estratégia alternativa...`);
        
        // Buscar contatos que já temos no banco para verificar se conseguimos nomes atualizados
        const { data: existingContacts } = await SupabaseService.getClient()
          .from('whatsapp_contacts')
          .select('wa_id, profile_name')
          .is('profile_name', null)
          .limit(50); // Limitar para não sobrecarregar
        
        if (existingContacts && existingContacts.length > 0) {
          logger.info(`[${sessionId}] [SYNC_CONTACTS] Tentando atualizar ${existingContacts.length} contatos sem nome...`);
          
          for (const contact of existingContacts) {
            try {
              const wa_id_full = contact.wa_id + '@s.whatsapp.net';
              
              // Tentar obter perfil comercial
              try {
                const businessProfile = await session.sock.getBusinessProfile(wa_id_full);
                if (businessProfile && businessProfile.description) {
                  await SupabaseService.upsertWhatsappContact(contact.wa_id, businessProfile.description);
                  updatedCount++;
                  logger.info(`[${sessionId}] [SYNC_CONTACTS] ✅ Perfil comercial: ${contact.wa_id} -> ${businessProfile.description}`);
                  continue;
                }
              } catch (bizErr) {
                logger.debug(`[${sessionId}] [SYNC_CONTACTS] Sem perfil comercial para ${contact.wa_id}`);
              }
              
              // Tentar verificar se está no WhatsApp
              try {
                const [result] = await session.sock.onWhatsApp(contact.wa_id);
                if (result && result.exists) {
                  logger.debug(`[${sessionId}] [SYNC_CONTACTS] Contato ${contact.wa_id} confirmado no WhatsApp`);
                }
              } catch (whatsappErr) {
                logger.debug(`[${sessionId}] [SYNC_CONTACTS] Erro ao verificar ${contact.wa_id}: ${whatsappErr.message}`);
              }
              
              // Pequeno delay para não sobrecarregar
              await new Promise(resolve => setTimeout(resolve, 100));
              
            } catch (contactErr) {
              logger.debug(`[${sessionId}] [SYNC_CONTACTS] Erro ao processar contato ${contact.wa_id}: ${contactErr.message}`);
            }
          }
        }
      } catch (alternativeErr) {
        logger.error(`[${sessionId}] [SYNC_CONTACTS] Erro na estratégia alternativa: ${alternativeErr.message}`);
      }
    }

    // Marcar sincronização como concluída
    cache.set(syncCacheKey, true, 1800); // 30 minutos
    
    logger.info(`[${sessionId}] [SYNC_CONTACTS] ✅ Sincronização concluída - ${contactsCount} contatos encontrados, ${updatedCount} atualizados`);
    
  } catch (err) {
    logger.error(`[${sessionId}] [SYNC_CONTACTS] Erro geral na sincronização: ${err.message}`);
  }
}

/**
 * Tenta atualizar um contato específico após sincronização
 * @param {string} sessionId - ID da sessão
 * @param {string} wa_id - WhatsApp ID do contato
 * @param {string} contactId - ID do contato no banco
 */
async function updateContactFromSync(sessionId, wa_id, contactId) {
  try {
    logger.info(`[${sessionId}] [UPDATE_FROM_SYNC] Verificando se contato foi atualizado: ${wa_id}`);
    
    // Verificar se o contato agora tem nome após a sincronização
    const { data: updatedContact } = await SupabaseService.getClient()
      .from('whatsapp_contacts')
      .select('profile_name')
      .eq('id', contactId)
      .single();
    
    if (updatedContact && updatedContact.profile_name) {
      logger.info(`[${sessionId}] [UPDATE_FROM_SYNC] ✅ Contato agora possui nome: ${updatedContact.profile_name}`);
      
      // Limpar cache para forçar reload
      const contactCacheKey = `contact:${wa_id}@s.whatsapp.net`;
      cache.delete(contactCacheKey);
    } else {
      logger.debug(`[${sessionId}] [UPDATE_FROM_SYNC] Contato ainda sem nome após sincronização`);
    }
    
  } catch (err) {
    logger.error(`[${sessionId}] [UPDATE_FROM_SYNC] Erro: ${err.message}`);
  }
}

/**
 * Configura um listener temporário para capturar nomes de contatos em mensagens futuras
 * @param {string} sessionId - ID da sessão
 * @param {string} wa_id - WhatsApp ID do contato
 * @param {string} contactId - ID do contato no banco
 */
function setupTemporaryContactListener(sessionId, wa_id, contactId) {
  try {
    logger.info(`[${sessionId}] [TEMP_LISTENER] Configurando listener temporário para: ${wa_id}`);
    
    const WhatsAppManager = require('./WhatsAppManager');
    const session = WhatsAppManager.getSession(sessionId);
    
    if (!session || !session.sock) {
      logger.debug(`[${sessionId}] [TEMP_LISTENER] Sessão não disponível`);
      return;
    }

    // Cache para evitar múltiplos listeners para o mesmo contato
    const listenerKey = `temp_listener_${sessionId}_${wa_id}`;
    if (cache.has(listenerKey)) {
      logger.debug(`[${sessionId}] [TEMP_LISTENER] Listener já existe para: ${wa_id}`);
      return;
    }

    // Configurar listener temporário
    const tempListener = async (m) => {
      const msg = m.messages[0];
      if (!msg) return;

      const msgWaId = msg.key.participant || msg.key.remoteJid;
      
      // Verificar se a mensagem é do contato que estamos monitorando
      if (msgWaId === wa_id && msg.pushName) {
        logger.info(`[${sessionId}] [TEMP_LISTENER] ✅ Nome capturado via listener: ${msg.pushName} para ${wa_id}`);
        
        try {
          // Atualizar o contato imediatamente
          await SupabaseService.getClient()
            .from('whatsapp_contacts')
            .update({ profile_name: msg.pushName })
            .eq('id', contactId);
          
          logger.info(`[${sessionId}] [TEMP_LISTENER] ✅ Contato atualizado: ${wa_id} -> ${msg.pushName}`);
          
          // Limpar cache
          const contactCacheKey = `contact:${wa_id}@s.whatsapp.net`;
          cache.delete(contactCacheKey);
          
          // Remover listener após capturar o nome
          session.sock.ev.off('messages.upsert', tempListener);
          cache.delete(listenerKey);
          
          logger.info(`[${sessionId}] [TEMP_LISTENER] Listener removido após sucesso`);
        } catch (updateErr) {
          logger.error(`[${sessionId}] [TEMP_LISTENER] Erro ao atualizar contato: ${updateErr.message}`);
        }
      }
    };

    // Adicionar listener
    session.sock.ev.on('messages.upsert', tempListener);
    cache.set(listenerKey, true, 300); // Cache por 5 minutos
    
    // Remover listener automaticamente após 5 minutos
    setTimeout(() => {
      try {
        session.sock.ev.off('messages.upsert', tempListener);
        cache.delete(listenerKey);
        logger.debug(`[${sessionId}] [TEMP_LISTENER] Listener removido por timeout para: ${wa_id}`);
      } catch (removeErr) {
        logger.debug(`[${sessionId}] [TEMP_LISTENER] Erro ao remover listener: ${removeErr.message}`);
      }
    }, 300000); // 5 minutos

    logger.info(`[${sessionId}] [TEMP_LISTENER] Listener configurado com sucesso para: ${wa_id}`);
    
  } catch (err) {
    logger.error(`[${sessionId}] [TEMP_LISTENER] Erro ao configurar listener: ${err.message}`);
  }
}

module.exports = {
  handleIncomingMessage,
  handleOutgoingMessage,
  syncAllWhatsAppContacts,
};