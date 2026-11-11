import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react'
import { Button, Card, CardHeader, DataTable, EmptyState, Field, Input, PageHeader, Select } from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { qty } from '../lib/format'

type QcLine = { id: string; qty: number; qcStatus: string; qcNotes?: string | null; item: { name: string; sku: string }; location?: { code: string } | null; receipt: { number: string; warehouse: { name: string } } }

export default function Quality() {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const [status, setStatus] = useState('PENDING')
  const query = useQuery({ queryKey: ['qc', status], queryFn: () => api.get<{ items: QcLine[]; total: number }>(`/api/qc?status=${status}`) })
  const mutation = useMutation({
    mutationFn: ({ id, qcStatus, qcNotes }: { id: string; qcStatus: string; qcNotes?: string }) => api.patch(`/api/qc/${id}`, { qcStatus, qcNotes }),
    onSuccess: () => { toast.push(t('تم تحديث فحص الجودة')); qc.invalidateQueries({ queryKey: ['qc'] }) },
    onError: (e: Error) => toast.push(e.message, 'error'),
  })

  return (
    <div>
      <PageHeader title={t('فحص الجودة (QC)')} subtitle={t('قبول/رفض الأصناف المستلمة')} />
      <Card>
        <CardHeader title={t('بنود الاستلام')} actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="PENDING">PENDING</option>
            <option value="PASSED">PASSED</option>
            <option value="FAILED">FAILED</option>
          </Select>
        } />
        {(query.data?.items || []).length === 0 ? (
          <EmptyState title={t('لا توجد بنود')} description={t('لا توجد بنود في هذه الحالة')} />
        ) : (
          <DataTable headers={[t('الاستلام'), t('الصنف'), t('الموقع'), t('الكمية'), t('الحالة'), t('الإجراءات')]} rowCount={query.data?.items.length}>
            {(query.data?.items || []).map((line) => (
              <tr key={line.id} className="hover:bg-slate-50/70">
                <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{line.receipt.number}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-600">{line.item.name}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-500">{line.location?.code || '—'}</td>
                <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums">{qty(line.qty)}</td>
                <td className="px-3.5 py-2.5 text-xs font-bold">{line.qcStatus}</td>
                <td className="px-3.5 py-2.5">
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => mutation.mutate({ id: line.id, qcStatus: 'PASSED' })}><CheckCircle2 size={13} /></Button>
                    <Button size="sm" variant="danger" onClick={() => mutation.mutate({ id: line.id, qcStatus: 'FAILED' })}><XCircle size={13} /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  )
}
