import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Banknote, Building2, Mail, MapPin, Phone, Printer, XCircle } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
} from '../components/ui'
import { Barcode, QrCode } from '../components/Barcode'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { date, money, qty } from '../lib/format'
import type { Invoice, Partner } from '../lib/types'

type InvoiceDetail = {
  invoice: Invoice
  company: Record<string, string>
  partner: Partner | null
}

export default function InvoiceView() {
  const { id = '' } = useParams()
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [payOpen, setPayOpen] = useState(false)
  const [amount, setAmount] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<InvoiceDetail>(`/api/invoices/${id}`),
    enabled: Boolean(id),
  })

  const invoice = data?.invoice
  const company = data?.company || {}

  const payMutation = useMutation({
    mutationFn: () => api.post(`/api/invoices/${id}/pay`, { amount: Number(amount) }),
    onSuccess: () => {
      toast.push(t('تم تسجيل الدفعة'))
      setPayOpen(false)
      setAmount('')
      refetch()
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/api/invoices/${id}/cancel`),
    onSuccess: () => {
      toast.push(t('تم إلغاء الفاتورة'))
      refetch()
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  if (isLoading) return <Spinner label={t('جاري التحميل...')} />
  if (!invoice) return <p className="text-sm text-slate-500">{t('الفاتورة غير موجودة')}</p>

  const due = Math.max(0, invoice.total - invoice.paidAmount)

  return (
    <div>
      <Link
        to="/invoices"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700 print:hidden"
      >
        <ArrowRight size={14} /> {t('الفواتير')}
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{invoice.number}</span>
            <StatusBadge status={invoice.status} />
            <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
              {invoice.type === 'SALES' ? t('فاتورة مبيعات') : t('فاتورة مشتريات')}
            </span>
          </span>
        }
        subtitle={`${invoice.partnerName} · ${date(invoice.date, lang)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={15} /> {t('طباعة الفاتورة')}
            </Button>
            {can('MANAGER', 'OPERATOR') && !['PAID', 'CANCELLED'].includes(invoice.status) ? (
              <Button
                onClick={() => {
                  setAmount(String(due))
                  setPayOpen(true)
                }}
              >
                <Banknote size={16} /> {t('تسجيل دفعة')}
              </Button>
            ) : null}
            {can('MANAGER') && !['PAID', 'CANCELLED'].includes(invoice.status) ? (
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm(`${t('إلغاء الفاتورة')} ${invoice.number}؟`)) cancelMutation.mutate()
                }}
                loading={cancelMutation.isPending}
              >
                <XCircle size={15} /> {t('إلغاء الفاتورة')}
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="print-area mx-auto max-w-4xl overflow-hidden">
        <div className="h-1.5 bg-gradient-to-l from-brand-950 via-brand-700 to-accent-400" />
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div className="flex items-start gap-3">
              {company.logoUrl ? (
                <img src={company.logoUrl} alt="logo" className="h-14 w-14 rounded-xl object-contain" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-950 text-xl font-black text-accent-400">
                  S
                </div>
              )}
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">{company.companyName || 'Storege'}</h2>
                {company.companyNameEn ? (
                  <p className="text-[11px] font-semibold text-slate-400">{company.companyNameEn}</p>
                ) : null}
                <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                  {company.companyAddress ? (
                    <p className="flex items-center gap-1">
                      <MapPin size={11} /> {company.companyAddress}
                    </p>
                  ) : null}
                  {company.companyPhone ? (
                    <p className="flex items-center gap-1" dir="ltr">
                      <Phone size={11} /> {company.companyPhone}
                    </p>
                  ) : null}
                  {company.companyEmail ? (
                    <p className="flex items-center gap-1" dir="ltr">
                      <Mail size={11} /> {company.companyEmail}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="text-end">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('فاتورة ضريبية')}</p>
              <p className="mt-1 font-mono text-xl font-extrabold text-brand-900">{invoice.number}</p>
              <p className="mt-1 text-[11px] text-slate-500">{date(invoice.date, lang)}</p>
              {company.companyTaxNumber ? (
                <p className="font-mono text-[10px] text-slate-400">Tax: {company.companyTaxNumber}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {invoice.partnerType === 'CUSTOMER' ? t('العميل') : t('المورد')}
              </p>
              <p className="text-sm font-bold text-slate-800">{invoice.partnerName}</p>
              {data?.partner ? (
                <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                  {data.partner.contact ? <p>{data.partner.contact}</p> : null}
                  {data.partner.phone ? <p dir="ltr">{data.partner.phone}</p> : null}
                  {data.partner.address ? <p>{data.partner.address}</p> : null}
                  {data.partner.taxNumber ? <p className="font-mono">Tax: {data.partner.taxNumber}</p> : null}
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-100 p-3 text-[11px]">
              <div>
                <p className="text-slate-400">{t('تاريخ الاستحقاق')}</p>
                <p className="font-bold text-slate-700">{invoice.dueDate ? date(invoice.dueDate, lang) : '—'}</p>
              </div>
              <div>
                <p className="text-slate-400">{t('الحالة')}</p>
                <p className="font-bold text-slate-700">
                  <StatusBadge status={invoice.status} />
                </p>
              </div>
              <div>
                <p className="text-slate-400">{t('المبلغ المدفوع')}</p>
                <p className="font-bold text-emerald-700">{money(invoice.paidAmount, lang)}</p>
              </div>
              <div>
                <p className="text-slate-400">{t('المبلغ المستحق')}</p>
                <p className="font-bold text-amber-700">{money(due, lang)}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-start text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 text-start">#</th>
                  <th className="px-3 py-2 text-start">{t('الوصف')}</th>
                  <th className="px-3 py-2 text-end">{t('الكمية')}</th>
                  <th className="px-3 py-2 text-end">{t('السعر')}</th>
                  <th className="px-3 py-2 text-end">{t('الإجمالي')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.lines.map((line, index) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2 text-[11px] text-slate-400">{index + 1}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{line.description}</td>
                    <td className="px-3 py-2 text-end text-xs tabular-nums text-slate-600">{qty(line.qty)}</td>
                    <td className="px-3 py-2 text-end text-xs tabular-nums text-slate-600">{money(line.unitPrice, lang)}</td>
                    <td className="px-3 py-2 text-end text-xs font-bold tabular-nums text-slate-800">
                      {money(line.total, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="rounded-lg border border-slate-100 bg-white p-2">
                <QrCode value={invoice.number} size={74} />
              </div>
              <div className="max-w-[190px] rounded-lg border border-slate-100 bg-white p-2">
                <Barcode value={invoice.number} height={30} width={1.2} />
              </div>
            </div>
            <div className="ms-auto w-full max-w-xs space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>{t('الصافي')}</span>
                <span>{money(invoice.subtotal, lang)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>
                  {t('الضريبة')} ({invoice.taxRate}%)
                </span>
                <span>{money(invoice.taxAmount, lang)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-extrabold text-slate-900">
                <span>{t('إجمالي الفاتورة')}</span>
                <span>{money(invoice.total, lang)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>{t('المبلغ المدفوع')}</span>
                <span>{money(invoice.paidAmount, lang)}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-amber-50 px-2 py-1 font-bold text-amber-800">
                <span>{t('المبلغ المستحق')}</span>
                <span>{money(due, lang)}</span>
              </div>
            </div>
          </div>

          {invoice.notes ? (
            <p className="mt-5 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-6 text-slate-500">{invoice.notes}</p>
          ) : null}

          <p className="mt-5 border-t border-slate-100 pt-3 text-center text-[10px] text-slate-400">
            {company.invoiceFooter || t('شكرًا لتعاملكم معنا')}
          </p>
        </div>
      </Card>

      <div className="mx-auto mt-3 max-w-4xl print:hidden">
        <Alert tone="info">
          <span className="flex items-center gap-2">
            <Building2 size={14} /> {t('يمكنك طباعة الفاتورة أو حفظها PDF من نافذة الطباعة.')}
          </span>
        </Alert>
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={t('تسجيل دفعة')}
        subtitle={`${invoice.number} · ${t('المبلغ المستحق')} ${money(due, lang)}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={() => payMutation.mutate()} loading={payMutation.isPending} disabled={!Number(amount)}>
              {t('تسجيل الدفعة')}
            </Button>
          </>
        }
      >
        <Field label={t('دفعة')} required>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            autoFocus
          />
        </Field>
      </Modal>
    </div>
  )
}
