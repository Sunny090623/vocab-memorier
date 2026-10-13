import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/useAuth.ts';
import { syncService, SyncStatus } from '../../data/sync/syncService.ts';

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
  const { user, isAuthenticated } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  useEffect(() => {
    const unsubscribe = syncService.subscribe((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);

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
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
            }}
          >
            <span className="material-symbols-rounded">arrow_back</span>
          </button>
        )}
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>{title}</h1>
          {subtitle && (
            <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', margin: '2px 0 0 0' }}>{subtitle}</p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {actions}

        {/* 账户与同步状态指示药丸 (与标准 MdButton 保持一致尺寸 44px 高度) */}
        {isAuthenticated && user ? (
          <button
            onClick={() => navigate('/account')}
            title="查看账户中心与同步状态"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              height: '44px',
              padding: '0 20px',
              borderRadius: 'var(--md-sys-shape-corner-full)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              color: 'var(--md-sys-color-on-surface)',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              boxSizing: 'border-box',
              transition: 'all 0.15s ease',
            }}
          >
            <span
              className="material-symbols-rounded"
              style={{
                fontSize: '20px',
                color:
                  syncStatus === 'synced'
                    ? 'var(--md-sys-color-success)'
                    : syncStatus === 'syncing'
                    ? 'var(--md-sys-color-primary)'
                    : syncStatus === 'error'
                    ? 'var(--md-sys-color-error)'
                    : 'var(--md-sys-color-secondary)',
              }}
            >
              {syncStatus === 'syncing'
                ? 'sync'
                : syncStatus === 'synced'
                ? 'cloud_done'
                : syncStatus === 'error'
                ? 'cloud_alert'
                : syncStatus === 'offline'
                ? 'cloud_off'
                : 'cloud'}
            </span>
            <span>{user.username}</span>
          </button>
        ) : (
          <button
            onClick={() => navigate('/login')}
            title="登录以开启云端同步"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              height: '44px',
              padding: '0 20px',
              borderRadius: 'var(--md-sys-shape-corner-full)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              backgroundColor: 'var(--md-sys-color-surface-container-low)',
              color: 'var(--md-sys-color-primary)',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              boxSizing: 'border-box',
              transition: 'all 0.15s ease',
            }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>
              login
            </span>
            <span>登录/同步</span>
          </button>
        )}
      </div>
    </header>
  );
};