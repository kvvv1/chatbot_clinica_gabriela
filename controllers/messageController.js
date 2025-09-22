const { flowController } = require('../services/flowController');
const zapiService = require('../services/zapiService');

exports.handleIncomingMessage = async (req, res) => {
  try {
    const data = req.body;

    const userPhone = data.from;
    const userMessage = data.message?.text?.trim();

    if (!userPhone || !userMessage) {
      return res.status(400).send('Mensagem inválida');
    }

    // Processa o fluxo da conversa usando o flowController
    const resposta = await flowController(userMessage, userPhone);

    // Normaliza e envia (suporta múltiplas mensagens)
    const respostas = Array.isArray(resposta) ? resposta.filter(Boolean) : [resposta];
    for (const outMsg of respostas) {
      await zapiService.sendMessage(userPhone, outMsg);
    }

    res.status(200).send('Mensagem processada');
  } catch (err) {
    console.error('[Erro na controller]', err);
    res.status(500).send('Erro no processamento da mensagem');
  }
}; 