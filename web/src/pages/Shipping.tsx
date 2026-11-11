import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, PackageCheck, Ship, Truck } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Spinner,
  StatCard,
  StatusBadge,
  Tabs,
  Textarea,
} from '../components/ui'
import { api, queryString } from '../lib/api'
import { useWarehouse } from '../lib/warehouse'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { dateTime, qty } from '../lib/format'
import type { ListResponse, SalesOrder, Shipment } from '../lib/types'

export default function Shipping() {
  const { t, lang } = useI18n()
  const { warehouseId } = useWarehouse()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('queue')
  const [search, setSearch] = useState('')
  const [shipOrder, setShipOrder] = useState<SalesOrder | null>(null)
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [notes, setNotes] = useState('')

  const queueQuery = useQuery({
    queryKey: ['shipping-queue', warehouseId, search],
    queryFn: () =>
      api.get<SalesOrder[]>(
        `/api/shipping/queue${queryString({ warehouseId, q: search })}`,
      ),
    refetchInterval: 30_000,
  })
  const shipmentsQuery = useQuery({
    queryKey: ['shipments', search],
    queryFn: () => api.get<ListResponse<Shipment>>(`/api/shipments${queryString({ q: search, pageSize: 50 })}`),
    enabled: tab === 'shipments',
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['shipping-queue'] })
    queryClient.invalidateQueries({ queryKey: ['shipments'] })
    queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
  }

  const packMutation = useMutation({
    mutationFn: async (order: SalesOrder) => {
      for (const line of order.lines) {
        const remaining = line.pickedQty - line.packedQty
        if (remaining > 0) {
          await api.post(`/api/sales-orders/${order.id}/pack`, { soLineId: line.id, qty: remaining })
        }
      }
    },
    onSuccess: () => {
      toast.push(t('تم تعبئة الأمر'))
      refresh()
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const shipMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/sales-orders/${shipOrder!.id}/ship`, {
        carrier: carrier || undefined,
        tracking: tracking || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      toast.push(t('تم شحن الأمر'))
      setShipOrder(null)
      setCarrier('')
      setTracking('')
      setNotes('')
      refresh()
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const queue = queueQuery.data || []
  const ready = queue.filter((order) => order.lines.every((line) => line.packedQty >= line.qty))
  const picked = queue.filter((order) => !order.lines.every((line) => line.packedQty >= line.qty))

  return (
    <div>
      <PageHeader title={t('الشحن')} subtitle={t('تعبئة وتسليم الأوامر الجاهزة')} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('أوامر جاهزة للشحن')} value={ready.length} icon={<Ship size={18} />} tone="green" />
        <StatCard label={t('بانتظار التعبئة')} value={picked.length} icon={<PackageCheck size={18} />} tone="amber" />
        <StatCard
          label={t('وحدات جاهزة')}
          value={qty(ready.reduce((sum, order) => sum + order.lines.reduce((lineSum, line) => lineSum + line.packedQty, 0), 0))}
          icon={<Truck size={18} />}
          tone="sky"
        />
        <StatCard
          label={t('شحنات مسجلة')}
          value={shipmentsQuery.data?.total || 0}
          icon={<CheckCircle2 size={18} />}
          tone="violet"
        />
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 pb-0">
          <Tabs
            tabs={[
              { id: 'queue', label: t('قائمة الشحن'), count: queue.length },
              { id: 'shipments', label: t('سجل الشحنات'), count: shipmentsQuery.data?.total },
            ]}
            active={tab}
            onChange={setTab}
            className="border-b-0"
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('بحث برقم الأمر أو العميل')}
            className="ms-auto mb-2 w-full sm:w-72"
          />
        </div>

        {tab === 'queue' ? (
          queueQuery.isLoading ? (
            <Spinner />
          ) : queue.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">{t('لا توجد أوامر جاهزة للشحن')}</div>
          ) : (
            <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
              {queue.map((order) => {
                const allPacked = order.lines.every((line) => line.packedQty >= line.qty)
                return (
                  <div key={order.id} className="rounded-xl border border-slate-200 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-extrabold text-brand-800">{order.number}</p>
                        <p className="text-[11px] text-slate-400">{order.customer?.name || t('عميل نقدي')}</p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {order.lines.slice(0, 4).map((line) => (
                        <div key={line.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate text-slate-500">{line.item.name}</span>
                          <span className="shrink-0 font-bold text-slate-700">
                            {qty(line.packedQty)} / {qty(line.qty)}
                          </span>
                        </div>
                      ))}
                      {order.lines.length > 4 ? (
                        <p className="text-[10px] text-slate-400">+{order.lines.length - 4} {t('سطر')}</p>
                      ) : null}
                    </div>

                    {!allPacked ? (
                      <Alert tone="warning" className="mt-2 !py-1.5 !text-[10px]">
                        {t('يجب تعبئة الكميات المتبقية قبل الشحن')}
                      </Alert>
                    ) : null}

                    <div className="mt-3 flex gap-2">
                      <Link to={`/sales-orders/${order.id}`} className="flex-1">
                        <Button variant="secondary" size="sm" className="w-full">
                          {t('تفاصيل')}
                        </Button>
                      </Link>
                      {allPacked ? (
                        <Button size="sm" className="flex-1" onClick={() => setShipOrder(order)}>
                          <Ship size={14} /> {t('شحن')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => packMutation.mutate(order)}
                          loading={packMutation.isPending}
                        >
                          <PackageCheck size={14} /> {t('تعبئة')}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          <DataTable
            headers={[t('أمر البيع'), t('العميل'), t('شركة الشحن'), t('رقم التتبع'), t('التاريخ')]}
            loading={shipmentsQuery.isLoading}
            rowCount={shipmentsQuery.data?.items?.length}
          >
            {(shipmentsQuery.data?.items || []).map((shipment) => (
              <tr key={shipment.id} className="hover:bg-slate-50/70">
                <td className="px-3.5 py-2.5">
                  <Link to={`/sales-orders/${shipment.soId}`} className="font-mono text-xs font-bold text-brand-800 hover:underline">
                    {shipment.so?.number}
                  </Link>
                </td>
                <td className="px-3.5 py-2.5 text-xs text-slate-700">{shipment.so?.customer?.name || t('عميل نقدي')}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-600">{shipment.carrier || '—'}</td>
                <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{shipment.tracking || '—'}</td>
                <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{dateTime(shipment.shippedAt, lang)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Modal
        open={Boolean(shipOrder)}
        onClose={() => setShipOrder(null)}
        title={t('شحن الأمر')}
        subtitle={shipOrder?.number}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShipOrder(null)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={() => shipMutation.mutate()} loading={shipMutation.isPending}>
              <Ship size={15} /> {t('تأكيد الشحن')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('شركة الشحن')}>
            <Input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="Bosta / Aramex" />
          </Field>
          <Field label={t('رقم التتبع')}>
            <Input value={tracking} onChange={(event) => setTracking(event.target.value)} dir="ltr" />
          </Field>
          <Field label={t('ملاحظات')}>
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <Badge tone="green">{t('سيتم خصم الكميات من منطقة الشحن')}</Badge>
        </div>
      </Modal>
    </div>
  )
}
