import type { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

type Db = Prisma.TransactionClient

/**
 * Sequential, human friendly document numbers. Uses a counter table so numbers
 * never collide under concurrent requests.
 */
export async function nextNumber(prefix: string, tx: Db = prisma) {
  const counter = await tx.counter.upsert({
    where: { name: prefix },
    create: { name: prefix, value: 1 },
    update: { value: { increment: 1 } },
  })
  const year = new Date().getFullYear()
  return `${prefix}-${year}-${String(counter.value).padStart(5, '0')}`
}

export function nextSku(categoryCode: string, seq: number) {
  return `${categoryCode.toUpperCase()}-${String(seq).padStart(4, '0')}`
}

/** EAN-13 with a valid check digit, derived from a numeric seed. */
export function ean13(seed: number | string): string {
  const base = String(seed).replace(/\D/g, '').padStart(12, '0').slice(-12)
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3)
  const check = (10 - (sum % 10)) % 10
  return base + check
}
