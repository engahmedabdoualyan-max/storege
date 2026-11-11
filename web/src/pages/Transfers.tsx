import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  PackageCheck,
  Plus,
  Send,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  IconButton,
  Input,
  KeyValue,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
} from '../components/ui'
import { api, queryString } from '../lib/api'
import { useWarehouse } from '../lib/warehouse'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { date, dateTime, qty } from '../lib/format'
import type { Item, ListResponse, Location, Transfer } from '../lib/types'

type Line = {
  itemId: string
  qty: string
  fromLocationId: string
  toLocationId: string
  lotCode: string
}

const emptyLine: Line = { itemId: '', qty: '1', fromLocationId: '', toLocationId: '', lotCode: '' }

export default function Transfers() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const { warehouseId, warehouses } = useWarehouse()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detail, setDetail] = useState<Transfer | null>(null)
  const [formError, setFormError] = useState('')
  const [fromWarehouseId, setFromWarehouseId] = useState(warehouseId)
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }])

  const listQuery = useQuery({
    queryKey: ['transfers', { page, search, status, warehouseId }],
    queryFn: () =>
      api.get<ListResponse<Transfer>>(
        `/api/transfers${queryString({ page, pageSize: 20, q: search, status, warehouseId })}`,
      ),
  })
  const itemsQuery = useQuery({
    queryKey: ['items-lookup'],
    queryFn: () => api.get<ListResponse<Item>>('/api/items?pageSize=200&active=1'),
  })
  const fromLocationsQuery = useQuery({
    queryKey: ['locations-all', fromWarehouseId],
    queryFn: () => api.get<Location[]>(`/api/locations?all=1&warehouseId=${fromWarehouseId}`),
    enabled: Boolean(fromWarehouseId),
  })
  const toLocationsQuery = useQuery({
    queryKey: ['locations-all', toWarehouseId],
    queryFn: () => api.get<Location[]>(`/api/locations?all=1&warehouseId=${toWarehouseId}`),
    enabled: Boolean(toWarehouseId),
  })

  const items = itemsQuery.data?.items || []
  const transfers = listQuery.data?.items || []
  const total = listQuery.data?.total || 0
  const targetWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse.id !== fromWarehouseId),
    [warehouses, fromWarehouseId],
  )

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['transfers'] })
    queryClient.invalidateQueries({ queryKey: ['inventory'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Transfer>('/api/transfers', {
        fromWarehouseId,
        toWarehouseId,
        notes: notes || null,
        lines: lines
          .filter((line) => line.itemId && Number(line.qty) > 0)
          .map((line) => ({
            itemId: line.itemId,
            qty: Number(line.qty),
            fromLocationId: line.fromLocationId || null,
            toLocationId: line.toLocationId || null,
            lotCode: line.lotCode || null,
          })),
      }),
    onSuccess: (transfer) => {
      toast.push(`${t('تم إنشاء التحويل')} ${transfer.number}`)
      setCreateOpen(false)
      setLines([{ ...emptyLine }])
      setNotes('')
      setFormError('')
      invalidate()
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'dispatch' | 'receive' | 'cancel' }) =>
      api.post<Transfer>(`/api/transfers/${id}/${action}`),
    onSuccess: (_data, variables) => {
      toast.push(
        variables.action === 'dispatch'
          ? t('تم الصرف')
          : variables.action === 'receive'
            ? t('تم استلام التحويل')
            : t('تم إلغاء التحويل'),
      )
      setDetail(null)
      invalidate()
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const openCreate = () => {
    setFormError('')
    setFromWarehouseId(warehouseId || warehouses[0]?.id || '')
    setToWarehouseId('')
    setLines([{ ...emptyLine }])
    setNotes('')
    setCreateOpen(true)
  }

  const updateLine = (index: number, patch: Partial<Line>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  const totalQty = lines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0)
  const inTransit = transfers.filter((transfer) => transfer.status === 'IN_TRANSIT').length
  const draft = transfers.filter((transfer) => transfer.status === 'DRAFT').length

  return (
    <div>
      <PageHeader
        title={t('التحويلات')}
        subtitle={t('نقل المخزون بين المخازن والمواقع')}
        actions={
          can('MANAGER', 'OPERATOR') ? (
            <Button onClick={openCreate}>
              <Plus size={16} /> {t('تحويل جديد')}
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('إجمالي التحويلات')} value={total} icon={<ArrowLeftRight size={18} />} />
        <StatCard label={t('مسودة')} value={draft} icon={<PackageCheck size={18} />} tone="amber" />
        <StatCard label={t('قيد النقل')} value={inTransit} icon={<Truck size={18} />} tone="sky" />
        <StatCard
          label={t('مكتمل')}
          value={transfers.filter((transfer) => transfer.status === 'RECEIVED').length}
          icon={<CheckCircle2 size={18} />}
          tone="green"
        />
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            placeholder={t('بحث برقم التحويل')}
            className="w-full sm:w-72"
          />
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
            className="w-auto min-w-36"
          >
            <option value="">{t('كل الحالات')}</option>
            <option value="DRAFT">{t('مسودة')}</option>
            <option value="IN_TRANSIT">{t('قيد النقل')}</option>
            <option value="RECEIVED">{t('مستلم')}</option>
            <option value="CANCELLED">{t('ملغي')}</option>
          </Select>
        </div>

        <DataTable
          headers={[
            t('رقم المستند'),
            t('من مخزن'),
            t('إلى مخزن'),
            t('الأصناف'),
            t('الكمية'),
            t('التاريخ'),
            t('الحالة'),
            t('الإجراءات'),
          ]}
          loading={listQuery.isLoading}
          rowCount={transfers.length}
        >
          {transfers.map((transfer) => {
            const units = transfer.lines?.reduce((sum, line) => sum + Number(line.qty || 0), 0) || 0
            return (
              <tr key={transfer.id} className="hover:bg-slate-50/70">
                <td className="px-3.5 py-2.5">
                  <button
                    onClick={() => setDetail(transfer)}
                    className="font-mono text-xs font-bold text-brand-800 hover:underline"
                  >
                    {transfer.number}
                  </button>
                </td>
                <td className="px-3.5 py-2.5 text-xs text-slate-700">{transfer.fromWarehouse?.name}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-700">{transfer.toWarehouse?.name}</td>
                <td className="px-3.5 py-2.5 text-xs text-slate-500">{transfer.lines?.length || 0}</td>
                <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(units)}</td>
                <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{date(transfer.createdAt, lang)}</td>
                <td className="px-3.5 py-2.5">
                  <StatusBadge status={transfer.status} />
                </td>
                <td className="px-3.5 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {can('MANAGER', 'OPERATOR') && transfer.status === 'DRAFT' ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => actionMutation.mutate({ id: transfer.id, action: 'dispatch' })}
                          loading={actionMutation.isPending}
                        >
                          <Send size={12} /> {t('صرف التحويل')}
                        </Button>
                        <IconButton
                          className="hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => actionMutation.mutate({ id: transfer.id, action: 'cancel' })}
                        >
                          <XCircle size={14} />
                        </IconButton>
                      </>
                    ) : null}
                    {can('MANAGER', 'OPERATOR') && transfer.status === 'IN_TRANSIT' ? (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => actionMutation.mutate({ id: transfer.id, action: 'receive' })}
                        loading={actionMutation.isPending}
                      >
                        <CheckCircle2 size={12} /> {t('استلام التحويل')}
                      </Button>
                    ) : null}
                    {transfer.status === 'RECEIVED' || transfer.status === 'CANCELLED' ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </DataTable>
        <Pagination page={page} pageSize={20} total={total} onChange={setPage} />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('تحويل جديد')}
        subtitle={t('حرّك الأصناف بين المخازن مع تتبع الكميات')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={!toWarehouseId || !lines.some((line) => line.itemId && Number(line.qty) > 0)}
            >
              {t('إنشاء التحويل')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('من مخزن')} required>
              <Select
                value={fromWarehouseId}
                onChange={(event) => {
                  setFromWarehouseId(event.target.value)
                  setLines((current) => current.map((line) => ({ ...line, fromLocationId: '' })))
                }}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('إلى مخزن')} required>
              <Select
                value={toWarehouseId}
                onChange={(event) => {
                  setToWarehouseId(event.target.value)
                  setLines((current) => current.map((line) => ({ ...line, toLocationId: '' })))
                }}
              >
                <option value="">{t('اختر المخزن الهدف')}</option>
                {targetWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({warehouse.code})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600">{t('سطور التحويل')}</p>
              <Button size="sm" variant="secondary" onClick={() => setLines([...lines, { ...emptyLine }])}>
                <Plus size={13} /> {t('إضافة سطر')}
              </Button>
            </div>
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-slate-100 p-2.5 sm:grid-cols-[1.5fr_70px_1fr_1fr_90px_32px]">
                <Select
                  value={line.itemId}
                  onChange={(event) => updateLine(index, { itemId: event.target.value })}
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
                  onChange={(event) => updateLine(index, { qty: event.target.value })}
                  placeholder={t('الكمية')}
                />
                <Select
                  value={line.fromLocationId}
                  onChange={(event) => updateLine(index, { fromLocationId: event.target.value })}
                >
                  <option value="">{t('من موقع')}</option>
                  {(fromLocationsQuery.data || []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code}
                    </option>
                  ))}
                </Select>
                <Select
                  value={line.toLocationId}
                  onChange={(event) => updateLine(index, { toLocationId: event.target.value })}
                  disabled={!toWarehouseId}
                >
                  <option value="">{t('إلى موقع')}</option>
                  {(toLocationsQuery.data || []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code}
                    </option>
                  ))}
                </Select>
                <Input
                  value={line.lotCode}
                  onChange={(event) => updateLine(index, { lotCode: event.target.value })}
                  placeholder={t('الدفعة')}
                  dir="ltr"
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

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
            <span className="text-slate-500">{t('إجمالي الوحدات')}</span>
            <b className="text-sm text-slate-800">{qty(totalQty)}</b>
          </div>

          <Field label={t('ملاحظات')}>
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${t('تحويل')} ${detail.number}` : t('تحويل')}
        subtitle={detail ? `${detail.fromWarehouse?.name} ← ${detail.toWarehouse?.name}` : ''}
        size="lg"
        footer={
          detail ? (
            <>
              {detail.status === 'DRAFT' && can('MANAGER', 'OPERATOR') ? (
                <Button
                  onClick={() => actionMutation.mutate({ id: detail.id, action: 'dispatch' })}
                  loading={actionMutation.isPending}
                >
                  <Send size={15} /> {t('صرف التحويل')}
                </Button>
              ) : null}
              {detail.status === 'IN_TRANSIT' && can('MANAGER', 'OPERATOR') ? (
                <Button
                  variant="success"
                  onClick={() => actionMutation.mutate({ id: detail.id, action: 'receive' })}
                  loading={actionMutation.isPending}
                >
                  <CheckCircle2 size={15} /> {t('استلام التحويل')}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => setDetail(null)}>
                {t('إغلاق')}
              </Button>
            </>
          ) : null
        }
      >
        {detail ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 p-3">
                <KeyValue label={t('الحالة')} value={<StatusBadge status={detail.status} />} />
                <KeyValue label={t('التاريخ')} value={dateTime(detail.createdAt, lang)} />
                <KeyValue label={t('تم الصرف')} value={detail.dispatchedAt ? dateTime(detail.dispatchedAt, lang) : '—'} />
                <KeyValue label={t('تم الاستلام')} value={detail.receivedAt ? dateTime(detail.receivedAt, lang) : '—'} />
              </div>
              <div className="rounded-xl border border-slate-100 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs font-bold text-slate-700">
                  <span>{detail.fromWarehouse?.name}</span>
                  <ArrowRight size={14} className="text-brand-500" />
                  <span>{detail.toWarehouse?.name}</span>
                </div>
                <p className="text-[11px] leading-6 text-slate-400">{detail.notes || t('لا توجد ملاحظات')}</p>
                <Badge tone="brand" className="mt-1">
                  {detail.lines?.length || 0} {t('سطر')}
                </Badge>
              </div>
            </div>

            <DataTable
              headers={[t('الصنف'), t('الدفعة'), t('من موقع'), t('إلى موقع'), t('الكمية')]}
              rowCount={detail.lines?.length}
            >
              {(detail.lines || []).map((line) => (
                <tr key={line.id}>
                  <td className="px-3.5 py-2.5">
                    <p className="text-xs font-bold text-slate-800">{line.item?.name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{line.item?.sku}</p>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{line.lot?.code || '—'}</td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">
                    {line.fromLocation?.code || '—'}
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">
                    {line.toLocation?.code || '—'}
                  </td>
                  <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(line.qty)}</td>
                </tr>
              ))}
            </DataTable>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
