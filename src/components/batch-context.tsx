'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Batch } from '@/lib/types'

interface Ctx {
  batches: Batch[]
  batch: Batch | null
  batchId: string | null
  setBatchId: (id: string) => void
  reload: () => Promise<void>
  loading: boolean
  email: string | null
}

const BatchContext = createContext<Ctx | null>(null)
const KEY = 'po.batchId'

function readStored() {
  try { return localStorage.getItem(KEY) } catch { return null }
}

export function BatchProvider({ children }: { children: ReactNode }) {
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchId, setId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('po_batches').select('*').order('created_at', { ascending: false })
    const list = (data ?? []) as Batch[]
    setBatches(list)
    setId((cur) => {
      const want = cur ?? readStored()
      if (want && list.some((b) => b.id === want)) return want
      return (list.find((b) => b.status === 'buka') ?? list[0])?.id ?? null
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [reload])

  const setBatchId = useCallback((id: string) => {
    setId(id)
    try { localStorage.setItem(KEY, id) } catch {}
  }, [])

  const batch = batches.find((b) => b.id === batchId) ?? null

  return (
    <BatchContext value={{ batches, batch, batchId, setBatchId, reload, loading, email }}>
      {children}
    </BatchContext>
  )
}

export function useBatch() {
  const ctx = useContext(BatchContext)
  if (!ctx) throw new Error('useBatch harus di dalam BatchProvider')
  return ctx
}
