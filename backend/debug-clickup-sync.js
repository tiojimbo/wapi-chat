const SupabaseService = require('./src/services/supabase/SupabaseService');
const ClickUpSyncService = require('./src/services/clickup/ClickUpSyncService');
const logger = require('./src/utils/logger');

async function debugClickUpSync() {
  try {
    logger.info('🔍 Verificando dados do ClickUp...');
    const supabase = SupabaseService.getClient();

    // 1. Verificar workspaces
    const { data: workspaces } = await supabase
      .from('clickup_workspaces')
      .select('team_id, name');
    
    logger.info(`📊 Workspaces encontrados: ${workspaces?.length || 0}`);
    if (workspaces?.length > 0) {
      workspaces.forEach(ws => {
        logger.info(`  - ${ws.name} (team_id: ${ws.team_id})`);
      });

      // 2. Verificar tasks existentes
      const { data: existingTasks } = await supabase
        .from('clickup_tasks')
        .select('id')
        .limit(1);

      if (!existingTasks || existingTasks.length === 0) {
        logger.info('❌ Nenhuma task encontrada - executando sincronização...');
        
        // Executar sincronização para o primeiro workspace
        const firstWorkspace = workspaces[0];
        logger.info(`🔄 Sincronizando workspace: ${firstWorkspace.name}`);
        
        const syncResult = await ClickUpSyncService.syncAllFromWorkspace(firstWorkspace.team_id);
        
        if (syncResult.success) {
          logger.info('✅ Sincronização concluída com sucesso!');
          
          // Verificar dados após sincronização
          const { data: tasksAfterSync } = await supabase
            .from('clickup_tasks')
            .select('name, clickup_lists!inner(name, clickup_folders!inner(name, clickup_spaces!inner(name)))')
            .limit(10);
          
          logger.info(`📊 Tasks após sincronização: ${tasksAfterSync?.length || 0}`);
          
          if (tasksAfterSync?.length > 0) {
            logger.info('📋 Estruturas encontradas:');
            tasksAfterSync.forEach(task => {
              const space = task.clickup_lists?.clickup_folders?.clickup_spaces?.name;
              const folder = task.clickup_lists?.clickup_folders?.name;
              const list = task.clickup_lists?.name;
              logger.info(`  - ${task.name} | ${space} > ${folder} > ${list}`);
            });
          }
        } else {
          logger.error('❌ Erro na sincronização:', syncResult.error);
        }
      } else {
        logger.info('✅ Tasks já existem no banco');
      }
    } else {
      logger.error('❌ Nenhum workspace encontrado - verifique a configuração do ClickUp');
    }

  } catch (error) {
    logger.error('❌ Erro durante debug/sync:', error);
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  debugClickUpSync().then(() => {
    logger.info('✅ Debug/sync concluído');
    process.exit(0);
  }).catch(error => {
    logger.error('❌ Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = { debugClickUpSync };