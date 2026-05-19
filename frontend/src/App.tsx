import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
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
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="app-layout">
          <aside className="sidebar">
            <div className="sidebar-logo">
              <h1>Invoice Analyzer</h1>
              <p>Gestione Fatture & DDT</p>
            </div>
            <nav className="sidebar-nav">
              <NavLink to="/" end>
                <LayoutDashboard size={18} /> Dashboard
              </NavLink>

              <NavLink to="/upload">
                <Upload size={18} /> Carica Fattura
              </NavLink>

              <div className="sidebar-section">Gestione</div>
              <NavLink to="/suppliers">
                <Users size={18} /> Fornitori
              </NavLink>
              <NavLink to="/products">
                <Package size={18} /> Prodotti
              </NavLink>
              <NavLink to="/invoices">
                <FileText size={18} /> Fatture
              </NavLink>
              <NavLink to="/delivery-notes">
                <Truck size={18} /> Bolle (DDT)
              </NavLink>
              <NavLink to="/price-quotes">
                <DollarSign size={18} /> Preventivi
              </NavLink>

              <div className="sidebar-section">Analisi</div>
              <NavLink to="/price-comparison">
                <TrendingUp size={18} /> Confronto Prezzi
              </NavLink>
              <NavLink to="/reports">
                <FileSpreadsheet size={18} /> Report
              </NavLink>
            </nav>
          </aside>
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/products" element={<Products />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/delivery-notes" element={<DeliveryNotes />} />
              <Route path="/price-quotes" element={<PriceQuotes />} />
              <Route path="/price-comparison" element={<PriceComparison />} />
              <Route path="/upload" element={<UploadInvoice />} />
              <Route path="/reports" element={<Reports />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
