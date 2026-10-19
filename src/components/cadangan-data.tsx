'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchSemua } from '@/lib/data'
import { downloadSheets } from '@/lib/export'
import { errMsg, tanggal, today } from '@/lib/format'
import { selisihHari } from '@/lib/pengingat'
import { Alert, Button, ICON } from './ui'

/** Waktu ISO → YYYY-MM-DD menurut jam perangkat */
function tanggalLokal(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PENGINGAT_HARI = 7

// Urutan sheet = urutan tabel; kolom ditulis apa adanya agar bisa dipulihkan bila perlu
const TABEL: { nama: string; tabel: string; urut: string; opsional?: boolean }[] = [
  { nama: 'Pesanan', tabel: 'order_summary', urut: 'created_at' },
  { nama: 'Item pesanan', tabel: 'order_items', urut: 'order_id' },
  { nama: 'Pembayaran', tabel: 'payments', urut: 'created_at' },
  { nama: 'Pembeli', tabel: 'customers', urut: 'created_at' },
  { nama: 'Produk', tabel: 'products', urut: 'created_at' },
  { nama: 'Batch', tabel: 'po_batches', urut: 'created_at' },
  { nama: 'Menu batch', tabel: 'batch_product_quotas', urut: 'batch_id' },
  { nama: 'Pengaturan', tabel: 'pengaturan', urut: 'id' },
  { nama: 'Log aktivitas', tabel: 'order_log', urut: 'id', opsional: true },
]

/** Unduh seluruh data sebagai satu file Excel, dan ingatkan bila sudah lama tidak dicadangkan */
export function CadanganData({ terakhir, onSelesai }: { terakhir: string | null; onSelesai: (waktu: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lama = !terakhir || selisihHari(today(), tanggalLokal(terakhir)) > PENGINGAT_HARI

  async function unduh() {
    setBusy(true); setError('')
    try {
      const sheets = []
      for (const t of TABEL) {
        try {
          sheets.push({ nama: t.nama, rows: await fetchSemua<Record<string, unknown>>(t.tabel, t.urut) })
        } catch (e) { if (!t.opsional) throw e }
      }
      await downloadSheets(sheets, `cadangan-po-${today()}`)
      const waktu = new Date().toISOString()
      const { error } = await createClient().from('pengaturan').update({ cadangan_terakhir: waktu }).eq('id', 1)
      if (!error) onSelesai(waktu)
    } catch (e) { setError('Gagal mengunduh cadangan: ' + errMsg(e)) }
    setBusy(false)
  }

  return (
    <section aria-labelledby="ttl-cadangan" className="flex flex-col gap-4 rounded-card bg-surface p-6">
      <div>
        <h2 id="ttl-cadangan" className="text-section">Cadangan data</h2>
        <div className="mt-0.5 text-sm text-neutral-800">
          Satu file Excel berisi semua pesanan, item, pembayaran, pembeli, produk, batch, dan log aktivitas.
          Simpan di tempat lain (Google Drive, laptop) agar data tetap aman bila terjadi masalah.
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      <Alert tone={lama ? 'warn' : 'muted'}>
        {terakhir
          ? <>Terakhir dicadangkan {tanggal(terakhir, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.{lama && ` Sudah lebih dari ${PENGINGAT_HARI} hari, sebaiknya unduh lagi.`}</>
          : 'Belum pernah dicadangkan.'}
      </Alert>
      <Button className="self-start px-5" disabled={busy} onClick={unduh}>
        <Download size={18} {...ICON} />{busy ? 'Menyiapkan file…' : 'Unduh semua data (Excel)'}
      </Button>
    </section>
  )
}
