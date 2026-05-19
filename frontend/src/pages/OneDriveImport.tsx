import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cloud, FolderInput, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { api } from '../api/client';

interface ImportResult {
  total_files: number;
  imported: number;
  skipped_duplicate: number;
  errors: string[];
  imported_invoices: { id: number; number: string; file_name: string; supplier: string | null; total_amount: number }[];
}

interface OneDriveStatus {
  configured: boolean;
  share_url: string | null;
  archive_subfolder: string;
}

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

export default function OneDriveImport() {
  const qc = useQueryClient();
  const [result, setResult] = useState<ImportResult | null>(null);

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

  return (
    <div>
      <div className="page-header">
        <h2><Cloud size={22} /> Importa da OneDrive</h2>
      </div>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Cartella OneDrive collegata</h3>
        {status?.configured ? (
          <>
            <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.9rem' }}>
              La cartella OneDrive è configurata. Clicca il pulsante per importare le fatture
              (PDF, JPG, PNG). I file importati verranno spostati nella sottocartella <strong>"{status.archive_subfolder}"</strong>.
              Le fatture duplicate vengono automaticamente saltate.
            </p>
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
          </>
        ) : (
          <p style={{ color: '#d97706' }}>
            <AlertCircle size={16} style={{ verticalAlign: 'middle' }} /> Nessuna cartella OneDrive configurata.
            Imposta la variabile d'ambiente <code>ONEDRIVE_SHARE_URL</code> con il link condiviso.
          </p>
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
