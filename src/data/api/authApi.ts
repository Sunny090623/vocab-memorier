import { request } from './apiClient.ts';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export const authApi = {
  async getAuthConfig(): Promise<{ allowPublicRegistration: boolean }> {
    return request('/api/auth/config', { method: 'GET' });
  },

  async register(email: string, username: string, password: string): Promise<AuthResponse> {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    });
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async logout(): Promise<{ success: boolean }> {
    return request('/api/auth/logout', { method: 'POST' });
  },

  async getMe(): Promise<{ user: AuthUser }> {
    return request('/api/auth/me', { method: 'GET' });
  },

  async updateProfile(username: string): Promise<{ user: AuthUser }> {
    return request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ username }),
    });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; token: string }> {
    return request('/api/auth/password/change', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async deleteAccount(password: string): Promise<{ success: boolean }> {
    return request('/api/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
  },
};

