import { useEffect, useMemo, useState } from 'react';
import { dashboardService } from '../services/api';
import './Estatisticas.css';

interface Estatisticas {
  agendamentosPendentes: number;
  reagendamentos: number;
  cancelamentos: number;
  atendimentosManuais: number;
  interacoesHoje: number;
  pacientesAguardando: number;
}

interface Notificacao {
  id: string | number;
  type: string;
  title: string;
  message: string;
  timestamp: Date | string;
  priority?: 'normal' | 'high';
  read?: boolean;
}

export default function Estatisticas() {
  const [estatisticas, setEstatisticas] = useState<Estatisticas | null>(null);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'custom'>('7d');
  const [fromIso, setFromIso] = useState<string | null>(null);
  const [toIso, setToIso] = useState<string | null>(null);

  const computeFromTo = (): { from: string | undefined, to: string | undefined } => {
    const now = new Date();
    let from: Date;
    if (range === 'today') {
      from = new Date();
      from.setHours(0,0,0,0);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    if (range === '7d') {
      from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    if (range === '30d') {
      from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to: now.toISOString() };
    }
    return { from: fromIso || undefined, to: toIso || undefined };
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { from, to } = computeFromTo();
        const dados = await dashboardService.getEstatisticas(from, to);
        setEstatisticas(dados?.estatisticas || null);
        const notifs = await dashboardService.getNotificacoes();
        setNotificacoes(Array.isArray(notifs) ? notifs : []);
        // Busca detalhadas para gráficos
        const detalhadas = await dashboardService.getEstatisticasDetalhadas(from, to);
        setDetalhadas(detalhadas);
        setError(null);
      } catch (e) {
        console.error('Erro ao carregar estatísticas:', e);
        setError('Não foi possível carregar as estatísticas.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [range, fromIso, toIso]);

  const [detalhadas, setDetalhadas] = useState<any>(null);

  const resumoTipos = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of notificacoes) {
      const key = (n.type || 'geral').toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
    const total = notificacoes.length || 1;
    const items = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([type, count]) => ({ type, count, pct: Math.round((count / total) * 100) }));
    return { items, total };
  }, [notificacoes]);

  const leitura = useMemo(() => {
    const total = notificacoes.length;
    const lidas = notificacoes.filter(n => !!n.read).length;
    const naoLidas = total - lidas;
    const pctLidas = total > 0 ? Math.round((lidas / total) * 100) : 0;
    return { total, lidas, naoLidas, pctLidas };
  }, [notificacoes]);

  if (loading) {
    return (
      <div className="stats-page">
        <div className="loading">Carregando estatísticas...</div>
      </div>
    );
  }

  return (
    <div className="stats-page">
      {error && <div className="error-message">⚠️ {error}</div>}

      <div className="filters">
        <div className={`chip ${range==='today' ? 'active' : ''}`} onClick={() => setRange('today')}>Hoje</div>
        <div className={`chip ${range==='7d' ? 'active' : ''}`} onClick={() => setRange('7d')}>7 dias</div>
        <div className={`chip ${range==='30d' ? 'active' : ''}`} onClick={() => setRange('30d')}>30 dias</div>
        <div className={`chip ${range==='custom' ? 'active' : ''}`} onClick={() => setRange('custom')}>Custom</div>
        {range === 'custom' && (
          <div className="custom-range">
            <input type="datetime-local" onChange={(e) => setFromIso(e.target.value ? new Date(e.target.value).toISOString() : null)} />
            <span>→</span>
            <input type="datetime-local" onChange={(e) => setToIso(e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </div>
        )}
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-title">Interações Hoje</div>
          <div className="kpi-value">{estatisticas?.interacoesHoje ?? 0}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Agendamentos Pendentes</div>
          <div className="kpi-value">{estatisticas?.agendamentosPendentes ?? 0}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Reagendamentos</div>
          <div className="kpi-value">{estatisticas?.reagendamentos ?? 0}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Cancelamentos</div>
          <div className="kpi-value">{estatisticas?.cancelamentos ?? 0}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Aguardando Resposta</div>
          <div className="kpi-value">{estatisticas?.pacientesAguardando ?? 0}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Atendimentos Manuais</div>
          <div className="kpi-value">{estatisticas?.atendimentosManuais ?? 0}</div>
        </div>
      </div>

      <div className="panels">
        <div className="panel">
          <div className="panel-header">
            <h3>Distribuição por Tipo (Últimas notificações)</h3>
          </div>
          <div className="bars">
            {resumoTipos.items.length > 0 ? (
              resumoTipos.items.map(({ type, count, pct }) => (
                <div key={type} className="bar-row">
                  <div className="bar-label">{type}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="bar-value">{count}</div>
                </div>
              ))
            ) : (
              <div className="empty">Sem dados suficientes</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Leitura de Notificações</h3>
          </div>
          <div className="donut">
            <div className="donut-chart" style={{
              background: `conic-gradient(#002366 ${leitura.pctLidas}%, #e2e8f0 0)`
            }} />
            <div className="donut-legend">
              <div><span className="dot dot-primary" /> Lidas: {leitura.lidas}</div>
              <div><span className="dot dot-muted" /> Não lidas: {leitura.naoLidas}</div>
              <div className="muted">Total: {leitura.total}</div>
            </div>
          </div>
        </div>
      </div>

      {detalhadas && (
        <div className="panels">
          <div className="panel">
            <div className="panel-header"><h3>Mensagens por dia</h3></div>
            <div className="bars">
              {Array.isArray(detalhadas?.messages?.porDia) && detalhadas.messages.porDia.length > 0 ? (
                detalhadas.messages.porDia.map((d: any) => (
                  <div key={d.date} className="bar-row">
                    <div className="bar-label">{d.date}</div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, d.count)}%` }} /></div>
                    <div className="bar-value">{d.count}</div>
                  </div>
                ))
              ) : (
                <div className="empty">Sem dados</div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><h3>SLA 1ª Resposta (ms)</h3></div>
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-title">Mediana</div><div className="kpi-value">{detalhadas?.slaPrimeiraRespostaMs?.medianaMs ?? 0}</div></div>
              <div className="kpi-card"><div className="kpi-title">p95</div><div className="kpi-value">{detalhadas?.slaPrimeiraRespostaMs?.p95Ms ?? 0}</div></div>
            </div>
          </div>
        </div>
      )}

      {detalhadas && (
        <div className="panels">
          <div className="panel">
            <div className="panel-header"><h3>Tempo até marcar (ms)</h3></div>
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-title">Agendamento (P50)</div><div className="kpi-value">{detalhadas?.temposAteMarcarMs?.agendamento?.medianaMs ?? 0}</div></div>
              <div className="kpi-card"><div className="kpi-title">Agendamento (P95)</div><div className="kpi-value">{detalhadas?.temposAteMarcarMs?.agendamento?.p95Ms ?? 0}</div></div>
              <div className="kpi-card"><div className="kpi-title">Reagendamento (P50)</div><div className="kpi-value">{detalhadas?.temposAteMarcarMs?.reagendamento?.medianaMs ?? 0}</div></div>
              <div className="kpi-card"><div className="kpi-title">Reagendamento (P95)</div><div className="kpi-value">{detalhadas?.temposAteMarcarMs?.reagendamento?.p95Ms ?? 0}</div></div>
              <div className="kpi-card"><div className="kpi-title">Cancelamento (P50)</div><div className="kpi-value">{detalhadas?.temposAteMarcarMs?.cancelamento?.medianaMs ?? 0}</div></div>
              <div className="kpi-card"><div className="kpi-title">Cancelamento (P95)</div><div className="kpi-value">{detalhadas?.temposAteMarcarMs?.cancelamento?.p95Ms ?? 0}</div></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><h3>Funnel</h3></div>
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-title">Conversas</div><div className="kpi-value">{detalhadas?.funnel?.conversas ?? 0}</div></div>
              <div className="kpi-card"><div className="kpi-title">Com Humano</div><div className="kpi-value">{detalhadas?.funnel?.comHumano ?? 0}</div></div>
              <div className="kpi-card"><div className="kpi-title">Resolvidas (Bot)</div><div className="kpi-value">{detalhadas?.funnel?.resolvidasBot ?? 0}</div></div>
            </div>
          </div>
        </div>
      )}

      {detalhadas && Array.isArray(detalhadas?.conversas?.top) && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <div className="panel-header"><h3>Top conversas mais longas</h3></div>
          <div className="top-table">
            <div className="top-header">
              <div>Telefone</div>
              <div>Mensagens</div>
              <div>Início</div>
              <div>Fim</div>
              <div>Duração (ms)</div>
            </div>
            {detalhadas.conversas.top.map((row: any, idx: number) => (
              <div className="top-row" key={idx}>
                <div>{row.phone}</div>
                <div>{row.mensagens}</div>
                <div>{row.inicio}</div>
                <div>{row.fim}</div>
                <div>{row.duracaoMs}</div>
              </div>
            ))}
            {detalhadas.conversas.top.length === 0 && (
              <div className="empty">Sem dados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


