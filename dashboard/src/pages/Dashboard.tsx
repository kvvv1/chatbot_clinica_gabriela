import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardService } from '../services/api';
import NotificationCard from '../components/NotificationCard';
import './Dashboard.css';

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
  name?: string;
  phone?: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [estatisticas, setEstatisticas] = useState<Estatisticas>({
    agendamentosPendentes: 0,
    reagendamentos: 0,
    cancelamentos: 0,
    atendimentosManuais: 0,
    interacoesHoje: 0,
    pacientesAguardando: 0
  });
  
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros de período
  type Preset = 'today' | '7d' | 'custom';
  const [preset, setPreset] = useState<Preset>('today');
  const todayStr = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();
  const [dataInicial, setDataInicial] = useState<string>(todayStr);
  const [horaInicial, setHoraInicial] = useState<string>('00:00');
  const [dataFinal, setDataFinal] = useState<string>(todayStr);
  const [horaFinal, setHoraFinal] = useState<string>('23:59');
  const [showCustom, setShowCustom] = useState<boolean>(false);

  const calcularPeriodoIso = () => {
    if (preset === 'today') {
      const base = new Date();
      const start = new Date(base);
      start.setHours(0, 0, 0, 0);
      const end = new Date(base);
      end.setHours(23, 59, 59, 999);
      return { fromIso: start.toISOString(), toIso: end.toISOString() };
    }
    if (preset === '7d') {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { fromIso: start.toISOString(), toIso: end.toISOString() };
    }
    // Custom
    const startIso = (() => {
      if (!dataInicial) return undefined as unknown as string;
      const [hh = '00', mm = '00'] = (horaInicial || '00:00').split(':');
      const d = new Date(`${dataInicial}T${hh.padStart(2,'0')}:${mm.padStart(2,'0')}:00`);
      if (isNaN(d.getTime())) return undefined as unknown as string;
      return d.toISOString();
    })();
    const endIso = (() => {
      if (!dataFinal) return undefined as unknown as string;
      const [hh = '23', mm = '59'] = (horaFinal || '23:59').split(':');
      const d = new Date(`${dataFinal}T${hh.padStart(2,'0')}:${mm.padStart(2,'0')}:59.999`);
      if (isNaN(d.getTime())) return undefined as unknown as string;
      return d.toISOString();
    })();
    return { fromIso: startIso, toIso: endIso };
  };

  useEffect(() => {
    carregarDados();
    // Atualizar dados a cada 30 segundos respeitando os filtros atuais
    const interval = setInterval(() => {
      carregarDados();
    }, 30000);
    return () => clearInterval(interval);
  }, [preset, dataInicial, horaInicial, dataFinal, horaFinal]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const { fromIso, toIso } = calcularPeriodoIso();
      const dados = await dashboardService.getEstatisticas(fromIso, toIso);
      setEstatisticas(dados.estatisticas || estatisticas);

      const normalize = (n: any): Notificacao => {
        // Extrair telefone e nome do campo message quando possível
        const message: string = n?.message || '';
        // Telefone: pega números com 10-14 dígitos (com possível +55)
        // Evita confundir CPF como telefone
        const cpfNear = /cpf\s*[\d\.\-]{11,14}/i.test(message);
        let phoneMatch = message.match(/(?:telefone|whatsapp|phone)\D*(\+?\d{10,14})/i);
        let phone = n?.phone || (phoneMatch ? phoneMatch[1] : undefined);
        if (!phone && !cpfNear) {
          const generic = message.match(/\+?\d{12,14}|55\d{10,12}/);
          phone = generic ? generic[0] : undefined;
        }

        // Nome: heurística comum "Telefone <fone> - <nome>" ou " - <nome>"
        let name: string | undefined = n?.name;
        if (!name && phone) {
          const idx = message.indexOf(phone);
          if (idx >= 0) {
            const after = message.slice(idx + String(phone).length);
            const dashIdx = after.indexOf('-');
            if (dashIdx >= 0) {
              const raw = after.slice(dashIdx + 1).trim();
              name = raw && raw.length > 0 ? raw : undefined;
            }
          }
        }

        return {
          id: n?.id,
          type: n?.type || 'geral',
          title: n?.title || 'Notificação',
          message,
          priority: (n?.priority === 'high' ? 'high' : 'normal'),
          timestamp: n?.timestamp || n?.created_at || new Date().toISOString(),
          name,
          phone
        } as Notificacao;
      };

      const normalizadas: Notificacao[] = Array.isArray(dados?.notificacoes)
        ? dados.notificacoes.map(normalize)
        : [];

      setNotificacoes(normalizadas);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError('Erro ao carregar dados da dashboard');
      // Não usar mocks: manter zerado e sem notificações
      setEstatisticas({
        agendamentosPendentes: 0,
        reagendamentos: 0,
        cancelamentos: 0,
        atendimentosManuais: 0,
        interacoesHoje: 0,
        pacientesAguardando: 0
      });
      setNotificacoes([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading && notificacoes.length === 0) {
    return (
      <div className="dashboard">
        <div className="loading">Carregando dashboard...</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {/* Barra de filtros rápida */}
      <div className="filters-bar" role="region" aria-label="Filtros de período">
        <div className="filters-quick">
          <button
            className={`pill ${preset === '7d' ? 'active' : ''}`}
            onClick={() => setPreset('7d')}
            aria-pressed={preset === '7d'}
            title="Últimos 7 dias"
          >
            7D
          </button>
          <button
            className={`pill ${preset === 'today' ? 'active' : ''}`}
            onClick={() => setPreset('today')}
            aria-pressed={preset === 'today'}
            title="Hoje"
          >
            HOJE
          </button>
          <button
            className={`pill icon ${preset === 'custom' ? 'active' : ''}`}
            onClick={() => { setPreset('custom'); setShowCustom((v) => !v); }}
            aria-pressed={preset === 'custom'}
            title="Personalizar período"
          >
            ✎
          </button>
        </div>

        {preset === 'custom' && showCustom && (
          <div className="custom-popover">
            <div className="filters-grid">
              <div className="field">
                <label>Data inicial</label>
                <input
                  type="date"
                  value={dataInicial || ''}
                  onChange={(e) => setDataInicial(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Hora inicial</label>
                <input
                  type="time"
                  value={horaInicial}
                  onChange={(e) => setHoraInicial(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Data final</label>
                <input
                  type="date"
                  value={dataFinal || ''}
                  onChange={(e) => setDataFinal(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Hora final</label>
                <input
                  type="time"
                  value={horaFinal}
                  onChange={(e) => setHoraFinal(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="stats-grid">
        <div
          className="stat-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/agendamentos')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/agendamentos'); } }}
        >
          <div className="stat-icon">📅</div>
          <div className="stat-content">
            <h3>Agendamentos Pendentes</h3>
            <p className="stat-number">{estatisticas.agendamentosPendentes}</p>
          </div>
        </div>

        <div
          className="stat-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/reagendamentos')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/reagendamentos'); } }}
        >
          <div className="stat-icon">🔄</div>
          <div className="stat-content">
            <h3>Reagendamentos</h3>
            <p className="stat-number">{estatisticas.reagendamentos}</p>
          </div>
        </div>

        <div
          className="stat-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/cancelamentos')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/cancelamentos'); } }}
        >
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <h3>Cancelamentos</h3>
            <p className="stat-number">{estatisticas.cancelamentos}</p>
          </div>
        </div>

        <div
          className="stat-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/secretaria')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/secretaria'); } }}
        >
          <div className="stat-icon">💬</div>
          <div className="stat-content">
            <h3>Atendimentos Manuais</h3>
            <p className="stat-number">{estatisticas.atendimentosManuais}</p>
          </div>
        </div>

        <div
          className="stat-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/estatisticas')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/estatisticas'); } }}
        >
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Interações Hoje</h3>
            <p className="stat-number">{estatisticas.interacoesHoje}</p>
          </div>
        </div>

        <div
          className="stat-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/espera')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/espera'); } }}
        >
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <h3>Aguardando Resposta</h3>
            <p className="stat-number">{estatisticas.pacientesAguardando}</p>
          </div>
        </div>
      </div>

      <div className="notifications-section">
        <div className="section-header">
          <h2>Últimas Notificações</h2>
          <button onClick={carregarDados} className="refresh-btn">
            Atualizar
          </button>
        </div>
        
        <div className="notifications-list">
          {notificacoes.length > 0 ? (
            notificacoes.map((notificacao) => (
              <NotificationCard 
                key={notificacao.id} 
                notification={notificacao} 
              />
            ))
          ) : (
            <div className="no-notifications">
              <p>Nenhuma notificação no momento</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 