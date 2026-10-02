import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { UploadPhase } from '../lib/api';
import type { Document } from '../lib/types';
import { DocIcon, UploadIcon, TrashIcon, AlertIcon } from '../components/icons';

type UploadProgress = {
  filename: string;
  phase: UploadPhase;
  percent: number;
};

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
  const [progress, setProgress] = useState<UploadProgress | null>(null);
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
    setProgress({ filename: file.name, phase: 'uploading', percent: 0 });
    try {
      await api.uploadDocument(token, file, (phase, percent) => {
        setProgress({ filename: file.name, phase, percent });
      });
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(null);
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
        <div>
          <h2>Documents</h2>
          <div className="page-sub">
            {docs.length > 0
              ? `${docs.length} document${docs.length === 1 ? '' : 's'} in this workspace`
              : 'Upload PDFs to make them searchable'}
          </div>
        </div>
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
            style={{ width: 'auto' }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <><span className="spinner" /> Processing…</>
            ) : (
              <><UploadIcon /> Upload PDF</>
            )}
          </button>
        </div>
      </div>

      {error && <div className="error-msg"><AlertIcon /> <span>{error}</span></div>}

      {progress && (
        <div className="upload-progress-card">
          <div className="upload-progress-head">
            <span className="filename"><DocIcon /> {progress.filename}</span>
            <span className="status-pill processing">
              {progress.phase === 'uploading' ? `Uploading ${progress.percent}%` : 'Ingesting'}
            </span>
          </div>
          <div className={`progress-track ${progress.phase === 'ingesting' ? 'indeterminate' : ''}`}>
            <div
              className="progress-fill"
              style={progress.phase === 'uploading' ? { width: `${progress.percent}%` } : undefined}
            />
          </div>
          <div className="upload-progress-label">
            {progress.phase === 'uploading'
              ? 'Uploading file…'
              : 'Extracting text, chunking and embedding — this can take a moment.'}
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading documents…</div>
      ) : docs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><DocIcon /></div>
          <p className="title">No documents yet</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>
            Upload a PDF to start asking questions grounded in your own content.
          </p>
        </div>
      ) : (
        <div className="doc-grid">
          {docs.map(doc => (
            <div key={doc.id} className="doc-card">
              <div className="doc-icon"><DocIcon /></div>
              <div style={{ minWidth: 0 }}>
                <div className="filename">{doc.filename}</div>
                <div className="meta">
                  <span>{formatBytes(doc.size_bytes)}</span>
                  {doc.page_count != null && <><span className="sep">·</span><span>{doc.page_count} pages</span></>}
                  {doc.chunk_count > 0 && <><span className="sep">·</span><span>{doc.chunk_count} chunks</span></>}
                  <span className="sep">·</span><span>{formatDate(doc.created_at)}</span>
                </div>
                {doc.error_message && (
                  <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 5 }}>
                    {doc.error_message}
                  </div>
                )}
              </div>
              <div className="doc-actions">
                <span className={`status-pill ${doc.status}`}>{doc.status}</span>
                <button className="btn-danger" onClick={() => handleDelete(doc.id)} title="Delete document">
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
