import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { dashboardService } from '../services/api';
import './Reagendamentos.css';

export default function Reagendamentos() {
  const [reagendamentos, setReagendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Estados dos modais
  const [modalContatar, setModalContatar] = useState({ show: false, paciente: null });
  const [modalAgendado, setModalAgendado] = useState({ show: false, paciente: null });
  const [modalEspera, setModalEspera] = useState({ show: false, paciente: null });
  const [modalNaoQuer, setModalNaoQuer] = useState({ show: false, paciente: null });
  
  // Estados dos formulários
  const [formData, setFormData] = useState({
    mensagem: '',
    novaData: '',
    novoHorario: '',
    motivo: ''
  });

  useEffect(() => {
    carregarReagendamentos();
  }, []);

  const carregarReagendamentos = async () => {
    try {
      setLoading(true);
      const dados = await dashboardService.getReagendamentos();
      setReagendamentos(dados || []);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar reagendamentos:', err);
      setError('Erro ao carregar reagendamentos');
      // Dados mock
      setReagendamentos([
        {
          id: 1,
          paciente: 'Ana Costa Silva',
          telefone: '+55 31 91234-5678',
          dataAtual: '2024-01-15',
          horarioAtual: '10:00'
        },
        {
          id: 2,
          paciente: 'João Pedro Santos',
          telefone: '+55 31 99876-5432',
          dataAtual: '2024-01-16',
          horarioAtual: '14:30'
        },
        {
          id: 3,
          paciente: 'Maria Fernanda Oliveira',
          telefone: '+55 31 98765-4321',
          dataAtual: '2024-01-17',
          horarioAtual: '09:15'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatarData = (data) => {
    return new Date(data).toLocaleDateString('pt-BR');
  };

  // Funções para abrir modais
  const abrirModalContatar = (paciente) => {
    setModalContatar({ show: true, paciente });
    setFormData({ mensagem: '', novaData: '', novoHorario: '', motivo: '' });
  };

  const abrirModalAgendado = (paciente) => {
    setModalAgendado({ show: true, paciente });
    setFormData({ mensagem: '', novaData: '', novoHorario: '', motivo: '' });
  };

  const abrirModalEspera = (paciente) => {
    setModalEspera({ show: true, paciente });
    setFormData({ mensagem: '', novaData: '', novoHorario: '', motivo: '' });
  };

  const abrirModalNaoQuer = (paciente) => {
    setModalNaoQuer({ show: true, paciente });
    setFormData({ mensagem: '', novaData: '', novoHorario: '', motivo: '' });
  };

  // Funções para fechar modais
  const fecharModal = () => {
    setModalContatar({ show: false, paciente: null });
    setModalAgendado({ show: false, paciente: null });
    setModalEspera({ show: false, paciente: null });
    setModalNaoQuer({ show: false, paciente: null });
    setFormData({ mensagem: '', novaData: '', novoHorario: '', motivo: '' });
  };

  // Funções para executar ações
  const executarContatar = async () => {
    try {
      // Aqui você implementaria a lógica para enviar mensagem
      console.log('Contatando paciente:', modalContatar.paciente, formData.mensagem);
      alert('Mensagem enviada com sucesso!');
      fecharModal();
    } catch (error) {
      console.error('Erro ao contatar paciente:', error);
      alert('Erro ao enviar mensagem');
    }
  };

  const executarAgendado = async () => {
    try {
      // Aqui você implementaria a lógica para confirmar agendamento
      console.log('Confirmando agendamento:', modalAgendado.paciente, formData.novaData, formData.novoHorario);
      alert('Agendamento confirmado com sucesso!');
      fecharModal();
    } catch (error) {
      console.error('Erro ao confirmar agendamento:', error);
      alert('Erro ao confirmar agendamento');
    }
  };

  const executarEspera = async () => {
    try {
      // Aqui você implementaria a lógica para colocar na lista de espera
      console.log('Adicionando à lista de espera:', modalEspera.paciente, formData.motivo);
      alert('Paciente adicionado à lista de espera!');
      fecharModal();
    } catch (error) {
      console.error('Erro ao adicionar à lista de espera:', error);
      alert('Erro ao adicionar à lista de espera');
    }
  };

  const executarNaoQuer = async () => {
    try {
      // Aqui você implementaria a lógica para cancelar
      console.log('Cancelando agendamento:', modalNaoQuer.paciente, formData.motivo);
      alert('Agendamento cancelado com sucesso!');
      fecharModal();
    } catch (error) {
      console.error('Erro ao cancelar agendamento:', error);
      alert('Erro ao cancelar agendamento');
    }
  };

  if (loading) {
    return (
      <div className="reagendamentos">
        <div className="loading">Carregando reagendamentos...</div>
      </div>
    );
  }

  return (
    <div className="reagendamentos">
      <div className="page-header">
        <h1>Solicitações de Reagendamento</h1>
        <button onClick={carregarReagendamentos} className="refresh-btn">
          Atualizar
        </button>
      </div>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="reagendamentos-list">
        {reagendamentos.length > 0 ? (
          reagendamentos.map((reagendamento) => (
            <div key={reagendamento.id} className="reagendamento-card">
              {/* Coluna 1: Informações do Paciente */}
              <div className="paciente-info-reagendamento">
                <h3>{reagendamento.paciente}</h3>
                <p>📱 {reagendamento.telefone}</p>
              </div>
              
              {/* Coluna 2: Informações do Agendamento */}
              <div className="agendamento-info-reagendamento">
                <h4>AGENDAMENTO ATUAL</h4>
                <p>{formatarData(reagendamento.dataAtual)} às {reagendamento.horarioAtual}</p>
              </div>

              {/* Coluna 3: Botões de Ação */}
              <div className="reagendamento-actions">
                <button 
                  className="btn-contatar"
                  onClick={() => abrirModalContatar(reagendamento)}
                >
                  Contatar
                </button>
                <button 
                  className="btn-agendado"
                  onClick={() => abrirModalAgendado(reagendamento)}
                >
                  Agendado
                </button>
                <button 
                  className="btn-espera"
                  onClick={() => abrirModalEspera(reagendamento)}
                >
                  Espera
                </button>
                <button 
                  className="btn-nao-quer"
                  onClick={() => abrirModalNaoQuer(reagendamento)}
                >
                  Não Quer
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="no-reagendamentos">
            <p>📭 Nenhuma solicitação de reagendamento no momento</p>
          </div>
        )}
      </div>

      {/* Modal Contatar */}
      {modalContatar.show && createPortal(
        <div className="modal-overlay-reagendamento" onClick={fecharModal}>
          <div className="modal-reagendamento" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-reagendamento">
              <h3>💬 Contatar Paciente</h3>
              <button className="close-btn-reagendamento" onClick={fecharModal}>×</button>
            </div>
            <div className="modal-body-reagendamento">
              <p><strong>👤 Paciente:</strong> {modalContatar.paciente?.paciente}</p>
              <p><strong>📱 Telefone:</strong> {modalContatar.paciente?.telefone}</p>
              <p><strong>📅 Agendamento Atual:</strong> {formatarData(modalContatar.paciente?.dataAtual)} às {modalContatar.paciente?.horarioAtual}</p>
              
              <div className="form-group-reagendamento">
                <label>📝 Mensagem para o paciente:</label>
                <textarea
                  value={formData.mensagem}
                  onChange={(e) => setFormData({...formData, mensagem: e.target.value})}
                  placeholder="Digite sua mensagem..."
                  rows="4"
                />
              </div>
            </div>
            <div className="modal-actions-reagendamento">
              <button className="btn-cancelar-reagendamento" onClick={fecharModal}>Cancelar</button>
              <button className="btn-confirmar-aprovar-reagendamento" onClick={executarContatar}>Enviar Mensagem</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Agendado */}
      {modalAgendado.show && createPortal(
        <div className="modal-overlay-reagendamento" onClick={fecharModal}>
          <div className="modal-reagendamento" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-reagendamento">
              <h3>✅ Confirmar Agendamento</h3>
              <button className="close-btn-reagendamento" onClick={fecharModal}>×</button>
            </div>
            <div className="modal-body-reagendamento">
              <p><strong>👤 Paciente:</strong> {modalAgendado.paciente?.paciente}</p>
              <p><strong>📱 Telefone:</strong> {modalAgendado.paciente?.telefone}</p>
              <p><strong>📅 Agendamento Atual:</strong> {formatarData(modalAgendado.paciente?.dataAtual)} às {modalAgendado.paciente?.horarioAtual}</p>
              
              <div className="form-group-reagendamento">
                <label>📅 Nova Data:</label>
                <input
                  type="date"
                  value={formData.novaData}
                  onChange={(e) => setFormData({...formData, novaData: e.target.value})}
                />
              </div>
              
              <div className="form-group-reagendamento">
                <label>🕐 Novo Horário:</label>
                <input
                  type="time"
                  value={formData.novoHorario}
                  onChange={(e) => setFormData({...formData, novoHorario: e.target.value})}
                />
              </div>
              
              <div className="form-group-reagendamento">
                <label>📝 Observações:</label>
                <textarea
                  value={formData.mensagem}
                  onChange={(e) => setFormData({...formData, mensagem: e.target.value})}
                  placeholder="Observações sobre o reagendamento..."
                  rows="3"
                />
              </div>
            </div>
            <div className="modal-actions-reagendamento">
              <button className="btn-cancelar-reagendamento" onClick={fecharModal}>Cancelar</button>
              <button className="btn-confirmar-aprovar-reagendamento" onClick={executarAgendado}>Confirmar Agendamento</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Lista de Espera */}
      {modalEspera.show && createPortal(
        <div className="modal-overlay-reagendamento" onClick={fecharModal}>
          <div className="modal-reagendamento" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-reagendamento">
              <h3>⏳ Adicionar à Lista de Espera</h3>
              <button className="close-btn-reagendamento" onClick={fecharModal}>×</button>
            </div>
            <div className="modal-body-reagendamento">
              <p><strong>👤 Paciente:</strong> {modalEspera.paciente?.paciente}</p>
              <p><strong>📱 Telefone:</strong> {modalEspera.paciente?.telefone}</p>
              <p><strong>📅 Agendamento Atual:</strong> {formatarData(modalEspera.paciente?.dataAtual)} às {modalEspera.paciente?.horarioAtual}</p>
              
              <div className="form-group-reagendamento">
                <label>📝 Motivo para lista de espera:</label>
                <textarea
                  value={formData.motivo}
                  onChange={(e) => setFormData({...formData, motivo: e.target.value})}
                  placeholder="Digite o motivo..."
                  rows="4"
                />
              </div>
            </div>
            <div className="modal-actions-reagendamento">
              <button className="btn-cancelar-reagendamento" onClick={fecharModal}>Cancelar</button>
              <button className="btn-confirmar-aprovar-reagendamento" onClick={executarEspera}>Adicionar à Lista</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Não Quer */}
      {modalNaoQuer.show && createPortal(
        <div className="modal-overlay-reagendamento" onClick={fecharModal}>
          <div className="modal-reagendamento" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-reagendamento">
              <h3>❌ Cancelar Agendamento</h3>
              <button className="close-btn-reagendamento" onClick={fecharModal}>×</button>
            </div>
            <div className="modal-body-reagendamento">
              <p><strong>👤 Paciente:</strong> {modalNaoQuer.paciente?.paciente}</p>
              <p><strong>📱 Telefone:</strong> {modalNaoQuer.paciente?.telefone}</p>
              <p><strong>📅 Agendamento Atual:</strong> {formatarData(modalNaoQuer.paciente?.dataAtual)} às {modalNaoQuer.paciente?.horarioAtual}</p>
              
              <div className="form-group-reagendamento">
                <label>📝 Motivo do cancelamento:</label>
                <textarea
                  value={formData.motivo}
                  onChange={(e) => setFormData({...formData, motivo: e.target.value})}
                  placeholder="Digite o motivo do cancelamento..."
                  rows="4"
                />
              </div>
            </div>
            <div className="modal-actions-reagendamento">
              <button className="btn-cancelar-reagendamento" onClick={fecharModal}>Cancelar</button>
              <button className="btn-confirmar-rejeitar-reagendamento" onClick={executarNaoQuer}>Confirmar Cancelamento</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
} 