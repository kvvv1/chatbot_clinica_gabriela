// teste-envio.js
require('dotenv').config();
const zapiService = require('./services/zapiService');

async function testarEnvio() {
  try {
    console.log('🧪 Testando envio de mensagem...');
    
    const phone = '553182655571'; // Número que está testando
    const message = '🧪 Teste de envio - Sistema funcionando! ✅';
    
    console.log(`📤 Enviando mensagem para ${phone}...`);
    
    const resultado = await zapiService.sendMessage(phone, message);
    
    console.log('✅ Mensagem enviada com sucesso!');
    console.log('📦 Resultado:', resultado);
    
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error.message);
  }
}

testarEnvio(); 