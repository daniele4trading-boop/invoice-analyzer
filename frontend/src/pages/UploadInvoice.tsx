import { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, Camera, CheckCircle, AlertCircle, Loader, UserPlus, Link2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Supplier, Product } from '../types';

interface ParsedResult {
  file_path: string;
  file_name: string;
  extracted_text: string;
  parsed_data: {
    number: string | null;
    date: string | null;
    total_amount: number | null;
    vat_amount: number | null;
    net_amount: number | null;
    supplier_vat_number: string | null;
    supplier: {
      id: number | null;
      name: string | null;
      matched_by: string;
      confidence: string;
      score?: number;
      extracted_name?: string;
      extracted_vat?: string | null;
    } | null;
    items: {
      description: string;
      quantity: number;
      unit_price: number;
      total_price: number;
      product_match?: {
        product_id: number;
        product_name: string;
        confidence: string;
        score: number;
      } | null;
    }[];
  };
  confidence: Record<string, string>;
}

const confBadge = (level: string) => {
  const map: Record<string, { cls: string; label: string }> = {
    high: { cls: 'badge-green', label: 'Alta' },
    medium: { cls: 'badge-orange', label: 'Media' },
    low: { cls: 'badge-red', label: 'Bassa' },
    none: { cls: 'badge-red', label: 'Non trovato' },
  };
  const cfg = map[level] || map.none;
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>;
};

interface ItemForm {
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  match_confidence?: string;
  match_name?: string;
}

export default function UploadInvoice() {
  const queryClient = useQueryClient();
  const { user, businesses } = useAuth();
  const isMaster = user?.role === 'master';
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ParsedResult | null>(null);
  const [saved, setSaved] = useState(false);

  const [number, setNumber] = useState('');
  const [date, setDate] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [businessId, setBusinessId] = useState(user?.business_id ? String(user.business_id) : '');
  const [items, setItems] = useState<ItemForm[]>([]);

  // Supplier creation state
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierVat, setNewSupplierVat] = useState('');
  const [supplierMatchInfo, setSupplierMatchInfo] = useState<string>('');

  const { data: suppliers = [], refetch: refetchSuppliers } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/api/suppliers/'),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => api.get('/api/products/'),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.upload<ParsedResult>('/api/upload/parse', file),
    onSuccess: (data) => {
      setResult(data);
      setSaved(false);
      const p = data.parsed_data;
      setNumber(p.number || '');
      setDate(p.date || '');
      setVatAmount(p.vat_amount != null ? String(p.vat_amount) : '');
      setTotalAmount(p.total_amount != null ? String(p.total_amount) : '');
      setNotes('');

      // Handle supplier matching
      if (p.supplier && p.supplier.id) {
        setSupplierId(String(p.supplier.id));
        setShowNewSupplier(false);
        if (p.supplier.matched_by === 'fuzzy') {
          setSupplierMatchInfo(
            `Fornitore "${p.supplier.extracted_name}" associato a "${p.supplier.name}" (similitudine: ${Math.round((p.supplier.score || 0) * 100)}%)`
          );
        } else {
          setSupplierMatchInfo('');
        }
      } else if (p.supplier && p.supplier.matched_by === 'not_found') {
        setSupplierId('');
        setShowNewSupplier(true);
        setNewSupplierName(p.supplier.extracted_name || '');
        setNewSupplierVat(p.supplier.extracted_vat || p.supplier_vat_number || '');
        setSupplierMatchInfo('');
      } else {
        setSupplierId('');
        setShowNewSupplier(false);
        setSupplierMatchInfo('');
      }

      // Map items with product match info
      setItems(
        p.items.map((it) => ({
          product_id: it.product_match?.product_id ? String(it.product_match.product_id) : '',
          description: it.description,
          quantity: String(it.quantity),
          unit_price: String(it.unit_price),
          total_price: String(it.total_price),
          match_confidence: it.product_match?.confidence,
          match_name: it.product_match?.product_name,
        })),
      );
    },
  });

  const createSupplierMut = useMutation({
    mutationFn: (data: { name: string; vat_number?: string }) =>
      api.post<{ id: number; name: string; created: boolean }>('/api/upload/create-supplier', data),
    onSuccess: (data) => {
      setSupplierId(String(data.id));
      setShowNewSupplier(false);
      setSupplierMatchInfo(data.created ? `Fornitore "${data.name}" creato` : `Fornitore "${data.name}" già esistente`);
      refetchSuppliers();
    },
  });

  const saveAliasMut = useMutation({
    mutationFn: (data: { product_id: number; alias: string }) =>
      api.post('/api/upload/save-product-alias', data),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const total = parseFloat(totalAmount) || 0;

      // Save aliases for fuzzy-matched products
      for (const item of items) {
        if (item.product_id && item.description && item.match_confidence && item.match_confidence !== 'high') {
          saveAliasMut.mutate({ product_id: parseInt(item.product_id), alias: item.description });
        }
      }

      const body = {
        number,
        date,
        supplier_id: parseInt(supplierId),
        business_id: businessId ? parseInt(businessId) : null,
        total_amount: total,
        vat_amount: parseFloat(vatAmount) || 0,
        net_amount: total - (parseFloat(vatAmount) || 0),
        notes,
        file_path: result?.file_path || null,
        items: items
          .filter((it) => it.description || it.product_id)
          .map((it) => ({
            product_id: it.product_id ? parseInt(it.product_id) : null,
            description: it.description,
            quantity: parseFloat(it.quantity) || 0,
            unit_price: parseFloat(it.unit_price) || 0,
            total_price: parseFloat(it.total_price) || 0,
          })),
      };
      return api.post('/api/invoices/', body);
    },
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      uploadMutation.mutate(file);
    },
    [uploadMutation],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const updateItem = (idx: number, field: keyof ItemForm, value: string) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      if (field === 'product_id') {
        updated.match_confidence = undefined;
        updated.match_name = undefined;
      }
      return updated;
    }));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { product_id: '', description: '', quantity: '', unit_price: '', total_price: '' }]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <>
      <div className="page-header">
        <h2>Carica Fattura</h2>
      </div>

      {!result && !uploadMutation.isPending && (
        <div
          className={`card upload-zone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{ cursor: 'pointer' }}
        >
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <Upload size={48} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
            <h3 style={{ marginBottom: '0.5rem' }}>Trascina qui il file o clicca per selezionare</h3>
            <p className="text-muted">Supporta: PDF, JPG, PNG, TIFF, BMP, WebP</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button
                className="btn btn-primary"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileRef.current?.click();
                }}
              >
                <FileText size={16} /> Seleziona File
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (fileRef.current) {
                    fileRef.current.accept = 'image/*';
                    fileRef.current.setAttribute('capture', 'environment');
                    fileRef.current.click();
                    setTimeout(() => {
                      if (fileRef.current) {
                        fileRef.current.accept = '.pdf,.jpg,.jpeg,.png,.tiff,.bmp,.webp';
                        fileRef.current.removeAttribute('capture');
                      }
                    }, 1000);
                  }
                }}
              >
                <Camera size={16} /> Scatta Foto
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.tiff,.bmp,.webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      {uploadMutation.isPending && (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <Loader size={48} className="spin" style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
            <h3>Analisi del documento in corso...</h3>
            <p className="text-muted">OCR e parsing dei dati della fattura</p>
          </div>
        </div>
      )}

      {uploadMutation.isError && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <AlertCircle size={32} style={{ color: 'var(--danger)', marginBottom: '0.5rem' }} />
            <p style={{ color: 'var(--danger)' }}>{uploadMutation.error.message}</p>
            <button className="btn btn-primary" onClick={() => uploadMutation.reset()}>
              Riprova
            </button>
          </div>
        </div>
      )}

      {result && !saved && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              Dati Estratti da: {result.file_name}
              <button
                className="btn btn-secondary"
                style={{ float: 'right' }}
                onClick={() => {
                  setResult(null);
                  uploadMutation.reset();
                  setShowNewSupplier(false);
                  setSupplierMatchInfo('');
                }}
              >
                Carica altro file
              </button>
            </div>
            <div className="card-body">
              <p className="text-muted" style={{ marginBottom: '1rem' }}>
                Verifica e correggi i dati estratti automaticamente, poi salva la fattura.
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <span className="text-muted">Affidabilità:</span>
                {Object.entries(result.confidence).map(([key, level]) => (
                  <span key={key} style={{ marginRight: '0.5rem' }}>
                    {key === 'number' ? 'Numero' : key === 'date' ? 'Data' : key === 'total_amount' ? 'Importo' : 'Fornitore'}:{' '}
                    {confBadge(level)}
                  </span>
                ))}
              </div>

              {/* Supplier match info */}
              {supplierMatchInfo && (
                <div className="alert alert-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.75rem', borderRadius: '6px', background: '#fef3c7', border: '1px solid #fbbf24' }}>
                  <Link2 size={16} /> {supplierMatchInfo}
                </div>
              )}

              {/* New supplier creation panel */}
              {showNewSupplier && (
                <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--warning)', background: '#fffbeb' }}>
                  <div className="card-body" style={{ padding: '1rem' }}>
                    <h4 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <UserPlus size={18} /> Fornitore non trovato — Vuoi crearlo?
                    </h4>
                    <div className="grid-2">
                      <div className="form-group">
                        <label>Nome Fornitore</label>
                        <input className="form-control" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>P.IVA</label>
                        <input className="form-control" value={newSupplierVat} onChange={(e) => setNewSupplierVat(e.target.value)} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => createSupplierMut.mutate({ name: newSupplierName, vat_number: newSupplierVat || undefined })}
                        disabled={!newSupplierName.trim() || createSupplierMut.isPending}
                      >
                        {createSupplierMut.isPending ? 'Creazione...' : 'Crea Fornitore'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowNewSupplier(false)}>
                        Annulla (seleziona manualmente)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveMutation.mutate();
                }}
              >
                <div className="grid-3">
                  <div className="form-group">
                    <label>Numero Fattura *</label>
                    <input className="form-control" value={number} onChange={(e) => setNumber(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Data *</label>
                    <input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>Fornitore *</label>
                    <select className="form-control" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                      <option value="">Seleziona...</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {isMaster && businesses.length > 0 && (
                  <div className="grid-2" style={{ marginBottom: '0.5rem' }}>
                    <div className="form-group">
                      <label>Negozio</label>
                      <select className="form-control" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
                        <option value="">— Nessuno —</option>
                        {businesses.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="grid-3">
                  <div className="form-group">
                    <label>Totale</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>IVA</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={vatAmount}
                      onChange={(e) => setVatAmount(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Note</label>
                    <input className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.5rem 0 0.5rem' }}>
                  <h4>Righe Fattura</h4>
                  <button type="button" className="btn btn-secondary" onClick={addItem}>
                    + Aggiungi Riga
                  </button>
                </div>

                {items.length > 0 && (
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Prodotto</th>
                          <th>Descrizione OCR</th>
                          <th>Corrisp.</th>
                          <th>Quantità</th>
                          <th>Prezzo Unit.</th>
                          <th>Totale</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <tr key={idx} style={item.match_confidence === 'low' ? { background: '#fef3c7' } : item.match_confidence === 'medium' ? { background: '#fff7ed' } : {}}>
                            <td>
                              <select
                                className="form-control"
                                value={item.product_id}
                                onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                                style={{ minWidth: 120 }}
                              >
                                <option value="">--</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                className="form-control"
                                value={item.description}
                                onChange={(e) => updateItem(idx, 'description', e.target.value)}
                                style={{ minWidth: 150 }}
                              />
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {item.match_confidence ? (
                                <span title={item.match_name ? `Associato a: ${item.match_name}` : ''}>
                                  {confBadge(item.match_confidence)}
                                </span>
                              ) : (
                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>—</span>
                              )}
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                className="form-control"
                                value={item.quantity}
                                onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                                style={{ width: 80 }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                className="form-control"
                                value={item.unit_price}
                                onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                                style={{ width: 100 }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                className="form-control"
                                value={item.total_price}
                                onChange={(e) => updateItem(idx, 'total_price', e.target.value)}
                                style={{ width: 100 }}
                              />
                            </td>
                            <td>
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => removeItem(idx)}>
                                X
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? 'Salvataggio...' : 'Salva Fattura'}
                  </button>
                </div>

                {saveMutation.isError && (
                  <p style={{ color: 'var(--danger)', marginTop: '0.5rem' }}>{saveMutation.error.message}</p>
                )}
              </form>
            </div>
          </div>

          <div className="card">
            <div className="card-header">Testo Estratto (anteprima)</div>
            <div className="card-body">
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', maxHeight: 300, overflow: 'auto', background: 'var(--gray-50)', padding: '1rem', borderRadius: 6 }}>
                {result.extracted_text}
              </pre>
            </div>
          </div>
        </>
      )}

      {saved && (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: '1rem' }} />
            <h3>Fattura salvata con successo!</h3>
            <p className="text-muted">La fattura {number} è stata registrata nel sistema.</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setResult(null);
                  setSaved(false);
                  uploadMutation.reset();
                  setShowNewSupplier(false);
                  setSupplierMatchInfo('');
                }}
              >
                Carica altra fattura
              </button>
              <a href="/invoices" className="btn btn-secondary">
                Vai alle Fatture
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
