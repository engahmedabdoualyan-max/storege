import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  PackageMinus,
  RefreshCw,
  Scale,
  Search,
  Wallet,
} from 'lucide-react'
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, Field, Input, PageHeader, StatCard } from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { date, money, num, qty } from '../lib/format'
import type { ReconciliationData } from '../lib/types'

const STATUS: Record<string, { tone: 'green' | 'amber' | 'rose' | 'sky' | 'slate'; label: string }> = {
  MATCHED: { tone: 'green', label: 'مطابق' },
  SHORT_RECEIVED: { tone: 'rose', label: 'ناقص استلام' },
  OVER_RECEIVED: { tone: 'sky', label: 'زيادة استلام' },
  NOT_IN_STOCK: { tone: 'amber', label: 'غير موجود بالمخزون' },
  NO_INVOICE: { tone: 'slate', label: 'بدون فاتورة' },
}

export default function Reconciliation() {
  const { t, lang } = useI18n()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const query = useQuery({
    queryKey: ['purchase-reconciliation', from, to],
    queryFn: () => {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const qs = params.toString()
      return api.get<ReconciliationData>(`/api/reports/purchase-reconciliation${qs ? `?${qs}` : ''}`)
    },
  })

  const totals = query.data?.totals
  const rows = (query.data?.rows || []).filter((row) => {
    if (status && row.status !== status) return false
    if (!search) return true
    const term = search.trim().toLowerCase()
    return row.name.toLowerCase().includes(term) || row.sku.toLowerCase().includes(term)
  })

  return (
    <div>
      <PageHeader
        title={t('مطابقة فواتير الشراء بالمخزون')}
        subtitle={t('مقارنة الكميات المفوترة بما تم استلامه فعليًا وما هو متاح في المخزون')}
        actions={
          <Button variant="secondary" onClick={() => query.refetch()} loading={query.isFetching}>
            <RefreshCw size={15} /> {t('تحديث')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('قيمة المشتريات')}
          value={money(totals?.invoicedValue || 0, lang)}
          hint={`${num(totals?.items || 0)} ${t('صنف')}`}
          icon={<Wallet size={18} />}
          tone="brand"
        />
        <StatCard
          label={t('كمية مفوترة')}
          value={qty(totals?.invoicedQty || 0)}
          hint={`${t('مستلم')} ${qty(totals?.receivedQty || 0)}`}
          icon={<Scale size={18} />}
          tone="sky"
        />
        <StatCard
          label={t('نواقص الاستلام')}
          value={num(totals?.shortReceived || 0)}
          hint={`${t('غير موجود بالمخزون')} ${num(totals?.notInStock || 0)}`}
          icon={<PackageMinus size={18} />}
          tone="rose"
        />
        <StatCard
          label={t('أصناف مطابقة')}
          value={num(totals?.matched || 0)}
          hint={`${t('بدون فاتورة')} ${num(totals?.noInvoice || 0)}`}
          icon={<CheckCircle2 size={18} />}
          tone="green"
        />
      </div>

      <Card className="mt-4">
        <CardHeader title={t('فلاتر المطابقة')} subtitle={t('حدد الفترة أو ابحث عن صنف')} />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('من تاريخ')}>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} dir="ltr" />
          </Field>
          <Field label={t('إلى تاريخ')}>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} dir="ltr" />
          </Field>
          <Field label={t('بحث')}>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('اسم الصنف أو الكود')} className="ps-9" />
            </div>
          </Field>
          <Field label={t('الحالة')}>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
            >
              <option value="">{t('كل الحالات')}</option>
              {Object.entries(STATUS).map(([key, value]) => (
                <option key={key} value={key}>{t(value.label)}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title={t('مطابقة الأصناف')}
          subtitle={`${num(rows.length)} ${t('صنف')}`}
          actions={
            <Badge tone={totals?.shortReceived ? 'rose' : 'green'}>
              {totals?.shortReceived ? <AlertTriangle size={11} className="me-1" /> : <CheckCircle2 size={11} className="me-1" />}
              {totals?.shortReceived ? `${num(totals.shortReceived)} ${t('نقص')}` : t('لا توجد فروقات')}
            </Badge>
          }
        />
        {rows.length === 0 && !query.isLoading ? (
          <EmptyState title={t('لا توجد بيانات')} description={t('لا توجد فواتير شراء ضمن الفترة المحددة')} />
        ) : (
          <DataTable
            headers={[
              t('الصنف'),
              t('مفوتر'),
              t('مستلم'),
              t('الفرق'),
              t('بالمخزن'),
              t('محجوز'),
              t('مباع'),
              t('الفواتير'),
              t('الحالة'),
            ]}
            loading={query.isLoading}
            rowCount={rows.length}
          >
            {rows.map((row) => {
              const meta = STATUS[row.status] || STATUS.MATCHED
              return (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-3.5 py-2.5">
                    <p className="text-xs font-bold text-slate-700">{row.name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{row.sku} · {row.category}</p>
                  </td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{qty(row.invoicedQty)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{qty(row.receivedQty)}</td>
                  <td className={`px-3.5 py-2.5 text-xs font-bold tabular-nums ${row.variance < 0 ? 'text-rose-600' : row.variance > 0 ? 'text-sky-600' : 'text-slate-400'}`}>
                    {row.variance > 0 ? '+' : ''}{qty(row.variance)}
                  </td>
                  <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(row.onHandQty)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-500">{qty(row.reservedQty)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-500">{qty(row.soldQty)}</td>
                  <td className="px-3.5 py-2.5 text-[11px] text-slate-500">
                    {num(row.invoices)}
                    {row.suppliers ? <p className="max-w-[180px] truncate text-[10px] text-slate-400">{row.suppliers}</p> : null}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Badge tone={meta.tone}>{t(meta.label)}</Badge>
                  </td>
                </tr>
              )
            })}
          </DataTable>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title={t('فواتير الشراء')} subtitle={`${num(query.data?.invoices.length || 0)} ${t('فاتورة')}`} />
        <DataTable headers={[t('رقم الفاتورة'), t('المورد'), t('التاريخ'), t('الأصناف'), t('الإجمالي'), t('الحالة')]} rowCount={query.data?.invoices.length}>
          {(query.data?.invoices || []).map((invoice) => (
            <tr key={invoice.id} className="hover:bg-slate-50/70">
              <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-slate-700">{invoice.number}</td>
              <td className="px-3.5 py-2.5 text-xs text-slate-600">{invoice.partnerName}</td>
              <td className="px-3.5 py-2.5 text-xs text-slate-500">{date(invoice.date, lang)}</td>
              <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{num(invoice.lines)}</td>
              <td className="px-3.5 py-2.5 text-xs font-extrabold tabular-nums text-slate-800">{money(invoice.total, lang)}</td>
              <td className="px-3.5 py-2.5"><Badge tone={invoice.status === 'PAID' ? 'green' : 'amber'}>{invoice.status}</Badge></td>
            </tr>
          ))}
        </DataTable>
      </Card>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-[11px] leading-relaxed text-sky-800">
        <FileWarning size={15} className="mt-0.5 shrink-0" />
        <p>
          {t('المطابقة تقارن كميات الفواتير المسجلة بكميات الاستلام الفعلي والرصيد الحالي. أي فرق سالب يعني أن جزءًا من الفاتورة لم يُستلم، والفرق الموجب يعني استلامًا زائدًا عن الفاتورة.')}
        </p>
      </div>
    </div>
  )
}
