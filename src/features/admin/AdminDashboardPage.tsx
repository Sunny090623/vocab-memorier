import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth/useAuth.ts';
import { adminApi, AdminUserItem, AdminAuditLogItem } from '../../data/api/adminApi.ts';
import { TopAppBar } from '../../ui/components/TopAppBar.tsx';
import { MdCard } from '../../ui/components/MdCard.tsx';
import { MdButton } from '../../ui/components/MdButton.tsx';
import { useToast } from '../../ui/components/Toast.tsx';

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isLoading: authLoading, refreshConfig } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>([]);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');

  // 创建用户弹窗
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newEmail, setNewEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [addingUser, setAddingUser] = useState(false);

  // 重置密码弹窗
  const [targetUserForReset, setTargetUserForReset] = useState<AdminUserItem | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // 删除用户弹窗
  const [targetUserForDelete, setTargetUserForDelete] = useState<AdminUserItem | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const loadAllData = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const [configRes, usersRes, logsRes] = await Promise.all([
        adminApi.getAdminConfig(),
        adminApi.listUsers(query),
        adminApi.getAuditLogs(),
      ]);
      setAllowPublicRegistration(configRes.allowPublicRegistration);
      setUsers(usersRes.users);
      setAuditLogs(logsRes.logs);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '加载管理数据失败');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const searchUsersOnly = useCallback(async (query: string) => {
    try {
      const usersRes = await adminApi.listUsers(query);
      setUsers(usersRes.users);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '搜索用户失败');
    }
  }, [showToast]);

  // 初次加载与鉴权
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/decks', { replace: true });
      return;
    }
    if (isAdmin) {
      loadAllData();
    }
  }, [authLoading, user, isAdmin, navigate, loadAllData]);

  // 搜索防抖（300ms）：避免按键时频繁触发全量配置及审计日志查询
  const isFirstMount = React.useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (isAdmin) {
        searchUsersOnly(searchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, isAdmin, searchUsersOnly]);

  const handleToggleRegistration = async () => {
    const nextVal = !allowPublicRegistration;
    try {
      await adminApi.updateAdminConfig(nextVal);
      setAllowPublicRegistration(nextVal);
      await refreshConfig();
      showToast(`已${nextVal ? '开启' : '关闭'}公开注册功能`);
      loadAllData(searchQuery);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '修改注册设置失败');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newUsername || !newPassword) {
      showToast('请完整填写用户信息');
      return;
    }
    setAddingUser(true);
    try {
      await adminApi.createUser(newEmail.trim(), newUsername.trim(), newPassword, newRole);
      showToast(`已成功创建用户 ${newUsername}`);
      setShowAddModal(false);
      setNewEmail('');
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      loadAllData(searchQuery);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '创建用户失败');
    } finally {
      setAddingUser(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserForReset || !resetNewPassword) return;
    setResettingPassword(true);
    try {
      const res = await adminApi.resetUserPassword(targetUserForReset.id, resetNewPassword);
      showToast(res.message);
      setTargetUserForReset(null);
      setResetNewPassword('');
      loadAllData(searchQuery);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '重置密码失败');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!targetUserForDelete) return;
    setDeletingUser(true);
    try {
      const res = await adminApi.deleteUser(targetUserForDelete.id);
      showToast(res.message);
      setTargetUserForDelete(null);
      loadAllData(searchQuery);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '删除用户失败');
    } finally {
      setDeletingUser(false);
    }
  };

  const { totalUsers, adminCount, totalDecks, totalCards } = useMemo(() => {
    let admins = 0;
    let decks = 0;
    let cards = 0;
    for (const u of users) {
      if (u.role === 'admin') admins++;
      decks += u.deckCount || 0;
      cards += u.cardCount || 0;
    }
    return {
      totalUsers: users.length,
      adminCount: admins,
      totalDecks: decks,
      totalCards: cards,
    };
  }, [users]);

  if (authLoading || (!isAdmin && !user)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <span>正在校验管理员凭证...</span>
      </div>
    );
  }

  return (
    <div>
      <TopAppBar
        title="系统管理后台"
        subtitle="用户权限、注册策略控制与操作审计"
        actions={
          <MdButton variant="filled" icon="person_add" onClick={() => setShowAddModal(true)}>
            添加新用户
          </MdButton>
        }
      />

      <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* 系统概览指标卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <MdCard variant="outlined" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--md-sys-color-secondary)', fontWeight: 600 }}>注册用户总数</span>
            <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: 'var(--md-sys-color-primary)' }}>
              {totalUsers}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--md-sys-color-outline)', marginTop: '4px' }}>
              含 {adminCount} 位管理员
            </div>
          </MdCard>

          <MdCard variant="outlined" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--md-sys-color-secondary)', fontWeight: 600 }}>云端词本总数</span>
            <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: 'var(--md-sys-color-primary)' }}>
              {totalDecks}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--md-sys-color-outline)', marginTop: '4px' }}>
              累计已同步单词本
            </div>
          </MdCard>

          <MdCard variant="outlined" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--md-sys-color-secondary)', fontWeight: 600 }}>云端学习卡片数</span>
            <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px', color: 'var(--md-sys-color-primary)' }}>
              {totalCards}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--md-sys-color-outline)', marginTop: '4px' }}>
              全系统同步卡片记录
            </div>
          </MdCard>

          <MdCard variant="outlined" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--md-sys-color-secondary)', fontWeight: 600 }}>公开注册开关</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: allowPublicRegistration ? 'var(--md-sys-color-success)' : 'var(--md-sys-color-outline)',
                }}
              >
                {allowPublicRegistration ? '已开放自由注册' : '仅限管理员开户'}
              </span>
              <MdButton variant={allowPublicRegistration ? 'tonal' : 'filled'} size="sm" onClick={handleToggleRegistration}>
                {allowPublicRegistration ? '切换为关闭' : '开启注册'}
              </MdButton>
            </div>
          </MdCard>
        </div>

        {/* 标签栏 */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '12px 20px',
              border: 'none',
              backgroundColor: 'transparent',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              color: activeTab === 'users' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-secondary)',
              borderBottom: activeTab === 'users' ? '3px solid var(--md-sys-color-primary)' : '3px solid transparent',
            }}
          >
            用户账户管理 ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            style={{
              padding: '12px 20px',
              border: 'none',
              backgroundColor: 'transparent',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              color: activeTab === 'audit' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-secondary)',
              borderBottom: activeTab === 'audit' ? '3px solid var(--md-sys-color-primary)' : '3px solid transparent',
            }}
          >
            管理员审计日志 ({auditLogs.length})
          </button>
        </div>

        {/* 用户列表视图 */}
        {activeTab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 搜索过滤框 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="搜索邮箱或用户名..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    searchUsersOnly(searchQuery);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 'var(--md-sys-shape-corner-medium)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  backgroundColor: 'var(--md-sys-color-surface)',
                  color: 'var(--md-sys-color-on-surface)',
                  fontSize: '14px',
                }}
              />
              <MdButton variant="tonal" icon="search" onClick={() => searchUsersOnly(searchQuery)}>
                查询
              </MdButton>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--md-sys-color-secondary)' }}>
                加载用户数据中...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {users.map((u) => {
                  const isCurrent = u.id === user?.id;
                  return (
                    <div key={u.id} data-user-email={u.email}>
                      <MdCard variant="outlined" style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div
                            style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: 'var(--md-sys-shape-corner-full)',
                              backgroundColor:
                                u.role === 'admin'
                                  ? 'var(--md-sys-color-tertiary-container)'
                                  : 'var(--md-sys-color-surface-container-high)',
                              color:
                                u.role === 'admin'
                                  ? 'var(--md-sys-color-on-tertiary-container)'
                                  : 'var(--md-sys-color-on-surface)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <span className="material-symbols-rounded">
                              {u.role === 'admin' ? 'admin_panel_settings' : 'person'}
                            </span>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 700, fontSize: '15px' }}>{u.username}</span>
                              <span
                                style={{
                                  fontSize: '11px',
                                  padding: '1px 6px',
                                  borderRadius: 'var(--md-sys-shape-corner-full)',
                                  backgroundColor:
                                    u.role === 'admin'
                                      ? 'var(--md-sys-color-tertiary-container)'
                                      : 'var(--md-sys-color-surface-container)',
                                  color:
                                    u.role === 'admin'
                                      ? 'var(--md-sys-color-on-tertiary-container)'
                                      : 'var(--md-sys-color-secondary)',
                                  fontWeight: 600,
                                }}
                              >
                                {u.role === 'admin' ? '管理员' : '普通用户'}
                              </span>
                              {isCurrent && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    padding: '1px 6px',
                                    borderRadius: 'var(--md-sys-shape-corner-full)',
                                    backgroundColor: 'var(--md-sys-color-primary)',
                                    color: 'var(--md-sys-color-on-primary)',
                                    fontWeight: 700,
                                  }}
                                >
                                  当前操作者
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', marginTop: '2px' }}>
                              {u.email} · 注册时间：{new Date(u.createdAt).toLocaleDateString()}
                              {u.lastLoginAt ? ` · 最近登录：${new Date(u.lastLoginAt).toLocaleDateString()}` : ''}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--md-sys-color-outline)', marginTop: '4px' }}>
                              词本数：{u.deckCount} · 卡片数：{u.cardCount}
                            </div>
                          </div>
                        </div>

                        {/* 操作按钮区 */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <MdButton
                            variant="outlined"
                            size="sm"
                            icon="lock_reset"
                            onClick={() => {
                              setTargetUserForReset(u);
                              setResetNewPassword('');
                            }}
                          >
                            重置密码
                          </MdButton>

                          {!isCurrent && (
                            <MdButton
                              variant="tonal"
                              size="sm"
                              icon="delete"
                              onClick={() => setTargetUserForDelete(u)}
                              style={{ color: 'var(--md-sys-color-error)' }}
                            >
                              删除账户
                            </MdButton>
                          )}
                        </div>
                      </div>
                    </MdCard>
                  </div>
                );
                })}
              </div>
            )}
          </div>
        )}

        {/* 审计日志视图 */}
        {activeTab === 'audit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {auditLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--md-sys-color-secondary)' }}>
                暂无管理操作记录
              </div>
            ) : (
              auditLogs.map((log) => (
                <MdCard key={log.id} variant="outlined" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 'var(--md-sys-shape-corner-full)',
                          backgroundColor: 'var(--md-sys-color-primary-container)',
                          color: 'var(--md-sys-color-on-primary-container)',
                        }}
                      >
                        {log.action}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{log.details}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--md-sys-color-outline)' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--md-sys-color-secondary)', marginTop: '4px' }}>
                    操作管理员：{log.admin_email}
                    {log.target_user_email ? ` · 目标用户：${log.target_user_email}` : ''}
                  </div>
                </MdCard>
              ))
            )}
          </div>
        )}
      </div>

      {/* 创建用户弹窗 */}
      {showAddModal && (
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
          <div style={{ width: '100%', maxWidth: '440px' }}>
            <MdCard variant="elevated">
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px 0' }}>添加新用户</h3>
              <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    登录邮箱
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--md-sys-shape-corner-medium)',
                      border: '1px solid var(--md-sys-color-outline-variant)',
                      backgroundColor: 'var(--md-sys-color-surface)',
                      color: 'var(--md-sys-color-on-surface)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    用户昵称
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="昵称"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--md-sys-shape-corner-medium)',
                      border: '1px solid var(--md-sys-color-outline-variant)',
                      backgroundColor: 'var(--md-sys-color-surface)',
                      color: 'var(--md-sys-color-on-surface)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    初始密码
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
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    分配角色
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'user' | 'admin')}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--md-sys-shape-corner-medium)',
                      border: '1px solid var(--md-sys-color-outline-variant)',
                      backgroundColor: 'var(--md-sys-color-surface)',
                      color: 'var(--md-sys-color-on-surface)',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="user">普通用户 (仅管理自身数据)</option>
                    <option value="admin">系统管理员 (具备后台管理权限)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <MdButton variant="tonal" size="sm" onClick={() => setShowAddModal(false)}>
                    取消
                  </MdButton>
                  <MdButton variant="filled" size="sm" type="submit" disabled={addingUser}>
                    {addingUser ? '创建中...' : '确认创建'}
                  </MdButton>
                </div>
              </form>
            </MdCard>
          </div>
        </div>
      )}

      {/* 重置密码弹窗 */}
      {targetUserForReset && (
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
          <div style={{ width: '100%', maxWidth: '420px' }}>
            <MdCard variant="elevated">
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0' }}>
                重置用户密码: {targetUserForReset.username}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', margin: '0 0 16px 0' }}>
                重置密码后，系统将<strong>立即强制注销该用户所有现存会话</strong>，使其现有设备上的登录态即刻失效。
              </p>

              <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    新初始密码
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="至少 6 位新密码"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--md-sys-shape-corner-medium)',
                      border: '1px solid var(--md-sys-color-outline-variant)',
                      backgroundColor: 'var(--md-sys-color-surface)',
                      color: 'var(--md-sys-color-on-surface)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <MdButton variant="tonal" size="sm" onClick={() => setTargetUserForReset(null)}>
                    取消
                  </MdButton>
                  <MdButton variant="filled" size="sm" type="submit" disabled={resettingPassword}>
                    {resettingPassword ? '重置中...' : '确认重置并踢下线'}
                  </MdButton>
                </div>
              </form>
            </MdCard>
          </div>
        </div>
      )}

      {/* 删除用户确认弹窗 */}
      {targetUserForDelete && (
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
          <div style={{ width: '100%', maxWidth: '420px' }}>
            <MdCard variant="elevated">
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--md-sys-color-error)' }}>
                危险操作：确认删除用户
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', margin: '0 0 8px 0' }}>
                确定要删除账户 <strong>{targetUserForDelete.email}</strong> ({targetUserForDelete.username}) 吗？
              </p>
              <p style={{ fontSize: '12px', color: 'var(--md-sys-color-error)', margin: '0 0 16px 0' }}>
                操作影响：该用户的 {targetUserForDelete.deckCount} 个云端单词本、{targetUserForDelete.cardCount} 张卡片进度及所有复习日志将被原子事务彻底清除。共享只读词典不受影响。
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <MdButton variant="tonal" size="sm" onClick={() => setTargetUserForDelete(null)}>
                  取消
                </MdButton>
                <MdButton
                  variant="filled"
                  size="sm"
                  disabled={deletingUser}
                  onClick={handleDeleteUser}
                  style={{ backgroundColor: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)' }}
                >
                  {deletingUser ? '删除中...' : '确认删除'}
                </MdButton>
              </div>
            </MdCard>
          </div>
        </div>
      )}
    </div>
  );
};

