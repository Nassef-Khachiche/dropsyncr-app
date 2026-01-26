import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

interface User {
  id: number;
  email: string;
  name: string;
  role?: string;
  isGlobalAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load token from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedUser) {
      const parsedUser = JSON.parse(storedUser);
      // Ensure isGlobalAdmin is a boolean
      if (parsedUser) {
        parsedUser.isGlobalAdmin = Boolean(parsedUser.isGlobalAdmin || parsedUser.isGlobalAdmin === 1 || parsedUser.isGlobalAdmin === '1');
      }
      setToken(storedToken);
      setUser(parsedUser);
      // Verify token is still valid (this will update user with fresh data)
      verifyToken(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (tokenToVerify: string) => {
    try {
      const data = await api.verify();
      // Ensure isGlobalAdmin is a boolean
      const userData = {
        ...data.user,
        isGlobalAdmin: Boolean(data.user?.isGlobalAdmin)
      };
      setUser(userData);
      setToken(tokenToVerify);
      // Update localStorage with fresh user data (including isGlobalAdmin)
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('token', tokenToVerify); // Ensure token is stored
    } catch (error) {
      console.error('Token verification failed:', error);
      // Clear invalid token and user data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password);
    // Ensure isGlobalAdmin is a boolean
    const userData = {
      ...data.user,
      isGlobalAdmin: Boolean(data.user?.isGlobalAdmin)
    };
    // Store token and user in localStorage first
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Verify the token works immediately after login
    try {
      const verifyData = await api.verify();
      // Update with fresh user data from verification
      const verifiedUserData = {
        ...verifyData.user,
        isGlobalAdmin: Boolean(verifyData.user?.isGlobalAdmin)
      };
      localStorage.setItem('user', JSON.stringify(verifiedUserData));
      setToken(data.token);
      setUser(verifiedUserData);
    } catch (error) {
      console.error('Token verification after login failed:', error);
      // If verification fails, still set the token (might be a temporary issue)
      setToken(data.token);
      setUser(userData);
      throw new Error('Login successful but token verification failed. Please try again.');
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!user && !!token,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

