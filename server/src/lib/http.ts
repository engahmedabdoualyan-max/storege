import type { ZodType } from 'zod'

export class ApiError extends Error {
  statusCode: number
  details?: unknown

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.details = details
  }
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ApiError(400, 'بيانات غير صحيحة / Invalid data', result.error.flatten())
  }
  return result.data
}

export function pagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

export function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

export function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function todayRange(date = new Date()) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  const cols = headers || (rows.length ? Object.keys(rows[0]) : [])
  const lines = [cols.join(',')]
  for (const row of rows) lines.push(cols.map((c) => csvEscape(row[c])).join(','))
  return '\uFEFF' + lines.join('\r\n')
}
