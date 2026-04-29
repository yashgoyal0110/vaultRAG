export type User = {
  id: string;
  email: string;
  tenantId: string;
};

export type Tenant = {
  id: string;
  name: string;
  plan?: string;
};

export type AuthResponse = {
  token: string;
  user: User;
  tenant: Tenant;
};

export type Document = {
  id: string;
  filename: string;
  size_bytes: number;
  page_count: number | null;
  chunk_count: number;
  status: 'processing' | 'ready' | 'failed';
  error_message: string | null;
  created_at: number;
  processed_at: number | null;
};

export type Chat = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
};

export type Citation = {
  index: number;
  chunkId: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  score: number;
  preview: string;
};

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  created_at: number;
};
