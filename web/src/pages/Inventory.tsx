import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  Boxes,
  CalendarClock,
  Download,
  MinusCircle,
  PackageOpen,
  PlusCircle,
  RefreshCw,
  Wallet,
} from 'lucide-react'
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
  Pagination,
  SearchInput,
  Select,
  StatCard,
  Tabs,
  Textarea,
} from '../components/ui'
import { ScanInput } from '../components/ScanInput'
import { api, downloadFile, queryString } from '../lib/api'
import { useWarehouse } from '../lib/warehouse'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { dateTime, money, num, qty } from '../lib/format'
import type { Item, ListResponse, Location, StockMovement, StockRow } from '../lib/types'

type Summary = {
  skuCount: number
  unitCount: number
  reserved: number
  stockValue: number
  lowStockCount: number
  expiringCount: number
}

type LookupResult =
  | { type: 'item'; item: Item }
  | { type: 'location'; location: Location }
  | { type: 'serial'; serial: { serial: string; itemId: string } }

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

const emptyAdjust = {
  itemId: '',
  locationId: '',
  qty: '',
  lotCode: '',
  expiryDate: '',
  serials: '',
  reason: 'تسوية مخزون',
}

export default function Inventory() {
  const { t, lang } = useI18n()
  const { warehouseId } = useWarehouse()
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()

  const [tab, setTab] = useState('stock')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState('')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [expiring, setExpiring] = useState(false)
  const [lowStock, setLowStock] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [adjust, setAdjust] = useState(emptyAdjust)
  const [move, setMove] = useState({ itemId: '', fromLocationId: '', toLocationId: '', qty: '', lotCode: '', serial: '', note: '' })
  const [scan, setScan] = useState('')
  const [lookupMessage, setLookupMessage] = useState('')
  const [formError, setFormError] = useState('')

  const stockParams = {
    page,
    pageSize: 25,
    warehouseId,
    q: search,
    locationId,
    available: onlyAvailable ? 1 : '',
    expiringDays: expiring ? 30 : '',
    lowStock: lowStock ? 1 : '',
  }
  const stockQuery = useQuery({
    queryKey: ['inventory', stockParams],
    queryFn: () =>
      api.get<ListResponse<StockRow> & { totals: { quantity: number; reserved: number; value: number } }>(
        `/api/inventory${queryString(stockParams)}`,
      ),
  })
  const summaryQuery = useQuery({
    queryKey: ['inventory-summary', warehouseId],
    queryFn: () => api.get<Summary>(`/api/inventory/summary?warehouseId=${warehouseId}`),
  })
  const movementsQuery = useQuery({
    queryKey: ['movements', { warehouseId, search, page }],
    queryFn: () =>
      api.get<ListResponse<StockMovement>>(
        `/api/inventory/movements${queryString({ page, pageSize: 25, warehouseId, q: search })}`,
      ),
    enabled: tab === 'movements',
  })
  const itemsQuery = useQuery({
    queryKey: ['items-all'],
    queryFn: () => api.get<ListResponse<Item>>('/api/items?pageSize=200&active=all'),
  })
  const locationsQuery = useQuery({
    queryKey: ['locations-all', warehouseId],
    queryFn: () => api.get<Location[]>(`/api/locations?all=1&warehouseId=${warehouseId}`),
    enabled: Boolean(warehouseId),
  })
  const summary = summaryQuery.data
  const items = itemsQuery.data?.items || []
  const locations = locationsQuery.data || []
  const selectedItem = useMemo(() => items.find((item) => item.id === adjust.itemId), [items, adjust.itemId])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory'] })
    queryClient.invalidateQueries({ queryKey: ['inventory-summary'] })
    queryClient.invalidateQueries({ queryKey: ['movements'] })
    queryClient.invalidateQueries({ queryKey: ['items'] })
  }

  const adjustMutation = useMutation({
    mutationFn: () =>
      api.post('/api/inventory/adjust', {
        itemId: adjust.itemId,
        locationId: adjust.locationId,
        qty: Number(adjust.qty),
        lotCode: adjust.lotCode || null,
        expiryDate: adjust.expiryDate || null,
        serials: adjust.serials
          .split(/[\n,]/)
          .map((value) => value.trim())
          .filter(Boolean),
        reason: adjust.reason,
      }),
    onSuccess: () => {
      toast.push(t('تم تسجيل التسوية'))
      setAdjustOpen(false)
      setAdjust(emptyAdjust)
      setFormError('')
      invalidate()
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const moveMutation = useMutation({
    mutationFn: () =>
      api.post('/api/inventory/move', {
        itemId: move.itemId,
        fromLocationId: move.fromLocationId,
        toLocationId: move.toLocationId,
        qty: Number(move.qty),
        lotCode: move.lotCode || null,
        serial: move.serial || null,
        note: move.note || undefined,
      }),
    onSuccess: () => {
      toast.push(t('تم نقل المخزون'))
      setMoveOpen(false)
      setMove({ itemId: '', fromLocationId: '', toLocationId: '', qty: '', lotCode: '', serial: '', note: '' })
      setFormError('')
      invalidate()
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const onLookup = async (code: string) => {
    setLookupMessage('')
    try {
      const result = await api.get<LookupResult>(`/api/lookup/${encodeURIComponent(code)}`)
      if (result.type === 'item') {
        setSearch(result.item.sku)
        setLookupMessage(`${result.item.name} — ${qty(result.item.available ?? 0)} ${result.item.unit} ${t('متاح')}`)
        setAdjust((current) => ({ ...current, itemId: result.item.id }))
      } else if (result.type === 'location') {
        setLocationId(result.location.id)
        setLookupMessage(`${t('الموقع')} ${result.location.code}`)
      } else {
        setLookupMessage(`${t('السيريال')} ${result.serial.serial}`)
      }
      setScan('')
    } catch (error) {
      setLookupMessage((error as Error).message)
      setScan('')
    }
  }

  const openAdjust = (row?: StockRow) => {
    setFormError('')
    setAdjust({
      ...emptyAdjust,
      itemId: row?.itemId || (params.get('item') ?? ''),
      locationId: row?.locationId || '',
      lotCode: row?.lot?.code || '',
    })
    setAdjustOpen(true)
  }

  const openMove = (row?: StockRow) => {
    setFormError('')
    setMove({
      itemId: row?.itemId || '',
      fromLocationId: row?.locationId || '',
      toLocationId: '',
      qty: row ? String(row.quantity) : '',
      lotCode: row?.lot?.code || '',
      serial: row?.serial || '',
      note: '',
    })
    setMoveOpen(true)
  }

  return (
    <div>
      <PageHeader
        title={t('المخزون')}
        subtitle={t('أرصدة الأصناف حسب الموقع والدفعة')}
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadFile('/api/items/export.csv', 'storege-items.csv')}>
              <Download size={15} /> {t('تصدير')}
            </Button>
            <Button variant="secondary" onClick={() => { stockQuery.refetch(); summaryQuery.refetch() }}>
              <RefreshCw size={15} /> {t('تحديث')}
            </Button>
            {can('MANAGER', 'OPERATOR') ? (
              <>
                <Button variant="secondary" onClick={() => openMove()}>
                  <ArrowLeftRight size={15} /> {t('نقل')}
                </Button>
                <Button onClick={() => openAdjust()}>
                  <PlusCircle size={16} /> {t('تسوية مخزون')}
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('عدد الأصناف')} value={num(summary?.skuCount || 0)} icon={<Boxes size={18} />} />
        <StatCard label={t('إجمالي الوحدات')} value={qty(summary?.unitCount || 0)} icon={<PackageOpen size={18} />} tone="sky" />
        <StatCard label={t('المحجوز')} value={qty(summary?.reserved || 0)} icon={<MinusCircle size={18} />} tone="violet" />
        <StatCard
          label={t('قيمة المخزون')}
          value={money(summary?.stockValue || 0, lang)}
          hint={`${t('تحت الحد')} ${num(summary?.lowStockCount || 0)} · ${t('قرب الانتهاء')} ${num(summary?.expiringCount || 0)}`}
          icon={<Wallet size={18} />}
          tone="amber"
        />
      </div>

      <Card className="mt-4">
        <div className="space-y-3 border-b border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full max-w-md">
              <ScanInput
                value={scan}
                onChange={setScan}
                onScan={onLookup}
                placeholder={t('امسح باركود الصنف أو الموقع')}
              />
            </div>
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              placeholder={t('بحث بالاسم أو الكود')}
              className="w-full sm:w-64"
            />
            <Select
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value)
                setPage(1)
              }}
              className="w-auto min-w-40"
            >
              <option value="">{t('كل المواقع')}</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} — {location.warehouse?.name}
                </option>
              ))}
            </Select>
            <button
              onClick={() => setOnlyAvailable((value) => !value)}
              className={`h-[38px] rounded-xl border px-3 text-xs font-bold ${
                onlyAvailable ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {t('متاح فقط')}
            </button>
            <button
              onClick={() => setLowStock((value) => !value)}
              className={`h-[38px] rounded-xl border px-3 text-xs font-bold ${
                lowStock ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {t('تحت الحد')}
            </button>
            <button
              onClick={() => setExpiring((value) => !value)}
              className={`inline-flex h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${
                expiring ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              <CalendarClock size={14} /> {t('تنتهي خلال 30 يوم')}
            </button>
          </div>
          {lookupMessage ? <Alert tone={lookupMessage.includes('—') ? 'success' : 'info'}>{lookupMessage}</Alert> : null}
        </div>

        <div className="px-3 pt-1">
          <Tabs
            tabs={[
              { id: 'stock', label: t('الأرصدة'), count: stockQuery.data?.total },
              { id: 'movements', label: t('الحركات'), count: movementsQuery.data?.total },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        {tab === 'stock' ? (
          <>
            <DataTable
              headers={[
                t('الصنف'),
                t('الموقع'),
                t('الدفعة'),
                t('السيريال'),
                t('الكمية'),
                t('المحجوز'),
                t('المتاح'),
                t('القيمة'),
                t('الإجراءات'),
              ]}
              loading={stockQuery.isLoading}
              rowCount={stockQuery.data?.items?.length}
            >
              {(stockQuery.data?.items || []).map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-3.5 py-2.5">
                    <p className="text-xs font-bold text-slate-800">{row.item.name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{row.item.sku}</p>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <p className="text-xs font-bold text-slate-700">{row.location.code}</p>
                    <p className="text-[10px] text-slate-400">
                      {row.location.rack || row.location.column
                        ? `${t('رف')} ${row.location.rack || '—'} · ${t('عمود')} ${row.location.column || '—'}`
                        : row.location.warehouse?.name}
                    </p>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{row.lot?.code || '—'}</td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{row.serial || '—'}</td>
                  <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-800">{qty(row.quantity)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-500">{qty(row.reserved)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-emerald-700">{qty(row.available)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{money(row.value, lang)}</td>
                  <td className="px-3.5 py-2.5">
                    {can('MANAGER', 'OPERATOR') ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => openMove(row)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                        >
                          {t('نقل')}
                        </button>
                        <button
                          onClick={() => openAdjust(row)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                        >
                          {t('تسوية')}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
            <Pagination page={page} pageSize={25} total={stockQuery.data?.total || 0} onChange={setPage} />
          </>
        ) : (
          <>
            <DataTable
              headers={[t('النوع'), t('الصنف'), t('من'), t('إلى'), t('الكمية'), t('المستخدم'), t('التاريخ')]}
              loading={movementsQuery.isLoading}
              rowCount={movementsQuery.data?.items?.length}
            >
              {(movementsQuery.data?.items || []).map((movement) => (
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
                  <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{dateTime(movement.createdAt, lang)}</td>
                </tr>
              ))}
            </DataTable>
            <Pagination page={page} pageSize={25} total={movementsQuery.data?.total || 0} onChange={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title={t('تسوية مخزون')}
        subtitle={t('زيادة أو خصم كمية مع تسجيل السبب')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjustOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => adjustMutation.mutate()}
              loading={adjustMutation.isPending}
              disabled={!adjust.itemId || !adjust.locationId || !Number(adjust.qty)}
            >
              {t('تأكيد التسوية')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Alert tone="info">{t('استخدم كمية موجبة للزيادة وسالبة للخصم')}</Alert>
          <Field label={t('الصنف')} required>
            <Select value={adjust.itemId} onChange={(event) => setAdjust({ ...adjust, itemId: event.target.value })}>
              <option value="">{t('اختر الصنف')}</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} — {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('الموقع')} required>
              <Select
                value={adjust.locationId}
                onChange={(event) => setAdjust({ ...adjust, locationId: event.target.value })}
              >
                <option value="">{t('اختر الموقع')}</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} — {location.warehouse?.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('الكمية')} required hint="+10 / -3">
              <Input
                type="number"
                step="0.001"
                value={adjust.qty}
                onChange={(event) => setAdjust({ ...adjust, qty: event.target.value })}
              />
            </Field>
            <Field label={t('كود الدفعة')} hint={selectedItem?.trackLot ? t('مطلوب للدفعات') : t('اختياري')}>
              <Input
                value={adjust.lotCode}
                onChange={(event) => setAdjust({ ...adjust, lotCode: event.target.value })}
                dir="ltr"
              />
            </Field>
            <Field label={t('تاريخ الانتهاء')}>
              <Input
                type="date"
                value={adjust.expiryDate}
                onChange={(event) => setAdjust({ ...adjust, expiryDate: event.target.value })}
              />
            </Field>
          </div>
          {selectedItem?.trackSerial ? (
            <Field label={t('الأرقام التسلسلية')} hint={t('كل سيريال في سطر — العدد يجب أن يساوي الكمية')}>
              <Textarea
                rows={4}
                value={adjust.serials}
                onChange={(event) => setAdjust({ ...adjust, serials: event.target.value })}
                dir="ltr"
                className="font-mono text-xs"
              />
            </Field>
          ) : null}
          <Field label={t('السبب')} required>
            <Input value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title={t('نقل مخزون')}
        subtitle={t('نقل بين المواقع أو المخازن')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => moveMutation.mutate()}
              loading={moveMutation.isPending}
              disabled={!move.itemId || !move.fromLocationId || !move.toLocationId || !Number(move.qty)}
            >
              {t('تأكيد النقل')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Field label={t('الصنف')} required>
            <Select value={move.itemId} onChange={(event) => setMove({ ...move, itemId: event.target.value })}>
              <option value="">{t('اختر الصنف')}</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} — {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('من موقع')} required>
              <Select
                value={move.fromLocationId}
                onChange={(event) => setMove({ ...move, fromLocationId: event.target.value })}
              >
                <option value="">{t('اختر الموقع')}</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} — {location.warehouse?.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('إلى موقع')} required>
              <Select
                value={move.toLocationId}
                onChange={(event) => setMove({ ...move, toLocationId: event.target.value })}
              >
                <option value="">{t('اختر الموقع')}</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} — {location.warehouse?.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('الكمية')} required>
              <Input
                type="number"
                step="0.001"
                value={move.qty}
                onChange={(event) => setMove({ ...move, qty: event.target.value })}
              />
            </Field>
            <Field label={t('كود الدفعة')}>
              <Input value={move.lotCode} onChange={(event) => setMove({ ...move, lotCode: event.target.value })} dir="ltr" />
            </Field>
            <Field label={t('السيريال')} hint={t('اتركه فارغًا للأصناف غير المتسلسلة')}>
              <Input value={move.serial} onChange={(event) => setMove({ ...move, serial: event.target.value })} dir="ltr" />
            </Field>
            <Field label={t('ملاحظات')}>
              <Input value={move.note} onChange={(event) => setMove({ ...move, note: event.target.value })} />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
