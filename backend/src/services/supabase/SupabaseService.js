const { createClient } = require('@supabase/supabase-js');
const logger = require('../../utils/logger');

class SupabaseService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_ANON_KEY;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase URL e Anon Key são obrigatórios');
    }

    // Cliente para operações públicas
    this.client = createClient(this.supabaseUrl, this.supabaseKey);
    
    // Cliente para operações administrativas (se service key estiver disponível)
    if (this.supabaseServiceKey) {
      this.adminClient = createClient(this.supabaseUrl, this.supabaseServiceKey);
    }
  }

  // Verificar conexão com o banco
  async testConnection() {
    try {
      // Testa conexão buscando 1 usuário
      const { data, error } = await this.client
        .from('users')
        .select('id')
        .limit(1);

      if (error) {
        logger.error('Erro ao testar conexão Supabase:', error);
        return { success: false, error: error.message };
      }

      logger.info('✅ Conexão com Supabase estabelecida');
      return { success: true };
    } catch (error) {
      logger.error('Erro ao testar conexão:', error);
      return { success: false, error: error.message };
    }
  }

  // Listar tabelas existentes (agora retorna todas do schema)
  async getExistingTables() {
    try {
      return [
        'analytics_message_analysis',
        'clickup_contact_mapping',
        'clickup_folders',
        'clickup_lists',
        'clickup_spaces',
        'clickup_tasks',
        'clickup_webhook_events',
        'clickup_workspaces',
        'organizations',
        'users',
        'whatsapp_contacts',
        'whatsapp_conversations',
        'whatsapp_media_files',
        'whatsapp_message_templates',
        'whatsapp_messages',
        'whatsapp_phone_numbers',
        'whatsapp_webhook_events'
      ];
    } catch (error) {
      logger.error('Erro ao listar tabelas:', error);
      return [];
    }
  }

  // Obter cliente para uso em outros módulos
  getClient() {
    return this.client;
  }

  getAdminClient() {
    return this.adminClient;
  }

  /**
   * Faz upload de um arquivo para o Supabase Storage
   * @param {string} bucket - Nome do bucket
   * @param {string} path - Caminho do arquivo no bucket
   * @param {Buffer} fileBuffer - Conteúdo do arquivo
   * @param {string} contentType - Tipo MIME do arquivo
   * @returns {Promise<{publicUrl: string|null, error: string|null}>}
   */
  async uploadFileToStorage(bucket, path, fileBuffer, contentType) {
    try {
      const { data, error } = await this.client.storage.from(bucket).upload(path, fileBuffer, {
        contentType,
        upsert: true
      });
      if (error) {
        logger.error('Erro ao fazer upload para Supabase Storage:', error);
        return { publicUrl: null, error: error.message };
      }
      // Gerar URL pública
      const { publicUrl } = this.client.storage.from(bucket).getPublicUrl(path).data;
      logger.info(`Arquivo salvo no Storage: ${publicUrl}`);
      return { publicUrl, error: null };
    } catch (err) {
      logger.error('Erro inesperado no upload para Storage:', err);
      return { publicUrl: null, error: err.message };
    }
  }

  /**
   * Cria ou atualiza um contato do WhatsApp na tabela whatsapp_contacts
   * @param {string} wa_id - Número do WhatsApp (jid)
   * @param {string} profile_name - Nome do perfil (se disponível)
   * @returns {Promise<{id: string|null, error: string|null}>}
   */
  async upsertWhatsappContact(wa_id, profile_name) {
    try {
      const { data, error } = await this.client
        .from('whatsapp_contacts')
        .upsert([
          {
            wa_id,
            profile_name,
            updated_at: new Date().toISOString()
          }
        ], { onConflict: 'wa_id' })
        .select('id')
        .single();
      if (error) {
        logger.error('Erro ao criar/atualizar contato:', error);
        return { id: null, error: error.message };
      }
      logger.info(`Contato upserted: ${wa_id}`);
      return { id: data?.id || null, error: null };
    } catch (err) {
      logger.error('Erro inesperado no upsert de contato:', err);
      return { id: null, error: err.message };
    }
  }

  /**
   * Cria ou atualiza uma conversa do WhatsApp na tabela whatsapp_conversations
   * @param {string} phone_number_id - ID do número conectado (remetente local)
   * @param {string} contact_id - ID do contato (remetente remoto)
   * @param {string} last_message_preview - Preview da última mensagem
   * @param {string} last_message_at - Timestamp da última mensagem
   * @returns {Promise<{id: string|null, error: string|null}>}
   */
  async upsertWhatsappConversation(phone_number_id, contact_id, last_message_preview, last_message_at) {
    try {
      // First, try to find existing conversation
      const { data: existingConv, error: findError } = await this.client
        .from('whatsapp_conversations')
        .select('id')
        .eq('phone_number_id', phone_number_id)
        .eq('contact_id', contact_id)
        .single();
      
      if (existingConv) {
        // Update existing conversation
        const { data, error } = await this.client
          .from('whatsapp_conversations')
          .update({
            last_message_preview,
            last_message_at,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingConv.id)
          .select('id')
          .single();
          
        if (error) {
          logger.error('Erro ao atualizar conversa:', error);
          return { id: null, error: error.message };
        }
        logger.info(`Conversa atualizada: ${phone_number_id} <-> ${contact_id}`);
        return { id: data?.id || null, error: null };
      } else {
        // Create new conversation
        const { data, error } = await this.client
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
          
        if (error) {
          logger.error('Erro ao criar conversa:', error);
          return { id: null, error: error.message };
        }
        logger.info(`Conversa criada: ${phone_number_id} <-> ${contact_id}`);
        return { id: data?.id || null, error: null };
      }
    } catch (err) {
      logger.error('Erro inesperado no upsert de conversa:', err);
      return { id: null, error: err.message };
    }
  }

  /**
   * Insere uma mensagem do WhatsApp na tabela whatsapp_messages
   * @param {object} messageData - Dados da mensagem (deve conter conversation_id, sender_id, content, type, timestamp, etc)
   * @returns {Promise<{id: string|null, error: string|null}>}
   */
  async insertWhatsappMessage(messageData) {
    try {
      const { data, error } = await this.client
        .from('whatsapp_messages')
        .insert(messageData)
        .select('id')
        .single();
      if (error) {
        logger.error('Erro ao inserir mensagem:', error);
        return { id: null, error: error.message };
      }
      logger.info('Mensagem inserida:', data?.id);
      return { id: data?.id || null, error: null };
    } catch (err) {
      logger.error('Erro inesperado ao inserir mensagem:', err);
      return { id: null, error: err.message };
    }
  }

  /**
   * Busca o histórico de mensagens de uma conversa
   * @param {string} conversationId - ID da conversa
   * @param {number} [limit=50] - Limite de mensagens (default: 50)
   * @returns {Promise<{messages: Array, error: string|null}>}
   */
  async getMessagesByConversation(conversationId, limit = 50) {
    try {
      const { data, error } = await this.client
        .from('whatsapp_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: true })
        .limit(limit);
      if (error) {
        logger.error('Erro ao buscar mensagens:', error);
        return { messages: [], error: error.message };
      }
      return { messages: data, error: null };
    } catch (err) {
      logger.error('Erro inesperado ao buscar mensagens:', err);
      return { messages: [], error: err.message };
    }
  }
}

module.exports = new SupabaseService(); 