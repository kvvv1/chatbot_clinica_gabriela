const memoryStore = require('../utils/memoryStore');
const axios = require('axios');
const moment = require('moment');
const dayjs = require('dayjs');
const { buscarPacientePorCPF, buscarDadosDetalhadosPaciente } = require('../utils/buscarPaciente');
const gestaodsService = require('./gestaodsService');
const { cadastrarPacienteNoGestao } = require('./apiGestaoService');
const { isValidCPF, formatCPF } = require('../utils/validations');

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
function obterSaudacao() {
  const agora = new Date();
  const hora = agora.getHours();
  
  if (hora >= 6 && hora < 12) {
    return "🌅 Bom dia! Bem-vindo(a) à Clínica Nassif! 🏥";
  } else if (hora >= 12 && hora < 18) {
    return "☀️ Boa tarde! Bem-vindo(a) à Clínica Nassif! 🏥";
  } else {
    return "🌙 Boa noite! Bem-vindo(a) à Clínica Nassif! 🏥";
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
async function buscarDatasDisponiveis(token) {
  try {
    const response = await gestaodsService.buscarDiasDisponiveis(token);

    const dias = response?.data || [];

    // Verifica se veio um array
    if (!Array.isArray(dias)) {
      console.error('❌ A resposta da API não retornou um array:', dias);
      return null;
    }

    // Filtra apenas os dias disponíveis
    const diasDisponiveis = dias.filter(d => d.disponivel);

    return diasDisponiveis;
  } catch (error) {
    console.error('❌ Erro ao buscar dias disponíveis:', error.message);
    return null;
  }
}

// 🕐 Função para buscar horários disponíveis de forma segura
async function buscarHorariosDisponiveis(token, dataSelecionada) {
  try {
    const response = await gestaodsService.buscarHorariosDisponiveis(token, dataSelecionada);

    let horarios = response?.data;

    // Verifica se é um array
    if (!Array.isArray(horarios)) {
      console.error('❌ Formato inesperado dos horários:', horarios);
      return null;
    }

    // Função para converter string "HH:MM" em número para comparação (ex: "08:30" → 8.5)
    const horaParaNumero = (hora) => {
      const [h, m] = hora.split(':').map(Number);
      return h + m / 60;
    };

    // Filtros: exclui horários entre 08:00-09:00, 13:30-14:00 e após 17:00
    horarios = horarios.filter(horario => {
      const horaNum = horaParaNumero(horario);

      const dentroDoHorario =
        !(horaNum >= 8 && horaNum < 9) &&         // 08:00–08:59
        !(horaNum >= 13.5 && horaNum < 14) &&     // 13:30–13:59
        horaNum < 17;                             // Até 16:59

      return dentroDoHorario;
    });

    return horarios;
  } catch (error) {
    console.error('❌ Erro ao buscar horários disponíveis:', error.message);
    return null;
  }
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

    const tokenFixo = 'e735db8caae86d0a9763cbc6184767d239cb72bd';
    const url = `https://apidev.gestaods.com.br/api/dados-agendamento/listagem/${tokenFixo}`;

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

    const agendamentosFiltrados = agendamentosArray.filter(item => {
      const pacienteNome = normalizeName(item.paciente?.nome || '');
      if (!pacienteNome) return false;

      if (pacienteNome === nomeBuscaNorm) return true;

      // parcial só se a busca tiver pelo menos duas palavras (evita matches muito genéricos)
      if (nomeBuscaNorm.split(' ').length >= 2) {
        if (pacienteNome.includes(nomeBuscaNorm) || nomeBuscaNorm.includes(pacienteNome)) return true;
      }

      return false;
    });

    if (agendamentosFiltrados.length === 0) {
      return '📭 Você não possui agendamentos nos próximos 90 dias.';
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
}

function getContext(phone) {
  if (!userContext[phone]) {
    userContext[phone] = {};
  }
  return userContext[phone];
}

function setContext(phone, context) {
  userContext[phone] = { ...userContext[phone], ...context };
}

// 📝 Aguardando nome para cadastro
function handleAguardandoNome(phone, message) {
  const messageLower = message.toLowerCase().trim();

  if (messageLower === 'voltar') {
    setState(phone, 'aguardando_cpf');
    return (
      "Digite seu CPF novamente:\n\n" +
      "Digite *voltar* para retornar ao menu principal."
    );
  }

  const context = getContext(phone);
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

  // Detectar comandos relacionados a agendamentos
  if (messageLower.includes('agendamento') || messageLower.includes('agendamentos') ||
    messageLower.includes('consulta') || messageLower.includes('consultas') ||
    messageLower.includes('meus agendamentos') || messageLower.includes('ver consultas') ||
    messageLower.includes('minhas consultas') || messageLower.includes('agenda')) {

    setState(phone, 'confirmando_paciente');
    setContext(phone, { acao: 'visualizar' });
    return (
      "📋 Visualizar Agendamentos\n\n" +
      "Por favor, digite seu *nome completo* para vermos seus agendamentos.\n\n" +
      "Digite *voltar* para retornar ao menu principal."
    );
  }

  if (messageLower.includes('oi') || messageLower.includes('olá') || messageLower.includes('ola') || messageLower.includes('bom dia') || messageLower.includes('boa tarde') || messageLower.includes('boa noite')) {
    setState(phone, 'menu_principal');

    const resposta = (
      obterSaudacao() + "\n\n" +
      "Sou seu assistente virtual. Como posso ajudar?\n\n" +
      "*Digite o número da opção desejada:*\n\n" +
      "1️⃣ *Agendar consulta*\n" +
      "2️⃣ *Ver meus agendamentos*\n" +
      "3️⃣ *Lista de espera*\n" +
      "4️⃣ *Falar com secretária*\n\n" +
      "Digite *0* para sair"
    );

    return resposta;
  } else {
    return (
      obterSaudacao() + "\n\n" +
      "Digite *oi* para começar o atendimento e ver as opções disponíveis.\n\n" +
      "💡 *Dica:* Você também pode digitar \"meus agendamentos\" para ver suas consultas diretamente."
    );
  }
}

// 📋 Menu principal
function handleMenuPrincipal(phone, message) {
  const messageLower = message.toLowerCase().trim();

  // Detectar comandos de texto relacionados a agendamentos
  if (messageLower.includes('agendamento') || messageLower.includes('agendamentos') ||
    messageLower.includes('consulta') || messageLower.includes('consultas') ||
    messageLower.includes('meus agendamentos') || messageLower.includes('ver consultas') ||
    messageLower.includes('minhas consultas') || messageLower.includes('agenda')) {

    setState(phone, 'confirmando_paciente');
    setContext(phone, { acao: 'visualizar' });
    return (
      "📋 Visualizar Agendamentos\n\n" +
      "Por favor, digite seu *nome completo* para vermos seus agendamentos.\n\n" +
      "Digite *voltar* para retornar ao menu principal."
    );
  }

  switch (message) {
    case '1':
      setState(phone, 'aguardando_cpf');
      setContext(phone, { acao: 'agendar' });
      return (
        "📅 *Agendamento de Consulta*\n\n" +
        "Por favor, digite seu CPF (apenas números):\n\n" +
        "Exemplo: 12345678901\n\n" +
        "Digite *voltar* para retornar ao menu principal."
      );

    case '2':
      setState(phone, 'confirmando_paciente');
      setContext(phone, { acao: 'visualizar' });
      return (
        "📋 Visualizar Agendamentos\n\n" +
        "Por favor, digite seu *nome completo* para vermos seus agendamentos.\n\n" +
        "Digite *voltar* para retornar ao menu principal."
      );

    case '3':
      setState(phone, 'aguardando_cpf');
      setContext(phone, { acao: 'lista_espera' });
      return (
        "⏳ *Lista de Espera*\n\n" +
        "Por favor, digite seu CPF para adicionar à lista de espera:\n\n" +
        "Digite *voltar* para retornar ao menu principal."
      );

    case '4':
      const isBusinessHours = verificarHorarioAtendimento();
      
      if (isBusinessHours) {
        setUserState(phone, "aguardando_atendimento_secretaria");
        return "👩‍💼 Seu atendimento foi direcionado para a secretária. Por favor, aguarde.";
      } else {
        setUserState(phone, "finalizado");
        return (
          "🕐 *A clínica está fora do horário de atendimento.*\n\n" +
          "📅 *Horário de Atendimento:*\n" +
          "Segunda a Sexta, das 8h às 18h\n" +
          "Sábado, das 8h às 12h\n\n" +
          "📧 contato@clinicanassif.com.br\n" +
          "📞 +55 31 98600-3666\n\n" +
          "Entraremos em contato assim que o atendimento for retomado."
        );
      }

    case '0':
      setState(phone, 'inicio');
      setContext(phone, {});
      return (
        "👋 Obrigado por usar nosso atendimento!\n\n" +
        "Volte sempre! 😊"
      );

    default:
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
    return handleMenuPrincipal(phone, 'menu');
  }

  if (isValidCPF(message)) {
    const context = getContext(phone);
    context.cpf = message;
    setContext(phone, context);

    // Busca o paciente usando o gestaodsService
    const token = process.env.GESTAODS_TOKEN;
    const paciente = await gestaodsService.verificarPaciente(token, message);

    if (!paciente) {
      setState(phone, 'aguardando_nome');
      return (
        "❌ CPF não encontrado no sistema!\n\n" +
        "Por favor, digite seu nome completo para cadastro:\n\n" +
        "Digite *voltar* para tentar outro CPF."
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

    setState(phone, 'confirmando_paciente');

    return (
      `✅ *CPF ${message} encontrado no sistema!*\n\n` +
      `Confirma que é você?\n\n` +
      `1️⃣ Sim\n` +
      `2️⃣ Não\n` +
      `0️⃣ Menu`
    );
  } else {
    const cpfDigitado = message.replace(/\D/g, ''); // Remove caracteres não numéricos
    return (
      "❌ CPF inválido!\n\n" +
      `Você digitou: ${message}\n` +
      `CPF deve ter exatamente 11 dígitos numéricos.\n` +
      "Exemplo: 12345678901\n\n" +
      "Digite *voltar* para retornar ao menu principal."
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
          
          setState(phone, 'cadastro_confirmado');
          return (
            "✅ *Cadastro realizado com sucesso!*\n\n" +
            `Bem-vindo(a), *${context.nome}*!\n\n` +
            "Agora vamos continuar com o agendamento...\n\n" +
            "Digite *menu* para voltar ao início."
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
          "📧 Email: contato@clinicanassif.com.br\n" +
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

            // Consulta à API oficial usando função segura
            const dias = await buscarDatasDisponiveis(context.token);

            if (!dias || dias.length === 0) {
              return (
                "❌ Nenhuma data disponível no momento.\n\n" +
                "Tente novamente mais tarde ou digite *menu* para voltar ao início."
              );
            }

            // Monta a lista de opções
            let mensagem = "📅 *Datas disponíveis para consulta:*\n\n";
            dias.forEach((data, index) => {
              mensagem += `*${index + 1}* - ${data.data}\n`;
            });

            mensagem += "\nDigite o número da data desejada:";

            // Salva as opções no contexto para uso posterior
            context.datasDisponiveis = dias;
            setContext(phone, context);

            return mensagem;

          } catch (error) {
            console.error("Erro ao buscar datas disponíveis:", error);
            return (
              "❌ Ocorreu um erro ao buscar as datas disponíveis.\n" +
              "Por favor, tente novamente mais tarde ou digite *menu* para retornar ao início."
            );
          }

        case 'cancelar':
          setState(phone, 'cancelamento_confirmado');
          return (
            "❌ *Cancelamento de Consulta*\n\n" +
            "Por favor, entre em contato com a recepção.\n" +
            "Telefone: +55 31 98600-3666\n\n" +
            "Digite *menu* para voltar ao início."
          );

        case 'lista_espera':
          setState(phone, 'lista_espera_confirmada');
          return (
            "⏳ *Lista de Espera*\n\n" +
            "✅ Adicionado à lista de espera!\n" +
            "Entraremos em contato quando houver vaga.\n\n" +
            "Digite *menu* para voltar ao início."
          );
      }
      break;

    case '2':
      setState(phone, 'confirmando_paciente');
      return (
        "Digite seu nome completo novamente:\n\n" +
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
      "📧 Email: contato@clinicanassif.com.br\n" +
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

        // Chamada para a API
        const resposta = await gestaodsService.agendarConsulta(payload);

        if (resposta?.status === 200 || resposta?.status === 201) {
          console.log("[FlowController] Consulta agendada com sucesso:", resposta.data);

          // Se chegou até aqui, o agendamento foi bem-sucedido
          setState(phone, 'agendamento_confirmado');

          return (
            "✅ *Agendamento realizado com sucesso!*\n\n" +
            `📅 Data: ${context.dataSelecionada}\n` +
            `⏰ Horário: ${context.horaSelecionada}\n` +
            `📌 Tipo: ${context.tipo_consulta}\n\n` +
            "A clínica agradece seu contato. 👩‍⚕️🩺\n" +
            "Se precisar de algo mais, digite *menu* a qualquer momento."
          );
        } else {
          console.error("[GestãoDS] Erro ao agendar consulta:", resposta?.data || resposta);
          throw new Error("Erro ao agendar a consulta.");
        }

      } catch (erro) {
        console.error("❌ Erro ao agendar consulta:", erro.message);
        return "❌ Erro ao agendar consulta. Tente novamente mais tarde.";
      }

    case 'alterar':
      setState(phone, 'escolhendo_data');
      return (
        "✏️ Ok! Vamos alterar os dados.\n\n" +
        "📅 *Datas disponíveis para consulta:*\n\n" +
        context.datasDisponiveis.map((data, index) =>
          `*${index + 1}* - ${data.data}`
        ).join('\n') +
        "\n\nDigite o número da data desejada:"
      );

    case 'cancelar':
      setState(phone, 'menu_principal');
      setContext(phone, {});
      return (
        "❌ Agendamento cancelado.\n\n" +
        "Voltando ao menu principal...\n\n" +
        "Digite *1* para agendar uma consulta\n" +
        "Digite *2* para ver meus agendamentos\n" +
        "Digite *3* para lista de espera\n" +
        "Digite *4* para falar com secretária"
      );

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
        "✅ *confirmar* para concluir\n" +
        "✏️ *alterar* para modificar\n" +
        "❌ *cancelar* para encerrar"
      );
  }
}



// 📅 Escolhendo data
async function handleEscolhendoData(phone, message) {
  const context = getContext(phone);
  const opcao = parseInt(message);

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
    const horarios = await buscarHorariosDisponiveis(context.token, dataSelecionada);

    if (!horarios || horarios.length === 0) {
      return (
        "❌ Nenhum horário disponível para essa data.\n\n" +
        "Escolha outra data ou digite *menu* para voltar ao início."
      );
    }

    let mensagem = `🕒 *Horários disponíveis para ${dataSelecionada}:*\n\n`;
    horarios.forEach((horario, index) => {
      mensagem += `*${index + 1}* - ${horario}\n`;
    });

    mensagem += "\nDigite o número do horário desejado:";
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
  const opcao = parseInt(message);

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
      "✅ *confirmar* para concluir\n" +
      "✏️ *alterar* para modificar\n" +
      "❌ *cancelar* para encerrar"
    );

  } catch (error) {
    console.error('Erro ao preparar confirmação do agendamento:', error);
    return (
      "❌ Ocorreu um erro ao preparar a confirmação do agendamento.\n" +
      "Tente novamente ou digite *menu* para voltar ao início."
    );
  }
}

// 🏁 Estados finais
function handleEstadoFinal(phone, message) {
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
  } else {
    return (
      "Digite *menu* para voltar ao início do atendimento."
    );
  }
}

// 🧠 Função principal do flowController
async function flowController(message, phone) {
  const state = getState(phone);
  console.log(`🧠 Processando mensagem do usuário ${phone} no estado: ${state}`);

  try {
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

        return `✅ Consulta reagendada com sucesso para *${novaDataHora}*!`;
      } catch (error) {
        console.error("Erro ao reagendar:", error.response?.data || error.message);
        context.estado = null;
        setState(phone, 'inicio');
        setContext(phone, context);
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
          "📧 Email: contato@clinicanassif.com.br\n" +
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
        "Sou seu assistente virtual. Como posso ajudar?\n\n" +
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
        return handleAguardandoNome(phone, message);

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
          "Digite *menu* para voltar ao início ou aguarde o contato da secretária."
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
    return (
      "❌ Erro no sistema. Voltando ao início...\n\n" +
      "Digite *oi* para começar novamente."
    );
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
      "Digite *menu* para voltar ao início."
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

  if (message === '1') {
    context.estado = "reagendando_nova_data";
    setContext(phone, context);
    return (
      "📆 Envie a nova data no formato *dd/mm/aaaa* para reagendar:\n\n" +
      "Exemplo: 25/12/2024\n\n" +
      "Digite *menu* para voltar ao início."
    );
  }

  if (message === '2') {
    return (
      "❌ Cancelamento ainda não implementado na API.\n\n" +
      "Por favor, entre em contato com a recepção:\n" +
      "☎️ Telefone: +55 31 98600-3666\n\n" +
      "Digite *menu* para voltar ao início."
    );
  }

  if (message === '3') {
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
    return '⚠️ Ocorreu um erro ao recuperar seu agendamento. Digite *menu* para recomeçar.';
  }

  if (message === '1') {
    await salvarEstado(phone, 'finalizado');
    setState(phone, 'finalizado');
    return `📅 Reagendamento solicitado para o agendamento de *${agendamento.data}*. Uma secretária entrará em contato.`;
  }

  if (message === '2') {
    await salvarEstado(phone, 'finalizado');
    setState(phone, 'finalizado');
    return `❌ Cancelamento solicitado para o agendamento de *${agendamento.data}*. Uma secretária entrará em contato.`;
  }

  return 'Digite *1* para Reagendar ou *2* para Cancelar.';
}

// 🔄 Função para opção reagendar/cancelar
async function handleOpcaoReagendarCancelar(phone, message) {
  const context = getContext(phone);
  
  if (message === '1') {
    setState(phone, 'reagendar_em_andamento');
    return '🔄 Ok! Vamos iniciar o processo para *reagendar* essa consulta. Aguarde...';
  } else if (message === '2') {
    setState(phone, 'cancelar_em_andamento');
    return '🗑️ Ok! Vamos cancelar sua consulta. Aguarde...';
  } else if (message === '3') {
    setState(phone, 'menu_principal');
    delete context.agendamentoSelecionado;
    delete context.agendamentosListados;
    setContext(phone, context);
    return '🔙 Você voltou ao menu. Digite *menu* para visualizar as opções novamente.';
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
        "Digite *menu* para voltar ao início."
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
    mensagem += "Digite *menu* para voltar ao início.";

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
  visualizarAgendamentosPorNome
}; 