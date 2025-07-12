const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

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

module.exports = router; 