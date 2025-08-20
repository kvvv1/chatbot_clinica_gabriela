import { useState, useEffect } from 'react';
import { dashboardService } from '../services/api';
import WhatsAppModal from '../components/WhatsAppModal';
import './Secretaria.css';

export default function Secretaria() {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [filtro, setFiltro] = useState('pendente'); // pendente | em_atendimento | finalizado | todos
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Estado do modal WhatsApp
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [selectedPaciente, setSelectedPaciente] = useState(null);

  useEffect(() => {
    carregarSolicitacoes();
  }, []);

  const carregarSolicitacoes = async () => {
    try {
      setLoading(true);
      const dados = await dashboardService.getSecretaria();
      setSolicitacoes(Array.isArray(dados) ? dados : []);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar solicitações:', err);
      setError('Erro ao carregar solicitações');
      setSolicitacoes([]);
    } finally {
      setLoading(false);
    }
  };

  const formatarData = (data) => {
    return new Date(data).toLocaleString('pt-BR');
  };

  const iniciarAtendimento = (solicitacao) => {
    setSelectedPaciente({
      nome: solicitacao.paciente,
      telefone: solicitacao.telefone,
      email: solicitacao.email,
      dataHora: `Solicitado em: ${formatarData(solicitacao.dataSolicitacao)}`,
      motivo: solicitacao.motivo || 'Atendimento manual solicitado',
      observacoes: solicitacao.observacoes
    });
    setShowWhatsAppModal(true);
  };

  const finalizarAtendimento = async (solicitacaoId) => {
    try {
      await dashboardService.finalizarSolicitacaoSecretaria(solicitacaoId);
      setSolicitacoes(prev => prev.filter(item => item.id !== solicitacaoId));
      alert('Atendimento finalizado com sucesso!');
    } catch (error) {
      console.error('Erro ao finalizar atendimento:', error);
      alert('Erro ao finalizar atendimento. Tente novamente.');
    }
  };

  if (loading) {
    return (
      <div className="secretaria">
        <div className="loading">Carregando solicitações...</div>
      </div>
    );
  }

  return (
    <div className="secretaria">
      <div className="page-header">
        <h1>Atendimento Manual</h1>
        <button onClick={carregarSolicitacoes} className="refresh-btn">
          🔄 Atualizar
        </button>
      </div>

      {/* Filtros de status */}
      <div className="filters" style={{ display: 'flex', gap: 8, margin: '8px 0 16px' }}>
        {['pendente','em_atendimento','finalizado','todos'].map((key) => (
          <button
            key={key}
            onClick={() => setFiltro(key)}
            className={`filter-btn ${filtro === key ? 'active' : ''}`}
          >
            {key === 'pendente' && '🟡 Pendente'}
            {key === 'em_atendimento' && '🟠 Em atendimento'}
            {key === 'finalizado' && '🟢 Finalizado'}
            {key === 'todos' && '🔎 Todos'}
          </button>
        ))}
      </div>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="secretaria-list">
        {solicitacoes.filter(s => filtro === 'todos' ? true : (s.status === filtro)).length > 0 ? (
          solicitacoes.filter(s => filtro === 'todos' ? true : (s.status === filtro)).map((solicitacao) => (
            <div key={solicitacao.id} className="secretaria-card">
              <div className="secretaria-info">
                <div className="paciente-info">
                  <h3>👤 {solicitacao.paciente}</h3>
                  <p>📱 {solicitacao.telefone}</p>
                  {solicitacao.email && <p>📧 {solicitacao.email}</p>}
                </div>
                
                <div className="solicitacao-info">
                  <p><strong>📅 Data da Solicitação:</strong> {formatarData(solicitacao.dataSolicitacao)}</p>
                  <p><strong>📝 Motivo:</strong> {solicitacao.motivo}</p>
                  {solicitacao.observacoes && (
                    <p><strong>💬 Observações:</strong> {solicitacao.observacoes}</p>
                  )}
                  <p><strong>Status:</strong> 
                    <span className={`status-badge ${solicitacao.status}`}>
                      {solicitacao.status.charAt(0).toUpperCase() + solicitacao.status.slice(1)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="secretaria-actions">
                <button 
                  onClick={async () => {
                    try {
                      await dashboardService.iniciarAtendimentoManual(solicitacao.telefone);
                      setSolicitacoes(prev => prev.map(item => item.id === solicitacao.id ? { ...item, status: 'em_atendimento' } : item));
                      iniciarAtendimento(solicitacao);
                    } catch (e) {
                      alert('Falha ao marcar como em atendimento.');
                    }
                  }}
                  className="btn-iniciar"
                >
                  Iniciar Atendimento
                </button>
                <button 
                  onClick={() => finalizarAtendimento(solicitacao.id)}
                  className="btn-finalizar"
                >
                  Finalizar
                </button>
                <button className="btn-ignorar">
                  Ignorar
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="no-solicitacoes">
            <p>📭 Nenhuma solicitação de atendimento manual no momento</p>
          </div>
        )}
      </div>

      {/* Modal WhatsApp */}
      <WhatsAppModal 
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        paciente={selectedPaciente}
      />
    </div>
  );
} 