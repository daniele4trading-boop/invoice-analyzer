import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Truck,
  DollarSign,
  TrendingUp,
  FileSpreadsheet,
  Upload,
  LogOut,
  Store,
  UserCog,
  FolderInput,
  Menu,
  X,
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Suppliers from './pages/Suppliers';
import Products from './pages/Products';
import Invoices from './pages/Invoices';
import DeliveryNotes from './pages/DeliveryNotes';
import PriceQuotes from './pages/PriceQuotes';
import PriceComparison from './pages/PriceComparison';
import Reports from './pages/Reports';
import UploadInvoice from './pages/UploadInvoice';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import BusinessManagement from './pages/BusinessManagement';
import BulkImport from './pages/OneDriveImport';
import { AuthProvider, useAuth } from './context/AuthContext';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function BusinessSelector() {
  const { user, businesses, selectedBusinessId, selectBusiness } = useAuth();
  if (user?.role !== 'master' || businesses.length === 0) return null;
  return (
    <div className="business-selector">
      <Store size={16} />
      <select
        value={selectedBusinessId || ''}
        onChange={(e) => selectBusiness(e.target.value ? parseInt(e.target.value) : null)}
      >
        <option value="">Tutte le attività</option>
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </div>
  );
}

function UserBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="user-bar">
      <BusinessSelector />
      <span className="user-name">{user.full_name}</span>
      {user.business?.name && <span className="user-business">{user.business.name}</span>}
      <button className="btn-icon" onClick={() => { logout(); navigate('/login'); }} title="Esci">
        <LogOut size={18} />
      </button>
    </div>
  );
}

function AppLayout() {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Close sidebar on route change (mobile navigation)
  const handleNavClick = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  if (loading) {
    return <div className="loading-page">Caricamento...</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const isMaster = user.role === 'master';

  return (
    <div className="app-layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <button className="sidebar-close" onClick={closeSidebar}>
          <X size={24} />
        </button>
        <div className="sidebar-logo">
          <h1>Invoice Analyzer</h1>
          <p>Gestione Fatture & DDT</p>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end onClick={handleNavClick}>
            <LayoutDashboard size={18} /> Dashboard
          </NavLink>
          <NavLink to="/upload" onClick={handleNavClick}>
            <Upload size={18} /> Carica Fattura
          </NavLink>
          <NavLink to="/bulk-import" onClick={handleNavClick}>
            <FolderInput size={18} /> Importa Multipla
          </NavLink>

          <div className="sidebar-section">Gestione</div>
          <NavLink to="/suppliers" onClick={handleNavClick}>
            <Users size={18} /> Fornitori
          </NavLink>
          <NavLink to="/products" onClick={handleNavClick}>
            <Package size={18} /> Prodotti
          </NavLink>
          <NavLink to="/invoices" onClick={handleNavClick}>
            <FileText size={18} /> Fatture
          </NavLink>
          <NavLink to="/delivery-notes" onClick={handleNavClick}>
            <Truck size={18} /> Bolle (DDT)
          </NavLink>
          <NavLink to="/price-quotes" onClick={handleNavClick}>
            <DollarSign size={18} /> Preventivi
          </NavLink>

          <div className="sidebar-section">Analisi</div>
          <NavLink to="/price-comparison" onClick={handleNavClick}>
            <TrendingUp size={18} /> Confronto Prezzi
          </NavLink>
          <NavLink to="/reports" onClick={handleNavClick}>
            <FileSpreadsheet size={18} /> Report
          </NavLink>

          {isMaster && (
            <>
              <div className="sidebar-section">Amministrazione</div>
              <NavLink to="/businesses" onClick={handleNavClick}>
                <Store size={18} /> Negozi
              </NavLink>
              <NavLink to="/user-management" onClick={handleNavClick}>
                <UserCog size={18} /> Utenti
              </NavLink>
            </>
          )}
        </nav>
      </aside>
      <main className="main-content">
        <header className="top-bar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <UserBar />
        </header>
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/products" element={<Products />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/delivery-notes" element={<DeliveryNotes />} />
            <Route path="/price-quotes" element={<PriceQuotes />} />
            <Route path="/price-comparison" element={<PriceComparison />} />
            <Route path="/upload" element={<UploadInvoice />} />
            <Route path="/bulk-import" element={<BulkImport />} />
            <Route path="/reports" element={<Reports />} />
            {isMaster && <Route path="/businesses" element={<BusinessManagement />} />}
            {isMaster && <Route path="/user-management" element={<UserManagement />} />}
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
