import { useEffect, useRef, useState } from 'react'
import type { ExportFormat } from '../lib/exporter'
import { Chips } from './Controls'
import { Ghost } from './Bits'
import { ThornFrame } from './ThornFrame'

const FORMATS: { id: string; name: string; note: string; cn: string; ready: boolean }[] = [
  { id: 'mp4', name: 'MP4', note: 'H.264 video', cn: '通用视频，适合发布', ready: true },
  { id: 'png', name: 'PNG Still', note: 'Current frame', cn: '当前帧静图', ready: true },
  { id: 'webm', name: 'WebM', note: 'VP9 with alpha', cn: '透明背景视频 · 即将推出', ready: false },
  { id: 'gif', name: 'GIF', note: 'Looping animation', cn: '循环动图 · 即将推出', ready: false },
  { id: 'seq', name: 'PNG Sequence', note: 'Zipped frames', cn: '序列帧 · 即将推出', ready: false },
  { id: 'webp', name: 'Animated WebP', note: 'Lightweight loop', cn: '轻量动图 · 即将推出', ready: false },
]

const SHORT: Record<string, number> = { '720': 720, '1080': 1080, '2k': 1440 }

export interface RenderOpts {
  format: ExportFormat
  shortSide: number
  fps: number
}

export function ExportModal({
  onClose,
  onRender,
}: {
  onClose: () => void
  onRender: (opt: RenderOpts, onProgress: (p: number) => void, signal: AbortSignal) => Promise<void>
}) {
  const [fmt, setFmt] = useState('mp4')
  const [res, setRes] = useState('1080')
  const [fps, setFps] = useState('30')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const isVideo = fmt === 'mp4'

  const close = () => {
    abort.current?.abort()
    onClose()
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const render = async () => {
    const ac = new AbortController()
    abort.current = ac
    setBusy(true)
    setError('')
    setProgress(0)
    try {
      await onRender({ format: fmt as ExportFormat, shortSide: SHORT[res], fps: Number(fps) }, setProgress, ac.signal)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal enter" onClick={(e) => e.stopPropagation()}>
        <ThornFrame seed={21} pad={56} />
        <div className="modal-in">
          <div className="modal-head">
            <h2>Export</h2>
            <i className="cn">导出</i>
            <Ghost className="x" onClick={close}>Close</Ghost>
          </div>

          <ul className="formats">
            {FORMATS.map((f, i) => (
              <li key={f.id}>
                <button className={fmt === f.id ? 'on' : ''} disabled={!f.ready || busy} style={f.ready ? undefined : { opacity: 0.4, cursor: 'not-allowed' }} onClick={() => setFmt(f.id)}>
                  <span className="mono">{String(i + 1).padStart(2, '0')}</span>
                  <b>{f.name}</b>
                  <em>{f.note}</em>
                  <i className="cn">{f.cn}</i>
                </button>
              </li>
            ))}
          </ul>

          <div className="modal-opts">
            <div>
              <span className="mono mini">Resolution 分辨率</span>
              <Chips
                value={res}
                onChange={setRes}
                items={[
                  { id: '720', en: '720p' },
                  { id: '1080', en: '1080p' },
                  { id: '2k', en: '2K' },
                ]}
              />
            </div>
            <div>
              <span className="mono mini">Frame rate 帧率</span>
              <Chips
                value={isVideo ? fps : '30'}
                onChange={setFps}
                items={[
                  { id: '24', en: '24' },
                  { id: '30', en: '30' },
                  { id: '60', en: '60' },
                ]}
              />
            </div>
          </div>

          {error && <p className="mono mini" style={{ color: 'var(--pink-deep, #c2557d)', margin: '0 0 12px' }}>{error}</p>}
          {busy ? (
            <div className="render-prog">
              <div className="bar"><b style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              <span className="mono mini">Rendering {Math.round(progress * 100)}% · 渲染中</span>
              <Ghost onClick={close}>Cancel 取消</Ghost>
            </div>
          ) : (
            <button className="btn render" onClick={render}>
              {isVideo ? 'Render' : 'Save'} <i className="cn">{isVideo ? '开始渲染' : '保存图片'}</i>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
