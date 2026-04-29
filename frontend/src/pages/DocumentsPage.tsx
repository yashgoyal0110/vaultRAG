import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { Document } from '../lib/types';

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DocumentsPage() {
  const { token } = useAuth();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.listDocuments(token);
      setDocs(res.documents);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File must be smaller than 10 MB');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await api.uploadDocument(token, file);
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    if (!confirm('Delete this document and all its embeddings?')) return;
    try {
      await api.deleteDocument(token, id);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Documents</h2>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="upload-input"
            onChange={handleUpload}
          />
          <button
            className="btn-primary"
            style={{ width: 'auto', padding: '9px 18px' }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <span className="spinner" style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Processing…
              </>
            ) : (
              'Upload PDF'
            )}
          </button>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading documents…</div>
      ) : docs.length === 0 ? (
        <div className="empty-state">
          <p>No documents yet</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>
            Upload a PDF to start asking questions
          </p>
        </div>
      ) : (
        <div className="doc-grid">
          {docs.map(doc => (
            <div key={doc.id} className="doc-card">
              <div>
                <div className="filename">{doc.filename}</div>
                <div className="meta">
                  {formatBytes(doc.size_bytes)}
                  {doc.page_count != null && ` • ${doc.page_count} pages`}
                  {doc.chunk_count > 0 && ` • ${doc.chunk_count} chunks`}
                  {' • '}
                  {formatDate(doc.created_at)}
                </div>
                {doc.error_message && (
                  <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>
                    {doc.error_message}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`status-pill ${doc.status}`}>{doc.status}</span>
                <button className="btn-danger" onClick={() => handleDelete(doc.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
