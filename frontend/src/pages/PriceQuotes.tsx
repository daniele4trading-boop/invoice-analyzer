import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { PriceQuote, Supplier, Product } from '../types';

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

export default function PriceQuotes() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [form, setForm] = useState({
    supplier_id: '', product_id: '', quoted_price: '', valid_from: '', valid_to: '', notes: '',
  });

  const { data: quotes = [] } = useQuery<PriceQuote[]>({
    queryKey: ['price-quotes', filterSupplier],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterSupplier) params.set('supplier_id', filterSupplier);
      return api.get(`/api/price-quotes/?${params}`);
    },
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/api/suppliers/'),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => api.get('/api/products/'),
  });

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/api/price-quotes/', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['price-quotes'] }); setShowModal(false); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.del(`/api/price-quotes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-quotes'] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMut.mutate({
      supplier_id: Number(form.supplier_id),
      product_id: Number(form.product_id),
      quoted_price: parseFloat(form.quoted_price),
      valid_from: form.valid_from,
      valid_to: form.valid_to || null,
      notes: form.notes || null,
    });
  }

  return (
    <>
      <div className="page-header">
        <h2>Preventivi / Listino Prezzi</h2>
        <button className="btn btn-primary" onClick={() => {
          setForm({ supplier_id: '', product_id: '', quoted_price: '', valid_from: '', valid_to: '', notes: '' });
          setShowModal(true);
        }}>
          <Plus size={16} /> Nuovo Preventivo
        </button>
      </div>

      <div className="filters-bar">
        <div className="form-group">
          <label>Fornitore</label>
          <select className="form-control" value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)}>
            <option value="">Tutti</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Fornitore</th>
                <th>Prodotto</th>
                <th className="text-right">Prezzo</th>
                <th>Valido Dal</th>
                <th>Valido Al</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted">Nessun preventivo</td></tr>
              ) : (
                quotes.map((q) => (
                  <tr key={q.id}>
                    <td>{q.supplier?.name}</td>
                    <td>{q.product?.name}</td>
                    <td className="text-right font-mono">{fmt(q.quoted_price)}</td>
                    <td>{new Date(q.valid_from).toLocaleDateString('it-IT')}</td>
                    <td>{q.valid_to ? new Date(q.valid_to).toLocaleDateString('it-IT') : '-'}</td>
                    <td>{q.notes || '-'}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Eliminare?')) deleteMut.mutate(q.id); }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              Nuovo Preventivo
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>X</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="grid-2">
                  <div className="form-group">
                    <label>Fornitore *</label>
                    <select className="form-control" required value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                      <option value="">Seleziona...</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Prodotto *</label>
                    <select className="form-control" required value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
                      <option value="">Seleziona...</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid-3">
                  <div className="form-group">
                    <label>Prezzo *</label>
                    <input type="number" step="0.01" className="form-control" required value={form.quoted_price} onChange={(e) => setForm({ ...form, quoted_price: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Valido Dal *</label>
                    <input type="date" className="form-control" required value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Valido Al</label>
                    <input type="date" className="form-control" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Note</label>
                  <input className="form-control" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annulla</button>
                <button type="submit" className="btn btn-primary">Crea</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
