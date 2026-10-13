import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../core/auth/useAuth.ts';
import { MdButton } from '../../ui/components/MdButton.tsx';
import { MdCard } from '../../ui/components/MdCard.tsx';
import { useToast } from '../../ui/components/Toast.tsx';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, allowPublicRegistration } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/decks';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('请输入邮箱和密码');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      await login(email.trim(), password);
      showToast('登录成功！已连接云端同步');
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '登录失败，请检查账号密码';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        padding: '24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: 'var(--md-sys-shape-corner-large)',
              backgroundColor: 'var(--md-sys-color-primary-container)',
              color: 'var(--md-sys-color-on-primary-container)',
              marginBottom: '16px',
            }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: '32px' }}>
              account_circle
            </span>
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            登录 Vocab Memorier
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--md-sys-color-secondary)', marginTop: '8px' }}>
            管理并跨设备同步您的单词本与学习进度
          </p>
        </div>

        <MdCard variant="elevated">
          {errorMessage && (
            <div
              style={{
                backgroundColor: 'var(--md-sys-color-error-container)',
                color: 'var(--md-sys-color-on-error-container)',
                padding: '12px 16px',
                borderRadius: 'var(--md-sys-shape-corner-medium)',
                fontSize: '13px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
                error
              </span>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--md-sys-color-secondary)',
                  marginBottom: '6px',
                }}
              >
                邮箱地址
              </label>
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 'var(--md-sys-shape-corner-medium)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  backgroundColor: 'var(--md-sys-color-surface)',
                  color: 'var(--md-sys-color-on-surface)',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--md-sys-color-secondary)',
                  marginBottom: '6px',
                }}
              >
                账户密码
              </label>
              <input
                type="password"
                required
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 'var(--md-sys-shape-corner-medium)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  backgroundColor: 'var(--md-sys-color-surface)',
                  color: 'var(--md-sys-color-on-surface)',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginTop: '8px' }}>
              <MdButton
                variant="filled"
                type="submit"
                disabled={loading}
                icon={loading ? 'sync' : 'login'}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {loading ? '正在登录...' : '登 录'}
              </MdButton>
            </div>
          </form>

          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--md-sys-color-outline-variant)',
              textAlign: 'center',
              fontSize: '13px',
              color: 'var(--md-sys-color-secondary)',
            }}
          >
            {allowPublicRegistration ? (
              <p style={{ margin: 0 }}>
                还没有账号？{' '}
                <Link
                  to="/register"
                  style={{
                    color: 'var(--md-sys-color-primary)',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  立即注册
                </Link>
              </p>
            ) : (
              <p style={{ margin: 0, color: 'var(--md-sys-color-outline)' }}>
                当前系统仅限管理员分配账户，公开注册已关闭
              </p>
            )}
            <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: 'var(--md-sys-color-outline)' }}>
              如忘记密码，请联系系统管理员手动重置
            </p>
          </div>
        </MdCard>
      </div>
    </div>
  );
};

