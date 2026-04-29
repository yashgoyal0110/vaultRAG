import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { Chat, Message } from '../lib/types';

export function ChatPage() {
  const { token } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat list on mount
  useEffect(() => {
    if (!token) return;
    api.listChats(token).then(res => {
      setChats(res.chats);
      if (res.chats.length > 0 && !activeChatId) {
        setActiveChatId(res.chats[0].id);
      }
    }).catch(e => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load messages when active chat changes
  useEffect(() => {
    if (!token || !activeChatId) {
      setMessages([]);
      return;
    }
    api.getChat(token, activeChatId).then(res => {
      setMessages(res.messages);
    }).catch(e => setError(e.message));
  }, [token, activeChatId]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleNewChat() {
    if (!token) return;
    try {
      const chat = await api.createChat(token);
      setChats([chat, ...chats]);
      setActiveChatId(chat.id);
      setMessages([]);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleSend() {
    if (!token || !input.trim() || sending) return;

    let chatId = activeChatId;
    if (!chatId) {
      try {
        const chat = await api.createChat(token);
        setChats([chat, ...chats]);
        setActiveChatId(chat.id);
        chatId = chat.id;
      } catch (e: any) {
        setError(e.message);
        return;
      }
    }

    const question = input.trim();
    setInput('');
    setSending(true);
    setError(null);

    // Optimistic user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: question,
      citations: [],
      created_at: Date.now(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await api.ask(token, chatId, question);
      const assistantMsg: Message = {
        id: res.messageId,
        role: 'assistant',
        content: res.answer,
        citations: res.citations,
        created_at: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Refresh chat list to update title (if it was the first message)
      const refreshed = await api.listChats(token);
      setChats(refreshed.chats);
    } catch (e: any) {
      setError(e.message || 'Request failed');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteChat(id: string) {
    if (!token) return;
    if (!confirm('Delete this conversation?')) return;
    try {
      await api.deleteChat(token, id);
      const remaining = chats.filter(c => c.id !== id);
      setChats(remaining);
      if (activeChatId === id) {
        setActiveChatId(remaining[0]?.id || null);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, height: 'calc(100vh - 48px)' }}>
      {/* Chat list */}
      <div style={{ borderRight: '1px solid var(--border-subtle)', paddingRight: 16, overflowY: 'auto' }}>
        <button
          onClick={handleNewChat}
          className="btn-secondary"
          style={{ width: '100%', marginBottom: 12 }}
        >
          + New chat
        </button>
        <div className="nav-section-title" style={{ padding: 0, marginBottom: 8 }}>Recent</div>
        {chats.length === 0 ? (
          <div className="dim" style={{ fontSize: 12 }}>No chats yet</div>
        ) : (
          chats.map(c => (
            <div
              key={c.id}
              onClick={() => setActiveChatId(c.id)}
              className={`nav-link ${activeChatId === c.id ? 'active' : ''}`}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {c.title}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteChat(c.id); }}
                style={{ color: 'var(--text-dim)', fontSize: 11, padding: '0 4px' }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* Active chat */}
      <div className="chat-container">
        {error && <div className="error-msg">{error}</div>}

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <div>
                <h3>Ask anything about your documents</h3>
                <p>Answers are grounded in your uploaded PDFs and never leave Cloudflare's network.</p>
              </div>
            </div>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`message ${m.role}`}>
                <div className="role">{m.role === 'user' ? 'You' : 'VaultRAG'}</div>
                <div className="content">{m.content}</div>
                {m.citations.length > 0 && (
                  <div className="citations">
                    <div className="citations-header">Sources ({m.citations.length})</div>
                    {m.citations.map(cit => (
                      <div key={cit.chunkId} className="citation">
                        <div className="citation-source">
                          [{cit.index}] {cit.filename}
                          <span className="dim" style={{ marginLeft: 8, fontSize: 11 }}>
                            chunk {cit.chunkIndex} • {(cit.score * 100).toFixed(0)}% match
                          </span>
                        </div>
                        <div>{cit.preview}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="message">
              <div className="role">VaultRAG</div>
              <div className="content"><span className="spinner" /> <span style={{ marginLeft: 8 }} className="muted">Searching documents and thinking…</span></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="composer">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents… (Enter to send, Shift+Enter for newline)"
            disabled={sending}
          />
          <button className="btn-primary" style={{ width: 'auto', padding: '0 18px' }} onClick={handleSend} disabled={sending || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
