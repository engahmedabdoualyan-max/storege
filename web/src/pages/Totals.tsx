import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  ChartPie,
  Layers,
  MapPin,
  PackageSearch,
  RefreshCw,
  ShieldAlert,
  Warehouse as WarehouseIcon,
  Wallet,
} from 'lucide-react'
import { Card, CardHeader, DataTable, Badge, Button, PageHeader, StatCard, EmptyState } from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { money, num, qty } from '../lib/format'
import type { TotalsData } from '../lib/types'

const SEVERITY: Record<string, { tone: 'rose' | 'amber' | 'sky' | 'green'; label: string }> = {
  critical: { tone: 'rose', label: 'حرج' },
  warning: { tone: 'amber', label: 'تحذير' },
  watch: { tone: 'sky', label: 'مراقبة' },
  ok: { tone: 'green', label: 'سليم' },
}

export default function Totals() {
  const { t, lang } = useI18n()
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['inventory-totals'],
    queryFn: () => api.get<TotalsData>('/api/inventory/totals'),
  })

  const overall = data?.overall
  const maxWarehouseValue = Math.max(1, ...(data?.byWarehouse || []).map((row) => row.value))

  return (
    <div>
      <PageHeader
        title={t('إجمالي البضائع')}
        subtitle={t('كل الكميات والقيم في المخزون مجمّعة حسب المخزن والتصنيف')}
        actions={
          <>
            <Link to="/inventory">
              <Button variant="secondary">
                <Boxes size={16} /> {t('تفاصيل المخزون')}
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw size={15} /> {t('تحديث')}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('إجمالي الوحدات')}
          value={qty(overall?.unitCount || 0)}
          hint={t('كل الأصناف في كل المواقع')}
          icon={<Layers size={18} />}
          tone="brand"
        />
        <StatCard
          label={t('عدد الأصناف')}
          value={num(overall?.skuCount || 0)}
          hint={`${t('من')} ${num(overall?.activeItems || 0)} ${t('صنف نشط')}`}
          icon={<PackageSearch size={18} />}
          tone="sky"
        />
        <StatCard
          label={t('قيمة المخزون')}
          value={money(overall?.stockValue || 0, lang)}
          hint={`${t('بالريال السعودي')}`}
          icon={<Wallet size={18} />}
          tone="green"
        />
        <StatCard
          label={t('المتاح للبيع')}
          value={qty(overall?.available || 0)}
          hint={`${t('محجوز')} ${qty(overall?.reserved || 0)}`}
          icon={<ArrowLeftRight size={18} />}
          tone="violet"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('المخازن')} value={num(overall?.warehouses || 0)} icon={<WarehouseIcon size={17} />} tone="brand" />
        <StatCard label={t('المواقع والرفوف')} value={num(overall?.locations || 0)} icon={<MapPin size={17} />} tone="sky" />
        <StatCard label={t('التحذيرات الاستراتيجية')} value={num(overall?.strategicAlerts || 0)} icon={<ShieldAlert size={17} />} tone="rose" />
        <StatCard label={t('التصنيفات')} value={num(data?.byCategory.length || 0)} icon={<ChartPie size={17} />} tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('التوزيع حسب المخزن')} subtitle={t('الوحدات والقيمة لكل مخزن')} />
          <div className="space-y-3 p-4">
            {(data?.byWarehouse || []).length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">{t('لا توجد بيانات')}</p>
            ) : (
              data?.byWarehouse.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-700">{row.label}</p>
                    <span className="text-xs font-extrabold text-slate-800">{money(row.value, lang)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${Math.max(3, Math.round((row.value / maxWarehouseValue) * 100))}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
                    <span>{t('الوحدات')}: <b className="text-slate-700">{qty(row.units)}</b></span>
                    <span>{t('الأصناف')}: <b className="text-slate-700">{num(row.skuCount)}</b></span>
                    <span>{t('محجوز')}: <b className="text-slate-700">{qty(row.reserved)}</b></span>
                    <span>{t('متاح')}: <b className="text-slate-700">{qty(row.available)}</b></span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('التوزيع حسب التصنيف')} subtitle={t('أين تتركز قيمة المخزون')} />
          <DataTable headers={[t('التصنيف'), t('الأصناف'), t('الوحدات'), t('القيمة')]} loading={isLoading} rowCount={data?.byCategory.length}>
            {(data?.byCategory || []).map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/70">
                <td className="px-3.5 py-2.5">
                  <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color || '#94a3b8' }} />
                    {row.label}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{num(row.skuCount)}</td>
                <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(row.units)}</td>
                <td className="px-3.5 py-2.5 text-xs font-extrabold tabular-nums text-slate-800">{money(row.value, lang)}</td>
              </tr>
            ))}
          </DataTable>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title={t('تنبيهات المخزون الاستراتيجي')}
          subtitle={t('أصناف وصلت إلى حد المخزون الاستراتيجي أو أقل')}
          actions={
            <Link to="/reports?tab=low" className="text-[11px] font-bold text-brand-700 hover:underline">
              {t('تقرير النواقص')}
            </Link>
          }
        />
        {(data?.strategic || []).length === 0 ? (
          <EmptyState title={t('لا توجد تحذيرات')} description={t('كل الأصناف الاستراتيجية فوق الحد المطلوب')} />
        ) : (
          <DataTable headers={[t('الصنف'), t('الموقع'), t('المتاح'), t('الحد الاستراتيجي'), t('النقص'), t('الحالة')]} rowCount={data?.strategic.length}>
            {(data?.strategic || []).map((row) => {
              const sev = SEVERITY[row.severity] || SEVERITY.warning
              return (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-3.5 py-2.5">
                    <Link to={`/items/${row.id}`} className="text-xs font-bold text-slate-700 hover:text-brand-700">
                      {row.name}
                    </Link>
                    <p className="font-mono text-[10px] text-slate-400">{row.sku}</p>
                  </td>
                  <td className="px-3.5 py-2.5 text-xs text-slate-500">{row.unit}</td>
                  <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(row.onHand)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{qty(row.threshold)}</td>
                  <td className="px-3.5 py-2.5 text-xs font-extrabold tabular-nums text-rose-600">{qty(row.shortage)}</td>
                  <td className="px-3.5 py-2.5">
                    <Badge tone={sev.tone}>
                      <AlertTriangle size={10} className="me-1" /> {t(sev.label)}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </DataTable>
        )}
      </Card>
    </div>
  )
}
