import { useState, useEffect } from 'react';
import { dashboardService } from '../services/api';
import './Cancelamentos.css';

export default function Cancelamentos() {
  const [cancelamentos, setCancelamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    carregarCancelamentos();
  }, []);

  const carregarCancelamentos = async () => {
    try {
      setLoading(true);
      const dados = await dashboardService.getCancelamentos();
      setCancelamentos(dados || []);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar cancelamentos:', err);
      setError('Erro ao carregar cancelamentos');
      // Dados mock
      setCancelamentos([
        {
          id: 1,
          paciente: 'Carlos Silva',
          telefone: '+55 31 91234-5678',
          data: '2024-01-18',
          horario: '15:00'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatarData = (data) => {
    return new Date(data).toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <div className="cancelamentos">
        <div className="loading">Carregando cancelamentos...</div>
      </div>
    );
  }

  return (
    <div className="cancelamentos">
      <div className="page-header">
        <h1>Solicitações de Cancelamento</h1>
        <button onClick={carregarCancelamentos} className="refresh-btn">
          Atualizar
        </button>
      </div>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="cancelamentos-list">
        {cancelamentos.length > 0 ? (
          cancelamentos.map((cancelamento) => (
            <div key={cancelamento.id} className="cancelamento-card">
              <div className="cancelamento-info">
                <div className="paciente-info">
                  <h3>{cancelamento.paciente}</h3>
                  <p>📱 {cancelamento.telefone}</p>
                </div>
                
                <div className="agendamento-atual">
                  <h4>Agendamento Atual</h4>
                  <p>{formatarData(cancelamento.data)} às {cancelamento.horario}</p>
                </div>
              </div>

              <div className="cancelamento-actions">
                <button className="btn-contatar">
                  Contatar Paciente
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="no-cancelamentos">
            <p>Nenhuma solicitação de cancelamento no momento</p>
          </div>
        )}
      </div>
    </div>
  );
} 