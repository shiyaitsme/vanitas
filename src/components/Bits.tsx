import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

/** Text button whose letters double and blur on hover. */
export function Ghost({
  children,
  cn,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: string; cn?: string }) {
  return (
    <button className={`ghost ${className}`} data-text={children} {...rest}>
      {children}
      {cn && <i className="cn">{cn}</i>}
    </button>
  )
}

const LAYERS = [-2, -1, 0, 1, 2]

/**
 * Display word repeated at equal size (ECSTASY) with out-of-focus echoes above and below
 * that overlap the sharp centre line (focus). Layers drift apart with the pointer.
 */
export function SliceTitle({ text }: { text: string }) {
  return (
    <h1 className="stack" aria-label={text}>
      {LAYERS.map((k) => (
        <span key={k} className={`ly ${k === 0 ? 'core' : 'echo'} k${k < 0 ? 'n' : 'p'}${Math.abs(k)}`} style={{ '--k': k } as CSSProperties} aria-hidden>
          {text}
        </span>
      ))}
    </h1>
  )
}

export function ThemeToggle({ theme, onToggle }: { theme: 'paper' | 'ink'; onToggle: () => void }) {
  return (
    <button className="theme-toggle" onClick={onToggle} title="Toggle paper / ink" aria-label="Toggle theme">
      <span className={theme === 'paper' ? 'on' : ''}>Paper</span>
      <b />
      <span className={theme === 'ink' ? 'on' : ''}>Ink</span>
    </button>
  )
}

export function Label({ en, cn, children }: { en: string; cn?: string; children?: ReactNode }) {
  return (
    <div className="label">
      <span>{en}</span>
      {cn && <i className="cn">{cn}</i>}
      {children}
    </div>
  )
}
