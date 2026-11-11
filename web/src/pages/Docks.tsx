import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { Button, Card, CardHeader, DataTable, EmptyState, Field, Input, Modal, PageHeader, Select } from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useWarehouse } from '../lib/warehouse'
import { useToast } from '../lib/toast'
import { date, dateTime, num } from '../lib/format'

type DockAppt = { id: string; number: string; carrierName?: string | null; truckPlate?: string | null; appointmentAt: string; status: string; notes?: string | null; dock?: { code: string } | null }

export default function Docks() {
  const { t, lang } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { warehouseId } = useWarehouse()
  const [open, setOpen] = useState(false)
  const [carrier, setCarrier] = useState('')
  const [plate, setPlate] = useState('')
  const [when, setWhen] = useState('')
  const [dockId, setDockId] = useState('')
  const [notes, setNotes] = useState('')

  const locationsQuery = useQuery({ queryKey: ['locations', warehouseId], queryFn: () => api.get<{ items?: any[] }>(`/api/locations?all=1&warehouseId=${warehouseId}`) })
  const docksQuery = useQuery({ queryKey: ['docks', warehouseId], queryFn: () => api.get<{ items: DockAppt[]; total: number }>(`/api/docks?warehouseId=${warehouseId}`) })
  const locations = (locationsQuery.data as any)?.items || (locationsQuery.data as any)?.locations || []

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/docks', { warehouseId, carrierName: carrier, truckPlate: plate, appointmentAt: when, dockLocationId: dockId || null, notes }),
    onSuccess: () => { toast.push(t('تم حجز الموعد')); setOpen(false); setCarrier(''); setPlate(''); setWhen(''); setDockId(''); setNotes(''); qc.invalidateQueries({ queryKey: ['docks'] }) },
    onError: (e: Error) => toast.push(e.message, 'error'),
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/api/docks/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docks'] }),
    onError: (e: Error) => toast.push(e.message, 'error'),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/api/docks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['docks'] }),
    onError: (e: Error) => toast.push(e.message, 'error'),
  })

  return (
    <div>
      <PageHeader
        title={t('جدولة الأرصفة (Dock Scheduling)')}
        subtitle={t('حجز أوقات للشاحنات والأرصفة')}
        actions={<Button onClick={() => setOpen(true)}><Plus size={16} /> {t('حجز موعد')}</Button>}
      />
      <Card>
        <CardHeader title={t('المواعيد')} subtitle={`${num(docksQuery.data?.total || 0)} ${t('موعد')}`} />
        {(docksQuery.data?.items || []).length === 0 ? (
          <EmptyState title={t('لا توجد مواعيد')} description={t('احجز موعدًا جديدًا')} />
        ) : (
          <DataTable headers={[t('الرقم'), t('الناقل'), t('اللوحة'), t('الرصيف'), t('الوقت'), t('الحالة'), t('الإجراءات')]} rowCount={docksQuery.data?.items.length}>
            {(docksQuery.data?.items || []).map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/70">
                <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-slate-700">{a.number}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-600">{a.carrierName || '—'}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-600">{a.truckPlate || '—'}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-600">{a.dock?.code || '—'}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-500">{dateTime(a.appointmentAt, lang)}</td>
                <td className="px-3.5 py-2.5">
                  <Select value={a.status} onChange={(e) => statusMutation.mutate({ id: a.id, status: e.target.value })} className="h-8 w-32 text-[10px]">
                    {['SCHEDULED', 'ARRIVED', 'DOCKED', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </td>
                <td className="px-3.5 py-2.5">
                  <Button size="sm" variant="danger" onClick={() => deleteMutation.mutate(a.id)}><Trash2 size={13} /></Button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t('حجز موعد')} subtitle={t('أدخل تفاصيل الشاحنة')}>
        <div className="space-y-3">
          <Field label={t('الناقل')}><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} /></Field>
          <Field label={t('لوحة الشاحنة')}><Input value={plate} onChange={(e) => setPlate(e.target.value)} /></Field>
          <Field label={t('الرصيف')}>
            <Select value={dockId} onChange={(e) => setDockId(e.target.value)}>
              <option value="">{t('تلقائي')}</option>
              {locations.filter((l: any) => l.type === 'DOCK' || l.type === 'SHIPPING').map((l: any) => <option key={l.id} value={l.id}>{l.code}</option>)}
            </Select>
          </Field>
          <Field label={t('الوقت')}><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Field label={t('ملاحظات')}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('إلغاء')}</Button>
            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!when}>{t('حفظ')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
