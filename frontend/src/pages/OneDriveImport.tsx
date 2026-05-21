import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FolderInput, CheckCircle, AlertCircle, Loader, Upload, X } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface ImportedInvoice {
  file_name: string;
  number: string | null;
  supplier: string | null;
  total_amount: number | null;
  status: 'imported' | 'error' | 'pending' | 'processing';
  error?: string;
  invoice_id?: number;
}

const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);

export default function BulkImport() {
  const qc = useQueryClient();
  const { user, businesses } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ImportedInvoice[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [businessId, setBusinessId] = useState<string>(user?.business_id ? String(user.business_id) : '');

  const isMaster = user?.role === 'master';

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      return ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'bmp', 'webp'].includes(ext);
    });
    setSelectedFiles((prev) => [...prev, ...fileArray]);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const processFiles = async () => {
    if (selectedFiles.length === 0) return;
    setIsImporting(true);
    const initialResults: ImportedInvoice[] = selectedFiles.map((f) => ({
      file_name: f.name,
      number: null,
      supplier: null,
      total_amount: null,
      status: 'pending',
    }));
    setResults(initialResults);

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setResults((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'processing' } : r));

      try {
        const parsed = await api.upload<{
          file_path: string;
          parsed_data: {
            number: string | null;
            date: string | null;
            total_amount: number | null;
            vat_amount: number | null;
            net_amount: number | null;
            supplier: { id: number; name: string } | null;
            items: { description: string; quantity: number; unit_price: number; total_price: number }[];
          };
        }>('/api/upload/parse', file);

        const p = parsed.parsed_data;
        const invoiceData = {
          number: p.number || file.name,
          date: p.date || new Date().toISOString().split('T')[0],
          supplier_id: p.supplier?.id || null,
          business_id: businessId ? parseInt(businessId) : (user?.business_id || null),
          total_amount: p.total_amount || 0,
          vat_amount: p.vat_amount || 0,
          net_amount: p.net_amount || (p.total_amount || 0) - (p.vat_amount || 0),
          file_path: parsed.file_path,
          items: p.items.map((it) => ({
            product_id: null,
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            total_price: it.total_price,
          })),
        };

        if (invoiceData.supplier_id) {
          const inv = await api.post<{ id: number }>('/api/invoices/', invoiceData);
          setResults((prev) => prev.map((r, idx) => idx === i ? {
            ...r,
            status: 'imported',
            number: p.number,
            supplier: p.supplier?.name || null,
            total_amount: p.total_amount,
            invoice_id: inv.id,
          } : r));
        } else {
          setResults((prev) => prev.map((r, idx) => idx === i ? {
            ...r,
            status: 'error',
            number: p.number,
            total_amount: p.total_amount,
            error: 'Fornitore non riconosciuto - carica manualmente dalla pagina "Carica Fattura"',
          } : r));
        }
      } catch (err) {
        setResults((prev) => prev.map((r, idx) => idx === i ? {
          ...r,
          status: 'error',
          error: err instanceof Error ? err.message : 'Errore sconosciuto',
        } : r));
      }
    }

    setIsImporting(false);
    setSelectedFiles([]);
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const importedCount = results.filter((r) => r.status === 'imported').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  return (
    <div>
      <div className="page-header">
        <h2><FolderInput size={22} /> Importazione Multipla</h2>
      </div>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Carica più fatture contemporaneamente</h3>
        <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Seleziona o trascina più file (PDF, JPG, PNG) per importarli tutti insieme.
          Ogni file verrà analizzato con OCR e salvato automaticamente. I file senza fornitore riconosciuto
          dovranno essere caricati manualmente.
        </p>

        {isMaster && businesses.length > 0 && (
          <div className="form-group" style={{ marginBottom: '1rem', maxWidth: '300px' }}>
            <label>Assegna al negozio</label>
            <select className="form-control" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
              <option value="">— Nessuno —</option>
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        {!isImporting && (
          <div
            className={`card upload-zone ${dragOver ? 'drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{ cursor: 'pointer', marginBottom: '1rem' }}
          >
            <div style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
              <Upload size={40} style={{ color: 'var(--primary)', marginBottom: '0.75rem' }} />
              <p style={{ margin: '0 0 0.25rem', fontWeight: 600 }}>Trascina qui i file o clicca per selezionare</p>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>PDF, JPG, PNG, TIFF, BMP — puoi selezionare più file</p>
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.tiff,.bmp,.webp"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {selectedFiles.length > 0 && !isImporting && (
          <>
            <h4 style={{ marginBottom: '0.5rem' }}>File selezionati ({selectedFiles.length})</h4>
            <div style={{ marginBottom: '1rem' }}>
              {selectedFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                  <span style={{ flex: 1, fontSize: '0.9rem' }}>{f.name}</span>
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>{(f.size / 1024).toFixed(0)} KB</span>
                  <button className="btn btn-danger btn-sm" onClick={() => removeFile(i)} style={{ padding: '0.15rem 0.4rem' }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={processFiles} style={{ fontSize: '1rem', padding: '0.75rem 1.5rem' }}>
              <FolderInput size={18} /> Importa {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'file'}
            </button>
          </>
        )}

        {isImporting && (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
              <Loader size={18} className="spin" /> Importazione in corso...
            </p>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!isImporting && <CheckCircle size={20} color="#16a34a" />} Risultato Importazione
          </h3>

          {!isImporting && (
            <div className="stats-grid" style={{ marginBottom: '1rem' }}>
              <div className="stat-card">
                <div className="stat-label">File totali</div>
                <div className="stat-value">{results.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Importati</div>
                <div className="stat-value" style={{ color: '#16a34a' }}>{importedCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Errori</div>
                <div className="stat-value" style={{ color: errorCount > 0 ? '#dc2626' : '#666' }}>{errorCount}</div>
              </div>
            </div>
          )}

          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Stato</th>
                <th>Numero</th>
                <th>Fornitore</th>
                <th className="text-right">Totale</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontSize: '0.9rem' }}>{r.file_name}</td>
                  <td>
                    {r.status === 'imported' && <span style={{ color: '#16a34a' }}><CheckCircle size={14} /> Importato</span>}
                    {r.status === 'error' && (
                      <span style={{ color: '#dc2626', fontSize: '0.85rem' }}>
                        <AlertCircle size={14} /> {r.error}
                      </span>
                    )}
                    {r.status === 'processing' && <span style={{ color: 'var(--primary)' }}><Loader size={14} className="spin" /> Analisi...</span>}
                    {r.status === 'pending' && <span className="text-muted">In attesa</span>}
                  </td>
                  <td>{r.number || '—'}</td>
                  <td>{r.supplier || '—'}</td>
                  <td className="text-right font-mono">{r.total_amount != null ? fmt(r.total_amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
