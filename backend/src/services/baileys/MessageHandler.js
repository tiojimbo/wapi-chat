const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const SupabaseService = require('../../services/supabase/SupabaseService');
const cache = require('../../utils/cache');

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
  const wa_id = msg.key.participant || msg.key.remoteJid;
  const profile_name = msg.pushName || null;
  let contactId = null;
  const contactCacheKey = `contact:${wa_id}`;
  if (cache.has(contactCacheKey)) {
    contactId = cache.get(contactCacheKey);
    logger.info(`[${sessionId}] Contato obtido do cache: ${wa_id}`);
  } else {
    try {
      const { id, error } = await SupabaseService.upsertWhatsappContact(wa_id, profile_name);
      if (id) {
        logger.info(`[${sessionId}] Contato registrado/atualizado: ${wa_id}`);
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
      const { publicUrl, error } = await SupabaseService.uploadFileToStorage(bucket, storagePath, mediaBuffer, contentType);
      if (publicUrl) {
        logger.info(`[${sessionId}] Backup no Supabase Storage: ${publicUrl}`);
      } else {
        logger.error(`[${sessionId}] Falha no backup Supabase Storage: ${error}`);
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
          await SupabaseService.upsertWhatsappConversation(
            phoneData.id,
            contactId,
            resumo,
            new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          );
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

module.exports = {
  handleIncomingMessage,
}; 