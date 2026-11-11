#!/usr/bin/env node
/**
 * Storege WMS — switch the Prisma datasource between SQLite (default) and PostgreSQL.
 *
 * Usage:
 *   node scripts/use-postgres.mjs                       # switch to PostgreSQL (uses POSTGRES_URL or default)
 *   DATABASE_URL=postgresql://... node scripts/use-postgres.mjs
 *   node scripts/use-postgres.mjs --sqlite              # switch back to SQLite
 *   node scripts/use-postgres.mjs --url "postgresql://..." --no-env
 *
 * The script edits:
 *   server/prisma/schema.prisma  -> datasource provider
 *   server/.env                  -> DATABASE_URL (unless --no-env is passed)
 *
 * After switching, run:  npm run db:generate && npm run db:push && npm run db:seed
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schemaPath = path.join(root, 'server', 'prisma', 'schema.prisma')
const envPath = path.join(root, 'server', '.env')
const envExamplePath = path.join(root, 'server', '.env.example')

const args = process.argv.slice(2)
const toSqlite = args.includes('--sqlite') || args.includes('--sqlite3')
const noEnv = args.includes('--no-env')
const urlFlagIndex = args.findIndex((a) => a === '--url')
const urlFlag = urlFlagIndex >= 0 ? args[urlFlagIndex + 1] : undefined

const DEFAULT_POSTGRES = 'postgresql://storege:storege@localhost:5432/storege?schema=public'
const DEFAULT_SQLITE = 'file:./dev.db'

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

if (!existsSync(schemaPath)) fail(`schema.prisma not found at ${schemaPath}`)

const provider = toSqlite ? 'sqlite' : 'postgresql'
const databaseUrl = toSqlite
  ? process.env.DATABASE_URL_SQLITE || DEFAULT_SQLITE
  : urlFlag || process.env.DATABASE_URL || process.env.POSTGRES_URL || DEFAULT_POSTGRES

if (!toSqlite && !/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  fail(`DATABASE_URL must start with postgresql:// (got: ${databaseUrl})`)
}
if (toSqlite && /^postgres(ql)?:\/\//i.test(databaseUrl)) {
  fail('Refusing to write a PostgreSQL URL into a SQLite schema.')
}

// ---------------------------------------------------------------- schema
let schema = readFileSync(schemaPath, 'utf8')
const datasourceRe = /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"(sqlite|postgresql)"/s
if (!datasourceRe.test(schema)) fail('Could not find the datasource provider in schema.prisma')
schema = schema.replace(datasourceRe, `$1"${provider}"`)
writeFileSync(schemaPath, schema)

// ---------------------------------------------------------------- env
let envUpdated = false
if (!noEnv) {
  let env = existsSync(envPath)
    ? readFileSync(envPath, 'utf8')
    : existsSync(envExamplePath)
      ? readFileSync(envExamplePath, 'utf8')
      : ''
  const line = `DATABASE_URL="${databaseUrl}"`
  if (/^DATABASE_URL=.*$/m.test(env)) {
    env = env.replace(/^DATABASE_URL=.*$/m, line)
  } else {
    env = `${line}\n${env}`
  }
  writeFileSync(envPath, env)
  envUpdated = true
}

console.log(`
✔ Prisma datasource switched to: ${provider}
✔ DATABASE_URL: ${toSqlite ? databaseUrl : databaseUrl.replace(/:\/\/([^:@/]+):([^@/]+)@/, '://$1:••••@')}
${envUpdated ? '✔ server/.env updated' : '• server/.env unchanged (--no-env)'}

Next steps:
  1. npm run db:generate
  2. npm run db:push
  3. npm run db:seed        # optional demo data

${toSqlite ? '' : 'Tip: start PostgreSQL with  docker compose up -d db'}
`)

if (toSqlite) {
  console.log('To return to PostgreSQL later:  npm run db:postgres\n')
} else {
  console.log('To return to SQLite later:      node scripts/use-postgres.mjs --sqlite\n')
}
