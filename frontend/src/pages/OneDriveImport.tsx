import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cloud, FolderInput, CheckCircle, AlertCircle, Loader, Link2, Unlink } from 'lucide-react';
import { api } from '../api/client';

interface ImportResult {
  total_files: number;
  imported: number;
  skipped_duplicate: number;
  errors: string[];
  imported_invoices: { id: number; number: string; file_name: string; supplier: string | null; total_amount: number }[];
}

interface OneDriveStatus {
  connected: boolean;
  oauth_configured: boolean;
  folder_path: string;
  archive_subfolder: string;
}

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

export default function OneDriveImport() {
  const qc = useQueryClient();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [connectMsg, setConnectMsg] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  useEffect(() => {
    if (params.get('connected') === 'true') {
      setConnectMsg('OneDrive collegato con successo!');
      window.history.replaceState({}, '', '/onedrive-import');
      qc.invalidateQueries({ queryKey: ['onedrive-status'] });
    } else if (params.get('error')) {
      setConnectMsg(`Errore connessione: ${params.get('error')}`);
      window.history.replaceState({}, '', '/onedrive-import');
    }
  }, []);

  const { data: status } = useQuery<OneDriveStatus>({
    queryKey: ['onedrive-status'],
    queryFn: () => api.get('/api/onedrive/status'),
  });

  const importMut = useMutation({
    mutationFn: () => api.post<ImportResult>('/api/onedrive/import', {}),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => api.post('/api/onedrive/disconnect', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onedrive-status'] });
      setResult(null);
      setConnectMsg(null);
    },
  });

  const handleConnect = () => {
    window.location.href = '/api/onedrive/auth';
  };

  return (
    <div>
      <div className="page-header">
        <h2><Cloud size={22} /> Importa da OneDrive</h2>
      </div>

      {connectMsg && (
        <div className="card" style={{
          padding: '1rem 1.5rem',
          marginBottom: '1rem',
          borderColor: connectMsg.includes('successo') ? '#86efac' : '#fca5a5',
          backgroundColor: connectMsg.includes('successo') ? '#f0fdf4' : '#fef2f2',
        }}>
          <p style={{
            color: connectMsg.includes('successo') ? '#16a34a' : '#dc2626',
            display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0,
          }}>
            {connectMsg.includes('successo')
              ? <CheckCircle size={18} />
              : <AlertCircle size={18} />
            }
            {connectMsg}
          </p>
        </div>
      )}

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Connessione OneDrive</h3>

        {!status?.oauth_configured ? (
          <div style={{ color: '#d97706', padding: '1rem', background: '#fffbeb', borderRadius: '0.5rem' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem 0' }}>
              <AlertCircle size={16} /> <strong>Configurazione richiesta</strong>
            </p>
            <p style={{ margin: '0', fontSize: '0.9rem' }}>
              Per utilizzare l'importazione da OneDrive, è necessario configurare un'app Microsoft Azure.
              Imposta le variabili <code>MS_CLIENT_ID</code> e <code>MS_CLIENT_SECRET</code> nel file .env del backend.
            </p>
          </div>
        ) : status?.connected ? (
          <>
            <p style={{ color: '#16a34a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={16} /> OneDrive collegato
            </p>
            <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.9rem' }}>
              Cartella: <strong>{status.folder_path}</strong> — I file importati verranno spostati nella
              sottocartella <strong>"{status.archive_subfolder}"</strong>. Le fatture duplicate vengono automaticamente saltate.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={() => importMut.mutate()}
                disabled={importMut.isPending}
                style={{ fontSize: '1rem', padding: '0.75rem 1.5rem' }}
              >
                {importMut.isPending
                  ? <><Loader size={18} className="spin" /> Importazione in corso...</>
                  : <><FolderInput size={18} /> Importa Fatture da OneDrive</>
                }
              </button>
              <button
                className="btn"
                onClick={() => disconnectMut.mutate()}
                disabled={disconnectMut.isPending}
                style={{ fontSize: '0.9rem', padding: '0.5rem 1rem', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
              >
                <Unlink size={16} /> Scollega OneDrive
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.9rem' }}>
              Collega il tuo account OneDrive per importare le fatture direttamente dalla cartella condivisa.
              L'autorizzazione richiede il tuo account Microsoft.
            </p>
            <button
              className="btn btn-primary"
              onClick={handleConnect}
              style={{ fontSize: '1rem', padding: '0.75rem 1.5rem' }}
            >
              <Link2 size={18} /> Collega OneDrive
            </button>
          </>
        )}
      </div>

      {importMut.isError && (
        <div className="card" style={{ padding: '1.5rem', borderColor: '#fca5a5' }}>
          <p style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} /> Errore: {importMut.error instanceof Error ? importMut.error.message : 'Errore sconosciuto'}
          </p>
        </div>
      )}

      {result && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={20} color="#16a34a" /> Risultato Importazione
          </h3>
          <div className="stats-grid" style={{ marginBottom: '1rem' }}>
            <div className="stat-card">
              <div className="stat-label">File trovati</div>
              <div className="stat-value">{result.total_files}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Importati</div>
              <div className="stat-value" style={{ color: '#16a34a' }}>{result.imported}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Duplicati saltati</div>
              <div className="stat-value" style={{ color: '#d97706' }}>{result.skipped_duplicate}</div>
            </div>
          </div>

          {result.imported_invoices.length > 0 && (
            <>
              <h4 style={{ marginBottom: '0.5rem' }}>Fatture importate</h4>
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Numero</th>
                    <th>Fornitore</th>
                    <th className="text-right">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {result.imported_invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.file_name}</td>
                      <td>{inv.number}</td>
                      <td>{inv.supplier || '—'}</td>
                      <td className="text-right font-mono">{fmt(inv.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {result.total_files === 0 && (
            <p style={{ color: '#666' }}>Nessun file trovato nella cartella OneDrive.</p>
          )}

          {result.errors.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ color: '#dc2626' }}>Errori</h4>
              <ul style={{ fontSize: '0.85rem', color: '#dc2626' }}>
                {result.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
