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
    // TODO: Processar o evento e atualizar/inserir dados no Supabase conforme o tipo
    console.log('[ClickUpWebhook] Evento recebido:', event.event, event);
    // Exemplo: se event.event === 'taskCreated', inserir/atualizar task no Supabase
    res.status(200).json({ received: true });
  } catch (err) {
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