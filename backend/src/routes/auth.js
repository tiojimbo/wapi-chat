const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const ClickUpService = require('../services/clickup/ClickUpService');
const SupabaseService = require('../services/supabase/SupabaseService');
const ClickUpSyncService = require('../services/clickup/ClickUpSyncService');
const axios = require('axios');

// Login (placeholder - será implementado com Supabase Auth)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // TODO: Implementar autenticação com Supabase
    logger.info(`Tentativa de login para: ${email}`);
    
    res.json({ 
      message: 'Login endpoint - será implementado com Supabase Auth',
      user: { email }
    });
  } catch (error) {
    logger.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro no login' });
  }
});

// Registro (placeholder - será implementado com Supabase Auth)
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
    }

    // TODO: Implementar registro com Supabase
    logger.info(`Tentativa de registro para: ${email}`);
    
    res.json({ 
      message: 'Registro endpoint - será implementado com Supabase Auth',
      user: { email, name }
    });
  } catch (error) {
    logger.error('Erro no registro:', error);
    res.status(500).json({ error: 'Erro no registro' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  try {
    // TODO: Implementar logout com Supabase
    logger.info('Logout realizado');
    res.json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    logger.error('Erro no logout:', error);
    res.status(500).json({ error: 'Erro no logout' });
  }
});

// Verificar status da autenticação
router.get('/me', (req, res) => {
  try {
    // TODO: Implementar verificação de autenticação
    res.json({ 
      message: 'Verificação de autenticação - será implementado com Supabase',
      authenticated: false 
    });
  } catch (error) {
    logger.error('Erro ao verificar autenticação:', error);
    res.status(500).json({ error: 'Erro ao verificar autenticação' });
  }
});

// Rota para iniciar OAuth2 com ClickUp
router.get('/clickup/login', (req, res) => {
  const state = req.query.state || '';
  const url = ClickUpService.getAuthUrl(state);
  res.redirect(url);
});

// Função para registrar webhook no ClickUp
async function registerClickUpWebhook(team_id, access_token) {
  const webhookUrl = process.env.CLICKUP_WEBHOOK_URL || 'https://wapi-chat.onrender.com/api/auth/clickup/webhook';
  const events = [
    'taskCreated', 'taskUpdated', 'taskDeleted',
    'listCreated', 'listUpdated', 'listDeleted',
    'folderCreated', 'folderUpdated', 'folderDeleted',
    'spaceCreated', 'spaceUpdated', 'spaceDeleted'
  ];
  const response = await axios.post(
    `https://api.clickup.com/api/v2/team/${team_id}/webhook`,
    {
      endpoint: webhookUrl,
      events,
      // Você pode adicionar um secret para validação extra se desejar
    },
    {
      headers: { Authorization: access_token }
    }
  );
  return response.data;
}

// Endpoint para receber webhooks do ClickUp
router.post('/clickup/webhook', async (req, res) => {
  try {
    const event = req.body;
    const supabase = require('../services/supabase/SupabaseService').getClient();
    console.log('[ClickUpWebhook] Evento recebido:', event.event, event);

    // Processamento automático para tasks, lists, folders, spaces
    if (event.event && event.history_items && event.history_items.length > 0) {
      const item = event.history_items[0];
      // TASKS
      if (event.event.startsWith('task')) {
        const task = event.task || item.task;
        if (event.event === 'taskCreated' || event.event === 'taskUpdated') {
          // Upsert task
          await supabase.from('clickup_tasks').upsert({
            task_id: task.id,
            list_id: task.list && task.list.id ? task.list.id : null,
            custom_id: task.custom_id,
            name: task.name,
            text_content: task.text_content,
            description: task.description,
            status: task.status,
            orderindex: task.orderindex,
            date_created: task.date_created ? new Date(Number(task.date_created)) : null,
            date_updated: task.date_updated ? new Date(Number(task.date_updated)) : null,
            date_closed: task.date_closed ? new Date(Number(task.date_closed)) : null,
            date_done: task.date_done ? new Date(Number(task.date_done)) : null,
            archived: task.archived,
            creator: task.creator,
            assignees: task.assignees,
            watchers: task.watchers,
            checklists: task.checklists,
            tags: task.tags,
            parent: task.parent,
            priority: task.priority,
            due_date: task.due_date ? new Date(Number(task.due_date)) : null,
            start_date: task.start_date ? new Date(Number(task.start_date)) : null,
            points: task.points,
            time_estimate: task.time_estimate,
            time_spent: task.time_spent,
            custom_fields: task.custom_fields,
            dependencies: task.dependencies,
            linked_tasks: task.linked_tasks,
            team_id: task.team_id,
            url: task.url,
            permission_level: task.permission_level,
            attachments: task.attachments,
            updated_at: new Date().toISOString()
          }, { onConflict: ['task_id'] });
        } else if (event.event === 'taskDeleted') {
          // Remover task
          await supabase.from('clickup_tasks').delete().eq('task_id', task.id);
        }
      }
      // LISTS
      if (event.event.startsWith('list')) {
        const list = event.list || item.list;
        if (event.event === 'listCreated' || event.event === 'listUpdated') {
          await supabase.from('clickup_lists').upsert({
            list_id: list.id,
            folder_id: list.folder && list.folder.id ? list.folder.id : null,
            space_id: list.space && list.space.id ? list.space.id : null,
            name: list.name,
            orderindex: list.orderindex,
            status: list.status,
            priority: list.priority,
            assignee: list.assignee,
            due_date_time: list.due_date_time,
            start_date_time: list.start_date_time,
            archived: list.archived,
            override_statuses: list.override_statuses,
            permission_level: list.permission_level,
            updated_at: new Date().toISOString()
          }, { onConflict: ['list_id'] });
        } else if (event.event === 'listDeleted') {
          await supabase.from('clickup_lists').delete().eq('list_id', list.id);
        }
      }
      // FOLDERS
      if (event.event.startsWith('folder')) {
        const folder = event.folder || item.folder;
        if (event.event === 'folderCreated' || event.event === 'folderUpdated') {
          await supabase.from('clickup_folders').upsert({
            folder_id: folder.id,
            space_id: folder.space && folder.space.id ? folder.space.id : null,
            name: folder.name,
            orderindex: folder.orderindex,
            override_statuses: folder.override_statuses,
            hidden: folder.hidden,
            task_count: folder.task_count,
            lists: folder.lists,
            updated_at: new Date().toISOString()
          }, { onConflict: ['folder_id'] });
        } else if (event.event === 'folderDeleted') {
          await supabase.from('clickup_folders').delete().eq('folder_id', folder.id);
        }
      }
      // SPACES
      if (event.event.startsWith('space')) {
        const space = event.space || item.space;
        if (event.event === 'spaceCreated' || event.event === 'spaceUpdated') {
          await supabase.from('clickup_spaces').upsert({
            space_id: space.id,
            workspace_id: space.team_id,
            name: space.name,
            color: space.color,
            private: space.private,
            avatar: space.avatar,
            admin_can_manage: space.admin_can_manage,
            multiple_assignees: space.multiple_assignees,
            features: space.features,
            archived: space.archived,
            updated_at: new Date().toISOString()
          }, { onConflict: ['space_id'] });
        } else if (event.event === 'spaceDeleted') {
          await supabase.from('clickup_spaces').delete().eq('space_id', space.id);
        }
      }
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[ClickUpWebhook] Erro ao processar evento:', err);
    res.status(500).json({ error: 'Erro ao processar webhook do ClickUp', details: err.message });
  }
});

// Callback do ClickUp OAuth2
router.get('/clickup/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Código não informado pelo ClickUp.' });
  }
  try {
    const tokenData = await ClickUpService.getToken(code);
    const userData = await ClickUpService.getUser(tokenData.access_token);

    // Buscar os workspaces (teams) do usuário autenticado
    const teamsResponse = await require('axios').get('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: tokenData.access_token }
    });
    const team = teamsResponse.data.teams[0]; // Seleciona o primeiro workspace (ajuste conforme sua lógica)

    // Upsert no Supabase
    const supabase = SupabaseService.getClient();
    const { data, error } = await supabase
      .from('clickup_workspaces')
      .upsert({
        team_id: team.id,
        name: team.name,
        color: team.color,
        avatar: team.avatar,
        members: team.members,
        access_token: tokenData.access_token,
        updated_at: new Date().toISOString()
      }, { onConflict: ['team_id'] });

    if (error) {
      return res.status(500).json({ error: 'Erro ao salvar workspace no banco', details: error.message });
    }

    // Sincronizar todos os dados do ClickUp automaticamente após login
    console.log('[DEBUG] Iniciando sincronização do ClickUp...');
    await ClickUpSyncService.syncAllFromWorkspace(team.id);
    console.log('[DEBUG] Sincronização do ClickUp finalizada.');

    // Registrar webhook automaticamente
    try {
      const webhookResult = await registerClickUpWebhook(team.id, tokenData.access_token);
      console.log('[ClickUpWebhook] Webhook registrado:', webhookResult);
    } catch (webhookErr) {
      console.error('[ClickUpWebhook] Erro ao registrar webhook:', webhookErr.message);
    }

    res.json({ token: tokenData, user: userData, workspace: team, state });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao autenticar com ClickUp', details: err.message });
  }
});

// Sincronizar dados do ClickUp (spaces, folders, lists, tasks)
router.get('/clickup/sync', async (req, res) => {
  try {
    logger.info('[SYNC] Iniciando sincronização do ClickUp...');
    // Buscar o primeiro workspace salvo (ajuste para múltiplos workspaces se necessário)
    const supabase = require('../services/supabase/SupabaseService').getClient();
    const { data: workspace, error } = await supabase
      .from('clickup_workspaces')
      .select('team_id')
      .limit(1)
      .single();
    
    logger.info('[SYNC] Workspace query result:', { workspace, error });
    
    if (error || !workspace) {
      logger.error('[SYNC] Workspace não encontrado:', error);
      return res.status(404).json({ error: 'Workspace do ClickUp não encontrado' });
    }
    
    logger.info(`[SYNC] Iniciando sincronização para team_id: ${workspace.team_id}`);
    const result = await ClickUpSyncService.syncAllFromWorkspace(workspace.team_id);
    logger.info('[SYNC] Resultado da sincronização:', result);
    
    res.json({ success: true, message: 'Sincronização concluída!' });
  } catch (err) {
    logger.error('[SYNC] Erro ao sincronizar dados do ClickUp:', err);
    res.status(500).json({ error: 'Erro ao sincronizar dados do ClickUp', details: err.message });
  }
});

module.exports = router; 