import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Save,
  ScanLine,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Input,
  KeyValue,
  Modal,
  PageHeader,
  Spinner,
  StatCard,
  StatusBadge,
} from '../components/ui'
import { ScanInput } from '../components/ScanInput'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { dateTime, num, qty } from '../lib/format'
import type { CycleCount, CycleCountLine } from '../lib/types'

export default function CountDetail() {
  const { id = '' } = useParams()
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [values, setValues] = useState<Record<string, string>>({})
  const [loadedId, setLoadedId] = useState('')
  const [scan, setScan] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'warning' | 'danger'>('success')
  const [quickLine, setQuickLine] = useState<CycleCountLine | null>(null)
  const [quickValue, setQuickValue] = useState('')

  const { data: count, isLoading, refetch } = useQuery({
    queryKey: ['cycle-count', id],
    queryFn: () => api.get<CycleCount>(`/api/cycle-counts/${id}`),
    enabled: Boolean(id),
  })

  useEffect(() => {
    if (!count || loadedId === count.id) return
    const initial: Record<string, string> = {}
    for (const line of count.lines || []) {
      initial[line.id] = line.countedQty === null || line.countedQty === undefined ? '' : String(line.countedQty)
    }
    setValues(initial)
    setLoadedId(count.id)
  }, [count, loadedId])

  const lines = count?.lines || []
  const isOpen = count?.status === 'OPEN'

  const stats = useMemo(() => {
    let counted = 0
    let varianceLines = 0
    let varianceUnits = 0
    for (const line of lines) {
      const raw = values[line.id]
      if (raw === undefined || raw === '') continue
      counted++
      const variance = Number(raw) - line.expectedQty
      if (Math.abs(variance) > 0.0001) {
        varianceLines++
        varianceUnits += Math.abs(variance)
      }
    }
    const expected = lines.reduce((sum, line) => sum + line.expectedQty, 0)
    const accuracy = expected > 0 ? Math.max(0, (1 - varianceUnits / expected) * 100) : 100
    return { counted, varianceLines, varianceUnits, accuracy }
  }, [lines, values])

  const changedLines = () =>
    lines
      .filter((line) => values[line.id] !== undefined && values[line.id] !== '')
      .map((line) => ({ lineId: line.id, countedQty: Number(values[line.id]) }))

  const saveMutation = useMutation({
    mutationFn: () => api.patch(`/api/cycle-counts/${id}/lines`, { lines: changedLines() }),
    onSuccess: () => {
      toast.push(t('تم حفظ الكميات المجرودة'))
      queryClient.invalidateQueries({ queryKey: ['cycle-count', id] })
      queryClient.invalidateQueries({ queryKey: ['cycle-counts'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = changedLines()
      if (payload.length) await api.patch(`/api/cycle-counts/${id}/lines`, { lines: payload })
      return api.post<CycleCount>(`/api/cycle-counts/${id}/submit`)
    },
    onSuccess: () => {
      toast.push(t('تم اعتماد الجرد'))
      queryClient.invalidateQueries({ queryKey: ['cycle-count', id] })
      queryClient.invalidateQueries({ queryKey: ['cycle-counts'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/api/cycle-counts/${id}/cancel`),
    onSuccess: () => {
      toast.push(t('تم إلغاء الجرد'))
      refetch()
      queryClient.invalidateQueries({ queryKey: ['cycle-counts'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const onScan = (code: string) => {
    const clean = code.trim().toLowerCase()
    const line = lines.find(
      (candidate) =>
        candidate.item?.barcode?.toLowerCase() === clean ||
        candidate.item?.sku?.toLowerCase() === clean ||
        candidate.location?.barcode?.toLowerCase() === clean ||
        candidate.location?.code?.toLowerCase() === clean,
    )
    if (!line) {
      setMessage(`${t('لا يوجد سطر مطابق في هذا الجرد')}: ${code}`)
      setMessageTone('warning')
      setScan('')
      return
    }
    setQuickLine(line)
    setQuickValue(values[line.id] ?? '')
    setMessage('')
    setScan('')
  }

  const applyQuick = () => {
    if (!quickLine) return
    setValues((current) => ({ ...current, [quickLine.id]: quickValue }))
    setMessage(
      `${quickLine.item?.name} · ${quickLine.location?.code} — ${t('الكمية المجرودة')} ${qty(Number(quickValue) || 0)}`,
    )
    setMessageTone('success')
    setQuickLine(null)
    setQuickValue('')
  }

  if (isLoading) return <Spinner label={t('جاري التحميل...')} />
  if (!count) return <p className="text-sm text-slate-500">{t('الجرد غير موجود')}</p>

  return (
    <div>
      <Link to="/counts" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700">
        <ArrowRight size={14} /> {t('الجرد')}
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{count.number}</span>
            <StatusBadge status={count.status} />
            <Badge tone="brand">
              {count.scope === 'LOCATION' ? t('جرد موقع') : count.scope === 'ITEM' ? t('جرد صنف') : t('جرد مخزن كامل')}
            </Badge>
          </span>
        }
        subtitle={`${count.warehouse?.name || ''} · ${lines.length} ${t('سطر')}${count.createdByName ? ` · ${count.createdByName}` : ''}`}
        actions={
          isOpen && can('MANAGER', 'OPERATOR') ? (
            <>
              <Button
                variant="secondary"
                onClick={() => saveMutation.mutate()}
                loading={saveMutation.isPending}
                disabled={stats.counted === 0}
              >
                <Save size={15} /> {t('حفظ التغييرات')}
              </Button>
              <Button
                onClick={() => submitMutation.mutate()}
                loading={submitMutation.isPending}
                disabled={stats.counted === 0}
              >
                <CheckCircle2 size={16} /> {t('اعتماد الجرد')}
              </Button>
              <Button variant="danger" onClick={() => cancelMutation.mutate()} loading={cancelMutation.isPending}>
                <XCircle size={15} /> {t('إلغاء')}
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('أسطر الجرد')} value={lines.length} icon={<ClipboardCheck size={18} />} />
        <StatCard label={t('المتبقي للجرد')} value={lines.length - stats.counted} icon={<MapPin size={18} />} tone="amber" />
        <StatCard
          label={t('الفرق')}
          value={qty(stats.varianceUnits)}
          hint={`${stats.varianceLines} ${t('سطر')}`}
          icon={<TriangleAlert size={18} />}
          tone="rose"
        />
        <StatCard label={t('دقة الجرد')} value={`${num(stats.accuracy, 2)}%`} icon={<CheckCircle2 size={18} />} tone="green" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card>
          <div className="space-y-2 border-b border-slate-100 p-4">
            {isOpen ? (
              <ScanInput
                value={scan}
                onChange={setScan}
                onScan={onScan}
                placeholder={t('مسح الموقع أو الصنف')}
                disabled={!can('MANAGER', 'OPERATOR')}
              />
            ) : null}
            {message ? <Alert tone={messageTone}>{message}</Alert> : null}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <ScanLine size={13} />
              {t('امسح باركود الصنف أو الموقع لإدخال الكمية المجرودة بسرعة')}
            </div>
          </div>

          <DataTable
            headers={[
              t('الموقع'),
              t('الصنف'),
              t('الدفعة'),
              t('الكمية المتوقعة'),
              t('الكمية المجرودة'),
              t('الفرق'),
            ]}
            rowCount={lines.length}
          >
            {lines.map((line) => {
              const raw = values[line.id] ?? ''
              const variance = raw === '' ? null : Number(raw) - line.expectedQty
              return (
                <tr key={line.id} className="hover:bg-slate-50/70">
                  <td className="px-3.5 py-2.5">
                    <span className="flex items-center gap-1 font-mono text-xs font-bold text-slate-800">
                      <MapPin size={12} className="text-brand-500" />
                      {line.location?.code || '—'}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <p className="text-xs font-bold text-slate-700">{line.item?.name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{line.item?.sku}</p>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">{line.lot?.code || '—'}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-600">{qty(line.expectedQty)}</td>
                  <td className="px-3.5 py-2.5">
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={raw}
                      disabled={!isOpen || !can('MANAGER', 'OPERATOR')}
                      onChange={(event) => setValues((current) => ({ ...current, [line.id]: event.target.value }))}
                      placeholder={t('لم يُجرد')}
                      className="h-8 w-28 text-xs"
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    {variance === null ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : Math.abs(variance) < 0.0001 ? (
                      <Badge tone="green">0</Badge>
                    ) : (
                      <Badge tone={variance > 0 ? 'sky' : 'rose'}>
                        {variance > 0 ? '+' : ''}
                        {qty(variance)}
                      </Badge>
                    )}
                  </td>
                </tr>
              )
            })}
          </DataTable>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('تفاصيل الجرد')} />
            <div className="p-3">
              <KeyValue label={t('المخزن')} value={count.warehouse?.name || '—'} />
              <KeyValue label={t('النطاق')} value={count.scope === 'ITEM' ? t('جرد صنف') : count.scope === 'LOCATION' ? t('جرد موقع') : t('جرد مخزن كامل')} />
              <KeyValue label={t('التاريخ')} value={dateTime(count.createdAt, lang)} />
              <KeyValue label={t('تم الاعتماد')} value={count.completedAt ? dateTime(count.completedAt, lang) : '—'} />
              <KeyValue label={t('الأسطر')} value={lines.length} />
              <KeyValue label={t('تم جردها')} value={stats.counted} />
            </div>
          </Card>

          <Alert tone={isOpen ? 'info' : 'success'}>
            {isOpen
              ? t('أدخل الكمية الفعلية لكل سطر. الأسطر الفارغة لن تُعدّل عند الاعتماد.')
              : t('تم اعتماد هذا الجرد وتسوية الفروقات في المخزون.')}
          </Alert>

          {count.notes ? (
            <Card>
              <CardHeader title={t('ملاحظات')} />
              <p className="px-3.5 py-3 text-xs leading-6 text-slate-500">{count.notes}</p>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal
        open={Boolean(quickLine)}
        onClose={() => setQuickLine(null)}
        title={t('الكمية المجرودة')}
        subtitle={quickLine ? `${quickLine.item?.name} · ${quickLine.location?.code}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setQuickLine(null)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={applyQuick} disabled={quickValue === ''}>
              {t('تأكيد')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
            <span className="text-slate-500">{t('الكمية المتوقعة')}</span>
            <b className="text-slate-800">{qty(quickLine?.expectedQty || 0)}</b>
          </div>
          <Input
            type="number"
            min="0"
            step="0.001"
            value={quickValue}
            onChange={(event) => setQuickValue(event.target.value)}
            autoFocus
            className="h-12 text-lg font-bold"
            placeholder={t('الكمية المجرودة')}
          />
          <div className="grid grid-cols-3 gap-2">
            {[0, Number(quickLine?.expectedQty || 0), Number(quickLine?.expectedQty || 0) + 1].map((preset, index) => (
              <Button key={index} variant="secondary" size="sm" onClick={() => setQuickValue(String(preset))}>
                {index === 0 ? '0' : qty(preset)}
              </Button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  )
}
