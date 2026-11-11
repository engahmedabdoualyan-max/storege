import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ClipboardCheck, PackagePlus, Plus, Trash2, Truck } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  DataTable,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatCard,
  StatusBadge,
  Tabs,
  Textarea,
} from '../components/ui'
import { api, queryString } from '../lib/api'
import { useWarehouse } from '../lib/warehouse'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { date, money, qty } from '../lib/format'
import type { Item, ListResponse, Location, Partner, PurchaseOrder, Receipt, StockRow } from '../lib/types'

type Line = { itemId: string; qty: string; unitCost: string }

export default function Receiving() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const { warehouseId } = useWarehouse()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState('orders')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ itemId: '', qty: '1', unitCost: '0' }])
  const [putawayRow, setPutawayRow] = useState<StockRow | null>(null)
  const [putawayLocation, setPutawayLocation] = useState('')
  const [putawayQty, setPutawayQty] = useState('')

  const ordersQuery = useQuery({
    queryKey: ['purchase-orders', { page, search, status, warehouseId }],
    queryFn: () =>
      api.get<ListResponse<PurchaseOrder>>(
        `/api/purchase-orders${queryString({ page, pageSize: 20, q: search, status, warehouseId })}`,
      ),
  })
  const receiptsQuery = useQuery({
    queryKey: ['receipts', { page, search, warehouseId }],
    queryFn: () =>
      api.get<ListResponse<Receipt>>(`/api/receipts${queryString({ page, pageSize: 20, q: search, warehouseId })}`),
    enabled: tab === 'receipts',
  })
  const putawayQuery = useQuery({
    queryKey: ['putaway', warehouseId],
    queryFn: () =>
      api.get<{ items: StockRow[]; locations: Location[] }>(`/api/putaway/pending?warehouseId=${warehouseId}`),
    enabled: tab === 'putaway',
  })
  const suppliersQuery = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: () => api.get<Partner[]>('/api/suppliers/all'),
  })
  const itemsQuery = useQuery({
    queryKey: ['items-lookup'],
    queryFn: () => api.get<ListResponse<Item>>('/api/items?pageSize=200&active=1'),
  })

  const items = itemsQuery.data?.items || []

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<PurchaseOrder>('/api/purchase-orders', {
        supplierId: supplierId || null,
        warehouseId,
        expectedAt: expectedAt || null,
        notes: notes || null,
        lines: lines.map((line) => ({
          itemId: line.itemId,
          qty: Number(line.qty) || 0,
          unitCost: Number(line.unitCost) || 0,
        })),
      }),
    onSuccess: (order) => {
      toast.push(`${t('تم إنشاء أمر الشراء')} ${order.number}`)
      setCreateOpen(false)
      setLines([{ itemId: '', qty: '1', unitCost: '0' }])
      setSupplierId('')
      setNotes('')
      setExpectedAt('')
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const putawayMutation = useMutation({
    mutationFn: () =>
      api.post('/api/putaway/confirm', {
        itemId: putawayRow!.itemId,
        fromLocationId: putawayRow!.locationId,
        toLocationId: putawayLocation,
        qty: Number(putawayQty),
        lotId: putawayRow!.lotId || null,
        serial: putawayRow!.serial || null,
      }),
    onSuccess: () => {
      toast.push(t('تم التخزين'))
      setPutawayRow(null)
      queryClient.invalidateQueries({ queryKey: ['putaway'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const subtotal = lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitCost) || 0), 0)
  const total = Math.round(subtotal * 114) / 100
  const openCount = (ordersQuery.data?.items || []).filter((order) => ['OPEN', 'PARTIAL'].includes(order.status)).length

  const openPutaway = (row: StockRow) => {
    setPutawayRow(row)
    setPutawayQty(String(row.quantity))
    setPutawayLocation(putawayQuery.data?.locations[0]?.id || '')
  }

  return (
    <div>
      <PageHeader
        title={t('الاستلام')}
        subtitle={t('أوامر الشراء، سندات الاستلام والتخزين')}
        actions={
          can('MANAGER', 'OPERATOR') ? (
            <Button onClick={() => { setFormError(''); setCreateOpen(true) }}>
              <PackagePlus size={16} /> {t('أمر شراء جديد')}
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('أوامر الشراء')} value={ordersQuery.data?.total || 0} icon={<Truck size={18} />} />
        <StatCard label={t('أوامر مفتوحة')} value={openCount} icon={<ClipboardCheck size={18} />} tone="amber" />
        <StatCard label={t('قيد التخزين')} value={putawayQuery.data?.items.length || 0} icon={<PackagePlus size={18} />} tone="violet" />
        <StatCard
          label={t('قيمة الأوامر')}
          value={money((ordersQuery.data?.items || []).reduce((sum, order) => sum + order.total, 0), lang)}
          icon={<ClipboardCheck size={18} />}
          tone="green"
        />
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 pt-1">
          <Tabs
            tabs={[
              { id: 'orders', label: t('أوامر الشراء'), count: ordersQuery.data?.total },
              { id: 'receipts', label: t('سندات الاستلام'), count: receiptsQuery.data?.total },
              { id: 'putaway', label: t('بانتظار التخزين'), count: putawayQuery.data?.items.length },
            ]}
            active={tab}
            onChange={setTab}
            className="border-b-0"
          />
        </div>

        {tab !== 'putaway' ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              placeholder={t('بحث برقم الأمر أو المورد')}
              className="w-full sm:w-80"
            />
            {tab === 'orders' ? (
              <Select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value)
                  setPage(1)
                }}
                className="w-auto min-w-36"
              >
                <option value="">{t('كل الحالات')}</option>
                <option value="OPEN">{t('مفتوح')}</option>
                <option value="PARTIAL">{t('جزئي')}</option>
                <option value="RECEIVED">{t('مستلم')}</option>
                <option value="CANCELLED">{t('ملغي')}</option>
              </Select>
            ) : null}
          </div>
        ) : null}

        {tab === 'orders' ? (
          <>
            <DataTable
              headers={[t('رقم الأمر'), t('المورد'), t('التاريخ'), t('المتوقع'), t('الأصناف'), t('الإجمالي'), t('الحالة'), '']}
              loading={ordersQuery.isLoading}
              rowCount={ordersQuery.data?.items?.length}
            >
              {(ordersQuery.data?.items || []).map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/70">
                  <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-brand-800">{order.number}</td>
                  <td className="px-3.5 py-2.5 text-xs text-slate-700">{order.supplier?.name || '—'}</td>
                  <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{date(order.createdAt, lang)}</td>
                  <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{order.expectedAt ? date(order.expectedAt, lang) : '—'}</td>
                  <td className="px-3.5 py-2.5 text-xs text-slate-500">{order.lines?.length || 0}</td>
                  <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{money(order.total, lang)}</td>
                  <td className="px-3.5 py-2.5"><StatusBadge status={order.status} /></td>
                  <td className="px-3.5 py-2.5">
                    <Link to={`/receiving/${order.id}`}>
                      <Button variant="ghost" size="sm">
                        {t('عرض')} <ArrowLeft size={13} />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </DataTable>
            <Pagination page={page} pageSize={20} total={ordersQuery.data?.total || 0} onChange={setPage} />
          </>
        ) : null}

        {tab === 'receipts' ? (
          <>
            <DataTable
              headers={[t('رقم السند'), t('أمر الشراء'), t('المورد'), t('الأصناف'), t('الحالة'), t('التاريخ'), '']}
              loading={receiptsQuery.isLoading}
              rowCount={receiptsQuery.data?.items?.length}
            >
              {(receiptsQuery.data?.items || []).map((receipt) => (
                <tr key={receipt.id} className="hover:bg-slate-50/70">
                  <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-slate-700">{receipt.number}</td>
                  <td className="px-3.5 py-2.5 font-mono text-xs text-slate-500">{receipt.po?.number || '—'}</td>
                  <td className="px-3.5 py-2.5 text-xs text-slate-700">{receipt.po?.supplier?.name || '—'}</td>
                  <td className="px-3.5 py-2.5 text-xs text-slate-500">{receipt.lines?.length || 0}</td>
                  <td className="px-3.5 py-2.5"><StatusBadge status={receipt.status} /></td>
                  <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{date(receipt.createdAt, lang)}</td>
                  <td className="px-3.5 py-2.5">
                    {receipt.po ? (
                      <Link to={`/receiving/${receipt.po.id}`}>
                        <Button variant="ghost" size="sm">
                          {t('عرض')} <ArrowLeft size={13} />
                        </Button>
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </DataTable>
            <Pagination page={page} pageSize={20} total={receiptsQuery.data?.total || 0} onChange={setPage} />
          </>
        ) : null}

        {tab === 'putaway' ? (
          <DataTable
            headers={[t('الصنف'), t('الموقع الحالي'), t('الدفعة'), t('الكمية'), '']}
            loading={putawayQuery.isLoading}
            rowCount={putawayQuery.data?.items?.length}
          >
            {(putawayQuery.data?.items || []).map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/70">
                <td className="px-3.5 py-2.5">
                  <p className="text-xs font-bold text-slate-800">{row.item.name}</p>
                  <p className="font-mono text-[10px] text-slate-400">{row.item.sku}</p>
                </td>
                <td className="px-3.5 py-2.5 text-xs text-slate-600">{row.location.code}</td>
                <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{row.lot?.code || '—'}</td>
                <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{qty(row.quantity)}</td>
                <td className="px-3.5 py-2.5">
                  <Button size="sm" variant="secondary" onClick={() => openPutaway(row)}>
                    {t('تخزين')}
                  </Button>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : null}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('أمر شراء جديد')}
        subtitle={t('حدد المورد والأصناف والكميات')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!lines.some((line) => line.itemId && Number(line.qty) > 0)}
            >
              {t('إنشاء الأمر')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('المورد')}>
              <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="">{t('بدون مورد')}</option>
                {(suppliersQuery.data || []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('تاريخ الاستلام المتوقع')}>
              <Input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600">{t('الأصناف')}</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setLines([...lines, { itemId: '', qty: '1', unitCost: '0' }])}
              >
                <Plus size={13} /> {t('إضافة سطر')}
              </Button>
            </div>
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-[1fr_80px_100px_32px] items-center gap-2">
                <Select
                  value={line.itemId}
                  onChange={(event) => {
                    const item = items.find((candidate) => candidate.id === event.target.value)
                    const copy = [...lines]
                    copy[index] = {
                      ...copy[index],
                      itemId: event.target.value,
                      unitCost: item ? String(item.cost) : copy[index].unitCost,
                    }
                    setLines(copy)
                  }}
                >
                  <option value="">{t('اختر الصنف')}</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} — {item.name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={line.qty}
                  onChange={(event) => {
                    const copy = [...lines]
                    copy[index] = { ...copy[index], qty: event.target.value }
                    setLines(copy)
                  }}
                  placeholder={t('الكمية')}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitCost}
                  onChange={(event) => {
                    const copy = [...lines]
                    copy[index] = { ...copy[index], unitCost: event.target.value }
                    setLines(copy)
                  }}
                  placeholder={t('التكلفة')}
                />
                <IconButton
                  onClick={() => setLines(lines.length > 1 ? lines.filter((_, i) => i !== index) : lines)}
                  className="hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>

          <Field label={t('ملاحظات')}>
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>

          <div className="rounded-xl bg-slate-50 p-3 text-xs">
            <div className="flex justify-between py-0.5 text-slate-500">
              <span>{t('الصافي')}</span>
              <span>{money(subtotal, lang)}</span>
            </div>
            <div className="flex justify-between py-0.5 text-slate-500">
              <span>{t('الضريبة')} 14%</span>
              <span>{money(total - subtotal, lang)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-800">
              <span>{t('الإجمالي')}</span>
              <span>{money(total, lang)}</span>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(putawayRow)}
        onClose={() => setPutawayRow(null)}
        title={t('تخزين الصنف')}
        subtitle={putawayRow ? `${putawayRow.item.name} · ${putawayRow.location.code}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPutawayRow(null)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => putawayMutation.mutate()}
              loading={putawayMutation.isPending}
              disabled={!putawayLocation || !Number(putawayQty)}
            >
              {t('تأكيد التخزين')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('إلى موقع')} required>
            <div className="flex gap-2">
              <Select value={putawayLocation} onChange={(event) => setPutawayLocation(event.target.value)} className="flex-1">
                <option value="">{t('اختر الموقع')}</option>
                {(putawayQuery.data?.locations || []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} — {location.name}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    const res = await api.get<{ locationId: string }>(`/api/putaway/suggest?itemId=${putawayRow?.itemId}&warehouseId=${warehouseId}`)
                    if (res.locationId) setPutawayLocation(res.locationId)
                  } catch (e) {
                    /* ignore */
                  }
                }}
              >
                {t('اقتراح')}
              </Button>
            </div>
          </Field>
          <Field label={t('الكمية')} required>
            <Input type="number" step="0.001" value={putawayQty} onChange={(event) => setPutawayQty(event.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
