const memoryStore = require('../utils/memoryStore');
const { supabase } = require('./supabaseClient');
const axios = require('axios');
const moment = require('moment');
const dayjs = require('dayjs');
const zapiService = require('./zapiService');
const { buscarPacientePorCPF, buscarDadosDetalhadosPaciente } = require('../utils/buscarPaciente');
const gestaodsService = require('./gestaodsService');
const { cadastrarPacienteNoGestao } = require('./apiGestaoService');
const { isValidCPF, formatCPF } = require('../utils/validations');

const USE_INTERACTIVE = process.env.USE_INTERACTIVE === '1' || process.env.USE_INTERACTIVE === 'true';

function buildMainMenuList(displayName) {
  const header = `${obterSaudacao(displayName)}\n\nSou seu assistente virtual.`;
  return {
    type: 'list',
    text: `${header}\n\nEscolha uma opção:`,
    buttonText: 'Abrir menu',
    sections: [
      {
        title: 'Opções disponíveis',
        rows: [
          { id: 'MENU_1', title: 'Agendar consulta' },
          { id: 'MENU_2', title: 'Ver meus agendamentos' },
          { id: 'MENU_3', title: 'Lista de espera' },
          { id: 'MENU_4', title: 'Falar com secretária' },
          { id: 'MENU_0', title: 'Sair' }
        ]
      }
    ]
  };
}

function buildActionButtons(prefixText) {
  return {
    type: 'buttons',
    text: `${prefixText}\n\nEscolha uma opção:`,
    buttons: [
      { id: 'ACT_REAGENDAR', title: 'Reagendar' },
      { id: 'ACT_CANCELAR', title: 'Cancelar' },
      { id: 'ACT_VOLTAR', title: 'Voltar' }
    ]
  };
}

// ⏰ Configuração de inatividade fixa (em minutos)
const INACTIVITY_MINUTES = 60;

// ⏳ Encerramento automático após resposta sem agendamentos (em minutos)
// Por padrão, usa o mesmo tempo da inatividade global (1h), podendo ser sobrescrito por env
const AUTO_CLOSE_MINUTES = Number(process.env.AUTO_CLOSE_MINUTES || INACTIVITY_MINUTES || 60);
const AUTO_CLOSE_MS = Math.max(1, AUTO_CLOSE_MINUTES) * 60 * 1000;

// Controla timers de encerramento por usuário
const autoCloseTimers = new Map(); // phone -> Timeout

function clearAutoClose(phone) {
  const t = autoCloseTimers.get(phone);
  if (t) {
    clearTimeout(t);
    autoCloseTimers.delete(phone);
  }
}

function scheduleAutoClose(phone, delayMs) {
  try {
    clearAutoClose(phone);
    const handle = setTimeout(async () => {
      try {
        setState(phone, 'inicio');
        setContext(phone, {});
        await zapiService.sendMessage(
          phone,
          "👋 Atendimento encerrado automaticamente. Obrigado pelo contato! Digite *'oi'* para começar novamente."
        );
      } catch (e) {
        console.warn('[AutoClose] Falha ao enviar mensagem final:', e?.message || e);
      } finally {
        clearAutoClose(phone);
      }
    }, delayMs);
    autoCloseTimers.set(phone, handle);
  } catch {}
}

// ✅ Funções auxiliares para gerenciamento de estado e contexto
async function salvarEstado(userPhone, estado) {
  try {
    await memoryStore.set(`state:${userPhone}`, estado);
    console.log(`🔄 Estado salvo para ${userPhone}: ${estado}`);
  } catch (error) {
    console.error(`❌ Erro ao salvar estado para ${userPhone}:`, error);
  }
}

async function recuperarEstado(userPhone) {
  try {
    const estado = await memoryStore.get(`state:${userPhone}`);
    return estado || 'inicio';
  } catch (error) {
    console.error(`❌ Erro ao recuperar estado para ${userPhone}:`, error);
    return 'inicio';
  }
}

async function salvarContexto(userPhone, contexto) {
  try {
    await memoryStore.set(`context:${userPhone}`, contexto);
    console.log(`💾 Contexto salvo para ${userPhone}:`, JSON.stringify(contexto, null, 2));
  } catch (error) {
    console.error(`❌ Erro ao salvar contexto para ${userPhone}:`, error);
  }
}

async function recuperarContexto(userPhone) {
  try {
    const contexto = await memoryStore.get(`context:${userPhone}`);
    return contexto || {};
  } catch (error) {
    console.error(`❌ Erro ao recuperar contexto para ${userPhone}:`, error);
    return {};
  }
}

// ✅ Funções auxiliares para formatação de data
function formatarDataHora(dataString, horaString) {
  const [dia, mes, ano] = dataString.split('/');
  return `${ano}-${mes}-${dia} ${horaString}`;
}

// ==============================
// Supabase helpers (no-op se off)
// ==============================
async function persistSessionToSupabase(phone) {
  try {
    if (!supabase) return;
    const state = getState(phone);
    const context = getContext(phone);
    await supabase.from('sessions').upsert({ phone, state, context, updated_at: new Date().toISOString() }, { onConflict: 'phone' });
  } catch (error) {
    console.error('[Supabase] persistSession erro:', error.message);
  }
}

async function logMessageToSupabase(phone, direction, content) {
  try {
    if (!supabase) return;
    const state = getState(phone);
    const context = getContext(phone);
    await supabase.from('messages').insert({ phone, direction, content, state, context });
  } catch (error) {
    console.error('[Supabase] logMessage erro:', error.message);
  }
}

async function upsertPatient({ cpf, name, phone, email }) {
  try {
    if (!supabase || !cpf) return;
    await supabase.from('patients').upsert({ cpf, name, phone, email });
  } catch (error) {
    console.error('[Supabase] upsertPatient erro:', error.message);
  }
}

async function createWaitlistEntry({ cpf, name, phone, email, motivo, prioridade }) {
  try {
    if (!supabase) return;
    await supabase.from('waitlist').insert({ cpf: cpf || null, name: name || null, phone, email: email || null, motivo: motivo || null, prioridade: prioridade || 'media' });
  } catch (error) {
    console.error('[Supabase] createWaitlistEntry erro:', error.message);
  }
}

async function createSecretaryTicket({ phone, motivo }) {
  try {
    if (!supabase) return;
    await supabase.from('secretary_tickets').insert({ phone, motivo: motivo || 'Atendimento manual solicitado', status: 'pendente' });
  } catch (error) {
    console.error('[Supabase] createSecretaryTicket erro:', error.message);
  }
}

async function createNotification({ type, title, message, priority }) {
  try {
    if (!supabase) return;
    await supabase.from('notifications').insert({ type, title, message, priority: priority || 'normal' });
  } catch (error) {
    console.error('[Supabase] createNotification erro:', error.message);
  }
}

async function insertAppointmentRequest({ cpf, phone, requested_date, requested_time, tipo, status, motivo }) {
  try {
    if (!supabase) {
      console.warn('[Supabase] Cliente não configurado. Dados não serão persistidos.');
      return;
    }
    
    if (!cpf) {
      console.warn('[Supabase] CPF não informado para agendamento.');
      return;
    }
    
    console.log(`[Supabase] Inserindo agendamento: CPF ${cpf}, Data ${requested_date}, Hora ${requested_time}`);
    
    const { data, error } = await supabase.from('appointment_requests').insert({
      cpf,
      phone,
      requested_date,
      requested_time,
      tipo,
              status: status || 'pending',
      motivo: motivo || null
    });
    
    if (error) {
      throw error;
    }
    
    console.log(`✅ Agendamento inserido com sucesso na dashboard. ID: ${data?.[0]?.id || 'N/A'}`);
    return data;
  } catch (error) {
    console.error('[Supabase] insertAppointmentRequest erro:', error.message);
    console.error('[Supabase] Detalhes do erro:', error);
    throw error; // Re-lança o erro para tratamento superior
  }
}

async function insertRescheduleRequest({ phone, current_datetime, requested_date, requested_time, token_agendamento, status }) {
  try {
    if (!supabase) return;
    await supabase.from('reschedule_requests').insert({
      phone,
      current_datetime: current_datetime || null,
      requested_date: requested_date || null,
      requested_time: requested_time || null,
      token_agendamento: token_agendamento || null,
      status: status || 'pending'
    });
  } catch (error) {
    console.error('[Supabase] insertRescheduleRequest erro:', error.message);
  }
}

async function insertCancelRequest({ phone, agendamento_token, motivo, status }) {
  try {
    if (!supabase) return;
    await supabase.from('cancel_requests').insert({
      phone,
      agendamento_token: agendamento_token || null,
      motivo: motivo || null,
      status: status || 'pending'
    });
  } catch (error) {
    console.error('[Supabase] insertCancelRequest erro:', error.message);
  }
}

// 🔢 Conversão de números para emojis (1️⃣, 2️⃣, ...)
function numeroParaEmoji(numero) {
  const mapa = {
    0: '0️⃣', 1: '1️⃣', 2: '2️⃣', 3: '3️⃣', 4: '4️⃣', 5: '5️⃣',
    6: '6️⃣', 7: '7️⃣', 8: '8️⃣', 9: '9️⃣', 10: '🔟'
  };
  if (mapa[numero] !== undefined) return mapa[numero];
  // Para números > 10, compõe caractere a caractere
  return String(numero).split('').map(d => mapa[parseInt(d, 10)] || d).join('');
}

// 🔧 Tamanho da página para listar datas
const PAGE_SIZE_DATAS = 7;

// 📅 Soma 1 dia a uma data BR (DD/MM/AAAA)
function adicionarUmDiaDataBR(dataBR) {
  try {
    if (!dataBR) return undefined;
    const [d, m, a] = String(dataBR).split('/').map(Number);
    if (!d || !m || !a) return undefined;
    const dt = new Date(a, m - 1, d);
    dt.setDate(dt.getDate() + 1);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = String(dt.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return undefined;
  }
}

// 🗓️ Utilitários de data BR
function parseDataBR(dataBR) {
  if (!dataBR) return null;
  const [d, m, a] = String(dataBR).split('/').map(Number);
  if (!d || !m || !a) return null;
  return new Date(a, m - 1, d);
}

function getMesAnoDeDataBR(dataBR) {
  const dt = parseDataBR(dataBR);
  if (!dt) return null;
  return { mes: dt.getMonth() + 1, ano: dt.getFullYear() };
}

// 🕒 Regras de expediente por dia da semana (0=Dom, 1=Seg, ...)
// Cada intervalo é [inicioMin, fimMin] em minutos desde 00:00
function getExpedienteRangesByWeekday(weekday) {
  switch (weekday) {
    case 1: // Segunda
      return [[9*60, 11*60+40], [14*60, 17*60]];
    case 2: // Terça
      return [];
    case 3: // Quarta
      return [[9*60, 11*60+40], [14*60, 17*60]];
    case 4: // Quinta
      return [[14*60, 17*60]];
    case 5: // Sexta
      return [[14*60, 17*60]];
    default:
      return [];
  }
}

function getExpedienteRangesForDateBR(dateBR) {
  const dt = parseDataBR(dateBR);
  if (!dt) return [];
  return getExpedienteRangesByWeekday(dt.getDay());
}

function parseTimeToMinutes(hhmm) {
  const s = String(hhmm || '').trim();
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h*60 + m;
}

function filterHorariosPorExpediente(dateBR, horarios) {
  const ranges = getExpedienteRangesForDateBR(dateBR);
  if (!Array.isArray(horarios) || horarios.length === 0) return [];
  if (!ranges.length) return [];
  return horarios.filter((h) => {
    const startStr = typeof h === 'string' ? h : (h?.hora_inicio || h?.hora || h?.inicio);
    const minutes = parseTimeToMinutes(startStr);
    if (minutes == null) return false;
    return ranges.some(([ini, fim]) => minutes >= ini && minutes <= fim);
  }).map((h) => {
    if (typeof h === 'string') return h;
    if (h?.hora_inicio && h?.hora_fim) return `${h.hora_inicio}-${h.hora_fim}`;
    return h?.hora_inicio || h?.hora || String(h);
  });
}

function primeiroDiaDoProximoMes(mes, ano) {
  const base = new Date(ano, mes - 1, 1);
  base.setMonth(base.getMonth() + 1);
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const yyyy = String(base.getFullYear());
  return `01/${mm}/${yyyy}`;
}

function calcularDataFimAgendamento(dataString, horaString) {
  const [dia, mes, ano] = dataString.split('/');
  const [hora, minuto] = horaString.split(':');

  // Cria a data de início
  const dataInicio = new Date(`${ano}-${mes}-${dia}T${hora}:${minuto}:00`);

  // Adiciona 20 minutos
  dataInicio.setMinutes(dataInicio.getMinutes() + 20);

  // Formata para YYYY-MM-DD HH:mm:ss
  const anoFim = dataInicio.getFullYear();
  const mesFim = String(dataInicio.getMonth() + 1).padStart(2, '0');
  const diaFim = String(dataInicio.getDate()).padStart(2, '0');
  const horaFim = String(dataInicio.getHours()).padStart(2, '0');
  const minutoFim = String(dataInicio.getMinutes()).padStart(2, '0');
  const segundoFim = String(dataInicio.getSeconds()).padStart(2, '0');

  return `${anoFim}-${mesFim}-${diaFim} ${horaFim}:${minutoFim}:${segundoFim}`;
}

// ✅ Função auxiliar para determinar o tipo de consulta
function calcularTipoConsulta(ultimaDataConsulta) {
  if (!ultimaDataConsulta) return 'Primeira consulta';

  try {
    const hoje = new Date();
    const ultima = new Date(ultimaDataConsulta);

    // Verifica se a data é válida
    if (isNaN(ultima.getTime())) {
      console.log('⚠️ Data inválida recebida:', ultimaDataConsulta);
      return 'Primeira consulta';
    }

    const diffDias = Math.floor((hoje - ultima) / (1000 * 60 * 60 * 24));

    if (diffDias <= 30) {
      return 'Retorno';
    } else {
      return 'Consulta';
    }
  } catch (error) {
    console.error('❌ Erro ao calcular tipo de consulta:', error);
    return 'Primeira consulta';
  }
}

// ✅ Função para determinar saudação baseada no horário
function obterSaudacao(displayName) {
  const agora = new Date();
  const hora = agora.getHours();
  const nomeParte = displayName ? `, ${displayName}` : '';
  
  if (hora >= 6 && hora < 12) {
    return `🌅 Bom dia${nomeParte}! Bem-vindo(a) à Clínica Dra. Gabriela Nassif! 🏥`;
  } else if (hora >= 12 && hora < 18) {
    return `☀️ Boa tarde${nomeParte}! Bem-vindo(a) à Clínica Dra. Gabriela Nassif! 🏥`;
  } else {
    return `🌙 Boa noite${nomeParte}! Bem-vindo(a) à Clínica Dra. Gabriela Nassif! 🏥`;
  }
}

// ✅ Função para validar contexto antes de enviar para a API
function validarContextoAgendamento(context) {
  const camposObrigatorios = [
    'token',
    'cpf',
    'dataAgendamento',
    'horaSelecionada'
  ];

  console.log('[ValidarContexto] Contexto recebido:', JSON.stringify(context, null, 2)); // ⬅️ Debug

  const faltando = camposObrigatorios.filter(campo => !context[campo]);

  if (faltando.length > 0) {
    console.log('[ValidarContexto] Campos faltando:', faltando); // ⬅️ Debug
    return {
      valido: false,
      camposFaltando: faltando
    };
  }

  console.log('[ValidarContexto] Contexto válido!'); // ⬅️ Debug
  return { valido: true };
}

// 🔍 Função para buscar datas disponíveis de forma segura
async function buscarDatasDisponiveis(token, dataInicial) {
  try {
    const diasResponse = await gestaodsService.buscarDiasDisponiveis(token, dataInicial);

    const dias = Array.isArray(diasResponse?.data)
      ? diasResponse.data
      : Array.isArray(diasResponse)
        ? diasResponse
        : [];

    if (!Array.isArray(dias)) {
      console.error('❌ A resposta da API não retornou um array:', dias);
      return null;
    }

    const diasDisponiveis = dias.filter(d => d.disponivel === true);

    return diasDisponiveis;
  } catch (error) {
    console.error('❌ Erro ao buscar dias disponíveis:', error.message);
    return null;
  }
}

// 🕐 Função para buscar horários disponíveis de forma segura
async function buscarHorariosDisponiveis(token, dataSelecionada) {
  try {
    const horariosResponse = await gestaodsService.buscarHorariosDisponiveis(token, dataSelecionada);

    let horarios = Array.isArray(horariosResponse?.data)
      ? horariosResponse.data
      : Array.isArray(horariosResponse)
        ? horariosResponse
        : [];

    if (!Array.isArray(horarios)) {
      console.error('❌ Formato inesperado dos horários:', horarios);
      return null;
    }

    // Normaliza para uma lista de strings sem aplicar restrições adicionais
    horarios = horarios.map((horario) => {
      if (typeof horario === 'string') return horario;
      if (horario?.hora_inicio && horario?.hora_fim) return `${horario.hora_inicio}-${horario.hora_fim}`;
      return horario.hora_inicio || horario.hora || String(horario);
    });

    return horarios;
  } catch (error) {
    console.error('❌ Erro ao buscar horários disponíveis:', error.message);
    return null;
  }
}

// 🔎 Filtra dias mantendo somente aqueles com horários disponíveis
async function filtrarDiasComHorarios(dias, token) {
  if (!Array.isArray(dias) || !dias.length) return [];
  const resultado = [];
  for (const d of dias) {
    try {
      const horarios = await buscarHorariosDisponiveis(token, d.data);
      if (Array.isArray(horarios) && horarios.length > 0) {
        resultado.push(d);
      }
    } catch (e) {
      // ignora datas com erro ao buscar horários
    }
  }
  return resultado;
}

// 📋 Função para buscar última consulta do paciente
async function buscarUltimaConsulta(cpf, token) {
  try {
    const response = await axios.get(`https://apidev.gestaods.com.br/api/agendamento/historico/${cpf}?token=${token}`);
    const dados = response.data;

    // Proteção contra resposta não-array
    const agendamentos = Array.isArray(dados?.data)
      ? dados.data
      : dados?.dados || [];

    if (!Array.isArray(agendamentos) || agendamentos.length === 0) return null;

    // Ordena da mais recente para a mais antiga
    agendamentos.sort((a, b) => new Date(b.data || b.data_agendamento) - new Date(a.data || a.data_agendamento));

    return agendamentos[0]?.data || agendamentos[0]?.data_agendamento || null;
  } catch (error) {
    console.error('❌ Erro ao buscar última consulta:', error.message);
    return null;
  }
}

// ✅ Função Auxiliar para Converter Data BR para ISO
function converterDataBRParaISO(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return null;
  const [data, hora] = dataStr.split(' ');
  const [dia, mes, ano] = data.split('/');
  return new Date(`${ano}-${mes}-${dia}T${hora || '00:00:00'}`);
}

// ✅ Função para gerar mensagem de agendamentos
function gerarMensagemDeAgendamentos(agendamentos) {
  let mensagem = "📅 *Seus agendamentos encontrados:*\n\n";

  agendamentos.forEach((agendamento, index) => {
    const dataHora = `${agendamento.data} às ${agendamento.hora}`;
    mensagem += `*${index + 1}.* ${dataHora} - ${agendamento.unidade_nome || "Unidade não informada"}\nMédico: ${agendamento.profissional_nome || "Profissional não informado"}\n\n`;
  });

  mensagem += "🔄 Deseja *reagendar* ou *cancelar* algum? Envie o número correspondente.";
  return mensagem;
}

// ✅ Função para enviar mensagem via Z-API
function enviarMensagemZap(userPhone, mensagem) {
  // Aqui você pode implementar a lógica de envio via Z-API
  // Por enquanto, retornamos a mensagem para ser processada pelo flowController
  return mensagem;
}

// ✅ Função para enviar mensagem (alias para enviarMensagemZap)
async function sendMessage(userPhone, mensagem) {
  return enviarMensagemZap(userPhone, mensagem);
}

// ✅ Função para verificar se está no horário de atendimento
function verificarHorarioAtendimento() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay(); // 0 = Domingo, 6 = Sábado

  const isWeekday = currentDay >= 1 && currentDay <= 5; // Segunda a Sexta
  const isSaturday = currentDay === 6;

  const isBusinessHours = 
    (isWeekday && currentHour >= 8 && currentHour < 18) || 
    (isSaturday && currentHour >= 8 && currentHour < 12);

  return isBusinessHours;
}

// ✅ Função para definir estado do usuário
function setUserState(userPhone, state) {
  setState(userPhone, state);
}

// ✅ Função Atualizada – Buscar Agendamentos em 120 Dias por Nome
// normaliza nome: remove acentos, colapsa espaços, uppercase
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

async function visualizarAgendamentosPorNome(nomePaciente, userPhone) {
  try {
    const hoje = new Date();
    const dataInicial = hoje.toLocaleDateString('pt-BR'); // ex: 04/08/2025

    const dataFinal = new Date();
    dataFinal.setMonth(dataFinal.getMonth() + 3);
    const dataFinalFormatada = dataFinal.toLocaleDateString('pt-BR'); // ex: 04/11/2025

    const tokenListagem = process.env.GESTAODS_TOKEN;
    const url = `https://apidev.gestaods.com.br/api/dados-agendamento/listagem/${tokenListagem}`;

    console.log('[VisualizarAgendamentosPorNome] Chamando API:', url, {
      data_inicial: dataInicial,
      data_final: dataFinalFormatada
    });

    const response = await axios.get(url, {
      params: {
        data_inicial: dataInicial,
        data_final: dataFinalFormatada
      },
      timeout: 10000
    });

    console.log('[VisualizarAgendamentosPorNome] response.data bruto:', JSON.stringify(response.data, null, 2));

    let agendamentosArray;
    if (Array.isArray(response.data)) {
      agendamentosArray = response.data;
    } else if (Array.isArray(response.data.data)) {
      agendamentosArray = response.data.data;
    } else if (Array.isArray(response.data.dados)) {
      agendamentosArray = response.data.dados;
    } else {
      console.warn('[VisualizarAgendamentosPorNome] Formato inesperado da resposta:', response.data);
      return '❌ Não foi possível buscar seus agendamentos no momento.';
    }

    const nomeBuscaNorm = normalizeName(nomePaciente);

    // Matching por tokens (ordem livre): todos os tokens do nome buscado devem existir no nome do paciente
    const searchTokens = nomeBuscaNorm.split(' ').filter(Boolean);
    const agendamentosFiltrados = agendamentosArray.filter(item => {
      const pacienteNome = normalizeName(item.paciente?.nome || '');
      if (!pacienteNome) return false;

      // Igualdade exata após normalização
      if (pacienteNome === nomeBuscaNorm) return true;

      // Token match (ordem livre): exige que todos os tokens buscados apareçam no nome do paciente
      const pacienteTokens = pacienteNome.split(' ').filter(Boolean);
      if (searchTokens.length === 0) return false;
      return searchTokens.every(tok => pacienteTokens.includes(tok));
    });

    if (agendamentosFiltrados.length === 0) {
      if (userPhone) {
        // Mantém usuário no fluxo para permitir nova digitação do nome,
        // mas agenda encerramento automático após o tempo definido
        try { scheduleAutoClose(userPhone, AUTO_CLOSE_MS); } catch {}
      }
      return (
        "📭 Não encontramos agendamentos para este nome.\n\n" +
        "Por favor, confira se digitou seu *NOME COMPLETO* corretamente e tente novamente.\n\n" +
        "Se estiver correto, não existe agendamento para este paciente no período consultado.\n\n" +
        "Digite *'voltar'* para retornar ao menu principal."
      );
    }

    if (userPhone) {
      await salvarEstado(userPhone, 'aguardando_selecao_agendamento');
      setState(userPhone, 'aguardando_selecao_agendamento');
      await salvarContexto(userPhone, {
        agendamentosDisponiveis: agendamentosFiltrados.map((ag, i) => ({
          index: i + 1,
          data: ag.data_agendamento || ag.data || 'Data não informada',
          medico: (ag.medico && (ag.medico.nome || ag.medico)) || 'Médico não informado',
          token: ag.token || ag.agendamento || null,
          raw: ag
        }))
      });
    }

    let mensagem = `📅 *Agendamentos encontrados para ${nomePaciente.toUpperCase()}:*\n\n`;
    agendamentosFiltrados.forEach((item, index) => {
      // formatação segura da data
      const raw = item.data_agendamento || item.data || item.data_consulta || '';
      const dataMoment = moment(raw, 'DD/MM/YYYY HH:mm', true);
      const dataFormatada = dataMoment.isValid()
        ? dataMoment.format('DD/MM/YYYY [às] HH:mm')
        : raw;

      const medico = (item.medico && (item.medico.nome || item.medico)) || 'Médico não informado';
      mensagem += `${index + 1}️⃣ - ${dataFormatada} com ${medico}\n`;
    });
    mensagem += `\nDigite o número do agendamento para *reagendar ou cancelar*.`; 

    return mensagem;

  } catch (error) {
    console.error('[VisualizarAgendamentosPorNome] Erro inesperado:', error.response?.data || error.message);
    return '❌ Ocorreu um erro ao buscar seus agendamentos. Tente novamente mais tarde.';
  }
}



// 🧠 Sistema FSM (Finite State Machine)
const userStates = {}; // armazena o estado atual de cada usuário
const userContext = {}; // armazena o contexto (cpf, nome, etc.)
const agendamentosPendentes = {}; // armazena agendamentos pendentes por usuário
const agendamentoSelecionado = {}; // armazena agendamento selecionado por usuário

function getState(phone) {
  return userStates[phone] || 'inicio';
}

function setState(phone, state) {
  userStates[phone] = state;
  console.log(`🔄 Estado do usuário ${phone} alterado para: ${state}`);
  // Persistir sessão (best effort)
  persistSessionToSupabase(phone);
}

function getContext(phone) {
  if (!userContext[phone]) {
    userContext[phone] = {};
  }
  return userContext[phone];
}

function setContext(phone, context) {
  userContext[phone] = { ...userContext[phone], ...context };
  // Persistir sessão (best effort)
  persistSessionToSupabase(phone);
}

// 📝 Aguardando nome para cadastro
async function handleAguardandoNome(phone, message) {
  const messageLower = message.toLowerCase().trim();

  const context = getContext(phone);

  // Fluxo específico: Lista de espera pede apenas o nome
  if (context.acao === 'lista_espera') {
    if (messageLower === 'voltar') {
      setState(phone, 'menu_principal');
      setContext(phone, {});
      return handleMenuPrincipal(phone, 'menu');
    }

    context.nome = message;
    setContext(phone, context);

    // Cria entrada na waitlist apenas com nome e telefone
    try {
      await createWaitlistEntry({
        cpf: context.cpf || null,
        name: context.nome,
        phone,
        email: context.email || null,
        motivo: 'Lista de espera via chatbot',
        prioridade: 'media'
      });
      await createNotification({ type: 'espera', title: 'Novo na lista de espera', message: `Telefone ${phone} - ${context.nome}` });
    } catch (e) {
      console.error('[Waitlist] erro ao criar entrada:', e.message);
    }

    setState(phone, 'lista_espera_confirmada');
    return (
      "⏳ *Lista de Espera*\n\n" +
      `✅ ${context.nome}, você foi adicionado(a) à lista de espera!\n` +
      "Entraremos em contato quando houver vaga.\n\n" +
      "Digite *'Menu'* para voltar ao início."
    );
  }

  // Fluxo secretaria: ao receber nome, cria ticket e notificação e define estado adequado
  if (context.acao === 'secretaria') {
    if (messageLower === 'voltar') {
      setState(phone, 'menu_principal');
      setContext(phone, {});
      return handleMenuPrincipal(phone, 'menu');
    }

    context.nome = message;
    setContext(phone, context);

    try {
      await createSecretaryTicket({ phone, motivo: `Atendimento manual solicitado por ${context.nome}` });
      await createNotification({ type: 'secretaria', title: 'Novo atendimento manual', message: `${context.nome} - ${phone}`, priority: 'alta' });
    } catch (e) {
      console.warn('[Secretaria] falha ao registrar ticket/notificação:', e.message);
    }

    // Se fora de horário, finaliza e informa. Se dentro, aguarda atendimento humano.
    if (context.foraHorario) {
      setState(phone, 'finalizado');
      return [
        (
          `✅ Nome registrado: *${context.nome}*\n\n` +
          "📅 *Horário de Atendimento:*\n" +
          "Segunda a Sexta, das 8h às 18h\n" +
          "Sábado, das 8h às 12h\n\n" +
          "Entraremos em contato assim que o atendimento for retomado."
        ),
        (
          "👩‍💼 Sua solicitação foi encaminhada para a secretária.\n" +
          "⏰ Seu atendimento foi encerrado."
        )
      ];
    } else {
      setState(phone, 'aguardando_atendimento_secretaria');
      return (
        `✅ Nome registrado: *${context.nome}*\n\n` +
        "👩‍💼 Seu atendimento foi direcionado para a secretária. Por favor, aguarde.\n\n" +
        "Digite *'Menu'* para voltar ao início."
      );
    }
  }

  // Fluxo padrão (cadastro)
  if (messageLower === 'voltar') {
    setState(phone, 'aguardando_cpf');
    return (
      "Digite seu CPF novamente:\n\n" +
      "Digite *voltar* para retornar ao menu principal."
    );
  }

  context.nome = message;
  setContext(phone, context);
  setState(phone, 'solicitando_email');

  return (
    `✅ Nome registrado: *${message}*\n\n` +
    "Agora digite seu *email*:\n\n" +
    "Exemplo: joao@email.com\n\n" +
    "Digite *voltar* para corrigir o nome."
  );
}

// 🌅 Estado inicial - handle_inicio
function handleInicio(phone, message) {
  const messageLower = message.toLowerCase().trim();
  const ctx = getContext(phone);
  const displayName = ctx?.waName || ctx?.nome;

  // Detectar comandos relacionados a agendamentos
  if (messageLower.includes('agendamento') || messageLower.includes('agendamentos') ||
    messageLower.includes('consulta') || messageLower.includes('consultas') ||
    messageLower.includes('meus agendamentos') || messageLower.includes('ver consultas') ||
    messageLower.includes('minhas consultas') || messageLower.includes('agenda')) {

    setState(phone, 'confirmando_paciente');
    setContext(phone, { acao: 'visualizar' });
    return (
      "📋 Visualizar Agendamentos\n\n" +
      "Por favor, digite seu *NOME COMPLETO* para vermos seus agendamentos.\n\n" +
      "Digite *'voltar'* para retornar ao menu principal."
    );
  }

  if (
    messageLower === 'menu' ||
    messageLower.includes('menu') ||
    messageLower.includes('oi') ||
    messageLower.includes('olá') ||
    messageLower.includes('ola') ||
    messageLower.includes('bom dia') ||
    messageLower.includes('boa tarde') ||
    messageLower.includes('boa noite')
  ) {
    setState(phone, 'menu_principal');

    if (USE_INTERACTIVE) {
      return buildMainMenuList(displayName);
    }
    return (
      obterSaudacao(displayName) + "\n\n" +
      "Sou seu assistente virtual.\n\n" +
      "*Digite o número da opção desejada:*\n\n" +
      "1️⃣ *Agendar consulta*\n" +
      "2️⃣ *Ver meus agendamentos*\n" +
      "3️⃣ *Lista de espera*\n" +
      "4️⃣ *Falar com secretária*\n\n" +
      "Digite *0* para sair"
    );
  } else {
    return (
      obterSaudacao(displayName) + "\n\n" +
      "Digite *oi* para começar o atendimento e ver as opções disponíveis.\n\n" +
      "💡 *Dica:* Você também pode digitar \"meus agendamentos\" para ver suas consultas diretamente."
    );
  }
}

// 📋 Menu principal
function handleMenuPrincipal(phone, message) {
  const messageLower = message.toLowerCase().trim();
  const ctx = getContext(phone);
  const displayName = ctx?.waName || ctx?.nome;

  // Detectar comandos de texto relacionados a agendamentos
  if (messageLower.includes('agendamento') || messageLower.includes('agendamentos') ||
    messageLower.includes('consulta') || messageLower.includes('consultas') ||
    messageLower.includes('meus agendamentos') || messageLower.includes('ver consultas') ||
    messageLower.includes('minhas consultas') || messageLower.includes('agenda')) {

    setState(phone, 'confirmando_paciente');
    setContext(phone, { acao: 'visualizar' });
    return (
      "📋 Visualizar Agendamentos\n\n" +
      "Por favor, digite seu *NOME COMPLETO* para vermos seus agendamentos.\n\n" +
      "Digite *'voltar'* para retornar ao menu principal."
    );
  }

  const mapMenu = {
    'agendar consulta': '1',
    'ver meus agendamentos': '2',
    'lista de espera': '3',
    'falar com secretária': '4',
    'falar com secretaria': '4',
    'sair': '0'
  };
  const routed = mapMenu[messageLower] || message;

  switch (routed) {
    case 'menu':
      if (USE_INTERACTIVE) {
        return buildMainMenuList(displayName);
      }
      return (
        obterSaudacao(displayName) + "\n\n" +
        "Sou seu assistente virtual.\n\n" +
        "*Digite o número da opção desejada:*\n\n" +
        "1️⃣ Agendar consulta\n" +
        "2️⃣ Ver meus agendamentos\n" +
        "3️⃣ Lista de espera\n" +
        "4️⃣ Falar com secretária\n\n" +
        "Digite 0 para sair"
      );

    case '1':
      setState(phone, 'aguardando_cpf');
      setContext(phone, { acao: 'agendar' });
      return (
        "📅 *Agendamento de Consulta*\n\n" +
        "Por favor, digite seu CPF (apenas números):\n\n" +
        "Exemplo: 12345678901\n\n" +
        "Digite *'voltar'* para retornar ao menu principal."
      );

    case '2':
      setState(phone, 'confirmando_paciente');
      setContext(phone, { acao: 'visualizar' });
      return (
        "📋 Visualizar Agendamentos\n\n" +
      "Por favor, digite seu *NOME COMPLETO* para vermos seus agendamentos.\n\n" +
      "Digite *'voltar'* para retornar ao menu principal."
      );

    case '3':
      setState(phone, 'aguardando_nome');
      setContext(phone, { acao: 'lista_espera' });
      return (
        "⏳ *Lista de Espera*\n\n" +
      "Por favor, digite seu *NOME COMPLETO* para adicionar à lista de espera:\n\n" +
      "Digite *'voltar'* para retornar ao menu principal."
      );

    case '4':
      const isBusinessHours = verificarHorarioAtendimento();
      // Pede o nome antes de abrir ticket, para organizar no painel
      setContext(phone, { acao: 'secretaria', foraHorario: !isBusinessHours });
      setState(phone, 'aguardando_nome');
       if (!isBusinessHours) {
        return (
          "No momento, nosso atendimento não está disponível. Favor digitar seu *NOME COMPLETO* que assim que possível entraremos em contato.\n\n" +
          "Caso contrário, digite *'Voltar'* para retornar ao menu principal."
        );
      }
      return (
        "👩‍💼 *Atendimento com a Secretária*\n\n" +
        "Por favor, digite seu *NOME COMPLETO* para direcionarmos seu atendimento.\n\n" +
        "Assim que recebermos seu nome, a secretária dará continuidade ao atendimento.\n\nDigite *'voltar'* para retornar ao menu."
      );

    case '0':
      setState(phone, 'inicio');
      setContext(phone, {});
      return (
        "👋 Obrigado por usar nosso atendimento!\n\n" +
        "Volte sempre! 😊"
      );

    default:
      if (USE_INTERACTIVE) {
        return buildMainMenuList(displayName);
      }
      return (
        "❌ Opção inválida!\n\n" +
        "*Digite o número da opção desejada:*\n\n" +
        "1️⃣ *Agendar consulta*\n" +
        "2️⃣ *Ver meus agendamentos*\n" +
        "3️⃣ *Lista de espera*\n" +
        "4️⃣ *Falar com secretária*\n\n" +
        "Digite *0* para sair"
      );
  }
}

// 🔍 Aguardando CPF
async function handleAguardandoCpf(phone, message) {
  const messageLower = message.toLowerCase().trim();

  if (messageLower === 'voltar') {
    setState(phone, 'menu_principal');
    createSecretaryTicket({ phone, motivo: 'Usuário pediu atendimento humano' });
    return handleMenuPrincipal(phone, 'menu');
  }

  if (isValidCPF(message)) {
    const context = getContext(phone);
    context.cpf = message;
    setContext(phone, context);
    // Persist paciente
    upsertPatient({ cpf: message, name: context.nome, phone, email: context.email });

  // Busca o paciente usando o gestaodsService
  let paciente;
  try {
    const token = process.env.GESTAODS_TOKEN;
    paciente = await gestaodsService.verificarPaciente(token, message);
  } catch (error) {
    console.error('[AguardandoCPF] Erro ao verificar CPF:', error?.message || error);
    setState(phone, 'aguardando_cpf');
    return (
      "❌ Erro ao verificar CPF no sistema.\n\n" +
      "Por favor, digite seu CPF novamente (apenas números):\n\n" +
      "Exemplo: 12345678901\n\n" +
      "Ou digite *menu* para voltar ao início."
    );
  }

    if (!paciente) {
      setState(phone, 'aguardando_nome');
    return (
      "❌ CPF não encontrado no sistema!\n\n" +
      "Por favor, digite seu *NOME COMPLETO* para cadastro:\n\n" +
      "Digite *'voltar'* para tentar outro CPF."
    );
    }

    // Paciente encontrado - extrai dados reais da API
    let nome, celular, nascimento, email, pacienteId;

    // Extrai os dados reais da API
    nome = paciente.nome || paciente.nome_completo || paciente.nome_paciente || 'Não informado';
    celular = paciente.celular || paciente.telefone || paciente.telefone_celular || paciente.telefone_1 || 'Não informado';
    nascimento = paciente.nascimento || paciente.data_nascimento || paciente.dt_nascimento || 'Não informado';
    email = paciente.email || paciente.email_paciente || 'Não informado';
    pacienteId = paciente.id || paciente.paciente_id || paciente.codigo || null;

    // Salva os dados reais no contexto
    context.nome = nome;
    context.celular = celular;
    context.nascimento = nascimento;
    context.email = email;
    context.pacienteId = pacienteId; // ID do paciente para o agendamento
    context.pacienteEncontrado = true;
    context.dadosPaciente = paciente; // Salva os dados completos da API
    setContext(phone, context);
    // Persist paciente com dados completos
    upsertPatient({ cpf: message, name: nome, phone, email });

    // Pula a confirmação e segue direto para a lista de datas disponíveis
    setState(phone, 'escolhendo_data');

    try {
      if (!context.token) {
        context.token = process.env.GESTAODS_TOKEN;
        setContext(phone, context);
      }

      // Primeira listagem: somente dias disponíveis do mês corrente
      const hoje = new Date();
      const dia = String(hoje.getDate()).padStart(2, '0');
      const mes = String(hoje.getMonth() + 1).padStart(2, '0');
      const ano = String(hoje.getFullYear());
      const dataInicial = `${dia}/${mes}/${ano}`;
      const diasAll = await buscarDatasDisponiveis(context.token, dataInicial);
      let dias = Array.isArray(diasAll)
        ? diasAll.filter((d) => {
            const ma = getMesAnoDeDataBR(d.data);
            return ma && ma.mes === (hoje.getMonth() + 1) && ma.ano === hoje.getFullYear();
          })
        : diasAll;

      // mantém apenas dias com "disponivel" true (sem pré-checar horários)
      // mantém apenas dias que realmente possuem horários dentro do expediente
      let diasComHorario = [];
      const horariosPorData = {};
      for (const d of dias) {
        try {
          const horariosDia = await buscarHorariosDisponiveis(context.token, d.data);
          const ok = filterHorariosPorExpediente(d.data, Array.isArray(horariosDia) ? horariosDia : []);
          console.log('[Datas-init] dia', d.data, 'rawHorarios:', Array.isArray(horariosDia) ? horariosDia.length : 0, 'aposFiltro:', ok.length);
          if (ok.length > 0) {
            diasComHorario.push(d);
            horariosPorData[d.data] = ok;
          }
        } catch (e) {
          console.warn('[Datas-init] erro horarios em', d.data, e.message);
        }
      }

      if (!diasComHorario || diasComHorario.length === 0) {
        // Fallback: tentar automaticamente o próximo mês
        const inicioProxMes = primeiroDiaDoProximoMes(Number(mes), Number(ano));
        const diasAllProx = await buscarDatasDisponiveis(context.token, inicioProxMes);
        let diasProx = Array.isArray(diasAllProx)
          ? diasAllProx.filter((d) => {
              const ma = getMesAnoDeDataBR(d.data);
              const ref = getMesAnoDeDataBR(inicioProxMes);
              return ma && ref && ma.mes === ref.mes && ma.ano === ref.ano;
            })
          : diasAllProx;

        let diasComHorarioProx = [];
        const horariosPorDataProx = {};
        for (const d of diasProx) {
          try {
            const horariosDia = await buscarHorariosDisponiveis(context.token, d.data);
            const ok = filterHorariosPorExpediente(d.data, Array.isArray(horariosDia) ? horariosDia : []);
            console.log('[Datas-prox] dia', d.data, 'rawHorarios:', Array.isArray(horariosDia) ? horariosDia.length : 0, 'aposFiltro:', ok.length);
            if (ok.length > 0) { diasComHorarioProx.push(d); horariosPorDataProx[d.data] = ok; }
          } catch (e) { console.warn('[Datas-prox] erro horarios em', d.data, e.message); }
        }

        if (!diasComHorarioProx || diasComHorarioProx.length === 0) {
          return (
            "❌ Nenhuma data disponível no momento.\n\n" +
            "Tente novamente mais tarde ou digite *'Menu'* para voltar ao início."
          );
        }

        const msgConfirmacao2 = `✅ *CPF ${message} encontrado no sistema!*`;
        let msgDatas2 = "📅 *Datas mais próximas disponíveis para consulta:*\n\n";
        diasComHorarioProx.forEach((data, index) => {
          const numEmoji = numeroParaEmoji(index + 1);
          msgDatas2 += `${numEmoji} - ${data.data}\n`;
        });
        const numMais2 = numeroParaEmoji(diasComHorarioProx.length + 1);
        msgDatas2 += `\n${numMais2} - VER MAIS DATAS`;
        msgDatas2 += "\n\nDigite o número da opção desejada.";

        context.datasDisponiveis = diasComHorarioProx;
        context.horariosPorData = horariosPorDataProx;
        const ref = getMesAnoDeDataBR(inicioProxMes);
        context.mesListando = `${String(ref.mes).padStart(2,'0')}/${ref.ano}`;
        setContext(phone, context);

        return [msgConfirmacao2, msgDatas2];
      }

      const msgConfirmacao = `✅ *CPF ${message} encontrado no sistema!*`;

      let msgDatas = "📅 *Datas mais próximas disponíveis para consulta:*\n\n";
      diasComHorario.forEach((data, index) => {
        const numEmoji = numeroParaEmoji(index + 1);
        msgDatas += `${numEmoji} - ${data.data}\n`;
      });
      // opção extra para avançar mês
      const numMais = numeroParaEmoji(diasComHorario.length + 1);
      msgDatas += `\n${numMais} - VER MAIS DATAS`;
      msgDatas += "\n\nDigite o número da opção desejada.";

      context.datasDisponiveis = diasComHorario;
      context.horariosPorData = horariosPorData;
      context.mesListando = `${mes}/${ano}`;
      setContext(phone, context);

      return [msgConfirmacao, msgDatas];
    } catch (error) {
      console.error("Erro ao buscar datas disponíveis:", error);
      return (
        "❌ Ocorreu um erro ao buscar as datas disponíveis.\n" +
        "Por favor, tente novamente mais tarde ou digite *menu* para retornar ao início."
      );
    }
  } else {
    const cpfDigitado = message.replace(/\D/g, ''); // Remove caracteres não numéricos
    return (
      "❌ CPF inválido!\n\n" +
      `Você digitou: ${message}\n` +
      `CPF deve ter exatamente 11 dígitos APENAS numéricos, sem pontos.\n` +
      "Exemplo: 12345678901\n\n" +
      "Envie seu CPF novamente ou digite *menu* para voltar ao início."
    );
  }
}



// 📝 Solicitando dados para cadastro
function handleSolicitandoDados(phone, message) {
  const messageLower = message.toLowerCase().trim();

  if (messageLower === 'voltar') {
    setState(phone, 'aguardando_cpf');
    return (
      "Digite seu CPF novamente:\n\n" +
      "Digite *voltar* para retornar ao menu principal."
    );
  }

  const context = getContext(phone);

  if (!context.nome) {
    // Primeira vez - salvando o nome
    context.nome = message;
    setContext(phone, context);
    setState(phone, 'solicitando_email');

    return (
      `✅ Nome registrado: *${message}*\n\n` +
      "Agora digite seu *email*:\n\n" +
      "Exemplo: joao@email.com\n\n" +
      "Digite *voltar* para corrigir o nome."
    );
  }
}

// 📧 Solicitando email
function handleSolicitandoEmail(phone, message) {
  const messageLower = message.toLowerCase().trim();

  if (messageLower === 'voltar') {
    setState(phone, 'solicitando_dados');
    const context = getContext(phone);
    return (
      `Digite seu nome novamente:\n\n` +
      "Digite *voltar* para tentar outro CPF."
    );
  }

  // Validação básica de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(message)) {
    const context = getContext(phone);
    context.email = message;
    setContext(phone, context);
    setState(phone, 'aguardando_celular');

    return (
      `✅ Email registrado: *${message}*\n\n` +
      `📱 *Digite seu número de celular com DDD (somente números):*\n\n` +
      `Exemplo: 31999999999\n\n` +
      `Digite *voltar* para corrigir o email.`
    );
  } else {
    return (
      "❌ Email inválido!\n\n" +
      "Digite um email válido.\n" +
      "Exemplo: joao@email.com\n\n" +
      "Digite *voltar* para corrigir o nome."
    );
  }
}

// 📱 Aguardando celular
function handleAguardandoCelular(phone, message) {
  const messageLower = message.toLowerCase().trim();

  if (messageLower === 'voltar') {
    setState(phone, 'solicitando_email');
    const context = getContext(phone);
    return (
      `Digite seu email novamente:\n\n` +
      "Digite *voltar* para corrigir o nome."
    );
  }

  // Remove tudo que não for número
  const celular = message.replace(/\D/g, '');

  if (celular.length !== 11) {
    return (
      "❌ *Número inválido.*\n\n" +
      "Por favor, digite apenas os 11 números do seu celular (com DDD).\n\n" +
      "Ex: 31999999999\n\n" +
      "Digite *voltar* para corrigir o email."
    );
  }

  // Celular válido - salva no contexto e vai para confirmação
  const context = getContext(phone);
  context.celular = celular;
  setContext(phone, context);
  setState(phone, 'confirmando_cadastro');

  return (
    `✅ Celular registrado: *${celular}*\n\n` +
    `📋 *Dados para cadastro:*\n` +
    `👤 Nome: ${context.nome}\n` +
    `📧 Email: ${context.email}\n` +
    `🆔 CPF: ${context.cpf}\n` +
    `📱 Celular: ${celular}\n\n` +
    "Confirma o cadastro?\n\n" +
    "1️⃣ Sim, cadastrar\n" +
    "2️⃣ Não, corrigir dados\n" +
    "0️⃣ Cancelar"
  );
}

// ✅ Confirmando cadastro
async function handleConfirmandoCadastro(phone, message) {
  const context = getContext(phone);

  switch (message) {
    case '1':
      // Se estiver em estado de erro, tenta cadastrar novamente
      if (context.erroCadastro) {
        // Remove a flag de erro
        delete context.erroCadastro;
        setContext(phone, context);
        
        // Chama recursivamente o case '1' original
        return await handleConfirmandoCadastro(phone, '1');
      }
      
      // Cadastra o paciente na API GestãoDS
      try {
        console.log(`[FLOW] Tentando cadastrar paciente: ${context.nome} (CPF: ${context.cpf})`);
        
        const resultadoCadastro = await cadastrarPacienteNoGestao({
          nome_completo: context.nome,
          cpf: context.cpf,
          email: context.email,
          celular: context.celular
        });

        if (resultadoCadastro.sucesso) {
          console.log(`[FLOW] Paciente cadastrado com sucesso na API: ${context.nome}`);
          
          // Salva os dados do cadastro no contexto
          context.pacienteCadastrado = true;
          context.dadosCadastro = resultadoCadastro.dados;
          setContext(phone, context);
          
          // Após cadastro bem-sucedido, já coloca o usuário no estado de menu
          setState(phone, 'menu_principal');
          return (
            "✅ *Cadastro realizado com sucesso!*\n\n" +
            `Bem-vindo(a), *${context.nome}*!\n\n` +
            // Chama o menu imediatamente
            handleMenuPrincipal(phone, 'menu')
          );
        } else {
          console.error(`[FLOW] Erro no cadastro: ${resultadoCadastro.mensagem}`);
          
          // Para outros erros, permite tentar novamente
          context.erroCadastro = true;
          setContext(phone, context);
          
          return (
            "❌ *Erro no cadastro*\n\n" +
            `Não foi possível cadastrar você no sistema.\n` +
            `Erro: ${resultadoCadastro.mensagem || 'Dados inválidos fornecidos para cadastro'}\n\n` +
            "1️⃣ Tentar novamente\n" +
            "2️⃣ Corrigir dados\n" +
            "0️⃣ Cancelar e falar com secretária"
          );
        }
      } catch (error) {
        console.error('[FLOW] Erro inesperado no cadastro:', error);
        
        // Marca que houve erro no contexto
        context.erroCadastro = true;
        setContext(phone, context);
        
        return (
          "❌ *Erro inesperado*\n\n" +
          "Ocorreu um erro inesperado durante o cadastro.\n\n" +
          "1️⃣ Tentar novamente\n" +
          "2️⃣ Corrigir dados\n" +
          "0️⃣ Cancelar e falar com secretária"
        );
      }

    case '2':
      // Remove flag de erro se existir
      if (context.erroCadastro) {
        delete context.erroCadastro;
        setContext(phone, context);
      }
      
      setState(phone, 'aguardando_celular');
      return (
        `📱 *Digite seu número de celular com DDD (somente números):*\n\n` +
        `Exemplo: 31999999999\n\n` +
        `Digite *voltar* para corrigir o email.`
      );

    case '0':
      // Se estiver em estado de erro, redireciona para secretária
      if (context.erroCadastro) {
        setState(phone, 'atendimento_humano');
        setContext(phone, {});
        return (
          "📞 *Redirecionando para secretária*\n\n" +
          "Uma secretária irá ajudá-lo com o cadastro.\n\n" +
          "👩‍💼 *Secretária*\n\n" +
          "☎️ Telefone: +55 31 98600-3666\n" +
          "📧 Email: contato@gabrielanassif.com\n" +
          "🕐 Horário: Segunda a Sexta, 8h às 18h\n\n" +
          "Digite *1* para voltar ao menu principal."
        );
      }
      
      // Caso normal de cancelamento
      setState(phone, 'menu_principal');
      setContext(phone, {});
      return (
        "Cadastro cancelado. Voltando ao menu principal...\n\n" +
        "Digite *1* para agendar uma consulta\n" +
        "Digite *2* para ver meus agendamentos\n" +
        "Digite *3* para lista de espera\n" +
        "Digite *4* para falar com secretária"
      );

    default:
      // Se estiver em estado de erro, mostra opções de erro
      if (context.erroCadastro) {
        return (
          "❌ Opção inválida!\n\n" +
          "1️⃣ Tentar novamente\n" +
          "2️⃣ Corrigir dados\n" +
          "0️⃣ Cancelar e falar com secretária"
        );
      }
      
      // Caso normal
      return (
        "❌ Opção inválida!\n\n" +
        "1️⃣ Sim, cadastrar\n" +
        "2️⃣ Não, corrigir dados\n" +
        "0️⃣ Cancelar"
      );
  }
}

// ✅ Confirmando paciente
async function handleConfirmandoPaciente(phone, message) {
  const context = getContext(phone);
  const messageLower = message.toLowerCase().trim();

  // Se ação é visualizar e já temos agendamentos disponíveis,
  // e o usuário digitou um número, trata como seleção de agendamento
  if (context.acao === 'visualizar' && context.agendamentosDisponiveis) {
    const escolhaNum = parseInt(message.trim(), 10);
    if (!isNaN(escolhaNum)) {
      // redireciona para seleção de agendamento existente
      return await handleAguardandoSelecaoAgendamento(phone, message);
    }
  }

  // Se a ação for visualizar e não for número, trata como nome do paciente
  if (context.acao === 'visualizar') {
    const nome = message?.trim();

    if (!nome || nome.length < 3) {
      return '❗ Por favor, digite um nome válido com pelo menos 3 letras.';
    }

    const mensagem = await visualizarAgendamentosPorNome(nome, phone);

    if (mensagem.includes('📭 Você não possui agendamentos')) {
      setState(phone, 'finalizado');
      return mensagem;
    }

    if (mensagem.includes('❌')) {
      setState(phone, 'finalizado');
      return mensagem;
    }

    return mensagem;
  }

  // Para outras ações (agendar, cancelar, etc.), mantém a lógica original
  switch (message) {
    case '1':
      // Ação após confirmação de identidade
      switch (context.acao) {
        case 'agendar':
          setState(phone, 'escolhendo_data');

          try {
            // Adiciona o token ao contexto se não existir
            if (!context.token) {
              context.token = process.env.GESTAODS_TOKEN;
              setContext(phone, context);
            }

            // Primeira listagem dentro do fluxo 'agendar': mês corrente
            const hoje = new Date();
            const dia = String(hoje.getDate()).padStart(2, '0');
            const mes = String(hoje.getMonth() + 1).padStart(2, '0');
            const ano = String(hoje.getFullYear());
            const dataInicial = `${dia}/${mes}/${ano}`;
            const diasAll = await buscarDatasDisponiveis(context.token, dataInicial);
            let dias = Array.isArray(diasAll)
              ? diasAll.filter((d) => {
                  const ma = getMesAnoDeDataBR(d.data);
                  return ma && ma.mes === (hoje.getMonth() + 1) && ma.ano === hoje.getFullYear();
                })
              : diasAll;

            // mantém apenas dias que realmente possuem horários dentro do expediente
            let diasComHorario = [];
            const horariosPorData = {};
            for (const d of dias) {
              try {
                const horariosDia = await buscarHorariosDisponiveis(context.token, d.data);
                const ok = filterHorariosPorExpediente(d.data, Array.isArray(horariosDia) ? horariosDia : []);
                if (ok.length > 0) {
                  diasComHorario.push(d);
                  horariosPorData[d.data] = ok;
                }
              } catch {}
            }

            if (!diasComHorario || diasComHorario.length === 0) {
              return (
                "❌ Nenhuma data disponível no momento.\n\n" +
                "Tente novamente mais tarde ou digite *'Menu'* para voltar ao início."
              );
            }

            // Monta a lista de opções (com emojis e opção de mais)
            let mensagem = "📅 *Datas mais próximas disponíveis para consulta:*\n\n";
            diasComHorario.forEach((data, index) => {
              const numEmoji = numeroParaEmoji(index + 1);
              mensagem += `${numEmoji} - ${data.data}\n`;
            });

            const numMais = numeroParaEmoji(diasComHorario.length + 1);
            mensagem += `\n${numMais} - VER MAIS DATAS`;
            mensagem += "\n\nDigite o número da opção desejada.";

            // Salva as opções no contexto para uso posterior
            context.datasDisponiveis = diasComHorario;
            context.horariosPorData = horariosPorData;
            context.mesListando = `${mes}/${ano}`;
            setContext(phone, context);

            return mensagem;

          } catch (error) {
            console.error("Erro ao buscar datas disponíveis:", error);
            return (
              "❌ Ocorreu um erro ao buscar as datas disponíveis.\n" +
              "Por favor, tente novamente mais tarde ou digite *'Menu'* para retornar ao início."
            );
          }

        case 'cancelar':
          setState(phone, 'cancelamento_confirmado');
          return (
            "❌ *Cancelamento de Consulta*\n\n" +
            "Por favor, entre em contato com a recepção.\n" +
            "Telefone: +55 31 98600-3666\n\n" +
            "Digite *'Menu'* para voltar ao início."
          );

        case 'lista_espera':
          setState(phone, 'lista_espera_confirmada');
          // cria entrada na waitlist
          try {
            const ctx = getContext(phone);
            await createWaitlistEntry({
              cpf: ctx.cpf,
              name: ctx.nome,
              phone,
              email: ctx.email,
              motivo: 'Lista de espera via chatbot',
              prioridade: 'media'
            });
            await createNotification({ type: 'espera', title: 'Novo na lista de espera', message: `Telefone ${phone}` });
          } catch {}
          return (
            "⏳ *Lista de Espera*\n\n" +
            "✅ Adicionado à lista de espera!\n" +
            "Entraremos em contato quando houver vaga.\n\n" +
            "Digite *menu* para voltar ao início."
          );
      }
      break;

    case '2':
      // como não é você, pede o CPF de novo
      setState(phone, 'aguardando_cpf');
      return (
        "❌ Entendi, não é você. Por favor, digite seu *CPF* novamente (apenas números):\n\n" +
        "Exemplo: 12345678901\n\n" +
        "Digite *voltar* para retornar ao menu principal."
      );

    case '0':
      setState(phone, 'menu_principal');
      return handleMenuPrincipal(phone, 'menu');

    default:
      return (
        "❌ Opção inválida!\n\n" +
        "1️⃣ Sim\n" +
        "2️⃣ Não\n" +
        "0️⃣ Menu"
      );
  }
}

// 👩‍💼 Secretária
function handleAtendimentoHumano(phone, message) {
  if (message === '1') {
    setState(phone, 'menu_principal');
    return handleMenuPrincipal(phone, 'menu');
  } else {
    return (
      "👩‍💼 *Secretária*\n\n" +
      "☎️ Telefone: +55 31 98600-3666\n" +
      "📧 Email: contato@gabrielanassif.com\n" +
      "🕐 Horário: Segunda a Sexta, 8h às 18h\n\n" +
      "Digite *1* para voltar ao menu principal."
    );
  }
}

// ✅ Confirmando agendamento
async function handleConfirmandoAgendamento(phone, message) {
  const context = getContext(phone);
  const messageLower = message.toLowerCase().trim();

  switch (messageLower) {
    case '1':
    case 'confirmar':
      try {
        // Validar se o contexto está completo
        if (!context?.token || !context?.cpf || !context?.dataSelecionada || !context?.horaSelecionada) {
          throw new Error("Dados insuficientes para agendar a consulta.");
        }

        // Formata data_agendamento usando a função auxiliar
        const dataAgendamento = formatarDataHora(context.dataSelecionada, context.horaSelecionada);

        // Calcula data_fim_agendamento (20 minutos depois) usando a função auxiliar
        const dataFimAgendamento = calcularDataFimAgendamento(context.dataSelecionada, context.horaSelecionada);

        // Monta o payload conforme a API
        const payload = {
          data_agendamento: dataAgendamento,
          data_fim_agendamento: dataFimAgendamento,
          cpf: context.cpf,
          token: context.token,
          primeiro_atendimento: context.tipo_consulta === "Primeira consulta"
        };

        console.log("[FlowController] Payload preparado:", JSON.stringify(payload, null, 2));
        console.log("[FlowController] Verificação: data_fim_agendamento deve ser 20 minutos após data_agendamento");

        // Chamada para a API (lança erro se falhar)
        await gestaodsService.agendarConsulta(payload);

        // Registrar aprovação automática na dashboard (opção B)
        console.log(`[FLOW] Tentando registrar agendamento na dashboard...`);
        console.log(`[FLOW] Dados do contexto:`, {
          cpf: context.cpf,
          phone,
          dataSelecionada: context.dataSelecionada,
          horaSelecionada: context.horaSelecionada,
          tipo_consulta: context.tipo_consulta
        });
        
        try {
          const resultado = await insertAppointmentRequest({
            cpf: context.cpf,
            phone,
            requested_date: context.dataSelecionada,
            requested_time: context.horaSelecionada,
            tipo: context.tipo_consulta,
            status: 'pending'
          });
          console.log(`✅ Agendamento registrado na dashboard: CPF ${context.cpf}`);
          console.log(`✅ Resultado da inserção:`, resultado);
        } catch (error) {
          console.error(`❌ Erro ao registrar agendamento na dashboard:`, error.message);
          console.error(`❌ Stack trace:`, error.stack);
        }
        
        try {
          await createNotification({
            type: 'agendamento',
            title: 'Agendamento confirmado',
            message: `CPF ${context.cpf} agendado para ${context.dataSelecionada} às ${context.horaSelecionada}`
          });
          console.log(`✅ Notificação criada na dashboard`);
        } catch (error) {
          console.error(`❌ Erro ao criar notificação:`, error.message);
        }

        setState(phone, 'agendamento_confirmado');

        const msg1 = (
          "✅ *Agendamento realizado com sucesso!*\n\n" +
          `📅 Data: ${context.dataSelecionada}\n` +
          `⏰ Horário: ${context.horaSelecionada}\n` +
          `👤 Tipo: ${context.tipo_consulta || 'Consulta'}\n` +
          `📍 Endereço: Av. do Contorno, 4747 - Serra\n\n` +
          "A clínica agradece seu contato.\n\n" +
          "Se precisar de algo mais, digite *'Menu'* a qualquer momento."
        );
        const msg2 = handleMenuPrincipal(phone, 'menu');
        try { await logMessageToSupabase(phone, 'out', msg1); } catch {}
        return [msg1, msg2];

      } catch (erro) {
        console.error("❌ Erro ao agendar consulta:", erro.message);
        return "❌ Erro ao agendar consulta. Tente novamente mais tarde.";
      }

    case '2':
    case 'alterar':
      setState(phone, 'escolhendo_data');
      return [
        "✏️ Ok! Vamos alterar os dados.",
        ("📅 *Datas disponíveis para consulta:*\n\n" +
          context.datasDisponiveis.map((data, index) => {
            const numEmoji = numeroParaEmoji(index + 1);
            return `${numEmoji} - ${data.data}`;
          }).join('\n') +
          "\n\nDigite o número da data desejada:")
      ];

    case '3':
    case 'cancelar':
      setState(phone, 'inicio');
      setContext(phone, {});
      createNotification({ type: 'agendamento', title: 'Agendamento cancelado', message: `Usuário ${phone} cancelou etapa de confirmação.` });
      try { await logMessageToSupabase(phone, 'out', '❌ Agendamento cancelado.'); } catch {}
      return [
        '❌ Agendamento cancelado.',
        handleInicio(phone, 'oi')
      ];

    default:
      return (
        "❌ Opção inválida!\n\n" +
        "📋 *Confirmação do Agendamento*\n\n" +
        `📅 Data: *${context.dataAgendamento}*\n` +
        `⏰ Horário: *${context.horaSelecionada}*\n` +
        `🧾 CPF: *${context.cpf}*\n` +
        `👤 Tipo: *${context.tipo_consulta}*\n\n` +
        "Deseja confirmar o agendamento?\n\n" +
        "Digite:\n" +
        "1️⃣ Confirmar\n" +
        "2️⃣ Alterar\n" +
        "3️⃣ Cancelar\n\n" +
        "Ou envie: *confirmar*, *alterar* ou *cancelar*."
      );
  }
}



// 📅 Escolhendo data
async function handleEscolhendoData(phone, message) {
  const context = getContext(phone);
  const messageLower = (message || '').toLowerCase().trim();
  if (messageLower === 'mais') {
    try {
      // Próximo mês: baseia-se no último dia listado ou no mês atual
      let base = Array.isArray(context.datasDisponiveis) && context.datasDisponiveis.length > 0
        ? context.datasDisponiveis[context.datasDisponiveis.length - 1].data
        : null;
      const ref = base ? getMesAnoDeDataBR(base) : getMesAnoDeDataBR((() => {
        const h = new Date();
        return `${String(h.getDate()).padStart(2,'0')}/${String(h.getMonth()+1).padStart(2,'0')}/${h.getFullYear()}`;
      })());
      const dataInicioProxMes = primeiroDiaDoProximoMes(ref.mes, ref.ano);
      const diasAll = await buscarDatasDisponiveis(context.token, dataInicioProxMes);
      let dias = Array.isArray(diasAll) ? diasAll.filter((d) => {
        const ma = getMesAnoDeDataBR(d.data);
        const prox = getMesAnoDeDataBR(dataInicioProxMes);
        return ma && prox && ma.mes === prox.mes && ma.ano === prox.ano;
      }) : diasAll;

      // Filtra para manter apenas dias que realmente possuem horários dentro do expediente
      let diasComHorario = [];
      const horariosPorDataNovos = {};
      for (const d of (Array.isArray(dias) ? dias : [])) {
        try {
          const horariosDia = await buscarHorariosDisponiveis(context.token, d.data);
          const ok = filterHorariosPorExpediente(d.data, Array.isArray(horariosDia) ? horariosDia : []);
          if (ok.length > 0) {
            diasComHorario.push(d);
            horariosPorDataNovos[d.data] = ok;
          }
        } catch {}
      }

      if (!diasComHorario || diasComHorario.length === 0) {
        return (
          "❌ Não há mais datas disponíveis no momento.\n\n" +
          "Digite *'Menu'* para voltar ao início ou escolha uma das datas já listadas."
        );
      }

      let msgDatas = "📅 *Mais datas disponíveis para consulta:*\n\n";
      diasComHorario.forEach((data, index) => {
        const numEmoji = numeroParaEmoji(index + 1);
        msgDatas += `${numEmoji} - ${data.data}\n`;
      });
      const numMais = numeroParaEmoji(diasComHorario.length + 1);
      msgDatas += `\n${numMais} - VER MAIS DATAS`;
      msgDatas += "\n\nDigite o número da opção desejada.";

      const prox = getMesAnoDeDataBR(dataInicioProxMes);
      // Mescla datas e horários com o que já havia no contexto
      context.datasDisponiveis = diasComHorario;
      context.horariosPorData = { ...(context.horariosPorData || {}), ...horariosPorDataNovos };
      context.mesListando = `${String(prox.mes).padStart(2,'0')}/${prox.ano}`;
      setContext(phone, context);
      return msgDatas;
    } catch (error) {
      console.error('Erro ao paginar datas:', error);
      return (
        "❌ Ocorreu um erro ao buscar mais datas.\n" +
        "Tente novamente mais tarde ou digite *menu* para voltar ao início."
      );
    }
  }

  const opcao = parseInt(message);

  // Se escolheu o número da opção "VER MAIS DATAS"
  if (Array.isArray(context.datasDisponiveis) && opcao === context.datasDisponiveis.length + 1) {
    // Aciona o mesmo comportamento do comando "mais"
    return await handleEscolhendoData(phone, 'mais');
  }

  if (!context.datasDisponiveis || isNaN(opcao) || opcao < 1 || opcao > context.datasDisponiveis.length) {
    return (
      "❌ Opção inválida!\n\n" +
      "Por favor, digite o número correspondente à data desejada."
    );
  }

  const dataSelecionada = context.datasDisponiveis[opcao - 1].data;
  context.dataSelecionada = dataSelecionada;
  setContext(phone, context);

  try {
    // Consulta à API oficial usando função segura
    let horarios = await buscarHorariosDisponiveis(context.token, dataSelecionada);
    horarios = filterHorariosPorExpediente(dataSelecionada, Array.isArray(horarios) ? horarios : []);
    if ((!horarios || horarios.length === 0) && context.horariosPorData && Array.isArray(context.horariosPorData[dataSelecionada])) {
      // usa backup calculado na fase de listagem, se existir
      horarios = context.horariosPorData[dataSelecionada];
    }

    if (!horarios || horarios.length === 0) {
      // Segurança extra: se a API de horários vier vazia, peça para selecionar novamente
      return "❌ Horários indisponíveis para essa data. Selecione outra data da lista.";
    }

    let mensagem = `🕒 *Horários disponíveis para ${dataSelecionada}:*\n\n`;
    horarios.forEach((horario, index) => {
      const numEmoji = numeroParaEmoji(index + 1);
      mensagem += `${numEmoji} - ${horario}\n`;
    });
    const numVoltar = numeroParaEmoji(horarios.length + 1);
    mensagem += `\n${numVoltar} - VOLTAR E ESCOLHER OUTRA DATA`;

    mensagem += "\n\nDigite o número do horário desejado:";
    context.horariosDisponiveis = horarios;
    setContext(phone, context);
    setState(phone, 'escolhendo_horario');

    return mensagem;

  } catch (error) {
    console.error('Erro ao buscar horários:', error);
    return (
      "❌ Erro ao buscar os horários disponíveis.\n" +
      "Tente novamente mais tarde ou digite *menu* para voltar ao início."
    );
  }
}

// 🕐 Escolhendo horário
async function handleEscolhendoHorario(phone, message) {
  const context = getContext(phone);
  const msgLower = (message || '').toLowerCase().trim();
  const opcao = parseInt(message);

  // Voltar por texto
  if (msgLower === 'voltar') {
    setState(phone, 'escolhendo_data');
    const dias = Array.isArray(context.datasDisponiveis) ? context.datasDisponiveis : [];
    if (!dias.length) return "🔙 Voltando. Digite 'Menu' para recomeçar.";
    let lista = "📅 *Datas disponíveis para consulta:*\n\n";
    dias.forEach((d, i) => {
      const numEmoji = numeroParaEmoji(i + 1);
      lista += `${numEmoji} - ${d.data}\n`;
    });
    const numMais = numeroParaEmoji(dias.length + 1);
    lista += `\n${numMais} - VER MAIS DATAS`;
    lista += "\n\nDigite o número da opção desejada.";
    return lista;
  }

  // Voltar por opção numerada (último item)
  if (Array.isArray(context.horariosDisponiveis) && opcao === context.horariosDisponiveis.length + 1) {
    setState(phone, 'escolhendo_data');
    const dias = Array.isArray(context.datasDisponiveis) ? context.datasDisponiveis : [];
    if (!dias.length) return "🔙 Voltando. Digite 'Menu' para recomeçar.";
    let lista = "📅 *Datas disponíveis para consulta:*\n\n";
    dias.forEach((d, i) => {
      const numEmoji = numeroParaEmoji(i + 1);
      lista += `${numEmoji} - ${d.data}\n`;
    });
    const numMais = numeroParaEmoji(dias.length + 1);
    lista += `\n${numMais} - VER MAIS DATAS`;
    lista += "\n\nDigite o número da opção desejada.";
    return lista;
  }

  if (!context.horariosDisponiveis || isNaN(opcao) || opcao < 1 || opcao > context.horariosDisponiveis.length) {
    return (
      "❌ Opção inválida!\n\n" +
      "Por favor, digite o número correspondente ao horário desejado."
    );
  }

  const horarioSelecionado = context.horariosDisponiveis[opcao - 1];

  // Se o horário for uma string simples, usa ela diretamente
  // Se for um objeto, extrai as propriedades necessárias
  let horaInicio, horaFim;

  if (typeof horarioSelecionado === 'string') {
    horaInicio = horarioSelecionado;
    horaFim = horarioSelecionado; // Assumindo mesmo horário se não especificado
  } else if (horarioSelecionado.hora_inicio) {
    horaInicio = horarioSelecionado.hora_inicio;
    horaFim = horarioSelecionado.hora_fim || horarioSelecionado.hora_inicio;
  } else {
    horaInicio = horarioSelecionado;
    horaFim = horarioSelecionado;
  }

  try {
    // Busca a última consulta para determinar o tipo
    const ultimaConsulta = await buscarUltimaConsulta(context.cpf, context.token);
    const tipoConsulta = calcularTipoConsulta(ultimaConsulta);

    // Salva os dados do agendamento no contexto para confirmação
    context.horaSelecionada = horaInicio;
    context.dataAgendamento = context.dataSelecionada;
    context.ultima_consulta = ultimaConsulta;
    context.tipo_consulta = tipoConsulta;
    setContext(phone, context);

    setState(phone, 'confirmando_agendamento');

    return (
      "📋 *Confirmação do Agendamento*\n\n" +
      `📅 Data: *${context.dataSelecionada}*\n` +
      `⏰ Horário: *${horaInicio}*\n` +
      `🧾 CPF: *${context.cpf}*\n` +
      `👤 Tipo: *${tipoConsulta}*\n\n` +
      "Deseja confirmar o agendamento?\n\n" +
      "Digite:\n" +
      "1️⃣ Confirmar\n" +
      "2️⃣ Alterar\n" +
      "3️⃣ Cancelar\n\n" +
      "Ou envie: *confirmar*, *alterar* ou *cancelar*."
    );

  } catch (error) {
    console.error('Erro ao preparar confirmação do agendamento:', error);
    return (
      "❌ Ocorreu um erro ao preparar a confirmação do agendamento.\n" +
      "Tente novamente ou digite *menu* para voltar ao início."
    );
  }
}

// 📋 Função genérica para estados finais
function handleEstadoFinal(phone, message) {
  const messageLower = message.toLowerCase().trim();

  if (
    messageLower === 'menu' ||
    messageLower.includes('menu') ||
    messageLower.includes('oi') ||
    messageLower.includes('olá') ||
    messageLower.includes('ola') ||
    messageLower.includes('bom dia') ||
    messageLower.includes('boa tarde') ||
    messageLower.includes('boa noite')
  ) {
    // Vai para o menu principal e exibe as opções
    setState(phone, 'menu_principal');
    setContext(phone, {});
    // Limpeza ao finalizar
    delete agendamentosPendentes[phone];
    delete agendamentoSelecionado[phone];
    // Reutiliza sua função de menu
    return handleMenuPrincipal(phone, 'menu');
  } else {
    return (
      "Digite *'Menu'* para acessar o menu principal."
    );
  }
}

// 🧠 Função principal do flowController
async function flowController(message, phone) {
  const state = getState(phone);
  console.log(`🧠 Processando mensagem do usuário ${phone} no estado: ${state}`);
  try { await logMessageToSupabase(phone, 'in', message); } catch {}

  // ⏳ Verifica inatividade antes de processar o restante do fluxo
  try {
    const nowTs = Date.now();
    const ctx0 = getContext(phone);
    const lastTs = Number(ctx0.lastInteractionAt || 0);
    const maxIdleMs = Math.max(1, INACTIVITY_MINUTES) * 60 * 1000;

    if (lastTs && nowTs - lastTs > maxIdleMs) {
      // Encerra sessão por inatividade e reinicia o fluxo
      setState(phone, 'inicio');
      setContext(phone, {});
      return [
        `⏰ Seu atendimento foi encerrado por inatividade (mais de ${Math.round((nowTs - lastTs) / 60000)} minutos).`,
        handleInicio(phone, 'oi')
      ];
    }

    // Atualiza timestamp da última interação
    setContext(phone, { lastInteractionAt: nowTs });
  } catch (e) {
    // Em caso de qualquer falha, não bloqueia o fluxo
  }

  try {
    // Qualquer nova mensagem cancela um eventual auto-encerramento pendente
    try { clearAutoClose(phone); } catch {}

    // Interceptação global para saudações ou "menu" em qualquer estado
    const messageLowerGlobal = message.toLowerCase().trim();
    const isGreetingGlobal = (
      messageLowerGlobal.includes('oi') ||
      messageLowerGlobal.includes('olá') ||
      messageLowerGlobal.includes('ola') ||
      messageLowerGlobal.includes('bom dia') ||
      messageLowerGlobal.includes('boa tarde') ||
      messageLowerGlobal.includes('boa noite')
    );
    if (messageLowerGlobal === 'menu' || messageLowerGlobal.includes('menu') || isGreetingGlobal) {
      setState(phone, 'menu_principal');
      setContext(phone, {});
      delete agendamentosPendentes[phone];
      delete agendamentoSelecionado[phone];
      return handleMenuPrincipal(phone, 'menu');
    }

    // Tratamento direto dos estados de reagendamento
    const context = getContext(phone);

    if (context.estado === "reagendando_nova_data") {
      const messageLower = message.toLowerCase().trim();

      if (messageLower === 'menu') {
        setState(phone, 'inicio');
        setContext(phone, {});
        return (
          "🔄 Voltando ao início...\n\n" +
          "Digite *oi* para começar novamente."
        );
      }

      const novaData = message.trim();

      const dataRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!dataRegex.test(novaData)) {
        return "❌ Data inválida. Digite no formato *DD/MM/AAAA*.";
      }

      context.nova_data = novaData;
      context.estado = "reagendando_novo_horario";
      setContext(phone, context);

      return `⏰ Agora digite o *novo horário* desejado para a data ${novaData} (formato 24h: HH:MM).`;
    }

    if (context.estado === "reagendando_novo_horario") {
      const messageLower = message.toLowerCase().trim();

      if (messageLower === 'menu') {
        setState(phone, 'inicio');
        setContext(phone, {});
        return (
          "🔄 Voltando ao início...\n\n" +
          "Digite *oi* para começar novamente."
        );
      }

      const hora = message.trim();
      const horaRegex = /^\d{2}:\d{2}$/;
      if (!horaRegex.test(hora)) {
        return "❌ Horário inválido. Digite no formato *HH:MM* (ex: 14:30).";
      }

      const novaDataHora = `${context.nova_data} ${hora}:00`;

      // Define data_fim como +20min (ou o tempo padrão do agendamento)
      const [dia, mes, ano] = context.nova_data.split("/");
      const [h, m] = hora.split(":");
      const start = new Date(ano, mes - 1, dia, h, m);
      const end = new Date(start.getTime() + 20 * 60000); // +20min
      const data_fim = `${String(end.getDate()).padStart(2, "0")}/${String(end.getMonth() + 1).padStart(2, "0")}/${end.getFullYear()} ${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}:00`;

      // Monta payload
      const payload = {
        data_agendamento: novaDataHora,
        data_fim_agendamento: data_fim,
        token: context.token,
        agendamento: context.token_agendamento
      };

      try {
        const resposta = await axios.put(`https://apidev.gestaods.com.br/api/agendamento/reagendar/`, payload);
        context.estado = null;
        setState(phone, 'agendamento_confirmado');
        setContext(phone, context);
        // registrar solicitação de reagendamento aprovada
        try {
          await insertRescheduleRequest({ phone, requested_date: context.nova_data, requested_time: hora, status: 'approved' });
          await createNotification({ type: 'reagendamento', title: 'Reagendamento confirmado', message: `Novo: ${context.nova_data} ${hora}` });
        } catch {}
        return `✅ Consulta reagendada com sucesso para *${novaDataHora}*!`;
      } catch (error) {
        console.error("Erro ao reagendar:", error.response?.data || error.message);
        context.estado = null;
        setState(phone, 'inicio');
        setContext(phone, context);
        // registra pedido pendente
        try { await insertRescheduleRequest({ phone, requested_date: context.nova_data, requested_time: hora, status: 'pending' }); } catch {}
        return "❌ Erro ao reagendar. Tente novamente mais tarde.";
      }
    }

    // 🔙 Interceptação Global para "0" ou "voltar"
    if (message.trim() === '0' || message.trim().toLowerCase() === 'voltar') {
      console.log(`[FLOW] Usuário ${phone} digitou "${message}" - retornando ao menu principal`);
      
      // Se estiver no menu principal, sai completamente do sistema
      if (state === 'menu_principal') {
        setState(phone, 'inicio');
        setContext(phone, {});
        return (
          "👋 Obrigado por usar nosso atendimento!\n\n" +
          "Volte sempre! 😊"
        );
      }
      
      // Se estiver em estado de erro de cadastro, redireciona para secretária
      if (state === 'confirmando_cadastro' && context.erroCadastro) {
        setState(phone, 'atendimento_humano');
        setContext(phone, {});
        return (
          "📞 *Redirecionando para secretária*\n\n" +
          "Uma secretária irá ajudá-lo com o cadastro.\n\n" +
          "👩‍💼 *Secretária*\n\n" +
          "☎️ Telefone: +55 31 98600-3666\n" +
          "📧 Email: contato@gabrielanassif.com\n" +
          "🕐 Horário: Segunda a Sexta, 8h às 18h\n\n" +
          "Digite *1* para voltar ao menu principal."
        );
      }
      
      // Para outros estados, volta ao menu principal
      setState(phone, 'menu_principal');
      setContext(phone, {});
      return (
        "🔙 *Retornando ao menu principal...*\n\n" +
        obterSaudacao() + "\n\n" +
        "Sou seu assistente virtual.\n\n" +
        "*Digite o número da opção desejada:*\n\n" +
        "1️⃣ *Agendar consulta*\n" +
        "2️⃣ *Ver meus agendamentos*\n" +
        "3️⃣ *Lista de espera*\n" +
        "4️⃣ *Falar com secretária*\n\n" +
        "Digite *0* ou *voltar* para sair"
      );
    }

    switch (state) {
      case 'inicio':
        return handleInicio(phone, message);

      case 'menu_principal':
        return handleMenuPrincipal(phone, message);

      case 'aguardando_cpf':
        return await handleAguardandoCpf(phone, message);

      case 'aguardando_nome':
        return await handleAguardandoNome(phone, message);

      case 'solicitando_dados':
        return handleSolicitandoDados(phone, message);

      case 'solicitando_email':
        return handleSolicitandoEmail(phone, message);

      case 'aguardando_celular':
        return handleAguardandoCelular(phone, message);

      case 'confirmando_cadastro':
        return await handleConfirmandoCadastro(phone, message);

      case 'confirmando_paciente':
        return await handleConfirmandoPaciente(phone, message);

      case 'escolhendo_data':
        return await handleEscolhendoData(phone, message);

      case 'escolhendo_horario':
        return await handleEscolhendoHorario(phone, message);

      case 'confirmando_agendamento':
        return await handleConfirmandoAgendamento(phone, message);

      case 'ver_agendamentos':
        // Redireciona para o estado de confirmar paciente para buscar por nome
        setState(phone, 'confirmando_paciente');
        setContext(phone, { acao: 'visualizar' });
        return (
          "📋 Visualizar Agendamentos\n\n" +
          "Por favor, digite seu *nome completo* para vermos seus agendamentos.\n\n" +
          "Digite *voltar* para retornar ao menu principal."
        );

      case 'aguardando_acao_agendamento':
        return await handleAguardandoAcaoAgendamento(phone, message);

      case 'aguardando_agendamento_para_acao':
        return await selecionarAgendamentoParaEditar(message, getContext(phone), phone);

      case 'escolher_acao_agendamento':
        return await decidirAcaoAgendamento(message, getContext(phone), phone);

      case 'aguardando_selecao_agendamento':
        return await handleAguardandoSelecaoAgendamento(phone, message);
      
      case 'aguardando_escolha_agendamento':
        return await handleAguardandoEscolhaAgendamento(phone, message);
      
      case 'opcao_reagendar_cancelar':
        return await handleOpcaoReagendarCancelar(phone, message);
        
        case 'reagendar_em_andamento':
          setState(phone, 'finalizado');
          return '🔄 Funcionalidade de reagendamento em desenvolvimento. Por favor, entre em contato com a recepção.';
        
        case 'cancelar_em_andamento':
          setState(phone, 'finalizado');
          return '🗑️ Funcionalidade de cancelamento em desenvolvimento. Por favor, entre em contato com a recepção.';
        
        case 'iniciando_reagendamento':
          setState(phone, 'finalizado');
          return '🔄 Funcionalidade de reagendamento em desenvolvimento. Por favor, entre em contato com a recepção.';



      case 'atendimento_humano':
        return handleAtendimentoHumano(phone, message);

      case 'aguardando_atendimento_secretaria':
        return (
          "👩‍💼 *Aguardando atendimento da secretária*\n\n" +
          "Sua solicitação foi registrada e uma secretária irá atendê-lo em breve.\n\n" +
          "Digite *'Menu'* para voltar ao início ou aguarde o contato da secretária."
        );

      case 'agendamento_confirmado':
      case 'visualizando_agendamentos':
      case 'cancelamento_confirmado':
      case 'lista_espera_confirmada':
      case 'cadastro_confirmado':
      case 'reagendamento_manual':
      case 'cancelamento_manual':
      case 'finalizado':
        return handleEstadoFinal(phone, message);

      default:
        console.log(`⚠️ Estado desconhecido: ${state}, resetando para início`);
        setState(phone, 'inicio');
        setContext(phone, {});
        return handleInicio(phone, message);
    }
  } catch (error) {
    console.error(`❌ Erro no flowController para ${phone}:`, error);
    setState(phone, 'inicio');
    setContext(phone, {});
    return [
      "❌ Erro no sistema. Voltando ao início...",
      handleInicio(phone, 'oi')
    ];
  }
}

// ✅ FlowController Corrigido
const FlowController = {
  async agendarConsulta(context) {
    try {
      // Validar se o contexto está completo
      if (!context?.token || !context?.cpf || !context?.dataSelecionada || !context?.horaSelecionada) {
        throw new Error("Dados insuficientes para agendar a consulta.");
      }

      // Formata data_agendamento usando a função auxiliar
      const dataAgendamento = formatarDataHora(context.dataSelecionada, context.horaSelecionada);

      // Calcula data_fim_agendamento (20 minutos depois) usando a função auxiliar
      const dataFimAgendamento = calcularDataFimAgendamento(context.dataSelecionada, context.horaSelecionada);

      // Monta o payload conforme a API
      const payload = {
        data_agendamento: dataAgendamento,
        data_fim_agendamento: dataFimAgendamento,
        cpf: context.cpf,
        token: context.token,
        primeiro_atendimento: context.tipo_consulta === "Primeira consulta"
      };

      console.log("[FlowController] Payload preparado:", JSON.stringify(payload, null, 2));
      console.log("[FlowController] Verificação: data_fim_agendamento deve ser 20 minutos após data_agendamento");

      // Chamada para a API
      const resposta = await gestaodsService.agendarConsulta(payload);

      if (resposta?.status === 200 || resposta?.status === 201) {
        console.log("[FlowController] Consulta agendada com sucesso:", resposta.data);
        return resposta.data;
      } else {
        console.error("[GestãoDS] Erro ao agendar consulta:", resposta?.data || resposta);
        throw new Error("Erro ao agendar a consulta.");
      }

    } catch (erro) {
      console.error("❌ Erro ao agendar consulta:", erro.message);
      return "❌ Erro ao agendar consulta. Tente novamente mais tarde.";
    }
  }
};

// 🔄 Funções para o fluxo de reagendamento



// 📋 Função para selecionar agendamento para editar
async function selecionarAgendamentoParaEditar(message, context, phone) {
  const messageLower = message.toLowerCase().trim();

  if (messageLower === 'menu') {
    setState(phone, 'inicio');
    setContext(phone, {});
    return (
      "🔄 Voltando ao início...\n\n" +
      "Digite *oi* para começar novamente."
    );
  }

  const index = parseInt(message.trim()) - 1;
  const lista = context.lista_agendamentos || [];

  if (isNaN(index) || index < 0 || index >= lista.length) {
    return (
      "❌ Número inválido. Tente novamente digitando o número do agendamento.\n\n" +
      "Digite *'Menu'* para voltar ao início."
    );
  }

  const agendamentoSelecionado = lista[index];
  context.agendamentoSelecionado = agendamentoSelecionado;
  setContext(phone, context);
  setState(phone, 'escolher_acao_agendamento');

  return (
    `📅 *Agendamento selecionado:* ${agendamentoSelecionado.data || agendamentoSelecionado.data_agendamento} às ${agendamentoSelecionado.hora}\n\n` +
    "Digite:\n" +
    "1️⃣ para *Reagendar*\n" +
    "2️⃣ para *Cancelar*\n\n" +
    "Digite *menu* para voltar ao início."
  );
}

// 🔄 Função para decidir ação do agendamento
async function decidirAcaoAgendamento(message, context, phone) {
  const messageLower = message.toLowerCase().trim();

  if (messageLower === 'menu') {
    setState(phone, 'inicio');
    setContext(phone, {});
    return (
      "🔄 Voltando ao início...\n\n" +
      "Digite *oi* para começar novamente."
    );
  }

  if (message === '1' || messageLower.includes('reagendar') || message === 'ACT_REAGENDAR') {
    context.estado = "reagendando_nova_data";
    setContext(phone, context);
    return (
      "📆 Envie a nova data no formato *dd/mm/aaaa* para reagendar:\n\n" +
      "Exemplo: 25/12/2024\n\n" +
      "Digite *'Menu'* para voltar ao início."
    );
  }

  if (message === '2' || messageLower.includes('cancelar') || message === 'ACT_CANCELAR') {
    try {
      await insertCancelRequest({ phone, motivo: 'Solicitado via chatbot', status: 'pending' });
      await createNotification({ type: 'cancelamento', title: 'Solicitação de cancelamento', message: `Telefone ${phone}` });
    } catch {}
    setState(phone, 'finalizado');
    return (
      "❌ Cancelamento solicitado.\n\n" +
      "Uma secretária entrará em contato em breve.\n\n" +
      "Digite *'Menu'* para voltar ao início."
    );
  }

  if (message === '3' || messageLower.includes('voltar') || message === 'ACT_VOLTAR') {
    setState(phone, 'inicio');
    setContext(phone, {});
    return (
      "🔄 Voltando ao menu principal...\n\n" +
      "Digite *oi* para começar novamente."
    );
  }

  return (
    "❌ Opção inválida. Digite *1* para Reagendar, *2* para Cancelar ou *3* para Voltar ao menu.\n\n" +
    "Digite *menu* para voltar ao início."
  );
}

// 🔄 Função para aguardar escolha de agendamento
async function handleAguardandoEscolhaAgendamento(phone, message) {
  const messageLower = message.toLowerCase().trim();
  
  if (messageLower === 'menu') {
    setState(phone, 'inicio');
    setContext(phone, {});
    // Limpeza ao finalizar
    delete agendamentosPendentes[phone];
    delete agendamentoSelecionado[phone];
    return (
      "🔄 Voltando ao início...\n\n" +
      "Digite *oi* para começar novamente."
    );
  }

  const index = parseInt(message.trim()) - 1;
  const context = getContext(phone);
  const agendamentos = context?.agendamentosListados;

  if (isNaN(index) || index < 0 || index >= agendamentos.length) {
    return '❌ Número inválido. Por favor, selecione um número válido da lista.';
  }

  const agendamentoSelecionado = agendamentos[index];
  context.agendamentoSelecionado = agendamentoSelecionado;
  setContext(phone, context);
  setState(phone, 'opcao_reagendar_cancelar');

  if (USE_INTERACTIVE) {
    const prefix = `✅ Você selecionou:\n📅 *${agendamentoSelecionado.data_agendamento}*\n👨‍⚕️ ${agendamentoSelecionado.medico?.nome || 'Médico não informado'}`;
    return buildActionButtons(prefix);
  }
  return `✅ Você selecionou:\n📅 *${agendamentoSelecionado.data_agendamento}*\n👨‍⚕️ ${agendamentoSelecionado.medico?.nome || 'Médico não informado'}\n\nDigite:\n1️⃣ Reagendar\n2️⃣ Cancelar\n3️⃣ Voltar`;
}

// 🔄 Função para aguardar seleção de agendamento
async function handleAguardandoSelecaoAgendamento(phone, message) {
  const indexEscolhido = parseInt(message);

  const contexto = await recuperarContexto(phone);
  const lista = contexto?.agendamentosDisponiveis || [];

  const agendamento = lista.find((item) => item.index === indexEscolhido);

  if (!agendamento) {
    return '❌ Número inválido. Por favor, digite o número de um agendamento listado.';
  }

  await salvarContexto(phone, {
    ...contexto,
    agendamentoSelecionado: agendamento
  });

  await salvarEstado(phone, 'aguardando_acao_agendamento');
  setState(phone, 'aguardando_acao_agendamento');

  if (USE_INTERACTIVE) {
    const prefix = `Você selecionou o agendamento com *${agendamento.medico}* no dia *${agendamento.data}*.`;
    return buildActionButtons(prefix);
  }
  return `Você selecionou o agendamento com *${agendamento.medico}* no dia *${agendamento.data}*.

Deseja:
1️⃣ Reagendar  
2️⃣ Cancelar  

Digite o número da opção.`;
}

// 🔄 Função para aguardar ação do agendamento
async function handleAguardandoAcaoAgendamento(phone, message) {
  const contexto = await recuperarContexto(phone);
  const agendamento = contexto?.agendamentoSelecionado;

  if (!agendamento) {
    await salvarEstado(phone, 'finalizado');
    return '⚠️ Ocorreu um erro ao recuperar seu agendamento. Digite *\'Menu\'* para recomeçar.';
  }

  if (message === '1') {
    try {
      const currentDateTime = agendamento?.data || agendamento?.raw?.data_agendamento || agendamento?.raw?.data || null;
      const tokenAgendamento = agendamento?.token || agendamento?.raw?.token || agendamento?.raw?.agendamento || null;
      await insertRescheduleRequest({
        phone,
        current_datetime: currentDateTime,
        token_agendamento: tokenAgendamento,
        status: 'pending'
      });
      await createNotification({
        type: 'reagendamento',
        title: 'Solicitação de reagendamento',
        message: `Telefone ${phone} - Pedido de reagendamento para ${currentDateTime || 'agendamento selecionado'}`
      });
    } catch (e) {}

    await salvarEstado(phone, 'finalizado');
    setState(phone, 'finalizado');
    return `📅 Solicitação de reagendamento registrada. Uma secretária entrará em contato para definir a nova data.`;
  }

  if (message === '2') {
    try {
      const tokenAgendamento = agendamento?.token || agendamento?.raw?.token || agendamento?.raw?.agendamento || null;
      await insertCancelRequest({
        phone,
        agendamento_token: tokenAgendamento,
        motivo: 'Solicitado via chatbot',
        status: 'pending'
      });
      await createNotification({
        type: 'cancelamento',
        title: 'Solicitação de cancelamento',
        message: `Telefone ${phone} - Pedido de cancelamento registrado`
      });
    } catch (e) {}

    await salvarEstado(phone, 'finalizado');
    setState(phone, 'finalizado');
    return `❌ Solicitação de cancelamento registrada. Em breve a secretária entrará em contato.`;
  }

  return 'Digite *1* para Reagendar ou *2* para Cancelar.';
}

// 🔄 Função para opção reagendar/cancelar
async function handleOpcaoReagendarCancelar(phone, message) {
  const context = getContext(phone);
  
  const msgLower = String(message).toLowerCase();
  const isReagendar = message === '1' || msgLower.includes('reagendar') || message === 'ACT_REAGENDAR';
  const isCancelar = message === '2' || msgLower.includes('cancelar') || message === 'ACT_CANCELAR';
  const isVoltar = message === '3' || msgLower.includes('voltar') || message === 'ACT_VOLTAR';

  if (isReagendar) {
    try {
      const ag = context.agendamentoSelecionado || {};
      const currentDateTime = ag.data_agendamento || ag.data || ag.current_datetime || null;
      const tokenAgendamento = ag.token || ag.agendamento || ag.token_agendamento || null;
      await insertRescheduleRequest({
        phone,
        current_datetime: currentDateTime,
        token_agendamento: tokenAgendamento,
        status: 'pending'
      });
      await createNotification({
        type: 'reagendamento',
        title: 'Solicitação de reagendamento',
        message: `Telefone ${phone} - Pedido de reagendamento para ${currentDateTime || 'agendamento selecionado'}`
      });
    } catch (e) {}
    setState(phone, 'finalizado');
    return '📅 Solicitação de reagendamento registrada no painel. Em breve a secretária entrará em contato.';
  } else if (isCancelar) {
    try {
      const ag = context.agendamentoSelecionado || {};
      const tokenAgendamento = ag.token || ag.agendamento || ag.token_agendamento || null;
      await insertCancelRequest({
        phone,
        agendamento_token: tokenAgendamento,
        motivo: 'Solicitado via chatbot',
        status: 'pending'
      });
      await createNotification({
        type: 'cancelamento',
        title: 'Solicitação de cancelamento',
        message: `Telefone ${phone} - Pedido de cancelamento registrado`
      });
    } catch (e) {}
    setState(phone, 'finalizado');
    return '❌ Solicitação de cancelamento registrada no painel. Em breve a secretária entrará em contato.';
  } else if (isVoltar) {
    setState(phone, 'menu_principal');
    delete context.agendamentoSelecionado;
    delete context.agendamentosListados;
    setContext(phone, context);
    return '🔙 Você voltou ao menu. Digite *\'Menu\'* para visualizar as opções novamente.';
  } else {
    return '❌ Opção inválida. Digite 1 para Reagendar, 2 para Cancelar ou 3 para Voltar.';
  }
}





// 📋 Função modificada para listar agendamentos com opção de edição
async function listarAgendamentosPorCPFComEdicao(context, phone) {
  try {
    const token = context.token || process.env.GESTAODS_TOKEN;
    const cpf = context.cpf;

    if (!token || !cpf) {
      console.error('[listarAgendamentosPorCPFComEdicao] Token ou CPF não informado');
      return (
        "❌ Erro: Dados insuficientes para buscar agendamentos.\n" +
        "Por favor, tente novamente ou digite *menu* para voltar ao início."
      );
    }

    console.log(`[listarAgendamentosPorCPFComEdicao] Buscando agendamentos para CPF: ${cpf}`);

    // Data inicial de busca (1 ano atrás)
    const dataInicial = moment().subtract(1, 'year').format('DD/MM/YYYY');
    const dataFinal = moment().add(1, 'year').format('DD/MM/YYYY');

    const url = `https://apidev.gestaods.com.br/api/dados-agendamento/listagem/${token}`;

    console.log(`[listarAgendamentosPorCPFComEdicao] URL: ${url}`);
    console.log(`[listarAgendamentosPorCPFComEdicao] Parâmetros: data_inicial=${dataInicial}, data_final=${dataFinal}`);

    const response = await axios.get(url, {
      params: {
        data_inicial: dataInicial,
        data_final: dataFinal
      },
      timeout: 10000 // 10 segundos de timeout
    });

    const todosAgendamentos = response.data;

    // Proteção contra resposta não-array
    const agendamentosArray = Array.isArray(todosAgendamentos?.data)
      ? todosAgendamentos.data
      : todosAgendamentos?.dados || [];

    console.log(`[listarAgendamentosPorCPFComEdicao] Total de agendamentos encontrados: ${agendamentosArray.length}`);

    // Filtra agendamentos do CPF específico
    const agendamentosFiltrados = agendamentosArray.filter(item => {
      const cpfItem = item.cpf || item.cpf_paciente || '';
      return cpfItem.toString() === cpf.toString();
    });

    console.log(`[listarAgendamentosPorCPFComEdicao] Agendamentos filtrados para CPF ${cpf}: ${agendamentosFiltrados.length}`);

    if (agendamentosFiltrados.length === 0) {
      return (
        "📋 *Seus Agendamentos*\n\n" +
        "❌ Nenhum agendamento encontrado para este CPF.\n\n" +
        "Digite *'Menu'* para voltar ao início."
      );
    }

    // Ordena por data (mais recentes primeiro)
    agendamentosFiltrados.sort((a, b) => {
      const dataA = new Date(a.data_agendamento || a.data);
      const dataB = new Date(b.data_agendamento || b.data);
      return dataB - dataA;
    });

    let mensagem = '📋 *Seus Agendamentos:*\n\n';

    agendamentosFiltrados.forEach((item, index) => {
      try {
        // formatação segura da data
        const raw = item.data_agendamento || item.data || item.data_consulta || '';
        const dataMoment = moment(raw, 'DD/MM/YYYY HH:mm', true);
        const dataFormatada = dataMoment.isValid()
          ? dataMoment.format('DD/MM/YYYY HH:mm')
          : raw;

        // Status do agendamento
        const status = item.status || item.situacao || 'Agendado';
        const statusEmoji = status.toLowerCase().includes('cancelado') ? '❌' :
          status.toLowerCase().includes('realizado') ? '✅' : '📅';

        // Informações adicionais
        const observacoes = item.observacoes || item.obs || '';
        const medico = item.medico || item.nome_medico || 'Dr. Gabriela';

        mensagem += `${statusEmoji} *${index + 1}. ${dataFormatada}*\n`;
        mensagem += `   👨‍⚕️ ${medico}\n`;
        mensagem += `   📝 Status: ${status}\n`;

        if (observacoes) {
          mensagem += `   📋 Obs: ${observacoes}\n`;
        }

        mensagem += '\n';
      } catch (error) {
        console.error(`[listarAgendamentosPorCPFComEdicao] Erro ao processar agendamento ${index}:`, error);
        mensagem += `📅 *${index + 1}. Agendamento (dados incompletos)*\n\n`;
      }
    });

    // Salva os dados temporariamente no contexto para edição
    context.lista_agendamentos = agendamentosFiltrados;
    setContext(phone, context);
    setState(phone, 'aguardando_agendamento_para_acao');

    mensagem += "Digite o número do agendamento que você deseja modificar (ex: 1, 2, 3...).\n\n";
    mensagem += "Digite *'Menu'* para voltar ao início.";

    return mensagem;

  } catch (error) {
    console.error('[listarAgendamentosPorCPFComEdicao] Erro:', error.message);

    if (error.code === 'ECONNABORTED') {
      return (
        "❌ Timeout ao buscar agendamentos.\n" +
        "A API está demorando para responder. Tente novamente mais tarde.\n\n" +
        "Digite *menu* para voltar ao início."
      );
    }

    if (error.response?.status === 401) {
      return (
        "❌ Erro de autenticação.\n" +
        "Token inválido ou expirado. Contate o suporte técnico.\n\n" +
        "Digite *menu* para voltar ao início."
      );
    }

    return (
      "❌ Erro ao buscar seus agendamentos.\n" +
      "Tente novamente mais tarde ou contate o suporte.\n\n" +
      "Digite *menu* para voltar ao início."
    );
  }
}

module.exports = {
  flowController,
  FlowController,
  visualizarAgendamentosPorNome,
  setContext
}; 