import React, { useState, useRef, useEffect } from 'react';

export interface MdSelectOption {
  value: string;
  label: string;
  badge?: string | number;
  icon?: string;
}

export interface MdSelectProps {
  options: MdSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  prefixIcon?: string;
  style?: React.CSSProperties;
  className?: string;
}

export const MdSelect: React.FC<MdSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '请选择',
  disabled = false,
  prefixIcon,
  style,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // 点击组件外部自动收起下拉菜单
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // 键盘快捷操作
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`md-select-container ${className}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        flex: 1,
        minWidth: '220px',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* 隐藏的标准 select 元素，便于测试脚本以及表单工具无感读取 */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 0,
          height: 0,
          opacity: 0,
          pointerEvents: 'none',
          margin: 0,
          border: 'none',
        }}
      >
        {options.length === 0 && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label} {opt.badge ? `(${opt.badge})` : ''}
          </option>
        ))}
      </select>

      {/* 自定义 Material 3 风格触发框 */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '10px 16px',
          borderRadius: 'var(--md-sys-shape-corner-medium, 16px)',
          border: isOpen
            ? '1.5px solid var(--md-sys-color-primary)'
            : '1px solid var(--md-sys-color-outline)',
          backgroundColor: isOpen
            ? 'var(--md-sys-color-surface-container)'
            : 'var(--md-sys-color-surface)',
          color: 'var(--md-sys-color-on-surface)',
          fontSize: '14px',
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 1px var(--md-sys-color-primary)' : 'none',
          transition: 'all 0.2s cubic-bezier(0.2, 0, 0, 1)',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          {prefixIcon && (
            <span
              className="material-symbols-rounded"
              style={{
                fontSize: '18px',
                color: 'var(--md-sys-color-primary)',
                flexShrink: 0,
              }}
            >
              {prefixIcon}
            </span>
          )}
          {selectedOption ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                }}
              >
                {selectedOption.label}
              </span>
              {selectedOption.badge !== undefined && (
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--md-sys-color-surface-container-high)',
                    color: 'var(--md-sys-color-on-surface-variant, var(--md-sys-color-on-surface))',
                    opacity: 0.85,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedOption.badge}
                </span>
              )}
            </div>
          ) : (
            <span
              style={{
                color: 'var(--md-sys-color-on-surface-variant)',
                opacity: 0.6,
              }}
            >
              {placeholder}
            </span>
          )}
        </div>

        {/* 右侧 Material 3 箭头指示器 */}
        <span
          className="material-symbols-rounded"
          style={{
            fontSize: '20px',
            color: isOpen ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline)',
            transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1), color 0.2s ease',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        >
          expand_more
        </span>
      </button>

      {/* 下拉弹出菜单 */}
      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            borderRadius: '14px',
            boxShadow:
              '0 12px 32px rgba(0, 0, 0, 0.32), 0 4px 12px rgba(0, 0, 0, 0.16)',
            padding: '6px',
            maxHeight: '260px',
            overflowY: 'auto',
            animation: 'fadeInSlide 0.15s cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          {options.length === 0 ? (
            <div
              style={{
                padding: '12px 16px',
                fontSize: '13px',
                color: 'var(--md-sys-color-on-surface-variant)',
                textAlign: 'center',
                opacity: 0.7,
              }}
            >
              暂无选项
            </div>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: isSelected ? 600 : 400,
                    backgroundColor: isSelected
                      ? 'var(--md-sys-color-primary-container)'
                      : 'transparent',
                    color: isSelected
                      ? 'var(--md-sys-color-on-primary-container)'
                      : 'var(--md-sys-color-on-surface)',
                    transition: 'background-color 0.15s ease',
                    marginBottom: '2px',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor =
                        'var(--md-sys-color-surface-container-highest)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{opt.label}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {opt.badge !== undefined && (
                      <span
                        style={{
                          fontSize: '12px',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          backgroundColor: isSelected
                            ? 'rgba(0, 0, 0, 0.1)'
                            : 'var(--md-sys-color-surface-container-highest)',
                          color: isSelected
                            ? 'var(--md-sys-color-on-primary-container)'
                            : 'var(--md-sys-color-on-surface-variant, var(--md-sys-color-on-surface))',
                        }}
                      >
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && (
                      <span
                        className="material-symbols-rounded"
                        style={{
                          fontSize: '18px',
                          color: 'var(--md-sys-color-primary)',
                        }}
                      >
                        check
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

