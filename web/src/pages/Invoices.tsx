import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Banknote,
  Download,
  FileText,
  Plus,
  Printer,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react'
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
import { api, downloadFile, queryString } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { date, money } from '../lib/format'
import type { Invoice, Item, ListResponse, Partner } from '../lib/types'

type Line = { itemId: string; description: string; qty: string; unitPrice: string }

type InvoiceListResponse = ListResponse<Invoice> & {
  totals: { total: number; paid: number; due: number }
}

const emptyLine: Line = { itemId: '', description: '', qty: '1', unitPrice: '0' }

export default function Invoices() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [invoiceType, setInvoiceType] = useState<'SALES' | 'PURCHASE'>('SALES')
  const [partnerId, setPartnerId] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [taxRate, setTaxRate] = useState('14')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }])
  const [payTarget, setPayTarget] = useState<Invoice | null>(null)
  const [payAmount, setPayAmount] = useState('')

  const listQuery = useQuery({
    queryKey: ['invoices', { page, search, type, status, from, to }],
    queryFn: () =>
      api.get<InvoiceListResponse>(
        `/api/invoices${queryString({ page, pageSize: 20, q: search, type, status, from, to })}`,
      ),
  })
  const customersQuery = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => api.get<Partner[]>('/api/customers/all'),
  })
  const suppliersQuery = useQuery({
    queryKey: ['suppliers-all'],
    queryFn: () => api.get<Partner[]>('/api/suppliers/all'),
  })
  const itemsQuery = useQuery({
    queryKey: ['items-lookup'],
    queryFn: () => api.get<ListResponse<Item>>('/api/items?pageSize=200&active=1'),
  })

  const invoices = listQuery.data?.items || []
  const totals = listQuery.data?.totals || { total: 0, paid: 0, due: 0 }
  const partners = invoiceType === 'SALES' ? customersQuery.data || [] : suppliersQuery.data || []
  const items = itemsQuery.data?.items || []

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitPrice) || 0), 0),
    [lines],
  )
  const taxAmount = Math.round(subtotal * (Number(taxRate) || 0)) / 100
  const total = Math.round((subtotal + taxAmount) * 100) / 100

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post<Invoice>('/api/invoices', {
        type: invoiceType,
        partnerId: partnerId || null,
        partnerName: partnerName || undefined,
        dueDate: dueDate || null,
        taxRate: Number(taxRate) || 0,
        notes: notes || null,
        lines: lines
          .filter((line) => line.description && Number(line.qty) > 0)
          .map((line) => ({
            itemId: line.itemId || null,
            description: line.description,
            qty: Number(line.qty),
            unitPrice: Number(line.unitPrice) || 0,
          })),
      }),
    onSuccess: (invoice) => {
      toast.push(`${t('تم إنشاء الفاتورة')} ${invoice.number}`)
      setCreateOpen(false)
      setLines([{ ...emptyLine }])
      setPartnerId('')
      setPartnerName('')
      setDueDate('')
      setNotes('')
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const payMutation = useMutation({
    mutationFn: () => api.post(`/api/invoices/${payTarget?.id}/pay`, { amount: Number(payAmount) }),
    onSuccess: () => {
      toast.push(t('تم تسجيل الدفعة'))
      setPayTarget(null)
      setPayAmount('')
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/invoices/${id}/cancel`),
    onSuccess: () => {
      toast.push(t('تم إلغاء الفاتورة'))
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const openCreate = () => {
    setFormError('')
    setInvoiceType('SALES')
    setPartnerId('')
    setPartnerName('')
    setDueDate('')
    setTaxRate('14')
    setNotes('')
    setLines([{ ...emptyLine }])
    setCreateOpen(true)
  }

  const updateLine = (index: number, patch: Partial<Line>) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  return (
    <div>
      <PageHeader
        title={t('الفواتير')}
        subtitle={t('فواتير المبيعات والمشتريات والمدفوعات')}
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadFile('/api/invoices/export.csv', 'storege-invoices.csv')}>
              <Download size={15} /> {t('تصدير')}
            </Button>
            {can('MANAGER', 'OPERATOR') ? (
              <Button onClick={openCreate}>
                <Plus size={16} /> {t('فاتورة جديدة')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('إجمالي الفواتير')} value={money(totals.total, lang)} icon={<Receipt size={18} />} />
        <StatCard label={t('المبلغ المدفوع')} value={money(totals.paid, lang)} icon={<Banknote size={18} />} tone="green" />
        <StatCard label={t('المبلغ المستحق')} value={money(totals.due, lang)} icon={<Wallet size={18} />} tone="amber" />
        <StatCard
          label={t('فواتير غير مدفوعة')}
          value={invoices.filter((invoice) => ['UNPAID', 'PARTIAL'].includes(invoice.status)).length}
          icon={<FileText size={18} />}
          tone="rose"
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
            placeholder={t('بحث برقم الفاتورة أو الشريك')}
            className="w-full sm:w-72"
          />
          <Select
            value={type}
            onChange={(event) => {
              setType(event.target.value)
              setPage(1)
            }}
            className="w-auto min-w-32"
          >
            <option value="">{t('كل الأنواع')}</option>
            <option value="SALES">{t('فاتورة مبيعات')}</option>
            <option value="PURCHASE">{t('فاتورة مشتريات')}</option>
          </Select>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
            className="w-auto min-w-32"
          >
            <option value="">{t('كل الحالات')}</option>
            <option value="UNPAID">{t('غير مدفوعة')}</option>
            <option value="PARTIAL">{t('مدفوعة جزئيًا')}</option>
            <option value="PAID">{t('مدفوعة')}</option>
            <option value="CANCELLED">{t('ملغي')}</option>
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value)
              setPage(1)
            }}
            className="w-auto"
          />
          <Input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value)
              setPage(1)
            }}
            className="w-auto"
          />
        </div>

        <DataTable
          headers={[
            t('رقم الفاتورة'),
            t('النوع'),
            t('الشريك'),
            t('التاريخ'),
            t('تاريخ الاستحقاق'),
            t('الإجمالي'),
            t('المدفوع'),
            t('الحالة'),
            t('الإجراءات'),
          ]}
          loading={listQuery.isLoading}
          rowCount={invoices.length}
        >
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="hover:bg-slate-50/70">
              <td className="px-3.5 py-2.5">
                <Link to={`/invoices/${invoice.id}`} className="font-mono text-xs font-bold text-brand-800 hover:underline">
                  {invoice.number}
                </Link>
              </td>
              <td className="px-3.5 py-2.5">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                    invoice.type === 'SALES' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700'
                  }`}
                >
                  {invoice.type === 'SALES' ? t('مبيعات') : t('مشتريات')}
                </span>
              </td>
              <td className="px-3.5 py-2.5 text-xs text-slate-700">{invoice.partnerName}</td>
              <td className="px-3.5 py-2.5 text-[11px] text-slate-400">{date(invoice.date, lang)}</td>
              <td className="px-3.5 py-2.5 text-[11px] text-slate-400">
                {invoice.dueDate ? date(invoice.dueDate, lang) : '—'}
              </td>
              <td className="px-3.5 py-2.5 text-xs font-bold text-slate-800">{money(invoice.total, lang)}</td>
              <td className="px-3.5 py-2.5 text-xs tabular-nums text-emerald-700">{money(invoice.paidAmount, lang)}</td>
              <td className="px-3.5 py-2.5">
                <StatusBadge status={invoice.status} />
              </td>
              <td className="px-3.5 py-2.5">
                <div className="flex items-center gap-1">
                  <Link to={`/invoices/${invoice.id}`}>
                    <Button size="sm" variant="ghost">
                      <Printer size={13} /> {t('عرض')}
                    </Button>
                  </Link>
                  {can('MANAGER', 'OPERATOR') && !['PAID', 'CANCELLED'].includes(invoice.status) ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setPayTarget(invoice)
                        setPayAmount(String(Math.round((invoice.total - invoice.paidAmount) * 100) / 100))
                      }}
                    >
                      <Banknote size={13} /> {t('تسجيل دفعة')}
                    </Button>
                  ) : null}
                  {can('MANAGER') && !['CANCELLED', 'PAID'].includes(invoice.status) ? (
                    <IconButton
                      className="hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => {
                        if (window.confirm(`${t('إلغاء الفاتورة')} ${invoice.number}؟`)) cancelMutation.mutate(invoice.id)
                      }}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
        <Pagination page={page} pageSize={20} total={listQuery.data?.total || 0} onChange={setPage} />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('فاتورة جديدة')}
        subtitle={t('أنشئ فاتورة يدوية أو من أوامر البيع والشراء')}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={!lines.some((line) => line.description && Number(line.qty) > 0)}
            >
              {t('إنشاء الفاتورة')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('النوع')}>
              <Select
                value={invoiceType}
                onChange={(event) => {
                  setInvoiceType(event.target.value as 'SALES' | 'PURCHASE')
                  setPartnerId('')
                  setPartnerName('')
                }}
              >
                <option value="SALES">{t('فاتورة مبيعات')}</option>
                <option value="PURCHASE">{t('فاتورة مشتريات')}</option>
              </Select>
            </Field>
            <Field label={invoiceType === 'SALES' ? t('العميل') : t('المورد')}>
              <Select
                value={partnerId}
                onChange={(event) => {
                  setPartnerId(event.target.value)
                  setPartnerName(partners.find((partner) => partner.id === event.target.value)?.name || '')
                }}
              >
                <option value="">{invoiceType === 'SALES' ? t('عميل نقدي') : t('مورد')}</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('تاريخ الاستحقاق')}>
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-600">{t('سطور الفاتورة')}</p>
              <Button size="sm" variant="secondary" onClick={() => setLines([...lines, { ...emptyLine }])}>
                <Plus size={13} /> {t('إضافة سطر')}
              </Button>
            </div>
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-slate-100 p-2.5 sm:grid-cols-[1.2fr_1.6fr_70px_100px_32px]">
                <Select
                  value={line.itemId}
                  onChange={(event) => {
                    const item = items.find((candidate) => candidate.id === event.target.value)
                    updateLine(index, {
                      itemId: event.target.value,
                      description: item ? `${item.name} (${item.sku})` : line.description,
                      unitPrice: item ? String(item.price) : line.unitPrice,
                    })
                  }}
                >
                  <option value="">{t('بدون صنف')}</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} — {item.name}
                    </option>
                  ))}
                </Select>
                <Input
                  value={line.description}
                  onChange={(event) => updateLine(index, { description: event.target.value })}
                  placeholder={t('الوصف')}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={line.qty}
                  onChange={(event) => updateLine(index, { qty: event.target.value })}
                  placeholder={t('الكمية')}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitPrice}
                  onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                  placeholder={t('السعر')}
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

          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Field label={t('ملاحظات')}>
              <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            <Field label={t('نسبة الضريبة')}>
              <Input type="number" min="0" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} />
            </Field>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 text-xs">
            <div className="flex justify-between py-0.5 text-slate-500">
              <span>{t('الصافي')}</span>
              <span>{money(subtotal, lang)}</span>
            </div>
            <div className="flex justify-between py-0.5 text-slate-500">
              <span>{t('الضريبة')}</span>
              <span>{money(taxAmount, lang)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-800">
              <span>{t('إجمالي الفاتورة')}</span>
              <span>{money(total, lang)}</span>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title={t('تسجيل دفعة')}
        subtitle={payTarget ? `${payTarget.number} · ${payTarget.partnerName}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayTarget(null)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={() => payMutation.mutate()} loading={payMutation.isPending} disabled={!Number(payAmount)}>
              {t('تسجيل الدفعة')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
            <div>
              <p className="text-slate-400">{t('إجمالي الفاتورة')}</p>
              <p className="font-bold text-slate-800">{payTarget ? money(payTarget.total, lang) : '—'}</p>
            </div>
            <div>
              <p className="text-slate-400">{t('المبلغ المستحق')}</p>
              <p className="font-bold text-amber-700">
                {payTarget ? money(payTarget.total - payTarget.paidAmount, lang) : '—'}
              </p>
            </div>
          </div>
          <Field label={t('دفعة')} required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={payAmount}
              onChange={(event) => setPayAmount(event.target.value)}
              autoFocus
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
