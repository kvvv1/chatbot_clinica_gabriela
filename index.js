const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const { flowController } = require('./services/flowController');
const zapiService = require('./services/zapiService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rota de teste
app.get('/', (req, res) => {
  res.json({
    message: 'WhatsApp Chatbot - Clínica Nassif',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Rota de webhook para receber mensagens do Z-API
app.post('/webhook', async (req, res) => {
  try {
    console.log('📨 Mensagem recebida:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;

    // 🔍 Coleta segura do telefone
    const userPhone = data.from || data.phone || data.phoneNumber;

    /**
     * 🛡️ Coleta segura da mensagem:
     * - Testa se vem em .text.message (formato Z-API), .message.text, .text, ou se data.message é string, ou se vem em .body
     * - Só usa .trim() se for realmente string
     */
    const userMessageRaw =
      data?.text?.message ||
      data?.message?.text ||
      data?.text ||
      (typeof data.message === 'string' ? data.message : null) ||
      data?.body;

    const userMessage = typeof userMessageRaw === 'string' ? userMessageRaw.trim() : '';

    console.log('🔍 Dados extraídos:', { userPhone, userMessage });

    // 🔒 Verifica se é mensagem do próprio bot (evita loop infinito)
    if (data.fromMe === true) {
      console.log('🤖 Ignorando mensagem do próprio bot');
      return res.status(200).send('Mensagem do bot ignorada');
    }

    if (!userPhone || !userMessage) {
      console.log('❌ Mensagem inválida:', { userPhone, userMessage });
      console.log('📦 Body completo:', req.body);
      return res.status(400).send('Mensagem inválida');
    }

    console.log(`🧠 Processando mensagem do usuário ${userPhone}: "${userMessage}"`);

    // Processa o fluxo da conversa usando o flowController
    const resposta = await flowController(userMessage, userPhone);

    console.log(`📤 Enviando resposta para ${userPhone}:`, resposta);

    // Envia a resposta via Z-API
    await zapiService.sendMessage(userPhone, resposta);

    res.status(200).send('Mensagem processada com sucesso');
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// Rota para testar o sistema
app.get('/test', async (req, res) => {
  try {
    const testMessage = 'oi';
    const testPhone = '5511999999999';
    
    console.log('🧪 Testando o sistema...');
    const resposta = await flowController(testMessage, testPhone);
    
    res.json({
      success: true,
      testMessage,
      testPhone,
      resposta,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para testar o webhook com dados simulados
app.post('/test-webhook', async (req, res) => {
  try {
    console.log('🧪 Testando webhook com dados simulados...');
    
    // Simula diferentes formatos de mensagem do Z-API
    const testData = {
      from: '5511999999999',
      message: {
        text: 'oi'
      }
    };
    
    console.log('📨 Dados de teste:', JSON.stringify(testData, null, 2));
    
    const userPhone = testData.from;
    const userMessage = testData.message?.text?.trim();

    console.log('🔍 Dados extraídos:', { userPhone, userMessage });
    
    if (!userPhone || !userMessage) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        data: { userPhone, userMessage }
      });
    }
    
    const resposta = await flowController(userMessage, userPhone);
    
    res.json({
      success: true,
      testData,
      userPhone,
      userMessage,
      resposta,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro no teste do webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota para verificar status do Z-API
app.get('/status', async (req, res) => {
  try {
    const status = await zapiService.getStatus();
    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao verificar status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  console.error('❌ Erro não tratado:', error);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: error.message
  });
});

// Inicialização do servidor
app.listen(PORT, () => {
  console.log('🚀 Servidor iniciado com sucesso!');
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`📨 Webhook: http://localhost:${PORT}/webhook`);
  console.log(`🧪 Teste: http://localhost:${PORT}/test`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
  console.log('✅ Sistema pronto para receber mensagens!');
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
  process.exit(1);
});
