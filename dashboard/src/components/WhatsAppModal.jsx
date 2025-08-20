import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './WhatsAppModal.css';
import { dashboardService } from '../services/api';

const WhatsAppModal = ({ isOpen, onClose, paciente }) => {
  const [activeTab, setActiveTab] = useState('chat');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const pollRef = useRef(null);
  const messagesEndRef = useRef(null);
  
  const telefoneFormatado = paciente?.telefone?.replace(/\D/g, '');
  const fullPhone = useMemo(() => {
    if (!telefoneFormatado) return undefined;
    return telefoneFormatado.startsWith('55') ? telefoneFormatado : `55${telefoneFormatado}`;
  }, [telefoneFormatado]);
  const whatsappUrl = fullPhone
    ? `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(`Olá ${paciente.nome}, sou da secretaria da clínica. Como posso ajudá-lo?`)}`
    : null;
  
  const templates = [
    {
      id: 1,
      titulo: 'Confirmação de Agendamento',
      texto: `Olá ${paciente?.nome || ''}, confirmamos seu agendamento para ${paciente?.dataHora || 'a data agendada'}. Aguardamos você!`
    },
    {
      id: 2,
      titulo: 'Reagendamento',
      texto: `Olá ${paciente?.nome || ''}, gostaríamos de reagendar seu horário. Podemos conversar sobre uma nova data?`
    },
    {
      id: 3,
      titulo: 'Cancelamento',
      texto: `Olá ${paciente?.nome || ''}, confirmamos o cancelamento do seu agendamento. Podemos ajudá-lo com um novo horário?`
    },
    {
      id: 4,
      titulo: 'Lista de Espera',
      texto: `Olá ${paciente?.nome || ''}, você foi adicionado à nossa lista de espera. Entraremos em contato assim que houver disponibilidade.`
    }
  ];

  const handleTemplateClick = (template) => {
    if (!fullPhone) return;
    const newUrl = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(template.texto)}`;
    window.open(newUrl, '_blank', 'noopener');
  };

  const scrollToBottom = () => {
    try {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch {}
  };

  const carregarConversa = async () => {
    if (!fullPhone) return;
    setLoading(true);
    setError('');
    try {
      const data = await dashboardService.getConversa(fullPhone, 200);
      setMessages(Array.isArray(data) ? data : []);
      setTimeout(scrollToBottom, 50);
    } catch (e) {
      setError('Falha ao carregar conversa.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !paciente) return;
    carregarConversa();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(carregarConversa, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fullPhone]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!message.trim() || !fullPhone) return;
    setSending(true);
    setError('');
    try {
      await dashboardService.enviarMensagemWhatsApp(fullPhone, message.trim());
      setMessage('');
      await carregarConversa();
    } catch (e) {
      setError('Falha ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  // Somente chat e templates: sem iframe/web

  if (!isOpen || !paciente) return null;

  return createPortal(
    <div className="whatsapp-modal-overlay" onClick={onClose}>
      <div className="whatsapp-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header fixo */}
        <div className="whatsapp-modal-header">
          <div className="modal-title">
            <span className="whatsapp-icon">💬</span>
            <div>
              <h3>{paciente.nome}</h3>
              <span className="phone-number">{paciente.telefone}</span>
            </div>
          </div>
          <div className="modal-controls">
            <button 
              onClick={() => { if (whatsappUrl) { window.open(whatsappUrl, '_blank', 'noopener'); } }} 
              className="btn-external"
              title="Abrir no WhatsApp"
              disabled={!whatsappUrl}
            >
              🔗 Abrir Externo
            </button>
            <button onClick={onClose} className="btn-close">×</button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="whatsapp-modal-tabs">
          <button 
            className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            💬 Chat
          </button>
          <button 
            className={`tab-button ${activeTab === 'templates' ? 'active' : ''}`}
            onClick={() => setActiveTab('templates')}
          >
            📋 Templates
          </button>
          {/* Removido: Aba Web */}
          <button 
            className={`tab-button ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            ℹ️ Informações
          </button>
        </div>
        
        {/* Body */}
        <div className="whatsapp-modal-body">
          {activeTab === 'chat' && (
            <div className="whatsapp-chat-simulation">
              <div className="chat-header">
                <div className="contact-info">
                  <div className="avatar">👤</div>
                  <div className="contact-details">
                    <h4>{paciente.nome}</h4>
                    <span className="status">Online</span>
                  </div>
                </div>
              </div>
              
               <div className="chat-messages">
                {loading && (
                  <div style={{ padding: '8px', textAlign: 'center', color: '#6b7280' }}>Carregando...</div>
                )}
                {error && (
                  <div style={{ padding: '8px', textAlign: 'center', color: '#ef4444' }}>{error}</div>
                )}
                {!loading && !error && messages.length === 0 && (
                  <div style={{ padding: '8px', textAlign: 'center', color: '#6b7280' }}>Sem mensagens.</div>
                )}
                {!loading && messages.map((m) => {
                  const isSent = (m.direction || '').toLowerCase() === 'out';
                  const when = m.created_at ? new Date(m.created_at) : null;
                  const time = when && !isNaN(when) ? when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                  return (
                    <div key={m.id} className={`message ${isSent ? 'sent' : 'received'}`}>
                      <p>{m.content}</p>
                      <span className="time">{time}</span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />

                <div className="message-input-area">
                  <input 
                    type="text" 
                    placeholder="Digite sua mensagem..."
                    className="message-input"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                  />
                  <button 
                    className="send-button"
                    onClick={handleSendMessage}
                    disabled={!message.trim() || sending}
                  >
                    {sending ? '...' : '📤'}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'templates' && (
            <div className="templates-container">
              <h4>📋 Templates de Mensagem</h4>
              <div className="templates-list">
                {templates.map((template) => (
                  <div key={template.id} className="template-item">
                    <div className="template-header">
                      <h5>{template.titulo}</h5>
                      <button 
                        onClick={() => handleTemplateClick(template)}
                        className="btn-use-template"
                      >
                        Usar
                      </button>
                    </div>
                    <p className="template-text">{template.texto}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Removido: Conteúdo da aba Web */}

          {activeTab === 'info' && (
            <div className="info-container">
              <h4>📋 Informações do Paciente</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">👤 Nome:</span>
                  <span className="info-value">{paciente.nome}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">📱 Telefone:</span>
                  <span className="info-value">{paciente.telefone}</span>
                </div>
                {paciente.dataHora && (
                  <div className="info-item">
                    <span className="info-label">📅 Agendamento:</span>
                    <span className="info-value">{paciente.dataHora}</span>
                  </div>
                )}
                {paciente.email && (
                  <div className="info-item">
                    <span className="info-label">📧 Email:</span>
                    <span className="info-value">{paciente.email}</span>
                  </div>
                )}
                {paciente.motivo && (
                  <div className="info-item">
                    <span className="info-label">📝 Motivo:</span>
                    <span className="info-value">{paciente.motivo}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer com ações */}
        <div className="whatsapp-modal-footer">
          <div className="paciente-info">
            <span>📱 {paciente.telefone}</span>
            <span>👤 {paciente.nome}</span>
          </div>
          <div className="quick-actions">
            <button 
              onClick={() => setActiveTab('templates')}
              className="btn-quick-action"
            >
              📋 Templates
            </button>
            {/* Removidos botões Web/App do rodapé */}
            <button 
              onClick={onClose}
              className="btn-quick-action btn-finish"
            >
              ✅ Finalizar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WhatsAppModal; 