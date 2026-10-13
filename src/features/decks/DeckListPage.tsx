import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { deckRepo } from '../../data/repos/deckRepo.ts';
import { cardRepo } from '../../data/repos/cardRepo.ts';
import { syncService } from '../../data/sync/syncService.ts';
import { useAuth } from '../../core/auth/AuthContext.tsx';
import { DeckRecord, StudyMode } from '../../data/db/schema.ts';
import { TopAppBar } from '../../ui/components/TopAppBar.tsx';
import { MdCard } from '../../ui/components/MdCard.tsx';
import { MdButton } from '../../ui/components/MdButton.tsx';

export const DeckListPage: React.FC = () => {
  const { user } = useAuth();
  const [decks, setDecks] = useState<DeckRecord[]>([]);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newDeckName, setNewDeckName] = useState<string>('');
  const [newDeckMode, setNewDeckMode] = useState<StudyMode>('BATCH_CYCLE');
  const navigate = useNavigate();

  const loadDecks = async () => {
    const list = await deckRepo.getAll();
    setDecks(list);
  };

  useEffect(() => {
    loadDecks();
  }, [user?.id]);

  useEffect(() => {
    const unsubscribe = syncService.subscribe((status) => {
      if (status === 'synced' || status === 'idle') {
        loadDecks();
      }
    });
    return unsubscribe;
  }, []);

  const handleStudyDeck = async (deck: DeckRecord) => {
    if (deck.masteredCount === deck.wordCount && deck.wordCount > 0) {
      // 已经全员通关，重新复习时自动重置单词本卡片状态，重新开始新一轮速背
      await cardRepo.resetDeck(deck.id);
      await deckRepo.refreshCounts(deck.id);
    }
    navigate(`/study/${deck.id}`);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;
    const created = await deckRepo.create(newDeckName.trim(), undefined, newDeckMode);
    setNewDeckName('');
    setNewDeckMode('BATCH_CYCLE');
    setShowCreateModal(false);
    navigate(`/import?deckId=${created.id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('确定要删除该单词本吗？')) {
      await deckRepo.delete(id);
      loadDecks();
    }
  };

  return (
    <div>
      <TopAppBar
        title="我的单词本"
        subtitle="选择单词本开始速背"
        actions={
          <MdButton icon="add" onClick={() => setShowCreateModal(true)}>
            新建单词本
          </MdButton>
        }
      />

      <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
        {decks.length === 0 ? (
          <MdCard
            variant="outlined"
            style={{
              textAlign: 'center',
              padding: '64px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <span
              className="material-symbols-rounded"
              style={{ fontSize: '64px', color: 'var(--md-sys-color-outline)' }}
            >
              library_books
            </span>
            <h2 style={{ fontSize: '20px', fontWeight: 600 }}>还没有单词本</h2>
            <p style={{ color: 'var(--md-sys-color-secondary)', maxWidth: '400px' }}>
              创建一个单词本并导入你的待背单词列表，开始高效速背！
            </p>
            <MdButton icon="add" size="lg" onClick={() => setShowCreateModal(true)}>
              立即创建
            </MdButton>
          </MdCard>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '20px',
            }}
          >
            {decks.map((deck) => {
              const progressPct =
                deck.wordCount > 0 ? Math.round((deck.masteredCount / deck.wordCount) * 100) : 0;
              return (
                <MdCard
                  key={deck.id}
                  variant="outlined"
                  onClick={() => handleStudyDeck(deck)}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '180px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{deck.name}</h3>
                      <button
                        onClick={(e) => handleDelete(e, deck.id)}
                        style={{
                          color: 'var(--md-sys-color-outline)',
                          padding: '4px',
                          borderRadius: '50%',
                        }}
                        title="删除单词本"
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>
                          delete
                        </span>
                      </button>
                    </div>
                    {deck.description && (
                      <p
                        style={{
                          fontSize: '13px',
                          color: 'var(--md-sys-color-secondary)',
                          marginTop: '4px',
                        }}
                      >
                        {deck.description}
                      </p>
                    )}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 'var(--md-sys-shape-corner-full)',
                        backgroundColor:
                          deck.studyMode === 'FULL_DECK'
                            ? 'var(--md-sys-color-secondary-container)'
                            : 'var(--md-sys-color-primary-container)',
                        color:
                          deck.studyMode === 'FULL_DECK'
                            ? 'var(--md-sys-color-on-secondary-container)'
                            : 'var(--md-sys-color-on-primary-container)',
                        marginTop: '8px',
                        display: 'inline-block',
                      }}
                    >
                      {deck.studyMode === 'FULL_DECK' ? '全表通刷模式' : '组循环模式 (20词/组)'}
                    </span>
                  </div>

                  <div style={{ marginTop: '24px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        fontWeight: 600,
                        marginBottom: '8px',
                        color: 'var(--md-sys-color-secondary)',
                      }}
                    >
                      <span>
                        已通关 {deck.masteredCount} / {deck.wordCount}
                      </span>
                      <span>{progressPct}%</span>
                    </div>

                    {/* Progress Bar */}
                    <div
                      style={{
                        height: '8px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--md-sys-color-surface-container-highest)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${progressPct}%`,
                          backgroundColor:
                            progressPct === 100
                              ? 'var(--md-sys-color-success)'
                              : 'var(--md-sys-color-primary)',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '16px',
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/stats/${deck.id}`);
                        }}
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--md-sys-color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
                          analytics
                        </span>
                        统计
                      </button>

                      <MdButton
                        size="sm"
                        icon={
                          deck.masteredCount === deck.wordCount && deck.wordCount > 0
                            ? 'replay'
                            : 'play_arrow'
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStudyDeck(deck);
                        }}
                      >
                        {deck.masteredCount === deck.wordCount && deck.wordCount > 0
                          ? '重新复习'
                          : '开始刷词'}
                      </MdButton>
                    </div>
                  </div>
                </MdCard>
              );
            })}
          </div>
        )}
      </div>

      {/* 新建弹窗 */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--md-sys-color-surface)',
              borderRadius: 'var(--md-sys-shape-corner-extra-large)',
              padding: '28px',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>新建单词本</h3>
            <form onSubmit={handleCreate}>
              <input
                autoFocus
                placeholder="例如：专四高频核心词、托福冲刺"
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 'var(--md-sys-shape-corner-medium)',
                  border: '1px solid var(--md-sys-color-outline)',
                  backgroundColor: 'var(--md-sys-color-surface-container-low)',
                  color: 'var(--md-sys-color-on-surface)',
                  fontSize: '15px',
                  marginBottom: '16px',
                  outline: 'none',
                }}
              />

              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--md-sys-color-secondary)',
                    display: 'block',
                    marginBottom: '8px',
                  }}
                >
                  速背学习模式
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: 'var(--md-sys-shape-corner-medium)',
                      border:
                        newDeckMode === 'BATCH_CYCLE'
                          ? '2px solid var(--md-sys-color-primary)'
                          : '2px solid var(--md-sys-color-outline-variant)',
                      backgroundColor:
                        newDeckMode === 'BATCH_CYCLE'
                          ? 'var(--md-sys-color-primary-container)'
                          : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="studyMode"
                      value="BATCH_CYCLE"
                      checked={newDeckMode === 'BATCH_CYCLE'}
                      onChange={() => setNewDeckMode('BATCH_CYCLE')}
                      style={{ accentColor: 'var(--md-sys-color-primary)' }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: 'var(--md-sys-color-on-surface)',
                        }}
                      >
                        组循环模式 (每组 20 词 · 默认推荐)
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--md-sys-color-secondary)' }}>
                        逐组闭环独立通关后，再推进进入下一组。
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: 'var(--md-sys-shape-corner-medium)',
                      border:
                        newDeckMode === 'FULL_DECK'
                          ? '2px solid var(--md-sys-color-primary)'
                          : '2px solid var(--md-sys-color-outline-variant)',
                      backgroundColor:
                        newDeckMode === 'FULL_DECK'
                          ? 'var(--md-sys-color-primary-container)'
                          : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="studyMode"
                      value="FULL_DECK"
                      checked={newDeckMode === 'FULL_DECK'}
                      onChange={() => setNewDeckMode('FULL_DECK')}
                      style={{ accentColor: 'var(--md-sys-color-primary)' }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: 'var(--md-sys-color-on-surface)',
                        }}
                      >
                        全表通刷模式 (整表单组)
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--md-sys-color-secondary)' }}>
                        整张词表作为一个大组，初学完成后统一打乱测试。
                      </div>
                    </div>
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <MdButton variant="tonal" onClick={() => setShowCreateModal(false)}>
                  取消
                </MdButton>
                <MdButton type="submit" disabled={!newDeckName.trim()}>
                  确定创建
                </MdButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};