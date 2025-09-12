import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import logo from '../assets/logo.png';
import logoIcon from '../assets/logo_icon.png';
import './Sidebar.css';

interface SidebarProps {
  drawerOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ drawerOpen = false, onClose }: SidebarProps) {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isActive = (path: string) => {
    return location.pathname === path ? 'active' : '';
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose && onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [drawerOpen, onClose]);

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-container">
          <img 
            src={isCollapsed ? logoIcon : logo} 
            alt="Clínica Gabriela Nassif" 
            className="logo" 
          />
        </div>
      </div>
      
      <nav className="sidebar-nav" onClick={onClose}>
        <div className="hamburger-container">
          <button 
            className="hamburger-button" 
            onClick={toggleSidebar}
            aria-label="Toggle menu"
          >
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
        </div>
        
        <ul>
          <li className={isActive('/')}>
            <Link to="/" data-title="Início">
              <span className="icon">🏠</span>
              <span className="text">Início</span>
            </Link>
          </li>
          <li className={isActive('/agendamentos')}>
            <Link to="/agendamentos" data-title="Agendamentos">
              <span className="icon">📅</span>
              <span className="text">Agendamentos</span>
            </Link>
          </li>
          <li className={isActive('/reagendamentos')}>
            <Link to="/reagendamentos" data-title="Reagendamentos">
              <span className="icon">🔄</span>
              <span className="text">Reagendamentos</span>
            </Link>
          </li>
          <li className={isActive('/cancelamentos')}>
            <Link to="/cancelamentos" data-title="Cancelamentos">
              <span className="icon">❌</span>
              <span className="text">Cancelamentos</span>
            </Link>
          </li>
          <li className={isActive('/espera')}>
            <Link to="/espera" data-title="Lista de Espera">
              <span className="icon">📋</span>
              <span className="text">Lista de Espera</span>
            </Link>
          </li>
          <li className={isActive('/secretaria')}>
            <Link to="/secretaria" data-title="Falar com Secretária">
              <span className="icon">💬</span>
              <span className="text">Falar com Secretária</span>
            </Link>
          </li>
          <li className={isActive('/pacientes')}>
            <Link to="/pacientes" data-title="Pacientes Cadastrados">
              <span className="icon">🧑‍⚕️</span>
              <span className="text">Pacientes Cadastrados</span>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
} 