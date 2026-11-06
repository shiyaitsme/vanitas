import { useRef, useState } from 'react'
import { BRAND, BRAND_CN, VERSION } from '../brand'
import { Ghost, SliceTitle, ThemeToggle } from './Bits'
import { ThornFrame } from './ThornFrame'

interface Props {
  theme: 'paper' | 'ink'
  onToggleTheme: () => void
  onStart: (src: string | null, name: string) => void
}

export function Home({ theme, onToggleTheme, onStart }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const take = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return
    onStart(URL.createObjectURL(file), file.name)
  }

  return (
    <div
      className="home enter"
      onPointerMove={(e) => e.currentTarget.style.setProperty('--mx', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3))}
    >
      <header className="top">
        <span className="mono">902-1003-0404</span>
        <span className="brand-mini">
          {BRAND} <i className="cn">{BRAND_CN}</i>
        </span>
        <nav>
          <Ghost cn="索引">Index</Ghost>
          <Ghost cn="作品">Gallery</Ghost>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </nav>
      </header>

      <div className="vertical-note" aria-hidden>
        Memento mori — everything returns to dust
      </div>

      <main>
        <SliceTitle text={BRAND} />

        <section
          className={`drop ${over ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            take(e.dataTransfer.files[0])
          }}
        >
          <ThornFrame seed={11} active={over} />
          <div className="drop-in">
            <p className="gothic">{over ? 'Release to dissolve' : 'Drop an image'}</p>
            <p className="cn-line">{over ? '松开，让它碎裂' : '把图片拖到这里，让它碎成粒子'}</p>
            <div className="drop-actions">
              <button className="btn" onClick={() => input.current?.click()}>
                Browse <i className="cn">选择图片</i>
              </button>
              <button className="btn line" onClick={() => onStart(null, 'sample-ashen.png')}>
                Sample <i className="cn">使用示例</i>
              </button>
            </div>
            <input ref={input} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
          </div>
        </section>
      </main>

      <footer className="foot">
        <span className="mono">Prod. 10---90</span>
        <span className="mono mini">Select · Dissolve · Export</span>
        <span className="mono">{VERSION}</span>
      </footer>
    </div>
  )
}
