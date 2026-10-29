// FILE: frontend/src/App.tsx
import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { VoiceProvider } from './context/VoiceContext';
import { ToastProvider } from './context/ToastContext';
import { ToastContainer } from './components/ToastContainer';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AppPage } from './pages/AppPage';

type Page = 'login' | 'register';

function AppInner() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<Page>('login');

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span style={{ color: 'var(--text-muted)' }}>Highbeam Yükleniyor…</span>
      </div>
    );
  }

  if (!user) {
    if (page === 'register') {
      return <RegisterPage onSwitchToLogin={() => setPage('login')} />;
    }
    return <LoginPage onSwitchToRegister={() => setPage('register')} />;
  }

  return (
    <WebSocketProvider>
      <VoiceProvider>
        <AppPage />
      </VoiceProvider>
    </WebSocketProvider>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppInner />
        <ToastContainer />
      </AuthProvider>
    </ToastProvider>
  );
}
