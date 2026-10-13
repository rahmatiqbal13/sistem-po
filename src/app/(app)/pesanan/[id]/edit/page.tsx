'use client'

import { useParams } from 'next/navigation'
import { OrderForm } from '@/components/order-form'

export default function EditPesananPage() {
  const { id } = useParams<{ id: string }>()
  return <OrderForm orderId={id} />
}
