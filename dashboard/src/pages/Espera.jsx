import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { dashboardService } from '../services/api';
import WhatsAppModal from '../components/WhatsAppModal';
import './Espera.css';

export default function Espera() {
  const [listaEspera, setListaEspera] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [prioridadeAberta, setPrioridadeAberta] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  
  // Estado do modal WhatsApp
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [selectedPaciente, setSelectedPaciente] = useState(null);

  // Estado para modal de detalhes
  const [showDetalhesModal, setShowDetalhesModal] = useState(false);
  const [selectedDetalhes, setSelectedDetalhes] = useState(null);

  // Estado para modal de agendamento
  const [showAgendamentoModal, setShowAgendamentoModal] = useState(false);
  const [selectedAgendamento, setSelectedAgendamento] = useState(null);

  useEffect(() => {
    carregarListaEspera();
  }, []);

  const carregarListaEspera = async () => {
    try {
      setLoading(true);
      const dados = await dashboardService.getListaEspera();
      setListaEspera(Array.isArray(dados) ? dados : []);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar lista de espera:', err);
      setError('Erro ao carregar lista de espera');
      setListaEspera([]);
    } finally {
      setLoading(false);
    }
  };

  const formatarData = (data) => {
    return new Date(data).toLocaleDateString('pt-BR');
  };

  const togglePrioridade = (itemId) => {
    setPrioridadeAberta(prioridadeAberta === itemId ? null : itemId);
  };

  const selecionarPrioridade = async (itemId, novaPrioridade) => {
    try {
      setActionLoading(prev => ({ ...prev, [`prioridade_${itemId}`]: true }));
      await dashboardService.updateWaitlistPriority(itemId, novaPrioridade);
      setListaEspera(prev => prev.map(item => (
        item.id === itemId ? { ...item, prioridade: novaPrioridade } : item
      )));
      const prioridadeText = novaPrioridade.charAt(0).toUpperCase() + novaPrioridade.slice(1);
      alert(`Prioridade alterada para: ${prioridadeText}`);
    } catch (error) {
      console.error('Erro ao alterar prioridade:', error);
      alert('Erro ao alterar prioridade. Tente novamente.');
    } finally {
      setActionLoading(prev => ({ ...prev, [`prioridade_${itemId}`]: false }));
      setPrioridadeAberta(null);
    }
  };

  const handleContatarWhatsApp = (espera) => {
    setActionLoading(prev => ({ ...prev, [`whatsapp_${espera.id}`]: true }));
    
    // Simular carregamento
    setTimeout(() => {
      setSelectedPaciente({
        nome: espera.paciente,
        telefone: espera.telefone,
        dataHora: `Solicitado em: ${formatarData(espera.dataSolicitacao)}`,
        motivo: `Lista de espera - Prioridade: ${espera.prioridade}`
      });
      setShowWhatsAppModal(true);
      setActionLoading(prev => ({ ...prev, [`whatsapp_${espera.id}`]: false }));
    }, 300);
  };

  const handleLigar = async (espera) => {
    try {
      setActionLoading(prev => ({ ...prev, [`ligar_${espera.id}`]: true }));
      
      // Simular chamada à API para registrar a ligação
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Abrir aplicativo de telefone
      const numeroLimpo = espera.telefone.replace(/\D/g, '');
      window.open(`tel:${numeroLimpo}`, '_blank');
      
      console.log(`Ligando para: ${espera.telefone}`);
    } catch (error) {
      console.error('Erro ao realizar ligação:', error);
      alert('Erro ao realizar ligação. Tente novamente.');
    } finally {
      setActionLoading(prev => ({ ...prev, [`ligar_${espera.id}`]: false }));
    }
  };

  const handleEmail = async (espera) => {
    try {
      setActionLoading(prev => ({ ...prev, [`email_${espera.id}`]: true }));
      
      // Simular chamada à API
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Abrir cliente de email
      const assunto = encodeURIComponent('Resposta - Lista de Espera');
      const corpo = encodeURIComponent(`Olá ${espera.paciente},\n\nRecebemos sua solicitação de agendamento.\n\nEm breve entraremos em contato para confirmar sua consulta.\n\nAtenciosamente,\nEquipe da Clínica`);
      
      window.open(`mailto:${espera.email}?subject=${assunto}&body=${corpo}`, '_blank');
      
      console.log(`Enviando email para: ${espera.email}`);
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      alert('Erro ao enviar email. Tente novamente.');
    } finally {
      setActionLoading(prev => ({ ...prev, [`email_${espera.id}`]: false }));
    }
  };

  const handleDetalhes = (espera) => {
    setActionLoading(prev => ({ ...prev, [`detalhes_${espera.id}`]: true }));
    
    // Simular carregamento
    setTimeout(() => {
      setSelectedDetalhes({
        ...espera,
        dataFormatada: formatarData(espera.dataSolicitacao)
      });
      setShowDetalhesModal(true);
      setActionLoading(prev => ({ ...prev, [`detalhes_${espera.id}`]: false }));
    }, 300);
  };

  const handleAgendar = (espera) => {
    setActionLoading(prev => ({ ...prev, [`agendar_${espera.id}`]: true }));
    
    // Simular carregamento
    setTimeout(() => {
      setSelectedAgendamento({
        ...espera,
        dataFormatada: formatarData(espera.dataSolicitacao)
      });
      setShowAgendamentoModal(true);
      setActionLoading(prev => ({ ...prev, [`agendar_${espera.id}`]: false }));
    }, 300);
  };

  const confirmarAgendamento = async (espera, dataAgendamento, horario) => {
    try {
      setActionLoading(prev => ({ ...prev, [`agendar_${espera.id}`]: true }));
      
      // Simular chamada à API
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Remover da lista de espera
      setListaEspera(prev => prev.filter(item => item.id !== espera.id));
      
      console.log(`Paciente ${espera.paciente} agendado para ${dataAgendamento} às ${horario}`);
      alert(`Paciente ${espera.paciente} agendado com sucesso!`);
      
      setShowAgendamentoModal(false);
    } catch (error) {
      console.error('Erro ao agendar:', error);
      alert('Erro ao agendar. Tente novamente.');
    } finally {
      setActionLoading(prev => ({ ...prev, [`agendar_${espera.id}`]: false }));
    }
  };

  const handleRemover = async (espera) => {
    if (!confirm(`Tem certeza que deseja remover ${espera.paciente} da lista de espera?`)) {
      return;
    }

    try {
      setActionLoading(prev => ({ ...prev, [`remover_${espera.id}`]: true }));
      await dashboardService.removeWaitlist(espera.id);
      setListaEspera(prev => prev.filter(item => item.id !== espera.id));
      alert(`Paciente ${espera.paciente} removido da lista de espera!`);
    } catch (error) {
      console.error('Erro ao remover:', error);
      alert('Erro ao remover. Tente novamente.');
    } finally {
      setActionLoading(prev => ({ ...prev, [`remover_${espera.id}`]: false }));
    }
  };



  if (loading) {
    return (
      <div className="espera">
        <div className="loading">Carregando lista de espera...</div>
      </div>
    );
  }

  return (
    <div className="espera">
      <div className="page-header">
        <h1>Lista de Espera</h1>
        <button onClick={carregarListaEspera} className="refresh-btn">
          Atualizar
        </button>
      </div>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="espera-list">
        {listaEspera.length > 0 ? (
          [...listaEspera]
            .sort((a, b) => {
              // ordem por data de solicitação ascendente (primeiro adicionado vem primeiro)
              const da = new Date(a.dataSolicitacao || 0).getTime();
              const db = new Date(b.dataSolicitacao || 0).getTime();
              return da - db;
            })
            .map((item, index) => (
            <div key={item.id} className="lista-espera-card">
              {/* Coluna Esquerda - Dados do Paciente */}
              <div className="paciente-info-espera">
                <div className="paciente-nome">
                  <span className="rank-badge">#{index + 1}</span>
                  <h3>👤 {item.paciente}</h3>
                </div>
                
                <div className="paciente-contato">
                  <p>📞 {item.telefone}</p>
                  {item.email && <p>📧 {item.email}</p>}
                </div>
                
                <div className="paciente-detalhes">
                  <p>📅 Solicitado em: {formatarData(item.dataSolicitacao)}</p>
                </div>
              </div>

              {/* Coluna Direita - Status da Espera */}
              <div className="status-espera">
                
                <div className="status-detalhes">
                  <p className="tempo-espera">⏰ Tempo de espera: Há {item.tempoEspera} dias</p>
                  <h4>Prioridade:</h4>
                  <div className="prioridade-select">
                    <button 
                      className="prioridade-trigger"
                      onClick={() => togglePrioridade(item.id)}
                      disabled={actionLoading[`prioridade_${item.id}`]}
                    >
                      <span className={`prioridade-dot ${item.prioridade}`}></span>
                      <span>{item.prioridade.charAt(0).toUpperCase() + item.prioridade.slice(1)}</span>
                      <span className="dropdown-arrow">▼</span>
                    </button>
                    
                    {prioridadeAberta === item.id && (
                      <div className="prioridade-dropdown">
                        <div 
                          className={`prioridade-option ${item.prioridade === 'baixa' ? 'ativo' : ''}`}
                          onClick={() => selecionarPrioridade(item.id, 'baixa')}
                        >
                          <span className="prioridade-dot baixa"></span>
                          <span>Baixa</span>
                        </div>
                        <div 
                          className={`prioridade-option ${item.prioridade === 'media' ? 'ativo' : ''}`}
                          onClick={() => selecionarPrioridade(item.id, 'media')}
                        >
                          <span className="prioridade-dot media"></span>
                          <span>Média</span>
                        </div>
                        <div 
                          className={`prioridade-option ${item.prioridade === 'alta' ? 'ativo' : ''}`}
                          onClick={() => selecionarPrioridade(item.id, 'alta')}
                        >
                          <span className="prioridade-dot alta"></span>
                          <span>Alta</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Ações - Linha 1: Contato direto */}
              <div className="acoes-contato">
                <button 
                  className="btn-whatsapp"
                  onClick={() => handleContatarWhatsApp(item)}
                  disabled={actionLoading[`whatsapp_${item.id}`]}
                >
                  {actionLoading[`whatsapp_${item.id}`] ? '⏳' : '💬'} WhatsApp
                </button>
              </div>

              {/* Ações - Linha 2: (removidas para melhorar espaçamento) */}

              {/* Ações - Coluna Direita: Principais */}
              <div className="acoes-principais">
                <button 
                  className="btn-agendar"
                  onClick={() => handleAgendar(item)}
                  disabled={actionLoading[`agendar_${item.id}`]}
                >
                  {actionLoading[`agendar_${item.id}`] ? '⏳' : '✅'} Agendar
                </button>
                <button 
                  className="btn-remover"
                  onClick={() => handleRemover(item)}
                  disabled={actionLoading[`remover_${item.id}`]}
                >
                  {actionLoading[`remover_${item.id}`] ? '⏳' : '❌'} Remover
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="no-espera">
            <p>📭 Nenhum paciente na lista de espera no momento</p>
          </div>
        )}
      </div>
      
      {/* Modal WhatsApp */}
      <WhatsAppModal 
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        paciente={selectedPaciente}
      />

      {/* Modal de Detalhes */}
      {showDetalhesModal && selectedDetalhes && createPortal(
        <div className="modal-overlay" onClick={() => setShowDetalhesModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📋 Detalhes do Paciente</h2>
              <button className="modal-close" onClick={() => setShowDetalhesModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detalhes-grid">
                <div className="detalhes-item">
                  <strong>Nome:</strong> {selectedDetalhes.paciente}
                </div>
                <div className="detalhes-item">
                  <strong>Telefone:</strong> {selectedDetalhes.telefone}
                </div>
                <div className="detalhes-item">
                  <strong>Email:</strong> {selectedDetalhes.email || 'Não informado'}
                </div>
                <div className="detalhes-item">
                  <strong>Data da Solicitação:</strong> {selectedDetalhes.dataFormatada}
                </div>
                <div className="detalhes-item">
                  <strong>Tempo de Espera:</strong> {selectedDetalhes.tempoEspera} dias
                </div>
                <div className="detalhes-item">
                  <strong>Prioridade:</strong> 
                  <span className={`prioridade-badge ${selectedDetalhes.prioridade}`}>
                    {selectedDetalhes.prioridade.charAt(0).toUpperCase() + selectedDetalhes.prioridade.slice(1)}
                  </span>
                </div>
                <div className="detalhes-item">
                  <strong>Motivo:</strong> {selectedDetalhes.motivo}
                </div>
                <div className="detalhes-item">
                  <strong>Observações:</strong> {selectedDetalhes.observacoes}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDetalhesModal(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Agendamento */}
      {showAgendamentoModal && selectedAgendamento && createPortal(
        <div className="modal-overlay" onClick={() => setShowAgendamentoModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📅 Agendar Consulta</h2>
              <button className="modal-close" onClick={() => setShowAgendamentoModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="agendamento-info">
                <p><strong>Paciente:</strong> {selectedAgendamento.paciente}</p>
                <p><strong>Telefone:</strong> {selectedAgendamento.telefone}</p>
              </div>
              
              <div className="agendamento-form">
                <div className="form-group">
                  <label>Data da Consulta:</label>
                  <input 
                    type="date" 
                    id="dataAgendamento"
                    min={new Date().toISOString().split('T')[0]}
                    className="form-input"
                  />
                </div>
                
                <div className="form-group">
                  <label>Horário:</label>
                  <select id="horarioAgendamento" className="form-input">
                    <option value="">Selecione um horário</option>
                    <option value="08:00">08:00</option>
                    <option value="09:00">09:00</option>
                    <option value="10:00">10:00</option>
                    <option value="11:00">11:00</option>
                    <option value="14:00">14:00</option>
                    <option value="15:00">15:00</option>
                    <option value="16:00">16:00</option>
                    <option value="17:00">17:00</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Observações:</label>
                  <textarea 
                    id="observacoesAgendamento"
                    className="form-input"
                    placeholder="Observações sobre o agendamento..."
                    rows="3"
                  ></textarea>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={() => setShowAgendamentoModal(false)}
              >
                Cancelar
              </button>
              <button 
                className="btn-primary"
                onClick={() => {
                  const data = document.getElementById('dataAgendamento').value;
                  const horario = document.getElementById('horarioAgendamento').value;
                  
                  if (!data || !horario) {
                    alert('Por favor, preencha a data e horário.');
                    return;
                  }
                  
                  confirmarAgendamento(selectedAgendamento, data, horario);
                }}
              >
                Confirmar Agendamento
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
} 