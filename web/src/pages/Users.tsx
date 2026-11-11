import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Mail, Phone, Plus, ShieldCheck, UserCog, Users as UsersIcon } from 'lucide-react'
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
} from '../components/ui'
import { api, queryString } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth, ROLE_LABELS, type Role } from '../lib/auth'
import { date, timeAgo } from '../lib/format'
import type { ListResponse, UserRow } from '../lib/types'

type UserForm = {
  name: string
  email: string
  password: string
  role: Role
  phone: string
  active: boolean
}

const emptyForm: UserForm = {
  name: '',
  email: '',
  password: '',
  role: 'OPERATOR',
  phone: '',
  active: true,
}

const ROLE_TONES: Record<Role, 'brand' | 'sky' | 'amber' | 'slate'> = {
  ADMIN: 'brand',
  MANAGER: 'sky',
  OPERATOR: 'amber',
  VIEWER: 'slate',
}

export default function Users() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [form, setForm] = useState<UserForm>(emptyForm)
  const [formError, setFormError] = useState('')
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const listQuery = useQuery({
    queryKey: ['users', { page, search }],
    queryFn: () => api.get<ListResponse<UserRow>>(`/api/users${queryString({ page, pageSize: 20, q: search })}`),
  })

  const users = listQuery.data?.items || []
  const total = listQuery.data?.total || 0

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        email: form.email,
        role: form.role,
        phone: form.phone || null,
        active: form.active,
        ...(form.password ? { password: form.password } : {}),
      }
      return editing ? api.patch<UserRow>(`/api/users/${editing.id}`, payload) : api.post<UserRow>('/api/users', payload)
    },
    onSuccess: () => {
      toast.push(editing ? t('تم تحديث البيانات') : t('تمت الإضافة'))
      setOpen(false)
      setEditing(null)
      setForm(emptyForm)
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.del(`/api/users/${id}`),
    onSuccess: () => {
      toast.push(t('تم تعطيل الحساب'))
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/users/${id}`, { active: true }),
    onSuccess: () => {
      toast.push(t('تم تنشيط الحساب'))
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const passwordMutation = useMutation({
    mutationFn: () => api.post('/api/auth/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      toast.push(t('تم تغيير كلمة المرور'))
      setPasswordOpen(false)
      setCurrentPassword('')
      setNewPassword('')
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setOpen(true)
  }

  const openEdit = (row: UserRow) => {
    setEditing(row)
    setForm({
      name: row.name,
      email: row.email,
      password: '',
      role: row.role,
      phone: row.phone || '',
      active: row.active,
    })
    setFormError('')
    setOpen(true)
  }

  const roleCount = (role: Role) => users.filter((row) => row.role === role).length

  return (
    <div>
      <PageHeader
        title={t('المستخدمون')}
        subtitle={t('إدارة الحسابات والأدوار وصلاحيات الوصول')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPasswordOpen(true)}>
              <KeyRound size={15} /> {t('تغيير كلمة المرور')}
            </Button>
            <Button onClick={openCreate}>
              <Plus size={16} /> {t('إضافة مستخدم')}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('إجمالي المستخدمين')} value={total} icon={<UsersIcon size={18} />} />
        <StatCard label={t('مدير النظام')} value={roleCount('ADMIN')} icon={<ShieldCheck size={18} />} tone="violet" />
        <StatCard label={t('مدير مخزن')} value={roleCount('MANAGER') + roleCount('OPERATOR')} icon={<UserCog size={18} />} tone="sky" />
        <StatCard label={t('نشط')} value={users.filter((row) => row.active).length} icon={<Badge tone="green">Active</Badge>} tone="green" />
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            placeholder={t('بحث بالاسم أو البريد الإلكتروني')}
            className="w-full sm:w-80"
          />
          <span className="ms-auto text-xs text-slate-400">
            {total} {t('مستخدم')}
          </span>
        </div>

        <DataTable
          headers={[t('الاسم'), t('البريد الإلكتروني'), t('الدور'), t('الهاتف'), t('الحالة'), t('آخر دخول'), t('الإجراءات')]}
          loading={listQuery.isLoading}
          rowCount={users.length}
        >
          {users.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50/70">
              <td className="px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-[10px] font-extrabold text-brand-800">
                    {row.name
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {row.name}
                      {row.id === user?.id ? <span className="ms-1 text-[10px] text-brand-600">({t('أنت')})</span> : null}
                    </p>
                    <p className="text-[10px] text-slate-400">{row.createdAt ? date(row.createdAt, lang) : ''}</p>
                  </div>
                </div>
              </td>
              <td className="px-3.5 py-2.5">
                <span className="flex items-center gap-1 text-[11px] text-slate-600" dir="ltr">
                  <Mail size={11} className="text-slate-400" /> {row.email}
                </span>
              </td>
              <td className="px-3.5 py-2.5">
                <Badge tone={ROLE_TONES[row.role]}>{t(ROLE_LABELS[row.role])}</Badge>
              </td>
              <td className="px-3.5 py-2.5">
                {row.phone ? (
                  <span className="flex items-center gap-1 text-[11px] text-slate-600" dir="ltr">
                    <Phone size={11} className="text-slate-400" /> {row.phone}
                  </span>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </td>
              <td className="px-3.5 py-2.5">
                <Badge tone={row.active ? 'green' : 'slate'}>{row.active ? t('نشط') : t('غير نشط')}</Badge>
              </td>
              <td className="px-3.5 py-2.5 text-[11px] text-slate-400">
                {row.lastLoginAt ? timeAgo(row.lastLoginAt, lang) : '—'}
              </td>
              <td className="px-3.5 py-2.5">
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
                    {t('تعديل')}
                  </Button>
                  {row.id !== user?.id ? (
                    row.active ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deactivateMutation.mutate(row.id)}
                        loading={deactivateMutation.isPending}
                      >
                        {t('تعطيل')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => activateMutation.mutate(row.id)}>
                        {t('تنشيط')}
                      </Button>
                    )
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
        title={editing ? t('تعديل المستخدم') : t('إضافة مستخدم')}
        subtitle={t('حدد الدور والبيانات الأساسية')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={form.name.trim().length < 2 || !form.email.includes('@') || (!editing && form.password.length < 8)}
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
            <Field label={t('البريد الإلكتروني')} required>
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                dir="ltr"
              />
            </Field>
            <Field label={t('الدور')} required>
              <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
                {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                  <option key={role} value={role}>
                    {t(ROLE_LABELS[role])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('الهاتف')}>
              <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} dir="ltr" />
            </Field>
            <Field
              label={t('كلمة المرور')}
              required={!editing}
              hint={editing ? t('اتركها فارغة لعدم التغيير') : t('8 أحرف على الأقل')}
            >
              <Input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                dir="ltr"
                autoComplete="new-password"
              />
            </Field>
            <div className="flex items-end pb-2">
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
          </div>

          <Alert tone="info">
            <b>{t('الدور')}:</b> {t('مدير النظام')} = {t('كامل')} · {t('مدير مخزن')} = {t('إدارة')} · {t('موظف مخزن')} ={' '}
            {t('كتابة')} · {t('مشاهد')} = {t('قراءة فقط')}
          </Alert>
        </div>
      </Modal>

      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title={t('تغيير كلمة المرور')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasswordOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => passwordMutation.mutate()}
              loading={passwordMutation.isPending}
              disabled={!currentPassword || newPassword.length < 8}
            >
              {t('حفظ')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('كلمة المرور الحالية')} required>
            <Input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              dir="ltr"
              autoComplete="current-password"
            />
          </Field>
          <Field label={t('كلمة المرور الجديدة')} required hint={t('8 أحرف على الأقل')}>
            <Input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              dir="ltr"
              autoComplete="new-password"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
