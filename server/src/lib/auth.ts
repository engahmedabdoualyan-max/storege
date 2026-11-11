import type { FastifyReply, FastifyRequest } from 'fastify'
import { createHash } from 'node:crypto'
import { prisma } from './prisma.js'
import { ApiError } from './http.js'

export type Role = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: Role
  tokenType?: 'jwt' | 'api'
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthUser
  }
}

const API_ROLE_BY_SCOPE: Record<string, Role> = {
  '*': 'ADMIN',
  manage: 'MANAGER',
  write: 'OPERATOR',
  read: 'VIEWER',
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function authenticate(req: FastifyRequest) {
  const apiKey =
    (req.headers['x-api-key'] as string | undefined)?.trim() ||
    (req.headers.authorization?.startsWith('ApiKey ')
      ? req.headers.authorization.slice(7).trim()
      : undefined)

  if (apiKey) {
    const token = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(apiKey) } })
    if (!token || !token.active) throw new ApiError(401, 'مفتاح API غير صالح / Invalid API key')
    const role = API_ROLE_BY_SCOPE[token.scopes] || 'VIEWER'
    req.auth = {
      id: `api:${token.id}`,
      name: token.name,
      email: '',
      role,
      tokenType: 'api',
    }
    void prisma.apiToken
      .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined)
    return
  }

  try {
    await req.jwtVerify()
  } catch {
    throw new ApiError(401, 'يلزم تسجيل الدخول / Authentication required')
  }
  const payload = req.user as { sub: string; name: string; email: string; role: Role }
  req.auth = {
    id: payload.sub,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    tokenType: 'jwt',
  }
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    if (!req.auth) throw new ApiError(401, 'يلزم تسجيل الدخول / Authentication required')
    if (req.auth.role === 'ADMIN') return
    if (!roles.includes(req.auth.role)) {
      throw new ApiError(403, 'ليس لديك صلاحية لهذه العملية / Forbidden')
    }
  }
}

export const canWrite = requireRole('MANAGER', 'OPERATOR')
export const canManage = requireRole('MANAGER')
export const adminOnly = requireRole()
export const reader = requireRole('MANAGER', 'OPERATOR', 'VIEWER')
