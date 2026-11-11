import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  ScanBarcode,
  Tags,
  Upload,
  PackageSearch,
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
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Textarea,
} from '../components/ui'
import { api, downloadFile, queryString } from '../lib/api'
import { money, num, qty } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import type { Category, Item, ListResponse } from '../lib/types'

type ItemForm = {
  name: string
  sku: string
  barcode: string
  categoryId: string
  unit: string
  brand: string
  cost: string
  price: string
  minStock: string
  strategicStock: string
  maxStock: string
  reorderQty: string
  trackLot: boolean
  trackSerial: boolean
  active: boolean
}

const EMPTY_FORM: ItemForm = {
  name: '',
  sku: '',
  barcode: '',
  categoryId: '',
  unit: 'قطعة',
  brand: '',
  cost: '0',
  price: '0',
  minStock: '0',
  strategicStock: '0',
  maxStock: '0',
  reorderQty: '0',
  trackLot: false,
  trackSerial: false,
  active: true,
}

const CSV_SAMPLE = `sku,name,barcode,category,unit,cost,price,minStock,trackLot,trackSerial
SKU-DEMO-1,صنف تجريبي,200000099999,إلكترونيات,قطعة,100,150,10,no,no`

export default function Items() {
  const { t, lang } = useI18n()
  const { can } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [csv, setCsv] = useState('')
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null)

  const params = { page, pageSize: 20, q: search, categoryId, lowStock: lowOnly ? 1 : '', active: 'all' }
  const { data, isLoading } = useQuery({
    queryKey: ['items', params],
    queryFn: () => api.get<ListResponse<Item>>(`/api/items${queryString(params)}`),
  })
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/api/categories'),
  })

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? api.patch<Item>(`/api/items/${editing.id}`, payload) : api.post<Item>('/api/items', payload),
    onSuccess: () => {
      toast.push(editing ? t('تم التعديل') : t('تمت الإضافة'))
      setModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/api/items/${id}`),
    onSuccess: () => {
      toast.push(t('تم أرشفة الصنف'))
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const importMutation = useMutation({
    mutationFn: () => api.post<{ created: number; updated: number; errors: string[] }>('/api/items/import', { csv }),
    onSuccess: (result) => {
      setImportResult(result)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast.push(`${t('تم الاستيراد')}: ${result.created + result.updated}`)
    },
    onError: (error: Error) => toast.push(error.message, 'error'),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (item: Item) => {
    setEditing(item)
    setForm({
      name: item.name,
      sku: item.sku,
      barcode: item.barcode || '',
      categoryId: item.categoryId || '',
      unit: item.unit,
      brand: item.brand || '',
      cost: String(item.cost),
      price: String(item.price),
      minStock: String(item.minStock),
      strategicStock: String(item.strategicStock || 0),
      maxStock: String(item.maxStock),
      reorderQty: String(item.reorderQty),
      trackLot: item.trackLot,
      trackSerial: item.trackSerial,
      active: item.active,
    })
    setFormError('')
    setModalOpen(true)
  }

  const submit = () => {
    if (!form.name.trim()) {
      setFormError(t('الاسم مطلوب'))
      return
    }
    saveMutation.mutate({
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      barcode: form.barcode.trim() || undefined,
      categoryId: form.categoryId || null,
      unit: form.unit || 'قطعة',
      brand: form.brand.trim() || null,
      cost: Number(form.cost) || 0,
      price: Number(form.price) || 0,
      minStock: Number(form.minStock) || 0,
      strategicStock: Number(form.strategicStock) || 0,
      maxStock: Number(form.maxStock) || 0,
      reorderQty: Number(form.reorderQty) || 0,
      trackLot: form.trackLot,
      trackSerial: form.trackSerial,
      active: form.active,
    })
  }

  const readFile = async (file: File) => {
    const text = await file.text()
    setCsv(text)
  }

  const totalUnits = useMemo(
    () => (data?.items || []).reduce((sum, item) => sum + (item.onHand || 0), 0),
    [data],
  )

  return (
    <div>
      <PageHeader
        title={t('الأصناف')}
        subtitle={`${num(data?.total || 0)} ${t('صنف')} · ${qty(totalUnits)} ${t('وحدة في هذه الصفحة')}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadFile('/api/items/export.csv', 'storege-items.csv')}>
              <Download size={15} /> {t('تصدير')}
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload size={15} /> {t('استيراد')}
            </Button>
            {can('MANAGER', 'OPERATOR') ? (
              <Button onClick={openCreate}>
                <Plus size={16} /> {t('صنف جديد')}
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            placeholder={`${t('بحث')} — ${t('الاسم أو الكود أو الباركود')}`}
            className="w-full sm:w-80"
          />
          <Select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value)
              setPage(1)
            }}
            className="w-auto min-w-40"
          >
            <option value="">{t('كل التصنيفات')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <button
            onClick={() => {
              setLowOnly((value) => !value)
              setPage(1)
            }}
            className={`inline-flex h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
              lowOnly
                ? 'border-amber-300 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Tags size={14} /> {t('تحت حد الطلب')}
          </button>
          <Link to="/labels" className="ms-auto">
            <Button variant="ghost" size="sm">
              <ScanBarcode size={14} /> {t('طباعة الليبلات')}
            </Button>
          </Link>
        </div>

        <DataTable
          headers={[
            t('الصنف'),
            t('التصنيف'),
            t('المتاح'),
            t('المحجوز'),
            t('سعر البيع'),
            t('الحد الاستراتيجي'),
            t('التتبع'),
            t('الإجراءات'),
          ]}
          loading={isLoading}
          rowCount={data?.items?.length}
        >
          {(data?.items || []).map((item) => (
            <tr key={item.id} className="group hover:bg-slate-50/70">
              <td className="px-3.5 py-2.5">
                <Link to={`/items/${item.id}`} className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <PackageSearch size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-slate-800 group-hover:text-brand-800">
                      {item.name}
                    </span>
                    <span className="block font-mono text-[10px] text-slate-400">
                      {item.sku} · {item.barcode || '—'}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="px-3.5 py-2.5">
                {item.category ? (
                  <Badge tone="brand">{item.category.name}</Badge>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
              <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">
                {qty(item.onHand)}
                <span className="ms-1 text-[10px] font-normal text-slate-400">{item.unit}</span>
              </td>
              <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-500">{qty(item.reserved)}</td>
              <td className="px-3.5 py-2.5 text-xs font-semibold text-slate-700">{money(item.price, lang)}</td>
              <td className="px-3.5 py-2.5 text-xs tabular-nums text-slate-500">
                {qty(item.strategicStock || item.minStock)}
                {item.strategicStock > 0 ? <Badge tone="rose" className="ms-1.5">{t('استراتيجي')}</Badge> : null}
              </td>
              <td className="px-3.5 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {item.trackLot ? <Badge tone="violet">{t('دفعات')}</Badge> : null}
                  {item.trackSerial ? <Badge tone="sky">{t('سيريال')}</Badge> : null}
                  {!item.trackLot && !item.trackSerial ? <span className="text-xs text-slate-400">—</span> : null}
                </div>
              </td>
              <td className="px-3.5 py-2.5">
                <div className="flex items-center gap-0.5">
                  {can('MANAGER', 'OPERATOR') ? (
                    <IconButton onClick={() => openEdit(item)} title={t('تعديل')}>
                      <Edit3 size={15} />
                    </IconButton>
                  ) : null}
                  {can('MANAGER') ? (
                    <IconButton
                      onClick={() => {
                        if (window.confirm(t('تأكيد الأرشفة؟'))) archiveMutation.mutate(item.id)
                      }}
                      title={t('أرشفة')}
                      className="hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Archive size={15} />
                    </IconButton>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
        <Pagination page={page} pageSize={20} total={data?.total || 0} onChange={setPage} />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('تعديل الصنف') : t('صنف جديد')}
        subtitle={editing ? editing.sku : t('أضف صنفًا جديدًا إلى الكتالوج')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button onClick={submit} loading={saveMutation.isPending}>
              {t('حفظ')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('اسم الصنف')} required className="sm:col-span-2">
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="مثال: سماعات لاسلكية"
              />
            </Field>
            <Field label={t('كود الصنف')} hint={t('اتركه فارغًا للتوليد التلقائي')}>
              <Input
                value={form.sku}
                onChange={(event) => setForm({ ...form, sku: event.target.value })}
                placeholder="SKU-0001"
                dir="ltr"
              />
            </Field>
            <Field label={t('الباركود')} hint={t('اتركه فارغًا لتوليد EAN-13')}>
              <Input
                value={form.barcode}
                onChange={(event) => setForm({ ...form, barcode: event.target.value })}
                placeholder="200000000001"
                dir="ltr"
              />
            </Field>
            <Field label={t('التصنيف')}>
              <Select
                value={form.categoryId}
                onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
              >
                <option value="">{t('غير مصنف')}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('الوحدة')}>
              <Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
            </Field>
            <Field label={t('التكلفة')}>
              <Input
                type="number"
                step="0.01"
                value={form.cost}
                onChange={(event) => setForm({ ...form, cost: event.target.value })}
              />
            </Field>
            <Field label={t('سعر البيع')}>
              <Input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
            </Field>
            <Field label={t('حد الطلب')}>
              <Input
                type="number"
                value={form.minStock}
                onChange={(event) => setForm({ ...form, minStock: event.target.value })}
              />
            </Field>
            <Field label={t('المخزون الاستراتيجي')} hint={t('يظهر تحذير عند النزول عن هذا الحد')}>
              <Input
                type="number"
                value={form.strategicStock}
                onChange={(event) => setForm({ ...form, strategicStock: event.target.value })}
              />
            </Field>
            <Field label={t('الحد الأقصى')}>
              <Input
                type="number"
                value={form.maxStock}
                onChange={(event) => setForm({ ...form, maxStock: event.target.value })}
              />
            </Field>
            <Field label={t('كمية إعادة الطلب')}>
              <Input
                type="number"
                value={form.reorderQty}
                onChange={(event) => setForm({ ...form, reorderQty: event.target.value })}
              />
            </Field>
            <Field label={t('الماركة')}>
              <Input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
            </Field>
          </div>

          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={form.trackLot}
                onChange={(event) => setForm({ ...form, trackLot: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-700"
              />
              {t('تتبع الدفعات وتاريخ الصلاحية')}
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={form.trackSerial}
                onChange={(event) => setForm({ ...form, trackSerial: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-700"
              />
              {t('تتبع الأرقام التسلسلية')}
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-700"
              />
              {t('نشط')}
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false)
          setImportResult(null)
        }}
        title={t('استيراد الأصناف')}
        subtitle={t('من ملف CSV أو لصق البيانات')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              {t('إلغاء')}
            </Button>
            <Button
              onClick={() => importMutation.mutate()}
              loading={importMutation.isPending}
              disabled={!csv.trim()}
            >
              <FileSpreadsheet size={15} /> {t('استيراد')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="info">
            {t('الأعمدة المدعومة')}: <span dir="ltr" className="font-mono">sku, name, barcode, category, unit, cost, price, minStock, trackLot, trackSerial</span>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              <Upload size={15} /> {t('اختيار ملف')}
            </Button>
            <Button variant="ghost" onClick={() => setCsv(CSV_SAMPLE)}>
              {t('إدراج مثال')}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void readFile(file)
              }}
            />
          </div>
          <Textarea
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            rows={9}
            placeholder={CSV_SAMPLE}
            className="font-mono text-[11px]"
            dir="ltr"
          />
          {importResult ? (
            <div className="space-y-2">
              <Alert tone={importResult.errors.length ? 'warning' : 'success'}>
                {t('تم الإنشاء')}: {importResult.created} · {t('تم التحديث')}: {importResult.updated} ·{' '}
                {t('أخطاء')}: {importResult.errors.length}
              </Alert>
              {importResult.errors.slice(0, 5).map((error) => (
                <p key={error} className="text-[11px] text-rose-600">
                  {error}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
