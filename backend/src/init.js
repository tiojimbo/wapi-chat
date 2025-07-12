const SupabaseService = require('./services/supabase/SupabaseService');
const logger = require('./utils/logger');

async function initializeDatabase() {
  try {
    logger.info('🚀 Testando conexão com o banco de dados Supabase...');

    // Testar conexão
    const connection = await SupabaseService.testConnection();
    if (!connection.success) {
      logger.error('❌ Falha na conexão com Supabase:', connection.error);
      return false;
    }

    logger.info('✅ Conexão com Supabase estabelecida');
    return true;

  } catch (error) {
    logger.error('❌ Erro durante teste de conexão com o banco:', error);
    return false;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  initializeDatabase()
    .then(success => {
      if (success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('Erro fatal:', error);
      process.exit(1);
    });
}

module.exports = initializeDatabase; 