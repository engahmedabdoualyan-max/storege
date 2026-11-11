import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  CalendarClock,
  ClipboardList,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Truck,
  Wallet,
} from 'lucide-react'
import { PageHeader, StatCard, Card, CardHeader, StatusBadge, Button, DataTable, Badge } from '../components/ui'
import { api } from '../lib/api'
import { useWarehouse } from '../lib/warehouse'
import { useCompany } from '../lib/company'
import { useI18n } from '../lib/i18n'
import { date, money, num, qty, timeAgo } from '../lib/format'
import type { DashboardData } from '../lib/types'

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

export default function Dashboard() {
  const { warehouseId } = useWarehouse()
  const { logoUrl, name, nameEn } = useCompany()
  const { t, lang } = useI18n()
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dashboard', warehouseId],
    queryFn: () => api.get<DashboardData>(`/api/dashboard?warehouseId=${warehouseId}`),
    enabled: Boolean(warehouseId),
  })

  const kpis = data?.kpis
  const series = (data?.series || []).map((point) => ({
    ...point,
    label: new Intl.DateTimeFormat('ar-EG', { day: '2-digit', month: '2-digit' }).format(new Date(point.date)),
  }))
  const categories = data?.byCategory || []

  return (
    <div>
      <PageHeader
        title={t('لوحة التحكم')}
        subtitle={t('نظرة سريعة على حركة المخزن اليوم')}
        actions={
          <>
            <Link to="/m">
              <Button variant="secondary">
                <PackageSearch size={16} /> {t('وضع الكف')}
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
              <RefreshCw size={15} /> {t('تحديث')}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        {logoUrl ? (
          <img src={logoUrl} alt={name} className="h-14 w-14 rounded-xl border border-slate-100 bg-white object-contain" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-950 text-xl font-black text-accent-400">
            {name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-slate-900">{name}</p>
          <p className="truncate text-[11px] text-slate-500">{nameEn}</p>
        </div>
        <Link to="/totals">
          <Button variant="secondary" size="sm">
            <Boxes size={14} /> {t('إجمالي البضائع')}
          </Button>
        </Link>
        <Link to="/reconciliation">
          <Button variant="secondary" size="sm">
            <ArrowLeftRight size={14} /> {t('مطابقة المشتريات')}
          </Button>
        </Link>
      </div>

      {(kpis?.strategicCount || 0) > 0 ? (
        <Link
          to="/totals"
          className="mb-4 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-rose-800 transition hover:bg-rose-50"
        >
          <ShieldAlert size={18} className="shrink-0" />
          <p className="flex-1 text-xs font-bold">
            {t('تحذير: أصناف وصلت للحد الاستراتيجي')} — {num(kpis?.strategicCount || 0)} {t('صنف')}
          </p>
          <span className="text-[11px] font-extrabold underline">{t('عرض التفاصيل')}</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('قيمة المخزون')}
          value={money(kpis?.stockValue || 0, lang)}
          hint={`${num(kpis?.skuCount || 0)} ${t('صنف')}`}
          icon={<Wallet size={18} />}
          tone="brand"
        />
        <StatCard
          label={t('الوحدات المتاحة')}
          value={qty(kpis?.available || 0)}
          hint={`${t('محجوز')} ${qty(kpis?.reserved || 0)}`}
          icon={<Boxes size={18} />}
          tone="sky"
        />
        <StatCard
          label={t('أوامر بيع مفتوحة')}
          value={num(kpis?.openSalesOrders || 0)}
          hint={`${t('قيد التجهيز')} ${num(kpis?.pickingQueue || 0)}`}
          icon={<ClipboardList size={18} />}
          tone="violet"
        />
        <StatCard
          label={t('أصناف أقل من الحد')}
          value={num(kpis?.lowStockCount || 0)}
          hint={`${t('قرب الانتهاء')} ${num(kpis?.expiringCount || 0)}`}
          icon={<AlertTriangle size={18} />}
          tone="amber"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('أوامر شراء مفتوحة')}
          value={num(kpis?.openPurchaseOrders || 0)}
          icon={<Truck size={17} />}
          tone="brand"
        />
        <StatCard
          label={t('جاهز للشحن')}
          value={num(kpis?.readyToShip || 0)}
          icon={<PackageCheck size={17} />}
          tone="green"
        />
        <StatCard
          label={t('حركات اليوم')}
          value={num((kpis?.receivedToday || 0) + (kpis?.pickedToday || 0) + (kpis?.shippedToday || 0))}
          hint={`${t('استلام')} ${num(kpis?.receivedToday || 0)} · ${t('شحن')} ${num(kpis?.shippedToday || 0)}`}
          icon={<ArrowLeftRight size={17} />}
          tone="sky"
        />
        <StatCard
          label={t('تنتهي خلال 45 يوم')}
          value={num(kpis?.expiringCount || 0)}
          icon={<CalendarClock size={17} />}
          tone="rose"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={t('الحركة خلال 14 يومًا')}
            subtitle={t('الوارد والصادر بالوحدات')}
            actions={
              <div className="flex items-center gap-3 text-[11px] font-bold">
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t('وارد')}
                </span>
                <span className="flex items-center gap-1.5 text-rose-500">
                  <span className="h-2 w-2 rounded-full bg-rose-400" /> {t('صادر')}
                </span>
              </div>
            }
          />
          <div className="h-[280px] px-2 pb-3 pt-4">
            {series.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="inColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="outColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, direction: 'rtl' }}
                    labelStyle={{ fontWeight: 700 }}
                  />
                  <Area type="monotone" dataKey="in" name={t('وارد')} stroke="#10b981" strokeWidth={2} fill="url(#inColor)" />
                  <Area type="monotone" dataKey="out" name={t('صادر')} stroke="#f43f5e" strokeWidth={2} fill="url(#outColor)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">{t('جاري التحميل...')}</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('توزيع القيمة')} subtitle={t('حسب التصنيف')} />
          <div className="h-[210px] pt-3">
            {categories.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {categories.map((entry, index) => (
                      <Cell key={index} fill={entry.color || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => money(Number(value), lang)}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, direction: 'rtl' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : null}
          </div>
          <div className="space-y-1.5 px-3 pb-3">
            {categories.slice(0, 5).map((category) => (
              <div key={category.name} className="flex items-center gap-2 text-[11px]">
                <span className="h-2 w-2 rounded-full" style={{ background: category.color }} />
                <span className="flex-1 truncate text-slate-600">{category.name}</span>
                <span className="font-bold text-slate-700">{money(category.value, lang)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={t('أصناف تحت حد الطلب')}
            subtitle={t('تحتاج إعادة طلب قريبًا')}
            actions={
              <Link to="/reports" className="text-[11px] font-bold text-brand-700 hover:underline">
                {t('عرض الكل')}
              </Link>
            }
          />
          <div className="divide-y divide-slate-100">
            {(data?.lowStock || []).length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">{t('لا توجد بيانات')}</p>
            ) : (
              data?.lowStock.map((item) => {
                const ratio = Math.min(100, Math.round((item.onHand / (item.threshold || item.minStock || 1)) * 100))
                return (
                  <Link
                    key={item.id}
                    to={`/items/${item.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-xs font-bold text-slate-700">
                        {item.name}
                        {item.strategic ? <Badge tone="rose">{t('استراتيجي')}</Badge> : null}
                      </p>
                      <p className="font-mono text-[10px] text-slate-400">{item.sku}</p>
                    </div>
                    <div className="w-24">
                      <div className="mb-1 flex justify-between text-[10px] text-slate-400">
                        <span>{qty(item.onHand)}</span>
                        <span>{qty(item.threshold || item.minStock)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={ratio < 60 ? 'h-full rounded-full bg-rose-400' : 'h-full rounded-full bg-amber-400'}
                          style={{ width: `${Math.max(4, ratio)}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t('دفعات قرب الانتهاء')}
            subtitle={t('تتبع تواريخ الصلاحية')}
            actions={
              <Link to="/reports" className="text-[11px] font-bold text-brand-700 hover:underline">
                {t('عرض الكل')}
              </Link>
            }
          />
          <div className="divide-y divide-slate-100">
            {(data?.expiring || []).length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">{t('لا توجد بيانات')}</p>
            ) : (
              data?.expiring.map((lot) => {
                const daysLeft = lot.expiryDate
                  ? Math.ceil((new Date(lot.expiryDate).getTime() - Date.now()) / 86400000)
                  : null
                return (
                  <div key={lot.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        daysLeft !== null && daysLeft < 0
                          ? 'bg-rose-50 text-rose-600'
                          : daysLeft !== null && daysLeft < 30
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <CalendarClock size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-700">{lot.item.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {lot.code} · {lot.location || '—'}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="text-[11px] font-bold text-slate-700">{qty(lot.qty)}</p>
                      <p
                        className={`text-[10px] ${
                          daysLeft !== null && daysLeft < 0 ? 'font-bold text-rose-600' : 'text-slate-400'
                        }`}
                      >
                        {lot.expiryDate ? date(lot.expiryDate, lang) : '—'}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={t('آخر الحركات')} subtitle={t('أحدث عمليات المخزون')} />
        <DataTable
          headers={[t('النوع'), t('الصنف'), t('من'), t('إلى'), t('الكمية'), t('المستخدم'), t('الوقت')]}
          loading={isLoading}
          rowCount={data?.recent?.length}
        >
          {(data?.recent || []).map((movement) => (
            <tr key={movement.id} className="hover:bg-slate-50/70">
              <td className="px-3.5 py-2.5">
                <Badge tone={movement.type === 'RECEIVE' ? 'green' : movement.type === 'SHIP' ? 'rose' : 'slate'}>
                  {t(MOVEMENT_LABELS[movement.type] || movement.type)}
                </Badge>
              </td>
              <td className="px-3.5 py-2.5">
                <p className="text-xs font-bold text-slate-700">{movement.item?.name}</p>
                <p className="font-mono text-[10px] text-slate-400">{movement.item?.sku}</p>
              </td>
              <td className="px-3.5 py-2.5 text-xs text-slate-500">{movement.fromLocation?.code || '—'}</td>
              <td className="px-3.5 py-2.5 text-xs text-slate-500">{movement.toLocation?.code || '—'}</td>
              <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(movement.qty)}</td>
              <td className="px-3.5 py-2.5 text-xs text-slate-500">{movement.userName || '—'}</td>
              <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{timeAgo(movement.createdAt, lang)}</td>
            </tr>
          ))}
        </DataTable>
      </Card>

      {isLoading ? (
        <div className="mt-3 flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
          <RefreshCw size={13} className="animate-spin" /> {t('جاري التحميل...')}
        </div>
      ) : null}
    </div>
  )
}
