const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const ClickUpService = require('../services/clickup/ClickUpService');
const SupabaseService = require('../services/supabase/SupabaseService');

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
    // Log do payload antes do upsert
    console.log('Payload para upsert:', {
      team_id: team.id,
      name: team.name,
      color: team.color,
      avatar: team.avatar,
      members: team.members,
      access_token: tokenData.access_token,
      updated_at: new Date().toISOString()
    });

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

    // Log do resultado do upsert
    console.log('Resultado do upsert:', { data, error });

    if (error) {
      return res.status(500).json({ error: 'Erro ao salvar workspace no banco', details: error.message });
    }

    res.json({ token: tokenData, user: userData, workspace: team, state });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao autenticar com ClickUp', details: err.message });
  }
});

module.exports = router; 