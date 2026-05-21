import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { UserPlus, Trash2, Edit } from 'lucide-react';
import type { UserOut, Business } from '../types';

export default function UserManagement() {
  const qc = useQueryClient();
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserOut[]>('/api/auth/users') });
  const { data: businesses = [] } = useQuery({ queryKey: ['businesses'], queryFn: () => api.get<Business[]>('/api/auth/businesses') });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('store_manager');
  const [businessId, setBusinessId] = useState<string>('');

  const createMut = useMutation({
    mutationFn: (d: Record<string, unknown>) => api.post('/api/auth/users', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); resetForm(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: Record<string, unknown>) => api.put(`/api/auth/users/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.del(`/api/auth/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  function resetForm() {
    setShowForm(false); setEditId(null); setEmail(''); setFullName('');
    setPassword(''); setRole('store_manager'); setBusinessId('');
  }

  function startEdit(u: UserOut) {
    setEditId(u.id); setEmail(u.email); setFullName(u.full_name);
    setRole(u.role); setBusinessId(u.business_id?.toString() || '');
    setPassword(''); setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, unknown> = {
      full_name: fullName, role,
      business_id: businessId ? parseInt(businessId) : null,
    };
    if (editId) {
      data.id = editId;
      if (password) data.password = password;
      updateMut.mutate(data);
    } else {
      data.email = email;
      data.password = password;
      createMut.mutate(data);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Gestione Utenti</h2>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <UserPlus size={18} /> Nuovo Utente
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleSubmit} className="form-grid">
            {!editId && (
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            )}
            <div className="form-group">
              <label>Nome completo</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Password{editId ? ' (lascia vuoto per non modificare)' : ''}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!editId} />
            </div>
            <div className="form-group">
              <label>Ruolo</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="store_manager">Responsabile Negozio</option>
                <option value="master">Master (Amministratore)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Negozio assegnato</label>
              <select value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
                <option value="">-- Nessuno (tutti) --</option>
                {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
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
              <th>Nome</th><th>Email</th><th>Ruolo</th><th>Negozio</th><th>Attivo</th><th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td>{u.role === 'master' ? 'Master' : 'Responsabile'}</td>
                <td>{u.business?.name || '—'}</td>
                <td>{u.is_active ? 'Si' : 'No'}</td>
                <td>
                  <button className="btn-icon" onClick={() => startEdit(u)} title="Modifica"><Edit size={16} /></button>
                  <button className="btn-icon btn-danger" onClick={() => { if (confirm('Eliminare utente?')) deleteMut.mutate(u.id); }} title="Elimina"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
