import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react'
import { Button, Card, CardHeader, DataTable, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useWarehouse } from '../lib/warehouse'
import { useToast } from '../lib/toast'
import { num, qty } from '../lib/format'

type ReturnLine = { itemId: string; qty: number; disposition: 'RESTOCK' | 'SCRAP' | 'QUARANTINE'; locationId?: string | null; item?: { name: string; sku: string; unit: string } }
type ReturnDoc = { id: string; number: string; type: string; partnerName: string; status: string; reason?: string | null; warehouseId: string; lines: ReturnLine[] }

export default function Returns() {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { warehouseId } = useWarehouse()
  const [open, setOpen] = useState(false)
  const [partnerName, setPartnerName] = useState('')
  const [type, setType] = useState('CUSTOMER')
  const [reason, setReason] = useState('')
  const [itemId, setItemId] = useState('')
  const [qtyVal, setQtyVal] = useState('1')
  const [disposition, setDisposition] = useState<'RESTOCK' | 'SCRAP' | 'QUARANTINE'>('QUARANTINE')
  const [locationId, setLocationId] = useState('')
  const [lines, setLines] = useState<ReturnLine[]>([])

  const itemsQuery = useQuery({ queryKey: ['items-all'], queryFn: () => api.get<{ items: { id: string; name: string; sku: string; unit: string }[] }>('/api/items?active=all&pageSize=200') })
  const locationsQuery = useQuery({ queryKey: ['locations-all', warehouseId], queryFn: () => api.get<{ items?: any[] }>(`/api/locations?all=1&warehouseId=${warehouseId}`) })
  const returnsQuery = useQuery({ queryKey: ['returns', warehouseId], queryFn: () => api.get<{ items: ReturnDoc[]; total: number }>(`/api/returns?warehouseId=${warehouseId}`) })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/api/returns', {
        type,
        partnerName,
        warehouseId,
        reason,
        lines: lines.map((l) => ({ itemId: l.itemId, qty: l.qty, disposition: l.disposition, locationId: l.locationId })),
      }),
    onSuccess: () => {
      toast.push(t('تم إنشاء المرتجع'))
      setOpen(false)
      setLines([])
      setPartnerName('')
      setReason('')
      qc.invalidateQueries({ queryKey: ['returns'] })
    },
    onError: (e: Error) => toast.push(e.message, 'error'),
  })

  const receiveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/returns/${id}/receive`),
    onSuccess: () => { toast.push(t('تم استلام المرتجع')); qc.invalidateQueries({ queryKey: ['returns'] }) },
    onError: (e: Error) => toast.push(e.message, 'error'),
  })
  const completeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/returns/${id}/complete`),
    onSuccess: () => { toast.push(t('تم إكمال المرتجع')); qc.invalidateQueries({ queryKey: ['returns'] }) },
    onError: (e: Error) => toast.push(e.message, 'error'),
  })
  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/returns/${id}/cancel`),
    onSuccess: () => { toast.push(t('تم إلغاء المرتجع')); qc.invalidateQueries({ queryKey: ['returns'] }) },
    onError: (e: Error) => toast.push(e.message, 'error'),
  })

  const addLine = () => {
    const item = (itemsQuery.data?.items || []).find((i) => i.id === itemId)
    if (!item || !qtyVal) return
    setLines((current) => [...current, { itemId, qty: Number(qtyVal), disposition, locationId: locationId || null, item }])
    setItemId('')
    setQtyVal('1')
  }

  const locations = (locationsQuery.data as any)?.items || (locationsQuery.data as any)?.locations || []

  return (
    <div>
      <PageHeader
        title={t('المرتجعات (RMA)')}
        subtitle={t('استلام مرتجعات العملاء/الموردين وتحديد مصيرها')}
        actions={<Button onClick={() => setOpen(true)}><RotateCcw size={16} /> {t('مرتجع جديد')}</Button>}
      />

      <Card>
        <CardHeader title={t('قائمة المرتجعات')} subtitle={`${num(returnsQuery.data?.total || 0)} ${t('مرتجع')}`} />
        {(returnsQuery.data?.items || []).length === 0 ? (
          <EmptyState title={t('لا توجد مرتجعات')} description={t('أنشئ مرتجعًا جديدًا للبدء')} />
        ) : (
          <DataTable headers={[t('الرقم'), t('النوع'), t('الشريك'), t('الحالة'), t('الأصناف'), t('الإجراءات')]} rowCount={returnsQuery.data?.items.length}>
            {(returnsQuery.data?.items || []).map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/70">
                <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-slate-700">{r.number}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-600">{r.type}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-600">{r.partnerName}</td>
                <td className="px-3.5 py-2.5"><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold">{r.status}</span></td>
                <td className="px-3.5 py-2.5 text-xs text-slate-500">{r.lines.map((l) => `${l.item?.name} × ${qty(l.qty)}`).join('، ')}</td>
                <td className="px-3.5 py-2.5">
                  <div className="flex gap-1">
                    {r.status === 'DRAFT' ? (
                      <Button size="sm" onClick={() => receiveMutation.mutate(r.id)} loading={receiveMutation.isPending}>
                        {t('استلام')}
                      </Button>
                    ) : null}
                    {r.status === 'RECEIVED' ? (
                      <Button size="sm" onClick={() => completeMutation.mutate(r.id)} loading={completeMutation.isPending}>
                        <CheckCircle2 size={13} /> {t('إكمال')}
                      </Button>
                    ) : null}
                    {!['COMPLETED', 'CANCELLED'].includes(r.status) ? (
                      <Button size="sm" variant="danger" onClick={() => cancelMutation.mutate(r.id)}>
                        <Trash2 size={13} />
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t('مرتجع جديد')} subtitle={t('أضف أصنافًا وحدد مصيرها')}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('النوع')}>
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="CUSTOMER">{t('مرتجع عميل')}</option>
                <option value="SUPPLIER">{t('مرتجع مورد')}</option>
              </Select>
            </Field>
            <Field label={t('اسم الشريك')}>
              <Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
            </Field>
          </div>
          <Field label={t('السبب')}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 text-xs font-bold text-slate-600">{t('إضافة صنف')}</p>
            <div className="grid gap-2 sm:grid-cols-4">
              <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">{t('اختر')}</option>
                {(itemsQuery.data?.items || []).map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </Select>
              <Input type="number" value={qtyVal} onChange={(e) => setQtyVal(e.target.value)} placeholder={t('الكمية')} />
              <Select value={disposition} onChange={(e) => setDisposition(e.target.value as any)}>
                <option value="QUARANTINE">{t('حجر')}</option>
                <option value="RESTOCK">{t('إعادة للمخزون')}</option>
                <option value="SCRAP">{t('إتلاف')}</option>
              </Select>
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">{t('الموقع')}</option>
                {locations.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.code}</option>
                ))}
              </Select>
            </div>
            <Button size="sm" className="mt-2" onClick={addLine} disabled={!itemId}>
              {t('إضافة')}
            </Button>
          </div>

          {lines.length ? (
            <div className="space-y-1">
              {lines.map((l, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <span>{l.item?.name} × {qty(l.qty)} — {l.disposition}</span>
                  <button onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-rose-600">{t('حذف')}</button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t('إلغاء')}</Button>
            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!partnerName || !lines.length}>
              {t('حفظ')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
