// FILE: frontend/src/pages/RegisterPage.tsx
import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface RegisterPageProps {
  onSwitchToLogin: () => void;
}

export function RegisterPage({ onSwitchToLogin }: RegisterPageProps) {
  const { register } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(username, email, password);
      toast.success('Hesabınız oluşturuldu! Highbeam\'e hoş geldiniz.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kayıt başarısız';
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
        <h2>Yeni Bir Hesap Oluşturun</h2>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="reg-username">Kullanıcı Adı</label>
            <input
              id="reg-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Kullanıcı adı (3-32 karakter)"
              minLength={3}
              maxLength={32}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">E-posta</label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-posta adresiniz"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">Parola</label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 6 karakterli parola"
              minLength={6}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Hesap oluşturuluyor…' : 'Hesap Oluştur'}
          </button>
        </form>

        <div className="form-footer">
          Zaten bir hesabınız var mı?{' '}
          <a onClick={onSwitchToLogin} role="button" tabIndex={0}>
            Giriş Yapın
          </a>
        </div>
      </div>
    </div>
  );
}
