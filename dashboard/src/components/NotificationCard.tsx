import './NotificationCard.css';
interface Notification {
  id: string | number;
  type: string;
  title: string;
  message: string;
  timestamp: Date | string;
  priority?: 'normal' | 'high';
  name?: string;
  phone?: string;
}

interface NotificationCardProps {
  notification: Notification;
}

export default function NotificationCard({ notification }: NotificationCardProps) {
  const formatTimestamp = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return 'há pouco';
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'agora';
    const minutes = Math.floor(diffMs / (1000 * 60));
    if (minutes < 1) return 'agora';
    if (minutes === 1) return '1 min atrás';
    if (minutes < 60) return `${minutes} min atrás`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h atrás`;
    const days = Math.floor(hours / 24);
    return `${days} d atrás`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'paciente':
        return '🧑';
      case 'agendamento':
        return '📅';
      case 'reagendamento':
        return '🔄';
      case 'cancelamento':
        return '❌';
      case 'secretaria':
        return '📞';
      default:
        return '📝';
    }
  };

  const phoneIcon = notification.type === 'agendamento' ? '🆔' : '📞';

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'paciente':
        return '#3b82f6'; // azul
      case 'agendamento':
        return '#3b82f6'; // azul (padronizado)
      case 'reagendamento':
        return '#3b82f6'; // azul (padronizado)
      case 'cancelamento':
        return '#3b82f6'; // azul (padronizado)
      case 'secretaria':
        return '#3b82f6'; // azul (padronizado)
      default:
        return '#3b82f6'; // azul (padronizado)
    }
  };

  // Função para truncar texto muito longo
  const truncateText = (text: string, maxLength: number = 80) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const isHighPriority = notification?.priority === 'high';

  const isWaitlist = notification.type === 'espera' || notification.type === 'waitlist';

  return (
    <div
      className={`notification-card ${notification.type}`}
      data-priority={notification.priority || 'normal'}
      style={{
        borderLeftColor: getTypeColor(notification.type),
        overflow: 'hidden'
      }}
    >
      {isHighPriority && (
        <span 
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            backgroundColor: '#ef4444',
            color: 'white',
            fontSize: '10px',
            fontWeight: '600',
            padding: '2px 6px',
            borderRadius: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            whiteSpace: 'nowrap'
          }}
        >
          URGENTE
        </span>
      )}
      
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', width: '100%' }}>
        <div className="notification-icon">{getTypeIcon(notification.type)}</div>
        
        <div className="notification-content">
          <h4>{notification.title}</h4>
          {(notification.name || notification.phone) && (
            <div style={{
              margin: '0 0 6px 0',
              fontSize: '12px',
              color: '#374151',
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap'
            }}>
              {notification.name && (
                <span style={{ fontWeight: 500 }}>👤 {notification.name}</span>
              )}
              {notification.phone && /\D*(?:\+?\d{10,14})$/.test(String(notification.phone)) ? (
                <span style={{ color: '#6b7280' }}>{phoneIcon} {notification.phone}</span>
              ) : null}
            </div>
          )}
          
          {(() => {
            const msg = (notification.message || '').toString();
            const hasNameOrPhone = !!(notification.name || notification.phone);
            const msgLower = msg.toLowerCase();
            const containsTelefone = msgLower.startsWith('telefone') || msgLower.includes('telefone');
            const containsPhoneDigits = notification.phone ? msg.includes(String(notification.phone)) : false;
            const shouldShowMessage = msg.length > 0 && !isWaitlist && !(hasNameOrPhone && (containsTelefone || containsPhoneDigits));
            if (!shouldShowMessage) return null;
            return <p title={msg}>{truncateText(msg)}</p>;
          })()}
          
          <div className="notification-time">{formatTimestamp(notification.timestamp)}</div>
        </div>
      </div>
    </div>
  );
}