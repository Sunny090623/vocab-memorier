import React from 'react';

interface MdButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'tonal' | 'outlined' | 'error-tonal' | 'tertiary-tonal' | 'success-tonal';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  children: React.ReactNode;
}

export const MdButton: React.FC<MdButtonProps> = ({
  variant = 'filled',
  size = 'md',
  icon,
  children,
  style,
  disabled,
  ...props
}) => {
  let bg = 'var(--md-sys-color-primary)';
  let color = 'var(--md-sys-color-on-primary)';
  let border = 'none';

  if (variant === 'tonal') {
    bg = 'var(--md-sys-color-secondary-container)';
    color = 'var(--md-sys-color-on-secondary-container)';
  } else if (variant === 'error-tonal') {
    bg = 'var(--md-sys-color-error-container)';
    color = 'var(--md-sys-color-on-error-container)';
  } else if (variant === 'tertiary-tonal') {
    bg = 'var(--md-sys-color-tertiary-container)';
    color = 'var(--md-sys-color-on-tertiary-container)';
  } else if (variant === 'success-tonal') {
    bg = 'var(--md-sys-color-success-container)';
    color = 'var(--md-sys-color-on-success-container)';
  } else if (variant === 'outlined') {
    bg = 'transparent';
    color = 'var(--md-sys-color-primary)';
    border = '1px solid var(--md-sys-color-outline)';
  }

  const height = size === 'lg' ? '56px' : size === 'sm' ? '36px' : '44px';
  const padding = size === 'lg' ? '0 28px' : size === 'sm' ? '0 16px' : '0 22px';
  const fontSize = size === 'lg' ? '17px' : size === 'sm' ? '13px' : '15px';

  return (
    <button
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        height,
        padding,
        fontSize,
        fontWeight: 600,
        borderRadius: 'var(--md-sys-shape-corner-full)',
        backgroundColor: bg,
        color,
        border,
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
        ...style,
      }}
      {...props}
    >
      {icon && <span className="material-symbols-rounded">{icon}</span>}
      {children}
    </button>
  );
};