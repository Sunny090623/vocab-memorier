import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStudySession } from '../../hooks/useStudySession.ts';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.ts';
import { UserRating, CardState } from '../../core/scheduler/types.ts';
import { TopAppBar } from '../../ui/components/TopAppBar.tsx';
import { MdCard } from '../../ui/components/MdCard.tsx';
import { MdButton } from '../../ui/components/MdButton.tsx';
import { useToast } from '../../ui/components/Toast.tsx';

export const StudyPage: React.FC = () => {
  const { deckId = '' } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const {
    loading,
    deckName,
    studyMode,
    currentGroupIndex,
    totalGroupsCount,
    groupPhase,
    currentCard,
    currentDict,
    currentCardCooldown,
    isAnswerRevealed,
    isLocked,
    canUndo,
    groupProgress,
    overallProgress,
    revealAnswer,
    rateCard,
    undoLastAction,
    proceedToNextGroup,
    restartSession,
  } = useStudySession(deckId);

  const [, setTick] = useState<number>(0);

  useEffect(() => {
    if (!currentCardCooldown?.isCooling) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [currentCardCooldown?.isCooling, currentCard?.word]);

  const now = Date.now();
  const cooldownSeconds =
    currentCardCooldown?.isCooling && currentCardCooldown?.targetDue
      ? Math.max(0, Math.ceil((currentCardCooldown.targetDue - now) / 1000))
      : 0;
  const isCooldownActive =
    currentCard?.state === CardState.TESTING &&
    Boolean(currentCardCooldown?.isCooling) &&
    cooldownSeconds > 0;

  const handleRate = async (rating: UserRating, options?: { bypassCooldown?: boolean }) => {
    if (isCooldownActive && rating === UserRating.GOOD && !options?.bypassCooldown) {
      showToast(
        `⚠️ 仍处于 90 秒记忆保护期内（还剩 ${cooldownSeconds}s），提前答对不累加通关计数。可等待倒计时结束或点击「免等待」按钮！`
      );
    }
    await rateCard(rating, options);
  };

  // 绑定全局快捷键
  useKeyboardShortcuts({
    isAnswerRevealed,
    isLocked,
    onReveal: revealAnswer,
    onRate: handleRate,
    onUndo: () => {
      undoLastAction();
      showToast('已撤销上一步操作');
    },
    enabled: !!currentCard,
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <p style={{ color: 'var(--md-sys-color-secondary)' }}>正在加载学习会话...</p>
      </div>
    );
  }

  const groupPct =
    groupProgress.total > 0
      ? Math.round((groupProgress.mastered / groupProgress.total) * 100)
      : 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopAppBar
        title={deckName || '速背'}
        subtitle={
          groupPhase === 'DECK_COMPLETED'
            ? `全表已通关 ${overallProgress?.mastered || 0}/${overallProgress?.total || 0} 词 · 达成全员掌握`
            : totalGroupsCount > 1
            ? `第 ${Math.min(currentGroupIndex + 1, totalGroupsCount)} / ${totalGroupsCount} 组 (组循环 · 本组 ${groupProgress.mastered}/${groupProgress.total}) · 全表已通关 ${overallProgress?.mastered || 0}/${overallProgress?.total || 0}`
            : `${studyMode === 'FULL_DECK' ? '全表通刷模式' : '单组速背'} · 总进度：${groupProgress.mastered} / ${groupProgress.total} 词`
        }
        showBack
        actions={
          <button
            onClick={() => navigate(`/stats/${deckId}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 12px',
              borderRadius: 'var(--md-sys-shape-corner-full)',
              color: 'var(--md-sys-color-secondary)',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <span className="material-symbols-rounded">bar_chart</span>
            统计
          </button>
        }
      />

      {/* Progress Strip */}
      <div
        style={{
          height: '4px',
          width: '100%',
          backgroundColor: 'var(--md-sys-color-surface-container-highest)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${groupPct}%`,
            backgroundColor:
              groupPct === 100 ? 'var(--md-sys-color-success)' : 'var(--md-sys-color-primary)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px 80px',
          maxWidth: '720px',
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* 全表通关态 */}
        {groupPhase === 'DECK_COMPLETED' ? (
          <MdCard
            variant="elevated"
            style={{
              textAlign: 'center',
              padding: '64px 32px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            <span
              className="material-symbols-rounded"
              style={{ fontSize: '72px', color: 'var(--md-sys-color-success)' }}
            >
              emoji_events
            </span>
            <h2 style={{ fontSize: '28px', fontWeight: 800 }}>🏆 恭喜！本单词本已全员通关！</h2>
            <p style={{ color: 'var(--md-sys-color-secondary)', maxWidth: '420px', lineHeight: 1.6 }}>
              你已连续独立攻克该词表的全部单词。可前往统计页面查看本次速背的思考速度与错题回访。
            </p>
            <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <MdButton icon="replay" onClick={restartSession}>
                重新复习本词表 (再背一遍)
              </MdButton>
              <MdButton variant="tonal" onClick={() => navigate(`/stats/${deckId}`)}>
                查看学习统计
              </MdButton>
              <MdButton variant="outlined" onClick={() => navigate('/decks')}>
                返回单词本列表
              </MdButton>
            </div>
          </MdCard>
        ) : groupPhase === 'GROUP_COMPLETED' ? (
          /* 当前组通关态 */
          <MdCard
            variant="elevated"
            style={{
              textAlign: 'center',
              padding: '56px 32px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '18px',
            }}
          >
            <span
              className="material-symbols-rounded"
              style={{ fontSize: '64px', color: 'var(--md-sys-color-primary)' }}
            >
              celebration
            </span>
            <h2 style={{ fontSize: '24px', fontWeight: 700 }}>
              🎉 第 {currentGroupIndex + 1} 组已全部通关！
            </h2>
            <p style={{ color: 'var(--md-sys-color-secondary)', lineHeight: 1.6 }}>
              本组 {groupProgress.total} 个单词已达成独立闭卷测试标准。请稍作喘息，准备进入下一组！
            </p>
            <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
              <MdButton variant="tonal" onClick={() => navigate(`/stats/${deckId}`)}>
                阶段报表
              </MdButton>
              <MdButton size="lg" icon="arrow_forward" onClick={proceedToNextGroup}>
                进入下一组速背
              </MdButton>
            </div>
          </MdCard>
        ) : currentCard ? (
          /* 核心速背大卡片 */
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <MdCard
              variant="elevated"
              onClick={!isAnswerRevealed ? revealAnswer : undefined}
              style={{
                minHeight: '440px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '36px 32px',
                cursor: !isAnswerRevealed ? 'pointer' : 'default',
                userSelect: 'none',
                transition: 'none',
              }}
            >
              {/* 卡片头部标识 */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minHeight: '32px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: 'var(--md-sys-shape-corner-full)',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor:
                        groupPhase === 'INITIAL_LEARNING'
                          ? 'var(--md-sys-color-secondary-container)'
                          : isCooldownActive
                          ? 'var(--md-sys-color-tertiary-container)'
                          : 'var(--md-sys-color-primary-container)',
                      color:
                        groupPhase === 'INITIAL_LEARNING'
                          ? 'var(--md-sys-color-on-secondary-container)'
                          : isCooldownActive
                          ? 'var(--md-sys-color-on-tertiary-container)'
                          : 'var(--md-sys-color-on-primary-container)',
                    }}
                  >
                    {groupPhase === 'INITIAL_LEARNING'
                      ? '阶段一：初学识记'
                      : isCooldownActive
                      ? `阶段二：独立测试 · 冷却巩固中 (${cooldownSeconds}s)`
                      : '阶段二：独立测试'}
                  </span>

                  {isCooldownActive && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRate(UserRating.GOOD, { bypassCooldown: true });
                        showToast('⚡ 已免等待计入独立通关！');
                      }}
                      title="跳过 90 秒冷却，直接计入独立通关"
                      style={{
                        padding: '3px 10px',
                        borderRadius: 'var(--md-sys-shape-corner-full)',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: 'var(--md-sys-color-primary-container)',
                        color: 'var(--md-sys-color-on-primary-container)',
                        border: '1px solid var(--md-sys-color-primary)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>
                        bolt
                      </span>
                      ⚡ 免等待通关
                    </button>
                  )}
                </div>

                {currentCard.state === 'TESTING' && currentCard.consecutiveSuccess > 0 && (
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--md-sys-color-success)',
                    }}
                  >
                    ★ 已连对 {currentCard.consecutiveSuccess} 次
                  </span>
                )}
              </div>

              {/* 核心英文单词展示 */}
              <div style={{ textAlign: 'center', padding: '28px 0 20px' }}>
                <h1
                  style={{
                    fontSize: '40px',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                    color: 'var(--md-sys-color-on-surface)',
                  }}
                >
                  {currentDict?.displayWord || currentCard.word}
                </h1>

                {/* 音标 */}
                {currentDict?.phonetic && (
                  <p
                    style={{
                      fontSize: '18px',
                      color: 'var(--md-sys-color-secondary)',
                      marginTop: '8px',
                      fontWeight: 500,
                    }}
                  >
                    /{currentDict.phonetic}/
                  </p>
                )}
              </div>

              {/* 答案区域（揭示前后稳定高度容器，杜绝跳动与屏闪） */}
              <div
                style={{
                  minHeight: '160px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                {!isAnswerRevealed ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '16px',
                      borderRadius: 'var(--md-sys-shape-corner-medium)',
                      backgroundColor: 'var(--md-sys-color-surface-container)',
                      color: 'var(--md-sys-color-secondary)',
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    按 <kbd style={{ padding: '2px 6px', background: 'rgba(0,0,0,0.06)', borderRadius: '4px' }}>Space</kbd> 或点击卡片揭示答案
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '20px',
                      borderRadius: 'var(--md-sys-shape-corner-large)',
                      backgroundColor: 'var(--md-sys-color-surface-container)',
                    }}
                  >
                    {/* 词性 */}
                    {currentDict?.pos && currentDict.pos.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        {currentDict.pos.map((p) => (
                          <span
                            key={p}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--md-sys-color-primary-container)',
                              color: 'var(--md-sys-color-on-primary-container)',
                              fontSize: '12px',
                              fontWeight: 700,
                            }}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 中文释义 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {currentDict?.definitions && currentDict.definitions.length > 0 ? (
                        currentDict.definitions.slice(0, 4).map((d, idx) => (
                          <p key={idx} style={{ fontSize: '15px', lineHeight: 1.5, fontWeight: 500 }}>
                            {currentDict.definitions.length > 1 && (
                              <span style={{ color: 'var(--md-sys-color-secondary)', marginRight: '6px' }}>
                                {idx + 1}.
                              </span>
                            )}
                            {d}
                          </p>
                        ))
                      ) : (
                        <p style={{ color: 'var(--md-sys-color-secondary)', fontSize: '14px' }}>
                          词典未收录该词释义
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </MdCard>

            {/* 底部操作反馈栏 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {isAnswerRevealed ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <MdButton
                    variant="error-tonal"
                    size="lg"
                    disabled={isLocked}
                    onClick={() => handleRate(UserRating.AGAIN)}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span>不认识 (1)</span>
                    </span>
                  </MdButton>

                  <MdButton
                    variant="tertiary-tonal"
                    size="lg"
                    disabled={isLocked}
                    onClick={() => handleRate(UserRating.HARD)}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span>模糊 (2)</span>
                    </span>
                  </MdButton>

                  <MdButton
                    variant="success-tonal"
                    size="lg"
                    disabled={isLocked}
                    onClick={() => handleRate(UserRating.GOOD)}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span>认识 (3 / ␣)</span>
                    </span>
                  </MdButton>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                  <MdButton size="lg" onClick={revealAnswer} style={{ flex: 1 }}>
                    揭示答案 (Space)
                  </MdButton>
                  {isCooldownActive && (
                    <MdButton
                      size="lg"
                      variant="tonal"
                      onClick={() => {
                        handleRate(UserRating.GOOD, { bypassCooldown: true });
                        showToast('⚡ 已免等待计入独立通关！');
                      }}
                      style={{
                        backgroundColor: 'var(--md-sys-color-primary-container)',
                        color: 'var(--md-sys-color-on-primary-container)',
                      }}
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: '18px', marginRight: '4px' }}>
                        bolt
                      </span>
                      免等待通关
                    </MdButton>
                  )}
                </div>
              )}

              {/* 撤销按钮 */}
              {canUndo && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => {
                      undoLastAction();
                      showToast('已撤销上一步操作');
                    }}
                    style={{
                      fontSize: '13px',
                      color: 'var(--md-sys-color-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                    }}
                  >
                    <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
                      undo
                    </span>
                    撤销上一步 (Z)
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* 队列临时处于冷却结算状态 */
          <MdCard variant="outlined" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
              组内卡片冷却就绪中
            </h3>
            <p style={{ color: 'var(--md-sys-color-secondary)', marginBottom: '20px' }}>
              即将开启下一轮独立测试...
            </p>
            <MdButton onClick={() => window.location.reload()}>刷新队列</MdButton>
          </MdCard>
        )}
      </div>
    </div>
  );
};