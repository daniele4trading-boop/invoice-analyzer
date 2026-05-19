import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Tag } from 'lucide-react';
import { api } from '../api/client';
import type { Product, ProductCategory } from '../types';

export default function Products() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: '', code: '', unit: '', category_id: '' });
  const [catForm, setCatForm] = useState({ name: '', description: '' });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => api.get('/api/products/'),
  });

  const { data: categories = [] } = useQuery<ProductCategory[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/api/products/categories'),
  });

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/api/products/', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); closeModal(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => api.put(`/api/products/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); closeModal(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.del(`/api/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const createCatMut = useMutation({
    mutationFn: (data: { name: string; description: string }) => api.post('/api/products/categories', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setShowCatModal(false); },
  });

  function openCreate() {
    setEditing(null);
    setForm({ name: '', code: '', unit: '', category_id: '' });
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ name: p.name, code: p.code || '', unit: p.unit || '', category_id: p.category_id?.toString() || '' });
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditing(null); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { name: form.name, code: form.code || null, unit: form.unit || null, category_id: form.category_id ? Number(form.category_id) : null };
    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Prodotti</h2>
        <div className="flex gap-1">
          <button className="btn btn-secondary" onClick={() => { setCatForm({ name: '', description: '' }); setShowCatModal(true); }}>
            <Tag size={16} /> Nuova Categoria
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Nuovo Prodotto
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Codice</th>
                <th>Categoria</th>
                <th>Unità</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted">Nessun prodotto</td></tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.code || '-'}</td>
                    <td>{p.category?.name ? <span className="badge badge-blue">{p.category.name}</span> : '-'}</td>
                    <td>{p.unit || '-'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}><Pencil size={14} /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Eliminare?')) deleteMut.mutate(p.id); }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              {editing ? 'Modifica Prodotto' : 'Nuovo Prodotto'}
              <button className="btn btn-secondary btn-sm" onClick={closeModal}>X</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nome *</label>
                  <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label>Codice</label>
                    <input className="form-control" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Unità (kg, lt, pz...)</label>
                    <input className="form-control" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Categoria</label>
                  <select className="form-control" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                    <option value="">-- Nessuna --</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Annulla</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Salva' : 'Crea'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCatModal && (
        <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              Nuova Categoria
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCatModal(false)}>X</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); createCatMut.mutate(catForm); }}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nome *</label>
                  <input className="form-control" required value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Descrizione</label>
                  <input className="form-control" value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCatModal(false)}>Annulla</button>
                <button type="submit" className="btn btn-primary">Crea</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
