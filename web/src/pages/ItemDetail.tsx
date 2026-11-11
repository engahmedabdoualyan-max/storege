import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Boxes,
  CalendarClock,
  Layers,
  MapPin,
  PackageSearch,
  Printer,
  ScanLine,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  KeyValue,
  PageHeader,
  Spinner,
  StatCard,
  Tabs,
} from '../components/ui'
import { Barcode, QrCode } from '../components/Barcode'
import { api } from '../lib/api'
import { date, money, qty, timeAgo } from '../lib/format'
import { useI18n } from '../lib/i18n'
import type { Item, Lot, SerialRow, StockMovement, StockRow } from '../lib/types'

type ItemDetailData = Item & {
  stocks: StockRow[]
  lots: Lot[]
  serials: SerialRow[]
  movements: StockMovement[]
  onHand: number
  reserved: number
  available: number
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

export default function ItemDetail() {
  const { id = '' } = useParams()
  const { t, lang } = useI18n()
  const [tab, setTab] = useState('stock')
  const { data: item, isLoading } = useQuery({
    queryKey: ['item', id],
    queryFn: () => api.get<ItemDetailData>(`/api/items/${id}`),
    enabled: Boolean(id),
  })

  if (isLoading) return <Spinner label={t('جاري التحميل...')} />
  if (!item) return <p className="text-sm text-slate-500">{t('الصنف غير موجود')}</p>

  const tabs = [
    { id: 'stock', label: t('المخزون'), count: item.stocks?.length },
    { id: 'lots', label: t('الدفعات'), count: item.lots?.length },
    { id: 'serials', label: t('الأرقام التسلسلية'), count: item.serials?.length },
    { id: 'movements', label: t('الحركات'), count: item.movements?.length },
  ]

  return (
    <div>
      <Link to="/items" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700">
        <ArrowRight size={14} /> {t('الأصناف')}
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {item.name}
            {!item.active ? <Badge tone="rose">{t('غير نشط')}</Badge> : null}
          </span>
        }
        subtitle={
          <span className="font-mono" dir="ltr">
            {item.sku} · {item.barcode || '—'}
          </span>
        }
        actions={
          <>
            <Link to={`/labels?item=${item.id}`}>
              <Button variant="secondary">
                <Printer size={15} /> {t('طباعة ليبل')}
              </Button>
            </Link>
            <Link to={`/inventory?item=${item.id}`}>
              <Button>
                <Boxes size={16} /> {t('إدارة المخزون')}
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('الرصيد')} value={qty(item.onHand)} hint={item.unit} icon={<Boxes size={18} />} />
        <StatCard label={t('المحجوز')} value={qty(item.reserved)} icon={<Layers size={18} />} tone="violet" />
        <StatCard label={t('المتاح')} value={qty(item.available)} icon={<ScanLine size={18} />} tone="green" />
        <StatCard
          label={t('قيمة المخزون')}
          value={money((item.onHand || 0) * item.cost, lang)}
          hint={`${t('التكلفة')} ${money(item.cost, lang)}`}
          icon={<Wallet size={18} />}
          tone="amber"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <Tabs tabs={tabs} active={tab} onChange={setTab} className="px-2 pt-1" />
            {tab === 'stock' ? (
              <DataTable
                headers={[t('الموقع'), t('المخزن'), t('الدفعة'), t('السيريال'), t('الكمية'), t('المحجوز')]}
                rowCount={item.stocks?.length}
                empty={(item.stocks?.length || 0) === 0}
              >
                {(item.stocks || []).map((stock) => (
                  <tr key={stock.id}>
                    <td className="px-3.5 py-2.5">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <MapPin size={13} className="text-slate-400" /> {stock.location.code}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-slate-500">{stock.location.warehouse?.name}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{stock.lot?.code || '—'}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{stock.serial || '—'}</td>
                    <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-800">{qty(stock.quantity)}</td>
                    <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-500">{qty(stock.reserved)}</td>
                  </tr>
                ))}
              </DataTable>
            ) : null}
            {tab === 'lots' ? (
              <DataTable
                headers={[t('الدفعة'), t('تاريخ الانتهاء'), t('الحالة')]}
                rowCount={item.lots?.length}
                empty={(item.lots?.length || 0) === 0}
              >
                {(item.lots || []).map((lot) => {
                  const days = lot.expiryDate
                    ? Math.ceil((new Date(lot.expiryDate).getTime() - Date.now()) / 86400000)
                    : null
                  return (
                    <tr key={lot.id}>
                      <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-slate-700">{lot.code}</td>
                      <td className="px-3.5 py-2.5 text-xs text-slate-500">
                        {lot.expiryDate ? date(lot.expiryDate, lang) : '—'}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {days === null ? (
                          <Badge tone="slate">—</Badge>
                        ) : days < 0 ? (
                          <Badge tone="rose">{t('منتهي')}</Badge>
                        ) : days <= 30 ? (
                          <Badge tone="amber">{t('قريب')}</Badge>
                        ) : (
                          <Badge tone="green">{t('سليم')}</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </DataTable>
            ) : null}
            {tab === 'serials' ? (
              <DataTable
                headers={[t('السيريال'), t('الدفعة'), t('الحالة'), t('التاريخ')]}
                rowCount={item.serials?.length}
                empty={(item.serials?.length || 0) === 0}
              >
                {(item.serials || []).map((serial) => (
                  <tr key={serial.id}>
                    <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-slate-700">{serial.serial}</td>
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{serial.lot?.code || '—'}</td>
                    <td className="px-3.5 py-2.5">
                      <Badge tone={serial.status === 'IN_STOCK' ? 'green' : serial.status === 'SHIPPED' ? 'slate' : 'sky'}>
                        {serial.status}
                      </Badge>
                    </td>
                    <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{date(serial.createdAt, lang)}</td>
                  </tr>
                ))}
              </DataTable>
            ) : null}
            {tab === 'movements' ? (
              <DataTable
                headers={[t('النوع'), t('من'), t('إلى'), t('الكمية'), t('المستخدم'), t('الوقت')]}
                rowCount={item.movements?.length}
                empty={(item.movements?.length || 0) === 0}
              >
                {(item.movements || []).map((movement) => (
                  <tr key={movement.id}>
                    <td className="px-3.5 py-2.5">
                      <Badge tone={movement.type === 'RECEIVE' ? 'green' : movement.type === 'SHIP' ? 'rose' : 'slate'}>
                        {t(MOVEMENT_LABELS[movement.type] || movement.type)}
                      </Badge>
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-slate-500">{movement.fromLocation?.code || '—'}</td>
                    <td className="px-3.5 py-2.5 text-xs text-slate-500">{movement.toLocation?.code || '—'}</td>
                    <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(movement.qty)}</td>
                    <td className="px-3.5 py-2.5 text-xs text-slate-500">{movement.userName || '—'}</td>
                    <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{timeAgo(movement.createdAt, lang)}</td>
                  </tr>
                ))}
              </DataTable>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('بطاقة الصنف')} subtitle={t('باركود ورموز للطباعة')} />
            <div className="flex flex-col items-center gap-3 p-4">
              {item.barcode ? (
                <div className="w-full rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <Barcode value={item.barcode} height={48} />
                </div>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-white p-2">
                <QrCode value={item.barcode || item.sku} size={96} />
              </div>
              <p className="font-mono text-[11px] text-slate-400" dir="ltr">
                {item.barcode || item.sku}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('بيانات الصنف')} />
            <div className="space-y-1 px-4 py-3">
              <KeyValue label={t('الوحدة')} value={item.unit} />
              <KeyValue label={t('التصنيف')} value={item.category?.name || '—'} />
              <KeyValue label={t('الماركة')} value={item.brand || '—'} />
              <KeyValue label={t('التكلفة')} value={money(item.cost, lang)} />
              <KeyValue label={t('سعر البيع')} value={money(item.price, lang)} />
              <KeyValue label={t('حد الطلب')} value={qty(item.minStock)} />
              <KeyValue
                label={t('التتبع')}
                value={
                  <span className="flex gap-1">
                    {item.trackLot ? <Badge tone="violet">{t('دفعات')}</Badge> : null}
                    {item.trackSerial ? <Badge tone="sky">{t('سيريال')}</Badge> : null}
                    {!item.trackLot && !item.trackSerial ? '—' : null}
                  </span>
                }
              />
              <KeyValue label={t('الحالة')} value={item.active ? t('نشط') : t('غير نشط')} />
            </div>
          </Card>

          {item.description ? (
            <Card>
              <CardHeader title={t('الوصف')} />
              <p className="px-4 py-3 text-xs leading-6 text-slate-500">{item.description}</p>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t('مؤشرات')} />
            <div className="space-y-2 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <TrendingUp size={14} className="text-emerald-500" />
                {t('قيمة المخزون')}: <b className="text-slate-800">{money((item.onHand || 0) * item.cost, lang)}</b>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <PackageSearch size={14} className="text-brand-500" />
                {t('عدد المواقع')}: <b className="text-slate-800">{item.stocks?.length || 0}</b>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <CalendarClock size={14} className="text-amber-500" />
                {t('عدد الدفعات')}: <b className="text-slate-800">{item.lots?.length || 0}</b>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
