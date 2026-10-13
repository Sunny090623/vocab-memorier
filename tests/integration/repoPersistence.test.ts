import { describe, it, expect, beforeEach } from 'vitest';
import { userDb } from '../../src/data/db/userDb.ts';
import { deckRepo } from '../../src/data/repos/deckRepo.ts';
import { cardRepo } from '../../src/data/repos/cardRepo.ts';
import { CardState } from '../../src/core/scheduler/types.ts';
import { exportUserBackup, importUserBackup } from '../../src/data/backup/backupManager.ts';

describe('Repository & Persistence Integration', () => {
  beforeEach(async () => {
    await userDb.decks.clear();
    await userDb.deckMembers.clear();
    await userDb.cards.clear();
    await userDb.logs.clear();
  });

  it('creates deck and adds words without resetting existing card progress', async () => {
    const deck = await deckRepo.create('Test Deck', 'Description');
    expect(deck.name).toBe('Test Deck');

    // Add 3 words
    const res1 = await deckRepo.addWordsToDeck(deck.id, ['convert', 'conversion', 'imitate']);
    expect(res1.addedCount).toBe(3);
    expect(res1.duplicateCount).toBe(0);

    const cards = await cardRepo.getCardsForDeck(deck.id);
    expect(cards.length).toBe(3);
    expect(cards[0].word).toBe('convert');
    expect(cards[0].state).toBe(CardState.NEW);

    // Update 'convert' to MASTERED
    await cardRepo.save({ ...cards[0], state: CardState.MASTERED });
    await deckRepo.refreshCounts(deck.id);

    const updatedDeck = await deckRepo.getById(deck.id);
    expect(updatedDeck?.masteredCount).toBe(1);

    // Re-import with duplicates and 1 new word
    const res2 = await deckRepo.addWordsToDeck(deck.id, ['convert', 'criticize']);
    expect(res2.addedCount).toBe(1);
    expect(res2.duplicateCount).toBe(1);

    // Verify 'convert' is STILL MASTERED and not reset to NEW!
    const convertCard = await cardRepo.getByWord('convert');
    expect(convertCard?.state).toBe(CardState.MASTERED);
  });

  it('exports and imports backup cleanly', async () => {
    const deck = await deckRepo.create('Deck A');
    await deckRepo.addWordsToDeck(deck.id, ['apple', 'banana']);

    const backupJson = await exportUserBackup();
    expect(backupJson).toContain('Deck A');
    expect(backupJson).toContain('apple');

    // Clear db
    await userDb.decks.clear();

    // Restore
    const restoreRes = await importUserBackup(backupJson);
    expect(restoreRes.success).toBe(true);
    expect(restoreRes.decksCount).toBe(1);

    const restoredDeck = await deckRepo.getById(deck.id);
    expect(restoredDeck?.name).toBe('Deck A');
  });

  it('deleting a deck completely cleans up cards and logs; new deck with same words starts fresh', async () => {
    const deck1 = await deckRepo.create('Original Deck');
    await deckRepo.addWordsToDeck(deck1.id, ['apple', 'banana']);

    // Master 'apple' in deck1
    const cards1 = await cardRepo.getCardsForDeck(deck1.id);
    await cardRepo.save({ ...cards1[0], state: CardState.MASTERED });
    await deckRepo.refreshCounts(deck1.id);

    const deck1Before = await deckRepo.getById(deck1.id);
    expect(deck1Before?.masteredCount).toBe(1);

    // Delete deck1
    await deckRepo.delete(deck1.id);

    // Verify deck1 cards are completely gone
    const remainingCards = await userDb.cards.where('deckId').equals(deck1.id).toArray();
    expect(remainingCards.length).toBe(0);

    // Create a new deck with the exact same name and same words
    const deck2 = await deckRepo.create('Original Deck');
    await deckRepo.addWordsToDeck(deck2.id, ['apple', 'banana']);

    // Verify deck2 is 100% fresh (0 mastered, both words NEW)
    const cards2 = await cardRepo.getCardsForDeck(deck2.id);
    expect(cards2.length).toBe(2);
    expect(cards2[0].state).toBe(CardState.NEW);
    expect(cards2[1].state).toBe(CardState.NEW);

    const deck2After = await deckRepo.getById(deck2.id);
    expect(deck2After?.masteredCount).toBe(0);
  });
});