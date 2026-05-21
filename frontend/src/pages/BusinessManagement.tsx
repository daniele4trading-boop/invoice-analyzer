import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Store, Plus, Trash2, Edit } from 'lucide-react';
import type { Business } from '../types';
import { useAuth } from '../context/AuthContext';

export default function BusinessManagement() {
  const qc = useQueryClient();
  const { refreshBusinesses } = useAuth();
  const { data: businesses = [] } = useQuery({ queryKey: ['businesses'], queryFn: () => api.get<Business[]>('/api/auth/businesses') });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const createMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => api.post('/api/auth/businesses', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['businesses'] }); refreshBusinesses(); resetForm(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Record<string, unknown>) => api.put(`/api/auth/businesses/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['businesses'] }); refreshBusinesses(); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.del(`/api/auth/businesses/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['businesses'] }); refreshBusinesses(); },
  });

  function resetForm() {
    setShowForm(false); setEditId(null); setName(''); setAddress('');
    setVatNumber(''); setPhone(''); setEmail('');
  }

  function startEdit(b: Business) {
    setEditId(b.id); setName(b.name); setAddress(b.address || '');
    setVatNumber(b.vat_number || ''); setPhone(b.phone || ''); setEmail(b.email || '');
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = { name, address, vat_number: vatNumber, phone, email };
    if (editId) {
      updateMut.mutate({ id: editId, ...data });
    } else {
      createMut.mutate(data);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2><Store size={22} /> Gestione Negozi / Attività</h2>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus size={18} /> Nuova Attività
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-group">
              <label>Nome</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Indirizzo</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="form-group">
              <label>P.IVA</label>
              <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Telefono</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">{editId ? 'Aggiorna' : 'Crea'}</button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>Annulla</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th><th>Indirizzo</th><th>P.IVA</th><th>Tel</th><th>Email</th><th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((b) => (
              <tr key={b.id}>
                <td><strong>{b.name}</strong></td>
                <td>{b.address || '—'}</td>
                <td>{b.vat_number || '—'}</td>
                <td>{b.phone || '—'}</td>
                <td>{b.email || '—'}</td>
                <td>
                  <button className="btn-icon" onClick={() => startEdit(b)} title="Modifica"><Edit size={16} /></button>
                  <button className="btn-icon btn-danger" onClick={() => { if (confirm('Eliminare attività?')) deleteMut.mutate(b.id); }} title="Elimina"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {businesses.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999' }}>Nessuna attività ancora creata</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
