import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Eye, X, Edit, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Invoice, Supplier, Product } from '../types';

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

interface ItemForm {
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
}

export default function Invoices() {
  const qc = useQueryClient();
  const { user, businesses } = useAuth();
  const isMaster = user?.role === 'master';
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState<Invoice | null>(null);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [form, setForm] = useState({
    number: '', date: '', supplier_id: '', notes: '',
    vat_amount: '', net_amount: '', business_id: '',
  });
  const [items, setItems] = useState<ItemForm[]>([]);

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['invoices', filterSupplier, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterSupplier) params.set('supplier_id', filterSupplier);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      return api.get(`/api/invoices/?${params}`);
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
    mutationFn: (data: Record<string, unknown>) => api.post('/api/invoices/', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); closeModal(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.put(`/api/invoices/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); closeModal(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.del(`/api/invoices/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setDuplicateWarning('');
  }

  function openNew() {
    setForm({ number: '', date: '', supplier_id: '', notes: '', vat_amount: '', net_amount: '', business_id: user?.business_id ? String(user.business_id) : '' });
    setItems([]);
    setEditingId(null);
    setDuplicateWarning('');
    setShowModal(true);
  }

  function openEdit(inv: Invoice) {
    setForm({
      number: inv.number,
      date: inv.date,
      supplier_id: String(inv.supplier_id),
      notes: inv.notes || '',
      vat_amount: inv.vat_amount ? String(inv.vat_amount) : '',
      net_amount: inv.net_amount ? String(inv.net_amount) : '',
      business_id: inv.business_id ? String(inv.business_id) : '',
    });
    setItems(inv.items.map((it) => ({
      product_id: it.product_id ? String(it.product_id) : '',
      description: it.description || '',
      quantity: String(it.quantity),
      unit_price: String(it.unit_price),
    })));
    setEditingId(inv.id);
    setDuplicateWarning('');
    setShowModal(true);
  }

  function addItem() {
    setItems([...items, { product_id: '', description: '', quantity: '', unit_price: '' }]);
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, field: keyof ItemForm, value: string) {
    const copy = [...items];
    copy[i] = { ...copy[i], [field]: value };
    setItems(copy);
  }

  function calcTotal(): number {
    return items.reduce((sum, it) => {
      const q = parseFloat(it.quantity) || 0;
      const p = parseFloat(it.unit_price) || 0;
      return sum + q * p;
    }, 0);
  }

  async function checkDuplicate() {
    if (!form.number || !form.supplier_id) return;
    try {
      const params = new URLSearchParams({ number: form.number, supplier_id: form.supplier_id });
      if (form.date) params.set('date', form.date);
      const res = await api.get<{ is_duplicate: boolean; message?: string }>(`/api/invoices/check-duplicate?${params}`);
      if (res.is_duplicate) {
        setDuplicateWarning(res.message || 'Fattura duplicata trovata!');
      } else {
        setDuplicateWarning('');
      }
    } catch { /* ignore */ }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mappedItems = items.map((it) => ({
      product_id: it.product_id ? Number(it.product_id) : null,
      description: it.description || null,
      quantity: parseFloat(it.quantity),
      unit_price: parseFloat(it.unit_price),
      total_price: (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0),
    }));
    const payload: Record<string, unknown> = {
      number: form.number,
      date: form.date,
      supplier_id: Number(form.supplier_id),
      business_id: form.business_id ? Number(form.business_id) : null,
      total_amount: calcTotal(),
      vat_amount: parseFloat(form.vat_amount) || 0,
      net_amount: parseFloat(form.net_amount) || calcTotal(),
      notes: form.notes || null,
      items: mappedItems,
    };
    if (editingId) {
      updateMut.mutate({ id: editingId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Fatture</h2>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Nuova Fattura
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
        <div className="form-group">
          <label>Da</label>
          <input type="date" className="form-control" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label>A</label>
          <input type="date" className="form-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
                <th>Negozio</th>
                <th>Righe</th>
                <th className="text-right">Totale</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted">Nessuna fattura</td></tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td><strong>{inv.number}</strong></td>
                    <td>{new Date(inv.date).toLocaleDateString('it-IT')}</td>
                    <td>{inv.supplier?.name}</td>
                    <td>{inv.business?.name || '—'}</td>
                    <td>{inv.items.length}</td>
                    <td className="text-right font-mono">{fmt(inv.total_amount)}</td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowDetail(inv)}><Eye size={14} /></button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(inv)} title="Modifica"><Edit size={14} /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Eliminare questa fattura?')) deleteMut.mutate(inv.id); }}><Trash2 size={14} /></button>
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
              Fattura {showDetail.number}
              <button className="btn btn-secondary btn-sm" onClick={() => setShowDetail(null)}>X</button>
            </div>
            <div className="modal-body">
              <p><strong>Fornitore:</strong> {showDetail.supplier?.name}</p>
              <p><strong>Data:</strong> {new Date(showDetail.date).toLocaleDateString('it-IT')}</p>
              <p><strong>Negozio:</strong> {showDetail.business?.name || '—'}</p>
              <p><strong>Totale:</strong> {fmt(showDetail.total_amount)}</p>
              {showDetail.notes && <p><strong>Note:</strong> {showDetail.notes}</p>}
              <table style={{ marginTop: '1rem' }}>
                <thead>
                  <tr>
                    <th>Prodotto</th>
                    <th>Qtà</th>
                    <th className="text-right">Prezzo Un.</th>
                    <th className="text-right">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {showDetail.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.product?.name || it.description}</td>
                      <td>{it.quantity}</td>
                      <td className="text-right font-mono">{fmt(it.unit_price)}</td>
                      <td className="text-right font-mono">{fmt(it.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              {editingId ? 'Modifica Fattura' : 'Nuova Fattura'}
              <button className="btn btn-secondary btn-sm" onClick={closeModal}>X</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {duplicateWarning && (
                  <div className="alert alert-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <AlertTriangle size={18} /> {duplicateWarning}
                  </div>
                )}
                <div className="grid-3">
                  <div className="form-group">
                    <label>Numero *</label>
                    <input className="form-control" required value={form.number}
                      onChange={(e) => setForm({ ...form, number: e.target.value })}
                      onBlur={checkDuplicate} />
                  </div>
                  <div className="form-group">
                    <label>Data *</label>
                    <input type="date" className="form-control" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Fornitore *</label>
                    <select className="form-control" required value={form.supplier_id}
                      onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                      onBlur={checkDuplicate}>
                      <option value="">Seleziona...</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid-3">
                  <div className="form-group">
                    <label>Negozio</label>
                    <select className="form-control" value={form.business_id}
                      onChange={(e) => setForm({ ...form, business_id: e.target.value })}
                      disabled={!isMaster}>
                      <option value="">— Nessuno —</option>
                      {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>IVA</label>
                    <input type="number" step="0.01" className="form-control" value={form.vat_amount} onChange={(e) => setForm({ ...form, vat_amount: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Note</label>
                    <input className="form-control" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>

                <div style={{ marginTop: '1rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Righe Fattura</strong>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}><Plus size={14} /> Aggiungi Riga</button>
                </div>

                {items.map((it, i) => (
                  <div key={i} className="flex gap-1 items-center" style={{ marginBottom: '0.5rem' }}>
                    <select className="form-control" style={{ flex: 2 }} value={it.product_id} onChange={(e) => updateItem(i, 'product_id', e.target.value)}>
                      <option value="">Prodotto...</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input className="form-control" style={{ flex: 1.5 }} placeholder="Descrizione" value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} />
                    <input className="form-control" style={{ flex: 1 }} type="number" step="0.01" placeholder="Qtà" required value={it.quantity} onChange={(e) => updateItem(i, 'quantity', e.target.value)} />
                    <input className="form-control" style={{ flex: 1 }} type="number" step="0.01" placeholder="Prezzo" required value={it.unit_price} onChange={(e) => updateItem(i, 'unit_price', e.target.value)} />
                    <span className="font-mono" style={{ minWidth: '80px', textAlign: 'right' }}>
                      {fmt((parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0))}
                    </span>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(i)}><X size={14} /></button>
                  </div>
                ))}

                {items.length > 0 && (
                  <div className="text-right" style={{ marginTop: '0.5rem', fontSize: '1.1rem' }}>
                    <strong>Totale: {fmt(calcTotal())}</strong>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Annulla</button>
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Salva Modifiche' : 'Crea Fattura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
