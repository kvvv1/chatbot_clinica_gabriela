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
  const [hasMore, setHasMore] = useState(true);
  const lastTsRef = useRef(null);
  const [error, setError] = useState('');
  const pollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  
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

  const handleScroll = () => {
    try {
      const el = chatContainerRef.current;
      if (!el) return;
      const threshold = 0; // considerar "no fundo" apenas quando exatamente no fim
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const near = distance <= threshold;
      isNearBottomRef.current = near;
      setIsNearBottom(near);

      // Auto carregar mais antigas ao chegar no topo
      if (el.scrollTop <= 0 && hasMore && !loading) {
        carregarMaisAntigas();
      }
    } catch {}
  };

  const carregarConversa = async (opts = {}) => {
    const { silent = false } = opts;
    if (!fullPhone) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      // Captura posição de rolagem antes de atualizar
      const containerBefore = chatContainerRef.current;
      const wasAtBottom = (() => {
        try {
          if (!containerBefore) return false;
          const distance = containerBefore.scrollHeight - containerBefore.scrollTop - containerBefore.clientHeight;
          return distance <= 1;
        } catch { return false; }
      })();
      const prevScrollTop = containerBefore ? containerBefore.scrollTop : 0;
      const prevScrollHeight = containerBefore ? containerBefore.scrollHeight : 0;

      const afterIso = lastTsRef.current ? new Date(lastTsRef.current).toISOString() : undefined;
      const data = await dashboardService.getConversa(fullPhone, 200, undefined, afterIso);
      const fetched = Array.isArray(data) ? data : [];
      const existingIds = new Set(messages.map((m) => m.id));
      const appended = fetched.filter((m) => !existingIds.has(m.id));
      if (messages.length === 0) {
        setMessages(fetched);
      } else if (appended.length > 0) {
        setMessages((prev) => [...prev, ...appended]);
      }
      // Atualiza lastTs com o último created_at recebido
      const latest = [...messages, ...appended].reduce((acc, m) => {
        const t = m.created_at ? new Date(m.created_at).getTime() : 0;
        return Math.max(acc, t);
      }, lastTsRef.current || 0);
      lastTsRef.current = latest || lastTsRef.current;
      setHasMore(fetched.length >= 200);
      // Preservar posição: se estava no fundo, mantém no fundo; senão, mantém posição atual
      setTimeout(() => {
        try {
          const container = chatContainerRef.current;
          if (!container) return;
          if (wasAtBottom) {
            container.scrollTop = container.scrollHeight;
          } else {
            // Mantém a posição relativa ao topo (para appends no final, basta manter scrollTop)
            // Se houver algum ajuste necessário por variação de altura, compensa:
            const newScrollHeight = container.scrollHeight;
            const heightDelta = newScrollHeight - prevScrollHeight;
            // Para appends no final, heightDelta > 0 e manter scrollTop é suficiente.
            // Caso algo mude acima, ajusta para manter o mesmo conteúdo visível.
            container.scrollTop = prevScrollTop; // + 0 (sem mudança)
          }
        } catch {}
      }, 0);
    } catch (e) {
      setError('Falha ao carregar conversa.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const carregarMaisAntigas = async () => {
    if (!fullPhone || !hasMore || messages.length === 0) return;
    const el = chatContainerRef.current;
    const prevScrollTop = el ? el.scrollTop : 0;
    const prevScrollHeight = el ? el.scrollHeight : 0;
    setLoading(true);
    try {
      const oldest = messages[0];
      const beforeIso = oldest?.created_at ? new Date(oldest.created_at).toISOString() : undefined;
      const data = await dashboardService.getConversa(fullPhone, 200, beforeIso, undefined);
      const older = Array.isArray(data) ? data : [];
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      setMessages(prev => [...older, ...prev]);
      // preservar posição de rolagem após inserir mensagens acima
      setTimeout(() => {
        try {
          const container = chatContainerRef.current;
          if (!container) return;
          const newScrollHeight = container.scrollHeight;
          const delta = newScrollHeight - prevScrollHeight;
          container.scrollTop = prevScrollTop + delta;
        } catch {}
      }, 0);
      setHasMore(older.length >= 200);
    } catch (e) {
      // silencia
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !paciente) return;
    // Reset estados ao abrir nova conversa
    setMessages([]);
    setHasMore(true);
    lastTsRef.current = null;
    carregarConversa({ silent: false });
    // Reinicia polling automático fixo (5s)
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => carregarConversa({ silent: true }), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fullPhone]);

  // Removido autoscroll em cada atualização; preservação de rolagem é feita em carregarConversa/carregarMaisAntigas

  const handleSendMessage = async () => {
    if (!message.trim() || !fullPhone) return;
    setSending(true);
    setError('');
    try {
      await dashboardService.enviarMensagemWhatsApp(fullPhone, message.trim());
      setMessage('');
      await carregarConversa({ silent: true });
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
              
               <div className="chat-messages" ref={chatContainerRef} onScroll={handleScroll}>
                {hasMore && (
                  <div className="load-more-top" style={{ textAlign: 'center', padding: '8px' }}>
                    <button
                      onClick={carregarMaisAntigas}
                      disabled={loading}
                      style={{
                        background: '#e5e7eb',
                        border: '1px solid #d1d5db',
                        borderRadius: 8,
                        padding: '6px 10px',
                        cursor: loading ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {loading ? 'Carregando...' : 'Carregar mensagens anteriores'}
                    </button>
                  </div>
                )}
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
              </div>

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