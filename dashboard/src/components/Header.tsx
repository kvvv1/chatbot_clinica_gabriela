import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  const headerRef = useRef<HTMLElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [modalStyle, setModalStyle] = useState<React.CSSProperties>({ right: 16, top: 88, width: 360, height: 320, position: 'fixed', zIndex: 10070 });
  const [isOnline, setIsOnline] = useState<boolean>(isBusinessHours(new Date()));
  // Refs para observar itens e marcar como lidos ao rolar
  const listContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string | number, HTMLDivElement>>(new Map());
  const seenAsReadRef = useRef<Set<string | number>>(new Set());
  const inFlightRef = useRef<Set<string | number>>(new Set());

  // Seleção por teclado
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const supabaseUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) || '';
  const supabaseKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) || '';
  const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

  const now = new Date();
  const timeShort = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} - ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const timeLong = now.toLocaleString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : true;
  const currentTime = isMobile ? timeShort : timeLong;

  const handleNotificationClick = () => {
    const willOpen = !showNotifications;
    setShowNotifications(willOpen);
    // Fecha possíveis drawers abertos se o modal for aberto (melhora stacking no mobile)
    const evt = new CustomEvent('ui:close-sidebar');
    window.dispatchEvent(evt);
    if (willOpen) {
      // Calcula imediatamente uma posição inicial para evitar "sumiço" enquanto o efeito roda
      const bell = notificationRef.current;
      const vw = typeof window !== 'undefined' ? (window.innerWidth || document.documentElement.clientWidth) : 1024;
      const vh = typeof window !== 'undefined' ? (window.innerHeight || document.documentElement.clientHeight) : 768;
      const gap = 8;
      const minW = 300, maxW = 420;
      let right = 16;
      let top = 88; // abaixo do header
      let width = Math.min(maxW, Math.max(minW, vw - 24));
      if (bell) {
        const rect = bell.getBoundingClientRect();
        right = Math.max(16, vw - rect.right);
        top = Math.min(rect.bottom + gap, vh - 240);
      }
      const height = Math.min(640, Math.max(240, vh - top - 16));
      setModalStyle({ position: 'fixed', right, left: 'auto', top, width, height, zIndex: 10070 } as React.CSSProperties);
    }
  };

  // Fecha modal de notificações quando o usuário abre o drawer (sincronização)
  useEffect(() => {
    const onAnyOpen = () => setShowNotifications(false);
    window.addEventListener('ui:open-sidebar', onAnyOpen as any);
    return () => window.removeEventListener('ui:open-sidebar', onAnyOpen as any);
  }, []);

  const handleNotificationCardClick = async (notificationId: string | number) => {
    try {
      await dashboardService.marcarNotificacaoLida(notificationId);
      // Remove da lista (exibimos apenas não lidas no dropdown)
      setNotifications((prev) => {
        const next = prev.filter((n) => n.id !== notificationId);
        setUnreadCount(next.length);
        return next;
      });
      seenAsReadRef.current.add(notificationId);
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
      // Marca todas como lidas no backend (mantém no banco) e limpa a lista (mostrando só não lidas)
      await dashboardService.marcarTodasLidas();
      setNotifications([]);
      setUnreadCount(0);
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
      // Exibir apenas não lidas no dropdown
      const filtered = mapped.filter((n) => !n.read);
      setNotifications(filtered);
      const unread = filtered.length;
      setUnreadCount(unread);
    } catch (e) {
      console.error('Erro ao carregar notificações:', e);
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  // Fechar modal quando clicar fora (considera sino e modal)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideBell = notificationRef.current?.contains(target);
      const clickedInsideModal = modalRef.current?.contains(target);
      if (!clickedInsideBell && !clickedInsideModal) setShowNotifications(false);
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

  // Calcula posição/tamanho do modal usando o retângulo do sino (ancorado logo abaixo)
  useEffect(() => {
    const update = () => {
      const bell = notificationRef.current;
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const gap = 8;
      const minW = 300, maxW = 420;
      const width = Math.min(maxW, Math.max(minW, vw - 24));
      if (!bell) {
        const right = 16;
        const top = Math.min(80 + gap, vh - 240);
        const height = Math.min(640, Math.max(240, vh - top - 16));
        setModalStyle({ position: 'fixed', right, left: 'auto', top, width, height, zIndex: 10070 } as React.CSSProperties);
        return;
      }
      const rect = bell.getBoundingClientRect();
      // alinhar pela direita do sino usando deslocamento a partir da borda direita da viewport
      const right = Math.max(16, vw - rect.right);
      const top = Math.min(rect.bottom + gap, vh - 240);
      const height = Math.min(640, Math.max(240, vh - top - 16));
      // zIndex acima do drawer do sidebar (10060) e do overlay (10040)
      setModalStyle({ position: 'fixed', right, left: 'auto', top, width, height, zIndex: 10070 } as React.CSSProperties);
    };
    if (showNotifications) {
      update();
      window.addEventListener('resize', update);
      window.addEventListener('scroll', update, true);
      window.addEventListener('orientationchange', update as any);
      return () => {
        window.removeEventListener('resize', update);
        window.removeEventListener('scroll', update, true);
        window.removeEventListener('orientationchange', update as any);
      };
    }
  }, [showNotifications]);

  // Observar itens visíveis e marcar como lidos ao rolar (threshold 0.6)
  useEffect(() => {
    if (!showNotifications) return;
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          const el = entry.target as HTMLElement;
          const idAttr = el.getAttribute('data-id');
          const id: string | number | null = idAttr ? (/^\d+$/.test(idAttr) ? Number(idAttr) : idAttr) : null;
          if (id == null) continue;
          if (seenAsReadRef.current.has(id)) continue;
          const notif = notifications.find((n) => n.id === id);
          if (!notif || notif.read) continue;
          if (inFlightRef.current.has(id)) continue;
          inFlightRef.current.add(id);
          dashboardService.marcarNotificacaoLida(id)
            .then(() => {
              seenAsReadRef.current.add(id);
              setNotifications((prev) => {
                const next = prev.filter((n) => n.id !== id);
                setUnreadCount(next.length);
                return next;
              });
            })
            .catch((e) => console.error('Erro ao marcar como lida (scroll):', e))
            .finally(() => {
              inFlightRef.current.delete(id);
            });
        }
      }
    }, { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] });

    // observar cada item atual
    itemRefs.current.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [showNotifications, notifications]);

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

  // Fechar com tecla ESC quando o dropdown estiver aberto
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!showNotifications) return;

      // ESC fecha
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowNotifications(false);
        return;
      }

      // Navegação por setas e Enter
      const total = notifications.length;
      if (total === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, total - 1);
          const target = notifications[next];
          const el = target ? itemRefs.current.get(target.id) : null;
          if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return next;
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          const target = notifications[next];
          const el = target ? itemRefs.current.get(target.id) : null;
          if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return next;
        });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const target = notifications[selectedIndex];
        if (target) {
          handleNotificationCardClick(target.id);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showNotifications, notifications, selectedIndex]);

  return (
    <header className="header" ref={headerRef}>
      <div className="header-content">
        <div className="header-left">
          <button className="menu-button" aria-label="Abrir menu" onClick={onOpenMenu}>☰</button>
          <h1 className="header-title">Painel da Secretaria</h1>
          <p className="current-time">{currentTime}</p>
        </div>
        
        <div className="header-right">
          <div className="notification-bell" onClick={handleNotificationClick} ref={notificationRef}>
            <span className="icon">🔔</span>
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </div>
          {/* Modal de Notificações via Portal (fora do sino) */}
          {showNotifications && createPortal(
            <div className="notification-panel" ref={modalRef} style={modalStyle}>
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
              
              <div className="notification-list" ref={listContainerRef}>
                {notifications.length > 0 ? (
                  notifications.map((notification, idx) => (
                    <div
                      key={notification.id}
                      data-id={notification.id}
                      ref={(el) => { if (el) itemRefs.current.set(notification.id, el); else itemRefs.current.delete(notification.id); }}
                      onClick={() => handleNotificationCardClick(notification.id)}
                      data-index={idx}
                      data-selected={(idx === selectedIndex).toString()}
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
            </div>,
            document.body
          )}
          
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