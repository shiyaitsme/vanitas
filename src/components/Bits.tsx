import type { ButtonHTMLAttributes, ReactNode } from 'react'

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

/** ECSTASY-style stacked, sliced display word. */
export function SliceTitle({ text }: { text: string }) {
  return (
    <h1 className="slice" aria-label={text}>
      <span className="s1" aria-hidden>{text}</span>
      <span className="s2" aria-hidden>{text}</span>
      <span className="s3" aria-hidden>{text}</span>
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
