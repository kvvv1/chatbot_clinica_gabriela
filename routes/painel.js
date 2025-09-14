const express = require('express');
const router = express.Router();
const { supabase } = require('../services/supabaseClient');
const zapiService = require('../services/zapiService');

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

    // Período opcional via query: from/to
    const hasCustom = req.query.from || req.query.to;
    const now = new Date();
    let from = req.query.from ? new Date(String(req.query.from)) : new Date(now);
    let to = req.query.to ? new Date(String(req.query.to)) : new Date(now);
    if (!hasCustom) {
      // Padrão: hoje (00:00 -> 23:59:59.999)
      from = new Date(now);
      from.setHours(0,0,0,0);
      to = new Date(now);
      to.setHours(23,59,59,999);
    }
    const fromIso = isNaN(from.getTime()) ? undefined : from.toISOString();
    const toIso = isNaN(to.getTime()) ? undefined : to.toISOString();

    const [appointments, reschedules, cancels, tickets, waitlist, messages, notifications] = await Promise.all([
      // Contagens dos cards por registros criados no período (sem filtrar por status)
      (fromIso && toIso
        ? supabase.from('appointment_requests').select('*', { count: 'exact', head: true }).gte('created_at', fromIso).lte('created_at', toIso)
        : fromIso
        ? supabase.from('appointment_requests').select('*', { count: 'exact', head: true }).gte('created_at', fromIso)
        : toIso
        ? supabase.from('appointment_requests').select('*', { count: 'exact', head: true }).lte('created_at', toIso)
        : supabase.from('appointment_requests').select('*', { count: 'exact', head: true })
      ),
      (fromIso && toIso
        ? supabase.from('reschedule_requests').select('*', { count: 'exact', head: true }).gte('created_at', fromIso).lte('created_at', toIso)
        : fromIso
        ? supabase.from('reschedule_requests').select('*', { count: 'exact', head: true }).gte('created_at', fromIso)
        : toIso
        ? supabase.from('reschedule_requests').select('*', { count: 'exact', head: true }).lte('created_at', toIso)
        : supabase.from('reschedule_requests').select('*', { count: 'exact', head: true })
      ),
      (fromIso && toIso
        ? supabase.from('cancel_requests').select('*', { count: 'exact', head: true }).gte('created_at', fromIso).lte('created_at', toIso)
        : fromIso
        ? supabase.from('cancel_requests').select('*', { count: 'exact', head: true }).gte('created_at', fromIso)
        : toIso
        ? supabase.from('cancel_requests').select('*', { count: 'exact', head: true }).lte('created_at', toIso)
        : supabase.from('cancel_requests').select('*', { count: 'exact', head: true })
      ),
      (fromIso && toIso
        ? supabase.from('secretary_tickets').select('*', { count: 'exact', head: true }).gte('created_at', fromIso).lte('created_at', toIso)
        : fromIso
        ? supabase.from('secretary_tickets').select('*', { count: 'exact', head: true }).gte('created_at', fromIso)
        : toIso
        ? supabase.from('secretary_tickets').select('*', { count: 'exact', head: true }).lte('created_at', toIso)
        : supabase.from('secretary_tickets').select('*', { count: 'exact', head: true })
      ),
      (fromIso && toIso
        ? supabase.from('waitlist').select('*', { count: 'exact', head: true }).gte('created_at', fromIso).lte('created_at', toIso)
        : fromIso
        ? supabase.from('waitlist').select('*', { count: 'exact', head: true }).gte('created_at', fromIso)
        : toIso
        ? supabase.from('waitlist').select('*', { count: 'exact', head: true }).lte('created_at', toIso)
        : supabase.from('waitlist').select('*', { count: 'exact', head: true })
      ),
      // Interações/mensagens dentro do período selecionado
      (fromIso && toIso
        ? supabase.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', fromIso).lte('created_at', toIso)
        : fromIso
        ? supabase.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', fromIso)
        : supabase.from('messages').select('*', { count: 'exact', head: true }).lte('created_at', toIso)
      ),
      // Notificações também respeitam o período, mas sempre traz no máximo 10 mais recentes
      (fromIso && toIso
        ? supabase.from('notifications').select('*').gte('created_at', fromIso).lte('created_at', toIso).order('created_at', { ascending: false }).limit(10)
        : fromIso
        ? supabase.from('notifications').select('*').gte('created_at', fromIso).order('created_at', { ascending: false }).limit(10)
        : supabase.from('notifications').select('*').lte('created_at', toIso).order('created_at', { ascending: false }).limit(10)
      )
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
      .select('id, status')
      .eq('phone', telefone)
      .in('status', ['pendente','em_atendimento'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (selErr) throw selErr;

    if (Array.isArray(rows) && rows.length > 0) {
      const ticket = rows[0];
      if (ticket.status !== 'em_atendimento') {
        const { error: updErr } = await supabase
          .from('secretary_tickets')
          .update({ status: 'em_atendimento' })
          .eq('id', ticket.id);
        if (updErr) throw updErr;
      }
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

// Limpar duplicados de tickets por telefone mantendo o mais recente não finalizado
router.post('/secretaria/limpar-duplicados', async (req, res) => {
  try {
    if (!supabase) return res.json({ success: true, removidos: 0 });

    // Busca últimos 500 tickets
    const { data: tickets, error: listErr } = await supabase
      .from('secretary_tickets')
      .select('id, phone, status, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (listErr) throw listErr;

    const byPhone = new Map();
    const toDelete = [];
    for (const t of tickets || []) {
      const phone = t.phone || 'unknown';
      if (!byPhone.has(phone)) {
        byPhone.set(phone, []);
      }
      byPhone.get(phone).push(t);
    }

    byPhone.forEach((arr) => {
      // mantém prioridade: em_atendimento > pendente > finalizado, mais recente vence
      const emAt = arr.find(a => a.status === 'em_atendimento');
      const pend = arr.find(a => a.status === 'pendente');
      const keep = emAt || pend || arr[0];
      arr.forEach(a => { if (a.id !== keep.id) toDelete.push(a.id); });
    });

    let removidos = 0;
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from('secretary_tickets')
        .delete()
        .in('id', toDelete);
      if (delErr) throw delErr;
      removidos = toDelete.length;
    }

    return res.json({ success: true, removidos });
  } catch (error) {
    console.error('[secretaria/limpar-duplicados] erro:', error.message);
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
    // Evita comparar UUID com string 'null' (erro de cast). Usa IS NOT NULL corretamente.
    const { error } = await supabase
      .from('notifications')
      .delete()
      .not('id', 'is', null);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('[painel/notificacoes/delete] erro:', error.message);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// ==============================
// Conversa (mensagens por telefone) e envio manual
// ==============================

// GET /painel/conversa?phone=5511999999999&limit=200&before=ISO_DATE
router.get('/conversa', async (req, res) => {
  try {
    const raw = String(req.query.phone || req.query.telefone || '').trim();
    const phone = raw.replace(/\D/g, '');
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, 500));
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const after = req.query.after ? new Date(String(req.query.after)) : null;
    if (!phone) return res.json([]);
    if (!supabase) return res.json([]);

    // Normaliza: tenta casar com e sem código do país (55)
    const phoneNo55 = phone.startsWith('55') ? phone.slice(2) : phone;
    const phoneWith55 = phone.startsWith('55') ? phone : `55${phone}`;

    let query = supabase
      .from('messages')
      .select('id, phone, direction, content, created_at')
      .or(
        [
          `phone.eq.${phone}`,
          `phone.ilike.%${phone}%`,
          `phone.eq.${phoneNo55}`,
          `phone.ilike.%${phoneNo55}%`,
          `phone.eq.${phoneWith55}`,
          `phone.ilike.%${phoneWith55}%`
        ].join(',')
      );
    if (before && !isNaN(before.getTime())) {
      query = query.lt('created_at', before.toISOString());
    }
    if (after && !isNaN(after.getTime())) {
      query = query.gt('created_at', after.toISOString());
    }
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const normalized = Array.isArray(data) ? [...data].sort((a,b) => new Date(a.created_at) - new Date(b.created_at)) : [];
    return res.json(normalized);
  } catch (error) {
    console.error('[painel/conversa] erro:', error.message || error);
    return res.status(500).json([]);
  }
});

// POST /painel/mensagens/whatsapp { phone, message }
router.post('/mensagens/whatsapp', async (req, res) => {
  try {
    const { phone: rawPhone, message } = req.body || {};
    const phone = (String(rawPhone || '').trim()).replace(/\D/g, '');
    const text = typeof message === 'string' ? message.trim() : '';
    if (!phone || !text) return res.status(400).json({ error: 'missing_params' });

    // Envia via Z-API
    await zapiService.sendMessage(phone, text);

    // Log opcional no Supabase
    try {
      if (supabase) {
        await supabase.from('messages').insert({ phone, direction: 'out', content: text });
      }
    } catch (e) {
      console.warn('[painel/mensagens/whatsapp] falha ao logar mensagem:', e.message);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[painel/mensagens/whatsapp] erro:', error.message || error);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;



// ==============================
// Estatísticas detalhadas
// ==============================
router.get('/estatisticas/detalhadas', async (req, res) => {
  try {
    if (!supabase) return res.json({});

    const toParam = req.query.to ? new Date(String(req.query.to)) : new Date();
    const fromParam = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(isNaN(toParam.getTime()) ? Date.now() : toParam.getTime());
    const from = new Date(isNaN(fromParam.getTime()) ? Date.now() - 7 * 24 * 60 * 60 * 1000 : fromParam.getTime());

    // Normaliza para ISO
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    // Busca dados paralelos
    const [messagesRes, notificationsRes, apptsRes, reschedRes, cancelsRes, ticketsRes] = await Promise.all([
      supabase.from('messages').select('id, phone, created_at').gte('created_at', fromIso).lte('created_at', toIso).order('created_at', { ascending: true }).limit(10000),
      supabase.from('notifications').select('id, type, created_at, read').gte('created_at', fromIso).lte('created_at', toIso).limit(10000),
      supabase.from('appointment_requests').select('id, phone, created_at, status').gte('created_at', fromIso).lte('created_at', toIso).limit(10000),
      supabase.from('reschedule_requests').select('id, phone, created_at, status').gte('created_at', fromIso).lte('created_at', toIso).limit(10000),
      supabase.from('cancel_requests').select('id, phone, created_at, status').gte('created_at', fromIso).lte('created_at', toIso).limit(10000),
      supabase.from('secretary_tickets').select('id, phone, created_at, status').gte('created_at', fromIso).lte('created_at', toIso).limit(10000),
    ]);

    const messages = messagesRes.data || [];
    const notifications = notificationsRes.data || [];
    const appts = (apptsRes.data || []).filter(r => r.status === 'approved');
    const resched = (reschedRes.data || []).filter(r => r.status === 'approved');
    const cancels = (cancelsRes.data || []).filter(r => r.status === 'approved');
    const tickets = ticketsRes.data || [];

    // Mensagens por dia
    const messagesByDay = new Map();
    for (const m of messages) {
      const d = new Date(m.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      messagesByDay.set(key, (messagesByDay.get(key) || 0) + 1);
    }
    const messagesPorDia = Array.from(messagesByDay.entries()).sort((a,b) => a[0] < b[0] ? -1 : 1).map(([date, count]) => ({ date, count }));

    // Agrupar conversas por phone com janela de 30min
    const sessions = [];
    const byPhone = new Map();
    for (const m of messages) {
      const phone = m.phone || 'desconhecido';
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone).push(m);
    }
    const SESSION_GAP_MS = 30 * 60 * 1000;
    for (const [phone, msgs] of byPhone.entries()) {
      msgs.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      let start = null, last = null, count = 0;
      for (const m of msgs) {
        const ts = new Date(m.created_at).getTime();
        if (start === null) { start = ts; last = ts; count = 1; continue; }
        if (ts - last > SESSION_GAP_MS) {
          sessions.push({ phone, start, end: last, count });
          start = ts; last = ts; count = 1;
        } else {
          last = ts; count += 1;
        }
      }
      if (start !== null) sessions.push({ phone, start, end: last, count });
    }

    // Durações
    const durations = sessions.map(s => Math.max(0, (s.end - s.start)));
    const sortedDur = [...durations].sort((a,b) => a-b);
    const percentile = (arr, p) => {
      if (!arr.length) return 0;
      const idx = Math.min(arr.length - 1, Math.floor(p * arr.length));
      return arr[idx];
    };
    const medianMs = percentile(sortedDur, 0.5);
    const p95Ms = percentile(sortedDur, 0.95);

    // Top conversas mais longas
    const topConversas = sessions
      .map(s => ({ phone: s.phone, mensagens: s.count, inicio: new Date(s.start).toISOString(), fim: new Date(s.end).toISOString(), duracaoMs: Math.max(0, s.end - s.start) }))
      .sort((a,b) => b.duracaoMs - a.duracaoMs)
      .slice(0, 10);

    // Tickets por status e SLAs
    const ticketsPorStatus = tickets.reduce((acc, t) => {
      acc[t.status || 'desconhecido'] = (acc[t.status || 'desconhecido'] || 0) + 1;
      return acc;
    }, {});

    // SLA primeira resposta: início da conversa -> primeiro ticket em_atendimento (ou criação)
    const firstTicketByPhone = new Map();
    const orderedTickets = [...tickets].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    for (const t of orderedTickets) {
      const phone = t.phone || 'desconhecido';
      if (!firstTicketByPhone.has(phone)) firstTicketByPhone.set(phone, t);
    }
    const firstResponseDurations = [];
    for (const s of sessions) {
      const ft = firstTicketByPhone.get(s.phone);
      if (!ft) continue;
      const t0 = s.start;
      const t1 = new Date(ft.created_at).getTime();
      if (t1 >= t0) firstResponseDurations.push(t1 - t0);
    }
    const frSorted = firstResponseDurations.sort((a,b) => a-b);
    const slaMedianMs = percentile(frSorted, 0.5);
    const slaP95Ms = percentile(frSorted, 0.95);

    // Tempo até marcar por tipo (considera primeiro aprovado após início da conversa)
    function buildFirstApprovedByPhone(rows) {
      const m = new Map();
      const ordered = [...rows].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      for (const r of ordered) {
        const phone = r.phone || 'desconhecido';
        if (!m.has(phone)) m.set(phone, r);
      }
      return m;
    }
    const firstApproved = {
      agendamento: buildFirstApprovedByPhone(appts),
      reagendamento: buildFirstApprovedByPhone(resched),
      cancelamento: buildFirstApprovedByPhone(cancels),
    };
    function durationsUntil(mapByPhone) {
      const arr = [];
      for (const s of sessions) {
        const row = mapByPhone.get(s.phone);
        if (!row) continue;
        const t1 = new Date(row.created_at).getTime();
        if (t1 >= s.start) arr.push(t1 - s.start);
      }
      const sorted = arr.sort((a,b) => a-b);
      return { medianaMs: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), amostras: arr.length };
    }
    const temposAteMarcarMs = {
      agendamento: durationsUntil(firstApproved.agendamento),
      reagendamento: durationsUntil(firstApproved.reagendamento),
      cancelamento: durationsUntil(firstApproved.cancelamento),
    };

    // Notificações por tipo
    const notificacoesPorTipo = Object.entries(
      notifications.reduce((acc, n) => {
        const key = (n.type || 'geral').toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    ).map(([type, count]) => ({ type, count }));

    // Funnel
    const phonesWithTickets = new Set(tickets.map(t => t.phone || 'desconhecido'));
    const withHuman = sessions.filter(s => phonesWithTickets.has(s.phone)).length;
    const results = {
      agendamento: appts.length,
      reagendamento: resched.length,
      cancelamento: cancels.length,
    };

    const response = {
      periodo: { from: fromIso, to: toIso },
      messages: { total: messages.length, porDia: messagesPorDia },
      conversas: { total: sessions.length, duracao: { medianaMs: medianMs, p95Ms }, top: topConversas },
      notificacoesPorTipo,
      funnel: { conversas: sessions.length, comHumano: withHuman, resolvidasBot: Math.max(0, sessions.length - withHuman), resultados: results },
      slaPrimeiraRespostaMs: { medianaMs: slaMedianMs, p95Ms: slaP95Ms },
      temposAteMarcarMs,
      tickets: { porStatus: ticketsPorStatus }
    };

    return res.json(response);
  } catch (error) {
    console.error('[painel/estatisticas/detalhadas] erro:', error.message || error);
    return res.status(500).json({ error: 'internal_error' });
  }
});
