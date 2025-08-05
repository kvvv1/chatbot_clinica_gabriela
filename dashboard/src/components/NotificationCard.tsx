interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  timestamp: Date | string;
  priority?: 'normal' | 'high';
}

interface NotificationCardProps {
  notification: Notification;
}

export default function NotificationCard({ notification }: NotificationCardProps) {
  const formatTimestamp = (timestamp: Date | string) => {
    const now = new Date();
    const diff = now.getTime() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 1) return 'agora';
    if (minutes === 1) return '1 min atrás';
    if (minutes < 60) return `${minutes} min atrás`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h atrás`;
    return `${Math.floor(minutes / 1440)}d atrás`;
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
  const truncateText = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const isHighPriority = notification?.priority === 'high';

  return (
    <div 
      className={`notification-card ${notification.type}`}
      data-priority={notification.priority || 'normal'}
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '18px',
        marginBottom: '16px',
        borderLeft: `4px solid ${getTypeColor(notification.type)}`,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        position: 'relative'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
        e.currentTarget.style.transform = 'translateY(0)';
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
      
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        <div 
          style={{
            fontSize: '20px',
            marginTop: '2px',
            flexShrink: 0
          }}
        >
          {getTypeIcon(notification.type)}
        </div>
        
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 
            style={{
              margin: '0 0 6px 0',
              fontSize: '14px',
              fontWeight: '600',
              color: '#1f2937',
              lineHeight: '1.4',
              maxWidth: '100%'
            }}
          >
            {notification.title}
          </h4>
          
          <p 
            style={{
              margin: '0 0 8px 0',
              fontSize: '13px',
              color: '#6b7280',
              lineHeight: '1.5',
              wordBreak: 'break-word',
              maxWidth: '100%'
            }}
            title={notification.message}
          >
            {truncateText(notification.message)}
          </p>
          
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: '#9ca3af',
              fontSize: '12px'
            }}
          >
            <span>⏰</span>
            <span>{formatTimestamp(notification.timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}