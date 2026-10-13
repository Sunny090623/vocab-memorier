import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cardRepo } from '../../data/repos/cardRepo.ts';
import { logRepo } from '../../data/repos/logRepo.ts';
import { deckRepo } from '../../data/repos/deckRepo.ts';
import { calculateDeckStats } from '../../core/stats/calculator.ts';
import { DeckStats } from '../../core/stats/types.ts';
import { TopAppBar } from '../../ui/components/TopAppBar.tsx';
import { MdCard } from '../../ui/components/MdCard.tsx';
import { MdButton } from '../../ui/components/MdButton.tsx';

export const StatsPage: React.FC = () => {
  const { deckId = '' } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const [deckName, setDeckName] = useState<string>('');
  const [stats, setStats] = useState<DeckStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const deck = await deckRepo.getById(deckId);
      if (deck) setDeckName(deck.name);

      const cards = await cardRepo.getCardsForDeck(deckId);
      const logs = await logRepo.getLogsForDeck(deckId);
      const calculated = calculateDeckStats(cards, logs);
      setStats(calculated);
      setLoading(false);
    };
    load();
  }, [deckId]);

  if (loading || !stats) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <p style={{ color: 'var(--md-sys-color-secondary)' }}>正在统计分析学习数据...</p>
      </div>
    );
  }

  const statCards = [
    {
      title: '通关进度',
      value: `${stats.masteredWords} / ${stats.totalWords}`,
      sub: `剩余 ${stats.remainingWords} 词待通关`,
      icon: 'done_all',
      color: 'var(--md-sys-color-primary)',
    },
    {
      title: '测试正确率',
      value: `${stats.accuracyPercent}%`,
      sub: '集中打乱测试表现',
      icon: 'verified',
      color: 'var(--md-sys-color-success)',
    },
    {
      title: '平均思考耗时',
      value: `${stats.avgDurationSec}s`,
      sub: '每道单词回忆速度',
      icon: 'timer',
      color: 'var(--md-sys-color-tertiary)',
    },
    {
      title: '速背通关效率',
      value: `${stats.masteredWordsPerHour}`,
      sub: '预计掌握词数 / 小时',
      icon: 'speed',
      color: 'var(--md-sys-color-secondary)',
    },
  ];

  return (
    <div>
      <TopAppBar
        title={`${deckName || '单词本'} · 统计报表`}
        subtitle="速背效率分析与错词清单"
        showBack
        actions={
          <MdButton icon="play_arrow" onClick={() => navigate(`/study/${deckId}`)}>
            继续刷词
          </MdButton>
        }
      />

      <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
        {/* 指标卡网格 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {statCards.map((sc, idx) => (
            <MdCard
              key={idx}
              variant="outlined"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--md-sys-color-secondary)' }}>
                  {sc.title}
                </span>
                <span className="material-symbols-rounded" style={{ color: sc.color, fontSize: '22px' }}>
                  {sc.icon}
                </span>
              </div>
              <div style={{ marginTop: '16px' }}>
                <h2 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {sc.value}
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--md-sys-color-secondary)', marginTop: '4px' }}>
                  {sc.sub}
                </p>
              </div>
            </MdCard>
          ))}
        </div>

        {/* 错词列表 */}
        <MdCard variant="outlined">
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>易错强化清单</h3>
            <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', marginTop: '4px' }}>
              记录测试阶段发生失误跌回初学的单词 (按跌回次数排序)
            </p>
          </div>

          {stats.lapseWords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--md-sys-color-secondary)' }}>
              <span className="material-symbols-rounded" style={{ fontSize: '40px', color: 'var(--md-sys-color-success)' }}>
                sentiment_very_satisfied
              </span>
              <p style={{ marginTop: '8px', fontSize: '14px' }}>太棒了！本单词本目前没有任何错词记录！</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                      backgroundColor: 'var(--md-sys-color-surface-container)',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '10px 16px' }}>单词</th>
                    <th style={{ padding: '10px 16px' }}>错题跌回次数 (Lapse)</th>
                    <th style={{ padding: '10px 16px' }}>累计刷词次数 (Reps)</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.lapseWords.map((lw, idx) => (
                    <tr
                      key={lw.word}
                      style={{
                        borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--md-sys-color-surface-container-lowest)',
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>{lw.word}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--md-sys-color-error)', fontWeight: 600 }}>
                        {lw.lapseCount} 次
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--md-sys-color-secondary)' }}>
                        {lw.reps} 次
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </MdCard>
      </div>
    </div>
  );
};