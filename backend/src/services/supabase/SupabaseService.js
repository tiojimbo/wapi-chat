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
}

module.exports = new SupabaseService(); 