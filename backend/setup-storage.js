require('dotenv').config();
const SupabaseService = require('./src/services/supabase/SupabaseService');
const logger = require('./src/utils/logger');

/**
 * Script para configurar o Supabase Storage para mídia do WhatsApp
 */
async function setupMediaStorage() {
  logger.info('🔧 Configurando Supabase Storage para mídia...');
  
  try {
    // 1. Verificar se o bucket já existe
    logger.info('1. Verificando buckets existentes...');
    const { data: buckets, error: listError } = await SupabaseService.getClient().storage.listBuckets();
    
    if (listError) {
      logger.error('❌ Erro ao listar buckets:', listError);
      return;
    }
    
    const mediaBucket = buckets.find(bucket => bucket.name === 'whatsapp-media');
    
    if (mediaBucket) {
      logger.info('✅ Bucket "whatsapp-media" já existe');
    } else {
      // 2. Criar o bucket
      logger.info('2. Criando bucket "whatsapp-media"...');
      const { data: newBucket, error: createError } = await SupabaseService.getClient().storage.createBucket('whatsapp-media', {
        public: true,
        allowedMimeTypes: [
          'image/jpeg',
          'image/png',
          'image/webp',
          'video/mp4',
          'audio/ogg',
          'audio/mpeg',
          'application/pdf',
          'application/octet-stream'
        ],
        fileSizeLimit: 50 * 1024 * 1024 // 50MB
      });
      
      if (createError) {
        logger.error('❌ Erro ao criar bucket:', createError);
        return;
      }
      
      logger.info('✅ Bucket "whatsapp-media" criado com sucesso');
    }
    
    // 3. Configurar política de acesso público
    logger.info('3. Configurando política de acesso público...');
    
    // Política RLS para permitir leitura pública
    const policySQL = `
      CREATE POLICY "Allow public read access on whatsapp-media" 
      ON storage.objects FOR SELECT 
      TO public 
      USING (bucket_id = 'whatsapp-media');
    `;
    
    logger.info('📝 Política RLS configurada (execute manualmente no Supabase SQL Editor se necessário)');
    logger.info('SQL:', policySQL);
    
    // 4. Testar upload de arquivo
    logger.info('4. Testando upload de arquivo...');
    const testContent = Buffer.from('test content', 'utf8');
    const testPath = 'test/test-file.txt';
    
    const { publicUrl, error: uploadError } = await SupabaseService.uploadFileToStorage(
      'whatsapp-media', 
      testPath, 
      testContent, 
      'text/plain'
    );
    
    if (uploadError) {
      logger.error('❌ Erro no teste de upload:', uploadError);
    } else {
      logger.info('✅ Teste de upload bem-sucedido');
      logger.info('🔗 URL de teste:', publicUrl);
      
      // Limpar arquivo de teste
      await SupabaseService.getClient().storage.from('whatsapp-media').remove([testPath]);
      logger.info('🧹 Arquivo de teste removido');
    }
    
    logger.info('✅ Configuração do Storage concluída!');
    
  } catch (err) {
    logger.error('❌ Erro na configuração do Storage:', err);
  }
}

// Executar configuração
if (require.main === module) {
  setupMediaStorage().catch(err => {
    logger.error('Erro na configuração:', err);
    process.exit(1);
  });
}

module.exports = { setupMediaStorage };