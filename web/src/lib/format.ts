export function money(value: number | null | undefined, lang: string = 'ar') {
  const number = Number(value || 0)
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: number % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(number)
  return `${formatted} ${lang === 'ar' ? 'ر.س' : 'SAR'}`
}

export function num(value: number | null | undefined, digits = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number(value || 0))
}

export function qty(value: number | null | undefined) {
  return num(value, 3)
}

const LOCALES: Record<string, string> = {
  ar: 'ar-SA',
  en: 'en-GB',
  ur: 'ur-PK',
  hi: 'hi-IN',
  bn: 'bn-BD',
  de: 'de-DE',
  it: 'it-IT',
  zh: 'zh-CN',
  ja: 'ja-JP',
}

const locale = (lang: string) => LOCALES[lang] || 'en-GB'

export function date(value: string | Date | null | undefined, lang: string = 'ar') {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale(lang), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function dateTime(value: string | Date | null | undefined, lang: string = 'ar') {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(locale(lang), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function timeAgo(value: string | Date | null | undefined, lang: string = 'ar') {
  if (!value) return '—'
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return lang === 'ar' ? 'الآن' : 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return lang === 'ar' ? `منذ ${minutes} د` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return lang === 'ar' ? `منذ ${hours} س` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  return lang === 'ar' ? `منذ ${days} يوم` : `${days}d ago`
}

export function shortDate(value: string | Date | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
}
