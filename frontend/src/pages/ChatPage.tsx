import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { Chat, Message } from '../lib/types';
import { PlusIcon, SparkIcon, AlertIcon } from '../components/icons';

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
    <div className="chat-layout">
      {/* Chat list */}
      <div className="chat-list">
        <button onClick={handleNewChat} className="btn-secondary" style={{ width: '100%', marginBottom: 14 }}>
          <PlusIcon /> New chat
        </button>
        <div className="nav-section-title" style={{ padding: 0, marginBottom: 8 }}>Recent</div>
        {chats.length === 0 ? (
          <div className="dim" style={{ fontSize: 12, padding: '0 11px' }}>No chats yet</div>
        ) : (
          chats.map(c => (
            <div
              key={c.id}
              onClick={() => setActiveChatId(c.id)}
              className={`chat-item ${activeChatId === c.id ? 'active' : ''}`}
            >
              <span className="chat-title">{c.title}</span>
              <button
                className="chat-x"
                onClick={(e) => { e.stopPropagation(); handleDeleteChat(c.id); }}
                title="Delete conversation"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* Active chat */}
      <div className="chat-container">
        {error && <div className="error-msg"><AlertIcon /> <span>{error}</span></div>}

        <div className="chat-messages">
          {messages.length === 0 && !sending ? (
            <div className="chat-empty">
              <div>
                <div className="empty-icon"><SparkIcon /></div>
                <h3>Ask anything about your documents</h3>
                <p>Answers are grounded in your uploaded PDFs and never leave Cloudflare's network.</p>
              </div>
            </div>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`message ${m.role}`}>
                <div className="msg-avatar">{m.role === 'user' ? 'You' : <SparkIcon className="icon" />}</div>
                <div className="msg-body">
                  <div className="role">{m.role === 'user' ? 'You' : 'VaultRAG'}</div>
                  <div className="content">{m.content}</div>
                  {m.citations.length > 0 && (
                    <div className="citations">
                      <div className="citations-header">Sources · {m.citations.length}</div>
                      {m.citations.map(cit => (
                        <div key={cit.chunkId} className="citation">
                          <div className="citation-source">
                            <span className="cite-num">{cit.index}</span>
                            {cit.filename}
                            <span className="dim" style={{ fontSize: 11 }}>
                              chunk {cit.chunkIndex} · {(cit.score * 100).toFixed(0)}% match
                            </span>
                          </div>
                          <div className="preview">{cit.preview}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="message assistant">
              <div className="msg-avatar"><SparkIcon className="icon" /></div>
              <div className="msg-body">
                <div className="role">VaultRAG</div>
                <div className="content" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="typing"><span /><span /><span /></span>
                  <span className="muted">Searching documents and thinking…</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="composer">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents…  (Enter to send, Shift+Enter for newline)"
            disabled={sending}
          />
          <button className="btn-primary" onClick={handleSend} disabled={sending || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
