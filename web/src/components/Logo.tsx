export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-400 text-brand-950 shadow-sm">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9 12 4l9 5v10l-9 5-9-5V9Z" />
          <path d="m3 9 9 5 9-5M12 14v10" />
          <path d="M7 11.5v3M17 11.5v3" />
        </svg>
      </div>
      {!compact ? (
        <div className="leading-tight">
          <div className={light ? 'text-base font-extrabold tracking-tight text-white' : 'text-base font-extrabold tracking-tight text-slate-900'}>
            Storege
          </div>
          <div className={light ? 'text-[10px] font-semibold tracking-wide text-slate-400' : 'text-[10px] font-semibold tracking-wide text-slate-400'}>
            WAREHOUSE OS
          </div>
        </div>
      ) : null}
    </div>
  )
}
