const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

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
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.key.fromMe && m.type === 'notify') {
        logger.info(`Nova mensagem recebida na sessão ${sessionId}:`, msg.key.remoteJid);
        // Aqui será implementado o processamento de mensagens
      }
    });

    sock.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        if (update.update.status) {
          logger.info(`Status da mensagem atualizado na sessão ${sessionId}:`, update.update.status);
        }
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
}

module.exports = new WhatsAppManager(); 