const axios = require('axios');
require('dotenv').config();

/**
 * Cadastra um novo paciente no sistema GestãoDS
 * @param {Object} paciente - Dados do paciente
 * @param {string} paciente.nome_completo - Nome completo do paciente
 * @param {string} paciente.cpf - CPF do paciente (apenas números)
 * @param {string} paciente.email - Email do paciente
 * @param {string} paciente.celular - Celular do paciente (apenas números)
 * @returns {Object} Resultado da operação
 */
async function cadastrarPacienteNoGestao(paciente) {
  try {
    console.log(`[API GestaODS] Tentando cadastrar paciente: ${paciente.nome_completo} (CPF: ${paciente.cpf})`);
    const token = process.env.GESTAODS_TOKEN;
    if (!token) {
      console.warn('[API GestaODS] GESTAODS_TOKEN não configurado no ambiente');
      return { sucesso: false, mensagem: 'Token de integração não configurado' };
    }

    const response = await axios.post('https://apidev.gestaods.com.br/api/paciente/cadastrar/', {
      nome_completo: paciente.nome_completo,
      cpf: paciente.cpf,
      email: paciente.email,
      celular: paciente.celular,
      token
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 segundos de timeout
    });

    console.log(`[API GestaODS] Paciente cadastrado com sucesso:`, response.data);
    
    if (response.status === 201) {
      return { sucesso: true };
    } else {
      return { sucesso: false, mensagem: 'Erro desconhecido' };
    }
  } catch (error) {
    console.log('[API GestaODS] Erro ao cadastrar paciente:', error.response?.data || error.message);
    return {
      sucesso: false,
      mensagem: error.response?.data?.message || 'Erro ao cadastrar paciente'
    };
  }
}

module.exports = {
  cadastrarPacienteNoGestao
}; 