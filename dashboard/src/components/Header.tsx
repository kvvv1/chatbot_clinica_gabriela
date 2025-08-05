import { useState, useEffect, useRef } from 'react';
import './Header.css';
import NotificationCard from './NotificationCard';

// Dados mock para as notificações (limitado a 3)
const mockNotifications = [
  {
    id: 1,
    type: 'agendamento',
    title: 'Novo Agendamento',
    message: 'Maria Silva agendou consulta para amanhã às 14:00',
    timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutos atrás
    priority: 'normal'
  },
  {
    id: 2,
    type: 'reagendamento',
    title: 'Reagendamento Solicitado',
    message: 'João Santos solicitou reagendamento da consulta de hoje',
    timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 minutos atrás
    priority: 'high'
  },
  {
    id: 3,
    type: 'cancelamento',
    title: 'Cancelamento Confirmado',
    message: 'Ana Costa cancelou a consulta de amanhã às 10:00',
    timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutos atrás
    priority: 'normal'
  }
];

export default function Header() {
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState(mockNotifications);
  const [unreadCount, setUnreadCount] = useState(3);
  const notificationRef = useRef<HTMLDivElement>(null);

  const currentTime = new Date().toLocaleString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const handleNotificationClick = () => {
    setShowNotifications(!showNotifications);
    if (unreadCount > 0) {
      setUnreadCount(0);
    }
  };

  const handleNotificationCardClick = (notificationId: number) => {
    // Aqui você pode adicionar lógica para marcar como lida ou navegar para a página relevante
    console.log('Notificação clicada:', notificationId);
  };

  const handleMarkAllAsRead = () => {
    setUnreadCount(0);
  };

  const handleClearAll = () => {
    setNotifications([]);
    setUnreadCount(0);
  };

  const addTestNotification = () => {
    const newNotification = {
      id: Date.now(),
      type: 'agendamento',
      title: 'Teste - Novo Agendamento',
      message: 'Esta é uma notificação de teste adicionada dinamicamente',
      timestamp: new Date(),
      priority: 'normal'
    };
    setNotifications(prev => {
      const updated = [newNotification, ...prev];
      // Limitar a 3 notificações
      return updated.slice(0, 3);
    });
    setUnreadCount(prev => prev + 1);
  };

  // Fechar modal quando clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <h1>Painel da Secretaria</h1>
          <p className="current-time">{currentTime}</p>
        </div>
        
        <div className="header-right">
          <div className="notification-bell" onClick={handleNotificationClick} ref={notificationRef}>
            <span className="icon">🔔</span>
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
            
            {/* Modal de Notificações */}
            {showNotifications && (
              <div className="notification-modal">
                <div className="notification-header">
                  <h3>Notificações</h3>
                  <div className="notification-actions">
                    <button 
                      className="action-btn"
                      onClick={handleMarkAllAsRead}
                      disabled={unreadCount === 0}
                    >
                      Marcar como lidas
                    </button>
                    <button 
                      className="action-btn clear-btn"
                      onClick={handleClearAll}
                    >
                      Limpar todas
                    </button>
                    <button 
                      className="action-btn test-btn"
                      onClick={addTestNotification}
                    >
                      + Teste
                    </button>
                  </div>
                </div>
                
                <div className="notification-list">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <div 
                        key={notification.id}
                        onClick={() => handleNotificationCardClick(notification.id)}
                      >
                        <NotificationCard notification={notification} />
                      </div>
                    ))
                  ) : (
                    <div className="empty-notifications">
                      <span className="empty-icon">📭</span>
                      <p>Nenhuma notificação</p>
                    </div>
                  )}
                </div>
              </div>
            )}
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
      </div>
    </header>
  );
} 