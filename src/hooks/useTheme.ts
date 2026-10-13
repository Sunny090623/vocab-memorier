import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  mode: ThemeMode;
  actualTheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

export const THEME_STORAGE_KEY = 'vocab_theme';

export function getStoredTheme(): ThemeMode {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'light' || val === 'dark' || val === 'system') {
      return val;
    }
  } catch {}
  return 'system';
}

export function applyThemeToDom(mode: ThemeMode): 'light' | 'dark' {
  const isDark =
    mode === 'dark' ||
    (mode === 'system' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  const resolved = isDark ? 'dark' : 'light';
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', resolved);
  }
  return resolved;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const initial = getStoredTheme();
    applyThemeToDom(initial);
    return initial;
  });

  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>(() => {
    return applyThemeToDom(getStoredTheme());
  });

  const setMode = useCallback((newMode: ThemeMode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch {}
    setModeState(newMode);
    const resolved = applyThemeToDom(newMode);
    setActualTheme(resolved);
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(actualTheme === 'dark' ? 'light' : 'dark');
  }, [actualTheme, setMode]);

  useEffect(() => {
    const resolved = applyThemeToDom(mode);
    setActualTheme(resolved);

    if (mode === 'system' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => {
        const res = applyThemeToDom('system');
        setActualTheme(res);
      };
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
      } else if ('addListener' in mediaQuery) {
        (mediaQuery as { addListener: (cb: () => void) => void; removeListener: (cb: () => void) => void }).addListener(listener);
        return () => (mediaQuery as { addListener: (cb: () => void) => void; removeListener: (cb: () => void) => void }).removeListener(listener);
      }
    }
  }, [mode]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const val = e.newValue as ThemeMode;
        if (val === 'light' || val === 'dark' || val === 'system') {
          setModeState(val);
          setActualTheme(applyThemeToDom(val));
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const value = useMemo(
    () => ({ mode, actualTheme, setMode, toggleTheme }),
    [mode, actualTheme, setMode, toggleTheme]
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    const initial = getStoredTheme();
    const resolved = applyThemeToDom(initial);
    return {
      mode: initial,
      actualTheme: resolved,
      setMode: (newMode: ThemeMode) => {
        try {
          localStorage.setItem(THEME_STORAGE_KEY, newMode);
        } catch {}
        applyThemeToDom(newMode);
      },
      toggleTheme: () => {
        const current = getStoredTheme();
        const next = current === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {}
        applyThemeToDom(next);
      },
    };
  }
  return context;
}