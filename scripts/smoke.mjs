#!/usr/bin/env node
/**
 * Storege WMS — API smoke test.
 *
 * Read-only by default. It logs in with the seeded demo users and exercises
 * every major read endpoint, permission rules and authentication.
 *
 * Usage:
 *   npm run smoke                         # against http://localhost:4000
 *   SMOKE_BASE=http://host:4000 npm run smoke
 *   npm run smoke -- --write              # also exercises write/idempotency paths
 *
 * Exit code is 0 when every check passes, 1 otherwise.
 */
const BASE = (process.env.SMOKE_BASE || process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '')
const WRITE = process.argv.includes('--write')

const DEMO = {
  admin: { email: process.env.SMOKE_ADMIN_EMAIL || 'admin@storege.app', password: process.env.SMOKE_ADMIN_PASSWORD || 'Admin@12345' },
  manager: { email: 'manager@storege.app', password: 'Manager@12345' },
  viewer: { email: 'viewer@storege.app', password: 'Viewer@12345' },
}

let passed = 0
let failed = 0
const failures = []

function ok(name, info = '') {
  passed += 1
  console.log(`  ✔ ${name}${info ? ` — ${info}` : ''}`)
}

function bad(name, error) {
  failed += 1
  failures.push({ name, error })
  console.log(`  ✖ ${name} — ${error}`)
}

async function call(path, { method = 'GET', token, body, headers = {}, expect = 200 } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (res.status !== expect) {
    throw new Error(`${method} ${path} → HTTP ${res.status} (expected ${expect}): ${text.slice(0, 240)}`)
  }
  return { status: res.status, data, headers: res.headers }
}

async function check(name, fn) {
  try {
    const info = await fn()
    ok(name, typeof info === 'string' ? info : '')
  } catch (error) {
    bad(name, error instanceof Error ? error.message : String(error))
  }
}

async function login(credentials) {
  const { data } = await call('/api/auth/login', { method: 'POST', body: credentials })
  if (!data?.token) throw new Error('No token returned by /api/auth/login')
  return data.token
}

function arr(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.rows)) return value.rows
  if (Array.isArray(value?.data)) return value.data
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.results)) return value.results
  return null
}

async function main() {
  console.log(`\nStorege WMS smoke test → ${BASE}${WRITE ? ' (write mode)' : ' (read-only)'}\n`)

  // ------------------------------------------------------------ health
  console.log('Health & auth')
  await check('GET /api/health', async () => {
    const { data } = await call('/api/health')
    if (data.status !== 'ok') throw new Error(`status=${data.status} ${data.error || ''}`)
    return `v${data.version}`
  })

  let admin
  await check('POST /api/auth/login (admin)', async () => {
    admin = await login(DEMO.admin)
    return 'token received'
  })
  if (!admin) {
    console.log('\nCannot continue without an admin token.\n')
    return finish()
  }

  await check('GET /api/auth/me', async () => {
    const { data } = await call('/api/auth/me', { token: admin })
    if (!data?.email) throw new Error('empty profile')
    return `${data.name} (${data.role})`
  })

  await check('rejects bad credentials with 401', async () => {
    await call('/api/auth/login', { method: 'POST', body: { email: DEMO.admin.email, password: 'wrong-password' }, expect: 401 })
    return '401 as expected'
  })

  await check('rejects unauthenticated API access with 401', async () => {
    await call('/api/items', { expect: 401 })
    return '401 as expected'
  })

  await check('viewer cannot write (403)', async () => {
    const viewer = await login(DEMO.viewer)
    await call('/api/items', {
      method: 'POST',
      token: viewer,
      expect: 403,
      body: { sku: `SMOKE-${Date.now()}`, name: 'Smoke test item', categoryId: null },
    })
    return '403 as expected'
  })

  // ------------------------------------------------------------ reads
  console.log('\nCore data')
  const listChecks = [
    ['/api/items?pageSize=5', 'items'],
    ['/api/categories', 'categories'],
    ['/api/warehouses', 'warehouses'],
    ['/api/zones', 'zones'],
    ['/api/locations?pageSize=10', 'locations'],
    ['/api/inventory?pageSize=10', 'inventory'],
    ['/api/inventory/summary', 'inventory summary'],
    ['/api/inventory/movements?pageSize=10', 'movements'],
    ['/api/lots', 'lots'],
    ['/api/serials', 'serials'],
    ['/api/suppliers?pageSize=5', 'suppliers'],
    ['/api/customers?pageSize=5', 'customers'],
    ['/api/purchase-orders?pageSize=5', 'purchase orders'],
    ['/api/receipts?pageSize=5', 'receipts'],
    ['/api/putaway/pending', 'putaway queue'],
    ['/api/sales-orders?pageSize=5', 'sales orders'],
    ['/api/picking/queue', 'picking queue'],
    ['/api/shipping/queue', 'shipping queue'],
    ['/api/shipments?pageSize=5', 'shipments'],
    ['/api/transfers?pageSize=5', 'transfers'],
    ['/api/cycle-counts?pageSize=5', 'cycle counts'],
    ['/api/invoices?pageSize=5', 'invoices'],
    ['/api/dashboard', 'dashboard'],
    ['/api/settings', 'settings'],
    ['/api/audit?pageSize=5', 'audit log'],
    ['/api/system/info', 'system info'],
    ['/api/tokens', 'API tokens'],
    ['/api/webhooks', 'webhooks'],
  ]

  for (const [path, label] of listChecks) {
    await check(`GET ${path.split('?')[0]}`, async () => {
      const { data } = await call(path, { token: admin })
      const rows = arr(data)
      if (rows) return `${rows.length} rows`
      if (data && typeof data === 'object') return Object.keys(data).slice(0, 4).join(', ')
      return 'ok'
    })
  }

  // ------------------------------------------------------------ search + lookup
  console.log('\nSearch & lookup')
  await check('GET /api/search?q=PMP', async () => {
    const { data } = await call('/api/search?q=PMP', { token: admin })
    const count = arr(data)?.length ?? arr(data?.items)?.length ?? 0
    return `${count} results`
  })

  await check('GET /api/lookup/:code', async () => {
    const { data: items } = await call('/api/items?pageSize=1', { token: admin })
    const rows = arr(items) || []
    if (!rows.length) return 'skipped (no items)'
    const code = rows[0].sku || rows[0].barcode
    if (!code) return 'skipped (no barcode)'
    const { data } = await call(`/api/lookup/${encodeURIComponent(code)}`, { token: admin })
    if (!data) throw new Error('empty lookup')
    return code
  })

  // ------------------------------------------------------------ reports
  console.log('\nTotals & reconciliation')
  await check('/api/inventory/totals — overall and breakdowns', async () => {
    const { data } = await call('/api/inventory/totals', { token: admin })
    if (!data.overall || !Array.isArray(data.byWarehouse) || !Array.isArray(data.byCategory)) throw new Error('missing totals')
    if (!('strategicAlerts' in data.overall)) throw new Error('missing strategic alerts')
  })
  await check('/api/reports/purchase-reconciliation — invoice vs stock', async () => {
    const { data } = await call('/api/reports/purchase-reconciliation', { token: admin })
    if (!Array.isArray(data.rows) || !data.totals) throw new Error('missing reconciliation')
  })

  console.log('\nReports')
  const reportPaths = [
    '/api/reports/stock-valuation',
    '/api/reports/low-stock',
    '/api/reports/expiry',
    '/api/reports/movement',
    '/api/reports/dead-stock',
    '/api/reports/productivity',
    '/api/reports/top-items',
    '/api/reports/abc',
    '/api/reports/count-accuracy',
  ]
  for (const path of reportPaths) {
    await check(`GET ${path}`, async () => {
      const { data } = await call(path, { token: admin })
      const rows = arr(data)
      if (rows) return `${rows.length} rows`
      return 'ok'
    })
  }

  // ------------------------------------------------------------ exports
  console.log('\nExports')
  for (const path of ['/api/items/export.csv', '/api/invoices/export.csv', '/api/audit/export.csv']) {
    await check(`GET ${path}`, async () => {
      const { data } = await call(path, { token: admin })
      const text = typeof data === 'string' ? data : JSON.stringify(data)
      if (text.length < 2) throw new Error('empty export')
      return `${text.length} bytes`
    })
  }

  // ------------------------------------------------------------ write + idempotency
  if (WRITE) {
    console.log('\nWrites & offline idempotency')
    await check('POST /api/cycle-counts with X-Op-Id is replayed once', async () => {
      const { data: warehouses } = await call('/api/warehouses', { token: admin })
      const warehouse = (arr(warehouses) || warehouses)[0]
      if (!warehouse) return 'skipped (no warehouse)'
      const { data: zones } = await call(`/api/zones?warehouseId=${warehouse.id}`, { token: admin })
      const zone = (arr(zones) || zones)[0]
      const { data: locations } = await call(`/api/locations?warehouseId=${warehouse.id}&pageSize=1`, { token: admin })
      const location = (arr(locations) || locations)[0]

      const opId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const body = {
        warehouseId: warehouse.id,
        zoneId: zone?.id ?? null,
        locationId: location?.id ?? null,
        type: 'LOCATION',
        notes: 'smoke test — safe to delete',
      }
      const first = await call('/api/cycle-counts', { method: 'POST', token: admin, body, headers: { 'x-op-id': opId } })
      const second = await call('/api/cycle-counts', { method: 'POST', token: admin, body, headers: { 'x-op-id': opId } })
      const replay = second.headers.get('x-idempotent-replay') === 'true'
      if (!replay) throw new Error('second call was not marked as idempotent replay')
      const id = first.data?.count?.id || first.data?.id
      if (id) await call(`/api/cycle-counts/${id}/cancel`, { method: 'POST', token: admin })
      return `count ${id ? 'created & cancelled' : 'created'}`
    })
  }

  finish()
}

function finish() {
  console.log(`\n${failed === 0 ? '✔ PASS' : '✖ FAIL'} — ${passed} passed, ${failed} failed`)
  if (failures.length) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  • ${f.name}: ${f.error}`)
  }
  console.log('')
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('\n✖ Smoke test crashed:', error)
  process.exit(1)
})
