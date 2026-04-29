import type { AuthResponse, Chat, Citation, Document, Message } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch {}
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ----- Auth -----
export const api = {
  signup: (email: string, password: string, organizationName: string) =>
    request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, organizationName }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: (token: string) =>
    request<{ user: { id: string; email: string }; tenant: { id: string; name: string; plan: string } }>(
      '/me',
      {},
      token
    ),

  // ----- Documents -----
  listDocuments: (token: string) =>
    request<{ documents: Document[] }>('/documents', {}, token),

  uploadDocument: (token: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<{
      id: string;
      filename: string;
      sizeBytes: number;
      chunkCount: number;
      pageCount: number;
      status: string;
    }>('/documents', { method: 'POST', body: fd }, token);
  },

  deleteDocument: (token: string, id: string) =>
    request<{ success: boolean }>(`/documents/${id}`, { method: 'DELETE' }, token),

  // ----- Chats -----
  createChat: (token: string) =>
    request<Chat>('/chats', { method: 'POST', body: '{}' }, token),

  listChats: (token: string) =>
    request<{ chats: Chat[] }>('/chats', {}, token),

  getChat: (token: string, id: string) =>
    request<{ chat: Chat; messages: Message[] }>(`/chats/${id}`, {}, token),

  deleteChat: (token: string, id: string) =>
    request<{ success: boolean }>(`/chats/${id}`, { method: 'DELETE' }, token),

  ask: (token: string, chatId: string, question: string) =>
    request<{
      messageId: string;
      answer: string;
      citations: Citation[];
      cacheHit: boolean;
    }>(
      `/chats/${chatId}/ask`,
      { method: 'POST', body: JSON.stringify({ question }) },
      token
    ),
};

export { ApiError };
