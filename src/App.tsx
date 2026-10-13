import React, { useEffect } from 'react';
import { NavigationShell } from './ui/components/NavigationShell.tsx';
import { ToastProvider } from './ui/components/Toast.tsx';
import { ThemeProvider } from './hooks/useTheme.ts';
import { AppRoutes } from './router.tsx';
import { ensureDictionaryLoaded } from './data/dictLoader.ts';

import { AuthProvider } from './core/auth/AuthContext.tsx';

export const App: React.FC = () => {
  useEffect(() => {
    // 应用启动时静默准备词典数据
    ensureDictionaryLoaded().catch((err) => {
      console.warn('Dictionary background preload warning:', err);
    });
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <NavigationShell>
            <AppRoutes />
          </NavigationShell>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};