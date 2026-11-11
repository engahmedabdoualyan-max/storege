import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { useT } from '../lib/i18n'

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

// ------------------------------------------------------------------- button
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'dark'
type ButtonSize = 'sm' | 'md' | 'lg'

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-brand-950 text-white hover:bg-brand-800 shadow-sm disabled:bg-brand-300',
    secondary:
      'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    dark: 'bg-slate-800 text-white hover:bg-slate-900',
  }
  const sizes: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
    md: 'h-[38px] px-4 text-sm gap-2 rounded-xl',
    lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
  }
  return (
    <button
      className={cx(
        'inline-flex select-none items-center justify-center font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : null}
      {children}
    </button>
  )
}

export function IconButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// -------------------------------------------------------------------- cards
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl border border-slate-200/80 bg-white shadow-card', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5', className)}>
      <div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

// ------------------------------------------------------------------- badges
const STATUS_TONES: Record<string, string> = {
  OPEN: 'bg-sky-50 text-sky-700 border-sky-200',
  ALLOCATED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PICKING: 'bg-amber-50 text-amber-700 border-amber-200',
  PICKED: 'bg-violet-50 text-violet-700 border-violet-200',
  PACKED: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  SHIPPED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RECEIVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  IN_TRANSIT: 'bg-sky-50 text-sky-700 border-sky-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  UNPAID: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RESERVED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  POSTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  IN_STOCK: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
  SUCCESS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INACTIVE: 'bg-slate-100 text-slate-500 border-slate-200',
  EXPIRED: 'bg-rose-50 text-rose-700 border-rose-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  URGENT: 'bg-rose-50 text-rose-700 border-rose-200',
  NORMAL: 'bg-slate-100 text-slate-600 border-slate-200',
  LOW: 'bg-slate-100 text-slate-500 border-slate-200',
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'مفتوح',
  ALLOCATED: 'مخصص',
  PICKING: 'قيد التجهيز',
  PICKED: 'مجهز',
  PACKED: 'معبأ',
  SHIPPED: 'مشحون',
  RECEIVED: 'مستلم',
  PARTIAL: 'جزئي',
  CANCELLED: 'ملغي',
  DRAFT: 'مسودة',
  IN_TRANSIT: 'قيد النقل',
  COMPLETED: 'مكتمل',
  UNPAID: 'غير مدفوعة',
  PAID: 'مدفوعة',
  RESERVED: 'محجوز',
  POSTED: 'مرحّل',
  IN_STOCK: 'متاح',
  FAILED: 'فشل',
  SUCCESS: 'نجح',
  PENDING: 'معلق',
  HIGH: 'عالية',
  URGENT: 'عاجلة',
  NORMAL: 'عادية',
  LOW: 'منخفضة',
}

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  const t = useT()
  if (!status) return <span className="text-slate-400">—</span>
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-bold',
        STATUS_TONES[status] || 'bg-slate-100 text-slate-600 border-slate-200',
        className,
      )}
    >
      {t(STATUS_LABELS[status] || status)}
    </span>
  )
}

export function Badge({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode
  tone?: 'slate' | 'brand' | 'green' | 'amber' | 'rose' | 'sky' | 'violet'
  className?: string
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    sky: 'bg-sky-50 text-sky-700',
    violet: 'bg-violet-50 text-violet-700',
  }
  return (
    <span className={cx('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold', tones[tone], className)}>
      {children}
    </span>
  )
}

// ------------------------------------------------------------------- inputs
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('block', className)}>
      {label ? (
        <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-600">
          {label}
          {required ? <span className="text-rose-500">*</span> : null}
        </span>
      ) : null}
      {children}
      {hint && !error ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
      {error ? <span className="mt-1 block text-[11px] font-medium text-rose-600">{error}</span> : null}
    </label>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-400',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100',
        className,
      )}
      {...props}
    />
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  onKeyDown,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  onKeyDown?: InputHTMLAttributes<HTMLInputElement>['onKeyDown']
}) {
  const t = useT()
  return (
    <div className={cx('relative', className)}>
      <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder || t('بحث')}
        className="ps-9"
        onKeyDown={onKeyDown}
      />
    </div>
  )
}

// -------------------------------------------------------------------- modal
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px] sm:items-center print:hidden">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cx(
          'relative z-10 my-auto w-full rounded-2xl bg-white shadow-pop animate-fade-in',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            {title ? <h2 className="text-base font-extrabold text-slate-900">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <IconButton onClick={onClose} aria-label="close">
            <X size={18} />
          </IconButton>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

// -------------------------------------------------------------------- table
export function DataTable({
  headers,
  children,
  loading,
  empty,
  className,
  rowCount,
}: {
  headers: ReactNode[]
  children: ReactNode
  loading?: boolean
  empty?: boolean
  className?: string
  rowCount?: number
}) {
  const t = useT()
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70 text-start">
            {headers.map((header, index) => (
              <th
                key={index}
                className="whitespace-nowrap px-3.5 py-2.5 text-start text-[11px] font-bold uppercase tracking-wide text-slate-500"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-14 text-center text-slate-400">
                <Loader2 className="mx-auto mb-2 animate-spin" size={22} />
                {t('جاري التحميل...')}
              </td>
            </tr>
          ) : empty || rowCount === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-14 text-center text-slate-400">
                <Inbox className="mx-auto mb-2 opacity-40" size={26} />
                {t('لا توجد بيانات')}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2.5 text-xs text-slate-500">
      <span>
        {total} سجل — صفحة {page} / {pages}
      </span>
      <div className="flex items-center gap-1">
        <IconButton onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="previous">
          <ChevronRight size={16} />
        </IconButton>
        <IconButton onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="next">
          <ChevronLeft size={16} />
        </IconButton>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------- misc
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
      <Loader2 size={20} className="animate-spin" />
      {label}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        {icon || <Inbox size={22} />}
      </div>
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-6 text-slate-400">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'brand' | 'green' | 'amber' | 'rose' | 'violet' | 'sky'
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    violet: 'bg-violet-50 text-violet-700',
    sky: 'bg-sky-50 text-sky-700',
  }
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1.5 text-xl font-extrabold tracking-tight text-slate-900">{value}</p>
          {hint ? <p className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</p> : null}
        </div>
        {icon ? (
          <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tones[tone])}>{icon}</div>
        ) : null}
      </div>
    </Card>
  )
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: string; label: ReactNode; count?: number }[]
  active: string
  onChange: (id: string) => void
  className?: string
}) {
  return (
    <div className={cx('flex flex-wrap items-center gap-1 border-b border-slate-200', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cx(
            'relative -mb-px flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold transition-colors',
            active === tab.id
              ? 'border-b-2 border-brand-700 text-brand-800'
              : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span
              className={cx(
                'rounded-md px-1.5 py-0.5 text-[10px]',
                active === tab.id ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500',
              )}
            >
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

export function KeyValue({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-end text-xs font-semibold text-slate-800">{value}</span>
    </div>
  )
}

export function Alert({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  children: ReactNode
  className?: string
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    danger: 'border-rose-200 bg-rose-50 text-rose-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }
  return <div className={cx('rounded-xl border px-3.5 py-2.5 text-xs leading-6', tones[tone], className)}>{children}</div>
}
