import { useState, useEffect } from 'react';
import { dashboardService } from '../services/api';
import './Secretaria.css';

export default function Secretaria() {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
          dataSolicitacao: '2024-01-15T10:30:00',
          status: 'pendente'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatarData = (data) => {
    return new Date(data).toLocaleString('pt-BR');
  };

  const iniciarAtendimento = async (telefone) => {
    try {
      await dashboardService.iniciarAtendimentoManual(telefone);
      alert('Atendimento manual iniciado!');
      await carregarSolicitacoes();
    } catch (err) {
      console.error('Erro ao iniciar atendimento:', err);
      alert('Erro ao iniciar atendimento manual');
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
          Atualizar
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
                  <h3>{solicitacao.paciente}</h3>
                  <p>📱 {solicitacao.telefone}</p>
                </div>
                
                <div className="solicitacao-info">
                  <p><strong>Data da Solicitação:</strong> {formatarData(solicitacao.dataSolicitacao)}</p>
                  <p><strong>Status:</strong> 
                    <span className={`status-badge ${solicitacao.status}`}>
                      {solicitacao.status}
                    </span>
                  </p>
                </div>
              </div>

              <div className="secretaria-actions">
                <button 
                  onClick={() => iniciarAtendimento(solicitacao.telefone)}
                  className="btn-iniciar"
                >
                  Iniciar Atendimento
                </button>
                <button className="btn-ignorar">
                  Ignorar
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="no-solicitacoes">
            <p>Nenhuma solicitação de atendimento manual no momento</p>
          </div>
        )}
      </div>
    </div>
  );
} 