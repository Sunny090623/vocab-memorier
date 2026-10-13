import type { ServerResponse } from 'node:http';
import { getDb } from './db.ts';
import type { CloudDeckRow, CloudDeckMemberRow, CloudCardRow, CloudLogRow, CloudSettingRow } from './db.ts';
import { json, error, parseBody } from './httpUtils.ts';
import type { CustomRequest } from './auth.ts';

export interface SyncPayload {
  decks?: Array<{
    id: string;
    name: string;
    description?: string;
    studyMode?: string;
    wordCount?: number;
    masteredCount?: number;
    createdAt?: number;
    updatedAt: number;
    isDeleted?: boolean | number;
  }>;
  deckMembers?: Array<{
    id: string;
    deckId: string;
    word: string;
    sortOrder?: number;
    addedAt?: number;
    isDeleted?: boolean | number;
  }>;
  cards?: Array<{
    id: string;
    deckId: string;
    word: string;
    state: string;
    step?: number;
    consecutiveSuccess?: number;
    lapseCount?: number;
    reps?: number;
    lastReviewedAt?: number;
    nextDue?: number;
    masteredAt?: number;
    updatedAt?: number;
  }>;
  logs?: Array<{
    id: string;
    deckId: string;
    word: string;
    rating: string;
    stateBefore: string;
    stateAfter: string;
    isIndependent: boolean | number;
    durationMs: number;
    timestamp: number;
  }>;
  settings?: Array<{
    key: string;
    value: string;
    updatedAt: number;
  }>;
}

export async function handleSyncPull(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (!req.user) {
    error(res, '未登录', 401);
    return;
  }

  const userId = req.user.id;
  const db = getDb();

  const decks = db.prepare('SELECT * FROM cloud_decks WHERE user_id = ?').all(userId) as unknown as CloudDeckRow[];
  const deckMembers = db.prepare('SELECT * FROM cloud_deck_members WHERE user_id = ?').all(userId) as unknown as CloudDeckMemberRow[];
  const cards = db.prepare('SELECT * FROM cloud_cards WHERE user_id = ?').all(userId) as unknown as CloudCardRow[];
  const logs = db.prepare('SELECT * FROM cloud_logs WHERE user_id = ?').all(userId) as unknown as CloudLogRow[];
  const settings = db.prepare('SELECT * FROM cloud_settings WHERE user_id = ?').all(userId) as unknown as CloudSettingRow[];

  json(res, {
    decks: decks.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description || undefined,
      studyMode: d.study_mode,
      wordCount: d.word_count,
      masteredCount: d.mastered_count,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      isDeleted: d.is_deleted === 1,
    })),
    deckMembers: deckMembers.map((m) => ({
      id: m.id,
      deckId: m.deck_id,
      word: m.word,
      sortOrder: m.sort_order,
      addedAt: m.added_at,
      isDeleted: m.is_deleted === 1,
    })),
    cards: cards.map((c) => ({
      id: c.id,
      deckId: c.deck_id,
      word: c.word,
      state: c.state,
      step: c.step,
      consecutiveSuccess: c.consecutive_success,
      lapseCount: c.lapse_count,
      reps: c.reps,
      lastReviewedAt: c.last_reviewed_at,
      nextDue: c.next_due,
      masteredAt: c.mastered_at || undefined,
      updatedAt: c.updated_at,
    })),
    logs: logs.map((l) => ({
      id: l.id,
      deckId: l.deck_id,
      word: l.word,
      rating: l.rating,
      stateBefore: l.state_before,
      stateAfter: l.state_after,
      isIndependent: l.is_independent === 1,
      durationMs: l.duration_ms,
      timestamp: l.timestamp,
    })),
    settings: settings.map((s) => ({
      key: s.key,
      value: s.value,
      updatedAt: s.updated_at,
    })),
  });
}

/**
 * 服务端合并逻辑：严格遵循差异化合并规则
 */
export function mergeClientDataIntoCloud(userId: string, payload: SyncPayload): void {
  const db = getDb();
  const now = Date.now();

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. 合并 decks (单词本)：批量拉取现有记录，避免 N 次 SELECT
    if (payload.decks && payload.decks.length > 0) {
      const existingDecks = db.prepare('SELECT * FROM cloud_decks WHERE user_id = ?').all(userId) as unknown as CloudDeckRow[];
      const existingDeckMap = new Map(existingDecks.map((d) => [d.id, d]));

      const insertDeckStmt = db.prepare(`
        INSERT INTO cloud_decks (id, user_id, name, description, study_mode, word_count, mastered_count, created_at, updated_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateDeckStmt = db.prepare(`
        UPDATE cloud_decks 
        SET name = ?, description = ?, study_mode = ?, word_count = ?, mastered_count = ?, updated_at = ?, is_deleted = ?
        WHERE id = ? AND user_id = ?
      `);

      for (const d of payload.decks) {
        const isDel = d.isDeleted ? 1 : 0;
        const updatedAt = d.updatedAt || now;
        const createdAt = d.createdAt || now;
        const existing = existingDeckMap.get(d.id);

        if (!existing) {
          insertDeckStmt.run(
            d.id,
            userId,
            d.name,
            d.description || null,
            d.studyMode || 'BATCH_CYCLE',
            d.wordCount || 0,
            d.masteredCount || 0,
            createdAt,
            updatedAt,
            isDel
          );
        } else {
          // 若任一侧为已删除，且更新时间较新或已删除，保留软删除
          if (updatedAt >= existing.updated_at) {
            updateDeckStmt.run(
              d.name,
              d.description || null,
              d.studyMode || existing.study_mode,
              d.wordCount ?? existing.word_count,
              d.masteredCount ?? existing.mastered_count,
              updatedAt,
              isDel || existing.is_deleted,
              d.id,
              userId
            );
          } else if (isDel && !existing.is_deleted) {
            // 本地软删除了，传播删除状态
            db.prepare('UPDATE cloud_decks SET is_deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?')
              .run(updatedAt, d.id, userId);
          }
        }
      }
    }

    // 2. 合并 deck_members (单词本成员)：批量拉取，O(1) 内存判断且仅变动时更新
    if (payload.deckMembers && payload.deckMembers.length > 0) {
      const existingMembers = db.prepare('SELECT id, sort_order, is_deleted FROM cloud_deck_members WHERE user_id = ?').all(userId) as unknown as CloudDeckMemberRow[];
      const existingMemberMap = new Map(existingMembers.map((m) => [m.id, m]));

      const insertMemberStmt = db.prepare(`
        INSERT INTO cloud_deck_members (id, user_id, deck_id, word, sort_order, added_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const updateMemberStmt = db.prepare(`
        UPDATE cloud_deck_members
        SET sort_order = ?, is_deleted = ?
        WHERE id = ? AND user_id = ?
      `);

      for (const m of payload.deckMembers) {
        const isDel = m.isDeleted ? 1 : 0;
        const existing = existingMemberMap.get(m.id);
        if (!existing) {
          insertMemberStmt.run(
            m.id,
            userId,
            m.deckId,
            m.word,
            m.sortOrder || 0,
            m.addedAt || now,
            isDel
          );
        } else {
          const finalDeleted = (isDel || existing.is_deleted) ? 1 : 0;
          const finalSortOrder = m.sortOrder ?? existing.sort_order;
          if (finalSortOrder !== existing.sort_order || finalDeleted !== existing.is_deleted) {
            updateMemberStmt.run(finalSortOrder, finalDeleted, m.id, userId);
          }
        }
      }
    }

    // 3. 合并 cards (学习进度)：单次预查询全量进度，内存高效合并，过滤无变化写盘
    if (payload.cards && payload.cards.length > 0) {
      const existingCards = db.prepare('SELECT * FROM cloud_cards WHERE user_id = ?').all(userId) as unknown as CloudCardRow[];
      const existingCardMap = new Map(existingCards.map((c) => [c.id, c]));

      const insertCardStmt = db.prepare(`
        INSERT INTO cloud_cards (
          id, user_id, deck_id, word, state, step, consecutive_success,
          lapse_count, reps, last_reviewed_at, next_due, mastered_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateCardStmt = db.prepare(`
        UPDATE cloud_cards
        SET state = ?, step = ?, consecutive_success = ?, lapse_count = ?, reps = ?,
            last_reviewed_at = ?, next_due = ?, mastered_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `);

      for (const c of payload.cards) {
        const existing = existingCardMap.get(c.id);
        const cardUpdatedAt = c.updatedAt || c.lastReviewedAt || now;

        if (!existing) {
          insertCardStmt.run(
            c.id,
            userId,
            c.deckId,
            c.word,
            c.state,
            c.step || 0,
            c.consecutiveSuccess || 0,
            c.lapseCount || 0,
            c.reps || 0,
            c.lastReviewedAt || 0,
            c.nextDue || 0,
            c.masteredAt || null,
            cardUpdatedAt
          );
        } else {
          // 深度保护逻辑：
          // 规则 A: MASTERED 优先保护
          const incomingIsMastered = c.state === 'MASTERED' || (c.state as unknown) === 2;
          const existingIsMastered = existing.state === 'MASTERED' || (existing.state as unknown) === 2;

          let chosenState = c.state;
          let chosenConsecutive = c.consecutiveSuccess ?? 0;
          let chosenMasteredAt = c.masteredAt || null;
          let chosenReps = Math.max(c.reps ?? 0, existing.reps);
          let chosenLapses = Math.max(c.lapseCount ?? 0, existing.lapse_count);
          let chosenLastReviewed = Math.max(c.lastReviewedAt ?? 0, existing.last_reviewed_at);
          let chosenNextDue = c.nextDue ?? existing.next_due;
          let chosenStep = c.step ?? existing.step;

          if (existingIsMastered && !incomingIsMastered) {
            // 云端已掌握，客户端落后 -> 保持已掌握！
            chosenState = existing.state;
            chosenConsecutive = Math.max(existing.consecutive_success, chosenConsecutive, 2);
            chosenMasteredAt = existing.mastered_at || (c.masteredAt || now);
          } else if (incomingIsMastered && !existingIsMastered) {
            // 客户端已掌握，云端未掌握 -> 采纳客户端掌握！
            chosenState = c.state;
            chosenConsecutive = Math.max(chosenConsecutive, 2);
            chosenMasteredAt = c.masteredAt || now;
          } else {
            // 规则 B: 均未掌握或均已掌握 -> 深度优先
            const incStreak = c.consecutiveSuccess ?? 0;
            const extStreak = existing.consecutive_success;

            if (incStreak > extStreak) {
              // 客户端独立答对连胜更高，采纳客户端状态
              chosenState = c.state;
              chosenConsecutive = incStreak;
              chosenStep = c.step ?? existing.step;
            } else if (incStreak < extStreak) {
              // 云端连胜更高，采纳云端状态
              chosenState = existing.state;
              chosenConsecutive = extStreak;
              chosenStep = existing.step;
            } else {
              // 连胜相同，看 reps 或最后复习时间
              if ((c.reps ?? 0) >= existing.reps || (c.lastReviewedAt ?? 0) >= existing.last_reviewed_at) {
                chosenState = c.state;
                chosenStep = c.step ?? existing.step;
              } else {
                chosenState = existing.state;
                chosenStep = existing.step;
              }
            }
          }

          const finalUpdatedAt = Math.max(cardUpdatedAt, existing.updated_at);
          // 仅在真实字段存在差异时才执行 UPDATE，避免全量无谓 WAL 写盘
          if (
            chosenState !== existing.state ||
            chosenStep !== existing.step ||
            chosenConsecutive !== existing.consecutive_success ||
            chosenLapses !== existing.lapse_count ||
            chosenReps !== existing.reps ||
            chosenLastReviewed !== existing.last_reviewed_at ||
            chosenNextDue !== existing.next_due ||
            chosenMasteredAt !== existing.mastered_at
          ) {
            updateCardStmt.run(
              chosenState,
              chosenStep,
              chosenConsecutive,
              chosenLapses,
              chosenReps,
              chosenLastReviewed,
              chosenNextDue,
              chosenMasteredAt,
              finalUpdatedAt,
              c.id,
              userId
            );
          }
        }
      }
    }

    // 4. 合并 logs (复习日志)：唯一 UUID 集合预检，避免每次全量触发 INSERT 冲突
    if (payload.logs && payload.logs.length > 0) {
      const existingLogs = db.prepare('SELECT id FROM cloud_logs WHERE user_id = ?').all(userId) as Array<{ id: string }>;
      const existingLogSet = new Set(existingLogs.map((l) => l.id));

      const insertLogStmt = db.prepare(`
        INSERT INTO cloud_logs (
          id, user_id, deck_id, word, rating, state_before, state_after, is_independent, duration_ms, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const l of payload.logs) {
        if (!existingLogSet.has(l.id)) {
          insertLogStmt.run(
            l.id,
            userId,
            l.deckId,
            l.word,
            l.rating,
            l.stateBefore,
            l.stateAfter,
            l.isIndependent ? 1 : 0,
            l.durationMs || 0,
            l.timestamp
          );
          existingLogSet.add(l.id);
        }
      }
    }

    // 5. 合并 settings (用户配置)：字段级 LWW
    if (payload.settings && payload.settings.length > 0) {
      const getSettingStmt = db.prepare('SELECT updated_at FROM cloud_settings WHERE user_id = ? AND key = ?');
      const upsertSettingStmt = db.prepare(`
        INSERT INTO cloud_settings (user_id, key, value, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
        WHERE excluded.updated_at >= cloud_settings.updated_at
      `);

      for (const s of payload.settings) {
        const updatedAt = s.updatedAt || now;
        const existing = getSettingStmt.get(userId, s.key) as { updated_at: number } | undefined;
        if (!existing || updatedAt >= existing.updated_at) {
          upsertSettingStmt.run(userId, s.key, s.value, updatedAt);
        }
      }
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export async function handleSyncPush(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (!req.user) {
    error(res, '未登录', 401);
    return;
  }

  const payload = await parseBody<SyncPayload>(req);
  mergeClientDataIntoCloud(req.user.id, payload);
  json(res, { success: true, timestamp: Date.now() });
}

export async function handleSyncFull(req: CustomRequest, res: ServerResponse): Promise<void> {
  if (!req.user) {
    error(res, '未登录', 401);
    return;
  }

  const payload = await parseBody<SyncPayload>(req);
  mergeClientDataIntoCloud(req.user.id, payload);

  // 合并后直接将云端权威状态返回
  await handleSyncPull(req, res);
}

