import { useState, useEffect } from 'react';
import { dashboardService } from '../services/api';
import WhatsAppModal from '../components/WhatsAppModal';
import './Secretaria.css';

export default function Secretaria() {
  const [solicitacoes, setSolicitacoes] = useState([]);
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
      setSolicitacoes(dados || []);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar solicitações:', err);
      setError('Erro ao carregar solicitações');
      // Dados mock
      setSolicitacoes([
        {
          id: 1,
          paciente: 'Roberto Santos',
          telefone: '+55 31 91234-5678',
          email: 'roberto.santos@email.com',
          dataSolicitacao: '2024-01-15T10:30:00',
          status: 'pendente',
          motivo: 'Dúvida sobre horário de atendimento',
          observacoes: 'Paciente quer confirmar se a clínica funciona aos sábados'
        },
        {
          id: 2,
          paciente: 'Ana Paula Costa',
          telefone: '+55 31 98765-4321',
          email: 'ana.costa@email.com',
          dataSolicitacao: '2024-01-15T11:15:00',
          status: 'pendente',
          motivo: 'Solicitação de documentos',
          observacoes: 'Precisa de atestado médico para o trabalho'
        },
        {
          id: 3,
          paciente: 'Carlos Eduardo Silva',
          telefone: '+55 31 94567-8901',
          email: 'carlos.silva@email.com',
          dataSolicitacao: '2024-01-15T14:20:00',
          status: 'pendente',
          motivo: 'Reagendamento de consulta',
          observacoes: 'Não pode comparecer no horário agendado'
        }
      ]);
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
      // Simular chamada à API para marcar como atendido
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Remover da lista
      setSolicitacoes(prev => prev.filter(item => item.id !== solicitacaoId));
      
      console.log(`Atendimento finalizado para solicitação ${solicitacaoId}`);
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

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="secretaria-list">
        {solicitacoes.length > 0 ? (
          solicitacoes.map((solicitacao) => (
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
                  onClick={() => iniciarAtendimento(solicitacao)}
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