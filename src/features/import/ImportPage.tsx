import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { deckRepo } from '../../data/repos/deckRepo.ts';
import { dictRepo, DictSearchResult } from '../../data/repos/dictRepo.ts';
import { syncService } from '../../data/sync/syncService.ts';
import { DeckRecord } from '../../data/db/schema.ts';
import { parseTextContent } from '../../core/importer/textParser.ts';
import { parseCsvContent } from '../../core/importer/csvParser.ts';
import { useAuth } from '../../core/auth/AuthContext.tsx';
import { TopAppBar } from '../../ui/components/TopAppBar.tsx';
import { MdCard } from '../../ui/components/MdCard.tsx';
import { MdButton } from '../../ui/components/MdButton.tsx';
import { MdSelect } from '../../ui/components/MdSelect.tsx';
import { useToast } from '../../ui/components/Toast.tsx';

export const ImportPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedDeckId = searchParams.get('deckId');

  const [decks, setDecks] = useState<DeckRecord[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>(preselectedDeckId || '');
  const [inputText, setInputText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewList, setPreviewList] = useState<DictSearchResult[]>([]);
  const [dupCount, setDupCount] = useState<number>(0);
  const [unmatchedCount, setUnmatchedCount] = useState<number>(0);

  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    const load = async () => {
      const list = await deckRepo.getAll();
      setDecks(list);
      if (!selectedDeckId && list.length > 0) {
        setSelectedDeckId(list[0].id);
      }
    };
    load();
  }, [user?.id, selectedDeckId]);

  // 解析并匹配词库
  const handleParseAndMatch = async (content: string, isCsv = false) => {
    if (!content.trim()) {
      setPreviewList([]);
      setDupCount(0);
      setUnmatchedCount(0);
      return;
    }

    setIsProcessing(true);
    const parsed = isCsv ? parseCsvContent(content) : parseTextContent(content);
    setDupCount(parsed.duplicateWords.length);

    // 匹配字典
    const matchMap = await dictRepo.lookupBatch(parsed.uniqueWords);
    const results: DictSearchResult[] = [];
    let unmatched = 0;

    for (const w of parsed.uniqueWords) {
      const m = matchMap.get(w);
      if (m) {
        results.push(m);
        if (!m.isMatched) unmatched++;
      }
    }

    setPreviewList(results);
    setUnmatchedCount(unmatched);
    setIsProcessing(false);
  };

  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    // 250ms 防抖，避免打字时每按一键就执行高昂的全量正则解析与 IndexedDB 查询
    debounceTimerRef.current = window.setTimeout(() => {
      handleParseAndMatch(val, false);
    }, 250);
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setIsProcessing(true);

    try {
      // 1. 获取当前输入框中已有的单词集合（保持大小写无关比对）
      const existingParsed = parseTextContent(inputText);
      const seenWords = new Set<string>(existingParsed.uniqueWords.map((w) => w.toLowerCase()));

      let newlyAddedCount = 0;
      let duplicateFilteredCount = 0;
      const linesToAppend: string[] = [];

      // 2. 依次读取并解析所有上传的文件
      for (const file of files) {
        const text = await file.text();
        const isCsv = file.name.toLowerCase().endsWith('.csv');
        const parsed = isCsv ? parseCsvContent(text) : parseTextContent(text);

        duplicateFilteredCount += parsed.duplicateWords.length;

        for (const item of parsed.validItems) {
          const lower = item.word.toLowerCase();
          if (seenWords.has(lower)) {
            duplicateFilteredCount++;
          } else {
            seenWords.add(lower);
            newlyAddedCount++;
            const line = item.customNote ? `${item.word} ${item.customNote}` : item.word;
            linesToAppend.push(line);
          }
        }
      }

      // 3. 将新提取的不重复单词追加合并至原有输入框中
      let mergedText = inputText.trim();
      if (linesToAppend.length > 0) {
        if (mergedText) {
          mergedText += '\n' + linesToAppend.join('\n');
        } else {
          mergedText = linesToAppend.join('\n');
        }
      }

      setInputText(mergedText);
      await handleParseAndMatch(mergedText, false);

      // 4. 用户反馈提示
      if (files.length > 1) {
        showToast(
          `已从 ${files.length} 个文件追加合并 ${newlyAddedCount} 个词 (自动剔除 ${duplicateFilteredCount} 个重复词)`
        );
      } else if (inputText.trim()) {
        showToast(
          `已追加合并 ${newlyAddedCount} 个新词 (自动跳过 ${duplicateFilteredCount} 个重复词)`
        );
      } else {
        showToast(
          `已导入 ${newlyAddedCount} 个单词 (自动剔除 ${duplicateFilteredCount} 个重复词)`
        );
      }
    } catch (err: unknown) {
      showToast(`读取文件失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
      e.target.value = ''; // 清空 input 以便下次再次选择相同文件名仍能触发 onChange
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedDeckId) {
      showToast('请先选择或创建一个单词本！');
      return;
    }
    if (previewList.length === 0) {
      showToast('没有可导入的有效单词！');
      return;
    }

    setIsProcessing(true);
    const wordsToImport = previewList.map((p) => p.word);
    const { addedCount, duplicateCount } = await deckRepo.addWordsToDeck(
      selectedDeckId,
      wordsToImport
    );

    // 触发云端同步
    syncService.triggerSyncDebounced(200);

    setIsProcessing(false);
    showToast(`成功导入 ${addedCount} 个单词！(跳过已有 ${duplicateCount} 词)`);
    navigate(`/study/${selectedDeckId}`);
  };

  return (
    <div>
      <TopAppBar title="导入待背词表" subtitle="支持 TXT 与 CSV 格式，自动匹配牛津词典" />

      <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
        <MdCard variant="outlined" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>
            1. 选择目标单词本
          </h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <MdSelect
              value={selectedDeckId}
              onChange={(val) => setSelectedDeckId(val)}
              options={decks.map((d) => ({
                value: d.id,
                label: d.name,
                badge: `${d.wordCount} 词`,
              }))}
              placeholder={decks.length === 0 ? '暂无单词本 (请先创建)' : '选择目标单词本'}
              prefixIcon="style"
            />

            <MdButton
              variant="tonal"
              size="sm"
              icon="add"
              onClick={async () => {
                const name = window.prompt('请输入新单词本名称：');
                if (name?.trim()) {
                  const created = await deckRepo.create(name.trim());
                  const list = await deckRepo.getAll();
                  setDecks(list);
                  setSelectedDeckId(created.id);
                }
              }}
            >
              新建单词本
            </MdButton>
          </div>
        </MdCard>

        <MdCard variant="outlined" style={{ marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>2. 粘贴或上传词表</h3>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              {inputText.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setInputText('');
                    handleParseAndMatch('', false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--md-sys-color-error)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                  }}
                  title="清空当前输入列表"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>
                    delete_sweep
                  </span>
                  清空词表
                </button>
              )}
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--md-sys-color-primary)',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--md-sys-color-surface-container-high)',
                }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>upload</span>
                上传 TXT/CSV 文件 (可追加/多选)
                <input
                  type="file"
                  multiple
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          <textarea
            placeholder={`在此粘贴单词列表`}
            value={inputText}
            onChange={handleTextChange}
            rows={8}
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 'var(--md-sys-shape-corner-medium)',
              border: '1px solid var(--md-sys-color-outline)',
              backgroundColor: 'var(--md-sys-color-surface-container-low)',
              color: 'var(--md-sys-color-on-surface)',
              fontSize: '14px',
              fontFamily: 'monospace',
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none',
            }}
          />
        </MdCard>

        {previewList.length > 0 && (
          <MdCard variant="outlined" style={{ marginBottom: '24px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
                  3. 导入解析与词典匹配预览
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--md-sys-color-secondary)', marginTop: '2px' }}>
                  提取有效词数：<strong>{previewList.length}</strong> ｜ 字典收录：
                  <strong style={{ color: 'var(--md-sys-color-success)' }}>
                    {previewList.length - unmatchedCount}
                  </strong>{' '}
                  {unmatchedCount > 0 && (
                    <span style={{ color: 'var(--md-sys-color-error)', marginLeft: '6px' }}>
                      (未收录: {unmatchedCount})
                    </span>
                  )}
                  {dupCount > 0 && <span style={{ marginLeft: '6px' }}>(重复已去重: {dupCount})</span>}
                </p>
              </div>

              <MdButton
                size="md"
                icon="check_circle"
                onClick={handleConfirmImport}
                disabled={isProcessing || !selectedDeckId}
              >
                确认导入 ({previewList.length} 词)
              </MdButton>
            </div>

            <div
              style={{
                maxHeight: '320px',
                overflowY: 'auto',
                border: '1px solid var(--md-sys-color-outline-variant)',
                borderRadius: 'var(--md-sys-shape-corner-medium)',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr
                    style={{
                      backgroundColor: 'var(--md-sys-color-surface-container)',
                      borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '10px 14px' }}>单词</th>
                    <th style={{ padding: '10px 14px' }}>音标</th>
                    <th style={{ padding: '10px 14px' }}>词性</th>
                    <th style={{ padding: '10px 14px' }}>中文释义</th>
                  </tr>
                </thead>
                <tbody>
                  {previewList.map((item, idx) => (
                    <tr
                      key={item.word + idx}
                      style={{
                        borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--md-sys-color-surface-container-lowest)',
                      }}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                        {item.displayWord}
                        {item.linkedFrom && (
                          <span
                            style={{
                              fontSize: '11px',
                              marginLeft: '4px',
                              color: 'var(--md-sys-color-secondary)',
                            }}
                          >
                            (→{item.linkedFrom})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--md-sys-color-secondary)' }}>
                        {item.phonetic ? `/${item.phonetic}/` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {item.pos.length > 0 ? (
                          item.pos.map((p) => (
                            <span
                              key={p}
                              style={{
                                display: 'inline-block',
                                padding: '2px 6px',
                                marginRight: '4px',
                                borderRadius: '4px',
                                backgroundColor: 'var(--md-sys-color-secondary-container)',
                                color: 'var(--md-sys-color-on-secondary-container)',
                                fontSize: '11px',
                                fontWeight: 600,
                              }}
                            >
                              {p}
                            </span>
                          ))
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {item.definitions.length > 0 ? (
                          item.definitions.slice(0, 2).join('；')
                        ) : (
                          <span style={{ color: 'var(--md-sys-color-error)' }}>词典未收录</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MdCard>
        )}
      </div>
    </div>
  );
};