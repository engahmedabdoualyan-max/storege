import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, FileText, PackageCheck, PackageSearch, Printer, Truck, XCircle } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Field,
  Input,
  KeyValue,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
  Textarea,
} from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { date, dateTime, money, qty } from '../lib/format'
import type { Invoice, SalesOrder } from '../lib/types'

export default function SalesOrderDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [shipOpen, setShipOpen] = useState(false)
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [notes, setNotes] = useState('')

  const { data: so, isLoading } = useQuery({
    queryKey: ['sales-order', id],
    queryFn: () => api.get<SalesOrder>(`/api/sales-orders/${id}`),
    enabled: Boolean(id),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['sales-order', id] })
    queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
    queryClient.invalidateQueries({ queryKey: ['picking-queue'] })
    queryClient.invalidateQueries({ queryKey: ['shipping-queue'] })
  }

  const allocateMutation = useMutation({
    mutationFn: () => api.post<{ fullyAllocated: boolean; allocated: number }>(`/api/sales-orders/${id}/allocate`),
    onSuccess: (result) => {
      toast.push(result.fullyAllocated ? t('تم تخصيص الأمر بالكامل') : t('تم التخصيص الجزئي'), result.fullyAllocated ? 'success' : 'warning')
      refresh()
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/api/sales-orders/${id}/cancel`),
    onSuccess: () => {
      toast.push(t('تم إلغاء الأمر'))
      refresh()
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const invoiceMutation = useMutation({
    mutationFn: () =>
      api.post<Invoice>('/api/invoices', { type: 'SALES', refType: 'SALES_ORDER', refId: id, force: true }),
    onSuccess: (invoice) => {
      toast.push(t('تم إنشاء الفاتورة'))
      navigate(`/invoices/${invoice.id}`)
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const shipMutation = useMutation({
    mutationFn: () => api.post(`/api/sales-orders/${id}/ship`, { carrier, tracking, notes }),
    onSuccess: () => {
      toast.push(t('تم شحن الأمر'))
      setShipOpen(false)
      refresh()
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  if (isLoading) return <Spinner label={t('جاري التحميل...')} />
  if (!so) return <p className="text-sm text-slate-500">{t('أمر البيع غير موجود')}</p>

  const picked = so.lines.reduce((sum, line) => sum + line.pickedQty, 0)
  const totalQty = so.lines.reduce((sum, line) => sum + line.qty, 0)
  const packed = so.lines.reduce((sum, line) => sum + line.packedQty, 0)
  const allPacked = so.lines.length > 0 && so.lines.every((line) => line.packedQty >= line.qty)

  return (
    <div>
      <Link to="/sales-orders" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700">
        <ArrowRight size={14} /> {t('أوامر البيع')}
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{so.number}</span>
            <StatusBadge status={so.status} />
            <StatusBadge status={so.priority} />
          </span>
        }
        subtitle={`${so.customer?.name || t('عميل نقدي')} · ${so.warehouse.name}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => window.print()}>
              <Printer size={15} /> {t('طباعة')}
            </Button>
            {can('MANAGER', 'OPERATOR') && ['OPEN', 'ALLOCATED'].includes(so.status) ? (
              <Button variant="secondary" onClick={() => allocateMutation.mutate()} loading={allocateMutation.isPending}>
                <PackageCheck size={15} /> {t('تخصيص المخزون')}
              </Button>
            ) : null}
            {can('MANAGER', 'OPERATOR') && ['ALLOCATED', 'PICKING', 'PICKED'].includes(so.status) ? (
              <Link to={`/picking/${so.id}`}>
                <Button>
                  <PackageSearch size={16} /> {t('تجهيز الطلب')}
                </Button>
              </Link>
            ) : null}
            {can('MANAGER', 'OPERATOR') && allPacked && so.status !== 'SHIPPED' ? (
              <Button onClick={() => setShipOpen(true)}>
                <Truck size={16} /> {t('شحن')}
              </Button>
            ) : null}
            {can('MANAGER', 'OPERATOR') && so.status !== 'CANCELLED' ? (
              <Button variant="secondary" onClick={() => invoiceMutation.mutate()} loading={invoiceMutation.isPending}>
                <FileText size={15} /> {t('فاتورة')}
              </Button>
            ) : null}
            {can('MANAGER') && !['SHIPPED', 'CANCELLED'].includes(so.status) ? (
              <Button
                variant="secondary"
                onClick={() => {
                  if (window.confirm(t('تأكيد إلغاء أمر البيع؟'))) cancelMutation.mutate()
                }}
              >
                <XCircle size={15} /> {t('إلغاء')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
          <p className="text-[10px] font-bold text-slate-400">{t('الكمية')}</p>
          <p className="text-lg font-extrabold text-slate-800">{qty(totalQty)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
          <p className="text-[10px] font-bold text-slate-400">{t('تم تجهيزه')}</p>
          <p className="text-lg font-extrabold text-amber-600">{qty(picked)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
          <p className="text-[10px] font-bold text-slate-400">{t('تم تعبئته')}</p>
          <p className="text-lg font-extrabold text-emerald-600">{qty(packed)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
          <p className="text-[10px] font-bold text-slate-400">{t('المخزن')}</p>
          <p className="truncate text-sm font-extrabold text-slate-800">{so.warehouse.code}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
          <p className="text-[10px] font-bold text-slate-400">{t('التاريخ')}</p>
          <p className="text-sm font-extrabold text-slate-800">{date(so.createdAt, lang)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card">
          <p className="text-[10px] font-bold text-slate-400">{t('الإجمالي')}</p>
          <p className="text-sm font-extrabold text-brand-800">{money(so.total, lang)}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title={t('أصناف الأمر')} subtitle={`${so.lines.length} ${t('سطر')}`} />
            <DataTable
              headers={[t('الصنف'), t('الكمية'), t('مخصص'), t('مجهز'), t('معبأ'), t('السعر'), t('الإجمالي')]}
              rowCount={so.lines.length}
            >
              {so.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-3.5 py-2.5">
                    <p className="text-xs font-bold text-slate-800">{line.item.name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{line.item.sku}</p>
                  </td>
                  <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(line.qty)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-indigo-600">{qty(line.allocatedQty)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-amber-600">{qty(line.pickedQty)}</td>
                  <td className="px-3.5 py-2.5">
                    <span className={`text-xs font-bold tabular-nums ${line.packedQty >= line.qty ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {qty(line.packedQty)}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-xs text-slate-600">{money(line.unitPrice, lang)}</td>
                  <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{money(line.qty * line.unitPrice, lang)}</td>
                </tr>
              ))}
            </DataTable>
          </Card>

          <Card>
            <CardHeader title={t('التخصيصات')} subtitle={t('المواقع المحجوزة لهذا الأمر')} />
            <DataTable
              headers={[t('الصنف'), t('الموقع'), t('الدفعة'), t('الكمية'), t('تم تجهيزه'), t('الحالة')]}
              rowCount={so.allocations?.length}
              empty={(so.allocations?.length || 0) === 0}
            >
              {(so.allocations || []).map((allocation) => (
                <tr key={allocation.id}>
                  <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{allocation.item.name}</td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-600">{allocation.location.code}</td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{allocation.lot?.code || '—'}</td>
                  <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{qty(allocation.qty)}</td>
                  <td className="px-3.5 py-2.5 text-xs text-amber-600">{qty(allocation.pickedQty)}</td>
                  <td className="px-3.5 py-2.5"><StatusBadge status={allocation.status} /></td>
                </tr>
              ))}
            </DataTable>
          </Card>

          {(so.shipments || []).length ? (
            <Card>
              <CardHeader title={t('الشحنات')} />
              <DataTable headers={[t('شركة الشحن'), t('رقم التتبع'), t('التاريخ')]} rowCount={so.shipments?.length}>
                {(so.shipments || []).map((shipment) => (
                  <tr key={shipment.id}>
                    <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{shipment.carrier || '—'}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{shipment.tracking || '—'}</td>
                    <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{dateTime(shipment.shippedAt, lang)}</td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('بيانات الأمر')} />
            <div className="space-y-1 px-4 py-3">
              <KeyValue label={t('العميل')} value={so.customer?.name || t('عميل نقدي')} />
              <KeyValue label={t('المخزن')} value={so.warehouse.name} />
              <KeyValue label={t('الأولوية')} value={<StatusBadge status={so.priority} />} />
              <KeyValue label={t('الحالة')} value={<StatusBadge status={so.status} />} />
              <KeyValue label={t('عنوان الشحن')} value={so.shipTo || '—'} />
              <KeyValue label={t('تاريخ الشحن')} value={so.shippedAt ? dateTime(so.shippedAt, lang) : '—'} />
            </div>
          </Card>

          <Card>
            <CardHeader title={t('الملخص')} />
            <div className="space-y-1 px-4 py-3">
              <KeyValue label={t('الصافي')} value={money(so.subtotal, lang)} />
              <KeyValue label={`${t('الضريبة')} (${so.taxRate}%)`} value={money(so.taxAmount, lang)} />
              <div className="mt-1 border-t border-slate-100 pt-1.5">
                <KeyValue label={<b className="text-slate-700">{t('الإجمالي')}</b>} value={<b className="text-brand-800">{money(so.total, lang)}</b>} />
              </div>
            </div>
          </Card>

          {(so.invoices || []).length ? (
            <Card>
              <CardHeader title={t('الفواتير')} />
              <div className="divide-y divide-slate-100">
                {(so.invoices || []).map((invoice) => (
                  <Link
                    key={invoice.id}
                    to={`/invoices/${invoice.id}`}
                    className="flex items-center justify-between px-4 py-2.5 text-xs hover:bg-slate-50"
                  >
                    <span className="font-mono font-bold text-slate-700">{invoice.number}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-slate-600">{money(invoice.total, lang)}</span>
                      <StatusBadge status={invoice.status} />
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          {so.notes ? (
            <Card>
              <CardHeader title={t('ملاحظات')} />
              <p className="px-4 py-3 text-xs leading-6 text-slate-500">{so.notes}</p>
            </Card>
          ) : null}

          <Alert tone="info">
            <span className="flex items-start gap-2">
              <Badge tone="brand">{t('تدفق العمل')}</Badge>
              {t('تخصيص → تجهيز → تعبئة → شحن')}
            </span>
          </Alert>
        </div>
      </div>

      <Modal
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        title={t('شحن الأمر')}
        subtitle={so.number}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShipOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={() => shipMutation.mutate()} loading={shipMutation.isPending}>
              <Truck size={15} /> {t('تأكيد الشحن')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('شركة الشحن')}>
            <Input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="Aramex / Bosta / ..." />
          </Field>
          <Field label={t('رقم التتبع')}>
            <Input value={tracking} onChange={(event) => setTracking(event.target.value)} dir="ltr" />
          </Field>
          <Field label={t('ملاحظات')}>
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
