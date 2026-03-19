import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '@/lib/api';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet('/auth/status')
      .then((data) => {
        if (cancelled) return;
        setIsAuthenticated(data.authenticated ?? false);
        setNeedsSetup(data.needsSetup ?? false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (password) => {
    const data = await apiPost('/auth/login', { password });
    setIsAuthenticated(true);
    setNeedsSetup(false);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await apiPost('/auth/logout');
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, needsSetup, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
