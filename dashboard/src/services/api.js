import axios from 'axios';

// Configuração base da API
const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para tratamento de erros
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Erro na API:', error);
    return Promise.reject(error);
  }
);

// Serviços da Dashboard
export const dashboardService = {
  // Estatísticas gerais
  getEstatisticas: async () => {
    try {
      const response = await api.get('/painel/estatisticas');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      throw error;
    }
  },

  // Agendamentos
  getAgendamentos: async () => {
    try {
      const response = await api.get('/painel/agendamentos');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
      throw error;
    }
  },

  // Reagendamentos
  getReagendamentos: async () => {
    try {
      const response = await api.get('/painel/reagendamentos');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar reagendamentos:', error);
      throw error;
    }
  },

  // Cancelamentos
  getCancelamentos: async () => {
    try {
      const response = await api.get('/painel/cancelamentos');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar cancelamentos:', error);
      throw error;
    }
  },

  // Lista de espera
  getListaEspera: async () => {
    try {
      const response = await api.get('/painel/espera');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar lista de espera:', error);
      throw error;
    }
  },

  // Solicitações para secretária
  getSecretaria: async () => {
    try {
      const response = await api.get('/painel/secretaria');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar solicitações da secretária:', error);
      throw error;
    }
  },

  // Pacientes cadastrados
  getPacientes: async () => {
    try {
      const response = await api.get('/painel/pacientes');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar pacientes:', error);
      throw error;
    }
  },

  // Ações
  aprovarAgendamento: async (id) => {
    try {
      const response = await api.post(`/painel/agendamentos/${id}/aprovar`);
      return response.data;
    } catch (error) {
      console.error('Erro ao aprovar agendamento:', error);
      throw error;
    }
  },

  rejeitarAgendamento: async (id, motivo) => {
    try {
      const response = await api.post(`/painel/agendamentos/${id}/rejeitar`, { motivo });
      return response.data;
    } catch (error) {
      console.error('Erro ao rejeitar agendamento:', error);
      throw error;
    }
  },

  aprovarReagendamento: async (id, novaData) => {
    try {
      const response = await api.post(`/painel/reagendamentos/${id}/aprovar`, { novaData });
      return response.data;
    } catch (error) {
      console.error('Erro ao aprovar reagendamento:', error);
      throw error;
    }
  },

  aprovarCancelamento: async (id) => {
    try {
      const response = await api.post(`/painel/cancelamentos/${id}/aprovar`);
      return response.data;
    } catch (error) {
      console.error('Erro ao aprovar cancelamento:', error);
      throw error;
    }
  },

  iniciarAtendimentoManual: async (telefone) => {
    try {
      const response = await api.post('/painel/secretaria/atender', { telefone });
      return response.data;
    } catch (error) {
      console.error('Erro ao iniciar atendimento manual:', error);
      throw error;
    }
  }
};

export default api; 