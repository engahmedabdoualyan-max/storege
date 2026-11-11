import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { Button, Modal } from './ui'
import { useT } from '../lib/i18n'

export function CameraScanner({
  open,
  onClose,
  onScan,
}: {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const t = useT()

  useEffect(() => {
    if (!open) return
    let controls: { stop: () => void } | null = null
    let cancelled = false
    setError('')
    ;(async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        if (!videoRef.current) return
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && !cancelled) {
            cancelled = true
            const text = result.getText()
            try {
              navigator.vibrate?.(80)
            } catch {
              /* ignore */
            }
            onScan(text)
            controls?.stop()
            onClose()
          }
        })
        if (cancelled) controls.stop()
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'تعذر فتح الكاميرا. تأكد من السماح بالوصول للكاميرا.',
        )
      }
    })()
    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [open, onScan, onClose])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('مسح بالكاميرا')}
      subtitle={t('وجّه الكاميرا نحو الباركود')}
      size="sm"
    >
      <div className="space-y-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-amber-400/80" />
          {!error ? (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-slate-950/60 py-2 text-[11px] font-semibold text-white">
              <Loader2 size={13} className="animate-spin" />
              {t('جاري المسح...')}
            </div>
          ) : null}
        </div>
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-6 text-rose-700">
            {error}
          </div>
        ) : null}
        <Button variant="secondary" className="w-full" onClick={onClose}>
          <X size={15} /> {t('إغلاق')}
        </Button>
      </div>
    </Modal>
  )
}

export function CameraButton({ onClick }: { onClick: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
      title={t('فتح الكاميرا')}
    >
      <Camera size={16} />
      <span className="hidden sm:inline">{t('الكاميرا')}</span>
    </button>
  )
}
