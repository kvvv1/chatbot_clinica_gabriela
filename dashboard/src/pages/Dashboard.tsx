import { useState, useEffect } from 'react';
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

  useEffect(() => {
    carregarDados();
    // Atualizar dados a cada 30 segundos
    const interval = setInterval(carregarDados, 30000);
    return () => clearInterval(interval);
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const dados = await dashboardService.getEstatisticas();
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

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-content">
            <h3>Agendamentos Pendentes</h3>
            <p className="stat-number">{estatisticas.agendamentosPendentes}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🔄</div>
          <div className="stat-content">
            <h3>Reagendamentos</h3>
            <p className="stat-number">{estatisticas.reagendamentos}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <h3>Cancelamentos</h3>
            <p className="stat-number">{estatisticas.cancelamentos}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💬</div>
          <div className="stat-content">
            <h3>Atendimentos Manuais</h3>
            <p className="stat-number">{estatisticas.atendimentosManuais}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Interações Hoje</h3>
            <p className="stat-number">{estatisticas.interacoesHoje}</p>
          </div>
        </div>

        <div className="stat-card">
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