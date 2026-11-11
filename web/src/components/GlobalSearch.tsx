import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Box, MapPin, PackageSearch, Truck } from 'lucide-react'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { money } from '../lib/format'

type Result = {
  items: { id: string; name: string; sku: string; barcode: string | null; price: number }[]
  locations: { id: string; code: string; name: string | null; warehouse: { name: string } }[]
  orders: { id: string; number: string; status: string; customer?: { name: string } | null; supplier?: { name: string } | null; total: number }[]
}

export function GlobalSearch() {
  const t = useT()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null)
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await api.get<Result>(`/api/search?q=${encodeURIComponent(query.trim())}`)
        setResults(data)
        setOpen(true)
      } catch {
        setResults(null)
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const total = (results?.items.length || 0) + (results?.locations.length || 0) + (results?.orders.length || 0)

  return (
    <div className="relative w-full max-w-md" ref={ref}>
      <div className="relative">
        <PackageSearch size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder={t('بحث سريع...')}
          className="h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50/80 ps-9 pe-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
      </div>
      {open ? (
        <div className="absolute inset-x-0 top-11 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-pop animate-fade-in">
          {loading ? (
            <p className="px-3 py-4 text-center text-xs text-slate-400">{t('جاري التحميل...')}</p>
          ) : total === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-400">{t('لا توجد نتائج')}</p>
          ) : (
            <div className="space-y-2">
              {results?.items.length ? (
                <div>
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('الأصناف')}</p>
                  {results.items.map((item) => (
                    <Link
                      key={item.id}
                      to={`/items/${item.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-50"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                        <Box size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-slate-800">{item.name}</span>
                        <span className="block font-mono text-[10px] text-slate-400">{item.sku} · {item.barcode}</span>
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">{money(item.price)}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
              {results?.locations.length ? (
                <div>
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('المواقع والرفوف')}</p>
                  {results.locations.map((location) => (
                    <Link
                      key={location.id}
                      to={`/locations?focus=${location.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-50"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                        <MapPin size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-slate-800">{location.code}</span>
                        <span className="block text-[10px] text-slate-400">{location.warehouse?.name}</span>
                      </span>
                      <ArrowLeft size={13} className="text-slate-300" />
                    </Link>
                  ))}
                </div>
              ) : null}
              {results?.orders.length ? (
                <div>
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{t('الطلبات')}</p>
                  {results.orders.map((order) => (
                    <Link
                      key={order.id}
                      to={`/${order.status === 'OPEN' || order.supplier ? 'receiving' : 'sales-orders'}/${order.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-slate-50"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                        <Truck size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-xs font-bold text-slate-800">{order.number}</span>
                        <span className="block truncate text-[10px] text-slate-400">
                          {order.customer?.name || order.supplier?.name || ''}
                        </span>
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">{money(order.total)}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
