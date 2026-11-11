import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, MapPin, Plus, Printer, ScanBarcode, Warehouse as WarehouseIcon } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Spinner,
} from '../components/ui'
import { Barcode } from '../components/Barcode'
import { api } from '../lib/api'
import { useWarehouse } from '../lib/warehouse'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { qty } from '../lib/format'
import type { Location, StockRow, Zone } from '../lib/types'

const TYPE_LABELS: Record<string, string> = {
  PICK: 'رف تجهيز',
  STAGING: 'منطقة تجهيز',
  DOCK: 'رصيف استلام',
  SHIPPING: 'منطقة شحن',
  QUARANTINE: 'حجر',
}

const emptyLocation = {
  code: '',
  name: '',
  rack: '',
  column: '',
  zoneId: '',
  type: 'PICK',
  barcode: '',
  capacity: '',
}

export default function Locations() {
  const { t } = useI18n()
  const { can } = useAuth()
  const { warehouseId } = useWarehouse()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [locationOpen, setLocationOpen] = useState(false)
  const [zoneOpen, setZoneOpen] = useState(false)
  const [form, setForm] = useState(emptyLocation)
  const [zoneForm, setZoneForm] = useState({ code: '', name: '' })
  const [formError, setFormError] = useState('')
  const [selected, setSelected] = useState<Location | null>(null)

  const locationsQuery = useQuery({
    queryKey: ['locations-page', warehouseId, search, type, zoneId],
    queryFn: () =>
      api.get<Location[]>(
        `/api/locations?all=1&warehouseId=${warehouseId}${search ? `&q=${encodeURIComponent(search)}` : ''}${
          type ? `&type=${type}` : ''
        }${zoneId ? `&zoneId=${zoneId}` : ''}`,
      ),
    enabled: Boolean(warehouseId),
  })
  const zonesQuery = useQuery({
    queryKey: ['zones', warehouseId],
    queryFn: () => api.get<Zone[]>(`/api/zones?warehouseId=${warehouseId}`),
    enabled: Boolean(warehouseId),
  })
  const detailQuery = useQuery({
    queryKey: ['location-detail', selected?.id],
    queryFn: () => api.get<Location & { stocks: StockRow[] }>(`/api/locations/${selected!.id}`),
    enabled: Boolean(selected?.id),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['locations'] })
    queryClient.invalidateQueries({ queryKey: ['locations-page'] })
    queryClient.invalidateQueries({ queryKey: ['zones'] })
  }

  const createLocation = useMutation({
    mutationFn: () =>
      api.post<Location>('/api/locations', {
        warehouseId,
        code: form.code,
        name: form.name || form.code,
        rack: form.rack || (/^R(\d+)-C(\d+)$/i.exec(form.code)?.[1] ? `R${/^R(\d+)-C(\d+)$/i.exec(form.code)![1]}` : null),
        column: form.column || (/^R(\d+)-C(\d+)$/i.exec(form.code)?.[2] ? `C${/^R(\d+)-C(\d+)$/i.exec(form.code)![2]}` : null),
        zoneId: form.zoneId || null,
        type: form.type,
        barcode: form.barcode || undefined,
        capacity: form.capacity ? Number(form.capacity) : null,
      }),
    onSuccess: () => {
      toast.push(t('تمت إضافة الموقع'))
      setLocationOpen(false)
      setForm(emptyLocation)
      setFormError('')
      invalidate()
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const createZone = useMutation({
    mutationFn: () => api.post<Zone>('/api/zones', { warehouseId, code: zoneForm.code, name: zoneForm.name }),
    onSuccess: () => {
      toast.push(t('تمت إضافة المنطقة'))
      setZoneOpen(false)
      setZoneForm({ code: '', name: '' })
      setFormError('')
      invalidate()
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const locations = locationsQuery.data || []
  const grouped = new Map<string, Location[]>()
  for (const location of locations) {
    const key = location.zone?.name || 'بدون منطقة'
    grouped.set(key, [...(grouped.get(key) || []), location])
  }

  return (
    <div>
      <PageHeader
        title={t('المواقع والرفوف')}
        subtitle={`${locations.length} ${t('موقع')} · ${zonesQuery.data?.length || 0} ${t('منطقة')}`}
        actions={
          can('MANAGER') ? (
            <>
              <Button variant="secondary" onClick={() => { setFormError(''); setZoneOpen(true) }}>
                <WarehouseIcon size={15} /> {t('منطقة جديدة')}
              </Button>
              <Button onClick={() => { setFormError(''); setLocationOpen(true) }}>
                <Plus size={16} /> {t('موقع جديد')}
              </Button>
            </>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={`${t('بحث')} — ${t('الكود أو الاسم أو الباركود')}`}
            className="w-full sm:w-80"
          />
          <Select value={zoneId} onChange={(event) => setZoneId(event.target.value)} className="w-auto min-w-40">
            <option value="">{t('كل المناطق')}</option>
            {(zonesQuery.data || []).map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.code} — {zone.name}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(event) => setType(event.target.value)} className="w-auto min-w-36">
            <option value="">{t('كل الأنواع')}</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </Select>
          <Link to="/labels?type=location" className="ms-auto">
            <Button variant="ghost" size="sm">
              <Printer size={14} /> {t('طباعة ليبلات المواقع')}
            </Button>
          </Link>
        </div>

        {locationsQuery.isLoading ? (
          <Spinner />
        ) : locations.length === 0 ? (
          <div className="py-14 text-center text-xs text-slate-400">{t('لا توجد بيانات')}</div>
        ) : (
          <div className="space-y-4 p-3">
            {[...grouped.entries()].map(([zoneName, rows]) => (
              <div key={zoneName}>
                <div className="mb-2 flex items-center gap-2">
                  <WarehouseIcon size={14} className="text-slate-400" />
                  <h3 className="text-xs font-bold text-slate-600">{zoneName}</h3>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                    {rows.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {rows.map((location) => (
                    <button
                      key={location.id}
                      onClick={() => setSelected(location)}
                      className="group rounded-xl border border-slate-200 bg-white p-3 text-start shadow-sm transition hover:border-brand-300 hover:shadow-card"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                          <MapPin size={15} />
                        </span>
                        <Badge tone={location.type === 'PICK' ? 'green' : location.type === 'DOCK' ? 'amber' : 'sky'}>
                          {t(TYPE_LABELS[location.type] || location.type)}
                        </Badge>
                      </div>
                      <p className="mt-2 font-mono text-sm font-extrabold text-slate-800">{location.code}</p>
                      <p className="truncate text-[11px] text-slate-400">{location.name || '—'}</p>
                      {location.rack || location.column ? (
                        <p className="mt-0.5 text-[10px] font-bold text-brand-700">
                          {t('رف')} {location.rack || '—'} · {t('عمود')} {location.column || '—'}
                        </p>
                      ) : null}
                      <p className="mt-1 font-mono text-[10px] text-slate-400" dir="ltr">
                        {location.barcode}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        title={t('موقع جديد')}
        subtitle={t('أضف رفًا أو منطقة داخل المخزن الحالي')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLocationOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={() => createLocation.mutate()} loading={createLocation.isPending} disabled={!form.code}>
              {t('حفظ')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">{formError}</div> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('الكود')} required>
              <Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="A-01-03" dir="ltr" />
            </Field>
            <Field label={t('الاسم')}>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label={t('الرف')} hint={t('مثال: R01')}>
              <Input value={form.rack} onChange={(event) => setForm({ ...form, rack: event.target.value })} placeholder="R01" dir="ltr" />
            </Field>
            <Field label={t('العمود')} hint={t('مثال: C01')}>
              <Input value={form.column} onChange={(event) => setForm({ ...form, column: event.target.value })} placeholder="C01" dir="ltr" />
            </Field>
            <Field label={t('المنطقة')}>
              <Select value={form.zoneId} onChange={(event) => setForm({ ...form, zoneId: event.target.value })}>
                <option value="">{t('بدون منطقة')}</option>
                {(zonesQuery.data || []).map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.code} — {zone.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('النوع')}>
              <Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('الباركود')} hint={t('اتركه فارغًا للتوليد التلقائي')}>
              <Input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} dir="ltr" />
            </Field>
            <Field label={t('السعة')}>
              <Input
                type="number"
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
              />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={zoneOpen}
        onClose={() => setZoneOpen(false)}
        title={t('منطقة جديدة')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setZoneOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={() => createZone.mutate()} loading={createZone.isPending} disabled={!zoneForm.code || !zoneForm.name}>
              {t('حفظ')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">{formError}</div> : null}
          <Field label={t('الكود')} required>
            <Input value={zoneForm.code} onChange={(event) => setZoneForm({ ...zoneForm, code: event.target.value })} placeholder="A" dir="ltr" />
          </Field>
          <Field label={t('الاسم')} required>
            <Input value={zoneForm.name} onChange={(event) => setZoneForm({ ...zoneForm, name: event.target.value })} placeholder="منطقة الرفوف A" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${t('الموقع')} ${selected.code}` : ''}
        subtitle={selected?.warehouse?.name}
        size="lg"
      >
        {detailQuery.isLoading ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-bold text-slate-500">{t('الباركود')}</p>
                <Barcode value={selected?.barcode || ''} height={46} className="mt-1 w-full" />
              </div>
              <div className="space-y-1 rounded-xl border border-slate-200 p-3 text-xs">
                <p className="flex justify-between">
                  <span className="text-slate-400">{t('النوع')}</span>
                  <b>{t(TYPE_LABELS[selected?.type || ''] || selected?.type || '')}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-400">{t('الرف / العمود')}</span>
                  <b dir="ltr">{selected?.rack || '—'} / {selected?.column || '—'}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-400">{t('المنطقة')}</span>
                  <b>{selected?.zone?.name || '—'}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-400">{t('الأصناف')}</span>
                  <b>{detailQuery.data?.stocks?.length || 0}</b>
                </p>
              </div>
            </div>

            <DataTable
              headers={[t('الصنف'), t('الدفعة'), t('الكمية'), t('المحجوز')]}
              rowCount={detailQuery.data?.stocks?.length}
              empty={(detailQuery.data?.stocks?.length || 0) === 0}
            >
              {(detailQuery.data?.stocks || []).map((stock) => (
                <tr key={stock.id}>
                  <td className="px-3 py-2">
                    <p className="text-xs font-bold text-slate-700">{stock.item.name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{stock.item.sku}</p>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{stock.lot?.code || '—'}</td>
                  <td className="px-3 py-2 text-xs font-bold tabular-nums text-slate-700">{qty(stock.quantity)}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{qty(stock.reserved)}</td>
                </tr>
              ))}
            </DataTable>

            <div className="flex justify-end">
              <Link to={`/inventory?location=${selected?.id}`}>
                <Button variant="secondary" size="sm">
                  <Boxes size={14} /> {t('عرض المخزون')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
