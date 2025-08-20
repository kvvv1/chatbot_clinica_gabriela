const express = require('express');
const router = express.Router();
const { supabase } = require('../services/supabaseClient');

// Middleware simples de API Key
router.use((req, res, next) => {
  const requiredKey = process.env.DASHBOARD_API_KEY;
  if (!requiredKey) return next(); // se não configurado, libera (dev)
  const key = req.header('x-api-key');
  if (key !== requiredKey) return res.status(401).json({ error: 'unauthorized' });
  next();
});

// Helpers com fallback sem Supabase (dados mock vazios)
const ensureSupabase = (res) => {
  if (!supabase) {
    return res.json({});
  }
  return true;
};

// GET /painel/estatisticas
router.get('/estatisticas', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({
        estatisticas: {
          agendamentosPendentes: 0,
          reagendamentos: 0,
          cancelamentos: 0,
          atendimentosManuais: 0,
          interacoesHoje: 0,
          pacientesAguardando: 0
        },
        notificacoes: []
      });
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    const [appointments, reschedules, cancels, tickets, waitlist, messages, notifications] = await Promise.all([
      supabase.from('appointment_requests').select('*', { count: 'exact', head: true }).eq('status','pending'),
      supabase.from('reschedule_requests').select('*', { count: 'exact', head: true }).eq('status','pending'),
      supabase.from('cancel_requests').select('*', { count: 'exact', head: true }).eq('status','pending'),
      supabase.from('secretary_tickets').select('*', { count: 'exact', head: true }).eq('status','pendente'),
      supabase.from('waitlist').select('*', { count: 'exact', head: true }).eq('status','pending'),
      supabase.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(10)
    ]);

    const estatisticas = {
      agendamentosPendentes: appointments.count || 0,
      reagendamentos: reschedules.count || 0,
      cancelamentos: cancels.count || 0,
      atendimentosManuais: tickets.count || 0,
      interacoesHoje: messages.count || 0,
      pacientesAguardando: waitlist.count || 0
    };

    res.json({ estatisticas, notificacoes: notifications.data || [] });
  } catch (error) {
    console.error('[painel/estatisticas] erro:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Listagem utilitária
async function listTable(res, table) {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return res.json(data || []);
  } catch (error) {
    console.error(`[painel/${table}] erro:`, error.message);
    return res.status(500).json([]);
  }
}

// Agendamentos (normaliza campos para o frontend)
router.get('/agendamentos', async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase
      .from('appointment_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const statusMap = { pending: 'pendente', approved: 'aprovado', rejected: 'rejeitado' };
    const mapped = (data || []).map((row) => ({
      id: row.id,
      paciente: row.cpf || row.name || '—',
      telefone: row.phone || '—',
      data: row.requested_date || (row.created_at ? row.created_at.slice(0, 10) : ''),
      horario: row.requested_time || '—',
      status: statusMap[row.status] || 'pendente',
      observacoes: row.tipo || ''
    }));
    return res.json(mapped);
  } catch (error) {
    console.error('[painel/agendamentos] erro:', error.message);
    return res.status(500).json([]);
  }
});

// Reagendamentos (normaliza campos)
router.get('/reagendamentos', async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase
      .from('reschedule_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const mapped = (data || []).map((row) => {
      let dataAtual = row.current_datetime || row.requested_date || '';
      let horarioAtual = row.requested_time || '';
      if (!row.requested_time && row.current_datetime && typeof row.current_datetime === 'string') {
        const parts = row.current_datetime.split(' ');
        if (parts.length >= 2) {
          dataAtual = parts[0];
          horarioAtual = parts[1];
        }
      }
      return {
        id: row.id,
        paciente: row.phone || '—',
        telefone: row.phone || '—',
        dataAtual,
        horarioAtual,
        status: row.status || 'pending'
      };
    });
    return res.json(mapped);
  } catch (error) {
    console.error('[painel/reagendamentos] erro:', error.message);
    return res.status(500).json([]);
  }
});

// Cancelamentos (normaliza campos)
router.get('/cancelamentos', async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase
      .from('cancel_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const mapped = (data || []).map((row) => ({
      id: row.id,
      paciente: row.phone || '—',
      telefone: row.phone || '—',
      data: row.created_at ? row.created_at.slice(0, 10) : '',
      horario: row.created_at ? new Date(row.created_at).toTimeString().slice(0,5) : '',
      motivo: row.motivo || ''
    }));
    return res.json(mapped);
  } catch (error) {
    console.error('[painel/cancelamentos] erro:', error.message);
    return res.status(500).json([]);
  }
});

// Lista de espera (normaliza campos)
router.get('/espera', async (req, res) => {
  try {
    if (!supabase) return res.json([]);
  const { data, error } = await supabase
      .from('waitlist')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;
    const now = Date.now();
    const mapped = (data || []).map((row) => {
      const created = row.created_at ? new Date(row.created_at) : new Date();
      const tempoEspera = Math.max(0, Math.floor((now - created.getTime()) / (1000*60*60*24)));
      return {
        id: row.id,
        paciente: row.name || row.cpf || row.phone || '—',
        telefone: row.phone || '—',
        email: row.email || '',
        dataSolicitacao: row.created_at,
        prioridade: row.prioridade || 'sem',
        tempoEspera,
        motivo: row.motivo || '',
        observacoes: ''
      };
    });
    return res.json(mapped);
  } catch (error) {
    console.error('[painel/espera] erro:', error.message);
    return res.status(500).json([]);
  }
});

// Secretaria (normaliza campos)
router.get('/secretaria', async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase
      .from('secretary_tickets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const mapped = (data || []).map((row) => ({
      id: row.id,
      paciente: row.phone || '—',
      telefone: row.phone || '—',
      email: '',
      dataSolicitacao: row.created_at,
      status: row.status || 'pendente',
      motivo: row.motivo || 'Atendimento manual solicitado',
      observacoes: ''
    }));
    return res.json(mapped);
  } catch (error) {
    console.error('[painel/secretaria] erro:', error.message);
    return res.status(500).json([]);
  }
});

// Pacientes (normaliza campos)
router.get('/pacientes', async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const mapped = (data || []).map((row) => ({
      id: row.id,
      nome: row.name || row.cpf || '—',
      telefone: row.phone || '—',
      email: row.email || '',
      dataCadastro: row.created_at,
      origem: 'Chatbot'
    }));
    return res.json(mapped);
  } catch (error) {
    console.error('[painel/pacientes] erro:', error.message);
    return res.status(500).json([]);
  }
});

// Ações
router.post('/agendamentos/:id/aprovar', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true, mensagem: 'OK (sem persistência)' });
    const id = req.params.id;
    const { data: reqData, error: getErr } = await supabase
      .from('appointment_requests').select('*').eq('id', id).single();
    if (getErr || !reqData) return res.status(404).json({ error: 'not_found' });

    // Aqui poderia chamar GestãoDS para efetivar se necessário
    const { error: updErr } = await supabase
      .from('appointment_requests').update({ status: 'approved' }).eq('id', id);
    if (updErr) throw updErr;
    return res.json({ success: true, mensagem: 'Agendamento aprovado' });
  } catch (error) {
    console.error('[aprovar agendamento] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/agendamentos/:id/rejeitar', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const id = req.params.id;
    const { motivo } = req.body || {};
    const { error } = await supabase
      .from('appointment_requests').update({ status: 'rejected', motivo: motivo || null }).eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('[rejeitar agendamento] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/reagendamentos/:id/aprovar', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const id = req.params.id;
    const { novaData } = req.body || {};
    const { error } = await supabase
      .from('reschedule_requests').update({ status: 'approved', requested_date: novaData || null }).eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('[aprovar reagendamento] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Colocar solicitação de reagendamento na lista de espera
router.post('/reagendamentos/:id/espera', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const id = req.params.id;
    const { motivo } = req.body || {};
    const { data: reqData, error: getErr } = await supabase.from('reschedule_requests').select('*').eq('id', id).single();
    if (getErr || !reqData) return res.status(404).json({ error: 'not_found' });
    const phone = reqData.phone;
    // move para waitlist
    const { error: insErr } = await supabase.from('waitlist').insert({ phone, motivo: motivo || 'Lista de espera por reagendamento', prioridade: 'media', status: 'pending' });
    if (insErr) throw insErr;
    // marca reagendamento como rejeitado
    const { error: updErr } = await supabase.from('reschedule_requests').update({ status: 'rejected' }).eq('id', id);
    if (updErr) throw updErr;
    return res.json({ success: true });
  } catch (error) {
    console.error('[reagendamentos/espera] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Cancelar solicitação de reagendamento e abrir cancel request
router.post('/reagendamentos/:id/cancelar', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const id = req.params.id;
    const { motivo } = req.body || {};
    const { data: reqData, error: getErr } = await supabase.from('reschedule_requests').select('*').eq('id', id).single();
    if (getErr || !reqData) return res.status(404).json({ error: 'not_found' });
    const phone = reqData.phone;
    // cria cancel request
    const { error: insErr } = await supabase.from('cancel_requests').insert({ phone, motivo: motivo || 'Cancelamento solicitado', status: 'pending' });
    if (insErr) throw insErr;
    // marca reagendamento como rejeitado
    const { error: updErr } = await supabase.from('reschedule_requests').update({ status: 'rejected' }).eq('id', id);
    if (updErr) throw updErr;
    return res.json({ success: true });
  } catch (error) {
    console.error('[reagendamentos/cancelar] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/cancelamentos/:id/aprovar', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const id = req.params.id;
    const { error } = await supabase
      .from('cancel_requests').update({ status: 'approved' }).eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('[aprovar cancelamento] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/secretaria/atender', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const { telefone } = req.body || {};
    if (!telefone) return res.status(400).json({ error: 'telefone_obrigatorio' });

    // Tenta encontrar o ticket pendente mais recente desse telefone
    const { data: rows, error: selErr } = await supabase
      .from('secretary_tickets')
      .select('id')
      .eq('phone', telefone)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })
      .limit(1);
    if (selErr) throw selErr;

    if (Array.isArray(rows) && rows.length > 0) {
      const ticketId = rows[0].id;
      const { error: updErr } = await supabase
        .from('secretary_tickets')
        .update({ status: 'em_atendimento' })
        .eq('id', ticketId);
      if (updErr) throw updErr;
    } else {
      // Fallback: cria um novo registro marcado como em atendimento
      const { error: insErr } = await supabase
        .from('secretary_tickets')
        .insert({ phone: telefone, status: 'em_atendimento' });
      if (insErr) throw insErr;
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('[secretaria/atender] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Finalizar atendimento manual
router.post('/secretaria/:id/finalizar', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const id = req.params.id;
    const { error } = await supabase.from('secretary_tickets').update({ status: 'finalizado' }).eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('[secretaria/finalizar] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Alterar prioridade de espera
router.post('/espera/:id/prioridade', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const id = req.params.id;
    const { prioridade } = req.body || {};
    if (!['baixa','media','alta'].includes(prioridade)) return res.status(400).json({ error: 'prioridade_invalida' });
    const { error } = await supabase.from('waitlist').update({ prioridade }).eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('[espera/prioridade] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Remover da lista de espera
router.delete('/espera/:id', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const id = req.params.id;
    const { error } = await supabase.from('waitlist').delete().eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('[espera/delete] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ==============================
// Notificações
// ==============================

// Util: extrair telefone e nome da mensagem
function extractPhoneAndNameFromMessage(message) {
  try {
    if (!message || typeof message !== 'string') return { phone: undefined, name: undefined };
    const cpfNearDigits = /cpf\s*[\d\.\-]{11,14}/i.test(message);
    let phone;
    const hintedPhone = message.match(/(?:telefone|whatsapp|phone)\D*(\+?\d{10,14})/i);
    if (hintedPhone && hintedPhone[1]) {
      phone = hintedPhone[1];
    } else if (!cpfNearDigits) {
      const generic = message.match(/\+?\d{12,14}|55\d{10,12}/);
      phone = generic ? generic[0] : undefined;
    }
    let name;
    if (phone) {
      const idx = message.indexOf(phone);
      if (idx >= 0) {
        const after = message.slice(idx + phone.length);
        const dashIdx = after.indexOf('-');
        if (dashIdx >= 0) {
          const raw = after.slice(dashIdx + 1).trim();
          name = raw && raw.length > 0 ? raw : undefined;
        }
      }
    }
    return { phone, name };
  } catch (e) {
    return { phone: undefined, name: undefined };
  }
}

// GET /painel/notificacoes - últimas notificações normalizadas
router.get('/notificacoes', async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    const mapped = (data || []).map((n) => {
      const { phone, name } = extractPhoneAndNameFromMessage(n.message || '');
      return {
        id: n.id,
        type: n.type || 'geral',
        title: n.title || 'Notificação',
        message: n.message || '',
        priority: n.priority || 'normal',
        read: !!n.read,
        created_at: n.created_at,
        name,
        phone
      };
    });
    return res.json(mapped);
  } catch (error) {
    console.error('[painel/notificacoes] erro:', error.message);
    return res.status(500).json([]);
  }
});

// POST /painel/notificacoes/:id/lida - marcar uma notificação como lida
router.post('/notificacoes/:id/lida', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const id = req.params.id;
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('[painel/notificacoes/:id/lida] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// POST /painel/notificacoes/ler-todas - marcar todas como lidas
router.post('/notificacoes/ler-todas', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const { error } = await supabase.from('notifications').update({ read: true }).eq('read', false);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('[painel/notificacoes/ler-todas] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /painel/notificacoes - limpar todas as notificações
router.delete('/notificacoes', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true });
    const { error } = await supabase.from('notifications').delete().neq('id', null);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('[painel/notificacoes/delete] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;


