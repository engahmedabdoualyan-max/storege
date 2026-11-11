import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  MapPin,
  PackageSearch,
  Plus,
} from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  DataTable,
  Field,
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
import type { CycleCount, Item, ListResponse, Location } from '../lib/types'

export default function Counts() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const { warehouseId } = useWarehouse()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [scope, setScope] = useState<'all' | 'location' | 'item'>('all')
  const [locationId, setLocationId] = useState('')
  const [itemId, setItemId] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const listQuery = useQuery({
    queryKey: ['cycle-counts', { page, search, status, warehouseId }],
    queryFn: () =>
      api.get<ListResponse<CycleCount>>(
        `/api/cycle-counts${queryString({ page, pageSize: 20, q: search, status, warehouseId })}`,
      ),
  })
  const locationsQuery = useQuery({
    queryKey: ['locations-all', warehouseId],
    queryFn: () => api.get<Location[]>(`/api/locations?all=1&warehouseId=${warehouseId}`),
    enabled: Boolean(warehouseId),
  })
  const itemsQuery = useQuery({
    queryKey: ['items-lookup'],
    queryFn: () => api.get<ListResponse<Item>>('/api/items?pageSize=200&active=1'),
  })

  const counts = listQuery.data?.items || []
  const total = listQuery.data?.total || 0

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<CycleCount>('/api/cycle-counts', {
        warehouseId,
        locationId: scope === 'location' ? locationId || null : null,
        itemId: scope === 'item' ? itemId || null : null,
        notes: notes || null,
      }),
    onSuccess: (count) => {
      toast.push(`${t('تم إنشاء الجرد')} ${count.number}`)
      setCreateOpen(false)
      setNotes('')
      setScope('all')
      setLocationId('')
      setItemId('')
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['cycle-counts'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const open = counts.filter((count) => count.status === 'OPEN').length
  const completed = counts.filter((count) => count.status === 'COMPLETED').length

  return (
    <div>
      <PageHeader
        title={t('الجرد')}
        subtitle={t('جرد دوري للمواقع والأصناف واعتماد الفروقات')}
        actions={
          can('MANAGER', 'OPERATOR') ? (
            <Button
              onClick={() => {
                setFormError('')
                setCreateOpen(true)
              }}
            >
              <Plus size={16} /> {t('جرد جديد')}
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('إجمالي عمليات الجرد')} value={total} icon={<ClipboardCheck size={18} />} />
        <StatCard label={t('الجرد مفتوح')} value={open} icon={<ClipboardList size={18} />} tone="amber" />
        <StatCard label={t('مكتمل')} value={completed} icon={<CheckCircle2 size={18} />} tone="green" />
        <StatCard
          label={t('أسطر الجرد')}
          value={counts.reduce((sum, count) => sum + (count._count?.lines || count.lines?.length || 0), 0)}
          icon={<PackageSearch size={18} />}
          tone="violet"
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
            placeholder={t('بحث برقم الجرد')}
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
            <option value="OPEN">{t('مفتوح')}</option>
            <option value="COMPLETED">{t('مكتمل')}</option>
            <option value="CANCELLED">{t('ملغي')}</option>
          </Select>
        </div>

        <DataTable
          headers={[
            t('رقم المستند'),
            t('المخزن'),
            t('النطاق'),
            t('الأسطر'),
            t('التاريخ'),
            t('الحالة'),
            t('الإجراءات'),
          ]}
          loading={listQuery.isLoading}
          rowCount={counts.length}
        >
          {counts.map((count) => (
            <tr key={count.id} className="hover:bg-slate-50/70">
              <td className="px-3.5 py-2.5">
                <Link to={`/counts/${count.id}`} className="font-mono text-xs font-bold text-brand-800 hover:underline">
                  {count.number}
                </Link>
              </td>
              <td className="px-3.5 py-2.5 text-xs text-slate-700">{count.warehouse?.name}</td>
              <td className="px-3.5 py-2.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                  {count.locationId ? <MapPin size={12} /> : <PackageSearch size={12} />}
                  {count.locationId ? t('جرد موقع') : count.itemId ? t('جرد صنف') : t('جرد مخزن كامل')}
                </span>
              </td>
              <td className="px-3.5 py-2.5 text-xs text-slate-500">{count._count?.lines || count.lines?.length || 0}</td>
              <td className="px-3.5 py-2.5 text-[11px] text-slate-400">
                {date(count.createdAt, lang)}
                {count.completedAt ? <span className="block text-[10px] text-emerald-600">{dateTime(count.completedAt, lang)}</span> : null}
              </td>
              <td className="px-3.5 py-2.5">
                <StatusBadge status={count.status} />
              </td>
              <td className="px-3.5 py-2.5">
                <Link to={`/counts/${count.id}`}>
                  <Button variant="ghost" size="sm">
                    {count.status === 'OPEN' ? t('بدء الجرد') : t('عرض')} <ArrowLeft size={13} />
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
        <Pagination page={page} pageSize={20} total={total} onChange={setPage} />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('جرد جديد')}
        subtitle={t('اختر نطاق الجرد: المخزن بالكامل، موقع محدد أو صنف محدد')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={
                !warehouseId ||
                (scope === 'location' && !locationId) ||
                (scope === 'item' && !itemId)
              }
            >
              {t('بدء الجرد')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Field label={t('نطاق الجرد')}>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'all', label: t('جرد مخزن كامل') },
                { id: 'location', label: t('جرد موقع') },
                { id: 'item', label: t('جرد صنف') },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setScope(option.id as typeof scope)}
                  className={`rounded-xl border px-2 py-2.5 text-[11px] font-bold transition ${
                    scope === option.id
                      ? 'border-brand-500 bg-brand-50 text-brand-800'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>

          {scope === 'location' ? (
            <Field label={t('الموقع')} required>
              <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">{t('اختر الموقع')}</option>
                {(locationsQuery.data || []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} — {location.name || location.zone?.name || ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {scope === 'item' ? (
            <Field label={t('الصنف')} required>
              <Select value={itemId} onChange={(event) => setItemId(event.target.value)}>
                <option value="">{t('اختر الصنف')}</option>
                {(itemsQuery.data?.items || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} — {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {scope === 'all' ? (
            <Alert tone="info">
              سيتم إنشاء أسطر جرد لكل الأرصدة الحالية في المخزن. استخدم موقعًا محددًا لجرد أسرع.
            </Alert>
          ) : null}

          <Field label={t('ملاحظات')}>
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>

        </div>
      </Modal>
    </div>
  )
}
