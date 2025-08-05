import './NotificationCard.css';

export default function NotificationCard({ notification }) {
  const getIcon = (type) => {
    switch (type) {
      case 'agendamento':
        return '📅';
      case 'reagendamento':
        return '🔄';
      case 'cancelamento':
        return '❌';
      case 'paciente':
        return '🧑‍⚕️';
      case 'secretaria':
        return '💬';
      default:
        return '📢';
    }
  };

  const getTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now - time) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Agora mesmo';
    if (diffInMinutes < 60) return `${diffInMinutes} min atrás`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h atrás`;
    return `${Math.floor(diffInMinutes / 1440)}d atrás`;
  };

  return (
    <div 
      className={`notification-card ${notification.type}`}
      data-priority={notification.priority || 'normal'}
    >
      <div className="notification-icon">
        {getIcon(notification.type)}
      </div>
      <div className="notification-content">
        <h4>{notification.title}</h4>
        <p>{notification.message}</p>
        <span className="notification-time">
          {getTimeAgo(notification.timestamp)}
        </span>
      </div>
      {notification.priority === 'high' && (
        <div className="priority-badge">Urgente</div>
      )}
    </div>
  );
} 