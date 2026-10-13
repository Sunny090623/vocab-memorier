import React from 'react';
import { useNavigate } from 'react-router-dom';

interface TopAppBarProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  actions?: React.ReactNode;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  title,
  subtitle,
  showBack = false,
  actions,
}) => {
  const navigate = useNavigate();

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid var(--md-sys-color-outline-variant)',
        backgroundColor: 'var(--md-sys-color-surface)',
        minHeight: '64px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: 'var(--md-sys-shape-corner-full)',
              color: 'var(--md-sys-color-on-surface)',
            }}
          >
            <span className="material-symbols-rounded">arrow_back</span>
          </button>
        )}
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</h1>
          {subtitle && (
            <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{actions}</div>}
    </header>
  );
};