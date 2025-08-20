import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { dashboardService } from '../services/api';
import './Agendamentos.css';

export default function Agendamentos() {
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAgendamento, setSelectedAgendamento] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState(''); // 'aprovar' ou 'rejeitar'
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  useEffect(() => {
    carregarAgendamentos();
  }, []);

  const carregarAgendamentos = async () => {
    try {
      setLoading(true);
      const dados = await dashboardService.getAgendamentos();
      setAgendamentos(Array.isArray(dados) ? dados : []);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar agendamentos:', err);
      setError('Erro ao carregar agendamentos');
      setAgendamentos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAprovar = async (id) => {
    try {
      await dashboardService.aprovarAgendamento(id);
      await carregarAgendamentos();
      setShowModal(false);
      setSelectedAgendamento(null);
    } catch (err) {
      console.error('Erro ao aprovar agendamento:', err);
      alert('Erro ao aprovar agendamento');
    }
  };

  const handleRejeitar = async (id, motivo) => {
    try {
      await dashboardService.rejeitarAgendamento(id, motivo);
      await carregarAgendamentos();
      setShowModal(false);
      setSelectedAgendamento(null);
      setMotivoRejeicao('');
    } catch (err) {
      console.error('Erro ao rejeitar agendamento:', err);
      alert('Erro ao rejeitar agendamento');
    }
  };

  const openModal = (agendamento, type) => {
    setSelectedAgendamento(agendamento);
    setModalType(type);
    setShowModal(true);
  };

  const formatarData = (data) => {
    return new Date(data).toLocaleDateString('pt-BR');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pendente':
        return 'orange';
      case 'aprovado':
        return 'green';
      case 'rejeitado':
        return 'red';
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <div className="agendamentos">
        <div className="loading">Carregando agendamentos...</div>
      </div>
    );
  }

  return (
    <div className="agendamentos">
      <div className="page-header">
        <h1>📋 Agendamentos Pendentes</h1>
        <button onClick={carregarAgendamentos} className="refresh-btn">
          🔄 Atualizar
        </button>
      </div>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="agendamentos-list">
        {agendamentos.length > 0 ? (
          agendamentos.map((agendamento) => (
            <div key={agendamento.id} className="agendamento-card">
              <div className="agendamento-info">
                {/* Coluna 1: Nome, Telefone, Status */}
                <div className="paciente-info">
                  <div className="paciente-name">
                    👤 {agendamento.paciente}
                  </div>
                  <div className="paciente-phone">
                    📱 {agendamento.telefone}
                  </div>
                  <div className="status-badge" style={{ backgroundColor: getStatusColor(agendamento.status) }}>
                    {agendamento.status}
                  </div>
                </div>
                
                {/* Coluna 2: Data, Horário, Consulta */}
                <div className="consulta-info">
                  <p><strong>📅 Data:</strong> {formatarData(agendamento.data)}</p>
                  <p><strong>🕐 Horário:</strong> {agendamento.horario}</p>
                  {agendamento.observacoes && (
                    <p><strong>📝 Consulta:</strong> {agendamento.observacoes}</p>
                  )}
                </div>
                
                {/* Coluna 3: Botões de Ação */}
                <div className="agendamento-actions">
                  <button 
                    onClick={() => openModal(agendamento, 'aprovar')}
                    className="btn-aprovar"
                  >
                    Aprovar
                  </button>
                  <button 
                    onClick={() => openModal(agendamento, 'rejeitar')}
                    className="btn-rejeitar"
                  >
                    Rejeitar
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="no-agendamentos">
            <p>📭 Nenhum agendamento pendente no momento</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && selectedAgendamento && createPortal(
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>
                {modalType === 'aprovar' ? 'Aprovar Agendamento' : 'Rejeitar Agendamento'}
              </h3>
              <button onClick={() => setShowModal(false)} className="close-btn">×</button>
            </div>
            
            <div className="modal-body">
              <p>
                <strong>👤 Paciente:</strong> {selectedAgendamento.paciente}
              </p>
              <p>
                <strong>📅 Data:</strong> {formatarData(selectedAgendamento.data)} às {selectedAgendamento.horario}
              </p>
              
              {modalType === 'rejeitar' && (
                <div className="motivo-rejeicao">
                  <label htmlFor="motivo">📝 Motivo da rejeição:</label>
                  <textarea
                    id="motivo"
                    value={motivoRejeicao}
                    onChange={(e) => setMotivoRejeicao(e.target.value)}
                    placeholder="Digite o motivo da rejeição..."
                    rows="3"
                  />
                </div>
              )}
            </div>
            
            <div className="modal-actions">
              <button 
                onClick={() => setShowModal(false)}
                className="btn-cancelar"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (modalType === 'aprovar') {
                    handleAprovar(selectedAgendamento.id);
                  } else {
                    if (motivoRejeicao.trim()) {
                      handleRejeitar(selectedAgendamento.id, motivoRejeicao);
                    } else {
                      alert('Por favor, informe o motivo da rejeição');
                    }
                  }
                }}
                className={modalType === 'aprovar' ? 'btn-confirmar-aprovar' : 'btn-confirmar-rejeitar'}
              >
                {modalType === 'aprovar' ? 'Aprovar' : 'Rejeitar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
} 