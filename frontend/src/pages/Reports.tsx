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
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Download } from 'lucide-react';
import { api } from '../api/client';
import type {
  ConsumptionReport,
  SupplierAnalysis,
  ProductAnalysis,
  Supplier,
  ProductCategory,
} from '../types';

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#854d0e'];
const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

type ReportType = 'consumption' | 'by-supplier' | 'by-product';

export default function Reports() {
  const [reportType, setReportType] = useState<ReportType>('consumption');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/api/suppliers/'),
  });

  const { data: categories = [] } = useQuery<ProductCategory[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/api/products/categories'),
  });

  const params = new URLSearchParams();
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  if (supplierId) params.set('supplier_id', supplierId);
  if (categoryId) params.set('category_id', categoryId);

  const { data: consumption = [] } = useQuery<ConsumptionReport[]>({
    queryKey: ['consumption', dateFrom, dateTo, supplierId, categoryId],
    queryFn: () => api.get(`/api/analysis/consumption?${params}`),
    enabled: reportType === 'consumption',
  });

  const { data: bySupplier = [] } = useQuery<SupplierAnalysis[]>({
    queryKey: ['by-supplier', dateFrom, dateTo],
    queryFn: () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set('date_from', dateFrom);
      if (dateTo) p.set('date_to', dateTo);
      return api.get(`/api/analysis/by-supplier?${p}`);
    },
    enabled: reportType === 'by-supplier',
  });

  const { data: byProduct = [] } = useQuery<ProductAnalysis[]>({
    queryKey: ['by-product', dateFrom, dateTo, categoryId],
    queryFn: () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set('date_from', dateFrom);
      if (dateTo) p.set('date_to', dateTo);
      if (categoryId) p.set('category_id', categoryId);
      return api.get(`/api/analysis/by-product?${p}`);
    },
    enabled: reportType === 'by-product',
  });

  function downloadExport() {
    window.open(api.downloadUrl(`/api/export/consumption?${params}`), '_blank');
  }

  return (
    <>
      <div className="page-header">
        <h2>Report Personalizzati</h2>
        {reportType === 'consumption' && (
          <button className="btn btn-success" onClick={downloadExport}>
            <Download size={16} /> Esporta Excel
          </button>
        )}
      </div>

      <div className="filters-bar">
        <div className="form-group">
          <label>Tipo Report</label>
          <select className="form-control" value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
            <option value="consumption">Consumi di Periodo</option>
            <option value="by-supplier">Analisi per Fornitore</option>
            <option value="by-product">Analisi per Prodotto</option>
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
        {(reportType === 'consumption') && (
          <div className="form-group">
            <label>Fornitore</label>
            <select className="form-control" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Tutti</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        {(reportType === 'consumption' || reportType === 'by-product') && (
          <div className="form-group">
            <label>Categoria</label>
            <select className="form-control" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Tutte</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {reportType === 'consumption' && (
        <>
          {consumption.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">Distribuzione Consumi</div>
              <div className="card-body">
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={consumption.slice(0, 8)}
                        dataKey="total_amount"
                        nameKey="product_name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                      >
                        {consumption.slice(0, 8).map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">Dettaglio Consumi</div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Prodotto</th>
                    <th>Categoria</th>
                    <th className="text-right">Quantità</th>
                    <th>Unità</th>
                    <th className="text-right">Totale</th>
                    <th className="text-right">Prezzo Medio</th>
                  </tr>
                </thead>
                <tbody>
                  {consumption.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-muted">Nessun dato per il periodo selezionato</td></tr>
                  ) : (
                    consumption.map((c, i) => (
                      <tr key={i}>
                        <td><strong>{c.product_name}</strong></td>
                        <td>{c.category_name ? <span className="badge badge-blue">{c.category_name}</span> : '-'}</td>
                        <td className="text-right font-mono">{c.total_quantity.toFixed(2)}</td>
                        <td>{c.unit || '-'}</td>
                        <td className="text-right font-mono">{fmt(c.total_amount)}</td>
                        <td className="text-right font-mono">{fmt(c.avg_unit_price)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {reportType === 'by-supplier' && (
        <>
          {bySupplier.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">Fatturato per Fornitore</div>
              <div className="card-body">
                <div className="chart-container" style={{ height: 350 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bySupplier}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="supplier_name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => fmt(Number(v))} />
                      <Legend />
                      <Bar dataKey="total_amount" name="Totale" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="avg_invoice_amount" name="Media" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">Riepilogo Fornitori</div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Fornitore</th>
                    <th className="text-right">N. Fatture</th>
                    <th className="text-right">Totale</th>
                    <th className="text-right">Media Fattura</th>
                  </tr>
                </thead>
                <tbody>
                  {bySupplier.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-muted">Nessun dato</td></tr>
                  ) : (
                    bySupplier.map((s, i) => (
                      <tr key={i}>
                        <td><strong>{s.supplier_name}</strong></td>
                        <td className="text-right">{s.total_invoices}</td>
                        <td className="text-right font-mono">{fmt(s.total_amount)}</td>
                        <td className="text-right font-mono">{fmt(s.avg_invoice_amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {reportType === 'by-product' && (
        <>
          {byProduct.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">Spesa per Prodotto</div>
              <div className="card-body">
                <div className="chart-container" style={{ height: 350 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byProduct.slice(0, 15)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="product_name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={80} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v) => fmt(Number(v))} />
                      <Bar dataKey="total_amount" name="Totale" fill="#d97706" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">Riepilogo Prodotti</div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Prodotto</th>
                    <th>Categoria</th>
                    <th className="text-right">Quantità</th>
                    <th className="text-right">Totale</th>
                    <th className="text-right">Prezzo Medio</th>
                    <th className="text-right">Fornitori</th>
                  </tr>
                </thead>
                <tbody>
                  {byProduct.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-muted">Nessun dato</td></tr>
                  ) : (
                    byProduct.map((p, i) => (
                      <tr key={i}>
                        <td><strong>{p.product_name}</strong></td>
                        <td>{p.category_name ? <span className="badge badge-blue">{p.category_name}</span> : '-'}</td>
                        <td className="text-right font-mono">{p.total_quantity.toFixed(2)}</td>
                        <td className="text-right font-mono">{fmt(p.total_amount)}</td>
                        <td className="text-right font-mono">{fmt(p.avg_unit_price)}</td>
                        <td className="text-right">{p.supplier_count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
