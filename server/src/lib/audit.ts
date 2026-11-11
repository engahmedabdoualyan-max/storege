import type { FastifyRequest } from 'fastify'
import { prisma } from './prisma'

export async function audit(
  req: FastifyRequest | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: unknown,
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req?.auth?.id || null,
        userName: req?.auth?.name || 'system',
        action,
        entity,
        entityId: entityId || null,
        details: details === undefined ? null : JSON.stringify(details),
        ip: req?.ip || null,
        userAgent: req?.headers['user-agent'] || null,
      },
    })
  } catch {
    // Auditing must never break a business operation.
  }
}
