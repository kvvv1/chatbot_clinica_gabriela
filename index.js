const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { flowController } = require('./services/flowController');
const zapiService = require('./services/zapiService');
const { supabase } = require('./services/supabaseClient');
const LOG_MESSAGES = process.env.LOG_MESSAGES || 'key';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// CORS: permite configurar via env para produção
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins, methods: ['GET','POST','PUT','DELETE','OPTIONS'] }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rate limit para o webhook (proteção básica)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 120,            // 120 req/min por IP
  standardHeaders: true,
  legacyHeaders: false
});

// Rota de teste
app.get('/', (req, res) => {
  res.json({
    message: 'WhatsApp Chatbot - Clínica Nassif',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// ------------------------------
// API da Dashboard (/api/painel)
// ------------------------------
const painelRouter = require('./routes/painel');
app.use('/api/painel', painelRouter);

// In-memory anti-flood controls
const userLocks = new Map(); // phone -> boolean (processing lock)
const userQueues = new Map(); // phone -> array of pending messages (strings)
const debounceTimers = new Map(); // phone -> timeout handle
const lastMessageIds = new Map(); // phone -> Set of recent ids/hashes
const DEBOUNCE_MS = 1200; // 1.2s debounce window per user
const DEDUPE_TTL_MS = 5 * 60 * 1000; // 5 min

function getRecentSet(phone) {
  if (!lastMessageIds.has(phone)) {
    lastMessageIds.set(phone, new Map()); // id -> timestamp
  }
  return lastMessageIds.get(phone);
}

function sweepOldIds(phone) {
  const map = getRecentSet(phone);
  const now = Date.now();
  for (const [id, ts] of map.entries()) {
    if (now - ts > DEDUPE_TTL_MS) map.delete(id);
  }
}

function simpleHash(s) {
  try {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return String(h >>> 0);
  } catch { return String(Math.random()); }
}

// Rota de webhook para receber mensagens do Z-API
app.post('/webhook', webhookLimiter, async (req, res) => {
  try {
    console.log('📨 Mensagem recebida:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;

    // 🔍 Coleta segura do telefone
    const userPhoneRaw = data.from || data.phone || data.phoneNumber;
    const userPhone = userPhoneRaw ? String(userPhoneRaw).replace(/\D/g, '') : undefined;

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

    // Tenta extrair o nome exibido do WhatsApp (Z-API geralmente envia em contact.name, pushName ou senderName)
    const displayName =
      data?.contact?.name ||
      data?.pushName ||
      data?.senderName ||
      data?.notifyName ||
      data?.profile?.name ||
      undefined;

    console.log('🔍 Dados extraídos:', { userPhone, userMessage });
    // Log entrada (somente se habilitado)
    if (LOG_MESSAGES === 'all') {
      try {
        if (supabase && userPhone && userMessage) {
          await supabase.from('messages').insert({ phone: userPhone, direction: 'in', content: userMessage });
        }
      } catch (e) {
        console.warn('[Supabase] Falha ao logar mensagem de entrada:', e.message);
      }
    }

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

    // Se houver atendimento humano pendente ou em andamento, não responder para evitar conflito
    try {
      if (supabase && userPhone) {
        const { data: tickets, error: ticketsErr } = await supabase
          .from('secretary_tickets')
          .select('status')
          .eq('phone', userPhone)
          .in('status', ['pendente', 'em_atendimento'])
          .order('created_at', { ascending: false })
          .limit(1);
        if (ticketsErr) {
          console.warn('[Supabase] Falha ao consultar tickets para silenciar bot:', ticketsErr.message);
        }
        if (Array.isArray(tickets) && tickets.length > 0) {
          console.log('🧑‍💼 Atendimento humano ativo/pendente. Bot silenciado para este telefone.');
          return res.status(200).send('Aguardando atendimento humano');
        }
      }
    } catch (e) {
      console.warn('[Silence-Check] Erro ao verificar atendimento humano:', e.message);
    }

    // Idempotência: usa id do provedor se disponível, senão hash conteúdo+timestamp aproximado
    const providerId = data?.id || data?.messageId || data?.key?.id;
    const dedupeKey = providerId ? String(providerId) : `${userPhone}:${simpleHash(userMessage)}:${data?.timestamp || data?.t || ''}`;
    const recent = getRecentSet(userPhone);
    sweepOldIds(userPhone);
    if (recent.has(dedupeKey)) {
      console.log('🛑 Duplicata detectada. Ignorando processamento.', { dedupeKey });
      return res.status(200).send('ok');
    }
    recent.set(dedupeKey, Date.now());

    // Injeta nome no contexto global (best effort)
    try {
      if (displayName) {
        const { setContext } = require('./services/flowController');
        setContext(userPhone, { waName: displayName });
      }
    } catch {}

    // Enfileira a mensagem e aplica debounce por usuário
    if (!userQueues.has(userPhone)) userQueues.set(userPhone, []);
    userQueues.get(userPhone).push(userMessage);

    // Limpa e reprograma o debounce
    if (debounceTimers.has(userPhone)) clearTimeout(debounceTimers.get(userPhone));
    debounceTimers.set(userPhone, setTimeout(async () => {
      // Captura todas as mensagens acumuladas e mantém somente a última para processar
      const queue = userQueues.get(userPhone) || [];
      userQueues.set(userPhone, []);
      const latestMessage = queue.length > 0 ? queue[queue.length - 1] : userMessage;

      // Lock por usuário para evitar corrida entre callbacks
      if (userLocks.get(userPhone)) {
        // Se já estiver processando, recoloca a última e agenda novo debounce curto
        userQueues.get(userPhone).push(latestMessage);
        debounceTimers.set(userPhone, setTimeout(() => {}, DEBOUNCE_MS));
        return;
      }

      userLocks.set(userPhone, true);
      try {
        const resposta = await flowController(latestMessage, userPhone);
        const respostas = Array.isArray(resposta) ? resposta.filter(Boolean) : [resposta];
        if (respostas.length === 0) {
          console.log('🤫 Fluxo retornou vazio. Nenhuma resposta será enviada.');
        } else {
          for (const outMsg of respostas) {
            console.log(`📤 Enviando resposta para ${userPhone}:`, outMsg);
            await zapiService.sendMessage(userPhone, outMsg);
            try {
              if (supabase && userPhone && outMsg) {
                await supabase.from('messages').insert({ phone: userPhone, direction: 'out', content: outMsg });
              }
            } catch (e) {
              console.warn('[Supabase] Falha ao logar mensagem de saída:', e.message);
            }
          }
        }
      } catch (err) {
        console.error('❌ Erro no processamento debounced:', err);
      } finally {
        userLocks.set(userPhone, false);
      }
    }, DEBOUNCE_MS));

    // Respondemos imediatamente para evitar retry do provedor
    return res.status(200).send('ok');
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return res.status(500).send('Erro interno do servidor');
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
