import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Agendamentos from './pages/Agendamentos';
import Reagendamentos from './pages/Reagendamentos';
import Cancelamentos from './pages/Cancelamentos';
import Espera from './pages/Espera';
import Secretaria from './pages/Secretaria';
import Pacientes from './pages/Pacientes';
import './App.css';

function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = () => setDrawerOpen(true);
  const closeDrawer = () => setDrawerOpen(false);

  // Fecha o drawer em telas maiores que 768
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 768 && drawerOpen) setDrawerOpen(false);
    };
    const onCloseSidebar = () => setDrawerOpen(false);
    window.addEventListener('resize', onResize);
    window.addEventListener('ui:close-sidebar', onCloseSidebar as any);
    return () => window.removeEventListener('resize', onResize);
  }, [drawerOpen]);

  return (
    <Router>
      <div className="app">
        <Sidebar drawerOpen={drawerOpen} onClose={closeDrawer} />
        <div className="main-content">
          <Header onOpenMenu={openDrawer} />
          {drawerOpen && <div className="drawer-overlay" onClick={closeDrawer} />}
          <div className="content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/agendamentos" element={<Agendamentos />} />
              <Route path="/reagendamentos" element={<Reagendamentos />} />
              <Route path="/cancelamentos" element={<Cancelamentos />} />
              <Route path="/espera" element={<Espera />} />
              <Route path="/secretaria" element={<Secretaria />} />
              <Route path="/pacientes" element={<Pacientes />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
