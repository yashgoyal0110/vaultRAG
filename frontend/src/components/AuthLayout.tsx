import type { ReactNode } from 'react';
import { Logo, CheckIcon } from './icons';

const POINTS = [
  { title: 'Nothing leaves the edge', body: 'Documents, embeddings and queries stay inside Cloudflare — never OpenAI, Pinecone or AWS.' },
  { title: 'Answers you can verify', body: 'Every response is grounded in your PDFs with citations back to the source chunk.' },
  { title: 'Isolated per workspace', body: 'Hard tenant separation on every retrieval, enforced at the vector store.' },
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-split">
      <section className="auth-brand">
        <div className="brand">
          <Logo />
          <span className="wordmark"><b>Vault</b><span>RAG</span></span>
        </div>

        <div className="auth-hero">
          <h2>
            Private document Q&A,<br />
            <span className="grad">grounded and cited.</span>
          </h2>
          <p>Upload confidential PDFs and ask anything. Production-grade RAG with a single-vendor data boundary.</p>

          <ul className="auth-points">
            {POINTS.map((p) => (
              <li key={p.title}>
                <span className="check"><CheckIcon className="icon" /></span>
                <span><b>{p.title}.</b> {p.body}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-foot">Built end-to-end on Cloudflare's edge network.</div>
      </section>

      <section className="auth-main">
        <div className="auth-card">{children}</div>
      </section>
    </div>
  );
}
