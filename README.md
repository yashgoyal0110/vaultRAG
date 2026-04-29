# VaultRAG

**Privacy-first document Q&A — built end-to-end on Cloudflare's edge.**

Upload your PDFs. Ask questions. Get answers grounded in your documents with verifiable citations. No data ever leaves Cloudflare's network — not to OpenAI, not to Pinecone, not to AWS.

| Resource           | Link                                                                 |
|--------------------|----------------------------------------------------------------------|
| 🌐 Live Demo        | https://vaultrag-frontend.pages.dev                                 |
| 🎥 2-min Walkthrough | https://www.loom.com/share/9d307bc4f47040668cc92c50b9711800        |
| 📦 GitHub Code      | https://github.com/yashgoyal0110/vaultRAG                           |

---

## The Business Problem

Small and mid-sized law firms, healthcare clinics, financial advisors, and enterprise compliance teams have a real problem:

> They need AI document search, but they legally cannot send confidential documents to OpenAI, Anthropic, or any third-party AI provider.

The current options are all bad:

| Option | Problem |
|---|---|
| **OpenAI + Pinecone** (the default RAG stack) | Documents and queries flow through US-based AI providers. Disqualifying for HIPAA, attorney-client privilege, GDPR-sensitive workflows. |
| **Self-hosted PrivateGPT / LlamaIndex** | Requires GPU infrastructure, devops expertise, and constant maintenance. Not viable for a 30-person law firm. |
| **Enterprise platforms (Glean, Microsoft Copilot)** | Priced for Fortune 500 budgets. Multi-month procurement. Still routes data through external clouds. |
| **"Just don't use AI"** | Competitors who do are pulling ahead. |

**VaultRAG closes that gap.** It delivers production-grade RAG with the same UX as ChatPDF or Notion AI, but every byte of customer data — documents, embeddings, queries, generated answers — stays inside Cloudflare's network. No third-party AI provider ever sees a customer document.

This is only possible because Cloudflare offers the entire AI stack — inference (Workers AI), vector storage (Vectorize), object storage (R2), and a managed gateway (AI Gateway) — at the edge. Two years ago, this architecture wasn't buildable. Today it is.

---

## Why Cloudflare Is Core to This Project

VaultRAG is not "an app hosted on Cloudflare." It is an architecture that **only works because of Cloudflare's full edge stack**. Swap any of the core products and the privacy story collapses.

### The full Cloudflare product surface used

| Product | Role in VaultRAG | Why it matters |
|---|---|---|
| **Cloudflare Workers** | API backend, RAG orchestration, auth middleware | Stateless edge compute; the entire backend logic runs in <50ms cold starts |
| **Workers AI** | BGE embeddings (`@cf/baai/bge-base-en-v1.5`) + Llama 3.1 8B inference (`@cf/meta/llama-3.1-8b-instruct`) | All AI inference happens on Cloudflare's GPU fleet — no OpenAI, no Anthropic, no third-party model calls |
| **Vectorize** | 768-dimensional vector store with metadata-indexed tenant isolation | The semantic retrieval engine; queries filter on indexed `tenant_id` for hard isolation |
| **R2** | Tenant-prefixed PDF storage (`<tenant_id>/<doc_id>.pdf`) | Zero-egress object storage — documents stay inside Cloudflare with no per-byte egress fees |
| **D1** | Multi-tenant SQL — users, documents, chunks, chats, messages, audit log | Serverless SQLite with tenant-scoped queries on every read/write |
| **AI Gateway** | Observability, caching, and request logging for every Workers AI call | Compliance teams get a full audit trail of model invocations |
| **KV** | Semantic answer cache + session metadata | Sub-10ms cache hits eliminate redundant LLM calls |
| **Pages** | React frontend hosting with global CDN distribution | Single-deploy SPA with edge-cached static assets |
| **CDN + Cache API** | Edge caching of frontend assets and idempotent API responses | Sub-50ms TTFB globally without origin hits |
| **Workers Secrets** | Encrypted JWT signing key | Auth secrets never live in source or environment files |

That's **10 distinct Cloudflare products** doing structural work. The CDN is part of the stack but is not the headline — every Worker, every Vectorize query, every R2 read benefits from Cloudflare's global network by default. The deeper products (Workers AI, Vectorize, AI Gateway) are what make the privacy architecture possible.

### What was actually built

A complete, deployed multi-tenant SaaS:

1. **Multi-tenant authentication** — email/password signup with PBKDF2 (100k iterations), per-user salts, constant-time comparison, JWT issuance using HMAC-SHA256 via Web Crypto API. Tokens carry `tenant_id` + `user_id` and are verified at the edge before any data access.
2. **Tenant-scoped document ingestion** — PDF upload → R2 (tenant-prefixed key) → text extraction via `unpdf` → sentence-aware chunking with overlap → batch embedding via Workers AI → upsert to Vectorize with `tenant_id` in indexed metadata → chunk text persisted in D1.
3. **Privacy-preserving RAG pipeline** — query embedding → tenant-filtered Vectorize search → D1 chunk retrieval (with redundant `tenant_id` checks) → context-grounded prompt → Llama 3.1 8B inference via AI Gateway → cited answer.
4. **Tenant isolation by construction** — every database query, every Vectorize search, every R2 read is automatically scoped by the `tenant_id` extracted from the verified JWT. The isolation is enforced at four layers: JWT signature, R2 key prefix, Vectorize metadata filter, and SQL `WHERE tenant_id = ?`. Bypassing one layer hits the next.
5. **Compliance-ready audit log** — every authentication event, document upload, RAG query, and deletion logged to D1 with tenant ID, user ID, IP, user agent, and structured metadata.
6. **Semantic answer cache** — repeated questions return cached answers from KV in <10ms instead of re-running the LLM, with tenant-namespaced cache keys preventing cross-tenant cache pollution.

---

## Security & Enterprise-Readiness

VaultRAG is built for the kind of organization that actually cares about where their data goes.

### Tenant isolation at four layers

This is the headline security property. Tenant A cannot see Tenant B's data, and the isolation is enforced redundantly:

1. **JWT layer** — `tenant_id` is signed into the token by the server. Clients cannot forge or tamper with it without breaking the HMAC signature.
2. **Storage layer (R2)** — every PDF is stored under the key `<tenant_id>/<doc_id>.pdf`. Different tenants land in different keyspaces.
3. **Vector layer (Vectorize)** — every vector is upserted with `tenant_id` as indexed metadata. Every retrieval query includes `filter: { tenant_id: { $eq: <id> } }`.
4. **SQL layer (D1)** — every query against documents, chunks, chats, and messages includes `WHERE tenant_id = ?` using the JWT-derived tenant ID.

If one layer is bypassed (say, a bug in a SQL query), the layer above or below still prevents data leakage.

### Authentication hardening

- Passwords hashed with **PBKDF2-SHA256** at 100k iterations with per-user 128-bit random salts
- Constant-time comparison to prevent timing attacks
- Identical error messages for "wrong email" vs "wrong password" — no user enumeration
- JWTs signed with HMAC-SHA256, 7-day expiry, server-side secret rotated via `wrangler secret put`
- All failed login attempts captured in audit log with IP and user agent

### Data sovereignty

Documents, embeddings, queries, and generated answers all flow through **Cloudflare's network only**. The Llama 3.1 model that generates answers runs on Cloudflare's GPU fleet — not OpenAI's, not AWS Bedrock's. For an industry that requires data residency guarantees (legal, healthcare, EU GDPR-sensitive workflows), this is the difference between "we cannot use AI" and "we can use AI compliantly."

### Audit log

Every sensitive action is captured:
- Auth events (signup, login, login_failed)
- Document operations (uploaded, deleted, processing_failed)
- RAG queries (with question length, citation count, cache hit status)
- All entries indexed by `tenant_id` and timestamp for compliance review

---

## How VaultRAG Compares

| | OpenAI + Pinecone | Self-hosted (PrivateGPT) | AWS Bedrock + OpenSearch | **VaultRAG** |
|---|---|---|---|---|
| Data leaves your provider boundary | Yes, to OpenAI | No | Stays in AWS | **No, all on Cloudflare** |
| Setup time | Hours | Days, plus GPU infra | Days | **Minutes (one Worker deploy)** |
| Per-tenant data isolation | DIY | DIY | DIY | **Built into the architecture** |
| Cost at small scale | Per-token + Pinecone subscription | GPU hosting bills | EC2 + OpenSearch + Bedrock | **Free tier covers small workloads** |
| Cold start | N/A (always-on backend) | N/A | Slow Lambda cold starts | **Sub-50ms edge cold starts** |
| Compliance posture | Hard | Manual | AWS-shared-responsibility | **Single-vendor data boundary** |

---

## Differentiators

What makes VaultRAG distinct from the dozens of "I built a RAG app" projects:

- **Single-vendor data boundary.** Most "private" RAG projects still call out to OpenAI for inference. VaultRAG runs Llama 3.1 inside Cloudflare. The privacy story is end-to-end, not partial.
- **True multi-tenancy.** Most demo RAG apps have one user. VaultRAG enforces tenant isolation at four redundant layers — provable in the demo by signing into two tenants and seeing strict data segregation.
- **Production-grade auth.** PBKDF2, constant-time compare, anti-enumeration, JWT with proper exp claims. Not a "trust the email header" toy.
- **Audit log built in.** Every sensitive action recorded for compliance review. Most demos skip this.
- **Semantic caching.** Repeated queries hit a tenant-namespaced KV cache for sub-10ms responses, demonstrating real platform fluency.
- **AI Gateway observability.** Every model call is logged, timed, and inspectable in the Cloudflare dashboard. A compliance team can see exactly what was sent to the model and what came back.

---

## Architecture

See `./architecture.png` (or the diagram in this README) for the full data flow.