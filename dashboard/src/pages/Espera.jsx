import { useState, useEffect } from 'react';
import { dashboardService } from '../services/api';
import './Espera.css';

export default function Espera() {
  const [listaEspera, setListaEspera] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    carregarListaEspera();
  }, []);

  const carregarListaEspera = async () => {
    try {
      setLoading(true);
      const dados = await dashboardService.getListaEspera();
      setListaEspera(dados || []);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar lista de espera:', err);
      setError('Erro ao carregar lista de espera');
      // Dados mock
      setListaEspera([
        {
          id: 1,
          paciente: 'Fernanda Lima',
          telefone: '+55 31 91234-5678',
          especialidade: 'Cardiologia',
          dataSolicitacao: '2024-01-10',
          prioridade: 'alta'
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
      <div className="espera">
        <div className="loading">Carregando lista de espera...</div>
      </div>
    );
  }

  return (
    <div className="espera">
      <div className="page-header">
        <h1>📋 Lista de Espera</h1>
        <button onClick={carregarListaEspera} className="refresh-btn">
          🔄 Atualizar
        </button>
      </div>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="espera-list">
        {listaEspera.length > 0 ? (
          listaEspera.map((item) => (
            <div key={item.id} className="espera-card">
              <div className="espera-info">
                <div className="paciente-info">
                  <h3>{item.paciente}</h3>
                  <p>📱 {item.telefone}</p>
                </div>
                
                <div className="especialidade-info">
                  <p><strong>Especialidade:</strong> {item.especialidade}</p>
                  <p><strong>Data da Solicitação:</strong> {formatarData(item.dataSolicitacao)}</p>
                  <p><strong>Prioridade:</strong> 
                    <span className={`prioridade-badge ${item.prioridade}`}>
                      {item.prioridade}
                    </span>
                  </p>
                </div>
              </div>

              <div className="espera-actions">
                <button className="btn-contatar">
                  📞 Contatar
                </button>
                <button className="btn-agendar">
                  📅 Agendar
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="no-espera">
            <p>Nenhum paciente na lista de espera no momento</p>
          </div>
        )}
      </div>
    </div>
  );
} 