export const TOKEN_STORAGE_KEY = 'vocab_auth_token';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

let onUnauthorizedHandler: (() => void) | null = null;

export function setOnUnauthorized(handler: () => void): void {
  onUnauthorizedHandler = handler;
}

export async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (onUnauthorizedHandler) {
      onUnauthorizedHandler();
    }
  }

  const contentType = response.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  } else {
    data = await response.text().catch(() => null);
  }

  if (response.status === 405 || response.status === 501) {
    throw new ApiError(
      `当前静态服务器不支持 API 请求 (HTTP ${response.status})。请使用 npm run serve 或 npm run preview 启动包含 Node 认证后端的服务，或在 Nginx 中将 /api/ 反向代理至后端服务端口。`,
      response.status
    );
  }

  if (!response.ok) {
    const errorMsg = data && typeof data === 'object' && data.error ? data.error : `Request failed with status ${response.status}`;
    throw new ApiError(errorMsg, response.status);
  }

  if (path.startsWith('/api/') && !contentType.includes('application/json')) {
    throw new ApiError(
      '后端 API 接口返回了非 JSON 内容（静态服务器回退了 HTML）。请确保 Node 后端服务已启动并已配置 /api/ 反向代理。',
      502
    );
  }

  return data as T;
}

