'use client';

import { type ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  variant?: 'default' | 'highlighted' | 'success' | 'warning' | 'error';
  padding?: 'none' | 'small' | 'default' | 'large';
  hoverable?: boolean;
  onClick?: () => void;
};

const paddingMap = {
  none: '0',
  small: '1rem',
  default: '1.5rem',
  large: '2rem',
};

const variantStyles: Record<NonNullable<CardProps['variant']>, { border: string; bg: string }> = {
  default: { border: 'var(--border-dim)', bg: 'var(--bg-card)' },
  highlighted: { border: 'var(--neo-green)', bg: 'rgba(0, 255, 163, 0.05)' },
  success: { border: 'var(--neo-green)', bg: 'rgba(0, 255, 163, 0.08)' },
  warning: { border: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.08)' },
  error: { border: 'var(--error)', bg: 'rgba(239, 68, 68, 0.08)' },
};

export function Card({
  children,
  className = '',
  style,
  variant = 'default',
  padding = 'default',
  hoverable = false,
  onClick,
}: CardProps) {
  const variantStyle = variantStyles[variant];

  return (
    <div
      className={`${className}${hoverable || onClick ? ' card-hoverable' : ''}`}
      onClick={onClick}
      style={{
        background: variantStyle.bg,
        border: `1px solid ${variantStyle.border}`,
        borderRadius: '4px',
        padding: paddingMap[padding],
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {variant === 'highlighted' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: 'var(--neo-green)',
          }}
        />
      )}
      {children}
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: string | number;
  subvalue?: string;
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'success' | 'warning';
};

export function StatCard({ label, value, subvalue, icon, variant = 'default' }: StatCardProps) {
  const iconColor =
    variant === 'success'
      ? 'var(--neo-green)'
      : variant === 'warning'
        ? 'var(--warning)'
        : 'var(--text-secondary)';

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '0.75rem',
        }}
      >
        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 800,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {label}
        </span>
        {icon && <span style={{ color: iconColor }}>{icon}</span>}
      </div>
      <div
        style={{
          fontSize: '1.5rem',
          fontWeight: 900,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
        }}
      >
        {value}
      </div>
      {subvalue && (
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            marginTop: '0.35rem',
          }}
        >
          {subvalue}
        </div>
      )}
    </Card>
  );
}
