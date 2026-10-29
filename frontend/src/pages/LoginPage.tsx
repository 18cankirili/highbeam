// FILE: frontend/src/pages/LoginPage.tsx
import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface LoginPageProps {
  onSwitchToRegister: () => void;
}

export function LoginPage({ onSwitchToRegister }: LoginPageProps) {
  const { login } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
      toast.success('Giriş başarılı! Highbeam\'e hoş geldiniz.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Giriş başarısız';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="logo">
          <img src="/logo.svg" alt="Highbeam" />
          <h1>Highbeam</h1>
        </div>
        <h2>Tekrar Hoş Geldiniz!</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Kullanıcı Adı</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Kullanıcı adınızı girin"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Parola</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parolanızı girin"
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
        </form>

        <div className="form-footer">
          Hesabınız yok mu?{' '}
          <a onClick={onSwitchToRegister} role="button" tabIndex={0}>
            Kayıt Olun
          </a>
        </div>
      </div>
    </div>
  );
}
