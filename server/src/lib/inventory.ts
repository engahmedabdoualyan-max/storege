import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { ApiError } from './http'

type Db = Prisma.TransactionClient

export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000
const keyOf = (itemId: string, locationId: string, lotId?: string | null, serial?: string | null) =>
  `${itemId}|${locationId}|${lotId || ''}|${serial || ''}`

export async function getStagingLocation(tx: Db, warehouseId: string) {
  let location = await tx.location.findFirst({
    where: { warehouseId, type: 'SHIPPING', active: true },
    orderBy: { createdAt: 'asc' },
  })
  if (location) return location
  const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } })
  if (!warehouse) throw new ApiError(404, 'المخزن غير موجود / Warehouse not found')
  location = await tx.location.create({
    data: {
      warehouseId,
      code: `STAGE-${warehouse.code}`,
      barcode: `STG-${warehouse.code}`,
      name: 'منطقة الشحن',
      type: 'SHIPPING',
    },
  })
  return location
}

export async function ensureLot(tx: Db, itemId: string, code?: string | null, expiryDate?: string | Date | null) {
  if (!code) return null
  const expiry = expiryDate ? new Date(expiryDate) : null
  const existing = await tx.lot.findUnique({ where: { itemId_code: { itemId, code } } })
  if (existing) {
    if (expiry && !existing.expiryDate) {
      return tx.lot.update({ where: { id: existing.id }, data: { expiryDate: expiry } })
    }
    return existing
  }
  return tx.lot.create({ data: { itemId, code, expiryDate: expiry } })
}

export async function addStockRow(
  tx: Db,
  input: { itemId: string; locationId: string; lotId?: string | null; serial?: string | null; qty: number },
) {
  if (input.qty <= 0) throw new ApiError(400, 'الكمية يجب أن تكون أكبر من صفر')
  const qty = round3(input.qty)
  const key = keyOf(input.itemId, input.locationId, input.lotId, input.serial)
  return tx.stock.upsert({
    where: { key },
    create: {
      key,
      itemId: input.itemId,
      locationId: input.locationId,
      lotId: input.lotId || null,
      serial: input.serial || null,
      quantity: qty,
    },
    update: { quantity: { increment: qty } },
  })
}

export async function recordMovement(
  tx: Db,
  input: {
    type: string
    itemId: string
    fromLocationId?: string | null
    toLocationId?: string | null
    lotId?: string | null
    serial?: string | null
    qty: number
    refType?: string
    refId?: string
    userId?: string | null
    userName?: string | null
    note?: string | null
  },
) {
  return tx.stockMovement.create({
    data: {
      type: input.type,
      itemId: input.itemId,
      fromLocationId: input.fromLocationId || null,
      toLocationId: input.toLocationId || null,
      lotId: input.lotId || null,
      serial: input.serial || null,
      qty: round3(input.qty),
      refType: input.refType || null,
      refId: input.refId || null,
      userId: input.userId || null,
      userName: input.userName || null,
      note: input.note || null,
    },
  })
}

type ConsumeInput = {
  itemId: string
  locationId: string
  lotId?: string | null
  qty: number
  serials?: string[]
  allowNegative?: boolean
  ignoreReserved?: boolean
}

export type ConsumedChunk = { stockId: string; lotId: string | null; serial: string | null; qty: number }

/**
 * Consumes physical stock from one location, oldest expiry first (FEFO).
 * Reserved quantities are protected unless ignoreReserved is set.
 */
export async function consumeAt(tx: Db, input: ConsumeInput): Promise<ConsumedChunk[]> {
  let remaining = round3(input.qty)
  if (remaining <= 0) throw new ApiError(400, 'الكمية يجب أن تكون أكبر من صفر')
  const chunks: ConsumedChunk[] = []

  if (input.serials?.length) {
    for (const serial of input.serials) {
      const key = keyOf(input.itemId, input.locationId, input.lotId, serial)
      const row = await tx.stock.findUnique({ where: { key } })
      if (!row || row.quantity < 1) {
        throw new ApiError(409, `السيريال ${serial} غير موجود في هذا الموقع`)
      }
      await tx.stock.update({
        where: { id: row.id },
        data: {
          quantity: { decrement: 1 },
          ...(row.reserved > 0 ? { reserved: { decrement: Math.min(1, row.reserved) } } : {}),
        },
      })
      chunks.push({ stockId: row.id, lotId: row.lotId, serial: row.serial, qty: 1 })
      remaining = round3(remaining - 1)
    }
    if (remaining > 0.001) throw new ApiError(400, 'عدد السيريالات لا يطابق الكمية المطلوبة')
    return chunks
  }

  const rows = await tx.stock.findMany({
    where: {
      itemId: input.itemId,
      locationId: input.locationId,
      ...(input.lotId ? { lotId: input.lotId } : {}),
      quantity: { gt: 0 },
    },
    include: { lot: true },
    orderBy: [{ serial: 'asc' }],
  })
  rows.sort((a, b) => {
    const ae = a.lot?.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER
    const be = b.lot?.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER
    if (ae !== be) return ae - be
    return (a.serial || '').localeCompare(b.serial || '')
  })

  for (const row of rows) {
    if (remaining <= 0.001) break
    const available = round3(row.quantity - (input.ignoreReserved ? 0 : row.reserved))
    if (available <= 0) continue
    const take = round3(Math.min(available, remaining))
    await tx.stock.update({
      where: { id: row.id },
      data: {
        quantity: { decrement: take },
        ...(row.reserved > 0
          ? { reserved: { decrement: Math.min(take, row.reserved) } }
          : {}),
      },
    })
    chunks.push({ stockId: row.id, lotId: row.lotId, serial: row.serial, qty: take })
    remaining = round3(remaining - take)
  }

  if (remaining > 0.001) {
    if (input.allowNegative) {
      const location = await tx.location.findUnique({ where: { id: input.locationId } })
      if (!location) throw new ApiError(404, 'الموقع غير موجود')
      const row = await tx.stock.upsert({
        where: { key: keyOf(input.itemId, input.locationId, input.lotId, null) },
        create: {
          key: keyOf(input.itemId, input.locationId, input.lotId, null),
          itemId: input.itemId,
          locationId: input.locationId,
          lotId: input.lotId || null,
          quantity: -remaining,
        },
        update: { quantity: { decrement: remaining } },
      })
      chunks.push({ stockId: row.id, lotId: row.lotId, serial: null, qty: remaining })
    } else {
      throw new ApiError(409, `الكمية المتاحة غير كافية (ناقص ${remaining})`)
    }
  }
  return chunks
}

export async function receiveStock(
  tx: Db,
  input: {
    itemId: string
    locationId: string
    qty: number
    lotCode?: string | null
    expiryDate?: string | Date | null
    serials?: string[]
  },
) {
  const item = await tx.item.findUnique({ where: { id: input.itemId } })
  if (!item) throw new ApiError(404, 'الصنف غير موجود')
  if (input.qty <= 0) throw new ApiError(400, 'الكمية يجب أن تكون أكبر من صفر')
  if (item.trackLot && !input.lotCode) {
    throw new ApiError(400, `الصنف ${item.name} يتطلب رقم دفعة`)
  }
  if (item.trackSerial) {
    const serials = (input.serials || []).map((s) => s.trim()).filter(Boolean)
    if (serials.length !== Math.round(input.qty)) {
      throw new ApiError(400, `الصنف ${item.name} يتطلب ${Math.round(input.qty)} سيريال`)
    }
    const existing = await tx.serial.findMany({ where: { itemId: item.id, serial: { in: serials } } })
    if (existing.length) {
      throw new ApiError(409, `سيريال مستخدم بالفعل: ${existing.map((s) => s.serial).join(', ')}`)
    }
    const lot = await ensureLot(tx, item.id, input.lotCode, input.expiryDate)
    for (const serial of serials) {
      await tx.serial.create({ data: { itemId: item.id, serial, lotId: lot?.id } })
      await addStockRow(tx, { itemId: item.id, locationId: input.locationId, lotId: lot?.id, serial, qty: 1 })
    }
    return { lotId: lot?.id || null }
  }
  const lot = await ensureLot(tx, item.id, input.lotCode, input.expiryDate)
  await addStockRow(tx, {
    itemId: item.id,
    locationId: input.locationId,
    lotId: lot?.id,
    qty: input.qty,
  })
  return { lotId: lot?.id || null }
}

export async function adjustStock(
  tx: Db,
  input: {
    itemId: string
    locationId: string
    qty: number // signed
    lotCode?: string | null
    expiryDate?: string | Date | null
    serials?: string[]
    allowNegative?: boolean
  },
) {
  if (input.qty === 0) throw new ApiError(400, 'الكمية يجب أن لا تكون صفرًا')
  const item = await tx.item.findUnique({ where: { id: input.itemId } })
  if (!item) throw new ApiError(404, 'الصنف غير موجود')

  if (input.qty > 0) {
    if (item.trackSerial) {
      const serials = (input.serials || []).map((s) => s.trim()).filter(Boolean)
      if (serials.length !== Math.round(input.qty)) {
        throw new ApiError(400, `يتطلب الصنف ${Math.round(input.qty)} سيريال`)
      }
      const existing = await tx.serial.findMany({ where: { itemId: item.id, serial: { in: serials } } })
      if (existing.length) throw new ApiError(409, 'أحد السيريالات مسجل بالفعل')
      const lot = await ensureLot(tx, item.id, input.lotCode, input.expiryDate)
      for (const serial of serials) {
        await tx.serial.create({ data: { itemId: item.id, serial, lotId: lot?.id } })
        await addStockRow(tx, { itemId: item.id, locationId: input.locationId, lotId: lot?.id, serial, qty: 1 })
      }
      return
    }
    const lot = await ensureLot(tx, item.id, input.lotCode, input.expiryDate)
    await addStockRow(tx, { itemId: item.id, locationId: input.locationId, lotId: lot?.id, qty: input.qty })
    return
  }

  const lot = input.lotCode
    ? await tx.lot.findUnique({ where: { itemId_code: { itemId: item.id, code: input.lotCode } } })
    : null
  if (input.lotCode && !lot) throw new ApiError(404, 'الدفعة غير موجودة')
  await consumeAt(tx, {
    itemId: item.id,
    locationId: input.locationId,
    lotId: lot?.id,
    qty: Math.abs(input.qty),
    serials: input.serials,
    allowNegative: input.allowNegative,
    ignoreReserved: true,
  })
}

export async function moveStock(
  tx: Db,
  input: {
    itemId: string
    fromLocationId: string
    toLocationId: string
    qty: number
    lotId?: string | null
    serial?: string | null
    type?: string
    refType?: string
    refId?: string
    userId?: string | null
    userName?: string | null
    note?: string
  },
) {
  const chunks = await consumeAt(tx, {
    itemId: input.itemId,
    locationId: input.fromLocationId,
    lotId: input.lotId,
    qty: input.qty,
    serials: input.serial ? [input.serial] : undefined,
    ignoreReserved: true,
  })
  for (const chunk of chunks) {
    await addStockRow(tx, {
      itemId: input.itemId,
      locationId: input.toLocationId,
      lotId: chunk.lotId,
      serial: chunk.serial,
      qty: chunk.qty,
    })
    await recordMovement(tx, {
      type: input.type || 'TRANSFER',
      itemId: input.itemId,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      lotId: chunk.lotId,
      serial: chunk.serial,
      qty: chunk.qty,
      refType: input.refType,
      refId: input.refId,
      userId: input.userId,
      userName: input.userName,
      note: input.note,
    })
  }
  return chunks
}

// ------------------------------------------------------------------ outbound

export async function allocateOrder(soId: string, userId?: string, requested?: boolean) {
  return prisma.$transaction(async (tx) => {
    const so = await tx.salesOrder.findUnique({
      where: { id: soId },
      include: { lines: { include: { item: true } } },
    })
    if (!so) throw new ApiError(404, 'أمر البيع غير موجود')
    if (!['OPEN', 'ALLOCATED'].includes(so.status)) {
      throw new ApiError(409, 'لا يمكن تخصيص الأمر في حالته الحالية')
    }
    const picked = await tx.allocation.count({
      where: { soId, pickedQty: { gt: 0 } },
    })
    if (picked > 0) throw new ApiError(409, 'تم بدء التجهيز بالفعل، لا يمكن إعادة التخصيص')

    const previous = await tx.allocation.findMany({ where: { soId, status: 'RESERVED' } })
    for (const allocation of previous) {
      if (allocation.stockId) {
        const stock = await tx.stock.findUnique({ where: { id: allocation.stockId } })
        if (stock && stock.reserved > 0) {
          await tx.stock.update({
            where: { id: stock.id },
            data: { reserved: { decrement: Math.min(stock.reserved, allocation.qty) } },
          })
        }
      }
    }
    await tx.allocation.deleteMany({ where: { soId, status: 'RESERVED' } })
    await tx.salesOrderLine.updateMany({ where: { soId }, data: { allocatedQty: 0 } })

    const locations = await tx.location.findMany({
      where: { warehouseId: so.warehouseId, active: true, type: 'PICK' },
      select: { id: true },
    })
    const locationIds = locations.map((l) => l.id)

    let fullyAllocated = true
    for (const line of so.lines) {
      let need = round3(line.qty)
      if (need <= 0) continue
      const stocks = locationIds.length
        ? await tx.stock.findMany({
            where: {
              itemId: line.itemId,
              locationId: { in: locationIds },
              quantity: { gt: 0 },
            },
            include: { lot: true, location: true },
          })
        : []
      stocks.sort((a, b) => {
        const ae = a.lot?.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER
        const be = b.lot?.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER
        if (ae !== be) return ae - be
        return a.location.code.localeCompare(b.location.code)
      })
      for (const stock of stocks) {
        if (need <= 0.001) break
        const available = round3(stock.quantity - stock.reserved)
        if (available <= 0) continue
        const take = round3(Math.min(available, need))
        await tx.stock.update({ where: { id: stock.id }, data: { reserved: { increment: take } } })
        await tx.allocation.create({
          data: {
            soId,
            soLineId: line.id,
            itemId: line.itemId,
            locationId: stock.locationId,
            lotId: stock.lotId,
            stockId: stock.id,
            qty: take,
          },
        })
        need = round3(need - take)
      }
      const allocatedNow = round3(line.qty - need)
      await tx.salesOrderLine.update({
        where: { id: line.id },
        data: { allocatedQty: allocatedNow },
      })
      if (need > 0.001) fullyAllocated = false
    }

    const updated = await tx.salesOrder.update({
      where: { id: soId },
      data: { status: 'ALLOCATED' },
    })
    return { order: updated, fullyAllocated, requested: requested ?? false, userId }
  })
}

export async function pickLine(input: {
  soLineId: string
  qty: number
  locationId?: string | null
  userId?: string | null
  userName?: string | null
}) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.salesOrderLine.findUnique({
      where: { id: input.soLineId },
      include: { so: true, item: true },
    })
    if (!line) throw new ApiError(404, 'سطر أمر البيع غير موجود')
    if (line.so.status === 'CANCELLED') throw new ApiError(409, 'الأمر ملغي')
    let need = round3(Math.min(input.qty, line.qty - line.pickedQty))
    if (need <= 0) throw new ApiError(409, 'تم تجهيز الكمية بالكامل بالفعل')

    const allocations = await tx.allocation.findMany({
      where: {
        soLineId: line.id,
        status: { in: ['RESERVED', 'PICKED'] },
        ...(input.locationId ? { locationId: input.locationId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    })
    if (!allocations.length) {
      throw new ApiError(
        409,
        input.locationId
          ? 'لا يوجد تخصيص لهذا الموقع. تأكد من رف التجهيز الصحيح.'
          : 'يجب تخصيص أمر البيع أولًا',
      )
    }

    const staging = await getStagingLocation(tx, line.so.warehouseId)
    let pickedNow = 0

    for (const allocation of allocations) {
      if (need <= 0.001) break
      const availableInAlloc = round3(allocation.qty - allocation.pickedQty)
      if (availableInAlloc <= 0) continue
      let take = round3(Math.min(availableInAlloc, need))
      const stock = allocation.stockId
        ? await tx.stock.findUnique({ where: { id: allocation.stockId } })
        : null
      if (!stock || stock.quantity <= 0) {
        throw new ApiError(409, 'المخزون في الرف لم يعد متاحًا، يلزم إعادة التخصيص')
      }
      if (stock.serial) take = 1
      take = round3(Math.min(take, stock.quantity))
      await tx.stock.update({
        where: { id: stock.id },
        data: {
          quantity: { decrement: take },
          reserved: { decrement: Math.min(take, stock.reserved) },
        },
      })
      await addStockRow(tx, {
        itemId: line.itemId,
        locationId: staging.id,
        lotId: allocation.lotId,
        serial: stock.serial,
        qty: take,
      })
      await recordMovement(tx, {
        type: 'PICK',
        itemId: line.itemId,
        fromLocationId: allocation.locationId,
        toLocationId: staging.id,
        lotId: allocation.lotId,
        serial: stock.serial,
        qty: take,
        refType: 'SALES_ORDER',
        refId: line.soId,
        userId: input.userId,
        userName: input.userName,
        note: `${line.so.number} · ${line.item.sku}`,
      })
      const newPicked = round3(allocation.pickedQty + take)
      await tx.allocation.update({
        where: { id: allocation.id },
        data: {
          pickedQty: newPicked,
          stagingLocationId: staging.id,
          status: newPicked >= allocation.qty ? 'PICKED' : 'RESERVED',
        },
      })
      need = round3(need - take)
      pickedNow = round3(pickedNow + take)
    }

    if (pickedNow <= 0) throw new ApiError(409, 'لم يتم تجهيز أي كمية')
    await tx.salesOrderLine.update({
      where: { id: line.id },
      data: { pickedQty: { increment: pickedNow } },
    })
    const fresh = await tx.salesOrderLine.findUnique({ where: { id: line.id } })
    const allLines = await tx.salesOrderLine.findMany({ where: { soId: line.soId } })
    const allPicked = allLines.every((l) => l.pickedQty >= l.qty)
    await tx.salesOrder.update({
      where: { id: line.soId },
      data: { status: allPicked ? 'PICKED' : 'PICKING' },
    })
    return { picked: pickedNow, line: fresh, allPicked }
  })
}

export async function packLine(input: { soLineId: string; qty: number }) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.salesOrderLine.findUnique({ where: { id: input.soLineId }, include: { so: true } })
    if (!line) throw new ApiError(404, 'سطر أمر البيع غير موجود')
    const remaining = round3(line.pickedQty - line.packedQty)
    if (remaining <= 0) throw new ApiError(409, 'تم تعبئة الكمية بالكامل')
    const qty = round3(Math.min(input.qty || remaining, remaining))
    await tx.salesOrderLine.update({ where: { id: line.id }, data: { packedQty: { increment: qty } } })
    const lines = await tx.salesOrderLine.findMany({ where: { soId: line.soId } })
    const allPacked = lines.every((l) => l.packedQty >= l.qty)
    const allPicked = lines.every((l) => l.pickedQty >= l.qty)
    let status = line.so.status
    if (allPacked) status = 'PACKED'
    else if (allPicked) status = 'PICKED'
    await tx.salesOrder.update({ where: { id: line.soId }, data: { status } })
    return { packed: qty, allPacked, status }
  })
}

export async function shipOrder(input: {
  soId: string
  carrier?: string
  tracking?: string
  notes?: string
  userId?: string | null
  userName?: string | null
}) {
  return prisma.$transaction(async (tx) => {
    const so = await tx.salesOrder.findUnique({
      where: { id: input.soId },
      include: { lines: { include: { item: true } }, allocations: true },
    })
    if (!so) throw new ApiError(404, 'أمر البيع غير موجود')
    if (so.status === 'SHIPPED') throw new ApiError(409, 'تم شحن الأمر بالفعل')
    if (so.status === 'CANCELLED') throw new ApiError(409, 'الأمر ملغي')
    const ready = so.lines.every((l) => l.packedQty >= l.qty)
    if (!ready) throw new ApiError(409, 'يجب تعبئة جميع الأسطر قبل الشحن')

    const staging = await getStagingLocation(tx, so.warehouseId)
    for (const allocation of so.allocations) {
      if (allocation.status !== 'PICKED' || allocation.pickedQty <= 0) continue
      const chunks = await consumeAt(tx, {
        itemId: allocation.itemId,
        locationId: allocation.stagingLocationId || staging.id,
        lotId: allocation.lotId,
        qty: allocation.pickedQty,
        ignoreReserved: true,
      })
      for (const chunk of chunks) {
        await recordMovement(tx, {
          type: 'SHIP',
          itemId: allocation.itemId,
          fromLocationId: allocation.stagingLocationId || staging.id,
          lotId: chunk.lotId,
          serial: chunk.serial,
          qty: chunk.qty,
          refType: 'SALES_ORDER',
          refId: so.id,
          userId: input.userId,
          userName: input.userName,
          note: `${so.number} · ${input.carrier || ''} ${input.tracking || ''}`.trim(),
        })
        if (chunk.serial) {
          await tx.serial.updateMany({
            where: { itemId: allocation.itemId, serial: chunk.serial },
            data: { status: 'SHIPPED' },
          })
        }
      }
    }

    const shipment = await tx.shipment.create({
      data: {
        soId: so.id,
        carrier: input.carrier,
        tracking: input.tracking,
        notes: input.notes,
        createdById: input.userId || null,
      },
    })
    const updated = await tx.salesOrder.update({
      where: { id: so.id },
      data: { status: 'SHIPPED', shippedAt: new Date() },
    })
    return { order: updated, shipment }
  })
}

export async function cancelOrder(soId: string, userId?: string | null, userName?: string | null) {
  return prisma.$transaction(async (tx) => {
    const so = await tx.salesOrder.findUnique({ where: { id: soId }, include: { allocations: true } })
    if (!so) throw new ApiError(404, 'أمر البيع غير موجود')
    if (so.status === 'SHIPPED') throw new ApiError(409, 'لا يمكن إلغاء أمر تم شحنه')
    if (so.status === 'CANCELLED') return so
    const staging = await getStagingLocation(tx, so.warehouseId)

    for (const allocation of so.allocations) {
      if (allocation.status === 'CANCELLED') continue
      const remaining = round3(allocation.qty - allocation.pickedQty)
      if (allocation.pickedQty > 0) {
        const chunks = await consumeAt(tx, {
          itemId: allocation.itemId,
          locationId: allocation.stagingLocationId || staging.id,
          lotId: allocation.lotId,
          qty: allocation.pickedQty,
          ignoreReserved: true,
        })
        for (const chunk of chunks) {
          await addStockRow(tx, {
            itemId: allocation.itemId,
            locationId: allocation.locationId,
            lotId: chunk.lotId,
            serial: chunk.serial,
            qty: chunk.qty,
          })
          await recordMovement(tx, {
            type: 'RETURN',
            itemId: allocation.itemId,
            fromLocationId: allocation.stagingLocationId || staging.id,
            toLocationId: allocation.locationId,
            lotId: chunk.lotId,
            serial: chunk.serial,
            qty: chunk.qty,
            refType: 'SALES_ORDER',
            refId: so.id,
            userId,
            userName,
            note: `إلغاء ${so.number}`,
          })
        }
      }
      if (remaining > 0 && allocation.stockId) {
        const stock = await tx.stock.findUnique({ where: { id: allocation.stockId } })
        if (stock && stock.reserved > 0) {
          await tx.stock.update({
            where: { id: stock.id },
            data: { reserved: { decrement: Math.min(remaining, stock.reserved) } },
          })
        }
      }
      await tx.allocation.update({ where: { id: allocation.id }, data: { status: 'CANCELLED' } })
    }

    return tx.salesOrder.update({ where: { id: soId }, data: { status: 'CANCELLED' } })
  })
}

// ------------------------------------------------------------------ transfers

export async function dispatchTransfer(transferId: string, userId?: string | null, userName?: string | null) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.findUnique({ where: { id: transferId }, include: { lines: true } })
    if (!transfer) throw new ApiError(404, 'أمر التحويل غير موجود')
    if (transfer.status !== 'DRAFT') throw new ApiError(409, 'لا يمكن صرف التحويل في حالته الحالية')
    if (transfer.fromWarehouseId === transfer.toWarehouseId) {
      throw new ApiError(400, 'لا يمكن التحويل لنفس المخزن')
    }
    for (const line of transfer.lines) {
      if (!line.fromLocationId) throw new ApiError(400, 'يجب تحديد موقع الصرف لكل سطر')
      await consumeAt(tx, {
        itemId: line.itemId,
        locationId: line.fromLocationId,
        lotId: line.lotId,
        qty: line.qty,
      })
      await recordMovement(tx, {
        type: 'TRANSFER_OUT',
        itemId: line.itemId,
        fromLocationId: line.fromLocationId,
        lotId: line.lotId,
        qty: line.qty,
        refType: 'TRANSFER',
        refId: transfer.id,
        userId,
        userName,
        note: transfer.number,
      })
    }
    return tx.transfer.update({
      where: { id: transfer.id },
      data: { status: 'IN_TRANSIT', dispatchedAt: new Date() },
    })
  })
}

export async function receiveTransfer(transferId: string, userId?: string | null, userName?: string | null) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.findUnique({ where: { id: transferId }, include: { lines: true } })
    if (!transfer) throw new ApiError(404, 'أمر التحويل غير موجود')
    if (transfer.status !== 'IN_TRANSIT') throw new ApiError(409, 'التحويل ليس قيد النقل')
    for (const line of transfer.lines) {
      if (!line.toLocationId) throw new ApiError(400, 'يجب تحديد موقع الاستلام لكل سطر')
      await addStockRow(tx, {
        itemId: line.itemId,
        locationId: line.toLocationId,
        lotId: line.lotId,
        qty: line.qty,
      })
      await recordMovement(tx, {
        type: 'TRANSFER_IN',
        itemId: line.itemId,
        toLocationId: line.toLocationId,
        lotId: line.lotId,
        qty: line.qty,
        refType: 'TRANSFER',
        refId: transfer.id,
        userId,
        userName,
        note: transfer.number,
      })
    }
    return tx.transfer.update({
      where: { id: transfer.id },
      data: { status: 'RECEIVED', receivedAt: new Date() },
    })
  })
}

// ------------------------------------------------------------------ counting

export async function createCycleCount(input: {
  warehouseId: string
  locationId?: string | null
  itemId?: string | null
  notes?: string
  createdById?: string | null
}) {
  return prisma.$transaction(async (tx) => {
    const countNumber = `CC-${new Date().getFullYear()}-${String(
      (await tx.counter.upsert({
        where: { name: 'CC' },
        create: { name: 'CC', value: 1 },
        update: { value: { increment: 1 } },
      })).value,
    ).padStart(5, '0')}`
    const stocks = await tx.stock.findMany({
      where: {
        quantity: { gt: 0 },
        location: {
          warehouseId: input.warehouseId,
          ...(input.locationId ? { id: input.locationId } : {}),
        },
        ...(input.itemId ? { itemId: input.itemId } : {}),
      },
      include: { lot: true },
      orderBy: [{ locationId: 'asc' }, { itemId: 'asc' }],
    })
    const scope = input.locationId ? 'LOCATION' : input.itemId ? 'ITEM' : 'WAREHOUSE'
    return tx.cycleCount.create({
      data: {
        number: countNumber,
        warehouseId: input.warehouseId,
        scope,
        locationId: input.locationId || null,
        itemId: input.itemId || null,
        notes: input.notes,
        createdById: input.createdById || null,
        lines: {
          create: stocks.map((s) => ({
            itemId: s.itemId,
            locationId: s.locationId,
            lotId: s.lotId,
            expectedQty: s.quantity,
          })),
        },
      },
      include: { lines: true },
    })
  })
}

export async function submitCycleCount(countId: string, userId?: string | null, userName?: string | null) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.cycleCount.findUnique({ where: { id: countId }, include: { lines: true } })
    if (!count) throw new ApiError(404, 'الجرد غير موجود')
    if (count.status !== 'OPEN') throw new ApiError(409, 'تم إنهاء هذا الجرد بالفعل')
    for (const line of count.lines) {
      if (line.countedQty === null || line.countedQty === undefined) continue
      const variance = round3(line.countedQty - line.expectedQty)
      if (Math.abs(variance) > 0.0001) {
        if (variance > 0) {
          await addStockRow(tx, {
            itemId: line.itemId,
            locationId: line.locationId,
            lotId: line.lotId,
            qty: variance,
          })
        } else {
          await consumeAt(tx, {
            itemId: line.itemId,
            locationId: line.locationId,
            lotId: line.lotId,
            qty: Math.abs(variance),
            ignoreReserved: true,
            allowNegative: true,
          })
        }
        await recordMovement(tx, {
          type: 'COUNT',
          itemId: line.itemId,
          fromLocationId: variance < 0 ? line.locationId : null,
          toLocationId: variance > 0 ? line.locationId : null,
          lotId: line.lotId,
          qty: Math.abs(variance),
          refType: 'CYCLE_COUNT',
          refId: count.id,
          userId,
          userName,
          note: `تسوية جرد ${count.number}`,
        })
      }
      await tx.cycleCountLine.update({
        where: { id: line.id },
        data: { variance },
      })
    }
    return tx.cycleCount.update({
      where: { id: count.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
  })
}

// ------------------------------------------------------------------ analytics

export async function itemOnHand(itemId: string) {
  const rows = await prisma.stock.findMany({ where: { itemId }, select: { quantity: true, reserved: true } })
  return rows.reduce(
    (acc, row) => ({
      quantity: round3(acc.quantity + row.quantity),
      reserved: round3(acc.reserved + row.reserved),
    }),
    { quantity: 0, reserved: 0 },
  )
}
