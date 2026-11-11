import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  Copy,
  KeyRound,
  Link2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Field,
  IconButton,
  Input,
  KeyValue,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Tabs,
  Textarea,
} from '../components/ui'
import { api, queryString } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { dateTime, timeAgo } from '../lib/format'
import type { ApiToken, WebhookEndpoint } from '../lib/types'

type Delivery = {
  id: string
  event: string
  status: string
  attempts: number
  responseStatus?: number | null
  responseBody?: string | null
  error?: string | null
  createdAt: string
  deliveredAt?: string | null
}

const SCOPES = [
  { id: '*', label: 'كامل', hint: 'كل الصلاحيات' },
  { id: 'manage', label: 'إدارة', hint: 'كل شيء عدا مفاتيح API' },
  { id: 'write', label: 'كتابة', hint: 'إنشاء وتعديل العمليات' },
  { id: 'read', label: 'قراءة فقط', hint: 'استعلامات فقط' },
]

const EVENTS = [
  '*',
  'receipt.posted',
  'invoice.created',
  'transfer.dispatched',
  'transfer.received',
  'cycle_count.completed',
  'putaway.confirmed',
]

export default function Integrations() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const isAdmin = can('ADMIN')

  const [tab, setTab] = useState('tokens')
  const [tokenOpen, setTokenOpen] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [tokenScope, setTokenScope] = useState('read')
  const [newToken, setNewToken] = useState<ApiToken | null>(null)
  const [copied, setCopied] = useState(false)

  const [webhookOpen, setWebhookOpen] = useState(false)
  const [webhookName, setWebhookName] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookEvents, setWebhookEvents] = useState('*')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [formError, setFormError] = useState('')

  const [deliveryTarget, setDeliveryTarget] = useState<WebhookEndpoint | null>(null)

  const tokensQuery = useQuery({
    queryKey: ['tokens'],
    queryFn: () => api.get<ApiToken[]>('/api/tokens'),
    enabled: isAdmin,
  })
  const webhooksQuery = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get<WebhookEndpoint[]>('/api/webhooks'),
  })
  const deliveriesQuery = useQuery({
    queryKey: ['webhook-deliveries', deliveryTarget?.id],
    queryFn: () =>
      api.get<{ items: Delivery[] }>(
        `/api/webhooks/${deliveryTarget?.id}/deliveries${queryString({ page: 1, pageSize: 50 })}`,
      ),
    enabled: Boolean(deliveryTarget),
  })

  const createTokenMutation = useMutation({
    mutationFn: () => api.post<ApiToken>('/api/tokens', { name: tokenName, scopes: tokenScope }),
    onSuccess: (token) => {
      setNewToken(token)
      setTokenOpen(false)
      setTokenName('')
      setTokenScope('read')
      queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const deleteTokenMutation = useMutation({
    mutationFn: (id: string) => api.del(`/api/tokens/${id}`),
    onSuccess: () => {
      toast.push(t('تم حذف المفتاح'))
      queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const createWebhookMutation = useMutation({
    mutationFn: () =>
      api.post<WebhookEndpoint>('/api/webhooks', {
        name: webhookName,
        url: webhookUrl,
        events: webhookEvents,
        secret: webhookSecret || undefined,
      }),
    onSuccess: () => {
      toast.push(t('تمت الإضافة'))
      setWebhookOpen(false)
      setWebhookName('')
      setWebhookUrl('')
      setWebhookEvents('*')
      setWebhookSecret('')
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const toggleWebhookMutation = useMutation({
    mutationFn: (endpoint: WebhookEndpoint) => api.patch(`/api/webhooks/${endpoint.id}`, { active: !endpoint.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const deleteWebhookMutation = useMutation({
    mutationFn: (id: string) => api.del(`/api/webhooks/${id}`),
    onSuccess: () => {
      toast.push(t('تم الحذف'))
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const testMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ ok: boolean; status?: number; error?: string }>(`/api/webhooks/${id}/test`),
    onSuccess: (result) => {
      toast.push(result.ok ? `${t('تم الاختبار')} (${result.status || 200})` : result.error || t('فشل'), result.ok ? 'success' : 'error')
      queryClient.invalidateQueries({ queryKey: ['webhook-deliveries'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/webhooks/deliveries/${id}/retry`),
    onSuccess: () => {
      toast.push(t('تمت إعادة المحاولة'))
      queryClient.invalidateQueries({ queryKey: ['webhook-deliveries'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const copy = (value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }

  const tokens = tokensQuery.data || []
  const webhooks = webhooksQuery.data || []

  const apiBase = `${window.location.origin}/api`

  return (
    <div>
      <PageHeader
        title={t('التكاملات')}
        subtitle={t('مفاتيح API و Webhooks للربط مع الأنظمة الخارجية')}
        actions={
          isAdmin && tab === 'tokens' ? (
            <Button onClick={() => setTokenOpen(true)}>
              <Plus size={16} /> {t('إنشاء مفتاح')}
            </Button>
          ) : isAdmin && tab === 'webhooks' ? (
            <Button onClick={() => setWebhookOpen(true)}>
              <Plus size={16} /> {t('إضافة Webhook')}
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('مفاتيح API')} value={tokens.length} icon={<KeyRound size={18} />} />
        <StatCard label={t('Webhooks')} value={webhooks.length} icon={<Webhook size={18} />} tone="sky" />
        <StatCard label={t('نشط')} value={webhooks.filter((endpoint) => endpoint.active).length} icon={<Send size={18} />} tone="green" />
        <StatCard
          label={t('سجل الإرسال')}
          value={webhooks.reduce((sum, endpoint) => sum + (endpoint._count?.deliveries || 0), 0)}
          icon={<Link2 size={18} />}
          tone="violet"
        />
      </div>

      <Card className="mt-4">
        <div className="px-3 pt-1">
          <Tabs
            tabs={[
              { id: 'tokens', label: t('مفاتيح API'), count: tokens.length },
              { id: 'webhooks', label: 'Webhooks', count: webhooks.length },
              { id: 'docs', label: t('مستندات API') },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>

        {tab === 'tokens' ? (
          isAdmin ? (
            <DataTable
              headers={[t('الاسم'), t('مفتاح API'), t('صلاحيات المفتاح'), t('آخر استخدام'), t('الحالة'), t('الإجراءات')]}
              loading={tokensQuery.isLoading}
              rowCount={tokens.length}
            >
              {tokens.map((token) => (
                <tr key={token.id} className="hover:bg-slate-50/70">
                  <td className="px-3.5 py-2.5 text-xs font-bold text-slate-800">{token.name}</td>
                  <td className="px-3.5 py-2.5">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                      {token.prefix}••••••
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Badge tone={token.scopes === '*' ? 'violet' : token.scopes === 'write' ? 'amber' : 'sky'}>
                      {token.scopes === '*' ? t('كامل') : token.scopes === 'manage' ? t('إدارة') : token.scopes === 'write' ? t('كتابة') : t('قراءة فقط')}
                    </Badge>
                  </td>
                  <td className="px-3.5 py-2.5 text-[11px] text-slate-400">
                    {token.lastUsedAt ? timeAgo(token.lastUsedAt, lang) : '—'}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Badge tone={token.active ? 'green' : 'slate'}>{token.active ? t('نشط') : t('غير نشط')}</Badge>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <IconButton
                      className="hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => {
                        if (window.confirm(`${t('حذف')} ${token.name}؟`)) deleteTokenMutation.mutate(token.id)
                      }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <div className="p-4">
              <Alert tone="warning">{t('إدارة مفاتيح API متاحة لمدير النظام فقط.')}</Alert>
            </div>
          )
        ) : null}

        {tab === 'webhooks' ? (
          <DataTable
            headers={['Webhook', t('الرابط'), t('الأحداث'), t('سجل الإرسال'), t('الحالة'), t('الإجراءات')]}
            loading={webhooksQuery.isLoading}
            rowCount={webhooks.length}
          >
            {webhooks.map((endpoint) => (
              <tr key={endpoint.id} className="hover:bg-slate-50/70">
                <td className="px-3.5 py-2.5">
                  <p className="text-xs font-bold text-slate-800">{endpoint.name}</p>
                  <p className="text-[10px] text-slate-400">{dateTime(endpoint.createdAt, lang)}</p>
                </td>
                <td className="max-w-64 px-3.5 py-2.5">
                  <p className="truncate font-mono text-[10px] text-slate-500" dir="ltr">
                    {endpoint.url}
                  </p>
                </td>
                <td className="px-3.5 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {endpoint.events.split(',').map((event) => (
                      <Badge key={event} tone={event === '*' ? 'violet' : 'slate'}>
                        {event}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-3.5 py-2.5">
                  <button
                    className="text-xs font-bold text-brand-700 hover:underline"
                    onClick={() => setDeliveryTarget(endpoint)}
                  >
                    {endpoint._count?.deliveries || 0} {t('سجل')}
                  </button>
                </td>
                <td className="px-3.5 py-2.5">
                  <Badge tone={endpoint.active ? 'green' : 'slate'}>{endpoint.active ? t('نشط') : t('غير نشط')}</Badge>
                </td>
                <td className="px-3.5 py-2.5">
                  {isAdmin ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button size="sm" variant="secondary" onClick={() => testMutation.mutate(endpoint.id)} loading={testMutation.isPending}>
                        <Send size={12} /> {t('اختبار')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleWebhookMutation.mutate(endpoint)}>
                        {endpoint.active ? t('تعطيل') : t('تنشيط')}
                      </Button>
                      <IconButton
                        className="hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => {
                          if (window.confirm(`${t('حذف')} ${endpoint.name}؟`)) deleteWebhookMutation.mutate(endpoint.id)
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : null}

        {tab === 'docs' ? (
          <div className="space-y-4 p-4">
            <Alert tone="info">
              {t('استخدم مفتاح API في ترويسة Authorization. كل الطلبات تُرجع JSON.')}
            </Alert>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="REST API" subtitle={`Base URL: ${apiBase}`} />
                <pre dir="ltr" className="overflow-x-auto rounded-b-2xl bg-slate-950 p-4 text-[11px] leading-6 text-emerald-200">
{`curl -H "Authorization: Bearer stg_xxx" \\
  ${apiBase}/items?pageSize=10

curl -X POST \\
  -H "Authorization: Bearer stg_xxx" \\
  -H "Content-Type: application/json" \\
  -H "X-Op-Id: 3f9c-..." \\
  -d '{"itemId":"...","locationId":"...","qty":5}' \\
  ${apiBase}/inventory/adjust`}
                </pre>
              </Card>
              <Card>
                <CardHeader title="Webhook payload" subtitle="X-Storege-Signature: HMAC-SHA256" />
                <pre dir="ltr" className="overflow-x-auto rounded-b-2xl bg-slate-950 p-4 text-[11px] leading-6 text-sky-200">
{`POST https://your-app.com/hooks/storege
{
  "event": "receipt.posted",
  "timestamp": "2026-01-01T10:00:00.000Z",
  "data": {
    "receiptNumber": "GRN-2026-00001",
    "poNumber": "PO-2026-00004",
    "supplier": "مورد",
    "lines": [...]
  }
}`}
                </pre>
              </Card>
            </div>
            <Card>
              <CardHeader title={t('نقاط النهاية الرئيسية')} />
              <div className="grid gap-x-6 gap-y-1 p-4 text-[11px] sm:grid-cols-2">
                {[
                  ['GET', '/api/items'],
                  ['GET', '/api/inventory'],
                  ['POST', '/api/inventory/adjust'],
                  ['POST', '/api/inventory/move'],
                  ['GET', '/api/purchase-orders'],
                  ['POST', '/api/purchase-orders/:id/receive'],
                  ['GET', '/api/sales-orders'],
                  ['POST', '/api/sales-orders/:id/allocate'],
                  ['POST', '/api/sales-orders/:id/pick'],
                  ['POST', '/api/sales-orders/:id/ship'],
                  ['GET', '/api/transfers'],
                  ['GET', '/api/cycle-counts'],
                  ['GET', '/api/invoices'],
                  ['GET', '/api/reports/stock-valuation'],
                  ['GET', '/api/audit'],
                  ['GET', '/api/system/info'],
                ].map(([method, path]) => (
                  <div key={path} className="flex items-center gap-2 border-b border-slate-100 py-1.5">
                    <span className={`w-12 rounded px-1 py-0.5 text-center font-mono text-[9px] font-bold ${
                      method === 'GET' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {method}
                    </span>
                    <span className="font-mono text-slate-600" dir="ltr">{path}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : null}
      </Card>

      <Modal
        open={tokenOpen}
        onClose={() => setTokenOpen(false)}
        title={t('إنشاء مفتاح')}
        subtitle={t('سيظهر المفتاح مرة واحدة فقط بعد الإنشاء')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTokenOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={() => createTokenMutation.mutate()} loading={createTokenMutation.isPending} disabled={!tokenName.trim()}>
              {t('إنشاء مفتاح')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('الاسم')} required>
            <Input value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="ERP Integration" />
          </Field>
          <Field label={t('صلاحيات المفتاح')}>
            <Select value={tokenScope} onChange={(event) => setTokenScope(event.target.value)}>
              {SCOPES.map((scope) => (
                <option key={scope.id} value={scope.id}>
                  {t(scope.label)} — {t(scope.hint)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(newToken)}
        onClose={() => setNewToken(null)}
        title={t('مفتاح API')}
        subtitle={t('احتفظ بالمفتاح الآن، لن يظهر مرة أخرى')}
        footer={
          <Button variant="secondary" onClick={() => setNewToken(null)}>
            {t('إتمام')}
          </Button>
        }
      >
        <div className="space-y-3">
          <Alert tone="warning">{t('احتفظ بالمفتاح الآن، لن يظهر مرة أخرى')}</Alert>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
            <code className="flex-1 break-all font-mono text-[11px] text-slate-700" dir="ltr">
              {newToken?.token || ''}
            </code>
            <Button size="sm" variant="secondary" onClick={() => copy(newToken?.token || '')}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? t('تم النسخ') : t('نسخ المفتاح')}
            </Button>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <KeyValue label={t('الاسم')} value={newToken?.name || '—'} />
            <KeyValue label={t('صلاحيات المفتاح')} value={newToken?.scopes || '—'} />
          </div>
        </div>
      </Modal>

      <Modal
        open={webhookOpen}
        onClose={() => setWebhookOpen(false)}
        title={t('إضافة Webhook')}
        subtitle={t('سيتم إرسال الأحداث إلى الرابط المحدد مع توقيع HMAC')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setWebhookOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => createWebhookMutation.mutate()}
              loading={createWebhookMutation.isPending}
              disabled={!webhookName.trim() || !webhookUrl.startsWith('http')}
            >
              {t('إضافة')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Field label={t('الاسم')} required>
            <Input value={webhookName} onChange={(event) => setWebhookName(event.target.value)} placeholder="ERP Hook" />
          </Field>
          <Field label={t('الرابط')} required>
            <Input
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://example.com/hooks/storege"
              dir="ltr"
            />
          </Field>
          <Field label={t('الأحداث')} hint={t('افصل بين الأحداث بفاصلة أو استخدم * للكل')}>
            <Input value={webhookEvents} onChange={(event) => setWebhookEvents(event.target.value)} dir="ltr" />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {EVENTS.map((event) => (
              <button
                key={event}
                onClick={() => setWebhookEvents(event)}
                className="rounded-lg border border-slate-200 px-2 py-1 font-mono text-[10px] text-slate-500 hover:bg-slate-50"
              >
                {event}
              </button>
            ))}
          </div>
          <Field label={t('السر')} hint={t('اختياري — يُولّد تلقائيًا')}>
            <Input value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} dir="ltr" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(deliveryTarget)}
        onClose={() => setDeliveryTarget(null)}
        title={t('سجل الإرسال')}
        subtitle={deliveryTarget?.url}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeliveryTarget(null)}>
              {t('إغلاق')}
            </Button>
            <Button variant="secondary" onClick={() => deliveriesQuery.refetch()} loading={deliveriesQuery.isFetching}>
              <RefreshCw size={14} /> {t('تحديث')}
            </Button>
          </>
        }
      >
        {deliveriesQuery.isLoading ? (
          <Spinner />
        ) : (deliveriesQuery.data?.items || []).length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">{t('لا توجد بيانات')}</p>
        ) : (
          <div className="space-y-2">
            {(deliveriesQuery.data?.items || []).map((delivery) => (
              <div key={delivery.id} className="rounded-xl border border-slate-100 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-[11px] font-bold text-slate-700">{delivery.event}</p>
                    <p className="text-[10px] text-slate-400">{dateTime(delivery.createdAt, lang)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={delivery.status === 'SUCCESS' ? 'green' : delivery.status === 'FAILED' ? 'rose' : 'amber'}>
                      {delivery.status}
                    </Badge>
                    <span className="text-[10px] text-slate-400">
                      {t('محاولات')} {delivery.attempts}
                    </span>
                    {isAdmin && delivery.status !== 'SUCCESS' ? (
                      <Button size="sm" variant="ghost" onClick={() => retryMutation.mutate(delivery.id)}>
                        <RefreshCw size={12} /> {t('إعادة المحاولة')}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {delivery.responseStatus || delivery.error ? (
                  <p className="mt-1 text-[10px] text-slate-400">
                    {delivery.responseStatus ? `HTTP ${delivery.responseStatus}` : ''}{' '}
                    {delivery.error || ''}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
