import { Link, useLocation } from 'react-router-dom';
import logo from '../assets/logo.png';
import './Sidebar.css';

export default function Sidebar() {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path ? 'active' : '';
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo-container">
          <img src={logo} alt="Clínica Gabriela Nassif" className="logo" />
        </div>
      </div>
      
      <nav className="sidebar-nav">
        <ul>
          <li className={isActive('/')}>
            <Link to="/">
              <span className="icon">🏠</span>
              <span className="text">Início</span>
            </Link>
          </li>
          <li className={isActive('/agendamentos')}>
            <Link to="/agendamentos">
              <span className="icon">📅</span>
              <span className="text">Agendamentos</span>
            </Link>
          </li>
          <li className={isActive('/reagendamentos')}>
            <Link to="/reagendamentos">
              <span className="icon">🔄</span>
              <span className="text">Reagendamentos</span>
            </Link>
          </li>
          <li className={isActive('/cancelamentos')}>
            <Link to="/cancelamentos">
              <span className="icon">❌</span>
              <span className="text">Cancelamentos</span>
            </Link>
          </li>
          <li className={isActive('/espera')}>
            <Link to="/espera">
              <span className="icon">📋</span>
              <span className="text">Lista de Espera</span>
            </Link>
          </li>
          <li className={isActive('/secretaria')}>
            <Link to="/secretaria">
              <span className="icon">💬</span>
              <span className="text">Falar com Secretária</span>
            </Link>
          </li>
          <li className={isActive('/pacientes')}>
            <Link to="/pacientes">
              <span className="icon">🧑‍⚕️</span>
              <span className="text">Pacientes Cadastrados</span>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
} 