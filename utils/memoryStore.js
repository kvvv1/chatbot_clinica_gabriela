// Exemplo simples: substitua por Redis ou persistência real quando possível
const store = new Map();

module.exports = {
  set: async (key, value) => {
    store.set(key, JSON.stringify(value));
  },
  get: async (key) => {
    const v = store.get(key);
    return v ? JSON.parse(v) : null;
  },
  // Mantém compatibilidade com funções existentes
  getSession: (userPhone) => {
    return store.get(`session:${userPhone}`);
  },
  setSession: (userPhone, sessionId) => {
    store.set(`session:${userPhone}`, JSON.stringify(sessionId));
  },
  clearSession: (userPhone) => {
    store.delete(`session:${userPhone}`);
  }
}; 