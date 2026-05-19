import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Eye, X } from 'lucide-react';
import { api } from '../api/client';
import type { DeliveryNote, Supplier, Product } from '../types';

interface ItemForm {
  product_id: string;
  description: string;
  quantity: string;
  unit: string;
}

export default function DeliveryNotes() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState<DeliveryNote | null>(null);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [form, setForm] = useState({ number: '', date: '', supplier_id: '', notes: '' });
  const [items, setItems] = useState<ItemForm[]>([]);

  const { data: notes = [] } = useQuery<DeliveryNote[]>({
    queryKey: ['delivery-notes', filterSupplier],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterSupplier) params.set('supplier_id', filterSupplier);
      return api.get(`/api/delivery-notes/?${params}`);
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
    mutationFn: (data: Record<string, unknown>) => api.post('/api/delivery-notes/', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-notes'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); setShowModal(false); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.del(`/api/delivery-notes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-notes'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });

  function addItem() {
    setItems([...items, { product_id: '', description: '', quantity: '', unit: '' }]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMut.mutate({
      number: form.number,
      date: form.date,
      supplier_id: Number(form.supplier_id),
      notes: form.notes || null,
      items: items.map((it) => ({
        product_id: Number(it.product_id),
        description: it.description || null,
        quantity: parseFloat(it.quantity),
        unit: it.unit || null,
      })),
    });
  }

  return (
    <>
      <div className="page-header">
        <h2>Bolle di Consegna (DDT)</h2>
        <button className="btn btn-primary" onClick={() => {
          setForm({ number: '', date: '', supplier_id: '', notes: '' });
          setItems([]);
          setShowModal(true);
        }}>
          <Plus size={16} /> Nuovo DDT
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
                <th>Numero</th>
                <th>Data</th>
                <th>Fornitore</th>
                <th>Righe</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {notes.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted">Nessun DDT</td></tr>
              ) : (
                notes.map((dn) => (
                  <tr key={dn.id}>
                    <td><strong>{dn.number}</strong></td>
                    <td>{new Date(dn.date).toLocaleDateString('it-IT')}</td>
                    <td>{dn.supplier?.name}</td>
                    <td>{dn.items.length}</td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowDetail(dn)}><Eye size={14} /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Eliminare?')) deleteMut.mutate(dn.id); }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showDetail && (
        <div className="modal-overlay" onClick={() => setShowDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              DDT {showDetail.number}
              <button className="btn btn-secondary btn-sm" onClick={() => setShowDetail(null)}>X</button>
            </div>
            <div className="modal-body">
              <p><strong>Fornitore:</strong> {showDetail.supplier?.name}</p>
              <p><strong>Data:</strong> {new Date(showDetail.date).toLocaleDateString('it-IT')}</p>
              {showDetail.notes && <p><strong>Note:</strong> {showDetail.notes}</p>}
              <table style={{ marginTop: '1rem' }}>
                <thead><tr><th>Prodotto</th><th>Qtà</th><th>Unità</th></tr></thead>
                <tbody>
                  {showDetail.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.product?.name || it.description}</td>
                      <td>{it.quantity}</td>
                      <td>{it.unit || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              Nuovo DDT
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>X</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="grid-3">
                  <div className="form-group">
                    <label>Numero *</label>
                    <input className="form-control" required value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Data *</label>
                    <input type="date" className="form-control" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Fornitore *</label>
                    <select className="form-control" required value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                      <option value="">Seleziona...</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Note</label>
                  <input className="form-control" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>

                <div style={{ marginTop: '1rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Righe DDT</strong>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}><Plus size={14} /> Aggiungi</button>
                </div>

                {items.map((it, i) => (
                  <div key={i} className="flex gap-1 items-center" style={{ marginBottom: '0.5rem' }}>
                    <select className="form-control" style={{ flex: 2 }} required value={it.product_id} onChange={(e) => { const c = [...items]; c[i] = { ...c[i], product_id: e.target.value }; setItems(c); }}>
                      <option value="">Prodotto...</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input className="form-control" style={{ flex: 1 }} type="number" step="0.01" placeholder="Qtà" required value={it.quantity} onChange={(e) => { const c = [...items]; c[i] = { ...c[i], quantity: e.target.value }; setItems(c); }} />
                    <input className="form-control" style={{ flex: 1 }} placeholder="Unità" value={it.unit} onChange={(e) => { const c = [...items]; c[i] = { ...c[i], unit: e.target.value }; setItems(c); }} />
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setItems(items.filter((_, idx) => idx !== i))}><X size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annulla</button>
                <button type="submit" className="btn btn-primary">Crea DDT</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
