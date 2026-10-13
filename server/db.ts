import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  password_salt: string;
  role: 'admin' | 'user';
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

export interface SessionRow {
  token_hash: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export interface SystemConfigRow {
  key: string;
  value: string;
  updated_at: number;
}

export interface AdminAuditLogRow {
  id: string;
  admin_id: string;
  admin_email: string;
  action: string;
  target_user_id: string | null;
  target_user_email: string | null;
  details: string | null;
  timestamp: number;
}

export interface CloudDeckRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  study_mode: string;
  word_count: number;
  mastered_count: number;
  created_at: number;
  updated_at: number;
  is_deleted: number;
}

export interface CloudDeckMemberRow {
  id: string;
  user_id: string;
  deck_id: string;
  word: string;
  sort_order: number;
  added_at: number;
  is_deleted: number;
}

export interface CloudCardRow {
  id: string;
  user_id: string;
  deck_id: string;
  word: string;
  state: string;
  step: number;
  consecutive_success: number;
  lapse_count: number;
  reps: number;
  last_reviewed_at: number;
  next_due: number;
  mastered_at: number | null;
  updated_at: number;
}

export interface CloudLogRow {
  id: string;
  user_id: string;
  deck_id: string;
  word: string;
  rating: string;
  state_before: string;
  state_after: string;
  is_independent: number;
  duration_ms: number;
  timestamp: number;
}

export interface CloudSettingRow {
  user_id: string;
  key: string;
  value: string;
  updated_at: number;
}

let activeDb: DatabaseSync | null = null;

export function initDatabase(dbPath?: string): DatabaseSync {
  const targetPath = dbPath || process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'vocab_server.db');

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);

  // 启用外键约束与高性能 WAL 配置
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA cache_size = -20000;');

  // 初始化所有数据表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_configs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES users(id),
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user_id TEXT,
      target_user_email TEXT,
      details TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cloud_decks (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      study_mode TEXT DEFAULT 'BATCH_CYCLE',
      word_count INTEGER DEFAULT 0,
      mastered_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      PRIMARY KEY (id, user_id)
    );

    CREATE TABLE IF NOT EXISTS cloud_deck_members (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deck_id TEXT NOT NULL,
      word TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      added_at INTEGER NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      PRIMARY KEY (id, user_id)
    );

    CREATE TABLE IF NOT EXISTS cloud_cards (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deck_id TEXT NOT NULL,
      word TEXT NOT NULL,
      state TEXT NOT NULL,
      step INTEGER DEFAULT 0,
      consecutive_success INTEGER DEFAULT 0,
      lapse_count INTEGER DEFAULT 0,
      reps INTEGER DEFAULT 0,
      last_reviewed_at INTEGER DEFAULT 0,
      next_due INTEGER DEFAULT 0,
      mastered_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (id, user_id)
    );

    CREATE TABLE IF NOT EXISTS cloud_logs (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deck_id TEXT NOT NULL,
      word TEXT NOT NULL,
      rating TEXT NOT NULL,
      state_before TEXT NOT NULL,
      state_after TEXT NOT NULL,
      is_independent INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (id, user_id)
    );

    CREATE TABLE IF NOT EXISTS cloud_settings (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_cloud_decks_user ON cloud_decks(user_id);
    CREATE INDEX IF NOT EXISTS idx_cloud_decks_user_deleted ON cloud_decks(user_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_cloud_deck_members_user_deck ON cloud_deck_members(user_id, deck_id);
    CREATE INDEX IF NOT EXISTS idx_cloud_cards_user_deck ON cloud_cards(user_id, deck_id);
    CREATE INDEX IF NOT EXISTS idx_cloud_logs_user ON cloud_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON admin_audit_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
  `);

  // 初始化默认配置：公开注册开关，默认开启
  const regConfig = db.prepare('SELECT value FROM system_configs WHERE key = ?').get('allow_public_registration') as { value: string } | undefined;
  if (!regConfig) {
    const defaultAllow = process.env.ALLOW_PUBLIC_REGISTRATION === 'false' ? 'false' : 'true';
    db.prepare('INSERT INTO system_configs (key, value, updated_at) VALUES (?, ?, ?)')
      .run('allow_public_registration', defaultAllow, Date.now());
  }

  activeDb = db;
  return db;
}

export function getDb(): DatabaseSync {
  if (!activeDb) {
    return initDatabase();
  }
  return activeDb;
}

export function setDb(db: DatabaseSync): void {
  activeDb = db;
}

