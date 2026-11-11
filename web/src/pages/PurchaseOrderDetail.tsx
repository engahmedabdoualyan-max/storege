import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, FileText, PackageCheck, Printer, Truck, XCircle } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  DataTable,
  Field,
  Input,
  KeyValue,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { date, dateTime, money, qty } from '../lib/format'
import type { Invoice, Location, PurchaseOrder } from '../lib/types'

type ReceiveLine = {
  poLineId: string
  itemId: string
  itemName: string
  remaining: number
  qty: string
  lotCode: string
  expiryDate: string
  serials: string
}

export default function PurchaseOrderDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([])
  const [locationId, setLocationId] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const { data: po, isLoading } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => api.get<PurchaseOrder>(`/api/purchase-orders/${id}`),
    enabled: Boolean(id),
  })
  const locationsQuery = useQuery({
    queryKey: ['locations-po', po?.warehouseId],
    queryFn: () => api.get<Location[]>(`/api/locations?all=1&warehouseId=${po!.warehouseId}&active=true`),
    enabled: Boolean(po?.warehouseId),
  })

  useEffect(() => {
    if (!po) return
    setReceiveLines(
      po.lines
        .map((line) => ({
          poLineId: line.id,
          itemId: line.itemId,
          itemName: line.item.name,
          remaining: Math.max(0, Math.round((line.qty - line.receivedQty) * 1000) / 1000),
          qty: String(Math.max(0, Math.round((line.qty - line.receivedQty) * 1000) / 1000)),
          lotCode: '',
          expiryDate: '',
          serials: '',
        }))
        .filter((line) => line.remaining > 0),
    )
  }, [po])

  const receivingLocations = useMemo(() => {
    const locations = locationsQuery.data || []
    return [...locations].sort((a, b) => {
      const score = (type: string) => (type === 'DOCK' ? 0 : type === 'STAGING' ? 1 : 2)
      return score(a.type) - score(b.type)
    })
  }, [locationsQuery.data])

  const receiveMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/purchase-orders/${id}/receive`, {
        locationId: locationId || null,
        notes: notes || null,
        lines: receiveLines
          .filter((line) => Number(line.qty) > 0)
          .map((line) => ({
            poLineId: line.poLineId,
            qty: Number(line.qty),
            locationId: locationId || null,
            lotCode: line.lotCode || null,
            expiryDate: line.expiryDate || null,
            serials: line.serials
              .split(/[\n,]/)
              .map((value) => value.trim())
              .filter(Boolean),
          })),
      }),
    onSuccess: () => {
      toast.push(t('تم تسجيل الاستلام'))
      setReceiveOpen(false)
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['putaway'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/api/purchase-orders/${id}/cancel`),
    onSuccess: () => {
      toast.push(t('تم إلغاء الأمر'))
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const invoiceMutation = useMutation({
    mutationFn: () =>
      api.post<Invoice>('/api/invoices', { type: 'PURCHASE', refType: 'PURCHASE_ORDER', refId: id, force: true }),
    onSuccess: (invoice) => {
      toast.push(t('تم إنشاء الفاتورة'))
      navigate(`/invoices/${invoice.id}`)
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  if (isLoading) return <Spinner label={t('جاري التحميل...')} />
  if (!po) return <p className="text-sm text-slate-500">{t('أمر الشراء غير موجود')}</p>

  const openReceive = () => {
    setFormError('')
    setNotes('')
    setLocationId(receivingLocations[0]?.id || '')
    setReceiveLines((current) => current.map((line) => ({ ...line, qty: String(line.remaining) })))
    setReceiveOpen(true)
  }

  const pending = po.lines.some((line) => line.receivedQty < line.qty)

  return (
    <div>
      <Link to="/receiving" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700">
        <ArrowRight size={14} /> {t('الاستلام')}
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{po.number}</span>
            <StatusBadge status={po.status} />
          </span>
        }
        subtitle={`${po.supplier?.name || t('بدون مورد')} · ${po.warehouse.name}`}
        actions={
          <>
            {po.status === 'RECEIVED' ? (
              <Button variant="secondary" onClick={() => invoiceMutation.mutate()} loading={invoiceMutation.isPending}>
                <FileText size={15} /> {t('إنشاء فاتورة')}
              </Button>
            ) : null}
            {can('MANAGER', 'OPERATOR') && pending && po.status !== 'CANCELLED' ? (
              <Button onClick={openReceive}>
                <PackageCheck size={16} /> {t('استلام')}
              </Button>
            ) : null}
            {can('MANAGER') && ['OPEN', 'PARTIAL'].includes(po.status) ? (
              <Button
                variant="secondary"
                onClick={() => {
                  if (window.confirm(t('تأكيد إلغاء أمر الشراء؟'))) cancelMutation.mutate()
                }}
              >
                <XCircle size={15} /> {t('إلغاء')}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => window.print()}>
              <Printer size={15} /> {t('طباعة')}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title={t('أصناف الأمر')} subtitle={`${po.lines.length} ${t('سطر')}`} />
          <DataTable
            headers={[t('الصنف'), t('الكمية'), t('المستلم'), t('المتبقي'), t('التكلفة'), t('الإجمالي')]}
            rowCount={po.lines.length}
          >
            {po.lines.map((line) => {
              const remaining = Math.max(0, line.qty - line.receivedQty)
              return (
                <tr key={line.id}>
                  <td className="px-3.5 py-2.5">
                    <p className="text-xs font-bold text-slate-800">{line.item.name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{line.item.sku}</p>
                  </td>
                  <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(line.qty)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-emerald-700">{qty(line.receivedQty)}</td>
                  <td className="px-3.5 py-2.5">
                    <span className={`text-xs font-bold ${remaining > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {qty(remaining)}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-xs text-slate-600">{money(line.unitCost, lang)}</td>
                  <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{money(line.qty * line.unitCost, lang)}</td>
                </tr>
              )
            })}
          </DataTable>

          <div className="border-t border-slate-100 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-600">
              <Truck size={14} /> {t('سندات الاستلام')}
            </h3>
            {(po.receipts || []).length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">{t('لا توجد سندات استلام')}</p>
            ) : (
              <div className="space-y-2">
                {(po.receipts || []).map((receipt) => (
                  <div key={receipt.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs font-bold text-slate-700">{receipt.number}</p>
                        <p className="text-[10px] text-slate-400">{dateTime(receipt.createdAt, lang)}</p>
                      </div>
                      <StatusBadge status={receipt.status} />
                    </div>
                    <div className="mt-2 space-y-1">
                      {receipt.lines.map((line) => (
                        <div key={line.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate text-slate-500">
                            {line.item.name}
                            {line.lotCode ? <span className="ms-1 font-mono text-slate-400">· {line.lotCode}</span> : null}
                          </span>
                          <span className="shrink-0 font-bold text-slate-700">
                            {qty(line.qty)} → {line.location?.code || '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('بيانات الأمر')} />
            <div className="space-y-1 px-4 py-3">
              <KeyValue label={t('المورد')} value={po.supplier?.name || '—'} />
              <KeyValue label={t('المخزن')} value={po.warehouse.name} />
              <KeyValue label={t('الحالة')} value={<StatusBadge status={po.status} />} />
              <KeyValue label={t('تاريخ الإنشاء')} value={date(po.createdAt, lang)} />
              <KeyValue label={t('التاريخ المتوقع')} value={po.expectedAt ? date(po.expectedAt, lang) : '—'} />
              <KeyValue label={t('عدد السندات')} value={po.receipts?.length || 0} />
            </div>
          </Card>

          <Card>
            <CardHeader title={t('الملخص')} />
            <div className="space-y-1 px-4 py-3">
              <KeyValue label={t('الصافي')} value={money(po.subtotal, lang)} />
              <KeyValue label={`${t('الضريبة')} (${po.taxRate}%)`} value={money(po.taxAmount, lang)} />
              <div className="mt-1 border-t border-slate-100 pt-1.5">
                <KeyValue label={<b className="text-slate-700">{t('الإجمالي')}</b>} value={<b className="text-brand-800">{money(po.total, lang)}</b>} />
              </div>
            </div>
          </Card>

          {po.notes ? (
            <Card>
              <CardHeader title={t('ملاحظات')} />
              <p className="px-4 py-3 text-xs leading-6 text-slate-500">{po.notes}</p>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title={t('استلام أمر الشراء')}
        subtitle={po.number}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReceiveOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => receiveMutation.mutate()}
              loading={receiveMutation.isPending}
              disabled={!receiveLines.some((line) => Number(line.qty) > 0)}
            >
              {t('تأكيد الاستلام')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('موقع الاستلام')} required hint={t('يمكن تغييره لكل سطر')}>
              <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">{t('اختر الموقع')}</option>
                {receivingLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} — {location.name} ({location.type})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('ملاحظات')}>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>

          <div className="space-y-2">
            {receiveLines.map((line, index) => (
              <div key={line.poLineId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{line.itemName}</p>
                    <p className="text-[10px] text-slate-400">
                      {t('المتبقي')}: {qty(line.remaining)}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.qty}
                    onChange={(event) => {
                      const copy = [...receiveLines]
                      copy[index] = { ...copy[index], qty: event.target.value }
                      setReceiveLines(copy)
                    }}
                    className="w-28"
                  />
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Input
                    value={line.lotCode}
                    onChange={(event) => {
                      const copy = [...receiveLines]
                      copy[index] = { ...copy[index], lotCode: event.target.value }
                      setReceiveLines(copy)
                    }}
                    placeholder={t('كود الدفعة')}
                    dir="ltr"
                  />
                  <Input
                    type="date"
                    value={line.expiryDate}
                    onChange={(event) => {
                      const copy = [...receiveLines]
                      copy[index] = { ...copy[index], expiryDate: event.target.value }
                      setReceiveLines(copy)
                    }}
                    placeholder={t('تاريخ الانتهاء')}
                  />
                </div>
                <Textarea
                  rows={2}
                  value={line.serials}
                  onChange={(event) => {
                    const copy = [...receiveLines]
                    copy[index] = { ...copy[index], serials: event.target.value }
                    setReceiveLines(copy)
                  }}
                  placeholder={t('الأرقام التسلسلية (سيريال لكل سطر) — للأصناف المتسلسلة فقط')}
                  className="mt-2 font-mono text-[11px]"
                  dir="ltr"
                />
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
