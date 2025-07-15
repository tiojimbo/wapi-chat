const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const ClickUpService = require('../services/clickup/ClickUpService');

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
    // Aqui você pode salvar o token no banco, sessão, etc.
    res.json({ token: tokenData, user: userData, state });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao autenticar com ClickUp', details: err.message });
  }
});

module.exports = router; 