const express = require('express');
const router = express.Router();
const SupabaseService = require('../services/supabase/SupabaseService');
const logger = require('../utils/logger');

/**
 * Rota de teste para verificar se o endpoint está funcionando
 */
router.get('/test-context', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Endpoint context-lookup está funcionando!',
    timestamp: new Date().toISOString()
  });
});

/**
 * Busca contextual dinâmica para identificar projetos ou prospects
 * Detecta automaticamente se é grupo (projeto) ou conversa direta (prospect)
 */
router.post('/context-lookup', async (req, res) => {
  try {
    const { conversationId, sessionId } = req.body;

    if (!conversationId || !sessionId) {
      return res.status(400).json({ 
        error: 'conversationId e sessionId são obrigatórios' 
      });
    }

    logger.info(`[ContextLookup] Iniciando busca contextual para conversationId: ${conversationId}, sessionId: ${sessionId}`);
    
    const supabase = SupabaseService.getClient();

    // Debug: Verificar se há dados no ClickUp
    const { data: debugSpaces } = await supabase.from('clickup_spaces').select('name').limit(3);
    const { data: debugLists } = await supabase.from('clickup_lists').select('name').limit(3);
    const { data: debugTasks } = await supabase.from('clickup_tasks').select('name').limit(3);
    
    logger.info(`[ContextLookup] DEBUG - Spaces no DB: ${debugSpaces?.length || 0}`);
    logger.info(`[ContextLookup] DEBUG - Lists no DB: ${debugLists?.length || 0}`);
    logger.info(`[ContextLookup] DEBUG - Tasks no DB: ${debugTasks?.length || 0}`);
    
    if (debugSpaces?.length > 0) {
      logger.info(`[ContextLookup] DEBUG - Sample spaces: ${debugSpaces.map(s => s.name).join(', ')}`);
    }
    if (debugLists?.length > 0) {
      logger.info(`[ContextLookup] DEBUG - Sample lists: ${debugLists.map(l => l.name).join(', ')}`);
    }

    // 1. Primeiro, tentar buscar conversa real pelo ID
    let conversation = null;
    let convError = null;
    
    // Se não for um conversationId numérico, provavelmente é um wa_id direto
    if (isNaN(conversationId)) {
      // Buscar pelo wa_id diretamente
      const { data: contactData, error: contactError } = await supabase
        .from('whatsapp_contacts')
        .select(`
          id,
          wa_id,
          profile_name
        `)
        .eq('wa_id', conversationId)
        .single();
      
      if (contactData) {
        conversation = {
          id: `contact_${contactData.id}`,
          wa_id: contactData.wa_id,
          whatsapp_contacts: contactData
        };
      } else {
        convError = contactError;
      }
    } else {
      // Buscar conversa normal
      const { data: convData, error: convErr } = await supabase
        .from('whatsapp_conversations')
        .select(`
          id,
          conversation_id,
          whatsapp_contacts!inner(
            id,
            wa_id,
            profile_name
          )
        `)
        .eq('id', conversationId)
        .limit(1);
      
      conversation = convData?.[0];
      convError = convErr;
    }

    if (convError) {
      logger.error(`[ContextLookup] Erro ao buscar conversa:`, convError);
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    // Detectar se é grupo pelo padrão do wa_id
    const searchValue = conversation.wa_id || conversation.whatsapp_contacts?.wa_id;
    const isGroup = (searchValue && searchValue.includes('@g.us')) || false; // Grupos WhatsApp têm @g.us

    logger.info(`[ContextLookup] Conversa encontrada:`, { 
      id: conversation.id, 
      wa_id: searchValue, 
      isGroup: isGroup 
    });

    if (!searchValue) {
      return res.status(400).json({ error: 'ID da conversa/contato não encontrado' });
    }

    let contextData = null;
    let searchType = '';
    let targetLocation = '';

    if (isGroup) {
      // Cenário: GRUPO (Projeto)
      searchType = 'projeto';
      targetLocation = 'Projetos > Painel de Projetos > Projetos Externos';
      
      logger.info(`[ContextLookup] Detectado como GRUPO - Buscando projeto com ID: ${searchValue}`);

      // Buscar nas tasks da lista "Projetos Externos" pelo campo "ID do Grupo WhatsApp"
      logger.info(`[ContextLookup] Buscando tasks em Projetos > Painel de Projetos > Projetos Externos`);
      
      // Primeiro, buscar todas as tasks para debug
      const { data: allTasks, error: allTasksError } = await supabase
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
        .limit(10);

      logger.info(`[ContextLookup] DEBUG - Total tasks no DB: ${allTasks?.length || 0}`);
      if (allTasks?.length > 0) {
        allTasks.forEach((task, index) => {
          logger.info(`[ContextLookup] DEBUG - Task ${index + 1}: ${task.name} | Space: ${task.clickup_lists?.clickup_folders?.clickup_spaces?.name} | Folder: ${task.clickup_lists?.clickup_folders?.name} | List: ${task.clickup_lists?.name}`);
        });
      }
      
      const { data: projectTasks, error: projectError } = await supabase
        .from('clickup_tasks')
        .select(`
          id,
          task_id,
          name,
          text_content,
          description,
          status,
          custom_fields,
          url,
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
      
      logger.info(`[ContextLookup] Found ${projectTasks?.length || 0} project tasks`);
      if (projectTasks?.length > 0) {
        logger.info(`[ContextLookup] Sample task:`, {
          name: projectTasks[0].name,
          custom_fields: projectTasks[0].custom_fields
        });
      }

      if (projectError) {
        logger.error(`[ContextLookup] Erro ao buscar projetos:`, projectError);
      } else {
        // Filtrar tasks que têm o ID do grupo no custom_fields
        logger.info(`[ContextLookup] Procurando por grupo ID: ${searchValue}`);
        
        const matchingTask = projectTasks?.find(task => {
          if (!task.custom_fields || !Array.isArray(task.custom_fields)) {
            logger.debug(`[ContextLookup] Task ${task.name} não tem custom_fields válidos`);
            return false;
          }
          
          // Procurar por campo que contenha o ID do grupo
          const hasGroupId = task.custom_fields.some(field => {
            if (!field.value) return false;
            
            const value = field.value.toString().toLowerCase();
            const searchLower = searchValue.toLowerCase();
            const searchClean = searchValue.replace('@g.us', '').replace('@s.whatsapp.net', '').toLowerCase();
            
            logger.debug(`[ContextLookup] Checking field:`, {
              task: task.name,
              fieldName: field.name,
              fieldValue: value,
              searchValue: searchLower,
              searchClean: searchClean
            });
            
            const matches = value.includes(searchLower) || 
                          value.includes(searchClean) ||
                          searchLower.includes(value) ||
                          searchClean.includes(value);
            
            if (matches) {
              logger.info(`[ContextLookup] MATCH encontrado na task ${task.name}, campo ${field.name}: ${value}`);
            }
            
            return matches;
          });
          
          return hasGroupId;
        });

        if (matchingTask) {
          contextData = {
            type: 'projeto',
            id: matchingTask.task_id,
            name: matchingTask.name,
            description: matchingTask.description || matchingTask.text_content,
            status: matchingTask.status,
            url: matchingTask.url,
            space: matchingTask.clickup_lists?.clickup_folders?.clickup_spaces?.name,
            folder: matchingTask.clickup_lists?.clickup_folders?.name,
            list: matchingTask.clickup_lists?.name
          };
          logger.info(`[ContextLookup] Projeto encontrado:`, contextData);
        } else {
          logger.info(`[ContextLookup] Nenhum projeto encontrado para o grupo: ${searchValue}`);
        }
      }

    } else {
      // Cenário: CONVERSA DIRETA (Prospect)
      searchType = 'prospect';
      targetLocation = 'Comercial > Vendas > Social Selling';
      
      // Limpar número (remover caracteres especiais e sufixos)
      const cleanNumber = searchValue.replace(/[^0-9]/g, '');
      
      logger.info(`[ContextLookup] Detectado como CONVERSA DIRETA - Buscando prospect com número: ${cleanNumber}`);

      // Buscar nas tasks da lista "Social Selling" pelo campo "Número WhatsApp"
      logger.info(`[ContextLookup] Buscando tasks em Comercial > Vendas > Social Selling`);
      
      // Debug para prospects também
      const { data: allProspectTasks, error: allProspectError } = await supabase
        .from('clickup_tasks')
        .select(`
          name,
          custom_fields,
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
        .limit(10);

      logger.info(`[ContextLookup] DEBUG - Prospect tasks sample:`);
      allProspectTasks?.slice(0, 5).forEach((task, index) => {
        logger.info(`[ContextLookup] DEBUG - Prospect Task ${index + 1}: ${task.name} | Space: ${task.clickup_lists?.clickup_folders?.clickup_spaces?.name} | Folder: ${task.clickup_lists?.clickup_folders?.name} | List: ${task.clickup_lists?.name}`);
      });
      
      const { data: prospectTasks, error: prospectError } = await supabase
        .from('clickup_tasks')
        .select(`
          id,
          task_id,
          name,
          text_content,
          description,
          status,
          custom_fields,
          url,
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
      
      logger.info(`[ContextLookup] Found ${prospectTasks?.length || 0} prospect tasks`);
      if (prospectTasks?.length > 0) {
        logger.info(`[ContextLookup] Sample prospect task:`, {
          name: prospectTasks[0].name,
          custom_fields: prospectTasks[0].custom_fields
        });
      }

      if (prospectError) {
        logger.error(`[ContextLookup] Erro ao buscar prospects:`, prospectError);
      } else {
        // Filtrar tasks que têm o número do WhatsApp no custom_fields
        logger.info(`[ContextLookup] Procurando por número: ${cleanNumber}`);
        
        const matchingTask = prospectTasks?.find(task => {
          if (!task.custom_fields || !Array.isArray(task.custom_fields)) {
            logger.debug(`[ContextLookup] Task ${task.name} não tem custom_fields válidos`);
            return false;
          }
          
          // Procurar por campo que contenha o número
          const hasPhoneNumber = task.custom_fields.some(field => {
            if (!field.value) return false;
            
            const value = field.value.toString().replace(/[^0-9]/g, '');
            
            logger.debug(`[ContextLookup] Checking phone field:`, {
              task: task.name,
              fieldName: field.name,
              fieldValue: value,
              searchNumber: cleanNumber
            });
            
            const matches = value && cleanNumber && (
              value.includes(cleanNumber) || 
              cleanNumber.includes(value)
            );
            
            if (matches) {
              logger.info(`[ContextLookup] PHONE MATCH encontrado na task ${task.name}, campo ${field.name}: ${value}`);
            }
            
            return matches;
          });
          
          return hasPhoneNumber;
        });

        if (matchingTask) {
          contextData = {
            type: 'prospect',
            id: matchingTask.task_id,
            name: matchingTask.name,
            description: matchingTask.description || matchingTask.text_content,
            status: matchingTask.status,
            url: matchingTask.url,
            space: matchingTask.clickup_lists?.clickup_folders?.clickup_spaces?.name,
            folder: matchingTask.clickup_lists?.clickup_folders?.name,
            list: matchingTask.clickup_lists?.name
          };
          logger.info(`[ContextLookup] Prospect encontrado:`, contextData);
        } else {
          logger.info(`[ContextLookup] Nenhum prospect encontrado para o número: ${cleanNumber}`);
        }
      }
    }

    const response = {
      success: true,
      conversationId,
      isGroup,
      searchType,
      searchValue,
      targetLocation,
      contextData,
      message: contextData 
        ? `${contextData.type === 'projeto' ? 'Projeto' : 'Prospect'} encontrado com sucesso`
        : `Nenhum ${searchType} encontrado para este ${isGroup ? 'grupo' : 'contato'}`,
      debug: {
        spacesInDB: debugSpaces?.length || 0,
        listsInDB: debugLists?.length || 0,
        tasksInDB: debugTasks?.length || 0,
        sampleSpaces: debugSpaces?.map(s => s.name) || [],
        sampleLists: debugLists?.map(l => l.name) || []
      }
    };

    logger.info(`[ContextLookup] Resposta final:`, response);
    
    res.json(response);

  } catch (error) {
    logger.error(`[ContextLookup] Erro durante busca contextual:`, error);
    res.status(500).json({ 
      error: 'Erro interno durante busca contextual',
      details: error.message 
    });
  }
});

/**
 * Endpoint temporário para executar sincronização do ClickUp
 */
router.post('/sync-clickup', async (req, res) => {
  try {
    const { debugClickUpSync } = require('../../debug-clickup-sync');
    await debugClickUpSync();
    res.json({ success: true, message: 'Sincronização executada com sucesso' });
  } catch (error) {
    logger.error('Erro ao executar sincronização:', error);
    res.status(500).json({ error: 'Erro ao executar sincronização', details: error.message });
  }
});

module.exports = router;