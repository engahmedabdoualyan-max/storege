import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'

type Tone = 'success' | 'error' | 'info' | 'warning'
type Toast = { id: string; message: string; tone: Tone }

const ToastContext = createContext<{ push: (message: string, tone?: Tone) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id))
    }, 4200)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  const icon = (tone: Tone) => {
    if (tone === 'success') return <CheckCircle2 size={18} />
    if (tone === 'error') return <XCircle size={18} />
    if (tone === 'warning') return <TriangleAlert size={18} />
    return <Info size={18} />
  }

  const style = (tone: Tone) => {
    if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    if (tone === 'error') return 'border-rose-200 bg-rose-50 text-rose-800'
    if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800'
    return 'border-sky-200 bg-sky-50 text-sky-800'
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-5 z-[100] flex w-[min(92vw,380px)] flex-col gap-2 print:hidden">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium shadow-pop animate-slide-in ${style(toast.tone)}`}
          >
            <span className="mt-0.5 shrink-0">{icon(toast.tone)}</span>
            <span className="flex-1 leading-6">{toast.message}</span>
            <button
              className="mt-0.5 rounded p-0.5 opacity-60 hover:opacity-100"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
              aria-label="close"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
