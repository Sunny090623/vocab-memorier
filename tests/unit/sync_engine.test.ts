import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase, setDb, getDb } from '../../server/db.ts';
import { mergeClientDataIntoCloud } from '../../server/sync.ts';

describe('Differentiated Data Sync Engine Tests', () => {
  const userId1 = 'user-001';
  const userId2 = 'user-002';

  beforeEach(() => {
    const db = initDatabase(':memory:');
    setDb(db);

    const now = Date.now();
    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at)
      VALUES (?, ?, ?, 'h', 's', 'user', ?, ?)
    `).run(userId1, 'u1@test.com', 'U1', now, now);

    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, password_salt, role, created_at, updated_at)
      VALUES (?, ?, ?, 'h', 's', 'user', ?, ?)
    `).run(userId2, 'u2@test.com', 'U2', now, now);
  });

  it('学习流水日志：全局唯一UUID去重并求并集，永不丢失打卡流水', () => {
    const db = getDb();

    // 第一次推送：包含日志 L1, L2
    mergeClientDataIntoCloud(userId1, {
      logs: [
        {
          id: 'log-1',
          deckId: 'deck-a',
          word: 'apple',
          rating: 'GOOD',
          stateBefore: 'NEW',
          stateAfter: 'LEARNING',
          isIndependent: false,
          durationMs: 1200,
          timestamp: 1000,
        },
        {
          id: 'log-2',
          deckId: 'deck-a',
          word: 'banana',
          rating: 'GOOD',
          stateBefore: 'NEW',
          stateAfter: 'LEARNING',
          isIndependent: false,
          durationMs: 1400,
          timestamp: 1050,
        },
      ],
    });

    // 第二次推送：包含重复日志 L2 以及新日志 L3
    mergeClientDataIntoCloud(userId1, {
      logs: [
        {
          id: 'log-2',
          deckId: 'deck-a',
          word: 'banana',
          rating: 'GOOD',
          stateBefore: 'NEW',
          stateAfter: 'LEARNING',
          isIndependent: false,
          durationMs: 1400,
          timestamp: 1050,
        },
        {
          id: 'log-3',
          deckId: 'deck-a',
          word: 'cherry',
          rating: 'HARD',
          stateBefore: 'NEW',
          stateAfter: 'LEARNING',
          isIndependent: false,
          durationMs: 2000,
          timestamp: 1100,
        },
      ],
    });

    // 验证结果：总日志数应为 3 条（L1, L2, L3 各且仅有一条）
    const logs = db.prepare('SELECT * FROM cloud_logs WHERE user_id = ? ORDER BY timestamp ASC').all(userId1);
    expect(logs.length).toBe(3);
    expect(logs.map((l: any) => l.id)).toEqual(['log-1', 'log-2', 'log-3']);
  });

  it('单词本与单词成员：可靠软删除标记传播，防止已删单词本复活', () => {
    const db = getDb();

    // 设备 A 上传单词本
    mergeClientDataIntoCloud(userId1, {
      decks: [
        {
          id: 'deck-cet4',
          name: '大学英语四级',
          updatedAt: 1000,
          isDeleted: 0,
        },
      ],
    });

    let deck = db.prepare('SELECT * FROM cloud_decks WHERE id = ? AND user_id = ?').get('deck-cet4', userId1) as any;
    expect(deck.is_deleted).toBe(0);

    // 设备 B 离线删除该单词本，随后连网同步上传 isDeleted = 1
    mergeClientDataIntoCloud(userId1, {
      decks: [
        {
          id: 'deck-cet4',
          name: '大学英语四级',
          updatedAt: 2000,
          isDeleted: 1,
        },
      ],
    });

    deck = db.prepare('SELECT * FROM cloud_decks WHERE id = ? AND user_id = ?').get('deck-cet4', userId1) as any;
    expect(deck.is_deleted).toBe(1);

    // 即使设备 A 滞后上传旧时间戳的 isDeleted = 0，软删除也不会被粗暴撤销
    mergeClientDataIntoCloud(userId1, {
      decks: [
        {
          id: 'deck-cet4',
          name: '大学英语四级',
          updatedAt: 1500, // 早于 2000
          isDeleted: 0,
        },
      ],
    });

    deck = db.prepare('SELECT * FROM cloud_decks WHERE id = ? AND user_id = ?').get('deck-cet4', userId1) as any;
    expect(deck.is_deleted).toBe(1);
  });

  it('学习进度优先保护：已掌握状态 (MASTERED) 不被旧设备覆盖', () => {
    const db = getDb();

    // 设备 A 完成了独立测试，卡片通关 MASTERED
    mergeClientDataIntoCloud(userId1, {
      cards: [
        {
          id: 'deck-1:abandon',
          deckId: 'deck-1',
          word: 'abandon',
          state: 'MASTERED',
          step: 2,
          consecutiveSuccess: 2,
          masteredAt: 5000,
          reps: 6,
          lastReviewedAt: 5000,
        },
      ],
    });

    let card = db.prepare('SELECT * FROM cloud_cards WHERE id = ? AND user_id = ?').get('deck-1:abandon', userId1) as any;
    expect(card.state).toBe('MASTERED');
    expect(card.consecutive_success).toBe(2);

    // 设备 B 很久没连网，本地 abandon 仍停留在 LEARNING 阶段，且带有时钟漂移甚至更新的时间戳
    mergeClientDataIntoCloud(userId1, {
      cards: [
        {
          id: 'deck-1:abandon',
          deckId: 'deck-1',
          word: 'abandon',
          state: 'LEARNING',
          step: 0,
          consecutiveSuccess: 0,
          masteredAt: undefined,
          reps: 2,
          lastReviewedAt: 6000, // 即使时钟较新，也不能把 MASTERED 抹掉！
        },
      ],
    });

    // 验证：保护规则生效，卡片依然是 MASTERED，连胜依然是 2
    card = db.prepare('SELECT * FROM cloud_cards WHERE id = ? AND user_id = ?').get('deck-1:abandon', userId1) as any;
    expect(card.state).toBe('MASTERED');
    expect(card.consecutive_success).toBe(2);
    expect(card.mastered_at).toBe(5000);
  });

  it('学习进度优先保护：对比学习深度 (consecutiveSuccess) 优选较深成果', () => {
    const db = getDb();

    // 云端当前状态：连胜 1 次
    mergeClientDataIntoCloud(userId1, {
      cards: [
        {
          id: 'deck-1:concept',
          deckId: 'deck-1',
          word: 'concept',
          state: 'TESTING',
          step: 1,
          consecutiveSuccess: 1,
          reps: 4,
          lastReviewedAt: 2000,
        },
      ],
    });

    // 客户端推送：处于初学刚刚开始阶段 (consecutiveSuccess = 0)
    mergeClientDataIntoCloud(userId1, {
      cards: [
        {
          id: 'deck-1:concept',
          deckId: 'deck-1',
          word: 'concept',
          state: 'LEARNING',
          step: 0,
          consecutiveSuccess: 0,
          reps: 2,
          lastReviewedAt: 3000,
        },
      ],
    });

    // 应该保护深度更高的 consecutiveSuccess = 1
    const card = db.prepare('SELECT * FROM cloud_cards WHERE id = ? AND user_id = ?').get('deck-1:concept', userId1) as any;
    expect(card.consecutive_success).toBe(1);
    expect(card.state).toBe('TESTING');
  });

  it('多租户数据强隔离：不同用户数据完全独立，互不污染', () => {
    const db = getDb();

    // User 1 推送
    mergeClientDataIntoCloud(userId1, {
      decks: [{ id: 'd-common', name: 'User1 专有词表', updatedAt: 1000 }],
    });

    // User 2 推送相同 ID 的词本
    mergeClientDataIntoCloud(userId2, {
      decks: [{ id: 'd-common', name: 'User2 专有词表', updatedAt: 2000 }],
    });

    // 检查两者的词本独立互不干扰
    const d1 = db.prepare('SELECT * FROM cloud_decks WHERE id = ? AND user_id = ?').get('d-common', userId1) as any;
    const d2 = db.prepare('SELECT * FROM cloud_decks WHERE id = ? AND user_id = ?').get('d-common', userId2) as any;

    expect(d1.name).toBe('User1 专有词表');
    expect(d2.name).toBe('User2 专有词表');
  });
});

