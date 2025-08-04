import './Header.css';

export default function Header() {
  const currentTime = new Date().toLocaleString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <header className="header">
      <div className="header-left">
        <h1>📊 Painel da Secretaria</h1>
        <p className="current-time">{currentTime}</p>
      </div>
      
      <div className="header-right">
        <div className="notification-bell">
          <span className="icon">🔔</span>
          <span className="badge">3</span>
        </div>
        
        <div className="user-info">
          <div className="user-avatar">
            <span>👩‍💼</span>
          </div>
          <div className="user-details">
            <span className="user-name">Secretária</span>
            <span className="user-role">Online</span>
          </div>
        </div>
      </div>
    </header>
  );
} 