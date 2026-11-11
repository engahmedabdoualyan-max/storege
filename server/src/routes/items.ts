import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parse as parseCsv } from 'csv-parse/sync'
import { prisma } from '../lib/prisma.js'
import { audit } from '../lib/audit.js'
import { ApiError, num, pagination, parse, str, toCsv } from '../lib/http.js'
import { canManage, canWrite } from '../lib/auth.js'
import { ean13 } from '../lib/numbers.js'
import { emitEvent } from '../lib/webhooks.js'

const itemSchema = z.object({
  sku: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  unit: z.string().min(1).optional(),
  brand: z.string().optional().nullable(),
  cost: z.coerce.number().min(0).optional(),
  price: z.coerce.number().min(0).optional(),
  minStock: z.coerce.number().min(0).optional(),
  strategicStock: z.coerce.number().min(0).optional(),
  maxStock: z.coerce.number().min(0).optional(),
  reorderQty: z.coerce.number().min(0).optional(),
  shelfLifeDays: z.coerce.number().min(0).optional(),
  trackLot: z.boolean().optional(),
  trackSerial: z.boolean().optional(),
  active: z.boolean().optional(),
  imageUrl: z.string().optional().nullable(),
})

async function generateBarcode() {
  for (let i = 0; i < 25; i++) {
    const counter = await prisma.counter.upsert({
      where: { name: 'BARCODE' },
      create: { name: 'BARCODE', value: 1001 },
      update: { value: { increment: 1 } },
    })
    const code = ean13(200000000000 + counter.value)
    const exists = await prisma.item.findFirst({ where: { barcode: code } })
    if (!exists) return code
  }
  throw new ApiError(500, 'تعذر توليد باركود فريد')
}

async function generateSku(categoryId?: string | null) {
  let prefix = 'SKU'
  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } })
    if (category) prefix = category.code.toUpperCase()
  }
  const counter = await prisma.counter.upsert({
    where: { name: `SKU-${prefix}` },
    create: { name: `SKU-${prefix}`, value: 1 },
    update: { value: { increment: 1 } },
  })
  return `${prefix}-${String(counter.value).padStart(4, '0')}`
}

function stockStatsMap(rows: { itemId: string; quantity: number; reserved: number }[]) {
  const map = new Map<string, { onHand: number; reserved: number }>()
  for (const row of rows) {
    const current = map.get(row.itemId) || { onHand: 0, reserved: 0 }
    current.onHand += row.quantity
    current.reserved += row.reserved
    map.set(row.itemId, current)
  }
  for (const [key, value] of map) {
    map.set(key, {
      onHand: Math.round(value.onHand * 1000) / 1000,
      reserved: Math.round(value.reserved * 1000) / 1000,
    })
  }
  return map
}

export async function itemRoutes(app: FastifyInstance) {
  app.get('/api/items', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = { ...(q.active === 'false' ? {} : { active: true }) }
    if (q.active === 'all') delete where.active
    if (q.categoryId) where.categoryId = q.categoryId
    if (q.q) {
      where.OR = [
        { sku: { contains: q.q } },
        { name: { contains: q.q } },
        { barcode: { contains: q.q } },
        { brand: { contains: q.q } },
      ]
    }

    const all = await prisma.item.findMany({
      where,
      include: { category: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    })
    const stats = stockStatsMap(
      await prisma.stock.findMany({
        where: { itemId: { in: all.map((i) => i.id) } },
        select: { itemId: true, quantity: true, reserved: true },
      }),
    )
    let enriched = all.map((item) => {
      const s = stats.get(item.id) || { onHand: 0, reserved: 0 }
      return {
        ...item,
        onHand: s.onHand,
        reserved: s.reserved,
        available: Math.round((s.onHand - s.reserved) * 1000) / 1000,
        stockValue: Math.round(s.onHand * item.cost * 100) / 100,
        threshold: item.strategicStock > 0 ? item.strategicStock : item.minStock,
        strategic: item.strategicStock > 0,
        lowStock:
          (item.strategicStock > 0 ? item.strategicStock : item.minStock) > 0 &&
          s.onHand < (item.strategicStock > 0 ? item.strategicStock : item.minStock),
      }
    })
    if (q.lowStock === '1') enriched = enriched.filter((i) => i.lowStock)
    if (q.trackLot === '1') enriched = enriched.filter((i) => i.trackLot)
    if (q.trackSerial === '1') enriched = enriched.filter((i) => i.trackSerial)
    const total = enriched.length
    return { items: enriched.slice(skip, skip + take), total, page, pageSize }
  })

  app.get('/api/items/export.csv', async (req, reply) => {
    const q = req.query as Record<string, string>
    const items = await prisma.item.findMany({
      where: q.q
        ? { OR: [{ sku: { contains: q.q } }, { name: { contains: q.q } }, { barcode: { contains: q.q } }] }
        : {},
      include: { category: true },
      orderBy: { name: 'asc' },
    })
    const stats = stockStatsMap(
      await prisma.stock.findMany({
        where: { itemId: { in: items.map((i) => i.id) } },
        select: { itemId: true, quantity: true, reserved: true },
      }),
    )
    const rows = items.map((i) => ({
      sku: i.sku,
      name: i.name,
      barcode: i.barcode || '',
      category: i.category?.name || '',
      unit: i.unit,
      cost: i.cost,
      price: i.price,
      onHand: stats.get(i.id)?.onHand || 0,
      reserved: stats.get(i.id)?.reserved || 0,
      minStock: i.minStock,
      strategicStock: i.strategicStock,
      active: i.active ? 'yes' : 'no',
    }))
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="storege-items.csv"')
    return toCsv(rows)
  })

  app.get('/api/items/:id', async (req) => {
    const { id } = req.params as { id: string }
    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        category: true,
        lots: { orderBy: { expiryDate: 'asc' } },
        serials: { orderBy: { createdAt: 'desc' }, take: 100 },
        stocks: {
          include: { location: { include: { warehouse: true, zone: true } }, lot: true },
          where: { quantity: { not: 0 } },
        },
      },
    })
    if (!item) throw new ApiError(404, 'الصنف غير موجود')
    const movements = await prisma.stockMovement.findMany({
      where: { itemId: id },
      include: { fromLocation: true, toLocation: true, lot: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    const onHand = item.stocks.reduce((s, r) => s + r.quantity, 0)
    const reserved = item.stocks.reduce((s, r) => s + r.reserved, 0)
    return {
      ...item,
      onHand,
      reserved,
      available: onHand - reserved,
      movements,
    }
  })

  app.post('/api/items', { preHandler: [canWrite] }, async (req) => {
    const body = parse(itemSchema, req.body)
    if (body.barcode) {
      const exists = await prisma.item.findFirst({ where: { barcode: body.barcode } })
      if (exists) throw new ApiError(409, 'الباركود مستخدم لصنف آخر')
    }
    const sku = body.sku || (await generateSku(body.categoryId))
    const skuExists = await prisma.item.findUnique({ where: { sku } })
    if (skuExists) throw new ApiError(409, 'كود الصنف مستخدم بالفعل')
    const item = await prisma.item.create({
      data: {
        sku,
        name: body.name,
        description: body.description || null,
        barcode: body.barcode || (await generateBarcode()),
        categoryId: body.categoryId || null,
        unit: body.unit || 'قطعة',
        brand: body.brand || null,
        cost: body.cost || 0,
        price: body.price || 0,
        minStock: body.minStock || 0,
        maxStock: body.maxStock || 0,
        reorderQty: body.reorderQty || 0,
        shelfLifeDays: body.shelfLifeDays || 0,
        trackLot: body.trackLot || false,
        trackSerial: body.trackSerial || false,
        active: body.active ?? true,
        imageUrl: body.imageUrl || null,
      },
      include: { category: true },
    })
    await audit(req, 'CREATE', 'Item', item.id, { sku: item.sku, name: item.name })
    await emitEvent('item.created', item)
    return item
  })

  app.patch('/api/items/:id', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(itemSchema.partial(), req.body)
    const existing = await prisma.item.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'الصنف غير موجود')
    if (body.barcode && body.barcode !== existing.barcode) {
      const dup = await prisma.item.findFirst({ where: { barcode: body.barcode, NOT: { id } } })
      if (dup) throw new ApiError(409, 'الباركود مستخدم لصنف آخر')
    }
    if (body.sku && body.sku !== existing.sku) {
      const dup = await prisma.item.findUnique({ where: { sku: body.sku } })
      if (dup) throw new ApiError(409, 'كود الصنف مستخدم بالفعل')
    }
    const item = await prisma.item.update({
      where: { id },
      data: {
        ...(body.sku ? { sku: body.sku } : {}),
        ...(body.name ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.barcode !== undefined ? { barcode: body.barcode } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.unit ? { unit: body.unit } : {}),
        ...(body.brand !== undefined ? { brand: body.brand } : {}),
        ...(body.cost !== undefined ? { cost: body.cost } : {}),
        ...(body.price !== undefined ? { price: body.price } : {}),
        ...(body.minStock !== undefined ? { minStock: body.minStock } : {}),
        ...(body.maxStock !== undefined ? { maxStock: body.maxStock } : {}),
        ...(body.reorderQty !== undefined ? { reorderQty: body.reorderQty } : {}),
        ...(body.shelfLifeDays !== undefined ? { shelfLifeDays: body.shelfLifeDays } : {}),
        ...(body.trackLot !== undefined ? { trackLot: body.trackLot } : {}),
        ...(body.trackSerial !== undefined ? { trackSerial: body.trackSerial } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
      },
      include: { category: true },
    })
    await audit(req, 'UPDATE', 'Item', id, body)
    return item
  })

  app.delete('/api/items/:id', { preHandler: [canManage] }, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.item.update({ where: { id }, data: { active: false } })
    await audit(req, 'DEACTIVATE', 'Item', id)
    return { ok: true }
  })

  app.post('/api/items/import', { preHandler: [canManage] }, async (req) => {
    const body = parse(z.object({ csv: z.string().min(1) }), req.body)
    let rows: Record<string, string>[]
    try {
      rows = parseCsv(body.csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }) as Record<string, string>[]
    } catch {
      throw new ApiError(400, 'ملف CSV غير صالح')
    }
    let created = 0
    let updated = 0
    const errors: string[] = []
    for (const [index, row] of rows.entries()) {
      try {
        const name = str(row.name) || str(row['الاسم'])
        if (!name) throw new Error('الاسم مطلوب')
        let categoryId: string | null = null
        const categoryName = str(row.category) || str(row['التصنيف'])
        if (categoryName) {
          let category = await prisma.category.findFirst({ where: { name: categoryName } })
          if (!category) {
            category = await prisma.category.create({
              data: {
                name: categoryName,
                code: `C${Date.now().toString().slice(-6)}${index}`,
              },
            })
          }
          categoryId = category.id
        }
        const sku = str(row.sku) || str(row['الكود'])
        const data = {
          name,
          barcode: str(row.barcode) || str(row['الباركود']) || undefined,
          categoryId,
          unit: str(row.unit) || 'قطعة',
          cost: num(row.cost),
          price: num(row.price),
          minStock: num(row.minStock || row['حد_الطلب']),
          trackLot: ['1', 'true', 'yes', 'نعم'].includes(String(row.trackLot || '').toLowerCase()),
          trackSerial: ['1', 'true', 'yes', 'نعم'].includes(String(row.trackSerial || '').toLowerCase()),
        }
        const existing = sku ? await prisma.item.findUnique({ where: { sku } }) : null
        if (existing) {
          await prisma.item.update({ where: { id: existing.id }, data })
          updated++
        } else {
          await prisma.item.create({
            data: {
              ...data,
              sku: sku || (await generateSku(categoryId)),
              barcode: data.barcode || (await generateBarcode()),
            },
          })
          created++
        }
      } catch (error) {
        errors.push(`سطر ${index + 2}: ${error instanceof Error ? error.message : 'خطأ'}`)
      }
    }
    await audit(req, 'IMPORT', 'Item', null, { created, updated, errors: errors.length })
    await emitEvent('items.imported', { created, updated })
    return { created, updated, errors }
  })

  // ------------------------------------------------------------- categories
  app.get('/api/categories', async () => {
    const items = await prisma.category.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { name: 'asc' },
    })
    return items
  })

  app.post('/api/categories', { preHandler: [canManage] }, async (req) => {
    const body = parse(
      z.object({ name: z.string().min(1), code: z.string().optional(), color: z.string().optional() }),
      req.body,
    )
    const code = body.code || `C${Date.now().toString().slice(-6)}`
    const category = await prisma.category.create({
      data: { name: body.name, code, color: body.color || '#0ea5e9' },
    })
    await audit(req, 'CREATE', 'Category', category.id, { name: category.name })
    return category
  })

  app.patch('/api/categories/:id', { preHandler: [canManage] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({ name: z.string().min(1).optional(), code: z.string().optional(), color: z.string().optional() }),
      req.body,
    )
    return prisma.category.update({ where: { id }, data: body })
  })

  app.delete('/api/categories/:id', { preHandler: [canManage] }, async (req) => {
    const { id } = req.params as { id: string }
    const count = await prisma.item.count({ where: { categoryId: id } })
    if (count > 0) throw new ApiError(409, 'لا يمكن حذف تصنيف يحتوي على أصناف')
    await prisma.category.delete({ where: { id } })
    return { ok: true }
  })
}
