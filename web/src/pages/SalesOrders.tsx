import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ClipboardList, Plus, ShoppingCart, Trash2, Users } from 'lucide-react'
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
  Textarea,
} from '../components/ui'
import { api, queryString } from '../lib/api'
import { useWarehouse } from '../lib/warehouse'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { date, money } from '../lib/format'
import type { Item, ListResponse, Partner, SalesOrder } from '../lib/types'

type Line = { itemId: string; qty: string; unitPrice: string }

export default function SalesOrders() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const { warehouseId } = useWarehouse()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  const [shipTo, setShipTo] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ itemId: '', qty: '1', unitPrice: '0' }])
  const [formError, setFormError] = useState('')

  const ordersQuery = useQuery({
    queryKey: ['sales-orders', { page, search, status, warehouseId }],
    queryFn: () =>
      api.get<ListResponse<SalesOrder>>(
        `/api/sales-orders${queryString({ page, pageSize: 20, q: search, status, warehouseId })}`,
      ),
  })
  const customersQuery = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => api.get<Partner[]>('/api/customers/all'),
  })
  const itemsQuery = useQuery({
    queryKey: ['items-lookup'],
    queryFn: () => api.get<ListResponse<Item>>('/api/items?pageSize=200&active=1'),
  })

  const items = itemsQuery.data?.items || []
  const subtotal = lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitPrice) || 0), 0)
  const total = Math.round(subtotal * 114) / 100

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<SalesOrder>('/api/sales-orders', {
        customerId: customerId || null,
        warehouseId,
        priority,
        shipTo: shipTo || null,
        notes: notes || null,
        autoAllocate: true,
        lines: lines.map((line) => ({
          itemId: line.itemId,
          qty: Number(line.qty) || 0,
          unitPrice: Number(line.unitPrice) || 0,
        })),
      }),
    onSuccess: (order) => {
      toast.push(`${t('تم إنشاء أمر البيع')} ${order.number}`)
      setCreateOpen(false)
      setLines([{ itemId: '', qty: '1', unitPrice: '0' }])
      setCustomerId('')
      setNotes('')
      setShipTo('')
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] })
      queryClient.invalidateQueries({ queryKey: ['picking-queue'] })
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const stats = ordersQuery.data?.items || []
  return (
    <div>
      <PageHeader
        title={t('أوامر البيع')}
        subtitle={t('إنشاء ومتابعة أوامر العملاء والتخصيص')}
        actions={
          can('MANAGER', 'OPERATOR') ? (
            <Button onClick={() => { setFormError(''); setCreateOpen(true) }}>
              <Plus size={16} /> {t('أمر بيع جديد')}
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('إجمالي الأوامر')} value={ordersQuery.data?.total || 0} icon={<ClipboardList size={18} />} />
        <StatCard
          label={t('قيد التجهيز')}
          value={stats.filter((order) => ['ALLOCATED', 'PICKING'].includes(order.status)).length}
          icon={<ShoppingCart size={18} />}
          tone="violet"
        />
        <StatCard
          label={t('جاهز للشحن')}
          value={stats.filter((order) => ['PICKED', 'PACKED'].includes(order.status)).length}
          icon={<ShoppingCart size={18} />}
          tone="green"
        />
        <StatCard
          label={t('قيمة الأوامر')}
          value={money(stats.reduce((sum, order) => sum + order.total, 0), lang)}
          icon={<Users size={18} />}
          tone="amber"
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
            placeholder={t('بحث برقم الأمر أو العميل')}
            className="w-full sm:w-80"
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
            {['OPEN', 'ALLOCATED', 'PICKING', 'PICKED', 'PACKED', 'SHIPPED', 'CANCELLED'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Link to="/picking" className="ms-auto">
            <Button variant="ghost" size="sm">
              <ShoppingCart size={14} /> {t('قائمة التجهيز')}
            </Button>
          </Link>
        </div>

        <DataTable
          headers={[t('رقم الأمر'), t('العميل'), t('التاريخ'), t('الأصناف'), t('الأولوية'), t('الإجمالي'), t('الحالة'), '']}
          loading={ordersQuery.isLoading}
          rowCount={ordersQuery.data?.items?.length}
        >
          {(ordersQuery.data?.items || []).map((order) => (
            <tr key={order.id} className="hover:bg-slate-50/70">
              <td className="px-3.5 py-2.5 font-mono text-xs font-bold text-brand-800">{order.number}</td>
              <td className="px-3.5 py-2.5 text-xs text-slate-700">{order.customer?.name || t('عميل نقدي')}</td>
              <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{date(order.createdAt, lang)}</td>
              <td className="px-3.5 py-2.5 text-xs text-slate-500">{order.lines?.length || 0}</td>
              <td className="px-3.5 py-2.5"><StatusBadge status={order.priority} /></td>
              <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{money(order.total, lang)}</td>
              <td className="px-3.5 py-2.5"><StatusBadge status={order.status} /></td>
              <td className="px-3.5 py-2.5">
                <Link to={`/sales-orders/${order.id}`}>
                  <Button variant="ghost" size="sm">
                    {t('عرض')} <ArrowLeft size={13} />
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
        <Pagination page={page} pageSize={20} total={ordersQuery.data?.total || 0} onChange={setPage} />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('أمر بيع جديد')}
        subtitle={t('سيتم تخصيص المخزون تلقائيًا عند الإمكان')}
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
            <Field label={t('العميل')}>
              <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">{t('عميل نقدي')}</option>
                {(customersQuery.data || []).map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('الأولوية')}>
              <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
                {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('عنوان الشحن')} className="sm:col-span-2">
              <Input value={shipTo} onChange={(event) => setShipTo(event.target.value)} />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600">{t('الأصناف')}</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setLines([...lines, { itemId: '', qty: '1', unitPrice: '0' }])}
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
                      unitPrice: item ? String(item.price) : copy[index].unitPrice,
                    }
                    setLines(copy)
                  }}
                >
                  <option value="">{t('اختر الصنف')}</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} — {item.name} ({item.available ?? 0})
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
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitPrice}
                  onChange={(event) => {
                    const copy = [...lines]
                    copy[index] = { ...copy[index], unitPrice: event.target.value }
                    setLines(copy)
                  }}
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
    </div>
  )
}
