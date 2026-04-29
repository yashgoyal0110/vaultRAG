import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Tenant, User } from './types';
import { api } from './api';

type AuthState = {
  token: string | null;
  user: User | null;
  tenant: Tenant | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, organizationName: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'vaultrag_auth';

function loadFromStorage(): { token: string; user: User; tenant: Tenant } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveToStorage(data: { token: string; user: User; tenant: Tenant }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    tenant: null,
    loading: true,
  });

  useEffect(() => {
    const stored = loadFromStorage();
    if (stored) {
      // Verify token is still valid
      api
        .me(stored.token)
        .then(() => {
          setState({
            token: stored.token,
            user: stored.user,
            tenant: stored.tenant,
            loading: false,
          });
        })
        .catch(() => {
          clearStorage();
          setState({ token: null, user: null, tenant: null, loading: false });
        });
    } else {
      setState({ token: null, user: null, tenant: null, loading: false });
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    saveToStorage({ token: res.token, user: res.user, tenant: res.tenant });
    setState({
      token: res.token,
      user: res.user,
      tenant: res.tenant,
      loading: false,
    });
  };

  const signup = async (email: string, password: string, organizationName: string) => {
    const res = await api.signup(email, password, organizationName);
    saveToStorage({ token: res.token, user: res.user, tenant: res.tenant });
    setState({
      token: res.token,
      user: res.user,
      tenant: res.tenant,
      loading: false,
    });
  };

  const logout = () => {
    clearStorage();
    setState({ token: null, user: null, tenant: null, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
