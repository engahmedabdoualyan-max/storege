#!/usr/bin/env node
/**
 * Exit code 0 when the database already contains users (seed not needed),
 * 1 when it is empty or unreachable (the container entrypoint should seed).
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
let code = 1
try {
  const users = await prisma.user.count()
  code = users > 0 ? 0 : 1
} catch {
  code = 1
}
await prisma.$disconnect().catch(() => undefined)
process.exit(code)
