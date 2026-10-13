import Dexie, { type EntityTable } from 'dexie';
import { DeckRecord, DeckMemberRecord } from './schema.ts';
import { CardProgress, CardState, ReviewLogEntry } from '../../core/scheduler/types.ts';

export class UserDatabase extends Dexie {
  decks!: EntityTable<DeckRecord, 'id'>;
  deckMembers!: EntityTable<DeckMemberRecord, 'id'>;
  cards!: EntityTable<CardProgress, 'id'>;
  logs!: EntityTable<ReviewLogEntry, 'id'>;

  constructor(dbName = 'vocab-memorier-guest') {
    super(dbName);
    this.version(1).stores({
      decks: 'id, name, createdAt, updatedAt',
      deckMembers: 'id, deckId, word, sortOrder',
      cards: 'word, state, nextDue, lastReviewedAt',
      logs: 'id, deckId, word, timestamp',
    });

    this.version(2).stores({
      cards: null,
    });

    this.version(3).stores({
      decks: 'id, name, createdAt, updatedAt',
      deckMembers: 'id, deckId, word, sortOrder',
      cards: 'id, deckId, word, state, nextDue, lastReviewedAt',
      logs: 'id, deckId, word, timestamp',
    }).upgrade(async (tx) => {
      const members = await tx.table('deckMembers').toArray();
      const newCards: CardProgress[] = members.map((m) => ({
        id: `${m.deckId}:${m.word}`,
        deckId: m.deckId,
        word: m.word,
        state: CardState.NEW,
        step: 0,
        consecutiveSuccess: 0,
        lapseCount: 0,
        reps: 0,
        lastReviewedAt: 0,
        nextDue: 0,
      }));
      if (newCards.length > 0) {
        await tx.table('cards').bulkAdd(newCards);
      }
    });
  }
}

// 缓存不同账户已实例化的 Dexie 实例，确保单例复用
const dbCache = new Map<string, UserDatabase>();

// 当前激活的账户标识 (null 代表游客模式)
let activeUserId: string | null = (typeof localStorage !== 'undefined'
  ? localStorage.getItem('vocab_active_user_id')
  : null);

/**
 * 获取对应账户的 IndexedDB 物理数据库名称
 */
export function getDatabaseName(userId?: string | null): string {
  if (!userId || userId === 'guest') {
    return 'vocab-memorier-guest';
  }
  return `vocab-memorier-user-${userId}`;
}

/**
 * 获取指定或当前激活账户的 Dexie 数据库实例
 */
export function getUserDb(userId?: string | null): UserDatabase {
  const targetId = userId !== undefined ? userId : activeUserId;
  const dbName = getDatabaseName(targetId);
  let db = dbCache.get(dbName);
  if (!db) {
    db = new UserDatabase(dbName);
    dbCache.set(dbName, db);
  }
  return db;
}

/**
 * 切换当前全局激活账户（登录、登出、切换账号时调用）
 */
export function switchActiveUser(userId: string | null): UserDatabase {
  activeUserId = userId;
  if (typeof localStorage !== 'undefined') {
    if (userId) {
      localStorage.setItem('vocab_active_user_id', userId);
    } else {
      localStorage.removeItem('vocab_active_user_id');
    }
  }
  return getUserDb(userId);
}

/**
 * 获取当前全局激活的账户 ID (null 为游客)
 */
export function getActiveUserId(): string | null {
  return activeUserId;
}

/**
 * 游客数据平滑迁移：用户在游客状态下背词或创建的词本，在首次注册新账号时平滑迁移至新账户，并清空游客库
 */
export async function migrateGuestDataToUser(userId: string): Promise<void> {
  const guestDb = getUserDb('guest');
  const targetDb = getUserDb(userId);

  const [decks, members, cards, logs] = await Promise.all([
    guestDb.decks.toArray(),
    guestDb.deckMembers.toArray(),
    guestDb.cards.toArray(),
    guestDb.logs.toArray(),
  ]);

  if (decks.length > 0 || members.length > 0 || cards.length > 0 || logs.length > 0) {
    await targetDb.transaction('rw', [targetDb.decks, targetDb.deckMembers, targetDb.cards, targetDb.logs], async () => {
      if (decks.length > 0) await targetDb.decks.bulkPut(decks);
      if (members.length > 0) await targetDb.deckMembers.bulkPut(members);
      if (cards.length > 0) await targetDb.cards.bulkPut(cards);
      if (logs.length > 0) await targetDb.logs.bulkPut(logs);
    });

    await guestDb.transaction('rw', [guestDb.decks, guestDb.deckMembers, guestDb.cards, guestDb.logs], async () => {
      await guestDb.decks.clear();
      await guestDb.deckMembers.clear();
      await guestDb.cards.clear();
      await guestDb.logs.clear();
    });
  }
}

/**
 * 彻底销毁指定账户在本地的 IndexedDB 物理数据库
 */
export async function deleteUserLocalDb(userId: string): Promise<void> {
  const dbName = getDatabaseName(userId);
  const db = dbCache.get(dbName);
  if (db) {
    db.close();
    dbCache.delete(dbName);
  }
  await Dexie.delete(dbName);
  if (activeUserId === userId) {
    switchActiveUser(null);
  }
}

/**
 * 针对旧版本未分库数据库 (vocab-memorier-user) 的平滑兼容迁移
 */
export async function migrateLegacyDatabase(): Promise<void> {
  try {
    const exists = await Dexie.exists('vocab-memorier-user');
    if (!exists) return;

    const legacyDb = new UserDatabase('vocab-memorier-user');
    const guestDb = getUserDb('guest');
    const guestDeckCount = await guestDb.decks.count();

    if (guestDeckCount === 0) {
      const [decks, members, cards, logs] = await Promise.all([
        legacyDb.decks.toArray(),
        legacyDb.deckMembers.toArray(),
        legacyDb.cards.toArray(),
        legacyDb.logs.toArray(),
      ]);
      if (decks.length > 0) {
        await guestDb.transaction('rw', [guestDb.decks, guestDb.deckMembers, guestDb.cards, guestDb.logs], async () => {
          await guestDb.decks.bulkPut(decks);
          await guestDb.deckMembers.bulkPut(members);
          await guestDb.cards.bulkPut(cards);
          await guestDb.logs.bulkPut(logs);
        });
      }
    }
    legacyDb.close();
    await Dexie.delete('vocab-memorier-user');
  } catch (err) {
    console.warn('[UserDb] Legacy migration skipped or error:', err);
  }
}

/**
 * 导出透明动态代理 userDb：
 * 保证现有的 deckRepo, cardRepo, logRepo 等调用方无需修改代码，透明重定向操作到当前登录账户（或访客）的 Dexie 实例
 */
export const userDb: UserDatabase = new Proxy(Object.create(UserDatabase.prototype) as UserDatabase, {
  get(_target, prop) {
    const db = getUserDb();
    const val = Reflect.get(db, prop, db);
    if (typeof val === 'function') {
      return val.bind(db);
    }
    return val;
  },
  set(_target, prop, value) {
    const db = getUserDb();
    return Reflect.set(db, prop, value, db);
  },
  has(_target, prop) {
    const db = getUserDb();
    return Reflect.has(db, prop);
  },
});