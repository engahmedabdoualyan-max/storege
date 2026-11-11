import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Database, ImageUp, Save, ScanBarcode, Settings2, Warehouse } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  KeyValue,
  PageHeader,
  Select,
  Spinner,
  Tabs,
  Textarea,
} from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { num } from '../lib/format'

type SettingsMap = Record<string, string>

type SystemInfo = {
  version: string
  engine: string
  database: string
  counts: { items: number; warehouses: number; users: number; movements: number; invoices: number }
  uptime: number
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-start transition hover:bg-slate-50"
    >
      <span>
        <span className="block text-xs font-bold text-slate-700">{label}</span>
        {hint ? <span className="mt-0.5 block text-[10px] text-slate-400">{hint}</span> : null}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? 'start-4' : 'start-0.5'
          }`}
        />
      </span>
    </button>
  )
}

export default function Settings() {
  const { t } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState('company')
  const [form, setForm] = useState<SettingsMap>({})
  const [loaded, setLoaded] = useState(false)
  const [logoError, setLogoError] = useState('')

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsMap>('/api/settings'),
  })
  const systemQuery = useQuery({
    queryKey: ['system-info'],
    queryFn: () => api.get<SystemInfo>('/api/system/info'),
  })

  useEffect(() => {
    if (!settingsQuery.data || loaded) return
    setForm(settingsQuery.data)
    setLoaded(true)
  }, [settingsQuery.data, loaded])

  const saveMutation = useMutation({
    mutationFn: () => api.patch<SettingsMap>('/api/settings', form),
    onSuccess: (data) => {
      setForm(data)
      toast.push(t('تم حفظ الإعدادات'))
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const bool = (key: string, fallback = false) => (form[key] ?? String(fallback)) === 'true'

  const onLogo = (file: File | undefined) => {
    setLogoError('')
    if (!file) return
    if (file.size > 650 * 1024) {
      setLogoError(t('حجم الشعار كبير جدًا (الحد 650KB)'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => set('logoUrl', String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  if (settingsQuery.isLoading || !loaded) return <Spinner label={t('جاري التحميل...')} />

  return (
    <div>
      <PageHeader
        title={t('الإعدادات')}
        subtitle={t('إعدادات الشركة والمخزون والليبلات')}
        actions={
          <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            <Save size={16} /> {t('حفظ التغييرات')}
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card>
          <div className="px-3 pt-1">
            <Tabs
              tabs={[
                { id: 'company', label: t('بيانات الشركة') },
                { id: 'operations', label: t('إعدادات المخزون') },
                { id: 'labels', label: t('إعدادات الليبل') },
              ]}
              active={tab}
              onChange={setTab}
            />
          </div>

          {tab === 'company' ? (
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="logo" className="h-16 w-16 rounded-xl border border-slate-200 bg-white object-contain" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-950 text-2xl font-black text-accent-400">
                    S
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-700">{t('شعار الشركة')}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                      <ImageUp size={14} /> {t('رفع شعار')}
                    </Button>
                    {form.logoUrl ? (
                      <Button size="sm" variant="ghost" onClick={() => set('logoUrl', '')}>
                        {t('حذف')}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-[10px] text-slate-400">PNG / JPG / SVG — 650KB</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => onLogo(event.target.files?.[0])}
                />
              </div>
              {logoError ? <Alert tone="danger">{logoError}</Alert> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('اسم الشركة')} required>
                  <Input value={form.companyName || ''} onChange={(event) => set('companyName', event.target.value)} />
                </Field>
                <Field label={`${t('اسم الشركة')} (EN)`}>
                  <Input
                    value={form.companyNameEn || ''}
                    onChange={(event) => set('companyNameEn', event.target.value)}
                    dir="ltr"
                  />
                </Field>
                <Field label={t('الهاتف')}>
                  <Input
                    value={form.companyPhone || ''}
                    onChange={(event) => set('companyPhone', event.target.value)}
                    dir="ltr"
                  />
                </Field>
                <Field label={t('البريد الإلكتروني')}>
                  <Input
                    type="email"
                    value={form.companyEmail || ''}
                    onChange={(event) => set('companyEmail', event.target.value)}
                    dir="ltr"
                  />
                </Field>
                <Field label={t('العنوان')} className="sm:col-span-2">
                  <Input value={form.companyAddress || ''} onChange={(event) => set('companyAddress', event.target.value)} />
                </Field>
                <Field label={t('الرقم الضريبي')}>
                  <Input
                    value={form.companyTaxNumber || ''}
                    onChange={(event) => set('companyTaxNumber', event.target.value)}
                    dir="ltr"
                  />
                </Field>
                <Field label={t('العملة')}>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={form.currency || ''} onChange={(event) => set('currency', event.target.value)} dir="ltr" />
                    <Input
                      value={form.currencySymbol || ''}
                      onChange={(event) => set('currencySymbol', event.target.value)}
                    />
                  </div>
                </Field>
                <Field label={`${t('نسبة الضريبة')} %`}>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.taxRate || '0'}
                    onChange={(event) => set('taxRate', event.target.value)}
                  />
                </Field>
                <Field label={t('نص أسفل الفاتورة')} className="sm:col-span-2">
                  <Textarea
                    rows={2}
                    value={form.invoiceFooter || ''}
                    onChange={(event) => set('invoiceFooter', event.target.value)}
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {tab === 'operations' ? (
            <div className="space-y-3 p-4">
              <Toggle
                checked={bool('lowStockAlert', true)}
                onChange={(value) => set('lowStockAlert', String(value))}
                label={t('تنبيهات المخزون المنخفض')}
                hint={t('إظهار تنبيهات عند الوصول للحد الأدنى')}
              />
              <Toggle
                checked={bool('allowNegativeStock')}
                onChange={(value) => set('allowNegativeStock', String(value))}
                label={t('السماح بالمخزون السالب')}
                hint={t('يُنصح بإبقائه مغلقًا لضبط الأرصدة')}
              />
              <Toggle
                checked={bool('autoAllocateOrders', true)}
                onChange={(value) => set('autoAllocateOrders', String(value))}
                label={t('تخصيص الأوامر تلقائيًا')}
                hint={t('حجز المخزون تلقائيًا عند إنشاء أمر بيع')}
              />
              <Alert tone="info">
                {t('تُطبق إعدادات المخزون على العمليات الجديدة بعد الحفظ مباشرة.')}
              </Alert>
            </div>
          ) : null}

          {tab === 'labels' ? (
            <div className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={`${t('العرض')} (mm)`}>
                  <Input
                    type="number"
                    min="20"
                    max="120"
                    value={form.labelWidth || '50'}
                    onChange={(event) => set('labelWidth', event.target.value)}
                  />
                </Field>
                <Field label={`${t('الارتفاع')} (mm)`}>
                  <Input
                    type="number"
                    min="10"
                    max="120"
                    value={form.labelHeight || '25'}
                    onChange={(event) => set('labelHeight', event.target.value)}
                  />
                </Field>
                <Field label={t('نوع الباركود')}>
                  <Select value={form.labelSymbology || 'CODE128'} onChange={(event) => set('labelSymbology', event.target.value)}>
                    <option value="CODE128">CODE128</option>
                    <option value="CODE39">CODE39</option>
                    <option value="EAN13">EAN13</option>
                    <option value="ITF14">ITF14</option>
                  </Select>
                </Field>
              </div>
              <Toggle
                checked={bool('labelShowName', true)}
                onChange={(value) => set('labelShowName', String(value))}
                label={t('اسم الصنف')}
              />
              <Toggle
                checked={bool('labelShowSku', true)}
                onChange={(value) => set('labelShowSku', String(value))}
                label={t('كود الصنف')}
              />
              <Toggle
                checked={bool('labelShowPrice')}
                onChange={(value) => set('labelShowPrice', String(value))}
                label={t('السعر')}
              />
              <Field label={t('بادئة الباركود')} hint={t('تُستخدم عند توليد باركودات جديدة')}>
                <Input
                  value={form.barcodePrefix || ''}
                  onChange={(event) => set('barcodePrefix', event.target.value)}
                  dir="ltr"
                  className="max-w-48"
                />
              </Field>
            </div>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('بيانات النظام')} subtitle={t('معلومات التشغيل الحالية')} />
            <div className="p-3">
              <KeyValue label="Engine" value={systemQuery.data?.engine || 'Storege WMS'} />
              <KeyValue label="Version" value={systemQuery.data?.version || '1.0.0'} />
              <KeyValue label={t('قاعدة البيانات')} value={systemQuery.data?.database || 'SQLite'} />
              <KeyValue
                label={t('مدة التشغيل')}
                value={`${num(Math.floor((systemQuery.data?.uptime || 0) / 60), 0)} ${t('دقيقة')}`}
              />
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[10px] text-slate-400">{t('الأصناف')}</p>
                  <p className="text-sm font-extrabold text-slate-800">{systemQuery.data?.counts.items || 0}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[10px] text-slate-400">{t('المخازن')}</p>
                  <p className="text-sm font-extrabold text-slate-800">{systemQuery.data?.counts.warehouses || 0}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[10px] text-slate-400">{t('المستخدمون')}</p>
                  <p className="text-sm font-extrabold text-slate-800">{systemQuery.data?.counts.users || 0}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[10px] text-slate-400">{t('الحركات')}</p>
                  <p className="text-sm font-extrabold text-slate-800">{systemQuery.data?.counts.movements || 0}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('روابط سريعة')} />
            <div className="space-y-2 p-3 text-[11px] text-slate-500">
              <p className="flex items-center gap-2">
                <Building2 size={13} className="text-brand-500" /> {t('بيانات الشركة تُستخدم في الفواتير والتقارير.')}
              </p>
              <p className="flex items-center gap-2">
                <Warehouse size={13} className="text-brand-500" /> {t('عيّن المخزن الحالي من الشريط الجانبي.')}
              </p>
              <p className="flex items-center gap-2">
                <ScanBarcode size={13} className="text-brand-500" /> {t('عدّل أحجام الليبلات من تبويب الليبلات.')}
              </p>
              <p className="flex items-center gap-2">
                <Database size={13} className="text-brand-500" /> {'PostgreSQL: npm run db:postgres'}
              </p>
            </div>
          </Card>

          <Alert tone="info">
            <span className="flex items-start gap-2">
              <Settings2 size={14} className="mt-0.5 shrink-0" />
              {t('تُحفظ الإعدادات فور الضغط على حفظ التغييرات.')}
            </span>
          </Alert>
        </div>
      </div>
    </div>
  )
}
