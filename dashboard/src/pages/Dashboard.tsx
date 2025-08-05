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
  id: number;
  type: string;
  title: string;
  message: string;
  timestamp: Date;
  priority?: 'normal' | 'high';
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
      setNotificacoes(dados.notificacoes || []);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError('Erro ao carregar dados da dashboard');
      // Dados mock para demonstração
      setEstatisticas({
        agendamentosPendentes: 3,
        reagendamentos: 2,
        cancelamentos: 1,
        atendimentosManuais: 1,
        interacoesHoje: 45,
        pacientesAguardando: 5
      });
      setNotificacoes([
        {
          id: 1,
          type: 'paciente',
          title: 'Novo paciente',
          message: 'João Silva cadastrado',
          timestamp: new Date(Date.now() - 5 * 60 * 1000),
          priority: 'normal'
        },
        {
          id: 2,
          type: 'agendamento',
          title: 'Agendamento confirmado',
          message: 'Ana Lima - 10:00',
          timestamp: new Date(Date.now() - 15 * 60 * 1000),
          priority: 'normal'
        },
        // {
        //   id: 3,
        //   type: 'secretaria',
        //   title: 'Atendimento manual',
        //   message: '+55 31 91234-5678',
        //   timestamp: new Date(Date.now() - 30 * 60 * 1000),
        //   priority: 'high'
        // }
      ]);
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