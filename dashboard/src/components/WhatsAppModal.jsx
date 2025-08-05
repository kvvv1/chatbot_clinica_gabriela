import { useState } from 'react';
import { createPortal } from 'react-dom';
import './WhatsAppModal.css';

const WhatsAppModal = ({ isOpen, onClose, paciente }) => {
  const [activeTab, setActiveTab] = useState('chat');
  const [message, setMessage] = useState('');
  
  if (!isOpen || !paciente) return null;
  
  const telefoneFormatado = paciente.telefone?.replace(/\D/g, '');
  const whatsappUrl = `https://api.whatsapp.com/send?phone=55${telefoneFormatado}&text=Olá ${paciente.nome}, sou da secretaria da clínica. Como posso ajudá-lo?`;
  
  const templates = [
    {
      id: 1,
      titulo: 'Confirmação de Agendamento',
      texto: `Olá ${paciente.nome}, confirmamos seu agendamento para ${paciente.dataHora || 'a data agendada'}. Aguardamos você!`
    },
    {
      id: 2,
      titulo: 'Reagendamento',
      texto: `Olá ${paciente.nome}, gostaríamos de reagendar seu horário. Podemos conversar sobre uma nova data?`
    },
    {
      id: 3,
      titulo: 'Cancelamento',
      texto: `Olá ${paciente.nome}, confirmamos o cancelamento do seu agendamento. Podemos ajudá-lo com um novo horário?`
    },
    {
      id: 4,
      titulo: 'Lista de Espera',
      texto: `Olá ${paciente.nome}, você foi adicionado à nossa lista de espera. Entraremos em contato assim que houver disponibilidade.`
    }
  ];

  const handleTemplateClick = (template) => {
    const newUrl = `https://api.whatsapp.com/send?phone=55${telefoneFormatado}&text=${encodeURIComponent(template.texto)}`;
    window.open(newUrl, '_blank');
  };

  const handleSendMessage = () => {
    if (message.trim()) {
      const newUrl = `https://api.whatsapp.com/send?phone=55${telefoneFormatado}&text=${encodeURIComponent(message)}`;
      window.open(newUrl, '_blank');
      setMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

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
              onClick={() => window.open(whatsappUrl, '_blank')} 
              className="btn-external"
              title="Abrir no WhatsApp"
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
                <div className="message sent">
                  <p>Olá {paciente.nome}, sou da secretaria da clínica. Como posso ajudá-lo?</p>
                  <span className="time">10:55</span>
                </div>
                
                <div className="message received">
                  <p>Olá! Gostaria de confirmar meu agendamento para amanhã às 14h.</p>
                  <span className="time">10:56</span>
                </div>
                
                <div className="message sent">
                  <p>Claro! Vou verificar seu agendamento agora mesmo. Um momento, por favor.</p>
                  <span className="time">10:57</span>
                </div>
                
                <div className="message sent">
                  <p>Confirmado! Você tem consulta amanhã às 14h com a Dra. Gabriela. Tudo certo?</p>
                  <span className="time">10:58</span>
                </div>
                
                <div className="message received">
                  <p>Perfeito! Obrigado pela confirmação. Até amanhã!</p>
                  <span className="time">10:59</span>
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
                    disabled={!message.trim()}
                  >
                    📤
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
            <button 
              onClick={() => window.open(whatsappUrl, '_blank')}
              className="btn-quick-action"
            >
              🔗 WhatsApp Web
            </button>
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