import React, { useState, useRef } from 'react';
import { MdButton } from '../../ui/components/MdButton.tsx';
import { loadDictionaryFromZip } from '../../core/dict/zipDictLoader.ts';
import { useToast } from '../../ui/components/Toast.tsx';

interface DictUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (dictName: string, entries: number, links: number) => void;
}

export const DictUploadModal: React.FC<DictUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successInfo, setSuccessInfo] = useState<{
    dictName: string;
    entries: number;
    links: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleFileSelect = (file: File) => {
    setErrorMessage('');
    setSuccessInfo(null);

    const isZip =
      file.name.toLowerCase().endsWith('.zip') ||
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed';

    if (!isZip) {
      setErrorMessage('文件格式不正确：请选择 .zip 格式压缩包文件！');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleStartUpload = async () => {
    if (!selectedFile) {
      setErrorMessage('请先选择要上传的 .zip 词典压缩包');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setProgressPercent(5);
    setProgressStatus('正在准备解压...');

    try {
      const result = await loadDictionaryFromZip(selectedFile, (pct, status) => {
        setProgressPercent(pct);
        setProgressStatus(status);
      });

      setSuccessInfo({
        dictName: result.dictName,
        entries: result.entriesCount,
        links: result.linksCount,
      });
      showToast(`词典《${result.dictName}》加载成功！`);
      onSuccess(result.dictName, result.entriesCount, result.linksCount);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`加载失败: ${msg}`);
      setProgressPercent(0);
      setProgressStatus('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return; // 正在处理中防止意外中断
    setSelectedFile(null);
    setErrorMessage('');
    setSuccessInfo(null);
    setProgressPercent(0);
    setProgressStatus('');
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          backgroundColor: 'var(--md-sys-color-surface)',
          borderRadius: 'var(--md-sys-shape-corner-extra-large)',
          border: '1px solid var(--md-sys-color-outline-variant)',
          boxShadow: 'var(--md-sys-elevation-level3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--md-sys-color-outline-variant)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              className="material-symbols-rounded"
              style={{
                fontSize: '28px',
                color: 'var(--md-sys-color-primary)',
              }}
            >
              menu_book
            </span>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                更换 / 加载词典数据包
              </h2>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--md-sys-color-secondary)',
                  margin: '2px 0 0 0',
                }}
              >
                支持标准 MDict (.mdx) 压缩包，纯本地浏览器解压入库
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            disabled={isLoading}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              color: 'var(--md-sys-color-on-surface-variant)',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        {/* 模态主体内容区 */}
        <div
          style={{
            padding: '24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* 上传要求与规范说明卡片 */}
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 'var(--md-sys-shape-corner-large)',
              backgroundColor: 'var(--md-sys-color-surface-container-low)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '13px',
              lineHeight: 1.6,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--md-sys-color-primary)',
              }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>
                info
              </span>
              词典上传格式与使用说明
            </div>

            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>
                <strong>文件格式必须为 ZIP</strong>：上传文件须为 <code>.zip</code> 格式的压缩文件包。
              </li>
              <li>
                <strong>包含 MDX 文件</strong>：压缩包内须含有标准 MDict 格式的 <code>.mdx</code> 词典文件（如牛津高阶、朗文、柯林斯、剑桥等英汉或双解词库）。若包内含 <code>.mdd</code>（发音图片）或 <code>.css</code> 样式文件，系统将自动识别并仅解压提取 <code>.mdx</code> 词库，无需预先精简。
              </li>
              <li>
                <strong>浏览器纯本地解压</strong>：所有解压缩、词条解析与索引构建均完全在您的本地浏览器中完成，<strong>不消耗任何网络流量</strong>，保障隐私安全。
              </li>
              <li>
                <strong>学习数据安全</strong>：更换词典将重置本地离线释义查询库，但<strong>绝不会影响或修改您的单词本、背词记录和复习进度</strong>。
              </li>
            </ul>
          </div>

          {/* 文件拖拽选择区域 */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!isLoading) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !isLoading && fileInputRef.current?.click()}
            style={{
              padding: '28px 20px',
              border: isDragging
                ? '2px dashed var(--md-sys-color-primary)'
                : selectedFile
                ? '2px solid var(--md-sys-color-primary)'
                : '2px dashed var(--md-sys-color-outline)',
              borderRadius: 'var(--md-sys-shape-corner-large)',
              backgroundColor: isDragging
                ? 'var(--md-sys-color-primary-container)'
                : selectedFile
                ? 'var(--md-sys-color-surface-container-high)'
                : 'var(--md-sys-color-surface-container-lowest)',
              cursor: isLoading ? 'default' : 'pointer',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              transition: 'all 0.2s ease',
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".zip,application/zip,application/x-zip-compressed"
              style={{ display: 'none' }}
              disabled={isLoading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
                e.target.value = '';
              }}
            />

            <span
              className="material-symbols-rounded"
              style={{
                fontSize: '44px',
                color: selectedFile
                  ? 'var(--md-sys-color-primary)'
                  : 'var(--md-sys-color-outline)',
              }}
            >
              {selectedFile ? 'archive' : 'cloud_upload'}
            </span>

            {selectedFile ? (
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '15px' }}>
                  {selectedFile.name}
                </p>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '12px',
                    color: 'var(--md-sys-color-secondary)',
                  }}
                >
                  大小: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB ｜ 点击可更换文件
                </p>
              </div>
            ) : (
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '14px' }}>
                  点击选择 或 将词典 ZIP 压缩包拖拽至此处
                </p>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '12px',
                    color: 'var(--md-sys-color-secondary)',
                  }}
                >
                  仅支持 .zip 格式压缩包
                </p>
              </div>
            )}
          </div>

          {/* 进度条与状态显示 */}
          {isLoading && (
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--md-sys-shape-corner-medium)',
                backgroundColor: 'var(--md-sys-color-surface-container)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <span style={{ color: 'var(--md-sys-color-primary)' }}>
                  {progressStatus || '正在处理...'}
                </span>
                <span>{progressPercent}%</span>
              </div>

              {/* 进度条底槽 */}
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: 'var(--md-sys-color-surface-container-highest)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    backgroundColor: 'var(--md-sys-color-primary)',
                    borderRadius: '4px',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {errorMessage && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--md-sys-shape-corner-medium)',
                backgroundColor: 'var(--md-sys-color-error-container)',
                color: 'var(--md-sys-color-on-error-container)',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: '20px' }}>
                error
              </span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 成功状态 */}
          {successInfo && (
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--md-sys-shape-corner-medium)',
                backgroundColor: 'var(--md-sys-color-success-container)',
                color: 'var(--md-sys-color-on-success-container)',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                <span className="material-symbols-rounded" style={{ fontSize: '22px' }}>
                  check_circle
                </span>
                词典更换成功！
              </div>
              <p style={{ margin: 0 }}>
                词典名称：<strong>《{successInfo.dictName}》</strong>
              </p>
              <p style={{ margin: 0 }}>
                已导入实体词条：<strong>{successInfo.entries.toLocaleString()}</strong> 词 ｜
                屈折跳转映射：<strong>{successInfo.links.toLocaleString()}</strong> 条
              </p>
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--md-sys-color-outline-variant)',
            backgroundColor: 'var(--md-sys-color-surface-container-lowest)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <MdButton
            variant="outlined"
            onClick={handleClose}
            disabled={isLoading}
          >
            {successInfo ? '完成并关闭' : '取消'}
          </MdButton>

          {!successInfo && (
            <MdButton
              variant="filled"
              icon="upload"
              disabled={!selectedFile || isLoading}
              onClick={handleStartUpload}
            >
              {isLoading ? '正在解压加载...' : '开始解压并加载词典'}
            </MdButton>
          )}
        </div>
      </div>
    </div>
  );
};

