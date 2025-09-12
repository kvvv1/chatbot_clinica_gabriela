import { useState, useEffect, useRef } from 'react';
import './Header.css';
import NotificationCard from './NotificationCard';
import { dashboardService } from '../services/api';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

// Configuração de horário comercial (ajuste conforme necessário)
const BUSINESS_DAYS = [1, 2, 3, 4, 5]; // 1 = segunda, 5 = sexta
const BUSINESS_START_HOUR = 8; // 08:00
const BUSINESS_END_HOUR = 18; // 18:00

function isBusinessHours(date: Date): boolean {
  const day = date.getDay();
  const hour = date.getHours();
  const isBusinessDay = BUSINESS_DAYS.includes(day);

  // Considera Online entre [start, end). Ex.: 08:00 até 17:59
  const isBusinessTime = hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
  return isBusinessDay && isBusinessTime;
}

interface Notificacao {
  id: string | number;
  type: string;
  title: string;
  message: string;
  timestamp: Date | string;
  priority?: 'normal' | 'high';
  read?: boolean;
  name?: string;
  phone?: string;
}

interface HeaderProps {
  onOpenMenu?: () => void;
}

export default function Header({ onOpenMenu }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notificacao[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationRef = useRef<HTMLDivElement>(null);
  const [isOnline, setIsOnline] = useState<boolean>(isBusinessHours(new Date()));
  const supabaseUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) || '';
  const supabaseKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) || '';
  const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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
  };

  const handleNotificationCardClick = async (notificationId: string | number) => {
    try {
      await dashboardService.marcarNotificacaoLida(notificationId);
      await carregarNotificacoes();
    } catch (e) {
      console.error('Erro ao marcar notificação como lida:', e);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await dashboardService.marcarTodasLidas();
      await carregarNotificacoes();
    } catch (e) {
      console.error('Erro ao marcar todas como lidas:', e);
    }
  };

  const handleClearAll = async () => {
    try {
      await dashboardService.limparNotificacoes();
      await carregarNotificacoes();
    } catch (e) {
      console.error('Erro ao limpar notificações:', e);
    }
  };

  const carregarNotificacoes = async () => {
    try {
      const data = await dashboardService.getNotificacoes();
      const mapped: Notificacao[] = Array.isArray(data)
        ? data.slice(0, 10).map((n: any) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            priority: n.priority,
            timestamp: n.created_at,
            read: n.read,
            name: n.name,
            phone: n.phone,
          }))
        : [];
      setNotifications(mapped);
      const unread = mapped.filter((n) => !n.read).length;
      setUnreadCount(unread);
    } catch (e) {
      console.error('Erro ao carregar notificações:', e);
      setNotifications([]);
      setUnreadCount(0);
    }
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

  // Atualiza status Online/Offline conforme horário comercial
  useEffect(() => {
    const updateStatus = () => setIsOnline(isBusinessHours(new Date()));
    const intervalId = window.setInterval(updateStatus, 60_000); // a cada 1 minuto
    // Atualiza imediatamente ao montar
    updateStatus();
    return () => window.clearInterval(intervalId);
  }, []);

  // Carrega notificações inicialmente e a cada 30s (fallback)
  useEffect(() => {
    carregarNotificacoes();
    const interval = window.setInterval(carregarNotificacoes, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  // Realtime via Supabase (se configurado)
  useEffect(() => {
    if (!supabase) return;
    let channel: RealtimeChannel | null = null;
    try {
      channel = supabase
        .channel('notifications_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications' },
          () => {
            carregarNotificacoes();
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('Realtime desabilitado:', e);
    }
    return () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseUrl, supabaseKey]);

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <button className="menu-button" aria-label="Abrir menu" onClick={onOpenMenu}>☰</button>
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
                  </div>
                </div>
                
                <div className="notification-list">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <div 
                        key={notification.id}
                        onClick={() => handleNotificationCardClick(notification.id)}
                      >
                        <NotificationCard notification={notification as any} />
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
              <span className={`user-role ${isOnline ? 'online' : 'offline'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
} 