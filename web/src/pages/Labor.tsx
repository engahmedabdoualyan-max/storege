import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Plus } from 'lucide-react'
import { Button, Card, CardHeader, DataTable, EmptyState, Field, Input, PageHeader, Select } from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { qty } from '../lib/format'

type Task = { id: string; userName: string; taskType: string; refType?: string | null; refId?: string | null; qty: number; startedAt: string; endedAt?: string | null; durationSec?: number | null }

export default function Labor() {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const [taskType, setTaskType] = useState('PICK')
  const [refType, setRefType] = useState('')
  const [refId, setRefId] = useState('')
  const [qtyVal, setQtyVal] = useState('0')
  const query = useQuery({ queryKey: ['labor'], queryFn: () => api.get<{ items: Task[]; total: number }>('/api/labor') })
  const createMutation = useMutation({
    mutationFn: () => api.post('/api/labor', { taskType, refType: refType || null, refId: refId || null, qty: Number(qtyVal), startedAt: new Date().toISOString() }),
    onSuccess: () => { toast.push(t('تم تسجيل المهمة')); qc.invalidateQueries({ queryKey: ['labor'] }) },
    onError: (e: Error) => toast.push(e.message, 'error'),
  })
  const endMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/labor/${id}`, { endedAt: new Date().toISOString() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labor'] }),
    onError: (e: Error) => toast.push(e.message, 'error'),
  })

  return (
    <div>
      <PageHeader title={t('إنتاجية العمالة (Labor)')} subtitle={t('تتبع مهام ووقت المشغّلين')} />
      <Card>
        <CardHeader title={t('تسجيل مهمة')} />
        <div className="grid gap-3 p-4 sm:grid-cols-5">
          <Select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
            <option value="PICK">PICK</option>
            <option value="PUTAWAY">PUTAWAY</option>
            <option value="COUNT">COUNT</option>
            <option value="RECEIVE">RECEIVE</option>
          </Select>
          <Input value={refType} onChange={(e) => setRefType(e.target.value)} placeholder={t('نوع المرجع')} />
          <Input value={refId} onChange={(e) => setRefId(e.target.value)} placeholder={t('رقم المرجع')} />
          <Input type="number" value={qtyVal} onChange={(e) => setQtyVal(e.target.value)} placeholder={t('الكمية')} />
          <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}><Plus size={16} /> {t('بدء')}</Button>
        </div>
      </Card>
      <Card className="mt-4">
        <CardHeader title={t('المهام')} subtitle={`${query.data?.total || 0} ${t('مهمة')}`} />
        {(query.data?.items || []).length === 0 ? (
          <EmptyState title={t('لا توجد مهام')} description={t('سجّل مهمة جديدة')} />
        ) : (
          <DataTable headers={[t('المستخدم'), t('النوع'), t('الكمية'), t('البداية'), t('المدة (ث)'), t('الإجراء')]} rowCount={query.data?.items.length}>
            {(query.data?.items || []).map((task) => (
              <tr key={task.id} className="hover:bg-slate-50/70">
                <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{task.userName}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-600">{task.taskType}</td>
                <td className="px-3.5 py-2.5 text-xs tabular-nums">{qty(task.qty)}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-500">{new Date(task.startedAt).toLocaleString()}</td>
                <td className="px-3.5 py-2.5 text-xs tabular-nums">{task.durationSec ?? '—'}</td>
                <td className="px-3.5 py-2.5">
                  {!task.endedAt ? <Button size="sm" onClick={() => endMutation.mutate(task.id)}><Clock size={13} /> {t('إنهاء')}</Button> : <span className="text-[10px] text-emerald-600">{t('منتهية')}</span>}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  )
}
