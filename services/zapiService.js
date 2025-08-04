const axios = require('axios');
require('dotenv').config();

const { ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;

async function sendMessage(phone, message) {
  try {
    // Formato correto da API Z-API
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;

    const payload = {
      phone: phone,
      message: message
    };

    console.log(`[Z-API] Enviando para: ${url}`);
    console.log(`[Z-API] Payload:`, payload);

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN
      }
    });

    console.log(`[Z-API] Mensagem enviada para ${phone}`);
    console.log(`[Z-API] Resposta:`, response.data);
    return response.data;
  } catch (error) {
    console.error('[Z-API] Erro ao enviar mensagem:', error.response?.data || error.message);
    console.error('[Z-API] Status:', error.response?.status);
    throw new Error('Falha ao enviar mensagem pelo WhatsApp');
  }
}

async function getStatus() {
  try {
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/status`;
    
    const response = await axios.get(url);
    
    console.log('[Z-API] Status verificado');
    return response.data;
  } catch (error) {
    console.error('[Z-API] Erro ao verificar status:', error.response?.data || error.message);
    throw new Error('Falha ao verificar status do Z-API');
  }
}

module.exports = { sendMessage, getStatus }; 