const memoryStore = require('../utils/memoryStore');
const axios = require('axios');
const moment = require('moment');
const { buscarPacientePorCPF, buscarDadosDetalhadosPaciente } = require('../utils/buscarPaciente');
const gestaodsService = require('./gestaodsService');

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
    const agendamentos = response.data?.data || [];

    if (!Array.isArray(agendamentos) || agendamentos.length === 0) return null;

    // Ordena da mais recente para a mais antiga
    agendamentos.sort((a, b) => new Date(b.data_agendamento) - new Date(a.data_agendamento));

    return agendamentos[0]?.data_agendamento || null;
  } catch (error) {
    console.error('❌ Erro ao buscar última consulta:', error.message);
    return null;
  }
}

// 🧠 Sistema FSM (Finite State Machine)
const userStates = {}; // armazena o estado atual de cada usuário
const userContext = {}; // armazena o contexto (cpf, nome, etc.)

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
  
  if (messageLower.includes('oi') || messageLower.includes('olá') || messageLower.includes('ola') || messageLower.includes('bom dia') || messageLower.includes('boa tarde') || messageLower.includes('boa noite')) {
    setState(phone, 'menu_principal');
    
    const resposta = (
      "🌅 Bom dia! Bem-vindo(a) à Clínica Nassif! 🏥\n\n" +
      "Sou seu assistente virtual. Como posso ajudar?\n\n" +
      "*Digite o número da opção desejada:*\n\n" +
      "1️⃣ *Agendar consulta*\n" +
      "2️⃣ *Ver meus agendamentos*\n" +
      "3️⃣ *Cancelar consulta*\n" +
      "4️⃣ *Lista de espera*\n" +
      "5️⃣ *Falar com atendente*\n\n" +
      "Digite *0* para sair"
    );
    
    return resposta;
  } else {
    return (
      "🌅 Olá! Bem-vindo(a) à Clínica Nassif! 🏥\n\n" +
      "Digite *oi* para começar o atendimento e ver as opções disponíveis."
    );
  }
}

// 📋 Menu principal
function handleMenuPrincipal(phone, message) {
  const messageLower = message.toLowerCase().trim();
  
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
      setState(phone, 'aguardando_cpf');
      setContext(phone, { acao: 'visualizar' });
      return (
        "📋 *Visualizar Agendamentos*\n\n" +
        "Por favor, digite seu CPF para ver seus agendamentos:\n\n" +
        "Digite *voltar* para retornar ao menu principal."
      );
      
    case '3':
      setState(phone, 'aguardando_cpf');
      setContext(phone, { acao: 'cancelar' });
      return (
        "❌ *Cancelar Consulta*\n\n" +
        "Por favor, digite seu CPF para cancelar consultas:\n\n" +
        "Digite *voltar* para retornar ao menu principal."
      );
      
    case '4':
      setState(phone, 'aguardando_cpf');
      setContext(phone, { acao: 'lista_espera' });
      return (
        "⏳ *Lista de Espera*\n\n" +
        "Por favor, digite seu CPF para adicionar à lista de espera:\n\n" +
        "Digite *voltar* para retornar ao menu principal."
      );
      
    case '5':
      setState(phone, 'atendimento_humano');
      return (
        "👨‍⚕️ *Atendimento Humano*\n\n" +
        "☎️ Telefone: +553198600366\n" +
        "📧 Email: contato@clinicanassif.com.br\n" +
        "🕐 Horário: Segunda a Sexta, 8h às 18h\n\n" +
        "Digite *1* para voltar ao menu principal."
      );
      
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
        "3️⃣ *Cancelar consulta*\n" +
        "4️⃣ *Lista de espera*\n" +
        "5️⃣ *Falar com atendente*\n\n" +
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

  if (message.length === 11 && /^\d+$/.test(message)) {
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
    return (
      "❌ CPF inválido!\n\n" +
      "Digite apenas os 11 números do CPF.\n" +
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
    setState(phone, 'confirmando_cadastro');
    
    return (
      `✅ Email registrado: *${message}*\n\n` +
      `📋 *Dados para cadastro:*\n` +
      `👤 Nome: ${context.nome}\n` +
      `📧 Email: ${message}\n` +
      `🆔 CPF: ${context.cpf}\n\n` +
      "Confirma o cadastro?\n\n" +
      "1️⃣ Sim, cadastrar\n" +
      "2️⃣ Não, corrigir dados\n" +
      "0️⃣ Cancelar"
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

// ✅ Confirmando cadastro
function handleConfirmandoCadastro(phone, message) {
  const context = getContext(phone);
  
  switch (message) {
    case '1':
      // Simula cadastro bem-sucedido
      setState(phone, 'cadastro_confirmado');
      return (
        "✅ *Cadastro realizado com sucesso!*\n\n" +
        `Bem-vindo(a), *${context.nome}*!\n\n` +
        "Agora você pode usar todos os nossos serviços.\n\n" +
        "Digite *menu* para voltar ao início."
      );
      
    case '2':
      setState(phone, 'solicitando_dados');
      return (
        "Digite seu *nome completo* novamente:\n\n" +
        "Digite *voltar* para tentar outro CPF."
      );
      
    case '0':
      setState(phone, 'menu_principal');
      setContext(phone, {});
      return (
        "Cadastro cancelado. Voltando ao menu principal...\n\n" +
        "Digite *1* para agendar uma consulta\n" +
        "Digite *2* para falar com atendimento\n" +
        "Digite *3* para informações"
      );
      
    default:
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

        case 'visualizar':
          setState(phone, 'visualizando_agendamentos');
          return (
            "📋 *Seus Agendamentos*\n\n" +
            "Você não possui agendamentos ativos.\n\n" +
            "Digite *menu* para voltar ao início."
          );

        case 'cancelar':
          setState(phone, 'cancelamento_confirmado');
          return (
            "❌ *Cancelamento de Consulta*\n\n" +
            "Por favor, entre em contato com a recepção.\n" +
            "Telefone: +553198600366\n\n" +
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
      setState(phone, 'aguardando_cpf');
      return (
        "Digite seu CPF novamente:\n\n" +
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

// 👨‍⚕️ Atendimento humano
function handleAtendimentoHumano(phone, message) {
  if (message === '1') {
    setState(phone, 'menu_principal');
    return handleMenuPrincipal(phone, 'menu');
  } else {
    return (
      "👨‍⚕️ *Atendimento Humano*\n\n" +
      "☎️ Telefone: +553198600366\n" +
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
        "Digite *3* para cancelar consulta\n" +
        "Digite *4* para lista de espera\n" +
        "Digite *5* para falar com atendente"
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
        
      case 'confirmando_cadastro':
        return handleConfirmandoCadastro(phone, message);
        
      case 'confirmando_paciente':
        return await handleConfirmandoPaciente(phone, message);
        
      case 'escolhendo_data':
        return await handleEscolhendoData(phone, message);
        
      case 'escolhendo_horario':
        return await handleEscolhendoHorario(phone, message);
        
      case 'confirmando_agendamento':
        return await handleConfirmandoAgendamento(phone, message);
        
      case 'atendimento_humano':
        return handleAtendimentoHumano(phone, message);
        
      case 'agendamento_confirmado':
      case 'visualizando_agendamentos':
      case 'cancelamento_confirmado':
      case 'lista_espera_confirmada':
      case 'cadastro_confirmado':
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

module.exports = { flowController, FlowController }; 