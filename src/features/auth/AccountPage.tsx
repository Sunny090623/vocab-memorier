import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/useAuth.ts';
import { authApi } from '../../data/api/authApi.ts';
import { syncService, SyncStatus } from '../../data/sync/syncService.ts';
import { deleteUserLocalDb } from '../../data/db/userDb.ts';
import { TopAppBar } from '../../ui/components/TopAppBar.tsx';
import { MdCard } from '../../ui/components/MdCard.tsx';
import { MdButton } from '../../ui/components/MdButton.tsx';
import { useToast } from '../../ui/components/Toast.tsx';

export const AccountPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout, refreshMe } = useAuth();
  const { showToast } = useToast();

  const [username, setUsername] = useState(user?.username || '');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [updatingUsername, setUpdatingUsername] = useState(false);

  // 密码修改
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // 同步状态监听
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // 注销账户确认弹窗
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = syncService.subscribe((status, lastTime) => {
      setSyncStatus(status);
      setLastSyncTime(lastTime);
      setIsSyncing(status === 'syncing');
    });
    return unsubscribe;
  }, []);

  if (!isAuthenticated || !user) {
    return (
      <div>
        <TopAppBar title="个人账户" subtitle="账户认证与数据同步" />
        <div style={{ padding: '24px', maxWidth: '600px', margin: '40px auto', textAlign: 'center' }}>
          <MdCard variant="outlined">
            <span
              className="material-symbols-rounded"
              style={{ fontSize: '48px', color: 'var(--md-sys-color-secondary)', marginBottom: '16px' }}
            >
              account_circle
            </span>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0' }}>当前为访客模式</h3>
            <p style={{ fontSize: '14px', color: 'var(--md-sys-color-secondary)', marginBottom: '24px' }}>
              您尚未登录账户。登录后可启用多设备云端备份与数据同步功能。
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <MdButton variant="filled" onClick={() => navigate('/login')}>
                立即登录
              </MdButton>
              <MdButton variant="tonal" onClick={() => navigate('/register')}>
                注册新账号
              </MdButton>
            </div>
          </MdCard>
        </div>
      </div>
    );
  }

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setUpdatingUsername(true);
    try {
      await authApi.updateProfile(username.trim());
      await refreshMe();
      setIsEditingUsername(false);
      showToast('用户名修改成功！');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '更新失败');
    } finally {
      setUpdatingUsername(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      showToast('请完整填写当前密码与新密码');
      return;
    }
    if (newPassword.length < 6) {
      showToast('新密码长度不能少于 6 位');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast('两次输入的新密码不一致');
      return;
    }

    setChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      showToast('密码修改成功！已更新当前会话');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '修改密码失败');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleTriggerSync = async () => {
    try {
      await syncService.triggerSync();
      showToast('云端数据同步完成！');
    } catch {
      showToast('同步失败，请检查网络');
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      showToast('请输入当前密码确认注销');
      return;
    }
    setIsDeleting(true);
    try {
      const currentUserId = user?.id;
      await authApi.deleteAccount(deletePassword);
      if (currentUserId) {
        await deleteUserLocalDb(currentUserId);
      }
      await logout();
      showToast('账户及相关云端数据已安全注销');
      navigate('/decks', { replace: true });
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '注销账户失败');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div>
      <TopAppBar title="个人账户" subtitle="管理您的资料、密码与多设备同步" />

      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* 用户基础信息卡片 */}
        <MdCard variant="outlined">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: 'var(--md-sys-shape-corner-full)',
                  backgroundColor: 'var(--md-sys-color-primary-container)',
                  color: 'var(--md-sys-color-on-primary-container)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: '32px' }}>
                  {user.role === 'admin' ? 'admin_panel_settings' : 'person'}
                </span>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{user.username}</h3>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 'var(--md-sys-shape-corner-full)',
                      backgroundColor:
                        user.role === 'admin'
                          ? 'var(--md-sys-color-tertiary-container)'
                          : 'var(--md-sys-color-secondary-container)',
                      color:
                        user.role === 'admin'
                          ? 'var(--md-sys-color-on-tertiary-container)'
                          : 'var(--md-sys-color-on-secondary-container)',
                    }}
                  >
                    {user.role === 'admin' ? '管理员' : '普通用户'}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', margin: '4px 0 0 0' }}>
                  {user.email}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <MdButton
                variant="outlined"
                size="sm"
                icon="edit"
                onClick={() => setIsEditingUsername(!isEditingUsername)}
              >
                {isEditingUsername ? '取消修改' : '修改昵称'}
              </MdButton>
              <MdButton
                variant="tonal"
                size="sm"
                icon="logout"
                onClick={async () => {
                  await logout();
                  showToast('已退出登录');
                  navigate('/decks');
                }}
              >
                退出登录
              </MdButton>
            </div>
          </div>

          {isEditingUsername && (
            <form onSubmit={handleUpdateUsername} style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="新昵称"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--md-sys-shape-corner-medium)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  backgroundColor: 'var(--md-sys-color-surface)',
                  color: 'var(--md-sys-color-on-surface)',
                  fontSize: '14px',
                }}
              />
              <MdButton variant="filled" size="sm" type="submit" disabled={updatingUsername}>
                {updatingUsername ? '保存中...' : '保存'}
              </MdButton>
            </form>
          )}
        </MdCard>

        {/* 云端数据同步面板 */}
        <MdCard variant="outlined">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-rounded" style={{ color: 'var(--md-sys-color-primary)', fontSize: '22px' }}>
                  cloud_sync
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>云端数据同步</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', margin: '6px 0 0 0' }}>
                当前状态：
                {syncStatus === 'syncing' && <span style={{ color: 'var(--md-sys-color-primary)' }}>正在双向同步中...</span>}
                {syncStatus === 'synced' && <span style={{ color: 'var(--md-sys-color-success)' }}>已同步</span>}
                {syncStatus === 'offline' && <span style={{ color: 'var(--md-sys-color-outline)' }}>离线模式 (本地可用)</span>}
                {syncStatus === 'error' && <span style={{ color: 'var(--md-sys-color-error)' }}>同步遇到问题</span>}
                {syncStatus === 'idle' && <span>待机</span>}
                {lastSyncTime ? ` · 上次同步于 ${new Date(lastSyncTime).toLocaleTimeString()}` : ''}
              </p>
            </div>

            <MdButton
              variant="tonal"
              size="sm"
              icon={isSyncing ? 'sync' : 'refresh'}
              disabled={isSyncing}
              onClick={handleTriggerSync}
            >
              {isSyncing ? '同步中...' : '立即同步'}
            </MdButton>
          </div>
        </MdCard>

        {/* 修改密码面板 */}
        <MdCard variant="outlined">
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>修改账户密码</h3>
          <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', marginBottom: '16px' }}>
            修改密码后，系统将自动撤销其他设备上的旧会话，确保账户安全。
          </p>

          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--md-sys-color-secondary)', marginBottom: '4px' }}>
                当前密码
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--md-sys-shape-corner-medium)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  backgroundColor: 'var(--md-sys-color-surface)',
                  color: 'var(--md-sys-color-on-surface)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--md-sys-color-secondary)', marginBottom: '4px' }}>
                新密码
              </label>
              <input
                type="password"
                required
                placeholder="至少 6 位密码"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--md-sys-shape-corner-medium)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  backgroundColor: 'var(--md-sys-color-surface)',
                  color: 'var(--md-sys-color-on-surface)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--md-sys-color-secondary)', marginBottom: '4px' }}>
                确认新密码
              </label>
              <input
                type="password"
                required
                placeholder="再次输入新密码"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--md-sys-shape-corner-medium)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  backgroundColor: 'var(--md-sys-color-surface)',
                  color: 'var(--md-sys-color-on-surface)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginTop: '4px' }}>
              <MdButton variant="filled" size="sm" type="submit" disabled={changingPassword}>
                {changingPassword ? '正在提交...' : '更新密码'}
              </MdButton>
            </div>
          </form>
        </MdCard>

        {/* 危险区域：账户注销 (仅普通用户显示，管理员端隐藏) */}
        {user.role !== 'admin' && (
          <MdCard
            variant="outlined"
            style={{ borderColor: 'var(--md-sys-color-error)', backgroundColor: 'var(--md-sys-color-error-container)' }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--md-sys-color-on-error-container)' }}>
              注销账户
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-error-container)', margin: '0 0 16px 0' }}>
              永久注销您的云端账户。此操作将在服务端原子事务中彻底清除您所有的云端单词本、复习记录与统计数据，不可恢复。共享只读词库将继续保留在本地不受影响。
            </p>

            <MdButton
              variant="filled"
              size="sm"
              icon="delete_forever"
              onClick={() => setShowDeleteModal(true)}
              style={{ backgroundColor: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }}
            >
              注销并删除云端数据
            </MdButton>
          </MdCard>
        )}
      </div>

      {/* 注销确认弹窗 */}
      {showDeleteModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 100,
          }}
        >
          <div style={{ width: '100%', maxWidth: '400px' }}>
            <MdCard variant="elevated">
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--md-sys-color-error)' }}>
                二次确认：注销账户
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', margin: '0 0 16px 0' }}>
                请输入您的当前登录密码以完成注销流程：
              </p>

              <input
                type="password"
                placeholder="请输入当前密码"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--md-sys-shape-corner-medium)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  backgroundColor: 'var(--md-sys-color-surface)',
                  color: 'var(--md-sys-color-on-surface)',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  marginBottom: '16px',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <MdButton variant="tonal" size="sm" onClick={() => setShowDeleteModal(false)}>
                  取消
                </MdButton>
                <MdButton
                  variant="filled"
                  size="sm"
                  disabled={isDeleting}
                  onClick={handleDeleteAccount}
                  style={{ backgroundColor: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }}
                >
                  {isDeleting ? '注销中...' : '确认永久注销'}
                </MdButton>
              </div>
            </MdCard>
          </div>
        </div>
      )}
    </div>
  );
};

