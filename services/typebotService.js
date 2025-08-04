const axios = require('axios');

class TypebotService {
  constructor() {
    this.baseURL = process.env.TYPEBOT_URL;
    this.apiKey = process.env.TYPEBOT_API_KEY;
  }

  async startSession(phone, name) {
    try {
      const response = await axios.post(`${this.baseURL}/api/v1/sessions`, {
        phone,
        name,
        variables: {
          phone,
          name
        }
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('❌ Erro ao iniciar sessão no Typebot:', error);
      throw error;
    }
  }

  async sendMessage(sessionId, message) {
    try {
      const response = await axios.post(`${this.baseURL}/api/v1/sessions/${sessionId}/messages`, {
        message
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem para o Typebot:', error);
      throw error;
    }
  }

  async getBotResponse(sessionId) {
    try {
      const response = await axios.get(`${this.baseURL}/api/v1/sessions/${sessionId}/messages`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('❌ Erro ao obter resposta do Typebot:', error);
      throw error;
    }
  }
}

module.exports = new TypebotService(); 