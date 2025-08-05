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
          dataAtual: '2024-01-15',
          horarioAtual: '10:00'
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
              <div className="reagendamento-info">
                <div className="paciente-info">
                  <h3>{reagendamento.paciente}</h3>
                  <p>📱 {reagendamento.telefone}</p>
                </div>
                
                <div className="agendamento-atual">
                  <h4>Agendamento Atual</h4>
                  <p>{formatarData(reagendamento.dataAtual)} às {reagendamento.horarioAtual}</p>
                </div>
              </div>

              <div className="reagendamento-actions">
                <button className="btn-contatar">
                  Contatar Paciente
                </button>
                <button className="btn-agendado">
                  Agendado
                </button>
                <button className="btn-espera">
                  Lista de Espera
                </button>
                <button className="btn-nao-quer">
                  Não Quer
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