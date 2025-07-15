const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const { handleIncomingMessage, handleOutgoingMessage } = require('./MessageHandler');

class WhatsAppManager {
  constructor() {
    this.sessions = new Map();
    this.sessionPath = process.env.WHATSAPP_SESSION_PATH || './sessions';
    
    // Garantir que o diretório de sessões existe
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
    }
    // Carregar sessões existentes do disco
    this.loadExistingSessions();
  }

  loadExistingSessions() {
    const sessionDirs = fs.readdirSync(this.sessionPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    for (const sessionId of sessionDirs) {
      this.createSession(sessionId).catch(err => {
        logger.error(`Erro ao restaurar sessão ${sessionId}:`, err);
      });
    }
  }

  async createSession(sessionId, { name } = {}) {
    try {
      const sessionDir = path.join(this.sessionPath, sessionId);
      
      // Garantir que o diretório da sessão existe
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      // --- NOVO: Carregar nome salvo em meta.json, se existir ---
      let nomeFinal = name || '';
      const metaPath = path.join(sessionDir, 'meta.json');
      if (!name && fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          if (meta && meta.name) nomeFinal = meta.name;
        } catch {}
      }
      // --- FIM NOVO ---
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version, isLatest } = await fetchLatestBaileysVersion();
      
      // Store em memória não está mais disponível no Baileys v6.7+
      
      logger.info(`Baileys v${version.join('.')}, latest: ${isLatest}`);

      const sock = makeWASocket({
        version,
        printQRInTerminal: true,
        auth: state,
        logger: logger,
        browser: ['WapiChat', 'Chrome', '1.0.0'],
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 30_000,
        retryRequestDelayMs: 250,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
          return {
            conversation: 'Hello'
          };
        }
      });
      
      // Store não está mais disponível no Baileys v6.7+

      const now = new Date();
      // Primeiro, registra a sessão no Map
      this.sessions.set(sessionId, {
        sock,
        saveCreds,
        state: 'connecting',
        qrCode: null,
        lastSeen: now,
        name: nomeFinal,
        added: now,
        lastUsed: now
      });
      // --- NOVO: Salvar nome em meta.json se fornecido ---
      if (name) {
        try {
          fs.writeFileSync(metaPath, JSON.stringify({ name }), 'utf-8');
        } catch {}
      }
      // --- FIM NOVO ---
      // Depois, configura os handlers
      this.setupEventHandlers(sock, sessionId, saveCreds);

      return { success: true, sessionId };
    } catch (error) {
      logger.error(`Erro ao criar sessão ${sessionId}:`, error);
      throw error;
    }
  }

  setupEventHandlers(sock, sessionId, saveCreds) {
    const session = this.sessions.get(sessionId);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (!session) {
          logger.error(`Sessão ${sessionId} não encontrada ao tentar salvar QR Code!`);
          return;
        }
        session.qrCode = qr;
        session.state = 'qr_ready';
        logger.info(`QR Code gerado para sessão ${sessionId} (state: qr_ready)`);
      }

      if (connection === 'close') {
        // --- NOVO: Log e cleanup para conflito de sessão ---
        if (lastDisconnect?.error?.message?.includes('conflict')) {
          logger.error(`[${sessionId}] Conflito de sessão detectado (Stream Errored). Limpando sessão do disco e do Map.`);
          this.sessions.delete(sessionId);
          const sessionDir = path.join(this.sessionPath, sessionId);
          if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            logger.info(`[${sessionId}] Pasta da sessão removida do disco.`);
          }
          // Forçar reconexão limpa
          setTimeout(() => this.createSession(sessionId), 2000);
          return;
        }
        // --- FIM NOVO ---
        const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        logger.info(`Conexão fechada para sessão ${sessionId}, reconectando: ${shouldReconnect}`);
        if (shouldReconnect) {
          session.state = 'reconnecting';
          setTimeout(() => this.reconnectSession(sessionId), 5000);
        } else {
          session.state = 'disconnected';
          this.sessions.delete(sessionId);
        }
      } else if (connection === 'open') {
        session.state = 'connected';
        session.qrCode = null;
        session.lastSeen = new Date();
        // Salvar o número real do WhatsApp na sessão
        session.phone = sock.user?.id || '';
        // Corrigir: nunca sobrescrever o nome salvo na sessão
        if (!('name' in session)) session.name = '';
        logger.info(`Sessão ${sessionId} conectada com sucesso`);
        
        // NOVO: Sincronizar contatos automaticamente após conexão
        logger.info(`[${sessionId}] Iniciando sincronização automática de contatos após conexão...`);
        setTimeout(async () => {
          try {
            await this.syncContactsAfterConnection(sessionId);
          } catch (syncErr) {
            logger.error(`[${sessionId}] Erro na sincronização automática de contatos: ${syncErr.message}`);
          }
        }, 3000); // Aguardar 3 segundos para estabilizar a conexão
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (m.type === 'notify') {
        if (!msg.key.fromMe) {
          logger.info(`Nova mensagem recebida na sessão ${sessionId}:`, msg.key.remoteJid);
          await handleIncomingMessage(msg, sessionId);
        } else {
          logger.info(`Nova mensagem enviada na sessão ${sessionId}:`, msg.key.remoteJid);
          // Note: Outgoing messages sent via API are handled directly in the send route
          // Only process outgoing messages from other sources (like WhatsApp Web sync)
          if (!msg.key.id?.startsWith('manual-')) {
            await handleOutgoingMessage(msg, sessionId);
          }
        }
      }
    });

    sock.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        if (update.update.status && update.key && update.key.id) {
          logger.info(`Status da mensagem atualizado na sessão ${sessionId}:`, update.update.status);
          
          // Mapear status numérico para string
          const statusMap = {
            0: 'error',
            1: 'pending',
            2: 'sent',
            3: 'delivered',
            4: 'read'
          };
          
          const mappedStatus = statusMap[update.update.status] || update.update.status;
          logger.info(`Status mapeado: ${update.update.status} -> ${mappedStatus}`);
          
          // Atualizar status no banco
          const SupabaseService = require('../supabase/SupabaseService');
          try {
            await SupabaseService.updateMessageStatus(update.key.id, mappedStatus);
          } catch (error) {
            logger.error(`Erro ao atualizar status da mensagem ${update.key.id}:`, error);
          }
        }
      }
    });

    // Evento para capturar atualizações de contatos (nomes, fotos, etc.)
    sock.ev.on('contacts.update', async (updates) => {
      for (const update of updates) {
        if (update.id && (update.name || update.notify)) {
          const wa_id = update.id;
          const profile_name = update.name || update.notify;
          
          logger.info(`[${sessionId}] [CONTACTS_UPDATE] Contato atualizado: ${wa_id} -> ${profile_name}`);
          
          try {
            const SupabaseService = require('../supabase/SupabaseService');
            await SupabaseService.upsertWhatsappContact(wa_id.replace('@s.whatsapp.net', ''), profile_name);
            logger.info(`[${sessionId}] [CONTACTS_UPDATE] ✅ Contato sincronizado: ${profile_name}`);
          } catch (error) {
            logger.error(`[${sessionId}] [CONTACTS_UPDATE] Erro ao sincronizar contato:`, error);
          }
        }
      }
    });

    // Evento para capturar novos contatos (upsert)
    sock.ev.on('contacts.upsert', async (contacts) => {
      logger.info(`[${sessionId}] [CONTACTS_UPSERT] Recebidos ${contacts.length} contatos novos/atualizados`);
      
      const SupabaseService = require('../supabase/SupabaseService');
      let syncedCount = 0;
      
      for (const contact of contacts) {
        try {
          if (contact.id && (contact.name || contact.notify)) {
            const wa_id = contact.id.replace('@s.whatsapp.net', '');
            const profile_name = contact.name || contact.notify;
            
            await SupabaseService.upsertWhatsappContact(wa_id, profile_name);
            syncedCount++;
            logger.info(`[${sessionId}] [CONTACTS_UPSERT] ✅ ${wa_id} -> ${profile_name}`);
          }
        } catch (error) {
          logger.error(`[${sessionId}] [CONTACTS_UPSERT] Erro ao processar contato:`, error);
        }
      }
      
      logger.info(`[${sessionId}] [CONTACTS_UPSERT] Sincronizados ${syncedCount}/${contacts.length} contatos`);
    });

    // Evento para capturar atualizações de presença (pode fornecer informações de contato)
    sock.ev.on('presence.update', async (update) => {
      if (update.id && update.presences) {
        logger.debug(`[${sessionId}] [PRESENCE_UPDATE] Presença atualizada para: ${update.id}`);
        // A presença não fornece nome diretamente, mas confirma que o contato está ativo
      }
    });
  }

  async reconnectSession(sessionId) {
    try {
      const session = this.sessions.get(sessionId);
      if (session && session.state === 'reconnecting') {
        await this.createSession(sessionId);
      }
    } catch (error) {
      logger.error(`Erro ao reconectar sessão ${sessionId}:`, error);
    }
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  getAllSessions() {
    return Array.from(this.sessions.entries()).map(([id, session]) => ({
      id,
      state: session.state,
      lastSeen: session.lastSeen,
      qrCode: session.qrCode,
      name: session.name || '',
      phone: session.phone || '',
      added: session.added || null,
      lastUsed: session.lastUsed || null
    }));
  }

  async deleteSession(sessionId) {
    try {
      const session = this.sessions.get(sessionId);
      if (session) {
        // Store não está mais disponível no Baileys v6.7+
        await session.sock.logout();
        this.sessions.delete(sessionId);
        
        // Remover arquivos da sessão
        const sessionDir = path.join(this.sessionPath, sessionId);
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
        
        logger.info(`Sessão ${sessionId} removida com sucesso`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Erro ao deletar sessão ${sessionId}:`, error);
      throw error;
    }
  }

  async sendMessage(sessionId, jid, message, options = {}) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || session.state !== 'connected') {
        throw new Error('Sessão não está conectada');
      }

      const result = await session.sock.sendMessage(jid, message, options);
      logger.info(`Mensagem enviada na sessão ${sessionId} para ${jid}`);
      return result;
    } catch (error) {
      logger.error(`Erro ao enviar mensagem na sessão ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Sincroniza contatos automaticamente após estabelecer conexão
   * @param {string} sessionId - ID da sessão
   */
  async syncContactsAfterConnection(sessionId) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || !session.sock) {
        logger.error(`[${sessionId}] [AUTO_SYNC] Sessão não disponível`);
        return;
      }

      logger.info(`[${sessionId}] [AUTO_SYNC] 🔄 Iniciando sincronização automática de contatos...`);

      let totalContacts = 0;
      let syncedContacts = 0;

      // Estratégia 1: Tentar múltiplas formas de obter contatos
      const contactSources = [
        // Fonte 1: getContacts (se disponível)
        {
          name: 'getContacts',
          execute: async () => {
            if (typeof session.sock.getContacts === 'function') {
              logger.info(`[${sessionId}] [AUTO_SYNC] Tentando getContacts()...`);
              const contacts = await session.sock.getContacts();
              return contacts || [];
            }
            return [];
          }
        },
        
        // Fonte 2: Tentar via authState/store restante
        {
          name: 'authState',
          execute: async () => {
            try {
              // Verificar se há informações de contatos no authState
              const sessionDir = path.join(this.sessionPath, sessionId);
              const contactsFile = path.join(sessionDir, 'contacts.json');
              
              if (fs.existsSync(contactsFile)) {
                logger.info(`[${sessionId}] [AUTO_SYNC] Carregando contatos do arquivo local...`);
                const contactsData = JSON.parse(fs.readFileSync(contactsFile, 'utf8'));
                return Object.values(contactsData || {});
              }
            } catch (fileErr) {
              logger.debug(`[${sessionId}] [AUTO_SYNC] Arquivo de contatos não encontrado`);
            }
            return [];
          }
        },
        
        // Fonte 3: Buscar via histórico de chats
        {
          name: 'chatHistory',
          execute: async () => {
            try {
              // Esta função pode não existir, mas vale tentar
              if (typeof session.sock.getChats === 'function') {
                logger.info(`[${sessionId}] [AUTO_SYNC] Tentando obter chats para extrair contatos...`);
                const chats = await session.sock.getChats();
                if (chats && chats.length > 0) {
                  // Filtrar apenas chats individuais (não grupos)
                  const individualChats = chats.filter(chat => 
                    chat.id && 
                    chat.id.endsWith('@s.whatsapp.net') && 
                    (chat.name || chat.notify)
                  );
                  return individualChats.map(chat => ({
                    id: chat.id,
                    name: chat.name || chat.notify
                  }));
                }
              }
            } catch (chatsErr) {
              logger.debug(`[${sessionId}] [AUTO_SYNC] Busca via chats falhou: ${chatsErr.message}`);
            }
            return [];
          }
        },
        
        // Fonte 4: Estratégia agressiva - forçar sincronização via eventos
        {
          name: 'forceSync',
          execute: async () => {
            try {
              logger.info(`[${sessionId}] [AUTO_SYNC] Tentando estratégia agressiva de sincronização...`);
              
              // Tentar forçar uma atualização de contatos enviando presença global
              await session.sock.sendPresenceUpdate('available');
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // Tentar buscar contatos de alguma forma alternativa
              // Verificar se existem arquivos de sessão com informações de contatos
              const sessionDir = path.join(this.sessionPath, sessionId);
              const sessionFiles = fs.readdirSync(sessionDir).filter(f => f.startsWith('session-') && f.endsWith('.json'));
              
              const contacts = [];
              for (const file of sessionFiles) {
                try {
                  const sessionData = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
                  // Extrair informações de contatos dos dados de sessão se disponível
                  if (sessionData && sessionData.contacts) {
                    Object.values(sessionData.contacts).forEach(contact => {
                      if (contact.id && (contact.name || contact.notify)) {
                        contacts.push({
                          id: contact.id,
                          name: contact.name || contact.notify
                        });
                      }
                    });
                  }
                } catch (parseErr) {
                  // Ignorar arquivos inválidos
                }
              }
              
              if (contacts.length > 0) {
                logger.info(`[${sessionId}] [AUTO_SYNC] Encontrados ${contacts.length} contatos em arquivos de sessão`);
                return contacts;
              }
              
            } catch (forceSyncErr) {
              logger.debug(`[${sessionId}] [AUTO_SYNC] Estratégia agressiva falhou: ${forceSyncErr.message}`);
            }
            return [];
          }
        }
      ];

      // Tentar cada fonte de contatos
      let contacts = [];
      for (const source of contactSources) {
        try {
          logger.info(`[${sessionId}] [AUTO_SYNC] Testando fonte: ${source.name}`);
          const sourceContacts = await source.execute();
          
          if (sourceContacts && sourceContacts.length > 0) {
            logger.info(`[${sessionId}] [AUTO_SYNC] ✅ Fonte ${source.name} retornou ${sourceContacts.length} contatos`);
            contacts = sourceContacts;
            break;
          } else {
            logger.debug(`[${sessionId}] [AUTO_SYNC] Fonte ${source.name} não retornou contatos`);
          }
        } catch (sourceErr) {
          logger.debug(`[${sessionId}] [AUTO_SYNC] Erro na fonte ${source.name}: ${sourceErr.message}`);
        }
      }

      // Processar contatos encontrados
      if (contacts && contacts.length > 0) {
        logger.info(`[${sessionId}] [AUTO_SYNC] 📱 Processando ${contacts.length} contatos encontrados...`);
        totalContacts = contacts.length;
        
        const SupabaseService = require('../supabase/SupabaseService');
        
        for (const contact of contacts) {
          try {
            if (contact.id && (contact.name || contact.notify)) {
              const wa_id = contact.id.replace('@s.whatsapp.net', '');
              const name = contact.name || contact.notify;
              
              // Salvar no banco
              const result = await SupabaseService.upsertWhatsappContact(wa_id, name);
              if (result && !result.error) {
                syncedContacts++;
                logger.info(`[${sessionId}] [AUTO_SYNC] ✅ ${wa_id} -> ${name}`);
              }
            }
          } catch (contactErr) {
            logger.debug(`[${sessionId}] [AUTO_SYNC] Erro ao processar contato: ${contactErr.message}`);
          }
          
          // Pequeno delay para não sobrecarregar
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } else {
        logger.warn(`[${sessionId}] [AUTO_SYNC] ⚠️ Nenhum contato encontrado através das fontes diretas`);
        
        // Estratégia alternativa: Buscar contatos via números conhecidos
        logger.info(`[${sessionId}] [AUTO_SYNC] Tentando estratégia alternativa...`);
        await this.syncKnownContacts(sessionId);
      }

      logger.info(`[${sessionId}] [AUTO_SYNC] 🎉 Sincronização concluída: ${syncedContacts}/${totalContacts} contatos salvos`);
      
      // Salvar timestamp da última sincronização
      const cache = require('../../utils/cache');
      cache.set(`last_sync_${sessionId}`, new Date().toISOString(), 3600); // 1 hora

    } catch (error) {
      logger.error(`[${sessionId}] [AUTO_SYNC] Erro na sincronização automática: ${error.message}`);
    }
  }

  /**
   * Estratégia alternativa: tentar obter nomes de contatos conhecidos
   * @param {string} sessionId - ID da sessão
   */
  async syncKnownContacts(sessionId) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || !session.sock) return;

      const SupabaseService = require('../supabase/SupabaseService');
      
      // Buscar contatos que já temos no banco mas sem nome
      const { data: existingContacts } = await SupabaseService.getClient()
        .from('whatsapp_contacts')
        .select('id, wa_id, profile_name')
        .is('profile_name', null)
        .limit(20); // Limitar para não sobrecarregar

      if (existingContacts && existingContacts.length > 0) {
        logger.info(`[${sessionId}] [AUTO_SYNC] Tentando obter nomes para ${existingContacts.length} contatos existentes...`);
        
        for (const contact of existingContacts) {
          try {
            const wa_id_full = contact.wa_id + '@s.whatsapp.net';
            
            // Tentar perfil comercial
            try {
              const businessProfile = await session.sock.getBusinessProfile(wa_id_full);
              if (businessProfile && businessProfile.description) {
                await SupabaseService.upsertWhatsappContact(contact.wa_id, businessProfile.description);
                logger.info(`[${sessionId}] [AUTO_SYNC] ✅ Perfil comercial: ${contact.wa_id} -> ${businessProfile.description}`);
                continue;
              }
            } catch (bizErr) {
              // Continuar para próxima estratégia
            }
            
            // Delay entre tentativas
            await new Promise(resolve => setTimeout(resolve, 200));
            
          } catch (contactErr) {
            logger.debug(`[${sessionId}] [AUTO_SYNC] Erro ao processar contato conhecido ${contact.wa_id}: ${contactErr.message}`);
          }
        }
      }
    } catch (error) {
      logger.error(`[${sessionId}] [AUTO_SYNC] Erro na sincronização de contatos conhecidos: ${error.message}`);
    }
  }

  /**
   * Sincroniza todos os contatos salvos no WhatsApp para o banco de dados (manual)
   * @param {string} sessionId - ID da sessão
   */
  async syncContacts(sessionId) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || session.state !== 'connected') {
        throw new Error('Sessão não está conectada');
      }

      logger.info(`[${sessionId}] Iniciando sincronização manual de contatos...`);
      await this.syncContactsAfterConnection(sessionId);

      return { success: true, message: 'Sincronização de contatos concluída' };
    } catch (error) {
      logger.error(`Erro ao sincronizar contatos na sessão ${sessionId}:`, error);
      throw error;
    }
  }
}

module.exports = new WhatsAppManager();