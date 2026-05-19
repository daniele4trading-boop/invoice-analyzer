import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Download } from 'lucide-react';
import { api } from '../api/client';
import type { PriceComparison as PriceComparisonType, Supplier, Product } from '../types';

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

export default function PriceComparison() {
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/api/suppliers/'),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => api.get('/api/products/'),
  });

  const { data: comparisons = [] } = useQuery<PriceComparisonType[]>({
    queryKey: ['price-comparison', supplierId, productId, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (supplierId) params.set('supplier_id', supplierId);
      if (productId) params.set('product_id', productId);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      return api.get(`/api/analysis/price-comparison?${params}`);
    },
  });

  const chartData = comparisons
    .filter((c) => c.quoted_price != null)
    .slice(0, 20)
    .map((c) => ({
      name: `${c.product_name} (${new Date(c.invoice_date).toLocaleDateString('it-IT')})`,
      Fatturato: c.invoiced_price,
      Preventivato: c.quoted_price,
    }));

  function downloadExport() {
    const params = new URLSearchParams();
    if (supplierId) params.set('supplier_id', supplierId);
    if (productId) params.set('product_id', productId);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    window.open(api.downloadUrl(`/api/export/price-comparison?${params}`), '_blank');
  }

  return (
    <>
      <div className="page-header">
        <h2>Confronto Prezzi</h2>
        <button className="btn btn-success" onClick={downloadExport}>
          <Download size={16} /> Esporta Excel
        </button>
      </div>

      <div className="filters-bar">
        <div className="form-group">
          <label>Fornitore</label>
          <select className="form-control" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Tutti</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Prodotto</label>
          <select className="form-control" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Tutti</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Da</label>
          <input type="date" className="form-control" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label>A</label>
          <input type="date" className="form-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">Grafico Confronto (max 20 risultati)</div>
          <div className="card-body">
            <div className="chart-container" style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Legend />
                  <Bar dataKey="Fatturato" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Preventivato" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Prodotto</th>
                <th>Fornitore</th>
                <th>Data</th>
                <th className="text-right">Fatturato</th>
                <th className="text-right">Preventivato</th>
                <th className="text-right">Differenza</th>
                <th className="text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted">Nessun dato</td></tr>
              ) : (
                comparisons.map((c, i) => (
                  <tr key={i}>
                    <td>{c.product_name}</td>
                    <td>{c.supplier_name}</td>
                    <td>{new Date(c.invoice_date).toLocaleDateString('it-IT')}</td>
                    <td className="text-right font-mono">{fmt(c.invoiced_price)}</td>
                    <td className="text-right font-mono">{c.quoted_price != null ? fmt(c.quoted_price) : '-'}</td>
                    <td className={`text-right font-mono ${c.difference != null ? (c.difference > 0 ? 'text-danger' : 'text-success') : ''}`}>
                      {c.difference != null ? fmt(c.difference) : '-'}
                    </td>
                    <td className={`text-right font-mono ${c.difference_pct != null ? (c.difference_pct > 0 ? 'text-danger' : 'text-success') : ''}`}>
                      {c.difference_pct != null ? `${c.difference_pct.toFixed(1)}%` : '-'}
                    </td>
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
