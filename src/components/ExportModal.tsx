import { useEffect, useState } from 'react'
import { Chips } from './Controls'
import { Ghost } from './Bits'
import { ThornFrame } from './ThornFrame'

const FORMATS = [
  { id: 'mp4', name: 'MP4', note: 'H.264 video', cn: '通用视频，适合发布' },
  { id: 'webm', name: 'WebM', note: 'VP9 with alpha', cn: '透明背景视频' },
  { id: 'gif', name: 'GIF', note: 'Looping animation', cn: '循环动图' },
  { id: 'seq', name: 'PNG Sequence', note: 'Zipped frames', cn: '序列帧，便于后期合成' },
  { id: 'png', name: 'PNG Still', note: 'Current frame', cn: '当前帧静图' },
  { id: 'webp', name: 'Animated WebP', note: 'Lightweight loop', cn: '轻量动图' },
]

export function ExportModal({ onClose, onRender }: { onClose: () => void; onRender: () => void }) {
  const [fmt, setFmt] = useState('mp4')
  const [res, setRes] = useState('1080')
  const [fps, setFps] = useState('30')

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal enter" onClick={(e) => e.stopPropagation()}>
        <ThornFrame seed={21} pad={56} />
        <div className="modal-in">
          <div className="modal-head">
            <h2>Export</h2>
            <i className="cn">导出</i>
            <Ghost className="x" onClick={onClose}>Close</Ghost>
          </div>

          <ul className="formats">
            {FORMATS.map((f, i) => (
              <li key={f.id}>
                <button className={fmt === f.id ? 'on' : ''} onClick={() => setFmt(f.id)}>
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
                value={fps}
                onChange={setFps}
                items={[
                  { id: '24', en: '24' },
                  { id: '30', en: '30' },
                  { id: '60', en: '60' },
                ]}
              />
            </div>
          </div>

          <button className="btn render" onClick={onRender}>
            Render <i className="cn">开始渲染</i>
          </button>
        </div>
      </div>
    </div>
  )
}
