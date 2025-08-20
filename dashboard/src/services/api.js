import axios from 'axios';

// Configuração base da API
const apiBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
  ? import.meta.env.VITE_API_BASE_URL
  : 'http://localhost:3000/api';

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Adiciona x-api-key se existir variável Vite
api.interceptors.request.use((config) => {
  // eslint-disable-next-line no-undef
  const apiKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_DASHBOARD_API_KEY) ? import.meta.env.VITE_DASHBOARD_API_KEY : null;
  if (apiKey && config.url && config.url.startsWith('/painel')) {
    config.headers['x-api-key'] = apiKey;
  }
  return config;
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

  reagendarParaEspera: async (id, motivo) => {
    try {
      const response = await api.post(`/painel/reagendamentos/${id}/espera`, { motivo });
      return response.data;
    } catch (error) {
      console.error('Erro ao enviar para lista de espera:', error);
      throw error;
    }
  },

  reagendarCancelarPedido: async (id, motivo) => {
    try {
      const response = await api.post(`/painel/reagendamentos/${id}/cancelar`, { motivo });
      return response.data;
    } catch (error) {
      console.error('Erro ao cancelar pedido de reagendamento:', error);
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
  },

  finalizarSolicitacaoSecretaria: async (id) => {
    try {
      const response = await api.post(`/painel/secretaria/${id}/finalizar`);
      return response.data;
    } catch (error) {
      console.error('Erro ao finalizar atendimento:', error);
      throw error;
    }
  },

  updateWaitlistPriority: async (id, prioridade) => {
    try {
      const response = await api.post(`/painel/espera/${id}/prioridade`, { prioridade });
      return response.data;
    } catch (error) {
      console.error('Erro ao alterar prioridade:', error);
      throw error;
    }
  },

  removeWaitlist: async (id) => {
    try {
      const response = await api.delete(`/painel/espera/${id}`);
      return response.data;
    } catch (error) {
      console.error('Erro ao remover da lista de espera:', error);
      throw error;
    }
  },

  // Notificações
  getNotificacoes: async () => {
    try {
      const response = await api.get('/painel/notificacoes');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar notificações:', error);
      throw error;
    }
  },

  marcarNotificacaoLida: async (id) => {
    try {
      const response = await api.post(`/painel/notificacoes/${id}/lida`);
      return response.data;
    } catch (error) {
      console.error('Erro ao marcar notificação como lida:', error);
      throw error;
    }
  },

  marcarTodasLidas: async () => {
    try {
      const response = await api.post('/painel/notificacoes/ler-todas');
      return response.data;
    } catch (error) {
      console.error('Erro ao marcar todas como lidas:', error);
      throw error;
    }
  },

  limparNotificacoes: async () => {
    try {
      const response = await api.delete('/painel/notificacoes');
      return response.data;
    } catch (error) {
      console.error('Erro ao limpar notificações:', error);
      throw error;
    }
  }
};

export default api; 