import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Download, Eye, Filter, Search } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatCard,
} from '../components/ui'
import { api, downloadFile, queryString } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { dateTime } from '../lib/format'
import type { AuditLog, ListResponse, UserRow } from '../lib/types'

const ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'RECEIVE',
  'PICK',
  'PACK',
  'SHIP',
  'ADJUST',
  'PUTAWAY',
  'DISPATCH',
  'CANCEL',
  'SUBMIT',
  'PAY',
  'LOGIN',
  'CHANGE_PASSWORD',
  'DEACTIVATE',
]

const ENTITIES = [
  'Item',
  'Warehouse',
  'Location',
  'PurchaseOrder',
  'Receipt',
  'SalesOrder',
  'Shipment',
  'Transfer',
  'CycleCount',
  'Invoice',
  'Supplier',
  'Customer',
  'User',
  'Setting',
  'ApiToken',
  'WebhookEndpoint',
]

const ACTION_TONES: Record<string, 'green' | 'rose' | 'amber' | 'sky' | 'brand' | 'slate' | 'violet'> = {
  CREATE: 'green',
  UPDATE: 'sky',
  DELETE: 'rose',
  RECEIVE: 'green',
  PICK: 'amber',
  SHIP: 'brand',
  ADJUST: 'violet',
  CANCEL: 'rose',
  LOGIN: 'slate',
}

export default function Audit() {
  const { t, lang } = useI18n()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [userId, setUserId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [detail, setDetail] = useState<AuditLog | null>(null)

  const logsQuery = useQuery({
    queryKey: ['audit', { page, search, entity, action, userId, from, to }],
    queryFn: () =>
      api.get<ListResponse<AuditLog>>(
        `/api/audit${queryString({ page, pageSize: 25, q: search, entity, action, userId, from, to })}`,
      ),
  })
  const usersQuery = useQuery({
    queryKey: ['users-lookup'],
    queryFn: () => api.get<ListResponse<UserRow>>('/api/users?pageSize=100'),
  })

  const logs = logsQuery.data?.items || []
  const total = logsQuery.data?.total || 0

  const formatDetails = (details?: string | null) => {
    if (!details) return '—'
    try {
      return JSON.stringify(JSON.parse(details), null, 2)
    } catch {
      return details
    }
  }

  return (
    <div>
      <PageHeader
        title={t('سجل النشاط')}
        subtitle={t('تتبع كل عمليات المستخدمين على النظام')}
        actions={
          <Button
            variant="secondary"
            onClick={() => downloadFile('/api/audit/export.csv', 'storege-audit.csv')}
          >
            <Download size={15} /> {t('تصدير السجل')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('إجمالي الأحداث')} value={total} icon={<Activity size={18} />} />
        <StatCard label={t('أحداث اليوم')} value={logs.filter((log) => new Date(log.createdAt).toDateString() === new Date().toDateString()).length} icon={<Activity size={18} />} tone="green" />
        <StatCard label={t('مستخدمون')} value={new Set(logs.map((log) => log.userId).filter(Boolean)).size} icon={<Filter size={18} />} tone="sky" />
        <StatCard label={t('أنواع الكيانات')} value={new Set(logs.map((log) => log.entity)).size} icon={<Search size={18} />} tone="violet" />
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            placeholder={t('بحث بالمستخدم أو الإجراء أو التفاصيل')}
            className="w-full sm:w-72"
          />
          <Select
            value={action}
            onChange={(event) => {
              setAction(event.target.value)
              setPage(1)
            }}
            className="w-auto min-w-32"
          >
            <option value="">{t('كل الإجراءات')}</option>
            {ACTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select
            value={entity}
            onChange={(event) => {
              setEntity(event.target.value)
              setPage(1)
            }}
            className="w-auto min-w-32"
          >
            <option value="">{t('كل الكيانات')}</option>
            {ENTITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value)
              setPage(1)
            }}
            className="w-auto min-w-36"
          >
            <option value="">{t('كل المستخدمين')}</option>
            {(usersQuery.data?.items || []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
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
            t('التاريخ'),
            t('المستخدم'),
            t('الإجراء'),
            t('الكيان'),
            t('التفاصيل'),
            'IP',
            '',
          ]}
          loading={logsQuery.isLoading}
          rowCount={logs.length}
        >
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-slate-50/70">
              <td className="whitespace-nowrap px-3.5 py-2.5 text-[11px] text-slate-400">
                {dateTime(log.createdAt, lang)}
              </td>
              <td className="px-3.5 py-2.5 text-xs font-bold text-slate-700">{log.userName || '—'}</td>
              <td className="px-3.5 py-2.5">
                <Badge tone={ACTION_TONES[log.action] || 'slate'}>{log.action}</Badge>
              </td>
              <td className="px-3.5 py-2.5">
                <p className="text-xs text-slate-600">{log.entity}</p>
                {log.entityId ? (
                  <p className="max-w-24 truncate font-mono text-[9px] text-slate-400">{log.entityId}</p>
                ) : null}
              </td>
              <td className="max-w-64 px-3.5 py-2.5">
                <p className="truncate font-mono text-[10px] text-slate-400">{log.details || '—'}</p>
              </td>
              <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-[10px] text-slate-400">{log.ip || '—'}</td>
              <td className="px-3.5 py-2.5">
                {log.details ? (
                  <Button size="sm" variant="ghost" onClick={() => setDetail(log)}>
                    <Eye size={13} /> {t('عرض')}
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </DataTable>
        <Pagination page={page} pageSize={25} total={total} onChange={setPage} />
      </Card>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={`${detail?.action || ''} · ${detail?.entity || ''}`}
        subtitle={detail ? dateTime(detail.createdAt, lang) : ''}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setDetail(null)}>
            {t('إغلاق')}
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-[10px] text-slate-400">{t('المستخدم')}</p>
              <p className="font-bold text-slate-700">{detail?.userName || '—'}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <p className="text-[10px] text-slate-400">IP</p>
              <p className="font-mono text-slate-700">{detail?.ip || '—'}</p>
            </div>
          </div>
          {detail?.entityId ? (
            <p className="break-all rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-[10px] text-slate-500">
              {detail.entityId}
            </p>
          ) : null}
          <pre
            dir="ltr"
            className="max-h-80 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-emerald-200"
          >
            {formatDetails(detail?.details)}
          </pre>
        </div>
      </Modal>
    </div>
  )
}
