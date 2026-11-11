import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  ArrowDownToLine,
  ArrowLeftRight,
  BarChart3,
  CalendarClock,
  BookOpen,
  Boxes,
  ClipboardCheck,
  Clock,
  MapPin,
  ClipboardList,
  FileText,
  HandCoins,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  PackageSearch,
  Plug,
  RotateCcw,
  Scale,
  ScanBarcode,
  Settings,
  ShieldCheck,
  Smartphone,
  Tag,
  Truck,
  Users,
  Warehouse,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { GlobalSearch } from './GlobalSearch'
import { Logo } from './Logo'
import { Button, cx, IconButton, StatusBadge } from './ui'
import { useAuth, ROLE_LABELS } from '../lib/auth'
import { LANGS, useI18n } from '../lib/i18n'
import { useWarehouse } from '../lib/warehouse'
import { useCompany } from '../lib/company'
import { flushQueue, queueCount } from '../lib/offline'
import { useToast } from '../lib/toast'
import { initials } from '../lib/format'

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; roles?: string[] }

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'الرئيسية',
    items: [{ to: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard }],
  },
  {
    group: 'العمليات',
    items: [
      { to: '/receiving', label: 'الاستلام', icon: Truck },
      { to: '/quality', label: 'فحص الجودة', icon: ShieldCheck },
      { to: '/sales-orders', label: 'أوامر البيع', icon: ClipboardList },
      { to: '/picking', label: 'التجهيز والشحن', icon: PackageSearch },
      { to: '/wave-picking', label: 'موجات الالتقاط', icon: Layers },
      { to: '/transfers', label: 'التحويلات', icon: ArrowLeftRight },
      { to: '/docks', label: 'جدولة الأرصفة', icon: CalendarClock },
      { to: '/returns', label: 'المرتجعات (RMA)', icon: RotateCcw },
      { to: '/yard', label: 'ساحة الشاحنات', icon: MapPin },
      { to: '/labor', label: 'إنتاجية العمالة', icon: Clock },
      { to: '/counts', label: 'الجرد', icon: ClipboardCheck },
    ],
  },
  {
    group: 'المخزون',
    items: [
      { to: '/inventory', label: 'المخزون', icon: Boxes },
      { to: '/replenishment', label: 'إعادة التعبئة', icon: ArrowDownToLine },
      { to: '/totals', label: 'إجمالي البضائع', icon: Layers },
      { to: '/items', label: 'الأصناف', icon: Tag },
      { to: '/locations', label: 'المواقع والرفوف', icon: MapPin },
      { to: '/labels', label: 'الباركود والليبلات', icon: ScanBarcode },
    ],
  },
  {
    group: 'التجارة',
    items: [
      { to: '/partners', label: 'الموردون والعملاء', icon: Users },
      { to: '/invoices', label: 'الفواتير', icon: FileText },
    ],
  },
  {
    group: 'التحليلات',
    items: [
      { to: '/reports', label: 'التقارير', icon: BarChart3 },
      { to: '/reconciliation', label: 'مطابقة المشتريات', icon: Scale },
    ],
  },
  {
    group: 'الإدارة',
    items: [
      { to: '/users', label: 'المستخدمون', icon: ShieldCheck, roles: ['ADMIN'] },
      { to: '/settings', label: 'الإعدادات', icon: Settings, roles: ['ADMIN', 'MANAGER'] },
      { to: '/audit', label: 'سجل النشاط', icon: Activity, roles: ['ADMIN', 'MANAGER'] },
      { to: '/integrations', label: 'التكاملات', icon: Plug, roles: ['ADMIN', 'MANAGER'] },
    ],
  },
]

export function Layout() {
  const { user, logout, can } = useAuth()
  const { lang, setLang, t } = useI18n()
  const { warehouses, warehouseId, setWarehouseId } = useWarehouse()
  const { logoUrl, name } = useCompany()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [queued, setQueued] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSidebarOpen(false)
    setUserMenu(false)
  }, [location.pathname])

  useEffect(() => {
    const refresh = () => queueCount().then(setQueued)
    refresh()
    const onQueue = () => refresh()
    const onOnline = () => {
      setOnline(true)
      refresh()
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('storege:queue', onQueue)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const interval = window.setInterval(refresh, 15000)
    return () => {
      window.removeEventListener('storege:queue', onQueue)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setUserMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const sync = async () => {
    setSyncing(true)
    try {
      const result = await flushQueue()
      setQueued(result.remaining)
      if (result.sent) toast.push(`${t('تمت المزامنة')} (${result.sent})`)
      if (result.errors.length) toast.push(result.errors[0], 'warning')
      if (!result.sent && !result.failed) toast.push(t('لا توجد عمليات بانتظار المزامنة'), 'info')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-800">
      {/* Sidebar */}
      <aside
        className={cx(
          'fixed inset-y-0 end-0 z-40 flex w-[268px] flex-col bg-brand-950 text-slate-300 transition-transform duration-200 print:hidden',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={name} className="h-9 w-9 shrink-0 rounded-xl border border-white/10 bg-white object-contain" />
            ) : (
              <Logo light compact />
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold text-white">{name}</span>
              <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">Storege WMS</span>
            </span>
          </Link>
          <button className="text-slate-400 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="border-b border-white/10 p-3">
          <label className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Warehouse size={11} /> {t('المخزن الحالي')}
          </label>
          <select
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs font-bold text-white outline-none focus:border-accent-400/60"
          >
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id} className="text-slate-900">
                {warehouse.name} ({warehouse.code})
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {NAV.map((group) => {
            const items = group.items.filter(
              (item) => !item.roles || (user && (user.role === 'ADMIN' || item.roles.includes(user.role))),
            )
            if (!items.length) return null
            return (
              <div key={group.group} className="mb-4">
                <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {t(group.group)}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                          cx(
                            'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors',
                            isActive
                              ? 'bg-white/10 text-white shadow-inner'
                              : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <Icon size={16} className={isActive ? 'text-accent-400' : 'text-slate-500 group-hover:text-slate-300'} />
                            <span className="flex-1">{t(item.label)}</span>
                            {isActive ? <span className="h-1.5 w-1.5 rounded-full bg-accent-400" /> : null}
                          </>
                        )}
                      </NavLink>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <Link
            to="/m"
            className="mb-2 flex items-center gap-2.5 rounded-xl border border-accent-400/20 bg-accent-400/10 px-3 py-2.5 text-xs font-bold text-accent-200 hover:bg-accent-400/15"
          >
            <Smartphone size={16} />
            <span className="flex-1">{t('وضع الكف')} / Handheld</span>
            <ArrowLeft size={14} />
          </Link>
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-[11px] font-bold text-white">
              {user ? initials(user.name) : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold text-white">{user?.name}</p>
              <p className="truncate text-[10px] text-slate-400">{user ? ROLE_LABELS[user.role] : ''}</p>
            </div>
            <button onClick={logout} className="text-slate-400 hover:text-rose-300" title={t('تسجيل الخروج')}>
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* Main */}
      <div className="lg:pe-[268px] print:pe-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur lg:px-6 print:hidden">
          <button className="text-slate-500 lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="hidden flex-1 md:block">
            <GlobalSearch />
          </div>
          <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
            <div
              className={cx(
                'hidden items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-bold sm:flex',
                online
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700',
              )}
              title={online ? t('متصل') : t('غير متصل')}
            >
              {online ? <Wifi size={13} /> : <WifiOff size={13} />}
              {online ? t('متصل') : t('غير متصل')}
            </div>
            {queued > 0 ? (
              <Button size="sm" variant="secondary" onClick={sync} loading={syncing} className="!h-8">
                <ArrowLeftRight size={13} />
                <span className="hidden sm:inline">{t('قائمة الانتظار')}</span>
                <span className="rounded-md bg-amber-100 px-1.5 text-[10px] font-extrabold text-amber-700">{queued}</span>
              </Button>
            ) : null}
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value as typeof lang)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] font-extrabold text-slate-600 outline-none hover:bg-slate-50"
              title={t('اللغة')}
            >
              {LANGS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.native}
                </option>
              ))}
            </select>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setUserMenu((open) => !open)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-950 text-[11px] font-bold text-white"
              >
                {user ? initials(user.name) : '?'}
              </button>
              {userMenu ? (
                <div className="absolute end-0 top-10 z-40 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-pop animate-fade-in">
                  <div className="border-b border-slate-100 px-2.5 py-2">
                    <p className="text-xs font-bold text-slate-800">{user?.name}</p>
                    <p className="truncate text-[10px] text-slate-400">{user?.email}</p>
                    <div className="mt-1"><StatusBadge status={user?.role === 'ADMIN' ? 'ACTIVE' : 'NORMAL'} className="!text-[9px]" /></div>
                  </div>
                  <Link
                    to="/settings"
                    className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Settings size={14} /> {t('الإعدادات')}
                  </Link>
                  <button
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut size={14} /> {t('تسجيل الخروج')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="border-b border-slate-200/60 bg-white px-4 py-2 md:hidden print:hidden">
          <GlobalSearch />
        </div>

        <main className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6 lg:py-6">
          <Outlet />
        <Link
          to="/manual"
          className="fixed bottom-5 end-5 z-50 flex h-12 w-12 animate-bounce items-center justify-center rounded-full bg-brand-950 text-accent-400 shadow-pop ring-4 ring-accent-400/20 transition hover:scale-110"
          title={t('كتيب الاستخدام')}
        >
          <BookOpen size={20} />
        </Link>
        <footer className="mt-6 border-t border-slate-200/60 px-4 py-3 text-center text-[11px] text-slate-400 print:hidden">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-2">
              <img src="/fimtosoft-logo.jpg" alt="FimtoSoft" className="h-6 w-6 rounded object-contain" />
              {t('تطوير')}{' '}
              <a href="https://www.fimtosoft.com" target="_blank" rel="noreferrer" className="font-extrabold text-brand-700 hover:underline">
                FimtoSoft
              </a>
              {' '}— www.fimtosoft.com
            </span>
            <a
              href="https://github.com/engahmedabdoualyan-max/storege/releases/latest/download/app-debug.apk"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition hover:bg-emerald-700"
              target="_blank"
              rel="noreferrer"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
              </svg>
              {t('تحميل التطبيق Android')}
            </a>
          </div>
        </footer>
        </main>
        <footer className="mx-auto max-w-[1500px] px-6 pb-6 text-center text-[10px] text-slate-400 print:hidden">
          Storege WMS v1.0 · صُنع لإدارة مخازن أسرع وأدق
        </footer>
      </div>
    </div>
  )
}
