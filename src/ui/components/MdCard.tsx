import React from 'react';

interface MdCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'filled' | 'outlined';
  children: React.ReactNode;
}

export const MdCard: React.FC<MdCardProps> = ({
  variant = 'filled',
  children,
  className = '',
  style,
  ...props
}) => {
  const baseStyle: React.CSSProperties = {
    borderRadius: 'var(--md-sys-shape-corner-extra-large)',
    backgroundColor:
      variant === 'outlined'
        ? 'var(--md-sys-color-surface-container-lowest)'
        : 'var(--md-sys-color-surface-container-low)',
    border:
      variant === 'outlined'
        ? '1px solid var(--md-sys-color-outline-variant)'
        : 'none',
    boxShadow:
      variant === 'elevated'
        ? '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.05)'
        : 'none',
    padding: '24px',
    transition:
      'box-shadow var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-expressive), background-color var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-expressive)',
    ...style,
  };

  return (
    <div style={baseStyle} className={className} {...props}>
      {children}
    </div>
  );
};