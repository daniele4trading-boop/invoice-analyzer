import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { api, setToken, clearToken } from '../api/client';
import type { UserMe, Business } from '../types';

interface AuthContextType {
  user: UserMe | null;
  businesses: Business[];
  selectedBusinessId: number | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  selectBusiness: (id: number | null) => void;
  refreshUser: () => Promise<UserMe | null>;
  refreshBusinesses: () => Promise<void | Business[]>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserMe | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const u = await api.get<UserMe>('/api/auth/me');
      setUser(u);
      if (u.role === 'store_manager' && u.business_id) {
        setSelectedBusinessId(u.business_id);
      }
      return u;
    } catch {
      setUser(null);
      clearToken();
      return null;
    }
  };

  const fetchBusinesses = async () => {
    try {
      const list = await api.get<Business[]>('/api/auth/businesses');
      setBusinesses(list);
    } catch {
      setBusinesses([]);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      Promise.all([fetchUser(), fetchBusinesses()]).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ access_token: string }>('/api/auth/login', { email, password });
    setToken(res.access_token);
    const u = await fetchUser();
    await fetchBusinesses();
    if (u && u.role === 'store_manager' && u.business_id) {
      setSelectedBusinessId(u.business_id);
    }
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setBusinesses([]);
    setSelectedBusinessId(null);
  };

  const selectBusiness = (id: number | null) => {
    if (user?.role === 'master') {
      setSelectedBusinessId(id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        businesses,
        selectedBusinessId,
        loading,
        login,
        logout,
        selectBusiness,
        refreshUser: fetchUser,
        refreshBusinesses: fetchBusinesses,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
