import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { BRAND } from '../brand'
import { DEFAULT_PARAMS, Dissolver } from '../lib/dissolve'
import type { ColorMode, Params, Shape } from '../lib/dissolve'
import { buildLayers, download, isAbort, renderExport } from '../lib/exporter'
import type { ExportOptions, FillSpec } from '../lib/exporter'
import {
  clearMask, invertMask, isMostlyOpaque, maskFromAlpha, mk, selectAll,
} from '../lib/selection'
import { Sam } from '../lib/sam'
import type { Scene } from '../lib/scene'
import { ringPath } from '../lib/thorns'
import { Ghost, ThemeToggle } from './Bits'
import { Chips, Dial, Slider, Swatches } from './Controls'
import { ExportModal } from './ExportModal'
import {
  IconAuto, IconBrush, IconEraser, IconLasso, IconLoop, IconPanel, IconPause, IconPlay, ShapeGlyph,
} from './Icons'
import { SelectionOverlay } from './SelectionOverlay'
import { ThornFrame } from './ThornFrame'

interface Props {
  theme: 'paper' | 'ink'
  onToggleTheme: () => void
  imageSrc: string | null
  fileName: string
  onBack: () => void
}

const ASPECTS = {
  '4:5': 4 / 5,
  '9:16': 9 / 16,
  '1:1': 1,
  '16:9': 16 / 9,
  '3:4': 3 / 4,
} as const
type Aspect = keyof typeof ASPECTS

const BASE_DURATION = 3.2
const FPS = 30
const MAX_SIDE = 1600

const TOOLS = [
  { id: 'auto', icon: <IconAuto />, en: 'Auto', cn: '点击选择', hint: 'Click an object · 点击物体自动选择' },
  { id: 'brush', icon: <IconBrush />, en: 'Brush', cn: '画笔', hint: 'Paint what dissolves · 涂抹要溶解的部分' },
  { id: 'lasso', icon: <IconLasso />, en: 'Lasso', cn: '套索', hint: 'Draw around it · 圈出对象' },
  { id: 'erase', icon: <IconEraser />, en: 'Erase', cn: '擦除', hint: 'Subtract · 从选区擦除' },
] as const
type ToolId = (typeof TOOLS)[number]['id']

const TABS = [
  { id: 'color', no: 'I', en: 'Color', cn: '颜色' },
  { id: 'direction', no: 'II', en: 'Direction', cn: '方向' },
  { id: 'size', no: 'III', en: 'Size', cn: '大小' },
  { id: 'shape', no: 'IV', en: 'Shape', cn: '形状' },
  { id: 'fill', no: 'V', en: 'Fill', cn: '补底' },
] as const
type TabId = (typeof TABS)[number]['id']

const SWATCHES = [
  { hex: '#0E0E0E', name: 'Ink' },
  { hex: '#F2A7C3', name: 'Rose' },
  { hex: '#9A9AA0', name: 'Silver' },
  { hex: '#8A1B2D', name: 'Blood' },
  { hex: '#E8E1D0', name: 'Bone' },
  { hex: '#6B3A7D', name: 'Violet' },
]

const FILL_COLORS = [
  { hex: '#F4F2ED', name: 'Paper' },
  { hex: '#0E0E0E', name: 'Ink' },
  { hex: '#F2A7C3', name: 'Rose' },
  { hex: '#9A9AA0', name: 'Silver' },
  { hex: '#8A1B2D', name: 'Blood' },
  { hex: '#E8E1D0', name: 'Bone' },
]

type FillMode = 'auto' | 'plate' | 'solid'

const SHAPES: { id: Shape; en: string; cn: string }[] = [
  { id: 'shard', en: 'Shard', cn: '碎片' },
  { id: 'square', en: 'Square', cn: '方块' },
  { id: 'petal', en: 'Petal', cn: '花瓣' },
  { id: 'dot', en: 'Ink dot', cn: '墨点' },
  { id: 'thorn', en: 'Thorn', cn: '荆棘' },
  { id: 'letter', en: 'Letter', cn: '字母' },
]

type FilterId = 'none' | 'xerox' | 'negative' | 'soft'
const FILTERS: Record<FilterId, string> = {
  none: 'none',
  xerox: 'grayscale(1) contrast(5) brightness(1.1)',
  negative: 'invert(1)',
  soft: 'blur(0.9px) contrast(1.15)',
}

async function makeSample(w: number, h: number): Promise<HTMLCanvasElement> {
  try {
    await document.fonts.load('700 100px UnifrakturCook')
  } catch {
    /* fall back to serif */
  }
  const c = mk(w, h)
  const ctx = c.getContext('2d')!
  const cx = w / 2
  const cy = h * 0.42
  const R = Math.min(w, h * 0.8) * 0.3

  ctx.fillStyle = '#F2A7C3'
  ctx.beginPath()
  ctx.ellipse(cx, cy, R * 0.52, R * 0.74, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.beginPath()
  ctx.ellipse(cx - R * 0.16, cy - R * 0.24, R * 0.1, R * 0.22, 0.3, 0, Math.PI * 2)
  ctx.fill()

  const { ring, thorns } = ringPath(cx, cy, R, 9)
  ctx.strokeStyle = '#0E0E0E'
  ctx.lineWidth = Math.max(3, R * 0.05)
  ctx.stroke(new Path2D(ring))
  ctx.fillStyle = '#0E0E0E'
  ctx.fill(new Path2D(thorns))
  const outer = ringPath(cx, cy, R * 1.22, 4)
  ctx.lineWidth = Math.max(2, R * 0.028)
  ctx.stroke(new Path2D(outer.ring))
  ctx.fill(new Path2D(outer.thorns))

  ctx.fillStyle = '#0E0E0E'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 ${w * 0.26}px UnifrakturCook, serif`
  ctx.fillText('Ashen', cx, h * 0.9)
  ctx.fillStyle = '#9A9AA0'
  ctx.fillRect(cx - w * 0.3, h * 0.935, w * 0.6, 3)
  return c
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

export function Workspace({ theme, onToggleTheme, imageSrc, fileName, onBack }: Props) {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS)
  const [tab, setTab] = useState<TabId>('color')
  const [tool, setTool] = useState<ToolId>('brush')
  const [aspect, setAspect] = useState<Aspect>('4:5')
  const [filter, setFilter] = useState<FilterId>('none')
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  /** playback/export speed multiplier: 2 = twice as fast (half the duration) */
  const [rate, setRate] = useState(1)
  const [panelOpen, setPanelOpen] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [brush, setBrush] = useState(48)
  const [showMask, setShowMask] = useState(true)
  const [hasMask, setHasMask] = useState(false)
  const [maskTick, setMaskTick] = useState(0)
  const [docVersion, setDocVersion] = useState(0)
  const [fillMode, setFillMode] = useState<FillMode>('auto')
  const [fillColor, setFillColor] = useState('#F4F2ED')
  const [plate, setPlate] = useState<{ canvas: HTMLCanvasElement; url: string; name: string } | null>(null)
  const plateInput = useRef<HTMLInputElement>(null)
  const [backdrop, setBackdrop] = useState<{ canvas: HTMLCanvasElement; url: string; name: string } | null>(null)
  const [match, setMatch] = useState(0.6)
  const [objScale, setObjScale] = useState(0.7)
  const [objX, setObjX] = useState(0)
  const [objY, setObjY] = useState(0)
  const [wrap, setWrap] = useState(0.5)
  const [light, setLight] = useState(0.4)
  const [depth, setDepth] = useState(0.4)
  const backdropInput = useRef<HTMLInputElement>(null)
  const scene = useMemo<Scene | null>(
    () => (backdrop ? { backdrop: backdrop.canvas, match, scale: objScale, x: objX, y: objY, wrap, light, depth } : null),
    [backdrop, match, objScale, objX, objY, wrap, light, depth],
  )
  const place = useMemo(() => (scene ? { scale: scene.scale, x: scene.x, y: scene.y } : undefined), [scene])

  const takeBackdrop = async (f?: File) => {
    if (!f || !f.type.startsWith('image/')) return
    const url = URL.createObjectURL(f)
    try {
      const img = await loadImage(url)
      const s = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
      const c = mk(img.width * s, img.height * s)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      setBackdrop((old) => {
        if (old) URL.revokeObjectURL(old.url)
        return { canvas: c, url, name: f.name }
      })
    } catch {
      URL.revokeObjectURL(url)
      setToast('Could not read that image · 无法读取该图片')
    }
  }
  const samRef = useRef<Sam | null>(null)
  const samBusy = useRef(false)
  const fill = useMemo<FillSpec>(
    () =>
      fillMode === 'plate' && plate
        ? { kind: 'plate', canvas: plate.canvas }
        : fillMode === 'solid'
          ? { kind: 'solid', color: fillColor }
          : { kind: 'auto' },
    [fillMode, fillColor, plate],
  )

  const takePlate = async (f?: File) => {
    if (!f || !f.type.startsWith('image/')) return
    const url = URL.createObjectURL(f)
    try {
      const img = await loadImage(url)
      const s = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
      const c = mk(img.width * s, img.height * s)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      setPlate((old) => {
        if (old) URL.revokeObjectURL(old.url)
        return { canvas: c, url, name: f.name }
      })
      setFillMode('plate')
    } catch {
      URL.revokeObjectURL(url)
      setToast('Could not read that image · 无法读取该图片')
    }
  }

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseRef = useRef<HTMLCanvasElement | null>(null)
  const maskRef = useRef<HTMLCanvasElement | null>(null)
  const dis = useRef<Dissolver | null>(null)
  if (!dis.current) dis.current = new Dissolver()
  const paramsRef = useRef(params)
  const tRef = useRef(0.24)
  const dprRef = useRef(1)
  const scrubRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const frameRef = useRef<HTMLSpanElement>(null)
  paramsRef.current = params
  const duration = BASE_DURATION / rate
  const durationRef = useRef(duration)
  durationRef.current = duration

  const set = <K extends keyof Params>(k: K, v: Params[K]) => setParams((p) => ({ ...p, [k]: v }))

  // available area -> stage size at the chosen aspect
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const stage = useMemo(() => {
    const aw = Math.max(0, box.w - 150)
    const ah = Math.max(0, box.h - 170)
    const r = ASPECTS[aspect]
    let w = aw
    let h = w / r
    if (h > ah) {
      h = ah
      w = h * r
    }
    return { w: Math.floor(w), h: Math.floor(h) }
  }, [box, aspect])

  const syncTime = useCallback(() => {
    const t = tRef.current
    const dur = durationRef.current
    const total = Math.round(dur * FPS)
    if (scrubRef.current) {
      scrubRef.current.value = String(Math.round(t * 1000))
      scrubRef.current.style.setProperty('--p', `${t * 100}%`)
    }
    if (timeRef.current) timeRef.current.textContent = `${(t * dur).toFixed(2)}s / ${dur.toFixed(2)}s`
    if (frameRef.current)
      frameRef.current.textContent = `FRAME ${String(Math.round(t * total)).padStart(3, '0')}/${total}`
  }, [])

  useEffect(() => {
    syncTime()
  }, [rate, syncTime])

  const draw = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    dis.current!.render(ctx, tRef.current, paramsRef.current, dprRef.current)
  }, [])

  /** Split the image into object (selected) and background (rest, hole filled) and rebuild particles. */
  const rebuild = useCallback(() => {
    const base = baseRef.current
    const mask = maskRef.current
    const c = canvasRef.current
    if (!base || !mask || !c || stage.w < 10 || stage.h < 10) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    dprRef.current = dpr
    const W = Math.round(stage.w * dpr)
    const H = Math.round(stage.h * dpr)
    c.width = W
    c.height = H
    const { obj, bg, any } = buildLayers(base, mask, W, H, fill, scene)

    dis.current!.depth = scene?.depth ?? 0
    dis.current!.build(obj, bg, params.count, params.seed)
    setHasMask(any)
    syncTime()
    draw()
  }, [stage.w, stage.h, params.count, params.seed, fill, scene, draw, syncTime])

  const commit = useCallback(() => {
    rebuild()
    setMaskTick((t) => t + 1)
  }, [rebuild])

  // load the document (source image + selection mask)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let base: HTMLCanvasElement
      if (imageSrc) {
        const img = await loadImage(imageSrc)
        const s = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
        base = mk(img.width * s, img.height * s)
        base.getContext('2d')!.drawImage(img, 0, 0, base.width, base.height)
      } else {
        base = await makeSample(1000, 1250)
      }
      if (cancelled) return
      const mask = mk(base.width, base.height)
      // sample and transparent cut-outs: pre-select the object (every non-transparent pixel)
      if (!imageSrc || !isMostlyOpaque(base)) maskFromAlpha(base, mask)
      baseRef.current = base
      maskRef.current = mask
      setDocVersion((v) => v + 1)
    })()
    return () => {
      cancelled = true
    }
  }, [imageSrc])

  useEffect(() => {
    if (docVersion > 0) {
      rebuild()
      setMaskTick((t) => t + 1)
    }
  }, [rebuild, docVersion])

  // redraw on param change
  useEffect(() => {
    draw()
  }, [params, draw])

  // playback
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      let t = tRef.current + dt / durationRef.current
      if (t >= 1) {
        if (loop) t = 0
        else {
          t = 1
          setPlaying(false)
        }
      }
      tRef.current = t
      syncTime()
      draw()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, loop, draw, syncTime])

  const togglePlay = useCallback(() => {
    if (!playing && tRef.current >= 1) tRef.current = 0
    setPlaying((p) => !p)
  }, [playing])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement) && !exportOpen) {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [togglePlay, exportOpen])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(id)
  }, [toast])

  const edit = (fn: (mask: HTMLCanvasElement) => void) => {
    const mask = maskRef.current
    if (!mask) return
    fn(mask)
    commit()
  }

  const getSam = () => {
    if (!samRef.current) {
      samRef.current = new Sam()
      samRef.current.onProgress = (p) => setBusy(`Downloading model ${Math.round(p)}% · 下载模型中`)
    }
    return samRef.current
  }

  // warm up: download the model and embed the photo as soon as the Auto tool is chosen
  useEffect(() => {
    const base = baseRef.current
    if (tool !== 'auto' || !base || docVersion === 0) return
    setBusy('Preparing image · 正在分析图片')
    getSam()
      .prepare(base)
      .then(() => setBusy(null))
      .catch((e) => {
        setBusy(null)
        setToast(`Auto select failed: ${e.message} · 自动选择失败`)
      })
  }, [tool, docVersion])

  useEffect(() => () => samRef.current?.dispose(), [])

  const autoSelect = async (p: { x: number; y: number }) => {
    const base = baseRef.current
    const mask = maskRef.current
    if (!base || !mask || samBusy.current) return
    if (p.x < 0 || p.y < 0 || p.x >= base.width || p.y >= base.height) return
    samBusy.current = true
    setPlaying(false)
    try {
      const sam = getSam()
      await sam.prepare(base)
      setBusy('Selecting · 选择中')
      const m = await sam.segment(p.x, p.y)
      const ctx = mask.getContext('2d')!
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(m, 0, 0, mask.width, mask.height)
      commit()
    } catch (e) {
      setToast(`Auto select failed: ${e instanceof Error ? e.message : e} · 自动选择失败`)
    } finally {
      samBusy.current = false
      setBusy(null)
    }
  }

  const currentTool = TOOLS.find((t) => t.id === tool)!
  const painting = tool === 'brush' || tool === 'erase'

  return (
    <div className={`ws enter ${panelOpen ? '' : 'collapsed'}`}>
      <header className="ws-top">
        <button className="brand-btn" onClick={onBack} title="Back to start">
          {BRAND}
        </button>
        <span className="mono file">{fileName}</span>
        <div className="grow" />
        <button className="icon-btn" onClick={() => setPanelOpen((v) => !v)} title="Toggle panel">
          <IconPanel />
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <Ghost
          cn="重置"
          onClick={() => {
            setParams(DEFAULT_PARAMS)
            setRate(1)
            setFilter('none')
          }}
        >
          Reset
        </Ghost>
        <button className="btn" onClick={() => setExportOpen(true)}>
          Export <i className="cn">导出</i>
        </button>
      </header>

      <aside className="rail">
        {TOOLS.map((t) => (
          <button key={t.id} className={`tool ${tool === t.id ? 'on' : ''}`} onClick={() => setTool(t.id)} title={`${t.en} · ${t.cn}`}>
            {t.icon}
            <span>{t.en}</span>
          </button>
        ))}
        <div className="rail-sep" />
        <button className="rail-act" onClick={() => edit(selectAll)} title="Select all · 全选">All<i className="cn">全选</i></button>
        <button className="rail-act" onClick={() => edit(invertMask)} title="Invert · 反选">Invert<i className="cn">反选</i></button>
        <button className="rail-act" onClick={() => edit(clearMask)} title="Clear · 清除">Clear<i className="cn">清除</i></button>
        <button className={`rail-act ${showMask ? 'on' : ''}`} onClick={() => setShowMask((v) => !v)} title="Show selection · 显示选区">Mask<i className="cn">选区</i></button>
      </aside>

      <main className="stage-wrap" ref={wrapRef}>
        {painting && (
          <div className="sel-bar mono">
            <span>{tool === 'erase' ? 'Eraser 橡皮' : 'Brush 笔刷'}</span>
            <input
              type="range"
              min={8}
              max={160}
              value={brush}
              style={{ '--p': `${((brush - 8) / 152) * 100}%` } as CSSProperties}
              onChange={(e) => setBrush(Number(e.target.value))}
            />
            <span>{brush}px</span>
          </div>
        )}
        <div className="stage" style={{ width: stage.w, height: stage.h }}>
          <ThornFrame seed={5} />
          <canvas ref={canvasRef} style={{ width: stage.w, height: stage.h, filter: FILTERS[filter] }} />
          <SelectionOverlay
            baseRef={baseRef}
            maskRef={maskRef}
            w={stage.w}
            h={stage.h}
            tool={tool}
            brush={brush}
            visible={!playing && showMask}
            place={place}
            tick={maskTick}
            onStart={() => setPlaying(false)}
            onCommit={commit}
            onAuto={autoSelect}
          />
          {!hasMask && docVersion > 0 && (
            <div className="empty-hint mono">
              <b>Nothing selected</b>
              <span>Paint over what should dissolve</span>
              <i className="cn">用画笔涂抹要溶解的部分</i>
            </div>
          )}
          <span className="meta tl mono">{Math.round(stage.w * 2)} × {Math.round(stage.h * 2)}</span>
          <span className="meta tr mono">SEED {String(params.seed).padStart(3, '0')}</span>
          <span className="meta bl mono">{currentTool.hint}</span>
          <span className="meta br mono" ref={frameRef}>FRAME 000/{Math.round(duration * FPS)}</span>
        </div>
        <div className="aspects">
          {(Object.keys(ASPECTS) as Aspect[]).map((a) => (
            <button key={a} className={`aspect ${aspect === a ? 'on' : ''}`} onClick={() => setAspect(a)}>
              {a}
            </button>
          ))}
        </div>
      </main>

      <aside className="panel">
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              <span className="no mono">{t.no}</span>
              <span className="ghost" data-text={t.en}>{t.en}</span>
              <i className="cn">{t.cn}</i>
            </button>
          ))}
        </nav>

        <div className="panel-body" key={tab}>
          {tab === 'color' && (
            <>
              <div className="field">
                <span className="mono mini">Mode 模式</span>
                <Chips<ColorMode>
                  value={params.mode}
                  onChange={(v) => set('mode', v)}
                  items={[
                    { id: 'original', en: 'Original', cn: '原色' },
                    { id: 'tint', en: 'Tint', cn: '单色' },
                    { id: 'gradient', en: 'Gradient', cn: '渐变' },
                  ]}
                />
              </div>
              {params.mode !== 'original' && (
                <div className="field">
                  <span className="mono mini">{params.mode === 'gradient' ? 'From 起始' : 'Tint 色调'}</span>
                  <Swatches colors={SWATCHES} value={params.tint} onChange={(v) => set('tint', v)} />
                </div>
              )}
              {params.mode === 'gradient' && (
                <div className="field">
                  <span className="mono mini">To 终点</span>
                  <Swatches colors={SWATCHES} value={params.tint2} onChange={(v) => set('tint2', v)} />
                </div>
              )}
              <Slider label="Edge glow" cn="边缘光" value={params.glow} min={0} max={1} step={0.01} onChange={(v) => set('glow', v)} fmt={(v) => v.toFixed(2)} />
              <div className="field">
                <span className="mono mini">Filter 滤镜</span>
                <Chips<FilterId>
                  value={filter}
                  onChange={setFilter}
                  items={[
                    { id: 'none', en: 'None', cn: '无' },
                    { id: 'xerox', en: 'Xerox', cn: '复印' },
                    { id: 'negative', en: 'Negative', cn: '负片' },
                    { id: 'soft', en: 'Soft', cn: '柔焦' },
                  ]}
                />
              </div>
            </>
          )}

          {tab === 'direction' && (
            <>
              <div className="field">
                <span className="mono mini">Wind 风向</span>
                <Dial value={params.angle} onChange={(v) => set('angle', v)} />
              </div>
              <Slider label="Playback speed" cn="播放速度" value={rate} min={0.25} max={3} step={0.05} onChange={setRate} fmt={(v) => `${v.toFixed(2)}×`} />
              <Slider label="Speed" cn="速度" value={params.speed} min={0.2} max={2} step={0.01} onChange={(v) => set('speed', v)} fmt={(v) => v.toFixed(2)} />
              <Slider label="Spread" cn="扩散" value={params.spread} min={0} max={1.5} step={0.01} onChange={(v) => set('spread', v)} fmt={(v) => v.toFixed(2)} />
              <Slider label="Gravity" cn="重力" value={params.gravity} min={-0.5} max={1} step={0.01} onChange={(v) => set('gravity', v)} fmt={(v) => v.toFixed(2)} />
              <Slider label="Turbulence" cn="湍流" value={params.turbulence} min={0} max={1.5} step={0.01} onChange={(v) => set('turbulence', v)} fmt={(v) => v.toFixed(2)} />
            </>
          )}

          {tab === 'size' && (
            <>
              <Slider label="Min size" cn="最小" value={params.sizeMin} min={0.5} max={10} step={0.1} onChange={(v) => set('sizeMin', Math.min(v, params.sizeMax))} fmt={(v) => `${v.toFixed(1)}px`} />
              <Slider label="Max size" cn="最大" value={params.sizeMax} min={1} max={30} step={0.1} onChange={(v) => set('sizeMax', Math.max(v, params.sizeMin))} fmt={(v) => `${v.toFixed(1)}px`} />
              <Slider label="Decay" cn="衰减" value={params.decay} min={0} max={1} step={0.01} onChange={(v) => set('decay', v)} fmt={(v) => v.toFixed(2)} />
              <Slider label="Density" cn="数量" value={params.count} min={4000} max={40000} step={1000} onChange={(v) => set('count', v)} fmt={(v) => `${(v / 1000).toFixed(0)}k`} />
              <div className="field">
                <span className="mono mini">Seed 随机种子</span>
                <button className="btn line small" onClick={() => set('seed', Math.floor(Math.random() * 999))}>
                  Reroll <i className="cn">重新随机</i>
                </button>
              </div>
            </>
          )}

          {tab === 'fill' && (
            <>
              <div className="field">
                <span className="mono mini">Backdrop 背景图</span>
                <input
                  ref={backdropInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    void takeBackdrop(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <button className="btn line" onClick={() => backdropInput.current?.click()}>
                  {backdrop ? 'Replace' : 'Choose image'} <i className="cn">{backdrop ? '更换' : '选择图片'}</i>
                </button>
                {backdrop && (
                  <div className="plate">
                    <img src={backdrop.url} alt="" />
                    <span className="mono mini">{backdrop.name}</span>
                    <Ghost
                      onClick={() => {
                        URL.revokeObjectURL(backdrop.url)
                        setBackdrop(null)
                      }}
                    >
                      Remove
                    </Ghost>
                  </div>
                )}
              </div>
              {backdrop ? (
                <>
                  <Slider label="Colour match" cn="调色匹配" value={match} min={0} max={1} step={0.01} onChange={setMatch} fmt={(v) => v.toFixed(2)} />
                  <Slider label="Light wrap" cn="边缘光晕" value={wrap} min={0} max={1} step={0.01} onChange={setWrap} fmt={(v) => v.toFixed(2)} />
                  <Slider label="Relight" cn="光线方向" value={light} min={0} max={1} step={0.01} onChange={setLight} fmt={(v) => v.toFixed(2)} />
                  <Slider label="Depth blur" cn="景深模糊" value={depth} min={0} max={1} step={0.01} onChange={setDepth} fmt={(v) => v.toFixed(2)} />
                  <Slider label="Object size" cn="物体大小" value={objScale} min={0.15} max={1.4} step={0.01} onChange={setObjScale} fmt={(v) => v.toFixed(2)} />
                  <Slider label="Position X" cn="水平位置" value={objX} min={-0.6} max={0.6} step={0.005} onChange={setObjX} fmt={(v) => v.toFixed(2)} />
                  <Slider label="Position Y" cn="垂直位置" value={objY} min={-0.6} max={0.6} step={0.005} onChange={setObjY} fmt={(v) => v.toFixed(2)} />
                  <p className="note">
                    The object sits on the backdrop and takes on its tones. Only the selection dissolves; the rest of the photo is not shown.{' '}
                    <i className="cn">物体放在背景图上并向其色调靠拢。只有选区会溶解，原图其余部分不显示。</i>
                  </p>
                </>
              ) : (
                <p className="note">
                  Add a backdrop to composite here instead of in an editor. <i className="cn">添加背景图，直接在这里合成。</i>
                </p>
              )}
              {!backdrop && (
              <>
              <div className="field">
                <span className="mono mini">Where the object was 对象消失后的位置</span>
                <Chips<FillMode>
                  value={fillMode}
                  onChange={setFillMode}
                  items={[
                    { id: 'auto', en: 'Auto', cn: '自动' },
                    { id: 'plate', en: 'Clean plate', cn: '底图' },
                    { id: 'solid', en: 'Solid', cn: '纯色' },
                  ]}
                />
              </div>

              {fillMode === 'auto' && (
                <p className="note">
                  Colours are diffused in from the surroundings. Good for walls, sky and soft gradients; busy
                  backgrounds look smeared. <i className="cn">从周围扩散取色，适合平滑背景。复杂背景请用底图。</i>
                </p>
              )}

              {fillMode === 'plate' && (
                <>
                  <div className="field">
                    <span className="mono mini">Clean plate 干净的底图</span>
                    <input
                      ref={plateInput}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        void takePlate(e.target.files?.[0])
                        e.target.value = ''
                      }}
                    />
                    <button className="btn line" onClick={() => plateInput.current?.click()}>
                      {plate ? 'Replace' : 'Choose image'} <i className="cn">{plate ? '更换' : '选择图片'}</i>
                    </button>
                    {plate && (
                      <div className="plate">
                        <img src={plate.url} alt="" />
                        <span className="mono mini">{plate.name}</span>
                        <Ghost
                          onClick={() => {
                            URL.revokeObjectURL(plate.url)
                            setPlate(null)
                          }}
                        >
                          Remove
                        </Ghost>
                      </div>
                    )}
                  </div>
                  <p className="note">
                    {plate
                      ? 'Scaled to cover the photo. Use the same framing for a clean result.'
                      : 'Same scene without the object, same framing as your photo. Until you add one, Auto is used.'}{' '}
                    <i className="cn">与原图构图一致、不含该对象的同一场景。</i>
                  </p>
                </>
              )}

              {fillMode === 'solid' && (
                <div className="field">
                  <span className="mono mini">Colour 颜色</span>
                  <Swatches colors={FILL_COLORS} value={fillColor} onChange={setFillColor} />
                </div>
              )}
              </>
              )}
            </>
          )}

          {tab === 'shape' && (
            <>
              <div className="shapes">
                {SHAPES.map((s) => (
                  <button key={s.id} className={`shape ${params.shape === s.id ? 'on' : ''}`} onClick={() => set('shape', s.id)}>
                    <ShapeGlyph shape={s.id} />
                    <span>{s.en}</span>
                    <i className="cn">{s.cn}</i>
                  </button>
                ))}
              </div>
              <p className="note">
                Custom sprite upload <i className="cn">自定义图案</i> — coming soon.
              </p>
            </>
          )}
        </div>
      </aside>

      <footer className="timeline">
        <button className="play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <button className={`icon-btn ${loop ? 'lit' : ''}`} onClick={() => setLoop((l) => !l)} title="Loop">
          <IconLoop />
        </button>
        <input
          ref={scrubRef}
          className="scrub"
          type="range"
          min={0}
          max={1000}
          defaultValue={240}
          style={{ '--p': '24%' } as CSSProperties}
          onChange={(e) => {
            tRef.current = Number(e.target.value) / 1000
            syncTime()
            draw()
          }}
        />
        <span className="mono time" ref={timeRef}>0.00s / {duration.toFixed(2)}s</span>
        <span className="rec"><b /> REC <i className="cn">录制交互</i></span>
      </footer>

      {exportOpen && (
        <ExportModal
          onClose={() => setExportOpen(false)}
          onRender={async (opt, onProgress, signal) => {
            const base = baseRef.current
            const mask = maskRef.current
            if (!base || !mask) throw new Error('Nothing to export')
            if (!hasMask) throw new Error('Select something to dissolve first · 先选择要溶解的对象')
            const job: ExportOptions = {
              format: opt.format,
              shortSide: opt.shortSide,
              fps: opt.fps,
              duration,
              ratio: ASPECTS[aspect],
              stageW: stage.w,
              t: tRef.current,
              transparent: opt.transparent,
              greenScreen: opt.greenScreen,
              params,
              filter: FILTERS[filter],
              base,
              mask,
              fill,
              scene,
              onProgress,
              signal,
            }
            try {
              const res = await renderExport(job)
              download(res.blob, res.name)
              setToast(`Saved ${res.name} · ${res.note}`)
            } catch (e) {
              if (isAbort(e)) return
              throw e
            }
          }}
        />
      )}
      {(busy || toast) && <div className="toast mono">{busy ?? toast}</div>}
    </div>
  )
}
