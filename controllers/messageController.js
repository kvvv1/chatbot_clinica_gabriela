const flowController = require('../services/flowController');
const zapiService = require('../services/zapiService');
const memoryStore = require('../utils/memoryStore');

exports.handleIncomingMessage = async (req, res) => {
  try {
    const data = req.body;

    const userPhone = data.from;
    const userMessage = data.message?.text?.trim();

    if (!userPhone || !userMessage) {
      return res.status(400).send('Mensagem inválida');
    }

    // Obtém ou cria o estado do usuário
    let userState = memoryStore.getSession(userPhone);
    if (!userState) {
      userState = { estado: 'inicio', dados: {} };
      memoryStore.setSession(userPhone, userState);
    }

    // Processa o fluxo da conversa
    const { novaMensagem, novoEstado, dadosAtualizados } = await flowController.processar(userMessage, userState);

    // Atualiza memória
    memoryStore.setSession(userPhone, {
      estado: novoEstado,
      dados: dadosAtualizados
    });

    // Envia mensagem ao usuário
    await zapiService.sendMessage(userPhone, novaMensagem);

    res.status(200).send('Mensagem processada');
  } catch (err) {
    console.error('[Erro na controller]', err);
    res.status(500).send('Erro no processamento da mensagem');
  }
}; 