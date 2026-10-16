'use client'

import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { Alert, Button, ICON, Modal, cx } from './ui'

/**
 * Atur ukuran & posisi gambar sebelum diunggah: geser untuk memindah, slider/roda mouse untuk zoom.
 * Hasilnya dipotong sesuai bingkai (logo bulat 1:1, banner 3:1) persis seperti yang terlihat.
 * Zoom bisa di bawah "penuh" agar logo lebar tetap utuh; sisa bingkai diisi warna latar.
 */
export function AturGambar({ src, judul, rasio, bulat, lebarHasil, onBatal, onSimpan }: {
  src: string; judul: string; rasio: number; bulat?: boolean; lebarHasil: number
  onBatal: () => void; onSimpan: (hasil: Blob) => Promise<void> | void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [gagal, setGagal] = useState(false)
  const [vw, setVw] = useState(360)
  // zoom 1 = gambar menutupi bingkai penuh; geser disimpan sebagai pecahan lebar/tinggi bingkai
  const [zoom, setZoom] = useState(1)
  const [geser, setGeser] = useState({ x: 0, y: 0 })
  const [latar, setLatar] = useState('#ffffff')
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ id: number; x: number; y: number; gx: number; gy: number } | null>(null)

  useEffect(() => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => setImg(el)
    el.onerror = () => setGagal(true)
    el.src = src
  }, [src])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setVw(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [img])

  const vh = vw / rasio
  const iw = img?.naturalWidth ?? 1, ih = img?.naturalHeight ?? 1
  const cover = Math.max(vw / iw, vh / ih)
  const minZoom = Math.min(vw / iw, vh / ih) / cover // seluruh gambar terlihat
  const scale = cover * zoom
  const w = iw * scale, h = ih * scale
  // Batas geser: gambar besar tidak boleh menyisakan celah, gambar kecil tidak boleh keluar bingkai
  const batasX = Math.abs(w - vw) / 2 / vw, batasY = Math.abs(h - vh) / 2 / vh
  const clamp = (v: number, b: number) => Math.max(-b, Math.min(b, v))
  const gx = clamp(geser.x, batasX), gy = clamp(geser.y, batasY)
  const kiri = vw / 2 + gx * vw - w / 2, atas = vh / 2 + gy * vh - h / 2
  const ubahZoom = (z: number) => setZoom(Math.max(minZoom, Math.min(4, z)))

  async function simpan() {
    if (!img) return
    setBusy(true)
    const r = lebarHasil / vw
    const canvas = document.createElement('canvas')
    canvas.width = lebarHasil
    canvas.height = Math.round(lebarHasil / rasio)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = latar
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, kiri * r, atas * r, w * r, h * r)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.88))
    if (blob) await onSimpan(blob)
    setBusy(false)
  }

  const celah = zoom < 1 || w < vw - 0.5 || h < vh - 0.5

  return (
    <Modal open onClose={busy ? () => {} : onBatal} title={judul} width={rasio > 1 ? 620 : 440}>
      {gagal ? <Alert>Gambar tidak bisa dibuka. Coba gambar lain.</Alert> : (
        <>
          <p className="m-0 text-sm text-neutral-800">Geser gambar untuk mengatur posisi, lalu atur besar-kecilnya.</p>
          <div ref={boxRef}
            className={cx('relative w-full touch-none select-none overflow-hidden border-2 border-[var(--line)] bg-neutral-200',
              bulat ? 'mx-auto max-w-[320px] rounded-full' : 'rounded-lg', img ? 'cursor-grab active:cursor-grabbing' : '')}
            style={{ aspectRatio: String(rasio), background: latar }}
            tabIndex={0} role="application" aria-label="Area gambar. Panah untuk menggeser, plus dan minus untuk zoom."
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, gx, gy }
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d || d.id !== e.pointerId) return
              setGeser({ x: d.gx + (e.clientX - d.x) / vw, y: d.gy + (e.clientY - d.y) / vh })
            }}
            onPointerUp={() => { drag.current = null }}
            onPointerCancel={() => { drag.current = null }}
            onWheel={(e) => ubahZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
            onKeyDown={(e) => {
              const step = 0.03
              const k: Record<string, () => void> = {
                ArrowLeft: () => setGeser({ x: gx - step, y: gy }), ArrowRight: () => setGeser({ x: gx + step, y: gy }),
                ArrowUp: () => setGeser({ x: gx, y: gy - step }), ArrowDown: () => setGeser({ x: gx, y: gy + step }),
                '+': () => ubahZoom(zoom * 1.1), '=': () => ubahZoom(zoom * 1.1), '-': () => ubahZoom(zoom / 1.1),
              }
              if (k[e.key]) { e.preventDefault(); k[e.key]() }
            }}>
            {img && (
              <img src={src} alt="" draggable={false} className="pointer-events-none absolute max-w-none"
                style={{ left: kiri, top: atas, width: w, height: h }} />
            )}
            {!img && <div className="absolute inset-0 grid place-items-center text-sm text-neutral-800">Memuat gambar…</div>}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-icon shrink-0 hover:bg-accent-100" aria-label="Perkecil" onClick={() => ubahZoom(zoom / 1.15)}>
              <Minus size={18} {...ICON} />
            </button>
            <input type="range" aria-label="Ukuran gambar" className="min-w-0 flex-1 accent-[var(--color-accent)]"
              min={minZoom} max={4} step={0.01} value={zoom} onChange={(e) => ubahZoom(+e.target.value)} />
            <button type="button" className="btn btn-icon shrink-0 hover:bg-accent-100" aria-label="Perbesar" onClick={() => ubahZoom(zoom * 1.15)}>
              <Plus size={18} {...ICON} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => { setZoom(1); setGeser({ x: 0, y: 0 }) }}><RotateCcw size={16} {...ICON} />Penuhi bingkai</Button>
            <Button variant="secondary" onClick={() => { setZoom(minZoom); setGeser({ x: 0, y: 0 }) }}>Tampilkan utuh</Button>
            {celah && (
              <label className="ml-auto flex items-center gap-2 text-sm font-semibold">
                Warna sisi kosong
                <input type="color" value={latar} onChange={(e) => setLatar(e.target.value)}
                  className="size-9 cursor-pointer rounded-full border-2 border-[var(--line)] p-0.5" />
              </label>
            )}
          </div>
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onBatal} disabled={busy}>Batal</Button>
        <Button className="px-6" onClick={simpan} disabled={!img || busy}>{busy ? 'Menyimpan…' : 'Simpan gambar'}</Button>
      </div>
    </Modal>
  )
}
