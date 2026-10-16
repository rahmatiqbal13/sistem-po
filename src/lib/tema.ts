// Tema warna toko (Sistem PO v3). Setiap tema = dua tangga warna 100–900 (aksen & aksen-2) + latar.
// Tema dipasang sebagai variabel CSS di <html>, jadi semua utilitas Tailwind (bg-accent-200, text-sage-800, …) ikut berubah.

export type Palet = { a: string[]; b: string[]; bg: string; grup: 'pastel' | 'makanan' }

const MINT = ['#eaf7f2', '#d3efe5', '#ade0cf', '#7fcab3', '#4fae93', '#3a9479', '#2c7560', '#20574a', '#163b33']
const PEACH = ['#fff3ec', '#ffe3d4', '#ffc9ae', '#f9a77f', '#ee8656', '#d06c3e', '#a8532d', '#7b3d21', '#4f2816']
const LANGIT = ['#edf5fc', '#d8e9f8', '#b4d4f1', '#87b8e6', '#5b9ad6', '#4280bd', '#33659a', '#264a71', '#19314b']
const MATCHA = ['#f2f6e9', '#e3ecd0', '#cbdca9', '#adc77c', '#8fae55', '#76943f', '#5c7630', '#435724', '#2c3a18']
const MANGGA = ['#fff7e6', '#ffeccb', '#ffdb9e', '#f9c46c', '#eaa83c', '#c98b25', '#9d6c1c', '#724e15', '#49320e']

export const TEMA: Record<string, Palet> = {
  Mint: { grup: 'pastel', a: MINT, b: PEACH, bg: '#f6f8f6' },
  Lavender: { grup: 'pastel', a: ['#f3f0fc', '#e5dff8', '#cfc3f1', '#b29fe6', '#9179d6', '#7860bf', '#5f4a9c', '#463775', '#2e2550'], b: MINT, bg: '#f8f7fb' },
  Peach: { grup: 'pastel', a: PEACH, b: LANGIT, bg: '#fbf8f5' },
  Langit: { grup: 'pastel', a: LANGIT, b: PEACH, bg: '#f5f8fb' },
  Rose: { grup: 'pastel', a: ['#fdf0f3', '#fadde4', '#f4bfcc', '#ea98ab', '#da7189', '#bf5872', '#9a445a', '#713242', '#4a212b'], b: MINT, bg: '#fbf7f8' },
  Matcha: { grup: 'makanan', a: MATCHA, b: PEACH, bg: '#f7f8f3' },
  Mangga: { grup: 'makanan', a: MANGGA, b: MATCHA, bg: '#fcf9f2' },
  Stroberi: { grup: 'makanan', a: ['#fff0f1', '#ffdde0', '#ffbcc3', '#fb929d', '#ee6676', '#cf4d5d', '#a63b49', '#7a2c36', '#4e1d23'], b: MATCHA, bg: '#fcf7f7' },
  Taro: { grup: 'makanan', a: ['#f6f0f8', '#ecdff0', '#dbc4e2', '#c4a1cf', '#a87fb7', '#8e659c', '#714f7d', '#533a5c', '#36263c'], b: MANGGA, bg: '#f9f6fa' },
  'Kopi susu': { grup: 'makanan', a: ['#f8f2ec', '#efe2d5', '#e0c9b2', '#caa785', '#ae855e', '#926b47', '#735337', '#553d29', '#38281b'], b: MATCHA, bg: '#faf7f3' },
}

export type Gaya = 'Lembut' | 'Tegas'
export const GAYA: { nama: Gaya; desc: string }[] = [
  { nama: 'Lembut', desc: 'Bayangan halus, garis tipis berwarna' },
  { nama: 'Tegas', desc: 'Garis hitam & bayangan solid' },
]

export const TEMA_DEFAULT = 'Mint'
export const GAYA_DEFAULT: Gaya = 'Lembut'
const KEY = 'po-tema'

/** Variabel CSS untuk tema + gaya. `sage-*` adalah nama lama aksen-2 yang dipakai di halaman. */
export function varsTema(nama: string | null | undefined, gaya: string | null | undefined): Record<string, string> {
  const t = TEMA[nama ?? ''] ?? TEMA[TEMA_DEFAULT]
  const tegas = gaya === 'Tegas'
  const v: Record<string, string> = {}
  t.a.forEach((c, i) => { v[`--color-accent-${i + 1}00`] = c })
  t.b.forEach((c, i) => { v[`--color-accent-2-${i + 1}00`] = c; v[`--color-sage-${i + 1}00`] = c })
  v['--color-accent'] = t.a[6]
  v['--color-accent-2'] = t.b[6]
  v['--color-sage'] = t.b[6]
  v['--color-bg'] = t.bg
  v['--color-divider'] = t.a[2]
  v['--line'] = tegas ? '#2a2725' : t.a[2]
  v['--pop'] = tegas ? '4px 4px 0 #2a2725' : `0 6px 18px -8px ${t.a[5]}55, 0 1px 0 ${t.a[1]}`
  v['--pop-sm'] = tegas ? '3px 3px 0 #2a2725' : `0 3px 0 ${t.a[3]}`
  return v
}

/** Pasang tema di <html> dan ingat di perangkat ini agar halaman berikutnya langsung berwarna benar */
export function pasangTema(nama: string | null | undefined, gaya: string | null | undefined) {
  if (typeof document === 'undefined') return
  const s = document.documentElement.style
  for (const [k, val] of Object.entries(varsTema(nama, gaya))) s.setProperty(k, val)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', (TEMA[nama ?? ''] ?? TEMA[TEMA_DEFAULT]).bg)
  try { localStorage.setItem(KEY, JSON.stringify({ tema: nama, gaya })) } catch {}
}

/** Skrip kecil di <head>: pasang tema tersimpan sebelum halaman tergambar (tanpa kedip warna default) */
// Logikanya sama dengan varsTema(); data tema disisipkan sebagai JSON.
export const SKRIP_TEMA = `(function(){try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})||'null');var p=t&&${JSON.stringify(TEMA)}[t.tema];if(!p)return;
var s=document.documentElement.style,g=t.gaya==='Tegas',f=function(k,v){s.setProperty(k,v)};
p.a.forEach(function(c,i){f('--color-accent-'+(i+1)+'00',c)});p.b.forEach(function(c,i){f('--color-accent-2-'+(i+1)+'00',c);f('--color-sage-'+(i+1)+'00',c)});
f('--color-accent',p.a[6]);f('--color-accent-2',p.b[6]);f('--color-sage',p.b[6]);f('--color-bg',p.bg);f('--color-divider',p.a[2]);
f('--line',g?'#2a2725':p.a[2]);f('--pop',g?'4px 4px 0 #2a2725':'0 6px 18px -8px '+p.a[5]+'55, 0 1px 0 '+p.a[1]);f('--pop-sm',g?'3px 3px 0 #2a2725':'0 3px 0 '+p.a[3]);}catch(e){}})()`
