import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, PackageCheck, PackageSearch, ScanBarcode, Timer } from 'lucide-react'
import { Badge, Button, Card, PageHeader, Spinner, StatCard, StatusBadge } from '../components/ui'
import { api } from '../lib/api'
import { useWarehouse } from '../lib/warehouse'
import { useI18n } from '../lib/i18n'
import { qty, timeAgo } from '../lib/format'
import type { PickingOrder } from '../lib/types'

export default function Picking() {
  const { t, lang } = useI18n()
  const { warehouseId } = useWarehouse()
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['picking-queue', warehouseId],
    queryFn: () => api.get<PickingOrder[]>(`/api/picking/queue?warehouseId=${warehouseId}`),
    refetchInterval: 30_000,
  })

  const unitsRemaining = orders.reduce((sum, order) => sum + (order.unitsRemaining || 0), 0)
  const urgent = orders.filter((order) => ['HIGH', 'URGENT'].includes(order.priority)).length

  return (
    <div>
      <PageHeader
        title={t('التجهيز والشحن')}
        subtitle={t('قائمة مهام التجهيز المخصصة حسب الأولوية')}
        actions={
          <Link to="/shipping">
            <Button variant="secondary">
              <PackageCheck size={15} /> {t('قائمة الشحن')}
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('أوامر بانتظار التجهيز')} value={orders.length} icon={<PackageSearch size={18} />} />
        <StatCard label={t('وحدات متبقية')} value={qty(unitsRemaining)} icon={<ScanBarcode size={18} />} tone="amber" />
        <StatCard label={t('أوامر عاجلة')} value={urgent} icon={<Timer size={18} />} tone="rose" />
        <StatCard
          label={t('مهام مكتملة')}
          value={orders.filter((order) => (order.tasksRemaining || 0) === 0).length}
          icon={<PackageCheck size={18} />}
          tone="green"
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : orders.length === 0 ? (
        <Card className="mt-4 py-16 text-center">
          <PackageCheck size={34} className="mx-auto mb-2 text-emerald-400" />
          <p className="text-sm font-bold text-slate-600">{t('لا توجد أوامر بانتظار التجهيز')}</p>
          <p className="mt-1 text-xs text-slate-400">{t('كل المهام مكتملة — عمل رائع!')}</p>
        </Card>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const totalTasks = order.allocations?.length || 0
            const done = totalTasks - (order.tasksRemaining || 0)
            const percent = totalTasks ? Math.round((done / totalTasks) * 100) : 0
            return (
              <Card key={order.id} className="overflow-hidden">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-3.5">
                  <div>
                    <p className="font-mono text-sm font-extrabold text-brand-800">{order.number}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{order.customer?.name || t('عميل نقدي')}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={order.status} />
                    <StatusBadge status={order.priority} />
                  </div>
                </div>
                <div className="space-y-2.5 p-3.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">{t('المهام')}</span>
                    <span className="font-bold text-slate-700">
                      {done} / {totalTasks}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-brand-500 transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-slate-50 py-1.5">
                      <p className="text-[9px] text-slate-400">{t('سطور')}</p>
                      <p className="text-xs font-bold text-slate-700">{order.lines?.length || 0}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 py-1.5">
                      <p className="text-[9px] text-amber-600">{t('متبقي')}</p>
                      <p className="text-xs font-bold text-amber-700">{qty(order.unitsRemaining || 0)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 py-1.5">
                      <p className="text-[9px] text-slate-400">{t('منذ')}</p>
                      <p className="text-[10px] font-bold text-slate-600">{timeAgo(order.createdAt, lang)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(order.tasks || []).slice(0, 3).map((task) => (
                      <Badge key={task.id} tone="brand">
                        {task.location.code} · {qty(task.qty - task.pickedQty)}
                      </Badge>
                    ))}
                    {(order.tasks?.length || 0) > 3 ? <Badge tone="slate">+{(order.tasks?.length || 0) - 3}</Badge> : null}
                  </div>
                  <Link to={`/picking/${order.id}`} className="block">
                    <Button className="w-full" size="sm">
                      <ScanBarcode size={14} /> {t('بدء التجهيز')} <ArrowLeft size={13} />
                    </Button>
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
