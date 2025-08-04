import { useState, useEffect } from 'react';
import { dashboardService } from '../services/api';
import './Reagendamentos.css';

export default function Reagendamentos() {
  const [reagendamentos, setReagendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
          paciente: 'Ana Costa',
          telefone: '+55 31 91234-5678',
          especialidade: 'Cardiologia',
          dataAtual: '2024-01-15',
          horarioAtual: '10:00',
          novaData: '2024-01-20',
          novoHorario: '14:00',
          motivo: 'Compromisso inadiável'
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
      <div className="reagendamentos">
        <div className="loading">Carregando reagendamentos...</div>
      </div>
    );
  }

  return (
    <div className="reagendamentos">
      <div className="page-header">
        <h1>🔄 Solicitações de Reagendamento</h1>
        <button onClick={carregarReagendamentos} className="refresh-btn">
          🔄 Atualizar
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
              <div className="reagendamento-info">
                <div className="paciente-info">
                  <h3>{reagendamento.paciente}</h3>
                  <p>📱 {reagendamento.telefone}</p>
                </div>
                
                <div className="datas-info">
                  <div className="data-atual">
                    <h4>Data Atual</h4>
                    <p>{formatarData(reagendamento.dataAtual)} às {reagendamento.horarioAtual}</p>
                  </div>
                  <div className="seta">→</div>
                  <div className="nova-data">
                    <h4>Nova Data</h4>
                    <p>{formatarData(reagendamento.novaData)} às {reagendamento.novoHorario}</p>
                  </div>
                </div>

                <div className="motivo-info">
                  <h4>Motivo:</h4>
                  <p>{reagendamento.motivo}</p>
                </div>
              </div>

              <div className="reagendamento-actions">
                <button className="btn-aprovar">
                  ✅ Aprovar
                </button>
                <button className="btn-rejeitar">
                  ❌ Rejeitar
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="no-reagendamentos">
            <p>Nenhuma solicitação de reagendamento no momento</p>
          </div>
        )}
      </div>
    </div>
  );
} 