const axios = require('axios');
require('dotenv').config();

const { ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, USE_INTERACTIVE, ZAPI_BUTTONS_PATH, ZAPI_LIST_PATH } = process.env;

function buildZapiUrl(path) {
  return `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/${path}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTyping(phone, durationMs = 2000) {
  try {
    const url = buildZapiUrl('typing');
    const payload = {
      phone,
      typing: true,
      duration: Math.max(1, Math.round(durationMs / 1000))
    };
    await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN
      }
    });
  } catch (error) {
    console.warn('[Z-API] Endpoint typing não disponível. Aplicando apenas delay.', error.response?.data || error.message);
  } finally {
    await wait(durationMs);
  }
}

async function sendMessage(phone, message) {
  try {
    // Formato correto da API Z-API
    const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;

    const payload = {
      phone: phone,
      message: message,
      // Exibe estado "Digitando" por ~2s antes de enviar (via Z-API)
      delayTyping: 2
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
    const response = await axios.get(url, {
      headers: {
        'Client-Token': ZAPI_CLIENT_TOKEN
      }
    });
    
    console.log('[Z-API] Status verificado');
    return response.data;
  } catch (error) {
    console.error('[Z-API] Erro ao verificar status:', error.response?.data || error.message);
    throw new Error('Falha ao verificar status do Z-API');
  }
}

async function sendButtonsMessage(phone, options) {
  // options: { text, footer?, buttons: [{ id, title }] }
  try {
    if (!USE_INTERACTIVE) throw new Error('Interactive disabled');

    const path = ZAPI_BUTTONS_PATH || 'send-buttons';
    const url = buildZapiUrl(path);
    const payload = {
      phone,
      message: options.text,
      buttons: (options.buttons || []).map((b) => ({ id: b.id, text: b.title })),
      footer: options.footer || undefined,
      // Tenta usar atraso nativo do Z-API (se suportado pelo endpoint)
      delayTyping: 2
    };

    console.log(`[Z-API] Enviando botões para: ${url}`);
    console.log(`[Z-API] Payload:`, payload);

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN
      }
    });
    return response.data;
  } catch (error) {
    console.warn('[Z-API] Falha ao enviar botões. Fallback para texto.', error.response?.data || error.message);
    // Fallback: envia texto com opções enumeradas
    const fallback = [
      options.text,
      '',
      ...options.buttons.map((b, idx) => `${idx + 1} - ${b.title}`)
    ].join('\n');
    return sendMessage(phone, fallback);
  }
}

async function sendListMessage(phone, options) {
  // options: { text, buttonText?, sections: [{ title, rows: [{ id, title, description? }] }] }
  try {
    if (!USE_INTERACTIVE) throw new Error('Interactive disabled');

    const path = ZAPI_LIST_PATH || 'send-list';
    const url = buildZapiUrl(path);
    const payload = {
      phone,
      message: options.text,
      buttonText: options.buttonText || 'Selecionar',
      sections: options.sections || [],
      // Tenta usar atraso nativo do Z-API (se suportado pelo endpoint)
      delayTyping: 2
    };

    console.log(`[Z-API] Enviando lista para: ${url}`);
    console.log(`[Z-API] Payload:`, JSON.stringify(payload));

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN
      }
    });
    return response.data;
  } catch (error) {
    console.warn('[Z-API] Falha ao enviar lista. Fallback para texto.', error.response?.data || error.message);
    // Fallback: envia texto com opções enumeradas
    const lines = [options.text, ''];
    const rows = (options.sections || []).flatMap((s) => s.rows || []);
    rows.forEach((row, idx) => lines.push(`${idx + 1} - ${row.title}${row.description ? ' — ' + row.description : ''}`));
    return sendMessage(phone, lines.join('\n'));
  }
}

module.exports = { sendMessage, getStatus, sendButtonsMessage, sendListMessage, sendTyping };