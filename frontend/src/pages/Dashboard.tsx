import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Users, Package, FileText, Truck } from 'lucide-react';
import { api } from '../api/client';
import type { DashboardSummary } from '../types';

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

const fmt = (n: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

export default function Dashboard() {
  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/analysis/dashboard'),
  });

  if (isLoading || !data) return <div className="empty-state"><p>Caricamento...</p></div>;

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue"><Users size={20} /></div>
          <div className="stat-label">Fornitori</div>
          <div className="stat-value">{data.total_suppliers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><Package size={20} /></div>
          <div className="stat-label">Prodotti</div>
          <div className="stat-value">{data.total_products}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><FileText size={20} /></div>
          <div className="stat-label">Fatture</div>
          <div className="stat-value">{data.total_invoices}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red"><Truck size={20} /></div>
          <div className="stat-label">DDT</div>
          <div className="stat-value">{data.total_delivery_notes}</div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="stat-card">
          <div className="stat-label">Totale Fatturato</div>
          <div className="stat-value">{fmt(data.total_invoiced_amount)}</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="card-header">Top Fornitori per Fatturato</div>
          <div className="card-body">
            {data.top_suppliers.length > 0 ? (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.top_suppliers}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="supplier_name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                    <Bar dataKey="total_amount" fill="#2563eb" name="Totale" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-state"><p>Nessun dato disponibile</p></div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">Top Prodotti per Spesa</div>
          <div className="card-body">
            {data.top_products.length > 0 ? (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.top_products}
                      dataKey="total_amount"
                      nameKey="product_name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) =>
                        `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                      }
                    >
                      {data.top_products.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="empty-state"><p>Nessun dato disponibile</p></div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Ultime Fatture</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Numero</th>
                <th>Data</th>
                <th>Fornitore</th>
                <th className="text-right">Importo</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_invoices.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-muted">Nessuna fattura</td></tr>
              ) : (
                data.recent_invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.number}</td>
                    <td>{new Date(inv.date).toLocaleDateString('it-IT')}</td>
                    <td>{inv.supplier?.name}</td>
                    <td className="text-right font-mono">{fmt(inv.total_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
