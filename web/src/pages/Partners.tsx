import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Mail, Phone, Plus, Trash2, Users } from 'lucide-react'
import {
  Alert,
  Badge,
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
  StatCard,
  Textarea,
} from '../components/ui'
import { api, queryString } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { date } from '../lib/format'
import type { ListResponse, Partner } from '../lib/types'

type Kind = 'supplier' | 'customer'

type PartnerForm = {
  code: string
  name: string
  contact: string
  phone: string
  email: string
  address: string
  taxNumber: string
  notes: string
  active: boolean
}

const emptyForm: PartnerForm = {
  code: '',
  name: '',
  contact: '',
  phone: '',
  email: '',
  address: '',
  taxNumber: '',
  notes: '',
  active: true,
}

export default function Partners() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [kind, setKind] = useState<Kind>('supplier')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Partner | null>(null)
  const [form, setForm] = useState<PartnerForm>(emptyForm)
  const [formError, setFormError] = useState('')

  const listQuery = useQuery({
    queryKey: ['partners', kind, { page, search }],
    queryFn: () =>
      api.get<ListResponse<Partner>>(`/api/${kind}s${queryString({ page, pageSize: 20, q: search })}`),
  })

  const suppliersQuery = useQuery({
    queryKey: ['suppliers-count'],
    queryFn: () => api.get<ListResponse<Partner>>('/api/suppliers?pageSize=1'),
  })
  const customersQuery = useQuery({
    queryKey: ['customers-count'],
    queryFn: () => api.get<ListResponse<Partner>>('/api/customers?pageSize=1'),
  })

  const partners = listQuery.data?.items || []
  const total = listQuery.data?.total || 0

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['partners', kind] })
    queryClient.invalidateQueries({ queryKey: ['suppliers-count'] })
    queryClient.invalidateQueries({ queryKey: ['customers-count'] })
    queryClient.invalidateQueries({ queryKey: ['suppliers-all'] })
    queryClient.invalidateQueries({ queryKey: ['customers-all'] })
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        code: form.code || undefined,
        email: form.email || null,
        contact: form.contact || null,
        phone: form.phone || null,
        address: form.address || null,
        taxNumber: form.taxNumber || null,
        notes: form.notes || null,
      }
      return editing
        ? api.patch<Partner>(`/api/${kind}s/${editing.id}`, payload)
        : api.post<Partner>(`/api/${kind}s`, payload)
    },
    onSuccess: () => {
      toast.push(editing ? t('تم تحديث البيانات') : t('تمت الإضافة'))
      setOpen(false)
      setEditing(null)
      setForm(emptyForm)
      setFormError('')
      invalidate()
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/api/${kind}s/${id}`),
    onSuccess: () => {
      toast.push(t('تم الحذف'))
      invalidate()
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setOpen(true)
  }

  const openEdit = (partner: Partner) => {
    setEditing(partner)
    setForm({
      code: partner.code,
      name: partner.name,
      contact: partner.contact || '',
      phone: partner.phone || '',
      email: partner.email || '',
      address: partner.address || '',
      taxNumber: partner.taxNumber || '',
      notes: partner.notes || '',
      active: partner.active,
    })
    setFormError('')
    setOpen(true)
  }

  return (
    <div>
      <PageHeader
        title={t('الموردون والعملاء')}
        subtitle={t('إدارة بيانات الشركاء وعروض الأسعار والتواصل')}
        actions={
          can('MANAGER', 'OPERATOR') ? (
            <Button onClick={openCreate}>
              <Plus size={16} /> {kind === 'supplier' ? t('إضافة مورد') : t('إضافة عميل')}
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('الموردون')} value={suppliersQuery.data?.total || 0} icon={<Building2 size={18} />} />
        <StatCard label={t('العملاء')} value={customersQuery.data?.total || 0} icon={<Users size={18} />} tone="sky" />
        <StatCard
          label={t('سجلات نشطة')}
          value={partners.filter((partner) => partner.active).length}
          icon={<Badge tone="green">Active</Badge>}
          tone="green"
        />
        <StatCard
          label={t('إجمالي الشركاء')}
          value={(suppliersQuery.data?.total || 0) + (customersQuery.data?.total || 0)}
          icon={<Users size={18} />}
          tone="violet"
        />
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            {([
              { id: 'supplier' as Kind, label: t('الموردون') },
              { id: 'customer' as Kind, label: t('العملاء') },
            ]).map((option) => (
              <button
                key={option.id}
                onClick={() => {
                  setKind(option.id)
                  setSearch('')
                  setPage(1)
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  kind === option.id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            placeholder={t('بحث بالاسم أو الكود أو الهاتف')}
            className="w-full sm:w-72"
          />
          <span className="ms-auto text-xs text-slate-400">
            {total} {t('سجل')}
          </span>
        </div>

        <DataTable
          headers={[
            t('الكود'),
            t('الاسم'),
            t('مسؤول التواصل'),
            t('الهاتف'),
            t('البريد الإلكتروني'),
            t('الحالة'),
            t('التاريخ'),
            t('الإجراءات'),
          ]}
          loading={listQuery.isLoading}
          rowCount={partners.length}
        >
          {partners.map((partner) => (
            <tr key={partner.id} className="hover:bg-slate-50/70">
              <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{partner.code}</td>
              <td className="px-3.5 py-2.5">
                <button
                  onClick={() => can('MANAGER', 'OPERATOR') && openEdit(partner)}
                  className="text-xs font-bold text-slate-800 hover:text-brand-700"
                >
                  {partner.name}
                </button>
                {partner.taxNumber ? (
                  <p className="font-mono text-[10px] text-slate-400">Tax: {partner.taxNumber}</p>
                ) : null}
              </td>
              <td className="px-3.5 py-2.5 text-xs text-slate-600">{partner.contact || '—'}</td>
              <td className="px-3.5 py-2.5">
                {partner.phone ? (
                  <span className="flex items-center gap-1 text-xs text-slate-600" dir="ltr">
                    <Phone size={11} className="text-slate-400" /> {partner.phone}
                  </span>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </td>
              <td className="px-3.5 py-2.5">
                {partner.email ? (
                  <span className="flex items-center gap-1 text-[11px] text-slate-500" dir="ltr">
                    <Mail size={11} className="text-slate-400" /> {partner.email}
                  </span>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </td>
              <td className="px-3.5 py-2.5">
                <Badge tone={partner.active ? 'green' : 'slate'}>{partner.active ? t('نشط') : t('غير نشط')}</Badge>
              </td>
              <td className="px-3.5 py-2.5 text-[11px] text-slate-400">
                {partner.createdAt ? date(partner.createdAt, lang) : '—'}
              </td>
              <td className="px-3.5 py-2.5">
                <div className="flex items-center gap-1">
                  {can('MANAGER', 'OPERATOR') ? (
                    <Button size="sm" variant="secondary" onClick={() => openEdit(partner)}>
                      {t('تعديل')}
                    </Button>
                  ) : null}
                  {can('MANAGER') ? (
                    <IconButton
                      className="hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => {
                        if (window.confirm(`${t('حذف')} ${partner.name}؟`)) deleteMutation.mutate(partner.id)
                      }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
        <Pagination page={page} pageSize={20} total={total} onChange={setPage} />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('تعديل البيانات') : kind === 'supplier' ? t('إضافة مورد') : t('إضافة عميل')}
        subtitle={kind === 'supplier' ? t('بيانات المورد') : t('بيانات العميل')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={form.name.trim().length < 2}
            >
              {t('حفظ')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('الاسم')} required>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus />
            </Field>
            <Field label={kind === 'supplier' ? t('كود المورد') : t('كود العميل')} hint={t('اختياري — يولّد تلقائيًا')}>
              <Input
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                dir="ltr"
                disabled={Boolean(editing)}
              />
            </Field>
            <Field label={t('مسؤول التواصل')}>
              <Input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} />
            </Field>
            <Field label={t('الهاتف')}>
              <Input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                dir="ltr"
              />
            </Field>
            <Field label={t('البريد الإلكتروني')}>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                dir="ltr"
              />
            </Field>
            <Field label={t('الرقم الضريبي')}>
              <Input
                value={form.taxNumber}
                onChange={(event) => setForm({ ...form, taxNumber: event.target.value })}
                dir="ltr"
              />
            </Field>
            <Field label={t('العنوان')} className="sm:col-span-2">
              <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </Field>
          </div>
          <Field label={t('ملاحظات')}>
            <Textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t('نشط')}
          </label>
        </div>
      </Modal>
    </div>
  )
}
