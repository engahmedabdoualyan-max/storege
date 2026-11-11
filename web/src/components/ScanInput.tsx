import { useEffect, useRef, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { CameraButton, CameraScanner } from './CameraScanner'
import { cx } from './ui'
import { useT } from '../lib/i18n'

/**
 * Scan input tuned for hardware barcode scanners (keyboard wedge + Enter)
 * as well as manual entry and phone cameras.
 */
export function ScanInput({
  value,
  onChange,
  onScan,
  placeholder,
  autoFocus = true,
  className,
  big = false,
  disabled,
}: {
  value: string
  onChange?: (value: string) => void
  onScan: (code: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  big?: boolean
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [camera, setCamera] = useState(false)
  const t = useT()

  useEffect(() => {
    if (autoFocus && !disabled) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 120)
      return () => window.clearTimeout(timer)
    }
  }, [autoFocus, disabled])

  const submit = (code: string) => {
    const clean = code.trim()
    if (!clean) return
    onScan(clean)
    if (onChange) onChange('')
    else if (inputRef.current) inputRef.current.value = ''
    window.setTimeout(() => inputRef.current?.focus(), 40)
  }

  return (
    <div className={cx('flex items-stretch gap-2', className)}>
      <div className="relative flex-1">
        <ScanLine
          size={big ? 22 : 17}
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-brand-600"
        />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => (onChange ? onChange(event.target.value) : undefined)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit(value || (event.target as HTMLInputElement).value)
            }
          }}
          placeholder={placeholder || t('امسح الباركود')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          disabled={disabled}
          className={cx(
            'w-full rounded-xl border-2 border-brand-200 bg-white ps-10 pe-3 font-mono font-semibold text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-slate-100',
            big ? 'h-14 text-lg' : 'h-11 text-sm',
          )}
        />
      </div>
      <button
        type="button"
        onClick={() => setCamera(true)}
        disabled={disabled}
        className={cx(
          'flex shrink-0 items-center justify-center rounded-xl border-2 border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50',
          big ? 'w-14' : 'w-11',
        )}
        title={t('مسح بالكاميرا')}
      >
        <CameraButtonIcon big={big} />
      </button>
      <CameraScanner open={camera} onClose={() => setCamera(false)} onScan={(code) => submit(code)} />
    </div>
  )
}

function CameraButtonIcon({ big }: { big?: boolean }) {
  return <span className={big ? 'scale-110' : ''}><CameraButtonIconInner /></span>
}

function CameraButtonIconInner() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  )
}

export { CameraButton }
