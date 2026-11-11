import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Boxes, CheckCircle2, Loader2, LockKeyhole, Mail, ScanBarcode, ShieldCheck, Truck } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Button, Input } from '../components/ui'
import { useAuth } from '../lib/auth'
import { LANGS, useI18n } from '../lib/i18n'

const DEMO_USERS = [
  { label: 'مدير النظام', email: 'admin@storege.app', password: 'Admin@12345' },
  { label: 'مدير مخزن', email: 'manager@storege.app', password: 'Manager@12345' },
  { label: 'موظف مخزن', email: 'operator@storege.app', password: 'Operator@12345' },
  { label: 'مشاهد', email: 'viewer@storege.app', password: 'Viewer@12345' },
]

const FEATURES = [
  { icon: ScanBarcode, title: 'باركود وأجهزة كف', text: 'استلام وتجهيز وجرد بالمسح على أي جهاز' },
  { icon: Boxes, title: 'مخازن ومواقع متعددة', text: 'تحكم كامل في الرفوف والتحويلات بين المخازن' },
  { icon: Truck, title: 'أوامر بيع وشراء', text: 'دورة تشغيل كاملة من المورد إلى العميل' },
  { icon: ShieldCheck, title: 'صلاحيات وتقارير', text: 'أدوار مستخدمين، سجل نشاط وتقارير تحليلية' },
]

export default function Login() {
  const { user, login } = useAuth()
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('admin@storege.app')
  const [password, setPassword] = useState('Admin@12345')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to={params.get('next') || '/dashboard'} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(email.trim(), password)
      navigate(params.get('next') || '/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? String(err.message) : t('خطأ في تسجيل الدخول'))
    } finally {
      setLoading(false)
    }
  }

  const fill = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail)
    setPassword(demoPassword)
    setError('')
  }

  return (
    <div className="flex min-h-screen bg-[#f6f7fb]">
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-brand-950 p-10 text-white lg:flex">
        <div className="absolute -end-24 -top-24 h-96 w-96 rounded-full bg-accent-400/10 blur-3xl" />
        <div className="absolute -bottom-32 -start-20 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative">
          <Logo light />
          <p className="mt-3 max-w-xs text-xs leading-6 text-slate-400">
            نظام إدارة مخازن احترافي، عربي بالكامل، يعمل على المتصفح وأجهزة الكف حتى بدون إنترنت.
          </p>
        </div>

        <div className="relative my-10">
          <h1 className="max-w-md text-3xl font-extrabold leading-[1.5]">
            مخزنك يعمل
            <span className="mx-2 rounded-xl bg-accent-400 px-2 text-brand-950">أسرع</span>
            وأكثر دقة.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-7 text-slate-400">
            كل حركة مخزون مسجلة، كل رف معروف، وكل طلب يصل في وقته. من الاستلام حتى الشحن.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-1 gap-2.5">
            {FEATURES.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-400/15 text-accent-300">
                    <Icon size={16} />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white">{feature.title}</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-slate-400">{feature.text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-[11px] text-slate-500">
          <CheckCircle2 size={13} className="text-emerald-400" />
          بيانات تجريبية جاهزة · SQLite / PostgreSQL · REST API
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
        <select
          value={lang}
          onChange={(event) => setLang(event.target.value as typeof lang)}
          className="absolute end-5 top-5 flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-extrabold text-slate-600 hover:bg-slate-50"
          title={t('اللغة')}
        >
          {LANGS.map((item) => (
            <option key={item.code} value={item.code}>{item.native}</option>
          ))}
        </select>

        <div className="w-full max-w-[420px]">
          <div className="mb-7 lg:hidden">
            <Logo />
          </div>

          <h2 className="text-2xl font-extrabold text-slate-900">{t('أهلاً بعودتك')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('سجّل الدخول للمتابعة إلى المخزن')}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-600">{t('البريد الإلكتروني')}</span>
              <div className="relative">
                <Mail size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="username"
                  className="h-11 ps-9"
                  placeholder="name@company.com"
                  dir="ltr"
                  aria-label={t('البريد الإلكتروني')}
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-600">{t('كلمة المرور')}</span>
              <div className="relative">
                <LockKeyhole size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-11 ps-9"
                  placeholder="••••••••"
                  dir="ltr"
                  aria-label={t('كلمة المرور')}
                />
              </div>
            </label>

            {error ? (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? <Loader2 size={17} className="animate-spin" /> : null}
              {loading ? t('جاري الدخول...') : t('دخول')}
              {!loading ? <ArrowLeft size={16} /> : null}
            </Button>
          </form>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-card">
            <p className="mb-2 text-[11px] font-bold text-slate-500">{t('بيانات الدخول التجريبية')}</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => fill(demo.email, demo.password)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-start text-[11px] font-semibold text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
                >
                  {demo.label}
                  <span className="mt-0.5 block truncate font-mono text-[9px] text-slate-400" dir="ltr">
                    {demo.email}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-center text-[10px] leading-5 text-slate-400">
            Storege WMS v1.0 · بالدخول أنت توافق على سياسة الاستخدام الداخلية
          </p>
        </div>
      </div>
    </div>
  )
}
