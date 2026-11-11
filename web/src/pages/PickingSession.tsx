import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, MapPin, PackageCheck, PackageSearch, ScanLine, Truck } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Input,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
} from '../components/ui'
import { ScanInput } from '../components/ScanInput'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { qty } from '../lib/format'
import type { PickingDetail } from '../lib/types'

export default function PickingSession() {
  const { id = '' } = useParams()
  const { t } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [scan, setScan] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'danger' | 'warning'>('success')
  const [qtyModal, setQtyModal] = useState<{ taskId: string; label: string; remaining: number } | null>(null)
  const [qtyValue, setQtyValue] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['picking', id],
    queryFn: () => api.get<PickingDetail>(`/api/picking/${id}`),
    enabled: Boolean(id),
  })

  const order = data?.order
  const tasks = data?.tasks || []
  const allPicked = useMemo(() => (order?.lines || []).every((line) => line.pickedQty >= line.qty), [order])
  const allPacked = useMemo(() => (order?.lines || []).every((line) => line.packedQty >= line.qty), [order])

  const refresh = () => {
    refetch()
    queryClient.invalidateQueries({ queryKey: ['picking-queue'] })
    queryClient.invalidateQueries({ queryKey: ['picking', id] })
  }

  const pickMutation = useMutation({
    mutationFn: (payload: { soLineId: string; qty: number }) =>
      api.post<{ picked: number }>(`/api/sales-orders/${id}/pick`, payload),
    onSuccess: (result) => {
      toast.push(`${t('تم تجهيز')} ${qty(result.picked)}`)
      setMessage(`${t('تم تجهيز')} ${qty(result.picked)}`)
      setMessageTone('success')
      setQtyModal(null)
      refresh()
    },
    onError: (error: Error) => {
      setMessage(error.message)
      setMessageTone('danger')
      toast.push(error.message, 'error')
    },
  })

  const packMutation = useMutation({
    mutationFn: (payload: { soLineId: string; qty: number }) =>
      api.post<{ packed: number }>(`/api/sales-orders/${id}/pack`, payload),
    onSuccess: () => {
      refresh()
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const packAll = async () => {
    if (!order) return
    for (const line of order.lines) {
      const remaining = line.pickedQty - line.packedQty
      if (remaining > 0) {
        try {
          await packMutation.mutateAsync({ soLineId: line.id, qty: remaining })
        } catch {
          return
        }
      }
    }
    toast.push(t('تم تعبئة الأمر بالكامل'))
    refresh()
  }

  const onScan = (code: string) => {
    setMessage('')
    if (!order) return
    const clean = code.trim()
    const task = tasks.find(
      (candidate) =>
        candidate.item.barcode === clean ||
        candidate.item.sku.toLowerCase() === clean.toLowerCase() ||
        candidate.location.barcode === clean ||
        candidate.location.code.toLowerCase() === clean.toLowerCase(),
    )
    if (!task) {
      setMessage(`${t('الكود غير موجود ضمن مهام التجهيز')}: ${clean}`)
      setMessageTone('warning')
      setScan('')
      return
    }
    if (task.item.barcode !== clean && task.item.sku.toLowerCase() !== clean.toLowerCase()) {
      setMessage(`${t('الموقع')} ${task.location.code} — ${task.item.name}. امسح الصنف الآن.`)
      setMessageTone('warning')
      setScan('')
      return
    }
    pickMutation.mutate({ soLineId: task.soLineId, qty: task.qty - task.pickedQty })
    setScan('')
  }

  if (isLoading) return <Spinner label={t('جاري التحميل...')} />
  if (!order) return <p className="text-sm text-slate-500">{t('أمر البيع غير موجود')}</p>

  return (
    <div>
      <Link to="/picking" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700">
        <ArrowRight size={14} /> {t('التجهيز والشحن')}
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{order.number}</span>
            <StatusBadge status={order.status} />
            <StatusBadge status={order.priority} />
          </span>
        }
        subtitle={`${order.customer?.name || t('عميل نقدي')} · ${order.warehouse.name} · ${tasks.length} ${t('مهمة')}`}
        actions={
          <>
            {allPicked && !allPacked ? (
              <Button onClick={packAll} loading={packMutation.isPending}>
                <PackageCheck size={16} /> {t('تعبئة الكل')}
              </Button>
            ) : null}
            {allPacked ? (
              <Link to={`/sales-orders/${order.id}`}>
                <Button>
                  <Truck size={16} /> {t('إلى الشحن')}
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <div className="p-4">
              <ScanInput
                value={scan}
                onChange={setScan}
                onScan={onScan}
                big
                placeholder={t('امسح باركود الصنف أو الموقع')}
                disabled={!can('MANAGER', 'OPERATOR')}
              />
              {message ? (
                <div className="mt-2">
                  <Alert tone={messageTone}>{message}</Alert>
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <ScanLine size={13} />
                {t('امسح الصنف لتجهيز الكمية المتبقية، أو امسح الموقع لعرض مهامه')}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('مسار التجهيز')} subtitle={t('حسب ترتيب الرفوف')} />
            <DataTable
              headers={[t('الموقع'), t('الصنف'), t('الدفعة'), t('المطلوب'), t('تم تجهيزه'), t('المتبقي'), '']}
              rowCount={tasks.length}
              empty={tasks.length === 0}
            >
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50/70">
                  <td className="px-3.5 py-2.5">
                    <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-800">
                      <MapPin size={13} className="text-brand-500" /> {task.location.code}
                    </span>
                    <span className="text-[10px] text-slate-400">{task.location.zone?.name || ''}</span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <p className="text-xs font-bold text-slate-700">{task.item.name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{task.item.sku}</p>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{task.lot?.code || '—'}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{qty(task.qty)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-amber-600">{qty(task.pickedQty)}</td>
                  <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-brand-800">{qty(task.qty - task.pickedQty)}</td>
                  <td className="px-3.5 py-2.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setQtyModal({
                          taskId: task.soLineId,
                          label: `${task.item.name} · ${task.location.code}`,
                          remaining: task.qty - task.pickedQty,
                        })
                        setQtyValue(String(task.qty - task.pickedQty))
                      }}
                    >
                      {t('تجهيز')}
                    </Button>
                  </td>
                </tr>
              ))}
            </DataTable>
          </Card>

          <Card>
            <CardHeader title={t('أسطر الأمر')} subtitle={t('حالة التجهيز والتعبئة')} />
            <div className="divide-y divide-slate-100">
              {order.lines.map((line) => {
                const percent = line.qty ? Math.round((line.pickedQty / line.qty) * 100) : 0
                return (
                  <div key={line.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-700">{line.item.name}</p>
                        <p className="font-mono text-[10px] text-slate-400">{line.item.sku}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={line.pickedQty >= line.qty ? 'green' : 'amber'}>
                          {qty(line.pickedQty)} / {qty(line.qty)}
                        </Badge>
                        {line.packedQty >= line.qty ? <Badge tone="green">{t('معبأ')}</Badge> : null}
                      </div>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('ملخص التجهيز')} />
            <div className="space-y-2 p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('المهام المتبقية')}</span>
                <b className="text-slate-800">{tasks.length}</b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('الوحدات المتبقية')}</span>
                <b className="text-amber-600">{qty(tasks.reduce((sum, task) => sum + task.qty - task.pickedQty, 0))}</b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('تم تجهيزه')}</span>
                <b className="text-emerald-600">{qty(order.lines.reduce((sum, line) => sum + line.pickedQty, 0))}</b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('تم تعبئته')}</span>
                <b className="text-emerald-600">{qty(order.lines.reduce((sum, line) => sum + line.packedQty, 0))}</b>
              </div>
            </div>
          </Card>

          <Alert tone={allPacked ? 'success' : 'info'}>
            <span className="flex items-start gap-2">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              {allPacked
                ? t('الأمر جاهز للشحن. انتقل إلى تفاصيل الأمر واضغط شحن.')
                : allPicked
                  ? t('تم تجهيز كل الكميات. اضغط تعبئة الكل ثم الشحن.')
                  : t('أكمل تجهيز كل الكميات قبل التعبئة والشحن.')}
            </span>
          </Alert>

          <Card>
            <CardHeader title={t('مسار سريع')} />
            <div className="space-y-2 p-3">
              <Link to={`/sales-orders/${order.id}`} className="block">
                <Button variant="secondary" className="w-full" size="sm">
                  <PackageSearch size={14} /> {t('تفاصيل أمر البيع')}
                </Button>
              </Link>
              <Link to={`/inventory?item=${order.lines[0]?.itemId || ''}`} className="block">
                <Button variant="ghost" className="w-full" size="sm">
                  <PackageSearch size={14} /> {t('عرض المخزون')}
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(qtyModal)}
        onClose={() => setQtyModal(null)}
        title={t('تجهيز كمية')}
        subtitle={qtyModal?.label}
        footer={
          <>
            <Button variant="secondary" onClick={() => setQtyModal(null)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => {
                if (!qtyModal) return
                pickMutation.mutate({ soLineId: qtyModal.taskId, qty: Number(qtyValue) })
              }}
              loading={pickMutation.isPending}
              disabled={!Number(qtyValue)}
            >
              {t('تأكيد التجهيز')}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            {t('المتبقي')}: <b>{qty(qtyModal?.remaining || 0)}</b>
          </p>
          <Input type="number" step="0.001" value={qtyValue} onChange={(event) => setQtyValue(event.target.value)} autoFocus />
        </div>
      </Modal>
    </div>
  )
}
