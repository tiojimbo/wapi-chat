
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Servir arquivos de mídia locais
router.get('/:sessionId/:filename', (req, res) => {
  const { sessionId, filename } = req.params;
  const filePath = path.join(__dirname, '../../sessions', sessionId, 'media', filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }
  
  // Definir Content-Type baseado na extensão
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf'
  };
  
  const contentType = contentTypes[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  
  // Servir arquivo
  res.sendFile(filePath);
});

module.exports = router;
