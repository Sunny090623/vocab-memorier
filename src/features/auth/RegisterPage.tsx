import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../core/auth/useAuth.ts';
import { MdButton } from '../../ui/components/MdButton.tsx';
import { MdCard } from '../../ui/components/MdCard.tsx';
import { useToast } from '../../ui/components/Toast.tsx';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, allowPublicRegistration } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !username.trim() || !password) {
      setErrorMessage('请填写所有必填字段');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('密码长度至少为 6 位');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      await register(email.trim(), username.trim(), password);
      showToast('注册成功！已安全合并本机学习数据并连接云端');
      navigate('/decks', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '注册失败，请稍后重试';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!allowPublicRegistration) {
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
        <div style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
          <MdCard variant="elevated">
            <span
              className="material-symbols-rounded"
              style={{ fontSize: '48px', color: 'var(--md-sys-color-secondary)', marginBottom: '16px' }}
            >
              lock
            </span>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0' }}>公开注册已关闭</h3>
            <p style={{ fontSize: '14px', color: 'var(--md-sys-color-secondary)', marginBottom: '24px' }}>
              当前系统设置为仅限管理员分配账户。如果您需要账户，请联系管理员为您手动创建。
            </p>
            <MdButton variant="filled" onClick={() => navigate('/login')} style={{ width: '100%', justifyContent: 'center' }}>
              返回登录页面
            </MdButton>
          </MdCard>
        </div>
      </div>
    );
  }

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
              person_add
            </span>
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            创建新账户
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--md-sys-color-secondary)', marginTop: '8px' }}>
            建立属于您的个人背词空间
          </p>
        </div>

        <MdCard variant="elevated">
          {/* 本地数据自动合并提示 */}
          <div
            style={{
              backgroundColor: 'var(--md-sys-color-secondary-container)',
              color: 'var(--md-sys-color-on-secondary-container)',
              padding: '12px 14px',
              borderRadius: 'var(--md-sys-shape-corner-medium)',
              fontSize: '12px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: '18px', flexShrink: 0 }}>
              cloud_sync
            </span>
            <span>注册并登录后，当前浏览器中的离线单词本与学习进度将自动安全上传至您的云端账户。</span>
          </div>

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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                  padding: '10px 14px',
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
                用户昵称
              </label>
              <input
                type="text"
                required
                placeholder="请输入您的昵称"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
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
                设置密码
              </label>
              <input
                type="password"
                required
                placeholder="至少 6 位密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
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
                确认密码
              </label>
              <input
                type="password"
                required
                placeholder="请再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
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

            <div style={{ marginTop: '10px' }}>
              <MdButton
                variant="filled"
                type="submit"
                disabled={loading}
                icon={loading ? 'sync' : 'how_to_reg'}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {loading ? '正在注册...' : '注 册'}
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
            已有账户？{' '}
            <Link
              to="/login"
              style={{
                color: 'var(--md-sys-color-primary)',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              直接登录
            </Link>
          </div>
        </MdCard>
      </div>
    </div>
  );
};

