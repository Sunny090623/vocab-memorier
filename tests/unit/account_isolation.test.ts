import { describe, it, expect, beforeEach } from 'vitest';
import {
  userDb,
  switchActiveUser,
  getUserDb,
  migrateGuestDataToUser,
  deleteUserLocalDb,
  getDatabaseName,
} from '../../src/data/db/userDb.ts';
import { deckRepo } from '../../src/data/repos/deckRepo.ts';
import { cardRepo } from '../../src/data/repos/cardRepo.ts';

describe('Local Multi-Account IndexedDB Isolation Tests', () => {
  beforeEach(async () => {
    // 切换到游客并清理
    switchActiveUser(null);
    await userDb.decks.clear();
    await userDb.deckMembers.clear();
    await userDb.cards.clear();
    await userDb.logs.clear();
  });

  it('generates distinct physical database names per user scope', () => {
    expect(getDatabaseName(null)).toBe('vocab-memorier-guest');
    expect(getDatabaseName('guest')).toBe('vocab-memorier-guest');
    expect(getDatabaseName('user-123')).toBe('vocab-memorier-user-user-123');
    expect(getDatabaseName('admin-uuid')).toBe('vocab-memorier-user-admin-uuid');
  });

  it('strictly isolates decks and card progress across Guest, User 1, and User 2', async () => {
    // 1. 游客模式创建词本
    switchActiveUser(null);
    const guestDeck = await deckRepo.create('游客词本');
    await deckRepo.addWordsToDeck(guestDeck.id, ['abandon', 'ability']);

    const guestDecks = await deckRepo.getAll();
    expect(guestDecks.length).toBe(1);
    expect(guestDecks[0].name).toBe('游客词本');

    // 2. 切换至 用户1 -> 本地词本应完全为空，不可泄露游客词本
    switchActiveUser('user-alpha');
    await userDb.decks.clear(); // 确保测试环境干净
    await userDb.deckMembers.clear();
    await userDb.cards.clear();

    const user1DecksBefore = await deckRepo.getAll();
    expect(user1DecksBefore.length).toBe(0);

    const user1Deck = await deckRepo.create('Alpha的考研词本');
    await deckRepo.addWordsToDeck(user1Deck.id, ['benchmark', 'boost']);
    const user1DecksAfter = await deckRepo.getAll();
    expect(user1DecksAfter.length).toBe(1);
    expect(user1DecksAfter[0].name).toBe('Alpha的考研词本');

    // 3. 切换至 用户2 -> 本地词本应完全为空，不可泄露游客或Alpha的词本
    switchActiveUser('user-beta');
    await userDb.decks.clear();
    await userDb.deckMembers.clear();
    await userDb.cards.clear();

    const user2DecksBefore = await deckRepo.getAll();
    expect(user2DecksBefore.length).toBe(0);

    const user2Deck = await deckRepo.create('Beta的托福词本');
    const user2DecksAfter = await deckRepo.getAll();
    expect(user2DecksAfter.length).toBe(1);
    expect(user2DecksAfter[0].name).toBe('Beta的托福词本');

    // 4. 切回 游客模式 -> 只能看到游客词本，绝无 Alpha 或 Beta 的词本
    switchActiveUser(null);
    const guestDecksAgain = await deckRepo.getAll();
    expect(guestDecksAgain.length).toBe(1);
    expect(guestDecksAgain[0].name).toBe('游客词本');
    const guestCards = await cardRepo.getCardsForDeck(guestDeck.id);
    expect(guestCards.map((c) => c.word)).toEqual(['abandon', 'ability']);

    // 5. 切回 用户1 -> 只能看到 Alpha 的词本
    switchActiveUser('user-alpha');
    const user1DecksAgain = await deckRepo.getAll();
    expect(user1DecksAgain.length).toBe(1);
    expect(user1DecksAgain[0].name).toBe('Alpha的考研词本');

    // 6. 切回 用户2 -> 只能看到 Beta 的词本
    switchActiveUser('user-beta');
    const user2DecksAgain = await deckRepo.getAll();
    expect(user2DecksAgain.length).toBe(1);
    expect(user2DecksAgain[0].name).toBe('Beta的托福词本');
  });

  it('migrates guest data to a newly registered user account and clears guest db', async () => {
    // 游客创建词本和卡片
    switchActiveUser(null);
    const guestDeck = await deckRepo.create('游客暂存词本');
    await deckRepo.addWordsToDeck(guestDeck.id, ['cat', 'dog']);

    // 游客注册新账户 'user-gamma'
    await migrateGuestDataToUser('user-gamma');
    switchActiveUser('user-gamma');

    // 验证新账户完整继承了词本与卡片
    const gammaDecks = await deckRepo.getAll();
    expect(gammaDecks.length).toBe(1);
    expect(gammaDecks[0].name).toBe('游客暂存词本');
    const gammaCards = await cardRepo.getCardsForDeck(guestDeck.id);
    expect(gammaCards.map((c) => c.word)).toEqual(['cat', 'dog']);

    // 切回游客模式，验证游客库已被清空，防止数据重复
    switchActiveUser(null);
    const guestDecksAfterMigrate = await deckRepo.getAll();
    expect(guestDecksAfterMigrate.length).toBe(0);
  });

  it('cleans up local database upon deleteUserLocalDb without affecting others', async () => {
    switchActiveUser('user-to-delete');
    await deckRepo.create('即将销毁的词本');
    expect((await deckRepo.getAll()).length).toBe(1);

    switchActiveUser('user-to-keep');
    await deckRepo.create('安全保留的词本');
    expect((await deckRepo.getAll()).length).toBe(1);

    // 删除 user-to-delete 的本地数据库
    await deleteUserLocalDb('user-to-delete');

    // 验证 user-to-keep 完好无损
    switchActiveUser('user-to-keep');
    const keptDecks = await deckRepo.getAll();
    expect(keptDecks.length).toBe(1);
    expect(keptDecks[0].name).toBe('安全保留的词本');

    // 验证 user-to-delete 已经清空/重置为新库
    switchActiveUser('user-to-delete');
    const deletedDecks = await deckRepo.getAll();
    expect(deletedDecks.length).toBe(0);
  });
});

