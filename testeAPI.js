// testeAPI.js
require('dotenv').config();
const axios = require('axios');

const token = process.env.GESTAODS_TOKEN;
const cpf = '17831187685';

const urls = [
  `https://gestaods.com/api/paciente/${token}/${cpf}/`,
  `https://gestaods.com.br/api/paciente/${token}/${cpf}/`,
  `https://api.gestaods.com/api/paciente/${token}/${cpf}/`,
  `https://api.gestaods.com.br/api/paciente/${token}/${cpf}/`,
  `https://gestaods.com/api/dev-paciente/${token}/${cpf}/`,
  `https://gestaods.com.br/api/dev-paciente/${token}/${cpf}/`,
  `https://api.gestaods.com/api/dev-paciente/${token}/${cpf}/`,
  `https://api.gestaods.com.br/api/dev-paciente/${token}/${cpf}/`
];

async function testarURLs() {
  console.log(`🔑 Token: ${token}`);
  console.log(`🔍 CPF de teste: ${cpf}\n`);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`🧪 Testando URL ${i + 1}: ${url}`);
    
    try {
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ SUCESSO! Status: ${response.status}`);
      console.log(`📦 Dados:`, response.data);
      console.log('---\n');
      return url; // Retorna a primeira URL que funcionar
      
    } catch (error) {
      console.log(`❌ Erro ${error.response?.status || 'sem status'}: ${error.message}`);
      console.log('---\n');
    }
  }
  
  console.log('❌ Nenhuma URL funcionou!');
  return null;
}

testarURLs(); 