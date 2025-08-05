import { useState, useEffect } from 'react';
import { dashboardService } from '../services/api';
import './Pacientes.css';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    carregarPacientes();
  }, []);

  const carregarPacientes = async () => {
    try {
      setLoading(true);
      const dados = await dashboardService.getPacientes();
      setPacientes(dados || []);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar pacientes:', err);
      setError('Erro ao carregar pacientes');
      // Dados mock
      setPacientes([
        {
          id: 1,
          nome: 'João da Silva',
          telefone: '+55 31 91234-5678',
          email: 'joao.silva@email.com',
          dataCadastro: '2024-01-10T14:30:00',
          origem: 'Chatbot'
        },
        {
          id: 2,
          nome: 'Maria Santos',
          telefone: '+55 31 98765-4321',
          email: 'maria.santos@email.com',
          dataCadastro: '2024-01-12T09:15:00',
          origem: 'Chatbot'
        },
        {
          id: 3,
          nome: 'Pedro Oliveira',
          telefone: '+55 31 94567-8901',
          email: 'pedro.oliveira@email.com',
          dataCadastro: '2024-01-15T16:45:00',
          origem: 'Chatbot'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatarData = (data) => {
    return new Date(data).toLocaleString('pt-BR');
  };

  if (loading) {
    return (
      <div className="pacientes">
        <div className="loading">Carregando pacientes...</div>
      </div>
    );
  }

  return (
    <div className="pacientes">
      <div className="page-header">
        <h1>Pacientes Cadastrados</h1>
        <button onClick={carregarPacientes} className="refresh-btn">
          Atualizar
        </button>
      </div>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="pacientes-list">
        {pacientes.length > 0 ? (
          pacientes.map((paciente) => (
            <div key={paciente.id} className="paciente-card">
              <div className="paciente-info">
                <div className="paciente-dados">
                  <h3>{paciente.nome}</h3>
                  <p>📱 {paciente.telefone}</p>
                  <p>📧 {paciente.email}</p>
                  <p><strong>Data de Cadastro:</strong> {formatarData(paciente.dataCadastro)}</p>
                </div>
              </div>

              <div className="paciente-actions">
                <button className="btn-contatar">
                  Contatar
                </button>
                <button className="btn-agendar">
                  Agendar Consulta
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="no-pacientes">
            <p>Nenhum paciente cadastrado no momento</p>
          </div>
        )}
      </div>
    </div>
  );
} 