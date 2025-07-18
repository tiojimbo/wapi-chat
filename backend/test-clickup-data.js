const SupabaseService = require('./src/services/supabase/SupabaseService');
const logger = require('./src/utils/logger');

async function testClickUpData() {
  try {
    logger.info('🔍 Testando dados do ClickUp no Supabase...');
    const supabase = SupabaseService.getClient();

    // 1. Verificar workspaces
    const { data: workspaces, error: workspaceError } = await supabase
      .from('clickup_workspaces')
      .select('*')
      .limit(5);
    
    logger.info(`📊 Workspaces encontrados: ${workspaces?.length || 0}`);
    if (workspaces?.length > 0) {
      logger.info('Sample workspace:', workspaces[0]);
    }

    // 2. Verificar spaces
    const { data: spaces, error: spaceError } = await supabase
      .from('clickup_spaces')
      .select('*')
      .limit(5);
    
    logger.info(`📊 Spaces encontrados: ${spaces?.length || 0}`);
    if (spaces?.length > 0) {
      logger.info('Sample space:', spaces[0]);
    }

    // 3. Verificar folders
    const { data: folders, error: folderError } = await supabase
      .from('clickup_folders')
      .select('*')
      .limit(5);
    
    logger.info(`📊 Folders encontrados: ${folders?.length || 0}`);
    if (folders?.length > 0) {
      logger.info('Sample folder:', folders[0]);
    }

    // 4. Verificar lists
    const { data: lists, error: listError } = await supabase
      .from('clickup_lists')
      .select('*')
      .limit(5);
    
    logger.info(`📊 Lists encontradas: ${lists?.length || 0}`);
    if (lists?.length > 0) {
      logger.info('Sample list:', lists[0]);
    }

    // 5. Verificar tasks
    const { data: tasks, error: taskError } = await supabase
      .from('clickup_tasks')
      .select('*')
      .limit(5);
    
    logger.info(`📊 Tasks encontradas: ${tasks?.length || 0}`);
    if (tasks?.length > 0) {
      logger.info('Sample task:', {
        name: tasks[0].name,
        custom_fields: tasks[0].custom_fields
      });
    }

    // 6. Buscar especificamente pela estrutura esperada
    logger.info('🔍 Buscando estrutura específica: Projetos > Painel de Projetos > Projetos Externos');
    
    const { data: projectTasks, error: projectError } = await supabase
      .from('clickup_tasks')
      .select(`
        id,
        task_id,
        name,
        custom_fields,
        clickup_lists!inner(
          id,
          name,
          clickup_folders!inner(
            id,
            name,
            clickup_spaces!inner(
              id,
              name
            )
          )
        )
      `)
      .eq('clickup_lists.name', 'Projetos Externos')
      .eq('clickup_lists.clickup_folders.name', 'Painel de Projetos')
      .eq('clickup_lists.clickup_folders.clickup_spaces.name', 'Projetos');

    logger.info(`🎯 Tasks em "Projetos Externos": ${projectTasks?.length || 0}`);
    if (projectError) {
      logger.error('Erro na busca de projetos:', projectError);
    }

    // 7. Buscar especificamente pela estrutura de prospects
    logger.info('🔍 Buscando estrutura específica: Comercial > Vendas > Social Selling');
    
    const { data: prospectTasks, error: prospectError } = await supabase
      .from('clickup_tasks')
      .select(`
        id,
        task_id,
        name,
        custom_fields,
        clickup_lists!inner(
          id,
          name,
          clickup_folders!inner(
            id,
            name,
            clickup_spaces!inner(
              id,
              name
            )
          )
        )
      `)
      .eq('clickup_lists.name', 'Social Selling')
      .eq('clickup_lists.clickup_folders.name', 'Vendas')
      .eq('clickup_lists.clickup_folders.clickup_spaces.name', 'Comercial');

    logger.info(`🎯 Tasks em "Social Selling": ${prospectTasks?.length || 0}`);
    if (prospectError) {
      logger.error('Erro na busca de prospects:', prospectError);
    }

    // 8. Listar todas as combinações space/folder/list disponíveis
    logger.info('📋 Listando todas as combinações space/folder/list disponíveis:');
    
    const { data: allCombinations } = await supabase
      .from('clickup_tasks')
      .select(`
        clickup_lists!inner(
          name,
          clickup_folders!inner(
            name,
            clickup_spaces!inner(
              name
            )
          )
        )
      `)
      .limit(50);

    if (allCombinations?.length > 0) {
      const combinations = allCombinations.map(task => ({
        space: task.clickup_lists?.clickup_folders?.clickup_spaces?.name,
        folder: task.clickup_lists?.clickup_folders?.name,
        list: task.clickup_lists?.name
      }));
      
      const uniqueCombinations = [...new Set(combinations.map(c => `${c.space} > ${c.folder} > ${c.list}`))];
      uniqueCombinations.forEach(combo => logger.info(`  - ${combo}`));
    }

  } catch (error) {
    logger.error('❌ Erro ao testar dados do ClickUp:', error);
  }
}

testClickUpData().then(() => {
  logger.info('✅ Teste concluído');
  process.exit(0);
}).catch(error => {
  logger.error('❌ Erro fatal:', error);
  process.exit(1);
});