import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { audit } from '../lib/audit'
import { ApiError, pagination, parse } from '../lib/http'
import { canWrite } from '../lib/auth'
import { nextNumber } from '../lib/numbers'
import { getSettings } from '../lib/settings'
import { emitEvent } from '../lib/webhooks'

export async function invoiceRoutes(app: FastifyInstance) {
  app.get('/api/invoices', async (req) => {
    const q = req.query as Record<string, string>
    const { page, pageSize, skip, take } = pagination(q)
    const where: Record<string, unknown> = {}
    if (q.type) where.type = q.type
    if (q.status) where.status = q.status
    if (q.q) {
      where.OR = [
        { number: { contains: q.q } },
        { partnerName: { contains: q.q } },
      ]
    }
    if (q.from || q.to) {
      where.date = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(new Date(q.to).setHours(23, 59, 59, 999)) } : {}),
      }
    }
    const [items, total, sums] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({
        where: { ...where, status: { not: 'CANCELLED' } },
        _sum: { total: true, paidAmount: true },
      }),
    ])
    return {
      items,
      total,
      page,
      pageSize,
      totals: {
        total: sums._sum.total || 0,
        paid: sums._sum.paidAmount || 0,
        due: (sums._sum.total || 0) - (sums._sum.paidAmount || 0),
      },
    }
  })

  app.get('/api/invoices/:id', async (req) => {
    const { id } = req.params as { id: string }
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { lines: { include: { item: true } } },
    })
    if (!invoice) throw new ApiError(404, 'الفاتورة غير موجودة')
    const company = await getSettings()
    let partner = null
    if (invoice.partnerType === 'CUSTOMER' && invoice.partnerId) {
      partner = await prisma.customer.findUnique({ where: { id: invoice.partnerId } })
    } else if (invoice.partnerType === 'SUPPLIER' && invoice.partnerId) {
      partner = await prisma.supplier.findUnique({ where: { id: invoice.partnerId } })
    }
    return { invoice, company, partner }
  })

  app.post('/api/invoices', { preHandler: [canWrite] }, async (req) => {
    const body = parse(
      z.object({
        type: z.enum(['SALES', 'PURCHASE']),
        refType: z.enum(['SALES_ORDER', 'PURCHASE_ORDER']).optional().nullable(),
        refId: z.string().optional().nullable(),
        partnerId: z.string().optional().nullable(),
        partnerName: z.string().optional(),
        dueDate: z.string().optional().nullable(),
        taxRate: z.coerce.number().optional(),
        notes: z.string().optional().nullable(),
        force: z.boolean().optional(),
        lines: z
          .array(
            z.object({
              itemId: z.string().optional().nullable(),
              description: z.string(),
              qty: z.coerce.number().positive(),
              unitPrice: z.coerce.number().min(0),
            }),
          )
          .optional(),
      }),
      req.body,
    )
    const settings = await getSettings()
    let partnerId = body.partnerId || null
    let partnerName = body.partnerName || ''
    let lines = body.lines || []
    let subtotal = 0
    let refType = body.refType || null
    let refId = body.refId || null

    if (body.refType === 'SALES_ORDER' && body.refId) {
      const existing = await prisma.invoice.findFirst({
        where: { refType: 'SALES_ORDER', refId: body.refId, status: { not: 'CANCELLED' } },
      })
      if (existing && !body.force) throw new ApiError(409, 'توجد فاتورة لهذا الأمر بالفعل')
      const so = await prisma.salesOrder.findUnique({
        where: { id: body.refId },
        include: { lines: { include: { item: true } }, customer: true },
      })
      if (!so) throw new ApiError(404, 'أمر البيع غير موجود')
      partnerId = so.customerId
      partnerName = so.customer?.name || 'عميل نقدي'
      lines = so.lines.map((l) => ({
        itemId: l.itemId,
        description: `${l.item.name} (${l.item.sku})`,
        qty: l.qty,
        unitPrice: l.unitPrice,
      }))
      subtotal = so.subtotal
    } else if (body.refType === 'PURCHASE_ORDER' && body.refId) {
      const existing = await prisma.invoice.findFirst({
        where: { refType: 'PURCHASE_ORDER', refId: body.refId, status: { not: 'CANCELLED' } },
      })
      if (existing && !body.force) throw new ApiError(409, 'توجد فاتورة لهذا الأمر بالفعل')
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: body.refId },
        include: { lines: { include: { item: true } }, supplier: true },
      })
      if (!po) throw new ApiError(404, 'أمر الشراء غير موجود')
      partnerId = po.supplierId
      partnerName = po.supplier?.name || 'مورد'
      lines = po.lines.map((l) => ({
        itemId: l.itemId,
        description: `${l.item.name} (${l.item.sku})`,
        qty: l.qty,
        unitPrice: l.unitCost,
      }))
      subtotal = po.subtotal
    } else {
      subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
      if (!partnerName) partnerName = body.type === 'SALES' ? 'عميل نقدي' : 'مورد'
    }

    if (!partnerName) partnerName = body.partnerName || (body.type === 'SALES' ? 'عميل نقدي' : 'مورد')
    subtotal = Math.round(subtotal * 100) / 100
    const taxRate = body.taxRate ?? Number(settings.taxRate || 0)
    const taxAmount = Math.round(subtotal * taxRate) / 100
    const total = Math.round((subtotal + taxAmount) * 100) / 100
    const invoice = await prisma.$transaction(async (tx) => {
      const number = await nextNumber('INV', tx)
      return tx.invoice.create({
        data: {
          number,
          type: body.type,
          partnerType: body.type === 'SALES' ? 'CUSTOMER' : 'SUPPLIER',
          partnerId,
          partnerName,
          refType,
          refId,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          subtotal,
          taxRate,
          taxAmount,
          total,
          notes: body.notes || null,
          createdById: req.auth!.id,
          lines: {
            create: lines.map((l) => ({
              itemId: l.itemId || null,
              description: l.description,
              qty: l.qty,
              unitPrice: l.unitPrice,
              total: Math.round(l.qty * l.unitPrice * 100) / 100,
            })),
          },
        },
        include: { lines: true },
      })
    })
    await audit(req, 'CREATE', 'Invoice', invoice.id, { number: invoice.number, total })
    await emitEvent('invoice.created', invoice)
    return invoice
  })

  app.post('/api/invoices/:id/pay', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(z.object({ amount: z.coerce.number().positive() }), req.body)
    const invoice = await prisma.invoice.findUnique({ where: { id } })
    if (!invoice) throw new ApiError(404, 'الفاتورة غير موجودة')
    if (invoice.status === 'CANCELLED') throw new ApiError(409, 'الفاتورة ملغاة')
    const paid = Math.min(invoice.total, invoice.paidAmount + body.amount)
    const status = paid >= invoice.total - 0.01 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID'
    const updated = await prisma.invoice.update({
      where: { id },
      data: { paidAmount: Math.round(paid * 100) / 100, status },
    })
    await audit(req, 'PAY', 'Invoice', id, { amount: body.amount })
    return updated
  })

  app.post('/api/invoices/:id/cancel', { preHandler: [canWrite] }, async (req) => {
    const { id } = req.params as { id: string }
    const invoice = await prisma.invoice.update({ where: { id }, data: { status: 'CANCELLED' } })
    await audit(req, 'CANCEL', 'Invoice', id)
    return invoice
  })

  app.get('/api/invoices/export.csv', async (_req, reply) => {
    const invoices = await prisma.invoice.findMany({ orderBy: { createdAt: 'desc' } })
    const header = 'number,type,partner,date,subtotal,tax,total,paid,status\n'
    const rows = invoices
      .map((i) =>
        [
          i.number,
          i.type,
          `"${i.partnerName.replace(/"/g, '""')}"`,
          i.date.toISOString().slice(0, 10),
          i.subtotal,
          i.taxAmount,
          i.total,
          i.paidAmount,
          i.status,
        ].join(','),
      )
      .join('\n')
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="storege-invoices.csv"')
    return '\uFEFF' + header + rows
  })
}
