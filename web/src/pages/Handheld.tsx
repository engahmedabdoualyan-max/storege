import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  CloudOff,
  Cloud,
  LogOut,
  Monitor,
  PackageCheck,
  PackagePlus,
  PackageSearch,
  RefreshCw,
  ScanLine,
  Smartphone,
  Trash2,
  Warehouse,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { ScanInput } from '../components/ScanInput'
import { Logo } from '../components/Logo'
import { Modal, Spinner, cx } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useWarehouse } from '../lib/warehouse'
import { useToast } from '../lib/toast'
import { qty, timeAgo } from '../lib/format'
import {
  findCached,
  flushQueue,
  getCatalog,
  getQueue,
  offlineMutate,
  queueCount,
  removeQueued,
  saveCatalog,
  type CachedCount,
  type CachedItem,
  type CachedLocation,
  type CachedPO,
  type CachedPutaway,
  type CachedSO,
  type Catalog,
  type QueuedOp,
} from '../lib/offline'

type Mode = 'scan' | 'receive' | 'putaway' | 'pick' | 'count'

const MODES: { id: Mode; label: string; icon: typeof ScanLine }[] = [
  { id: 'scan', label: 'مسح سريع', icon: ScanLine },
  { id: 'receive', label: 'استلام سريع', icon: PackagePlus },
  { id: 'putaway', label: 'تخزين سريع', icon: PackageCheck },
  { id: 'pick', label: 'تجهيز سريع', icon: PackageSearch },
  { id: 'count', label: 'جرد سريع', icon: ClipboardCheck },
]

type Message = { text: string; tone: 'success' | 'warning' | 'danger' }
type ReceiveTarget = { poId: string; line: CachedPO['lines'][number] }
type PickTarget = { soId: string; task: CachedSO['allocations'][number] }
type PutawayTarget = CachedPutaway
type CountTarget = { countId: string; line: CachedCount['lines'][number] }

export default function Handheld() {
  const { t } = useI18n()
  const { user, logout } = useAuth()
  const { warehouseId, warehouses, setWarehouseId } = useWarehouse()
  const toast = useToast()

  const [mode, setMode] = useState<Mode>('scan')
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [queued, setQueued] = useState(0)
  const [syncOpen, setSyncOpen] = useState(false)
  const [queue, setQueue] = useState<QueuedOp[]>([])

  const [scan, setScan] = useState('')
  const [message, setMessage] = useState<Message | null>(null)
  const [scanResult, setScanResult] = useState<
    | { type: 'item'; item: CachedItem }
    | { type: 'location'; location: CachedLocation }
    | { type: 'purchase_order'; purchaseOrder: CachedPO }
    | null
  >(null)

  const [poId, setPoId] = useState('')
  const [soId, setSoId] = useState('')
  const [countId, setCountId] = useState('')

  const [receiveTarget, setReceiveTarget] = useState<ReceiveTarget | null>(null)
  const [receiveQty, setReceiveQty] = useState('')
  const [receiveLot, setReceiveLot] = useState('')

  const [putawayTarget, setPutawayTarget] = useState<PutawayTarget | null>(null)
  const [putawayLocation, setPutawayLocation] = useState('')
  const [putawayQty, setPutawayQty] = useState('')

  const [pickTarget, setPickTarget] = useState<PickTarget | null>(null)
  const [pickQty, setPickQty] = useState('')

  const [countTarget, setCountTarget] = useState<CountTarget | null>(null)
  const [countQty, setCountQty] = useState('')

  const [busy, setBusy] = useState(false)
  const initialized = useRef(false)

  const refreshQueue = async () => {
    try {
      setQueued(await queueCount())
      setQueue(await getQueue())
    } catch {
      setQueued(0)
    }
  }

  const refreshCatalog = async (quiet = false) => {
    if (!navigator.onLine) {
      if (!quiet) toast.push(t('لا يوجد اتصال بالإنترنت — تعمل على البيانات المحفوظة'), 'warning')
      return
    }
    setSaving(true)
    try {
      const next = await saveCatalog(user?.id, warehouseId)
      setCatalog(next)
      await refreshQueue()
      if (!quiet) toast.push(t('تم تحديث البيانات المحفوظة'))
    } catch (error) {
      if (!quiet) toast.push((error as Error).message, 'error')
    } finally {
      setSaving(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    getCatalog(user?.id).then((cached) => {
      if (!active) return
      if (cached) setCatalog({ ...cached, putaway: cached.putaway || [], counts: cached.counts || [] })
      setLoading(false)
    })
    refreshQueue()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    if (navigator.onLine) void refreshCatalog(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, warehouseId])

  useEffect(() => {
    const onOnline = () => {
      setOnline(true)
      void refreshQueue()
    }
    const onOffline = () => setOnline(false)
    const onQueue = () => void refreshQueue()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('storege:queue', onQueue)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('storege:queue', onQueue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setScan('')
    setMessage(null)
    setScanResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const items = catalog?.items || []
  const locations = catalog?.locations || []
  const purchaseOrders = catalog?.purchaseOrders || []
  const salesOrders = catalog?.salesOrders || []
  const putawayRows = catalog?.putaway || []
  const counts = catalog?.counts || []

  const selectedPo = purchaseOrders.find((po) => po.id === poId) || null
  const selectedSo = salesOrders.find((so) => so.id === soId) || null
  const selectedCount = counts.find((count) => count.id === countId) || null

  const pickLocations = useMemo(
    () => locations.filter((location) => location.type === 'PICK'),
    [locations],
  )

  const setCatalogSafe = (next: Catalog | null) => setCatalog(next)

  const matchItem = (code: string): CachedItem | undefined => {
    const clean = code.trim().toLowerCase()
    return items.find(
      (item) => item.barcode?.toLowerCase() === clean || item.sku.toLowerCase() === clean,
    )
  }

  const matchLocation = (code: string): CachedLocation | undefined => {
    const clean = code.trim().toLowerCase()
    return locations.find(
      (location) =>
        location.barcode.toLowerCase() === clean || location.code.toLowerCase() === clean,
    )
  }

  const onScan = (code: string) => {
    const clean = code.trim()
    setScan('')
    if (mode === 'scan') {
      void lookup(clean)
      return
    }
    if (mode === 'receive') {
      if (!selectedPo) {
        const po = purchaseOrders.find((candidate) => candidate.number.toLowerCase() === clean.toLowerCase())
        if (po) {
          setPoId(po.id)
          setMessage({ text: `${t('أمر الشراء')} ${po.number}`, tone: 'success' })
        } else {
          setMessage({ text: `${t('الكود غير موجود')}: ${clean}`, tone: 'warning' })
        }
        return
      }
      const item = matchItem(clean)
      const line = item
        ? selectedPo.lines.find((candidate) => candidate.itemId === item.id && candidate.receivedQty < candidate.qty)
        : selectedPo.lines.find((candidate) => candidate.sku.toLowerCase() === clean.toLowerCase())
      if (!line) {
        setMessage({ text: `${t('الصنف غير موجود ضمن أمر الشراء')}: ${clean}`, tone: 'warning' })
        return
      }
      setReceiveTarget({ poId: selectedPo.id, line })
      setReceiveQty(String(Math.max(0, line.qty - line.receivedQty)))
      setReceiveLot('')
      return
    }
    if (mode === 'putaway') {
      const item = matchItem(clean)
      const location = matchLocation(clean)
      const row = putawayRows.find(
        (candidate) =>
          (item && candidate.itemId === item.id) ||
          (location && candidate.locationId === location.id),
      )
      if (!row) {
        setMessage({ text: `${t('لا توجد أصناف بانتظار التخزين')}: ${clean}`, tone: 'warning' })
        return
      }
      setPutawayTarget(row)
      setPutawayQty(String(row.quantity))
      setPutawayLocation(pickLocations[0]?.id || '')
      return
    }
    if (mode === 'pick') {
      if (!selectedSo) {
        const so = salesOrders.find((candidate) => candidate.number.toLowerCase() === clean.toLowerCase())
        if (so) {
          setSoId(so.id)
          setMessage({ text: `${t('أمر البيع')} ${so.number}`, tone: 'success' })
        } else {
          setMessage({ text: `${t('الكود غير موجود')}: ${clean}`, tone: 'warning' })
        }
        return
      }
      const item = matchItem(clean)
      const location = matchLocation(clean)
      const task = selectedSo.allocations.find(
        (candidate) =>
          candidate.pickedQty < candidate.qty &&
          ((item && candidate.itemId === item.id) ||
            (location && candidate.locationId === location.id) ||
            candidate.sku.toLowerCase() === clean.toLowerCase() ||
            candidate.locationCode.toLowerCase() === clean.toLowerCase()),
      )
      if (!task) {
        setMessage({ text: `${t('لا توجد مهام تجهيز مطابقة')}: ${clean}`, tone: 'warning' })
        return
      }
      setPickTarget({ soId: selectedSo.id, task })
      setPickQty(String(task.qty - task.pickedQty))
      return
    }
    if (mode === 'count') {
      if (!selectedCount) {
        setMessage({ text: t('اختر جردًا أولاً'), tone: 'warning' })
        return
      }
      const item = matchItem(clean)
      const location = matchLocation(clean)
      const line = selectedCount.lines.find(
        (candidate) =>
          (item && candidate.itemId === item.id) ||
          (location && candidate.locationId === location.id) ||
          candidate.sku.toLowerCase() === clean.toLowerCase() ||
          candidate.locationCode.toLowerCase() === clean.toLowerCase(),
      )
      if (!line) {
        setMessage({ text: `${t('لا يوجد سطر مطابق في هذا الجرد')}: ${clean}`, tone: 'warning' })
        return
      }
      setCountTarget({ countId: selectedCount.id, line })
      setCountQty(line.countedQty !== null && line.countedQty !== undefined ? String(line.countedQty) : '')
    }
  }

  const lookup = async (code: string) => {
    const found = await findCached(code, user?.id)
    if (!found) {
      setScanResult(null)
      setMessage({ text: `${t('الكود غير موجود في البيانات المحفوظة')}: ${code}`, tone: 'warning' })
      return
    }
    setMessage(null)
    setScanResult(found)
  }

  const afterOperation = async (queuedResult: boolean, label: string) => {
    await refreshQueue()
    if (queuedResult) {
      toast.push(`${t('تم حفظ العملية محليًا')} — ${label}`, 'warning')
      setMessage({ text: `${t('تم حفظ العملية محليًا')}: ${label}`, tone: 'warning' })
    } else {
      toast.push(`${t('تمت العملية')}: ${label}`)
      setMessage({ text: `${t('تمت العملية')}: ${label}`, tone: 'success' })
    }
    if (online) window.setTimeout(() => void refreshCatalog(true), 1200)
  }

  // -------------------------------------------------------------- receive
  const confirmReceive = async () => {
    if (!receiveTarget || !catalog) return
    const amount = Number(receiveQty)
    if (!amount || amount <= 0) return
    setBusy(true)
    const result = await offlineMutate<unknown>(
      `/api/purchase-orders/${receiveTarget.poId}/receive`,
      'POST',
      {
        notes: 'Handheld',
        lines: [
          {
            poLineId: receiveTarget.line.id,
            itemId: receiveTarget.line.itemId,
            qty: amount,
            lotCode: receiveLot || null,
          },
        ],
      },
      `${t('استلام')} ${receiveTarget.line.itemName} × ${qty(amount)}`,
    )
    setBusy(false)
    if (result.error) {
      setMessage({ text: result.error, tone: 'danger' })
      return
    }
    const next: Catalog = {
      ...catalog,
      purchaseOrders: catalog.purchaseOrders.map((po) =>
        po.id === receiveTarget.poId
          ? {
              ...po,
              lines: po.lines.map((line) =>
                line.id === receiveTarget.line.id
                  ? { ...line, receivedQty: Math.min(line.qty, line.receivedQty + amount) }
                  : line,
              ),
            }
          : po,
      ),
    }
    setCatalogSafe(next)
    setReceiveTarget(null)
    await afterOperation(Boolean(result.queued), `${t('استلام')} ${receiveTarget.line.sku} × ${qty(amount)}`)
  }

  // -------------------------------------------------------------- putaway
  const confirmPutaway = async () => {
    if (!putawayTarget || !catalog || !putawayLocation) return
    const amount = Number(putawayQty)
    if (!amount || amount <= 0) return
    setBusy(true)
    const result = await offlineMutate(
      '/api/putaway/confirm',
      'POST',
      {
        itemId: putawayTarget.itemId,
        fromLocationId: putawayTarget.locationId,
        toLocationId: putawayLocation,
        qty: amount,
        lotId: putawayTarget.lotId || null,
      },
      `${t('تخزين')} ${putawayTarget.itemName} × ${qty(amount)}`,
    )
    setBusy(false)
    if (result.error) {
      setMessage({ text: result.error, tone: 'danger' })
      return
    }
    const next: Catalog = {
      ...catalog,
      putaway:
        amount >= putawayTarget.quantity
          ? catalog.putaway.filter((row) => row.id !== putawayTarget.id)
          : catalog.putaway.map((row) =>
              row.id === putawayTarget.id ? { ...row, quantity: row.quantity - amount } : row,
            ),
    }
    setCatalogSafe(next)
    setPutawayTarget(null)
    await afterOperation(Boolean(result.queued), `${t('تخزين')} ${putawayTarget.sku} × ${qty(amount)}`)
  }

  // ------------------------------------------------------------------ pick
  const confirmPick = async () => {
    if (!pickTarget || !catalog) return
    const amount = Number(pickQty)
    if (!amount || amount <= 0) return
    setBusy(true)
    const result = await offlineMutate(
      `/api/sales-orders/${pickTarget.soId}/pick`,
      'POST',
      { soLineId: pickTarget.task.soLineId, qty: amount },
      `${t('تجهيز')} ${pickTarget.task.itemName} × ${qty(amount)}`,
    )
    setBusy(false)
    if (result.error) {
      setMessage({ text: result.error, tone: 'danger' })
      return
    }
    const next: Catalog = {
      ...catalog,
      salesOrders: catalog.salesOrders.map((so) =>
        so.id === pickTarget.soId
          ? {
              ...so,
              allocations: so.allocations.map((task) =>
                task.id === pickTarget.task.id
                  ? { ...task, pickedQty: Math.min(task.qty, task.pickedQty + amount) }
                  : task,
              ),
            }
          : so,
      ),
    }
    setCatalogSafe(next)
    setPickTarget(null)
    await afterOperation(Boolean(result.queued), `${t('تجهيز')} ${pickTarget.task.sku} × ${qty(amount)}`)
  }

  // ----------------------------------------------------------------- count
  const confirmCount = async () => {
    if (!countTarget || !catalog || countQty === '') return
    const amount = Number(countQty)
    if (Number.isNaN(amount) || amount < 0) return
    setBusy(true)
    const result = await offlineMutate(
      `/api/cycle-counts/${countTarget.countId}/lines`,
      'PATCH',
      { lines: [{ lineId: countTarget.line.id, countedQty: amount }] },
      `${t('جرد')} ${countTarget.line.sku} = ${qty(amount)}`,
    )
    setBusy(false)
    if (result.error) {
      setMessage({ text: result.error, tone: 'danger' })
      return
    }
    const next: Catalog = {
      ...catalog,
      counts: catalog.counts.map((count) =>
        count.id === countTarget.countId
          ? {
              ...count,
              lines: count.lines.map((line) =>
                line.id === countTarget.line.id ? { ...line, countedQty: amount } : line,
              ),
            }
          : count,
      ),
    }
    setCatalogSafe(next)
    setCountTarget(null)
    await afterOperation(Boolean(result.queued), `${t('جرد')} ${countTarget.line.sku} = ${qty(amount)}`)
  }

  const sync = async () => {
    setBusy(true)
    try {
      const result = await flushQueue()
      await refreshQueue()
      if (result.sent) toast.push(`${t('تمت المزامنة')} (${result.sent})`)
      if (result.errors.length) toast.push(result.errors[0], 'warning')
      if (!result.sent && !result.failed) toast.push(t('لا توجد عمليات بانتظار المزامنة'), 'info')
      if (result.sent && online) await refreshCatalog(true)
    } finally {
      setBusy(false)
    }
  }

  const pendingText = queued > 0 ? `${t('بانتظار المزامنة')}: ${queued}` : t('كل العمليات متزامنة')

  return (
    <div className="min-h-screen bg-slate-100 pb-24 text-slate-800">
      <header className="safe-top sticky top-0 z-20 bg-brand-950 px-4 pb-3 pt-3 text-white shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Logo light />
          </Link>
          <div className="flex items-center gap-1.5">
            <span
              className={cx(
                'flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold',
                online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300',
              )}
            >
              {online ? <Wifi size={12} /> : <WifiOff size={12} />}
              {online ? t('متصل') : t('غير متصل')}
            </span>
            <Link
              to="/dashboard"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300 hover:bg-white/15"
              title={t('سطح المكتب')}
            >
              <Monitor size={15} />
            </Link>
            <button
              onClick={logout}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300 hover:bg-rose-500/30"
              title={t('تسجيل الخروج')}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5">
            <Warehouse size={12} className="shrink-0 text-accent-400" />
            <select
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[11px] font-bold text-white outline-none"
            >
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id} className="text-slate-900">
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={sync}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg bg-accent-400/15 px-2.5 py-1.5 text-[10px] font-bold text-accent-200 disabled:opacity-50"
          >
            <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
            {t('مزامنة')}
            {queued > 0 ? (
              <span className="rounded bg-accent-400 px-1 text-[9px] font-extrabold text-brand-950">{queued}</span>
            ) : null}
          </button>
          <button
            onClick={() => {
              void refreshQueue()
              setSyncOpen(true)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300"
            title={t('قائمة الانتظار')}
          >
            {online ? <Cloud size={14} /> : <CloudOff size={14} />}
          </button>
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-400">
          <span className="flex items-center gap-1">
            <Smartphone size={10} /> {user?.name} · {pendingText}
          </span>
          <span>{catalog ? `${t('آخر مزامنة')} ${timeAgo(catalog.savedAt)}` : t('بيانات محفوظة')}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-3 py-3">
        {loading ? <Spinner label={t('جاري التحميل...')} /> : null}

        {!loading ? (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-card">
              <ScanInput
                value={scan}
                onChange={setScan}
                onScan={onScan}
                big
                placeholder={
                  mode === 'receive'
                    ? t('امسح أمر الشراء أو الصنف')
                    : mode === 'pick'
                      ? t('امسح أمر البيع أو الصنف أو الموقع')
                      : mode === 'putaway'
                        ? t('امسح الصنف أو الموقع الحالي')
                        : mode === 'count'
                          ? t('امسح الموقع أو الصنف')
                          : t('امسح الباركود')
                }
              />
              {message ? (
                <div
                  className={cx(
                    'mt-2 rounded-lg px-2.5 py-2 text-[11px] font-semibold leading-5',
                    message.tone === 'success'
                      ? 'bg-emerald-50 text-emerald-700'
                      : message.tone === 'danger'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-700',
                  )}
                >
                  {message.text}
                </div>
              ) : null}
            </div>

            {mode === 'scan' ? (
              <div className="space-y-3">
                {scanResult?.type === 'item' ? (
                  <div className="rounded-2xl border border-brand-200 bg-white p-4 shadow-card">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-extrabold text-slate-900">{scanResult.item.name}</p>
                        <p className="font-mono text-[11px] text-slate-400">{scanResult.item.sku}</p>
                      </div>
                      <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                        {qty(scanResult.item.onHand || 0)} {t('متاح')}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-slate-400">{t('الباركود')}</p>
                        <p className="font-mono font-bold text-slate-700">{scanResult.item.barcode || '—'}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-slate-400">{t('السعر')}</p>
                        <p className="font-bold text-slate-700">{scanResult.item.price || 0}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-slate-400">{t('تتبع الدفعات')}</p>
                        <p className="font-bold text-slate-700">{scanResult.item.trackLot ? t('نعم') : t('لا')}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-slate-400">{t('تتبع السيريال')}</p>
                        <p className="font-bold text-slate-700">{scanResult.item.trackSerial ? t('نعم') : t('لا')}</p>
                      </div>
                    </div>
                  </div>
                ) : scanResult?.type === 'location' ? (
                  <div className="rounded-2xl border border-sky-200 bg-white p-4 shadow-card">
                    <p className="text-xs text-slate-400">{t('الموقع')}</p>
                    <p className="font-mono text-lg font-extrabold text-slate-900">{scanResult.location.code}</p>
                    <p className="text-[11px] text-slate-500">
                      {scanResult.location.name || scanResult.location.type} · {scanResult.location.warehouseName}
                    </p>
                    <div className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-500">
                      {scanResult.location.barcode}
                    </div>
                  </div>
                ) : scanResult?.type === 'purchase_order' ? (
                  <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-card">
                    <p className="text-xs text-slate-400">{t('أمر الشراء')}</p>
                    <p className="font-mono text-lg font-extrabold text-slate-900">{scanResult.purchaseOrder.number}</p>
                    <p className="text-[11px] text-slate-500">{scanResult.purchaseOrder.supplierName || '—'}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {scanResult.purchaseOrder.lines.length} {t('سطر')}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center">
                    <ScanLine className="mx-auto mb-2 text-slate-300" size={30} />
                    <p className="text-xs font-bold text-slate-500">{t('امسح باركود الصنف أو الموقع أو الأمر')}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{t('العمل بدون إنترنت')} · {items.length} {t('صنف')} · {locations.length} {t('موقع')}</p>
                  </div>
                )}
              </div>
            ) : null}

            {mode === 'receive' ? (
              <div className="space-y-2">
                {!selectedPo ? (
                  <>
                    <SectionTitle title={t('أوامر شراء مفتوحة')} hint={`${purchaseOrders.length}`} />
                    {purchaseOrders.length === 0 ? (
                      <EmptyHint text={t('لا توجد أوامر شراء في البيانات المحفوظة')} />
                    ) : (
                      purchaseOrders.map((po) => {
                        const remaining = po.lines.reduce((sum, line) => sum + Math.max(0, line.qty - line.receivedQty), 0)
                        return (
                          <button
                            key={po.id}
                            onClick={() => setPoId(po.id)}
                            className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-start shadow-card"
                          >
                            <div>
                              <p className="font-mono text-xs font-extrabold text-brand-800">{po.number}</p>
                              <p className="text-[10px] text-slate-400">{po.supplierName || '—'}</p>
                            </div>
                            <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
                              {qty(remaining)} {t('المتبقي')}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </>
                ) : (
                  <>
                    <SelectionHeader
                      title={selectedPo.number}
                      subtitle={`${selectedPo.supplierName || ''} · ${selectedPo.lines.length} ${t('سطر')}`}
                      onClear={() => setPoId('')}
                    />
                    {selectedPo.lines.map((line) => {
                      const remaining = Math.max(0, line.qty - line.receivedQty)
                      return (
                        <button
                          key={line.id}
                          onClick={() => {
                            setReceiveTarget({ poId: selectedPo.id, line })
                            setReceiveQty(String(remaining || 0))
                            setReceiveLot('')
                          }}
                          disabled={remaining <= 0}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-start disabled:opacity-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-800">{line.itemName}</p>
                            <p className="font-mono text-[10px] text-slate-400">{line.sku}</p>
                          </div>
                          <span
                            className={cx(
                              'shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold',
                              remaining <= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                            )}
                          >
                            {remaining <= 0 ? t('مستلم') : `${qty(remaining)} ${t('المتبقي')}`}
                          </span>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            ) : null}

            {mode === 'putaway' ? (
              <div className="space-y-2">
                <SectionTitle title={t('بانتظار التخزين')} hint={`${putawayRows.length}`} />
                {putawayRows.length === 0 ? (
                  <EmptyHint text={t('لا توجد أصناف بانتظار التخزين')} />
                ) : (
                  putawayRows.map((row) => (
                    <button
                      key={row.id}
                      onClick={() => {
                        setPutawayTarget(row)
                        setPutawayQty(String(row.quantity))
                        setPutawayLocation(pickLocations[0]?.id || '')
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-start"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-800">{row.itemName}</p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {row.sku} · {row.locationCode}
                          {row.lotCode ? ` · ${row.lotCode}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">
                        {qty(row.quantity)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}

            {mode === 'pick' ? (
              <div className="space-y-2">
                {!selectedSo ? (
                  <>
                    <SectionTitle title={t('طلبات التجهيز')} hint={`${salesOrders.length}`} />
                    {salesOrders.length === 0 ? (
                      <EmptyHint text={t('لا توجد مهام تجهيز في البيانات المحفوظة')} />
                    ) : (
                      salesOrders.map((so) => {
                        const remaining = so.allocations.reduce(
                          (sum, task) => sum + Math.max(0, task.qty - task.pickedQty),
                          0,
                        )
                        return (
                          <button
                            key={so.id}
                            onClick={() => setSoId(so.id)}
                            className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-start shadow-card"
                          >
                            <div>
                              <p className="font-mono text-xs font-extrabold text-brand-800">{so.number}</p>
                              <p className="text-[10px] text-slate-400">{so.customerName || '—'}</p>
                            </div>
                            <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
                              {qty(remaining)} {t('المتبقي')}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </>
                ) : (
                  <>
                    <SelectionHeader
                      title={selectedSo.number}
                      subtitle={`${selectedSo.customerName || ''} · ${selectedSo.allocations.length} ${t('مهمة')}`}
                      onClear={() => setSoId('')}
                    />
                    {selectedSo.allocations.map((task) => {
                      const remaining = Math.max(0, task.qty - task.pickedQty)
                      return (
                        <button
                          key={task.id}
                          onClick={() => {
                            setPickTarget({ soId: selectedSo.id, task })
                            setPickQty(String(remaining))
                          }}
                          disabled={remaining <= 0}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-start disabled:opacity-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-800">{task.itemName}</p>
                            <p className="font-mono text-[10px] text-slate-400">
                              {task.sku} · {task.locationCode}
                              {task.lotCode ? ` · ${task.lotCode}` : ''}
                            </p>
                          </div>
                          <span
                            className={cx(
                              'shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold',
                              remaining <= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                            )}
                          >
                            {remaining <= 0 ? t('مجهز') : `${qty(remaining)} ${t('المتبقي')}`}
                          </span>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            ) : null}

            {mode === 'count' ? (
              <div className="space-y-2">
                {!selectedCount ? (
                  <>
                    <SectionTitle title={t('الجرد مفتوح')} hint={`${counts.length}`} />
                    {counts.length === 0 ? (
                      <EmptyHint text={t('لا توجد عمليات جرد مفتوحة — أنشئ جردًا من سطح المكتب ثم حدّث البيانات')} />
                    ) : (
                      counts.map((count) => (
                        <button
                          key={count.id}
                          onClick={() => setCountId(count.id)}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-start shadow-card"
                        >
                          <div>
                            <p className="font-mono text-xs font-extrabold text-brand-800">{count.number}</p>
                            <p className="text-[10px] text-slate-400">{count.lines.length} {t('سطر')}</p>
                          </div>
                          <span className="rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700">
                            {count.lines.filter((line) => line.countedQty !== null).length} / {count.lines.length}
                          </span>
                        </button>
                      ))
                    )}
                  </>
                ) : (
                  <>
                    <SelectionHeader
                      title={selectedCount.number}
                      subtitle={`${selectedCount.lines.length} ${t('سطر')}`}
                      onClear={() => setCountId('')}
                    />
                    <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pe-0.5">
                      {selectedCount.lines.map((line) => {
                        const counted = line.countedQty !== null && line.countedQty !== undefined
                        const variance = counted ? Number(line.countedQty) - line.expectedQty : null
                        return (
                          <button
                            key={line.id}
                            onClick={() => {
                              setCountTarget({ countId: selectedCount.id, line })
                              setCountQty(counted ? String(line.countedQty) : '')
                            }}
                            className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-start"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-slate-800">{line.itemName}</p>
                              <p className="font-mono text-[10px] text-slate-400">
                                {line.locationCode} · {line.sku}
                                {line.lotCode ? ` · ${line.lotCode}` : ''}
                              </p>
                            </div>
                            <div className="shrink-0 text-end">
                              <p className="text-[9px] text-slate-400">{t('الكمية المتوقعة')}</p>
                              <p className="text-xs font-bold text-slate-700">{qty(line.expectedQty)}</p>
                              {counted ? (
                                <p className={cx('text-[9px] font-bold', variance === 0 ? 'text-emerald-600' : 'text-rose-600')}>
                                  {t('الفرق')}: {variance && variance > 0 ? '+' : ''}
                                  {qty(variance)}
                                </p>
                              ) : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {MODES.map((item) => {
            const Icon = item.icon
            const active = mode === item.id
            return (
              <button
                key={item.id}
                onClick={() => setMode(item.id)}
                className={cx(
                  'flex flex-col items-center gap-0.5 py-2 text-[9px] font-bold transition-colors',
                  active ? 'text-brand-800' : 'text-slate-400',
                )}
              >
                <span
                  className={cx(
                    'flex h-8 w-8 items-center justify-center rounded-xl',
                    active ? 'bg-brand-950 text-accent-400' : 'bg-transparent',
                  )}
                >
                  <Icon size={17} />
                </span>
                {t(item.label)}
              </button>
            )
          })}
        </div>
      </nav>

      {/* receive modal */}
      <Modal
        open={Boolean(receiveTarget)}
        onClose={() => setReceiveTarget(null)}
        title={t('استلام سريع')}
        subtitle={receiveTarget ? `${receiveTarget.line.itemName} · ${receiveTarget.line.sku}` : ''}
        footer={
          <>
            <button
              onClick={() => setReceiveTarget(null)}
              className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600"
            >
              {t('إلغاء')}
            </button>
            <button
              onClick={confirmReceive}
              disabled={busy || !Number(receiveQty)}
              className="h-10 rounded-xl bg-brand-950 px-5 text-xs font-bold text-white disabled:opacity-50"
            >
              {t('تأكيد الاستلام')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
            <span className="text-slate-500">{t('المتبقي')}</span>
            <b className="text-slate-800">
              {receiveTarget ? qty(receiveTarget.line.qty - receiveTarget.line.receivedQty) : 0}
            </b>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-slate-600">{t('الكمية')}</span>
            <input
              type="number"
              inputMode="decimal"
              value={receiveQty}
              onChange={(event) => setReceiveQty(event.target.value)}
              className="h-14 w-full rounded-xl border-2 border-brand-200 px-3 text-center text-2xl font-extrabold text-slate-900 focus:border-brand-500 focus:outline-none"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-slate-600">{t('رقم الدفعة')}</span>
            <input
              value={receiveLot}
              onChange={(event) => setReceiveLot(event.target.value)}
              dir="ltr"
              className="h-10 w-full rounded-xl border border-slate-200 px-3 font-mono text-sm focus:border-brand-400 focus:outline-none"
              placeholder={t('اختياري')}
            />
          </label>
        </div>
      </Modal>

      {/* putaway modal */}
      <Modal
        open={Boolean(putawayTarget)}
        onClose={() => setPutawayTarget(null)}
        title={t('تخزين سريع')}
        subtitle={putawayTarget ? `${putawayTarget.itemName} · ${putawayTarget.locationCode}` : ''}
        footer={
          <>
            <button
              onClick={() => setPutawayTarget(null)}
              className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600"
            >
              {t('إلغاء')}
            </button>
            <button
              onClick={confirmPutaway}
              disabled={busy || !Number(putawayQty) || !putawayLocation}
              className="h-10 rounded-xl bg-brand-950 px-5 text-xs font-bold text-white disabled:opacity-50"
            >
              {t('تأكيد التخزين')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-slate-600">{t('إلى موقع')}</span>
            <select
              value={putawayLocation}
              onChange={(event) => setPutawayLocation(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-2 text-sm font-bold focus:border-brand-400 focus:outline-none"
            >
              <option value="">{t('اختر الموقع')}</option>
              {pickLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} — {location.name || ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-slate-600">{t('الكمية')}</span>
            <input
              type="number"
              inputMode="decimal"
              value={putawayQty}
              onChange={(event) => setPutawayQty(event.target.value)}
              className="h-14 w-full rounded-xl border-2 border-brand-200 px-3 text-center text-2xl font-extrabold text-slate-900 focus:border-brand-500 focus:outline-none"
            />
          </label>
        </div>
      </Modal>

      {/* pick modal */}
      <Modal
        open={Boolean(pickTarget)}
        onClose={() => setPickTarget(null)}
        title={t('تجهيز سريع')}
        subtitle={pickTarget ? `${pickTarget.task.itemName} · ${pickTarget.task.locationCode}` : ''}
        footer={
          <>
            <button
              onClick={() => setPickTarget(null)}
              className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600"
            >
              {t('إلغاء')}
            </button>
            <button
              onClick={confirmPick}
              disabled={busy || !Number(pickQty)}
              className="h-10 rounded-xl bg-brand-950 px-5 text-xs font-bold text-white disabled:opacity-50"
            >
              {t('تأكيد التجهيز')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
            <span className="text-slate-500">{t('المتبقي')}</span>
            <b className="text-slate-800">
              {pickTarget ? qty(pickTarget.task.qty - pickTarget.task.pickedQty) : 0}
            </b>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-slate-600">{t('الكمية')}</span>
            <input
              type="number"
              inputMode="decimal"
              value={pickQty}
              onChange={(event) => setPickQty(event.target.value)}
              className="h-14 w-full rounded-xl border-2 border-brand-200 px-3 text-center text-2xl font-extrabold text-slate-900 focus:border-brand-500 focus:outline-none"
              autoFocus
            />
          </label>
        </div>
      </Modal>

      {/* count modal */}
      <Modal
        open={Boolean(countTarget)}
        onClose={() => setCountTarget(null)}
        title={t('جرد سريع')}
        subtitle={countTarget ? `${countTarget.line.itemName} · ${countTarget.line.locationCode}` : ''}
        footer={
          <>
            <button
              onClick={() => setCountTarget(null)}
              className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600"
            >
              {t('إلغاء')}
            </button>
            <button
              onClick={confirmCount}
              disabled={busy || countQty === ''}
              className="h-10 rounded-xl bg-brand-950 px-5 text-xs font-bold text-white disabled:opacity-50"
            >
              {t('تأكيد')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
            <span className="text-slate-500">{t('الكمية المتوقعة')}</span>
            <b className="text-slate-800">{countTarget ? qty(countTarget.line.expectedQty) : 0}</b>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-slate-600">{t('الكمية المجرودة')}</span>
            <input
              type="number"
              inputMode="decimal"
              value={countQty}
              onChange={(event) => setCountQty(event.target.value)}
              className="h-14 w-full rounded-xl border-2 border-brand-200 px-3 text-center text-2xl font-extrabold text-slate-900 focus:border-brand-500 focus:outline-none"
              autoFocus
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[0, Number(countTarget?.line.expectedQty || 0), Number(countTarget?.line.expectedQty || 0) + 1].map(
              (preset, index) => (
                <button
                  key={index}
                  onClick={() => setCountQty(String(preset))}
                  className="h-9 rounded-lg border border-slate-200 text-xs font-bold text-slate-600"
                >
                  {qty(preset)}
                </button>
              ),
            )}
          </div>
        </div>
      </Modal>

      {/* queue modal */}
      <Modal
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        title={t('قائمة الانتظار')}
        subtitle={`${queued} ${t('بانتظار المزامنة')}`}
        size="lg"
        footer={
          <>
            <button
              onClick={() => setSyncOpen(false)}
              className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600"
            >
              {t('إغلاق')}
            </button>
            <button
              onClick={sync}
              disabled={busy || !online}
              className="h-10 rounded-xl bg-brand-950 px-5 text-xs font-bold text-white disabled:opacity-50"
            >
              <RefreshCw size={13} className={cx('me-1 inline', busy && 'animate-spin')} /> {t('مزامنة الآن')}
            </button>
          </>
        }
      >
        {queue.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto mb-2 text-emerald-500" size={28} />
            <p className="text-xs font-bold text-slate-600">{t('كل العمليات متزامنة')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map((op) => (
              <div key={op.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-slate-700">{op.label}</p>
                  <p className="font-mono text-[9px] text-slate-400">
                    {op.method} {op.path} · {timeAgo(new Date(op.createdAt).toISOString())}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await removeQueued(op.id)
                    await refreshQueue()
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  title={t('حذف')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <p className="pt-1 text-center text-[10px] text-slate-400">
              {online ? t('ستتم المزامنة بالترتيب') : t('العمل بدون إنترنت')}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between px-1 py-1">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{title}</p>
      {hint ? <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{hint}</span> : null}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center">
      <PackageSearch className="mx-auto mb-2 text-slate-300" size={26} />
      <p className="text-[11px] font-semibold text-slate-500">{text}</p>
    </div>
  )
}

function SelectionHeader({
  title,
  subtitle,
  onClear,
}: {
  title: string
  subtitle: string
  onClear: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-950 px-3 py-2 text-white">
      <div className="min-w-0">
        <p className="font-mono text-xs font-extrabold text-accent-300">{title}</p>
        <p className="truncate text-[10px] text-slate-400">{subtitle}</p>
      </div>
      <button onClick={onClear} className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold">
        <ArrowLeft size={11} /> تغيير
      </button>
    </div>
  )
}
