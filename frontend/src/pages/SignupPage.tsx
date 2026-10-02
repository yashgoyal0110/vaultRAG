import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AuthLayout } from '../components/AuthLayout';
import { AlertIcon } from '../components/icons';

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await signup(email, password, organizationName);
      navigate('/documents');
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <h1>Create your workspace</h1>
      <p className="subtitle">Private document Q&A. Your data stays on Cloudflare's edge.</p>

      {error && <div className="error-msg"><AlertIcon /> <span>{error}</span></div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Organization name</label>
          <input
            type="text"
            required
            placeholder="Acme Inc"
            value={organizationName}
            onChange={e => setOrganizationName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Work email</label>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <small className="dim" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
            At least 8 characters
          </small>
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? <><span className="spinner" /> Creating account…</> : 'Create workspace'}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
