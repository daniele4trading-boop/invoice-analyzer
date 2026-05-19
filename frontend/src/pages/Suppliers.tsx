import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { api } from '../api/client';
import type { Supplier } from '../types';

export default function Suppliers() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: '', vat_number: '', address: '', email: '', phone: '' });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/api/suppliers/'),
  });

  const createMut = useMutation({
    mutationFn: (data: typeof form) => api.post('/api/suppliers/', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); closeModal(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof form }) => api.put(`/api/suppliers/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); closeModal(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.del(`/api/suppliers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });

  function openCreate() {
    setEditing(null);
    setForm({ name: '', vat_number: '', address: '', email: '', phone: '' });
    setShowModal(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, vat_number: s.vat_number || '', address: s.address || '', email: s.email || '', phone: s.phone || '' });
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditing(null); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      updateMut.mutate({ id: editing.id, data: form });
    } else {
      createMut.mutate(form);
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Fornitori</h2>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> Nuovo Fornitore
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>P.IVA</th>
                <th>Email</th>
                <th>Telefono</th>
                <th>Indirizzo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted">Nessun fornitore. Inizia aggiungendone uno!</td></tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong></td>
                    <td>{s.vat_number || '-'}</td>
                    <td>{s.email || '-'}</td>
                    <td>{s.phone || '-'}</td>
                    <td>{s.address || '-'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>
                          <Pencil size={14} />
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Eliminare?')) deleteMut.mutate(s.id); }}>
                          <Trash2 size={14} />
                        </button>
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
              {editing ? 'Modifica Fornitore' : 'Nuovo Fornitore'}
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
                    <label>Partita IVA</label>
                    <input className="form-control" value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input className="form-control" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label>Telefono</label>
                    <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Indirizzo</label>
                    <input className="form-control" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Annulla</button>
                <button type="submit" className="btn btn-primary">
                  {editing ? 'Salva' : 'Crea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
