import Dexie, { type EntityTable } from 'dexie';
import type { DictEntryRecord, DictLinkRecord, DictMetaRecord } from './schema.ts';

export class DictDatabase extends Dexie {
  entries!: EntityTable<DictEntryRecord, 'word'>;
  links!: EntityTable<DictLinkRecord, 'word'>;
  meta!: EntityTable<DictMetaRecord, 'key'>;

  constructor() {
    super('vocab-memorier-dict');
    this.version(1).stores({
      entries: 'word',
      links: 'word, target',
      meta: 'key',
    });
  }
}

export const dictDb = new DictDatabase();