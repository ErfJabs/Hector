import type { CSSProperties, ReactNode } from 'react'

export function Sq({ cls, size = 10 }: { cls: string; size?: number }) {
  return <span className={cls} style={size !== 10 ? { width: size, height: size } : undefined} />
}

export function Tag({ cls, children, style }: { cls: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <span className={cls} style={style}>
      {children}
    </span>
  )
}

export function Sec({ n, title, right }: { n: string; title: string; right?: ReactNode }) {
  return (
    <div className="sec">
      <h2>
        <i>{n}</i>
        {title}
      </h2>
      {right}
    </div>
  )
}

export function Sw({
  on,
  onToggle,
  label,
  disabled,
}: {
  on: boolean
  onToggle: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={on ? 'sw sw-on' : 'sw'}
      onClick={onToggle}
      style={disabled ? { opacity: 0.38 } : undefined}
    />
  )
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 14,
        height: 14,
        border: '1.5px solid var(--line4)',
        borderTopColor: 'var(--fg)',
        display: 'inline-block',
        animation: 'spin .8s linear infinite',
      }}
    />
  )
}
