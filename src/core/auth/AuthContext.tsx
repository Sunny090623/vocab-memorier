import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi, AuthUser } from '../../data/api/authApi.ts';
import { getStoredToken, setStoredToken, setOnUnauthorized } from '../../data/api/apiClient.ts';
import { syncService } from '../../data/sync/syncService.ts';
import {
  switchActiveUser,
  migrateGuestDataToUser,
  migrateLegacyDatabase,
} from '../../data/db/userDb.ts';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  allowPublicRegistration: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  refreshConfig: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState<boolean>(true);

  const refreshConfig = useCallback(async () => {
    try {
      const res = await authApi.getAuthConfig();
      if (res && typeof res.allowPublicRegistration === 'boolean') {
        setAllowPublicRegistration(res.allowPublicRegistration);
      }
    } catch {
      // 忽略配置拉取异常，默认保持开放
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (getStoredToken()) {
        await authApi.logout().catch(() => {});
      }
    } finally {
      setStoredToken(null);
      setToken(null);
      setUser(null);
      switchActiveUser(null);
      syncService.reset();
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const curToken = getStoredToken();
    if (!curToken) {
      switchActiveUser(null);
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await authApi.getMe();
      switchActiveUser(res.user.id);
      setUser(res.user);
      setToken(curToken);
      // 登录态恢复后触发一次静默同步
      syncService.triggerSync().catch(() => {});
    } catch {
      // 会话已过期或撤销
      switchActiveUser(null);
      setStoredToken(null);
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    migrateLegacyDatabase().catch(() => {});

    setOnUnauthorized(() => {
      switchActiveUser(null);
      setStoredToken(null);
      setToken(null);
      setUser(null);
      syncService.reset();
    });

    refreshConfig();
    refreshMe();
  }, [refreshConfig, refreshMe]);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
    switchActiveUser(res.user.id);
    // 登录后拉取该账户的云端数据同步到该账户本地专属库
    await syncService.triggerSync().catch(() => {});
  };

  const register = async (email: string, username: string, password: string) => {
    const res = await authApi.register(email, username, password);
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
    // 游客首次注册：将游客模式下的本地数据平滑迁移给新账户，并清空游客库
    await migrateGuestDataToUser(res.user.id);
    switchActiveUser(res.user.id);
    // 将迁入的词本同步到云端
    await syncService.triggerSync().catch(() => {});
  };

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === 'admin',
    allowPublicRegistration,
    login,
    register,
    logout,
    refreshMe,
    refreshConfig,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

