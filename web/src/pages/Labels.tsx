import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckSquare, Printer, ScanBarcode, Square, Tag } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  Tabs,
} from '../components/ui'
import { Barcode, QrCode } from '../components/Barcode'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { money } from '../lib/format'
import type { Item, ListResponse, Location } from '../lib/types'

type Kind = 'items' | 'locations'

type LabelSettings = {
  labelWidth: number
  labelHeight: number
  symbology: string
  showName: boolean
  showSku: boolean
  showPrice: boolean
}

const defaultLabelSettings: LabelSettings = {
  labelWidth: 50,
  labelHeight: 25,
  symbology: 'CODE128',
  showName: true,
  showSku: true,
  showPrice: false,
}

export default function Labels() {
  const { t, lang } = useI18n()
  const toast = useToast()

  const [kind, setKind] = useState<Kind>('items')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [copies, setCopies] = useState('1')
  const [settings, setSettings] = useState<LabelSettings>(defaultLabelSettings)

  const itemsQuery = useQuery({
    queryKey: ['labels-items'],
    queryFn: () => api.get<ListResponse<Item>>('/api/items?pageSize=200&active=1'),
  })
  const locationsQuery = useQuery({
    queryKey: ['labels-locations'],
    queryFn: () => api.get<Location[]>('/api/locations?all=1'),
  })
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, string>>('/api/settings'),
  })

  useEffect(() => {
    if (!settingsQuery.data) return
    const data = settingsQuery.data
    setSettings({
      labelWidth: Number(data.labelWidth) || 50,
      labelHeight: Number(data.labelHeight) || 25,
      symbology: data.labelSymbology || 'CODE128',
      showName: data.labelShowName !== 'false',
      showSku: data.labelShowSku !== 'false',
      showPrice: data.labelShowPrice === 'true',
    })
  }, [settingsQuery.data])

  useEffect(() => {
    const cleanup = () => document.body.classList.remove('printing-labels')
    window.addEventListener('afterprint', cleanup)
    return () => window.removeEventListener('afterprint', cleanup)
  }, [])

  const items = useMemo(() => {
    const list = itemsQuery.data?.items || []
    if (!search.trim()) return list
    const term = search.trim().toLowerCase()
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term) ||
        (item.barcode || '').toLowerCase().includes(term),
    )
  }, [itemsQuery.data, search])

  const locations = useMemo(() => {
    const list = locationsQuery.data || []
    if (!search.trim()) return list
    const term = search.trim().toLowerCase()
    return list.filter(
      (location) =>
        location.code.toLowerCase().includes(term) ||
        location.barcode.toLowerCase().includes(term) ||
        (location.name || '').toLowerCase().includes(term),
    )
  }, [locationsQuery.data, search])

  const currentIds = kind === 'items' ? items.map((item) => item.id) : locations.map((location) => location.id)
  const selectedCount = currentIds.filter((id) => selected[id]).length

  const toggle = (id: string) => setSelected((current) => ({ ...current, [id]: !current[id] }))

  const selectAll = () => {
    if (selectedCount === currentIds.length) {
      setSelected((current) => {
        const next = { ...current }
        for (const id of currentIds) delete next[id]
        return next
      })
    } else {
      setSelected((current) => {
        const next = { ...current }
        for (const id of currentIds) next[id] = true
        return next
      })
    }
  }

  const selectedItems = items.filter((item) => selected[item.id])
  const selectedLocations = locations.filter((location) => selected[location.id])
  const repeat = Math.max(1, Math.min(50, Number(copies) || 1))

  const previewLabels = useMemo(() => {
    const labels: { id: string; title: string; subtitle: string; code: string; price?: number; kind: Kind }[] = []
    const source: typeof selectedItems | typeof selectedLocations =
      kind === 'items' ? selectedItems : selectedLocations
    for (const entry of source) {
      for (let index = 0; index < repeat; index++) {
        if (kind === 'items') {
          const item = entry as Item
          labels.push({
            id: `${item.id}-${index}`,
            title: item.name,
            subtitle: item.sku,
            code: item.barcode || item.sku,
            price: item.price,
            kind,
          })
        } else {
          const location = entry as Location
          labels.push({
            id: `${location.id}-${index}`,
            title: location.name || location.code,
            subtitle: location.code,
            code: location.barcode,
            kind,
          })
        }
      }
    }
    return labels.slice(0, 240)
  }, [kind, repeat, selectedItems, selectedLocations])

  const print = () => {
    if (!previewLabels.length) {
      toast.push(t('اختر عنصرًا واحدًا على الأقل'), 'warning')
      return
    }
    document.body.classList.add('printing-labels')
    window.setTimeout(() => window.print(), 120)
  }

  const totalSelected = selectedItems.length + selectedLocations.length

  return (
    <div>
      <PageHeader
        title={t('الباركود والليبلات')}
        subtitle={t('تصميم وطباعة ليبلات الأصناف والمواقع')}
        actions={
          <Button onClick={print} disabled={!previewLabels.length}>
            <Printer size={16} /> {t('طباعة الليبلات')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:hidden">
        <StatCard label={t('ليبل أصناف')} value={selectedItems.length} icon={<Tag size={18} />} />
        <StatCard label={t('ليبل مواقع')} value={selectedLocations.length} icon={<ScanBarcode size={18} />} tone="sky" />
        <StatCard label={t('نسخ')} value={repeat} icon={<Printer size={18} />} tone="violet" />
        <StatCard label={t('إجمالي الليبلات')} value={previewLabels.length} icon={<Printer size={18} />} tone="green" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_330px] print:block">
        <div className="space-y-4 print:hidden">
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 pt-1">
              <Tabs
                tabs={[
                  { id: 'items', label: t('ليبل أصناف'), count: items.length },
                  { id: 'locations', label: t('ليبل مواقع'), count: locations.length },
                ]}
                active={kind}
                onChange={(value) => {
                  setKind(value as Kind)
                  setSearch('')
                }}
                className="border-b-0"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={kind === 'items' ? t('بحث بالاسم أو الكود') : t('بحث بكود الموقع')}
                className="w-full sm:w-72"
              />
              <Button size="sm" variant="secondary" onClick={selectAll}>
                {selectedCount === currentIds.length && currentIds.length > 0 ? (
                  <CheckSquare size={14} />
                ) : (
                  <Square size={14} />
                )}
                {t('الكل للطباعة')}
              </Button>
              <Badge tone="brand">
                {selectedCount} / {currentIds.length}
              </Badge>
            </div>

            <div className="max-h-[460px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 text-start">{t('الاسم')}</th>
                    <th className="px-3 py-2 text-start">{t('الكود')}</th>
                    <th className="px-3 py-2 text-start">{t('الباركود')}</th>
                    <th className="px-3 py-2 text-start">{kind === 'items' ? t('السعر') : t('المخزن')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(kind === 'items' ? items : locations).slice(0, 200).map((entry) => {
                    const checked = Boolean(selected[entry.id])
                    const isItem = kind === 'items'
                    return (
                      <tr
                        key={entry.id}
                        className={`cursor-pointer hover:bg-slate-50/70 ${checked ? 'bg-brand-50/40' : ''}`}
                        onClick={() => toggle(entry.id)}
                      >
                        <td className="px-3 py-2">
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                              checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {checked ? <CheckSquare size={13} /> : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs font-bold text-slate-800">
                          {isItem ? (entry as Item).name : (entry as Location).name || (entry as Location).code}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                          {isItem ? (entry as Item).sku : (entry as Location).type}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-slate-400">
                          {isItem ? (entry as Item).barcode || '—' : (entry as Location).barcode}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-slate-500">
                          {isItem
                            ? money((entry as Item).price, lang)
                            : `${(entry as Location).warehouse?.name || ''} · ${(entry as Location).code}`}
                        </td>
                      </tr>
                    )
                  })}
                  {(kind === 'items' ? items : locations).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-xs text-slate-400">
                        {t('لا توجد بيانات')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('إعدادات الليبل')} subtitle={t('تنطبق على المعاينة والطباعة')} />
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <Field label={`${t('حجم الليبل')} — ${t('العرض')} (mm)`}>
                <Input
                  type="number"
                  min="20"
                  max="120"
                  value={settings.labelWidth}
                  onChange={(event) => setSettings({ ...settings, labelWidth: Number(event.target.value) || 50 })}
                />
              </Field>
              <Field label={`${t('حجم الليبل')} — ${t('الارتفاع')} (mm)`}>
                <Input
                  type="number"
                  min="10"
                  max="120"
                  value={settings.labelHeight}
                  onChange={(event) => setSettings({ ...settings, labelHeight: Number(event.target.value) || 25 })}
                />
              </Field>
              <Field label={t('نوع الباركود')}>
                <Select
                  value={settings.symbology}
                  onChange={(event) => setSettings({ ...settings, symbology: event.target.value })}
                >
                  <option value="CODE128">CODE128</option>
                  <option value="CODE39">CODE39</option>
                  <option value="EAN13">EAN13</option>
                  <option value="ITF14">ITF14</option>
                </Select>
              </Field>
              <Field label={t('عدد النسخ')}>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={copies}
                  onChange={(event) => setCopies(event.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-xs font-semibold text-slate-600">{t('الحقول الظاهرة')}</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'showName' as const, label: t('اسم الصنف') },
                    { key: 'showSku' as const, label: t('كود الصنف') },
                    { key: 'showPrice' as const, label: t('السعر') },
                  ].map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setSettings({ ...settings, [option.key]: !settings[option.key] })}
                      className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold ${
                        settings[option.key]
                          ? 'border-brand-300 bg-brand-50 text-brand-800'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-3 print:space-y-0">
          <Card className="print:hidden">
            <CardHeader title={t('معاينة')} subtitle={`${previewLabels.length} ${t('ليبل')}`} />
            <div className="flex items-center gap-3 p-3">
              <div className="rounded-lg border border-slate-100 bg-white p-1.5">
                <QrCode value={previewLabels[0]?.code || 'STG'} size={48} />
              </div>
              <div className="text-[11px] leading-6 text-slate-500">
                <p>{settings.labelWidth} × {settings.labelHeight} mm</p>
                <p>{settings.symbology}</p>
              </div>
            </div>
          </Card>

          <div className="rounded-2xl border border-slate-200 bg-slate-100/60 p-3 print:border-0 print:bg-white print:p-0">
            {previewLabels.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400 print:hidden">
                {t('اختر الأصناف أو المواقع لمعاينة الليبلات')}
              </p>
            ) : (
              <div
                id="label-sheet"
                className="label-sheet"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(28, settings.labelWidth)}mm, ${settings.labelWidth}mm))`,
                }}
              >
                {previewLabels.map((label) => (
                  <div
                    key={label.id}
                    className="label-card"
                    style={{ width: `${settings.labelWidth}mm`, height: `${settings.labelHeight}mm` }}
                  >
                    {settings.showName ? (
                      <p className="line-clamp-1 w-full text-center text-[8px] font-extrabold leading-tight">
                        {label.title}
                      </p>
                    ) : null}
                    <div className="flex w-full flex-1 items-center justify-center py-0.5">
                      <Barcode
                        value={label.code}
                        format={settings.symbology}
                        height={Math.max(18, settings.labelHeight * 0.9)}
                        width={1}
                        displayValue={false}
                      />
                    </div>
                    {settings.showSku || settings.showPrice ? (
                      <div className="flex w-full items-center justify-between gap-1 text-[7px] font-bold">
                        {settings.showSku ? <span className="truncate font-mono">{label.subtitle}</span> : <span />}
                        {settings.showPrice && label.price !== undefined ? (
                          <span className="shrink-0">{money(label.price, lang)}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {totalSelected === 0 ? (
        <div className="mt-3 print:hidden">
          <Alert tone="info">{t('اختر الأصناف أو المواقع ثم اضبط الحجم وعدد النسخ لبدء الطباعة.')}</Alert>
        </div>
      ) : null}
    </div>
  )
}
