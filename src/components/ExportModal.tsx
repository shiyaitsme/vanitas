import { useEffect, useRef, useState } from 'react'
import type { ExportFormat } from '../lib/exporter'
import { Chips } from './Controls'
import { Ghost } from './Bits'
import { ThornFrame } from './ThornFrame'

const FORMATS: { id: ExportFormat; name: string; note: string; cn: string }[] = [
  { id: 'mp4', name: 'MP4', note: 'H.264 video', cn: '通用视频，适合发布' },
  { id: 'webm', name: 'WebM', note: 'VP9 with alpha', cn: '可带透明背景的视频' },
  { id: 'gif', name: 'GIF', note: 'Looping · max 720p', cn: '循环动图，最大 720p' },
  { id: 'seq', name: 'PNG Sequence', note: 'Zipped frames', cn: '序列帧压缩包，便于后期合成' },
  { id: 'png', name: 'PNG Still', note: 'Current frame', cn: '当前帧静图' },
]
const ANIMATED: ExportFormat[] = ['mp4', 'webm', 'gif', 'seq']
const CAN_ALPHA: ExportFormat[] = ['webm', 'seq', 'png']

const SHORT: Record<string, number> = { '720': 720, '1080': 1080, '2k': 1440 }

export interface RenderOpts {
  format: ExportFormat
  shortSide: number
  fps: number
  transparent: boolean
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
  const [bg, setBg] = useState('paper')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const animated = ANIMATED.includes(fmt as ExportFormat)
  const alphaOk = CAN_ALPHA.includes(fmt as ExportFormat)

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
      await onRender({ format: fmt as ExportFormat, shortSide: SHORT[res], fps: Number(fps), transparent: alphaOk && bg === 'clear' }, setProgress, ac.signal)
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
                <button className={fmt === f.id ? 'on' : ''} disabled={busy} onClick={() => setFmt(f.id)}>
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
            {animated && (
            <div>
              <span className="mono mini">Frame rate 帧率</span>
              <Chips
                value={fps}
                onChange={setFps}
                items={[
                  { id: '24', en: '24' },
                  { id: '30', en: '30' },
                  { id: '60', en: '60' },
                ]}
              />
            </div>
            )}
            {alphaOk && (
              <div>
                <span className="mono mini">Background 背景</span>
                <Chips
                  value={bg}
                  onChange={setBg}
                  items={[
                    { id: 'paper', en: 'Paper' },
                    { id: 'clear', en: 'Transparent' },
                  ]}
                />
              </div>
            )}
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
              {fmt === 'png' ? 'Save' : 'Render'} <i className="cn">{fmt === 'png' ? '保存图片' : '开始渲染'}</i>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
