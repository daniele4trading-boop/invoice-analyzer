import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Cloud, FolderInput, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { api } from '../api/client';

interface ImportResult {
  total_files: number;
  imported: number;
  skipped_duplicate: number;
  errors: string[];
  imported_invoices: { id: number; number: string; file_name: string; supplier: string | null; total_amount: number }[];
}

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

export default function OneDriveImport() {
  const qc = useQueryClient();
  const [accessToken, setAccessToken] = useState('');
  const [folderPath, setFolderPath] = useState('/Fatture');
  const [archiveSubfolder, setArchiveSubfolder] = useState('archivio');
  const [result, setResult] = useState<ImportResult | null>(null);

  const importMut = useMutation({
    mutationFn: () => api.post<ImportResult>('/api/onedrive/import', {
      access_token: accessToken,
      folder_path: folderPath,
      archive_subfolder: archiveSubfolder,
    }),
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
        <h3 style={{ marginBottom: '1rem' }}>Configurazione</h3>
        <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Inserisci il token di accesso Microsoft Graph e il percorso della cartella OneDrive
          con le fatture. I file importati verranno spostati nella sottocartella di archivio.
        </p>
        <div className="form-group">
          <label>Access Token (Microsoft Graph)</label>
          <textarea
            className="form-control"
            rows={3}
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Incolla qui il token di accesso..."
            style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
          />
          <small style={{ color: '#999' }}>
            Ottieni il token da{' '}
            <a href="https://developer.microsoft.com/en-us/graph/graph-explorer" target="_blank" rel="noreferrer">
              Graph Explorer
            </a>{' '}
            con permesso Files.ReadWrite
          </small>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label>Cartella OneDrive</label>
            <input className="form-control" value={folderPath} onChange={(e) => setFolderPath(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Sottocartella archivio</label>
            <input className="form-control" value={archiveSubfolder} onChange={(e) => setArchiveSubfolder(e.target.value)} />
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => importMut.mutate()}
          disabled={!accessToken || importMut.isPending}
        >
          {importMut.isPending ? <><Loader size={16} className="spin" /> Importazione in corso...</> : <><FolderInput size={16} /> Importa Fatture</>}
        </button>
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
