import React, { useState, useEffect } from 'react';
import { useTheme, ThemeMode } from '../../hooks/useTheme.ts';
import { dictDb } from '../../data/db/dictDb.ts';
import { ensureDictionaryLoaded } from '../../data/dictLoader.ts';
import { exportUserBackup, importUserBackup } from '../../data/backup/backupManager.ts';
import { TopAppBar } from '../../ui/components/TopAppBar.tsx';
import { MdCard } from '../../ui/components/MdCard.tsx';
import { MdButton } from '../../ui/components/MdButton.tsx';
import { useToast } from '../../ui/components/Toast.tsx';

import { DictUploadModal } from './DictUploadModal.tsx';

export const SettingsPage: React.FC = () => {
  const { mode, setMode } = useTheme();
  const { showToast } = useToast();

  const [dictInfo, setDictInfo] = useState<{ entries: number; links: number } | null>(null);
  const [dictName, setDictName] = useState<string>('OALDPE En-Cn 精装版 V2025.02.14');
  const [dictLoading, setDictLoading] = useState<boolean>(false);
  const [dictProgress, setDictProgress] = useState<string>('');
  const [isDictModalOpen, setIsDictModalOpen] = useState<boolean>(false);

  const checkDict = async () => {
    const eCount = await dictDb.entries.count();
    const lCount = await dictDb.links.count();
    const nameMeta = await dictDb.meta.get('dictName');
    if (nameMeta && typeof nameMeta.value === 'string' && nameMeta.value.trim()) {
      setDictName(nameMeta.value.trim());
    } else {
      setDictName('OALDPE En-Cn 精装版 V2025.02.14');
    }
    setDictInfo({ entries: eCount, links: lCount });
  };

  useEffect(() => {
    checkDict();
  }, []);

  const handleReloadDict = async () => {
    setDictLoading(true);
    try {
      await dictDb.meta.delete('loaded');
      await dictDb.meta.delete('dictName');
      await ensureDictionaryLoaded((pct, text) => {
        setDictProgress(`${pct}% - ${text}`);
      }, true);
      await checkDict();
      showToast('词典初始化成功！');
    } catch (err: unknown) {
      showToast(`词典加载失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDictLoading(false);
      setDictProgress('');
    }
  };

  const handleExport = async () => {
    const json = await exportUserBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocab-memorier-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('备份文件已成功导出！');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const res = await importUserBackup(text);
        showToast(`成功恢复 ${res.decksCount} 个单词本数据！`);
        setTimeout(() => window.location.reload(), 1000);
      } catch (err: unknown) {
        showToast(`恢复备份失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
  };

  const themeOptions: Array<{ key: ThemeMode; label: string; icon: string }> = [
    { key: 'light', label: '浅色主题', icon: 'light_mode' },
    { key: 'dark', label: '深色主题', icon: 'dark_mode' },
    { key: 'system', label: '跟随系统', icon: 'brightness_auto' },
  ];

  return (
    <div>
      <TopAppBar title="系统设置" subtitle="主题外观、词库状态与数据备份" />

      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* 主题设置 */}
        <MdCard variant="outlined">
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>外观与主题</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {themeOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMode(opt.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px',
                  borderRadius: 'var(--md-sys-shape-corner-large)',
                  border:
                    mode === opt.key
                      ? '2px solid var(--md-sys-color-primary)'
                      : '2px solid var(--md-sys-color-outline-variant)',
                  backgroundColor:
                    mode === opt.key
                      ? 'var(--md-sys-color-primary-container)'
                      : 'var(--md-sys-color-surface-container-low)',
                  color:
                    mode === opt.key
                      ? 'var(--md-sys-color-on-primary-container)'
                      : 'var(--md-sys-color-on-surface)',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span className="material-symbols-rounded">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </MdCard>

        {/* 词典管理 */}
        <MdCard variant="outlined">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-rounded" style={{ color: 'var(--md-sys-color-primary)', fontSize: '22px' }}>
                  auto_stories
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{dictName}</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', marginTop: '6px' }}>
                {dictInfo && dictInfo.entries > 0 ? (
                  <>
                    状态：<strong style={{ color: 'var(--md-sys-color-success)' }}>已就绪</strong>
                  </>
                ) : (
                  '尚未加载或正在等待拉取'
                )}
              </p>
              {dictProgress && (
                <p style={{ fontSize: '12px', color: 'var(--md-sys-color-primary)', marginTop: '6px' }}>
                  {dictProgress}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <MdButton
                variant="filled"
                size="sm"
                icon="upload_file"
                onClick={() => setIsDictModalOpen(true)}
              >
                更换/加载词典 (.zip)
              </MdButton>

              <MdButton
                variant="tonal"
                size="sm"
                icon="refresh"
                disabled={dictLoading}
                onClick={handleReloadDict}
              >
                {dictLoading ? '正在加载...' : '重新加载/校验默认词典'}
              </MdButton>
            </div>
          </div>
        </MdCard>

        {/* 数据安全与备份 */}
        <MdCard variant="outlined">
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>数据备份与恢复</h3>
          <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', marginBottom: '20px' }}>
            所有学习记录与单词本完全保存在本机的 IndexedDB 数据库中，不上传任何云端服务器。
          </p>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <MdButton variant="tonal" icon="download" onClick={handleExport}>
              导出学习数据备份 (JSON)
            </MdButton>

            <label>
              <MdButton variant="outlined" icon="upload" onClick={() => {}}>
                从备份文件恢复
              </MdButton>
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </MdCard>
      </div>

      <DictUploadModal
        isOpen={isDictModalOpen}
        onClose={() => setIsDictModalOpen(false)}
        onSuccess={(name, entries, links) => {
          setDictName(name);
          setDictInfo({ entries, links });
        }}
      />
    </div>
  );
};