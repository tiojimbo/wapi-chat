const express = require('express');
const router = express.Router();
const SupabaseService = require('../services/supabase/SupabaseService');
const logger = require('../utils/logger');

// Rota para testar conexão com Supabase
router.get('/test-connection', async (req, res) => {
  try {
    const result = await SupabaseService.testConnection();
    res.json(result);
  } catch (error) {
    logger.error('Erro ao testar conexão:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao testar conexão com Supabase' 
    });
  }
});

// Rota para listar tabelas existentes
router.get('/tables', async (req, res) => {
  try {
    const tables = await SupabaseService.getExistingTables();
    res.json({ 
      success: true, 
      tables,
      count: tables.length 
    });
  } catch (error) {
    logger.error('Erro ao listar tabelas:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao listar tabelas' 
    });
  }
});

// Rota para verificar status do setup
router.get('/status', async (req, res) => {
  try {
    const connection = await SupabaseService.testConnection();
    const tables = await SupabaseService.getExistingTables();
    res.json({
      success: true,
      connection: connection.success,
      tables,
      total: tables.length
    });
  } catch (error) {
    logger.error('Erro ao verificar status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao verificar status do setup' 
    });
  }
});

module.exports = router; 