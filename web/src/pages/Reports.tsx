import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BarChart3,
  Boxes,
  CalendarClock,
  Download,
  PackageX,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Tabs,
} from '../components/ui'
import { api, queryString } from '../lib/api'
import { useWarehouse } from '../lib/warehouse'
import { useI18n } from '../lib/i18n'
import { date, money, num, qty } from '../lib/format'

type ValuationRow = { label: string; qty: number; value: number; skuCount: number }
type LowRow = {
  id: string
  sku: string
  name: string
  category: string
  unit: string
  onHand: number
  minStock: number
  reorderQty: number
  shortage: number
  value: number
}
type ExpiryRow = {
  id: string
  code: string
  item: string
  sku: string
  expiryDate: string | null
  daysLeft: number | null
  qty: number
  value: number
  locations: string
  status: string
}
type MovementData = {
  byType: { type: string; count: number; qty: number }[]
  series: { date: string; in: number; out: number }[]
  total: number
}
type DeadRow = {
  id: string
  sku: string
  name: string
  qty: number
  value: number
  locations: string
  lastMovement: string | null
  daysIdle: number | null
}
type ProductivityRow = {
  user: string
  received: number
  picked: number
  shipped: number
  adjusted: number
  counts: number
  operations: number
}
type TopRow = { itemId: string; sku: string; name: string; qty: number; operations: number }
type AbcRow = {
  rank: number
  sku: string
  name: string
  qty: number
  value: number
  cumulativePct: number
  class: string
}
type AccuracyRow = {
  id: string
  number: string
  warehouse: string
  lines: number
  expected: number
  variance: number
  accuracy: number
  completedAt: string
}

const MOVEMENT_LABELS: Record<string, string> = {
  RECEIVE: 'استلام',
  PUTAWAY: 'تخزين',
  PICK: 'تجهيز',
  PACK: 'تعبئة',
  SHIP: 'شحن',
  ADJUST: 'تسوية',
  COUNT: 'جرد',
  TRANSFER_OUT: 'تحويل صادر',
  TRANSFER_IN: 'تحويل وارد',
  RETURN: 'مرتجع',
}

function csvDownload(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const content = '\uFEFF' + [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv; charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function Reports() {
  const { t, lang } = useI18n()
  const { warehouseId } = useWarehouse()

  const [tab, setTab] = useState('valuation')
  const [groupBy, setGroupBy] = useState('category')
  const [expiryDays, setExpiryDays] = useState('30')
  const [deadDays, setDeadDays] = useState('30')
  const [topDays, setTopDays] = useState('30')
  const [accuracyDays, setAccuracyDays] = useState('90')
  const [from, setFrom] = useState(isoDaysAgo(30))
  const [to, setTo] = useState(today())

  const valuationQuery = useQuery({
    queryKey: ['report-valuation', { warehouseId, groupBy }],
    queryFn: () =>
      api.get<{ rows: ValuationRow[]; totals: { value: number; qty: number } }>(
        `/api/reports/stock-valuation${queryString({ warehouseId, groupBy })}`,
      ),
    enabled: tab === 'valuation',
  })

  const lowQuery = useQuery({
    queryKey: ['report-low', warehouseId],
    queryFn: () =>
      api.get<{ rows: LowRow[]; totals: { count: number; shortage: number; reorderValue: number } }>(
        `/api/reports/low-stock${queryString({ warehouseId })}`,
      ),
    enabled: tab === 'low',
  })

  const expiryQuery = useQuery({
    queryKey: ['report-expiry', { warehouseId, expiryDays }],
    queryFn: () =>
      api.get<{ rows: ExpiryRow[]; totals: { lots: number; qty: number; value: number; expired: number } }>(
        `/api/reports/expiry${queryString({ warehouseId, days: expiryDays })}`,
      ),
    enabled: tab === 'expiry',
  })

  const movementQuery = useQuery({
    queryKey: ['report-movement', { warehouseId, from, to }],
    queryFn: () =>
      api.get<MovementData>(`/api/reports/movement${queryString({ warehouseId, from, to })}`),
    enabled: tab === 'movement',
  })

  const deadQuery = useQuery({
    queryKey: ['report-dead', { warehouseId, deadDays }],
    queryFn: () =>
      api.get<{ rows: DeadRow[]; totals: { items: number; qty: number; value: number } }>(
        `/api/reports/dead-stock${queryString({ warehouseId, days: deadDays })}`,
      ),
    enabled: tab === 'dead',
  })

  const productivityQuery = useQuery({
    queryKey: ['report-productivity', { from, to }],
    queryFn: () => api.get<{ rows: ProductivityRow[] }>(`/api/reports/productivity${queryString({ from, to })}`),
    enabled: tab === 'productivity',
  })

  const topQuery = useQuery({
    queryKey: ['report-top', { warehouseId, topDays }],
    queryFn: () =>
      api.get<TopRow[]>(`/api/reports/top-items${queryString({ warehouseId, days: topDays, limit: 15 })}`),
    enabled: tab === 'top',
  })

  const abcQuery = useQuery({
    queryKey: ['report-abc', warehouseId],
    queryFn: () =>
      api.get<{ rows: AbcRow[]; total: number }>(`/api/reports/abc${queryString({ warehouseId })}`),
    enabled: tab === 'abc',
  })

  const accuracyQuery = useQuery({
    queryKey: ['report-accuracy', accuracyDays],
    queryFn: () =>
      api.get<{ rows: AccuracyRow[]; averageAccuracy: number }>(
        `/api/reports/count-accuracy${queryString({ days: accuracyDays })}`,
      ),
    enabled: tab === 'accuracy',
  })

  const movementSeries = useMemo(
    () =>
      (movementQuery.data?.series || []).map((point) => ({
        ...point,
        label: new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : lang === 'en' ? 'en-GB' : lang, {
          day: '2-digit',
          month: '2-digit',
        }).format(new Date(point.date)),
      })),
    [movementQuery.data, lang],
  )

  const refresh = () => {
    const queries: Record<string, { refetch: () => unknown }> = {
      valuation: valuationQuery,
      low: lowQuery,
      expiry: expiryQuery,
      movement: movementQuery,
      dead: deadQuery,
      productivity: productivityQuery,
      top: topQuery,
      abc: abcQuery,
      accuracy: accuracyQuery,
    }
    queries[tab]?.refetch()
  }

  const exportCurrent = () => {
    if (tab === 'valuation') {
      const data = valuationQuery.data
      csvDownload(
        'stock-valuation.csv',
        [t('المجموعة'), t('الكمية'), t('القيمة'), t('عدد الأصناف')],
        (data?.rows || []).map((row) => [row.label, row.qty, row.value, row.skuCount]),
      )
    } else if (tab === 'low') {
      const data = lowQuery.data
      csvDownload(
        'low-stock.csv',
        ['SKU', t('الاسم'), t('التصنيف'), t('الرصيد'), t('الحد الأدنى'), t('النقص')],
        (data?.rows || []).map((row) => [row.sku, row.name, row.category, row.onHand, row.minStock, row.shortage]),
      )
    } else if (tab === 'expiry') {
      const data = expiryQuery.data
      csvDownload(
        'expiry.csv',
        [t('الدفعة'), t('الصنف'), 'SKU', t('الصلاحية'), t('المتبقي'), t('الكمية'), t('القيمة')],
        (data?.rows || []).map((row) => [row.code, row.item, row.sku, row.expiryDate, row.daysLeft, row.qty, row.value]),
      )
    } else if (tab === 'dead') {
      const data = deadQuery.data
      csvDownload(
        'dead-stock.csv',
        ['SKU', t('الاسم'), t('الكمية'), t('القيمة'), t('أيام بدون حركة')],
        (data?.rows || []).map((row) => [row.sku, row.name, row.qty, row.value, row.daysIdle]),
      )
    } else if (tab === 'productivity') {
      const data = productivityQuery.data
      csvDownload(
        'productivity.csv',
        [t('المستخدم'), t('استلام'), t('تجهيز'), t('شحن'), t('العمليات')],
        (data?.rows || []).map((row) => [row.user, row.received, row.picked, row.shipped, row.operations]),
      )
    } else if (tab === 'top') {
      csvDownload(
        'top-items.csv',
        ['SKU', t('الاسم'), t('الكمية'), t('العمليات')],
        (topQuery.data || []).map((row) => [row.sku, row.name, row.qty, row.operations]),
      )
    } else if (tab === 'abc') {
      const data = abcQuery.data
      csvDownload(
        'abc.csv',
        [t('الترتيب'), 'SKU', t('الاسم'), t('الكمية'), t('القيمة'), 'Cumulative %', 'Class'],
        (data?.rows || []).map((row) => [row.rank, row.sku, row.name, row.qty, row.value, row.cumulativePct, row.class]),
      )
    } else if (tab === 'accuracy') {
      const data = accuracyQuery.data
      csvDownload(
        'count-accuracy.csv',
        [t('رقم المستند'), t('المخزن'), t('الأسطر'), t('الفرق'), t('دقة الجرد')],
        (data?.rows || []).map((row) => [row.number, row.warehouse, row.lines, row.variance, row.accuracy]),
      )
    }
  }

  const loading =
    valuationQuery.isLoading ||
    lowQuery.isLoading ||
    expiryQuery.isLoading ||
    movementQuery.isLoading ||
    deadQuery.isLoading ||
    productivityQuery.isLoading ||
    topQuery.isLoading ||
    abcQuery.isLoading ||
    accuracyQuery.isLoading

  return (
    <div>
      <PageHeader
        title={t('التقارير')}
        subtitle={t('تحليلات المخزون والحركة والإنتاجية لدعم القرار')}
        actions={
          <>
            <Button variant="secondary" onClick={exportCurrent}>
              <Download size={15} /> {t('تصدير التقرير')}
            </Button>
            <Button variant="secondary" onClick={refresh} loading={loading}>
              <RefreshCw size={15} /> {t('تحديث')}
            </Button>
          </>
        }
      />

      <Card>
        <div className="overflow-x-auto border-b border-slate-100 px-2">
          <Tabs
            tabs={[
              { id: 'valuation', label: t('قيمة المخزون') },
              { id: 'low', label: t('تحت الحد الأدنى') },
              { id: 'expiry', label: t('قرب الانتهاء') },
              { id: 'movement', label: t('حركة المخزون') },
              { id: 'dead', label: t('الأصناف الراكدة') },
              { id: 'productivity', label: t('إنتاجية الفريق') },
              { id: 'top', label: t('الأصناف الأكثر حركة') },
              { id: 'abc', label: t('تحليل ABC') },
              { id: 'accuracy', label: t('دقة الجرد') },
            ]}
            active={tab}
            onChange={setTab}
            className="border-b-0"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          {tab === 'valuation' ? (
            <Select value={groupBy} onChange={(event) => setGroupBy(event.target.value)} className="w-auto min-w-40">
              <option value="category">{t('مجموعة حسب')}: {t('التصنيف')}</option>
              <option value="warehouse">{t('مجموعة حسب')}: {t('المخزن')}</option>
              <option value="location">{t('مجموعة حسب')}: {t('الموقع')}</option>
            </Select>
          ) : null}
          {tab === 'expiry' ? (
            <Select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)} className="w-auto min-w-40">
              <option value="30">{t('تنتهي خلال 30 يوم')}</option>
              <option value="60">60 {t('يوم')}</option>
              <option value="90">90 {t('يوم')}</option>
              <option value="180">180 {t('يوم')}</option>
            </Select>
          ) : null}
          {tab === 'dead' ? (
            <Select value={deadDays} onChange={(event) => setDeadDays(event.target.value)} className="w-auto min-w-40">
              <option value="30">30 {t('يوم')}</option>
              <option value="60">60 {t('يوم')}</option>
              <option value="90">90 {t('يوم')}</option>
              <option value="180">180 {t('يوم')}</option>
            </Select>
          ) : null}
          {tab === 'top' ? (
            <Select value={topDays} onChange={(event) => setTopDays(event.target.value)} className="w-auto min-w-40">
              <option value="7">{t('آخر 7 أيام')}</option>
              <option value="30">{t('آخر 30 يومًا')}</option>
              <option value="90">{t('آخر 90 يومًا')}</option>
            </Select>
          ) : null}
          {tab === 'accuracy' ? (
            <Select value={accuracyDays} onChange={(event) => setAccuracyDays(event.target.value)} className="w-auto min-w-40">
              <option value="30">{t('آخر 30 يومًا')}</option>
              <option value="90">{t('آخر 90 يومًا')}</option>
              <option value="365">{t('سنة')}</option>
            </Select>
          ) : null}
          {['movement', 'productivity'].includes(tab) ? (
            <>
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-auto" />
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-auto" />
            </>
          ) : null}
          <span className="ms-auto text-[11px] text-slate-400">
            {tab === 'accuracy' ? `${t('متوسط الدقة')}: ${num(accuracyQuery.data?.averageAccuracy || 0, 2)}%` : null}
          </span>
        </div>

        {tab === 'valuation' ? (
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label={t('قيمة المخزون')}
                value={money(valuationQuery.data?.totals.value || 0, lang)}
                icon={<Wallet size={18} />}
              />
              <StatCard label={t('إجمالي الوحدات')} value={qty(valuationQuery.data?.totals.qty || 0)} icon={<Boxes size={18} />} tone="sky" />
              <StatCard label={t('المجموعات')} value={valuationQuery.data?.rows.length || 0} icon={<BarChart3 size={18} />} tone="violet" />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
              <Card>
                <CardHeader title={t('قيمة المخزون')} subtitle={t('توزيع القيمة على المجموعات')} />
                <DataTable
                  headers={[t('المجموعة'), t('عدد الأصناف'), t('الكمية'), t('القيمة'), t('النسبة')]}
                  loading={valuationQuery.isLoading}
                  rowCount={valuationQuery.data?.rows.length}
                >
                  {(valuationQuery.data?.rows || []).map((row) => {
                    const total = valuationQuery.data?.totals.value || 1
                    return (
                      <tr key={row.label} className="hover:bg-slate-50/70">
                        <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{row.label}</td>
                        <td className="px-3.5 py-2.5 text-xs text-slate-500">{row.skuCount}</td>
                        <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{qty(row.qty)}</td>
                        <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-800">{money(row.value, lang)}</td>
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full bg-brand-600" style={{ width: `${Math.min(100, (row.value / total) * 100)}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400">{num((row.value / total) * 100, 1)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </DataTable>
              </Card>

              <Card>
                <CardHeader title={t('توزيع قيمة المخزون')} />
                <div className="h-[320px] p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={valuationQuery.data?.rows || []}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={55}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        {(valuationQuery.data?.rows || []).map((_, index) => (
                          <Cell
                            key={index}
                            fill={['#1d3356', '#285497', '#386bb3', '#5d8bcc', '#93b4e0', '#ffb420', '#f99307'][index % 7]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => money(value, lang)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>
        ) : null}

        {tab === 'low' ? (
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label={t('أصناف تحت الحد الأدنى')} value={lowQuery.data?.totals.count || 0} icon={<PackageX size={18} />} tone="rose" />
              <StatCard label={t('النقص')} value={qty(lowQuery.data?.totals.shortage || 0)} icon={<TrendingUp size={18} />} tone="amber" />
              <StatCard label={t('قيمة إعادة الطلب')} value={money(lowQuery.data?.totals.reorderValue || 0, lang)} icon={<Wallet size={18} />} />
            </div>
            <Card className="mt-4">
              <CardHeader title={t('أصناف تحت الحد الأدنى')} subtitle={t('تحتاج إعادة طلب')} />
              <DataTable
                headers={[t('الصنف'), t('التصنيف'), t('الرصيد'), t('الحد الأدنى'), t('النقص'), t('حد الطلب'), t('القيمة')]}
                loading={lowQuery.isLoading}
                rowCount={lowQuery.data?.rows.length}
              >
                {(lowQuery.data?.rows || []).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5">
                      <p className="text-xs font-bold text-slate-800">{row.name}</p>
                      <p className="font-mono text-[10px] text-slate-400">{row.sku}</p>
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-slate-500">{row.category || '—'}</td>
                    <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(row.onHand)}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-500">{qty(row.minStock)}</td>
                    <td className="px-3.5 py-2.5"><Badge tone="rose">{qty(row.shortage)}</Badge></td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{qty(row.reorderQty)}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{money(row.value, lang)}</td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          </div>
        ) : null}

        {tab === 'expiry' ? (
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label={t('الدفعات')} value={expiryQuery.data?.totals.lots || 0} icon={<CalendarClock size={18} />} />
              <StatCard label={t('منتهية')} value={expiryQuery.data?.totals.expired || 0} icon={<CalendarClock size={18} />} tone="rose" />
              <StatCard label={t('الكمية')} value={qty(expiryQuery.data?.totals.qty || 0)} icon={<Boxes size={18} />} tone="amber" />
              <StatCard label={t('القيمة')} value={money(expiryQuery.data?.totals.value || 0, lang)} icon={<Wallet size={18} />} tone="violet" />
            </div>
            <Card className="mt-4">
              <CardHeader title={t('دفعات قرب الانتهاء')} subtitle={`${t('خلال')} ${expiryDays} ${t('يوم')}`} />
              <DataTable
                headers={[t('الدفعة'), t('الصنف'), t('الصلاحية'), t('المتبقي'), t('الكمية'), t('المواقع'), t('القيمة'), t('الحالة')]}
                loading={expiryQuery.isLoading}
                rowCount={expiryQuery.data?.rows.length}
              >
                {(expiryQuery.data?.rows || []).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5 font-mono text-[11px] font-bold text-slate-700">{row.code}</td>
                    <td className="px-3.5 py-2.5">
                      <p className="text-xs font-bold text-slate-700">{row.item}</p>
                      <p className="font-mono text-[10px] text-slate-400">{row.sku}</p>
                    </td>
                    <td className="px-3.5 py-2.5 text-[11px] text-slate-500">{date(row.expiryDate, lang)}</td>
                    <td className="px-3.5 py-2.5">
                      <Badge tone={row.daysLeft !== null && row.daysLeft < 0 ? 'rose' : row.daysLeft !== null && row.daysLeft <= 30 ? 'amber' : 'slate'}>
                        {row.daysLeft === null ? '—' : row.daysLeft < 0 ? `${Math.abs(row.daysLeft)} ${t('منتهية')}` : `${row.daysLeft} ${t('يوم')}`}
                      </Badge>
                    </td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-700">{qty(row.qty)}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[10px] text-slate-400">{row.locations || '—'}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{money(row.value, lang)}</td>
                    <td className="px-3.5 py-2.5">
                      <Badge tone={row.status === 'expired' ? 'rose' : row.status === 'critical' ? 'amber' : 'slate'}>
                        {row.status === 'expired' ? t('منتهية') : row.status === 'critical' ? t('حرجة') : t('قرب الانتهاء')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          </div>
        ) : null}

        {tab === 'movement' ? (
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label={t('إجمالي الحركات')} value={movementQuery.data?.total || 0} icon={<BarChart3 size={18} />} />
              <StatCard
                label={t('واردة')}
                value={qty((movementQuery.data?.series || []).reduce((sum, point) => sum + point.in, 0))}
                icon={<TrendingUp size={18} />}
                tone="green"
              />
              <StatCard
                label={t('صادرة')}
                value={qty((movementQuery.data?.series || []).reduce((sum, point) => sum + point.out, 0))}
                icon={<TrendingUp size={18} />}
                tone="rose"
              />
            </div>
            <Card className="mt-4">
              <CardHeader title={t('حركة المخزون اليومية')} subtitle={`${from} → ${to}`} />
              <div className="h-[340px] p-3">
                {movementQuery.isLoading ? (
                  <Spinner />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={movementSeries}>
                      <defs>
                        <linearGradient id="inGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="outGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="in" name={t('وارد')} stroke="#10b981" fill="url(#inGradient)" strokeWidth={2} />
                      <Area type="monotone" dataKey="out" name={t('صادر')} stroke="#f43f5e" fill="url(#outGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
            <Card className="mt-4">
              <CardHeader title={t('الحركات حسب النوع')} />
              <DataTable headers={[t('النوع'), t('العمليات'), t('الكمية')]} loading={movementQuery.isLoading} rowCount={movementQuery.data?.byType.length}>
                {(movementQuery.data?.byType || []).map((row) => (
                  <tr key={row.type} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5"><Badge tone="brand">{t(MOVEMENT_LABELS[row.type] || row.type)}</Badge></td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{num(row.count)}</td>
                    <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(row.qty)}</td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          </div>
        ) : null}

        {tab === 'dead' ? (
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label={t('أصناف راكدة')} value={deadQuery.data?.totals.items || 0} icon={<PackageX size={18} />} tone="rose" />
              <StatCard label={t('الكمية')} value={qty(deadQuery.data?.totals.qty || 0)} icon={<Boxes size={18} />} tone="amber" />
              <StatCard label={t('القيمة')} value={money(deadQuery.data?.totals.value || 0, lang)} icon={<Wallet size={18} />} />
            </div>
            <Card className="mt-4">
              <CardHeader title={t('الأصناف الراكدة')} subtitle={`${t('أيام بدون حركة')}: ${deadDays}+`} />
              <DataTable
                headers={[t('الصنف'), t('الكمية'), t('القيمة'), t('المواقع'), t('آخر حركة'), t('أيام بدون حركة')]}
                loading={deadQuery.isLoading}
                rowCount={deadQuery.data?.rows.length}
              >
                {(deadQuery.data?.rows || []).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5">
                      <p className="text-xs font-bold text-slate-800">{row.name}</p>
                      <p className="font-mono text-[10px] text-slate-400">{row.sku}</p>
                    </td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-700">{qty(row.qty)}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{money(row.value, lang)}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[10px] text-slate-400">{row.locations || '—'}</td>
                    <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{row.lastMovement ? date(row.lastMovement, lang) : '—'}</td>
                    <td className="px-3.5 py-2.5"><Badge tone={(row.daysIdle || 0) > 90 ? 'rose' : 'amber'}>{row.daysIdle ?? '—'}</Badge></td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          </div>
        ) : null}

        {tab === 'productivity' ? (
          <div className="p-4">
            <Card>
              <CardHeader title={t('إنتاجية الفريق')} subtitle={`${from} → ${to}`} />
              <DataTable
                headers={[t('المستخدم'), t('استلام'), t('تجهيز'), t('شحن'), t('تسوية'), t('جرد'), t('العمليات')]}
                loading={productivityQuery.isLoading}
                rowCount={productivityQuery.data?.rows.length}
              >
                {(productivityQuery.data?.rows || []).map((row) => (
                  <tr key={row.user} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Users size={13} className="text-brand-500" /> {row.user}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-emerald-700">{qty(row.received)}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-amber-700">{qty(row.picked)}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-sky-700">{qty(row.shipped)}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-violet-700">{qty(row.adjusted)}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-500">{qty(row.counts)}</td>
                    <td className="px-3.5 py-2.5"><Badge tone="brand">{num(row.operations)}</Badge></td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          </div>
        ) : null}

        {tab === 'top' ? (
          <div className="p-4">
            <Card>
              <CardHeader title={t('الأصناف الأكثر حركة')} subtitle={`${t('آخر')} ${topDays} ${t('يوم')}`} />
              <div className="h-[300px] p-3">
                {topQuery.isLoading ? (
                  <Spinner />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topQuery.data || []} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis type="category" dataKey="sku" width={95} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                      <Bar dataKey="qty" name={t('الكمية')} fill="#285497" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <DataTable headers={[t('الصنف'), 'SKU', t('الكمية'), t('العمليات')]} loading={topQuery.isLoading} rowCount={topQuery.data?.length}>
                {(topQuery.data || []).map((row) => (
                  <tr key={row.itemId} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5 text-xs font-bold text-slate-800">{row.name}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[10px] text-slate-400">{row.sku}</td>
                    <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(row.qty)}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-500">{num(row.operations)}</td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          </div>
        ) : null}

        {tab === 'abc' ? (
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label={t('إجمالي القيمة')} value={money(abcQuery.data?.total || 0, lang)} icon={<Wallet size={18} />} />
              <StatCard label="A" value={(abcQuery.data?.rows || []).filter((row) => row.class === 'A').length} icon={<Boxes size={18} />} tone="green" />
              <StatCard
                label="B / C"
                value={`${(abcQuery.data?.rows || []).filter((row) => row.class === 'B').length} / ${(abcQuery.data?.rows || []).filter((row) => row.class === 'C').length}`}
                icon={<Boxes size={18} />}
                tone="amber"
              />
            </div>
            <Card className="mt-4">
              <CardHeader title={t('تحليل ABC')} subtitle={t('حسب قيمة المخزون التراكمية')} />
              <DataTable
                headers={[t('الترتيب'), t('الصنف'), t('الكمية'), t('القيمة'), 'Cumulative %', 'Class']}
                loading={abcQuery.isLoading}
                rowCount={abcQuery.data?.rows.length}
              >
                {(abcQuery.data?.rows || []).map((row) => (
                  <tr key={row.sku} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{row.rank}</td>
                    <td className="px-3.5 py-2.5">
                      <p className="text-xs font-bold text-slate-800">{row.name}</p>
                      <p className="font-mono text-[10px] text-slate-400">{row.sku}</p>
                    </td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{qty(row.qty)}</td>
                    <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-800">{money(row.value, lang)}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-500">{row.cumulativePct}%</td>
                    <td className="px-3.5 py-2.5">
                      <Badge tone={row.class === 'A' ? 'green' : row.class === 'B' ? 'amber' : 'slate'}>{row.class}</Badge>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          </div>
        ) : null}

        {tab === 'accuracy' ? (
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label={t('متوسط الدقة')}
                value={`${num(accuracyQuery.data?.averageAccuracy || 0, 2)}%`}
                icon={<BarChart3 size={18} />}
                tone="green"
              />
              <StatCard label={t('عمليات الجرد')} value={accuracyQuery.data?.rows.length || 0} icon={<Boxes size={18} />} />
              <StatCard
                label={t('الفرق')}
                value={qty((accuracyQuery.data?.rows || []).reduce((sum, row) => sum + row.variance, 0))}
                icon={<PackageX size={18} />}
                tone="rose"
              />
            </div>
            <Card className="mt-4">
              <CardHeader title={t('دقة الجرد')} subtitle={t('آخر عمليات الجرد المكتملة')} />
              <DataTable
                headers={[t('رقم المستند'), t('المخزن'), t('الأسطر'), t('الكمية المتوقعة'), t('الفرق'), t('دقة الجرد'), t('التاريخ')]}
                loading={accuracyQuery.isLoading}
                rowCount={accuracyQuery.data?.rows.length}
              >
                {(accuracyQuery.data?.rows || []).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-brand-800">{row.number}</td>
                    <td className="px-3.5 py-2.5 text-xs text-slate-600">{row.warehouse}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-500">{row.lines}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{qty(row.expected)}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-rose-600">{qty(row.variance)}</td>
                    <td className="px-3.5 py-2.5">
                      <Badge tone={row.accuracy >= 98 ? 'green' : row.accuracy >= 90 ? 'amber' : 'rose'}>
                        {num(row.accuracy, 2)}%
                      </Badge>
                    </td>
                    <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{date(row.completedAt, lang)}</td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
