import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  authenticate,
  handleAuthConfig,
  handleRegister,
  handleLogin,
  handleLogout,
  handleMe,
  handleProfile,
  handlePasswordChange,
  handleAccountDelete,
} from './auth.ts';
import type { CustomRequest } from './auth.ts';
import {
  handleAdminGetConfig,
  handleAdminPutConfig,
  handleAdminListUsers,
  handleAdminCreateUser,
  handleAdminResetPassword,
  handleAdminDeleteUser,
  handleAdminAuditLogs,
} from './admin.ts';
import { handleSyncPull, handleSyncPush, handleSyncFull } from './sync.ts';
import { error } from './httpUtils.ts';
import { bootstrapAdmin } from './bootstrap.ts';
import { initDatabase } from './db.ts';

// 确保服务初始化
initDatabase();
bootstrapAdmin();

export async function apiMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next?: () => void
): Promise<void> {
  const customReq = req as CustomRequest;
  const urlString = req.url || '/';

  // 只拦截 /api 开头的请求，其它交还 Vite / 静态文件服务器
  if (!urlString.startsWith('/api')) {
    if (next) {
      next();
    } else {
      res.statusCode = 404;
      res.end('Not Found');
    }
    return;
  }

  // 跨域响应头（供前后端分离或预览模式调试）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(urlString, 'http://localhost');
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  try {
    // 统一会话凭证提取与鉴权检查
    authenticate(customReq);

    // 1. Auth 路由
    if (pathname === '/api/auth/config' && method === 'GET') {
      return await handleAuthConfig(customReq, res);
    }
    if (pathname === '/api/auth/register' && method === 'POST') {
      return await handleRegister(customReq, res);
    }
    if (pathname === '/api/auth/login' && method === 'POST') {
      return await handleLogin(customReq, res);
    }
    if (pathname === '/api/auth/logout' && method === 'POST') {
      return await handleLogout(customReq, res);
    }
    if (pathname === '/api/auth/me' && method === 'GET') {
      return await handleMe(customReq, res);
    }
    if (pathname === '/api/auth/profile' && method === 'PUT') {
      return await handleProfile(customReq, res);
    }
    if (pathname === '/api/auth/password/change' && method === 'POST') {
      return await handlePasswordChange(customReq, res);
    }
    if (pathname === '/api/auth/account' && method === 'DELETE') {
      return await handleAccountDelete(customReq, res);
    }

    // 2. Admin 路由
    if (pathname === '/api/admin/config' && method === 'GET') {
      return await handleAdminGetConfig(customReq, res);
    }
    if (pathname === '/api/admin/config' && method === 'PUT') {
      return await handleAdminPutConfig(customReq, res);
    }
    if (pathname === '/api/admin/users' && method === 'GET') {
      return await handleAdminListUsers(customReq, res, url);
    }
    if (pathname === '/api/admin/users' && method === 'POST') {
      return await handleAdminCreateUser(customReq, res);
    }
    if (pathname === '/api/admin/audit-logs' && method === 'GET') {
      return await handleAdminAuditLogs(customReq, res);
    }

    const resetPwdMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
    if (resetPwdMatch && method === 'POST') {
      const targetUserId = resetPwdMatch[1];
      return await handleAdminResetPassword(customReq, res, targetUserId);
    }

    const deleteUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (deleteUserMatch && method === 'DELETE') {
      const targetUserId = deleteUserMatch[1];
      return await handleAdminDeleteUser(customReq, res, targetUserId);
    }

    // 3. Sync 路由
    if (pathname === '/api/sync/pull' && method === 'POST') {
      return await handleSyncPull(customReq, res);
    }
    if (pathname === '/api/sync/push' && method === 'POST') {
      return await handleSyncPush(customReq, res);
    }
    if (pathname === '/api/sync/full' && method === 'POST') {
      return await handleSyncFull(customReq, res);
    }

    // 404
    error(res, `Endpoint ${method} ${pathname} not found`, 404);
  } catch (err: unknown) {
    console.error(`[API Error] ${method} ${pathname}:`, err);
    error(res, err instanceof Error ? err.message : 'Internal Server Error', 500);
  }
}
