import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStoredTheme,
  applyThemeToDom,
  THEME_STORAGE_KEY,
} from '../../src/hooks/useTheme.ts';

describe('Theme Persistence and Management', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system when no theme is stored in localStorage', () => {
    expect(getStoredTheme()).toBe('system');
  });

  it('reads stored dark theme from localStorage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('reads stored light theme from localStorage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(getStoredTheme()).toBe('light');
  });

  it('ignores invalid values in localStorage and falls back to system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'invalid_mode');
    expect(getStoredTheme()).toBe('system');
  });

  it('applies dark theme to document.documentElement data-theme attribute', () => {
    const applied = applyThemeToDom('dark');
    expect(applied).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('applies light theme to document.documentElement data-theme attribute', () => {
    const applied = applyThemeToDom('light');
    expect(applied).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('resolves system mode based on matchMedia preference', () => {
    // Mock matchMedia returning matches: true for dark mode
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMediaMock);

    const appliedDark = applyThemeToDom('system');
    expect(appliedDark).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Mock matchMedia returning matches: false for light mode
    matchMediaMock.mockImplementation((_query: string) => ({
      matches: false,
      media: _query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const appliedLight = applyThemeToDom('system');
    expect(appliedLight).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    vi.unstubAllGlobals();
  });
});

