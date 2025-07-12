const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const logger = require('./utils/logger');
const whatsappRoutes = require('./routes/whatsapp');
const authRoutes = require('./routes/auth');
const setupRoutes = require('./routes/setup');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware de segurança e otimização
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Rotas
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/setup', setupRoutes);

// Rota de teste para emitir notificações via Socket.io
app.post('/api/notify', (req, res) => {
  const { roomId, message } = req.body;
  if (!roomId || !message) {
    return res.status(400).json({ error: 'roomId e message são obrigatórios' });
  }
  const io = req.app.get('io');
  io.to(roomId).emit('notification', { message });
  logger.info(`Notificação enviada para room ${roomId}: ${message}`);
  res.json({ success: true });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info(`Cliente conectado: ${socket.id}`);

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    logger.info(`Cliente ${socket.id} entrou na sessão ${sessionId}`);
  });

  socket.on('leave-session', (sessionId) => {
    socket.leave(sessionId);
    logger.info(`Cliente ${socket.id} saiu da sessão ${sessionId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Cliente desconectado: ${socket.id}`);
  });
});

// Disponibilizar io para uso em outros módulos
app.set('io', io);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Erro não tratado:', err);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo deu errado'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  logger.info(`🚀 Servidor rodando na porta ${PORT}`);
  logger.info(`📱 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
  logger.info(`🔧 Setup API: http://localhost:${PORT}/api/setup/status`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, fechando servidor...');
  server.close(() => {
    logger.info('Servidor fechado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT recebido, fechando servidor...');
  server.close(() => {
    logger.info('Servidor fechado');
    process.exit(0);
  });
});

module.exports = { app, server, io }; 