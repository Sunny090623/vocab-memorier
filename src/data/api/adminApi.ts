import { request } from './apiClient.ts';

export interface AdminUserItem {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: number;
  updatedAt: number;
  lastLoginAt: number | null;
  deckCount: number;
  cardCount: number;
}

export interface AdminAuditLogItem {
  id: string;
  admin_id: string;
  admin_email: string;
  action: string;
  target_user_id: string | null;
  target_user_email: string | null;
  details: string | null;
  timestamp: number;
}

export const adminApi = {
  async getAdminConfig(): Promise<{ allowPublicRegistration: boolean }> {
    return request('/api/admin/config', { method: 'GET' });
  },

  async updateAdminConfig(allowPublicRegistration: boolean): Promise<{ success: boolean; allowPublicRegistration: boolean }> {
    return request('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify({ allowPublicRegistration }),
    });
  },

  async listUsers(
    q?: string,
    page?: number,
    pageSize?: number
  ): Promise<{ users: AdminUserItem[]; total?: number; page?: number; pageSize?: number; totalPages?: number }> {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (page !== undefined) params.set('page', String(page));
    if (pageSize !== undefined) params.set('pageSize', String(pageSize));
    const qs = params.toString();
    const url = qs ? `/api/admin/users?${qs}` : '/api/admin/users';
    return request(url, { method: 'GET' });
  },

  async createUser(email: string, username: string, password: string, role: 'admin' | 'user' = 'user'): Promise<{ user: AdminUserItem }> {
    return request('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, username, password, role }),
    });
  },

  async resetUserPassword(targetUserId: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/users/${targetUserId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  },

  async deleteUser(targetUserId: string): Promise<{ success: boolean; message: string }> {
    return request(`/api/admin/users/${targetUserId}`, {
      method: 'DELETE',
    });
  },

  async getAuditLogs(): Promise<{ logs: AdminAuditLogItem[] }> {
    return request('/api/admin/audit-logs', { method: 'GET' });
  },
};

