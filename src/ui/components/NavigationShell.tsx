import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTheme } from '../../hooks/useTheme.ts';

export const NavigationShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { actualTheme, toggleTheme } = useTheme();
  const navItems = [
    { to: '/decks', label: '单词本', icon: 'style' },
    { to: '/import', label: '导入', icon: 'upload_file' },
    { to: '/settings', label: '设置', icon: 'settings' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      {/* Desktop Navigation Rail */}
      <nav
        className="desktop-rail"
        style={{
          width: '88px',
          borderRight: '1px solid var(--md-sys-color-outline-variant)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px 0',
          gap: '16px',
          flexShrink: 0,
        }}
      >
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-rounded" style={{ fontSize: '32px', color: 'var(--md-sys-color-primary)' }}>
            school
          </span>
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textDecoration: 'none',
              gap: '4px',
              padding: '8px 12px',
              borderRadius: 'var(--md-sys-shape-corner-large)',
              backgroundColor: isActive ? 'var(--md-sys-color-primary-container)' : 'transparent',
              color: isActive ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-secondary)',
              transition: 'all 0.15s ease',
            })}
          >
            <span className="material-symbols-rounded">{item.icon}</span>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{item.label}</span>
          </NavLink>
        ))}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button
            onClick={toggleTheme}
            title={actualTheme === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
            aria-label={actualTheme === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 12px',
              borderRadius: 'var(--md-sys-shape-corner-large)',
              color: 'var(--md-sys-color-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span className="material-symbols-rounded">
              {actualTheme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>
              {actualTheme === 'dark' ? '浅色' : '深色'}
            </span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, paddingBottom: '72px' }}>
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        className="mobile-bottom-bar"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '64px',
          backgroundColor: 'var(--md-sys-color-surface-container)',
          borderTop: '1px solid var(--md-sys-color-outline-variant)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 50,
        }}
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textDecoration: 'none',
              gap: '2px',
              padding: '6px 16px',
              borderRadius: 'var(--md-sys-shape-corner-full)',
              backgroundColor: isActive ? 'var(--md-sys-color-primary-container)' : 'transparent',
              color: isActive ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-secondary)',
            })}
          >
            <span className="material-symbols-rounded">{item.icon}</span>
            <span style={{ fontSize: '11px', fontWeight: 600 }}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <style>{`
        @media (max-width: 767px) {
          .desktop-rail { display: none !important; }
          .mobile-bottom-bar { display: flex !important; }
        }
        @media (min-width: 768px) {
          .desktop-rail { display: flex !important; }
          .mobile-bottom-bar { display: none !important; }
          main { padding-bottom: 0 !important; }
        }
      `}</style>
    </div>
  );
};