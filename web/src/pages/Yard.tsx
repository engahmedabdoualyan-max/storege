import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Card, CardHeader, DataTable, EmptyState, Field, Input, Modal, PageHeader, Select } from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useWarehouse } from '../lib/warehouse'
import { useToast } from '../lib/toast'

type Spot = { id: string; code: string; status: string; trailerPlate?: string | null }

export default function Yard() {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { warehouseId } = useWarehouse()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [plate, setPlate] = useState('')
  const query = useQuery({ queryKey: ['yard', warehouseId], queryFn: () => api.get<{ items: Spot[]; total: number }>(`/api/yard?warehouseId=${warehouseId}`) })
  const createMutation = useMutation({
    mutationFn: () => api.post('/api/yard', { warehouseId, code, status: plate ? 'OCCUPIED' : 'EMPTY', trailerPlate: plate || null }),
    onSuccess: () => { toast.push(t('تم إضافة الموقف')); setOpen(false); setCode(''); setPlate(''); qc.invalidateQueries({ queryKey: ['yard'] }) },
    onError: (e: Error) => toast.push(e.message, 'error'),
  })
  const patchMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/api/yard/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['yard'] }),
    onError: (e: Error) => toast.push(e.message, 'error'),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/api/yard/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['yard'] }),
    onError: (e: Error) => toast.push(e.message, 'error'),
  })

  return (
    <div>
      <PageHeader title={t('ساحة الشاحنات (Yard)')} subtitle={t('تتبع المواقف والشاحنات')} actions={<Button onClick={() => setOpen(true)}><Plus size={16} /> {t('موقف جديد')}</Button>} />
      <Card>
        <CardHeader title={t('المواقف')} subtitle={`${query.data?.total || 0} ${t('موقف')}`} />
        {(query.data?.items || []).length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">{t('لا توجد مواقف')}</div>
        ) : (
          <DataTable headers={[t('الكود'), t('الحالة'), t('اللوحة'), t('الإجراءات')]} rowCount={query.data?.items.length}>
            {(query.data?.items || []).map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/70">
                <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-slate-700">{s.code}</td>
                <td className="px-3.5 py-2.5">
                  <Select value={s.status} onChange={(e) => patchMutation.mutate({ id: s.id, status: e.target.value })} className="h-8 w-32 text-[10px]">
                    <option value="EMPTY">EMPTY</option>
                    <option value="OCCUPIED">OCCUPIED</option>
                  </Select>
                </td>
                <td className="px-3.5 py-2.5 text-xs text-slate-600">{s.trailerPlate || '—'}</td>
                <td className="px-3.5 py-2.5"><Button size="sm" variant="danger" onClick={() => deleteMutation.mutate(s.id)}><Trash2 size={13} /></Button></td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title={t('موقف جديد')}>
        <div className="space-y-3">
          <Field label={t('الكود')}><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          <Field label={t('لوحة الشاحنة (اختياري)')}><Input value={plate} onChange={(e) => setPlate(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('إلغاء')}</Button>
            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!code}>{t('حفظ')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
