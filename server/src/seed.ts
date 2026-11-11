import bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma.js'
import { ean13, nextNumber } from './lib/numbers.js'
import {
  allocateOrder,
  createCycleCount,
  dispatchTransfer,
  packLine,
  pickLine,
  receiveStock,
  submitCycleCount,
} from './lib/inventory.js'
import { updateSettings } from './lib/settings.js'

const rng = (() => {
  let seed = 42
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
})()
const rand = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min
const days = (n: number) => new Date(Date.now() + n * 86400000)
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]

async function reset() {
  await prisma.processedOperation.deleteMany()
  await prisma.webhookDelivery.deleteMany()
  await prisma.webhookEndpoint.deleteMany()
  await prisma.apiToken.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.invoiceLine.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.stockMovement.deleteMany()
  await prisma.cycleCountLine.deleteMany()
  await prisma.cycleCount.deleteMany()
  await prisma.transferLine.deleteMany()
  await prisma.transfer.deleteMany()
  await prisma.shipment.deleteMany()
  await prisma.allocation.deleteMany()
  await prisma.salesOrderLine.deleteMany()
  await prisma.salesOrder.deleteMany()
  await prisma.receiptLine.deleteMany()
  await prisma.receipt.deleteMany()
  await prisma.purchaseOrderLine.deleteMany()
  await prisma.purchaseOrder.deleteMany()
  await prisma.serial.deleteMany()
  await prisma.stock.deleteMany()
  await prisma.lot.deleteMany()
  await prisma.item.deleteMany()
  await prisma.category.deleteMany()
  await prisma.location.deleteMany()
  await prisma.zone.deleteMany()
  await prisma.warehouse.deleteMany()
  await prisma.supplier.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.setting.deleteMany()
  await prisma.counter.deleteMany()
  await prisma.user.deleteMany()
}

async function main() {
  console.log('⏳ تهيئة قاعدة البيانات...')
  await reset()

  const password = async (p: string) => bcrypt.hash(p, 10)
  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: 'أحمد العتيبي',
        email: 'admin@storege.app',
        passwordHash: await password('Admin@12345'),
        role: 'ADMIN',
        phone: '+966500000001',
      },
    }),
    prisma.user.create({
      data: {
        name: 'خالد الغامدي',
        email: 'manager@storege.app',
        passwordHash: await password('Manager@12345'),
        role: 'MANAGER',
        phone: '+966500000002',
      },
    }),
    prisma.user.create({
      data: {
        name: 'سلطان القحطاني',
        email: 'operator@storege.app',
        passwordHash: await password('Operator@12345'),
        role: 'OPERATOR',
        phone: '+966500000003',
      },
    }),
    prisma.user.create({
      data: {
        name: 'سارة الدوسري',
        email: 'viewer@storege.app',
        passwordHash: await password('Viewer@12345'),
        role: 'VIEWER',
        phone: '+966500000004',
      },
    }),
  ])

  await updateSettings({
    companyName: 'مصنع الرياض للخرسانة وقطع الغيار',
    companyNameEn: 'Riyadh Concrete & Spare Parts Factory',
    companyPhone: '+966 11 456 7890',
    companyEmail: 'info@storege.sa',
    companyAddress: 'المدينة الصناعية الثانية، الرياض، المملكة العربية السعودية',
    companyTaxNumber: '310123456700003',
    currency: 'SAR',
    currencySymbol: 'ر.س',
    taxRate: '15',
    invoiceFooter: 'شكرًا لتعاملكم معنا — Thank you for your business',
    barcodePrefix: 'STG',
    labelShowPrice: 'true',
  })

  const cairo = await prisma.warehouse.create({
    data: {
      code: 'RUH',
      name: 'مستودع المصنع الرئيسي - الرياض',
      address: 'المدينة الصناعية الثانية، الرياض',
      phone: '0114567890',
      manager: 'م. خالد الغامدي',
    },
  })
  const alex = await prisma.warehouse.create({
    data: {
      code: 'JED',
      name: 'مستودع قطع الغيار - جدة',
      address: 'المنطقة الصناعية، جدة',
      phone: '0126789012',
      manager: 'م. سلطان القحطاني',
    },
  })

  const zones = await Promise.all([
    prisma.zone.create({ data: { warehouseId: cairo.id, code: 'A', name: 'منطقة الرفوف A - قطع غيار المضخات', type: 'PICKING' } }),
    prisma.zone.create({ data: { warehouseId: cairo.id, code: 'B', name: 'منطقة الرفوف B - خلاطات وماكينات', type: 'PICKING' } }),
    prisma.zone.create({ data: { warehouseId: cairo.id, code: 'IN', name: 'منطقة الاستلام', type: 'RECEIVING' } }),
    prisma.zone.create({ data: { warehouseId: cairo.id, code: 'OUT', name: 'منطقة الشحن', type: 'SHIPPING' } }),
    prisma.zone.create({ data: { warehouseId: alex.id, code: 'A', name: 'منطقة الرفوف A - قطع غيار', type: 'PICKING' } }),
    prisma.zone.create({ data: { warehouseId: alex.id, code: 'IN', name: 'منطقة الاستلام', type: 'RECEIVING' } }),
  ])

  const locations: Record<string, { id: string; code: string; warehouseId: string; barcode: string; type: string }[]> = {}
  const makeLocations = async (
    warehouse: typeof cairo,
    zoneId: string,
    codes: string[],
    type = 'PICK',
  ) => {
    for (const code of codes) {
      const match = /^R(\d+)-C(\d+)$/i.exec(code)
      const rack = match ? `R${match[1]}` : null
      const column = match ? `C${match[2]}` : null
      const location = await prisma.location.create({
        data: {
          warehouseId: warehouse.id,
          zoneId,
          code,
          rack,
          column,
          name: rack && column ? `رف ${rack} - عمود ${column}` : code,
          barcode: `${warehouse.code}-${code}`,
          type,
          capacity: 500,
        },
      })
      locations[warehouse.id] = locations[warehouse.id] || []
      locations[warehouse.id].push({
        id: location.id,
        code: location.code,
        warehouseId: warehouse.id,
        barcode: location.barcode,
        type: location.type,
      })
    }
  }
  const pickCodes = (count: number, columns = 4, startRack = 1) =>
    Array.from({ length: count }, (_, index) => {
      const rackNo = startRack + Math.floor(index / columns)
      const colNo = (index % columns) + 1
      return `R${String(rackNo).padStart(2, '0')}-C${String(colNo).padStart(2, '0')}`
    })
  await makeLocations(cairo, zones[0].id, pickCodes(12, 4, 1))
  await makeLocations(cairo, zones[1].id, pickCodes(8, 4, 4))
  await makeLocations(cairo, zones[2].id, ['DOCK-IN'], 'DOCK')
  await makeLocations(cairo, zones[3].id, ['STAGE-OUT'], 'SHIPPING')
  await makeLocations(alex, zones[4].id, pickCodes(5, 3, 1))
  await makeLocations(alex, zones[5].id, ['DOCK-IN'], 'DOCK')
  await prisma.location.create({
    data: {
      warehouseId: alex.id,
      code: 'STAGE-OUT',
      barcode: 'JED-STAGE-OUT',
      name: 'منطقة الشحن',
      type: 'SHIPPING',
    },
  })

  const categoryData = [
    { code: 'PMP', name: 'قطع غيار المضخات', color: '#2563eb' },
    { code: 'MXR', name: 'قطع غيار الخلاطات', color: '#f59e0b' },
    { code: 'MCH', name: 'قطع غيار الماكينات', color: '#6366f1' },
    { code: 'WKS', name: 'مستلزمات الورشة', color: '#10b981' },
    { code: 'VEH', name: 'مستلزمات السيارات', color: '#ef4444' },
    { code: 'OIL', name: 'زيوت وشحوم', color: '#0ea5e9' },
    { code: 'FLT', name: 'فلاتر', color: '#8b5cf6' },
    { code: 'CNS', name: 'مضافات الخرسانة', color: '#64748b' },
  ]
  const categories = await Promise.all(categoryData.map((c) => prisma.category.create({ data: c })))
  const cat = (code: string) => categories.find((c) => c.code === code)!

  const itemData: {
    name: string
    cat: string
    cost: number
    price: number
    unit: string
    min: number
    strategic: number
    lot?: boolean
    serial?: boolean
    qty: number
    soon?: boolean
    low?: boolean
  }[] = [
    { name: 'طلمبة هيدروليكية 80 بار', cat: 'PMP', cost: 4200, price: 5600, unit: 'قطعة', min: 4, strategic: 8, serial: true, qty: 6, low: true },
    { name: 'سيل مطاطي لطلمبة خرسانة 80/140', cat: 'PMP', cost: 85, price: 140, unit: 'قطعة', min: 30, strategic: 60, qty: 48, low: true },
    { name: 'بكرة ضغط لطلمبة الخرسانة', cat: 'PMP', cost: 620, price: 950, unit: 'قطعة', min: 10, strategic: 20, qty: 14 },
    { name: 'صمام S لطلمبة خرسانة 60', cat: 'PMP', cost: 3500, price: 4800, unit: 'قطعة', min: 3, strategic: 6, serial: true, qty: 4 },
    { name: 'ريشة خلاط خرسانة مقاومة للتآكل', cat: 'MXR', cost: 950, price: 1400, unit: 'قطعة', min: 8, strategic: 15, qty: 12 },
    { name: 'ذراع خلاط جانبي', cat: 'MXR', cost: 1250, price: 1800, unit: 'قطعة', min: 6, strategic: 10, qty: 7 },
    { name: 'بطانة خلاط مقاومة للتآكل', cat: 'MXR', cost: 2100, price: 2900, unit: 'قطعة', min: 4, strategic: 8, qty: 5 },
    { name: 'عمود خلاط مركزي', cat: 'MXR', cost: 3800, price: 5200, unit: 'قطعة', min: 2, strategic: 4, serial: true, qty: 3 },
    { name: 'رولمان بلي كروي 6208', cat: 'MCH', cost: 45, price: 75, unit: 'قطعة', min: 30, strategic: 60, qty: 110 },
    { name: 'حزام سير V-Belt B-95', cat: 'MCH', cost: 65, price: 110, unit: 'قطعة', min: 25, strategic: 50, qty: 36, low: true },
    { name: 'سلسلة نقل حركة 1 بوصة', cat: 'MCH', cost: 180, price: 280, unit: 'متر', min: 15, strategic: 30, qty: 22 },
    { name: 'كوبلين مطاطي مرن', cat: 'MCH', cost: 220, price: 340, unit: 'قطعة', min: 12, strategic: 25, qty: 18 },
    { name: 'طقم مفاتيح هيدروليك 12 قطعة', cat: 'WKS', cost: 480, price: 720, unit: 'طقم', min: 8, strategic: 15, serial: true, qty: 6, low: true },
    { name: 'قفازات عمل مقاومة للزيوت', cat: 'WKS', cost: 28, price: 50, unit: 'زوج', min: 60, strategic: 120, qty: 150 },
    { name: 'نظارة حماية شفافة', cat: 'WKS', cost: 18, price: 35, unit: 'قطعة', min: 40, strategic: 80, qty: 32, low: true },
    { name: 'شريط لحام حراري 50 مم', cat: 'WKS', cost: 55, price: 95, unit: 'لفة', min: 20, strategic: 40, qty: 60 },
    { name: 'إطار شاحنة 11R22.5', cat: 'VEH', cost: 1650, price: 2200, unit: 'إطار', min: 6, strategic: 12, serial: true, qty: 8 },
    { name: 'فلتر هواء شاحنة', cat: 'VEH', cost: 120, price: 190, unit: 'قطعة', min: 25, strategic: 50, qty: 40, low: true },
    { name: 'زيت محرك 15W-40 - 20 لتر', cat: 'VEH', cost: 280, price: 390, unit: 'عبوة', min: 20, strategic: 40, lot: true, qty: 55 },
    { name: 'إسفنج تلميع سيارات', cat: 'VEH', cost: 12, price: 25, unit: 'قطعة', min: 50, strategic: 100, qty: 220 },
    { name: 'شحم ليثيوم عالي التحمل 5 كجم', cat: 'OIL', cost: 95, price: 150, unit: 'علبة', min: 30, strategic: 60, lot: true, qty: 70 },
    { name: 'زيت هيدروليك 68 - 20 لتر', cat: 'OIL', cost: 320, price: 450, unit: 'عبوة', min: 18, strategic: 35, lot: true, qty: 24, low: true },
    { name: 'زيت تروس 85W-140 - 20 لتر', cat: 'OIL', cost: 340, price: 480, unit: 'عبوة', min: 15, strategic: 30, lot: true, qty: 40 },
    { name: 'فلتر زيت محرك', cat: 'FLT', cost: 45, price: 80, unit: 'قطعة', min: 40, strategic: 80, qty: 90 },
    { name: 'فلتر وقود فاصل ماء', cat: 'FLT', cost: 85, price: 140, unit: 'قطعة', min: 30, strategic: 60, qty: 44, low: true },
    { name: 'فلتر هيدروليك 10 ميكرون', cat: 'FLT', cost: 160, price: 250, unit: 'قطعة', min: 20, strategic: 40, qty: 30 },
    { name: 'مضاف خرسانة مقاوم للماء 20 لتر', cat: 'CNS', cost: 210, price: 320, unit: 'عبوة', min: 25, strategic: 50, lot: true, qty: 46, soon: true },
    { name: 'مضاف تسريع الشك 20 لتر', cat: 'CNS', cost: 240, price: 360, unit: 'عبوة', min: 20, strategic: 40, lot: true, qty: 18, low: true, soon: true },
  ]

  const items: any[] = []
  for (const [index, data] of itemData.entries()) {
    const category = cat(data.cat)
    const seq = String(index + 1).padStart(4, '0')
    const item = await prisma.item.create({
      data: {
        sku: `${data.cat}-${seq}`,
        name: data.name,
        barcode: ean13(200000000000 + index + 1),
        categoryId: category.id,
        unit: data.unit,
        cost: data.cost,
        price: data.price,
        minStock: data.min,
        strategicStock: data.strategic,
        maxStock: data.min * 4,
        reorderQty: Math.max(0, data.strategic - data.min),
        shelfLifeDays: data.lot ? 365 : 0,
        trackLot: !!data.lot,
        trackSerial: !!data.serial,
        description: `${data.name} — قطعة أصلية ضمن بيانات مصنع الرياض`,
      },
    })
    items.push({ ...item, demo: data })
  }

  const caiBins = locations[cairo.id].filter((l) => l.type === 'PICK')
  const alexBins = locations[alex.id].filter((l) => l.type === 'PICK')
  const dock = locations[cairo.id].find((l) => l.code === 'DOCK-IN')!

  const lotsByItem = new Map<string, { id: string; code: string; expiryDate: Date | null }[]>()
  for (const item of items) {
    if (!item.demo.lot) continue
    const lots = [
      await prisma.lot.create({
        data: {
          itemId: item.id,
          code: `LOT-${item.sku}-01`,
          expiryDate: days(item.demo.soon ? 12 : 120),
        },
      }),
      await prisma.lot.create({
        data: {
          itemId: item.id,
          code: `LOT-${item.sku}-02`,
          expiryDate: days(item.demo.soon ? 40 : 400),
        },
      }),
    ]
    lotsByItem.set(item.id, lots)
  }

  const stockRows: { itemId: string; locationId: string; lotId: string | null; serial: string | null; quantity: number }[] = []
  for (const item of items) {
    const bins = item.demo.qty > 100 ? [caiBins[rand(0, 5)], caiBins[rand(6, caiBins.length - 1)], pick(alexBins)] : [caiBins[rand(0, caiBins.length - 1)], pick(alexBins)]
    if (item.demo.serial) {
      const count = item.demo.qty
      for (let i = 0; i < count; i++) {
        const serial = `${item.sku}-SN-${String(i + 1).padStart(4, '0')}`
        await prisma.serial.create({ data: { itemId: item.id, serial } })
        const bin = bins[i % 2]
        stockRows.push({ itemId: item.id, locationId: bin.id, lotId: null, serial, quantity: 1 })
      }
    } else if (item.demo.lot) {
      const lots = lotsByItem.get(item.id)!
      const first = Math.round(item.demo.qty * 0.4)
      stockRows.push({ itemId: item.id, locationId: bins[0].id, lotId: lots[0].id, serial: null, quantity: first })
      stockRows.push({ itemId: item.id, locationId: bins[1 % bins.length].id, lotId: lots[1].id, serial: null, quantity: item.demo.qty - first })
      if (bins.length > 2) {
        stockRows.push({ itemId: item.id, locationId: bins[2].id, lotId: lots[1].id, serial: null, quantity: 40 })
      }
    } else {
      const first = Math.round(item.demo.qty * 0.6)
      stockRows.push({ itemId: item.id, locationId: bins[0].id, lotId: null, serial: null, quantity: first })
      stockRows.push({ itemId: item.id, locationId: bins[1 % bins.length].id, lotId: null, serial: null, quantity: item.demo.qty - first })
      if (bins.length > 2) {
        stockRows.push({ itemId: item.id, locationId: bins[2].id, lotId: null, serial: null, quantity: 35 })
      }
    }
  }
  for (const row of stockRows) {
    if (row.quantity <= 0) continue
    const key = `${row.itemId}|${row.locationId}|${row.lotId || ''}|${row.serial || ''}`
    await prisma.stock.create({
      data: {
        key,
        itemId: row.itemId,
        locationId: row.locationId,
        lotId: row.lotId,
        serial: row.serial,
        quantity: row.quantity,
      },
    })
  }

  // Historical movement ledger (30 days) for dashboards and reports.
  const movementTypes = ['RECEIVE', 'RECEIVE', 'PICK', 'PICK', 'PICK', 'SHIP', 'ADJUST', 'PUTAWAY', 'TRANSFER_OUT', 'TRANSFER_IN']
  const allBins = [...caiBins, ...alexBins]
  for (let i = 0; i < 260; i++) {
    const item = pick(items)
    const type = pick(movementTypes)
    const bin = pick(allBins)
    const date = new Date(Date.now() - rand(0, 29) * 86400000 - rand(0, 20) * 3600000)
    await prisma.stockMovement.create({
      data: {
        type,
        itemId: item.id,
        fromLocationId: ['PICK', 'SHIP', 'TRANSFER_OUT', 'ADJUST'].includes(type) ? bin.id : null,
        toLocationId: ['RECEIVE', 'PUTAWAY', 'TRANSFER_IN', 'ADJUST'].includes(type) ? bin.id : null,
        qty: rand(1, 30),
        refType: 'SEED',
        userId: pick(users).id,
        userName: pick(users).name,
        note: 'حركة تجريبية',
        createdAt: date,
      },
    })
  }

  const suppliers = await Promise.all([
    prisma.supplier.create({ data: { code: 'SUP-001', name: 'شركة الرياض لقطع غيار المضخات', contact: 'م. فهد الحربي', phone: '+966501112233', email: 'sales@riyadhpumps.sa', address: 'الرياض', taxNumber: '300111222333003' } }),
    prisma.supplier.create({ data: { code: 'SUP-002', name: 'مؤسسة جدة للخلاطات والمعدات', contact: 'أ. ماجد الزهراني', phone: '+966502223344', email: 'info@jeddahmixers.sa', address: 'جدة', taxNumber: '300222333444003' } }),
    prisma.supplier.create({ data: { code: 'SUP-003', name: 'الشركة السعودية للزيوت والشحوم', contact: 'م. عبدالله الشهري', phone: '+966503334455', email: 'orders@saudilubes.sa', address: 'الدمام', taxNumber: '300333444555003' } }),
    prisma.supplier.create({ data: { code: 'SUP-004', name: 'مصنع الدمام للفلاتر', contact: 'أ. ناصر العسيري', phone: '+966504445566', email: 'filters@dammamfilter.sa', address: 'الدمام', taxNumber: '300444555666003' } }),
  ])
  const customers = await Promise.all([
    prisma.customer.create({ data: { code: 'CUS-001', name: 'مصنع الخرسانة الحديثة - الرياض', contact: 'م. تركي المطيري', phone: '+966505556677', email: 'ops@modernconcrete.sa', address: 'المدينة الصناعية الثانية، الرياض', taxNumber: '310555666777003' } }),
    prisma.customer.create({ data: { code: 'CUS-002', name: 'شركة بناء المستقبل للمقاولات', contact: 'أ. ريم السبيعي', phone: '+966506667788', email: 'purchase@futurebuild.sa', address: 'الرياض', taxNumber: '310666777888003' } }),
    prisma.customer.create({ data: { code: 'CUS-003', name: 'مؤسسة نقل الخرسانة السريع', contact: 'أ. بندر الدوسري', phone: '+966507778899', email: 'fleet@fastmix.sa', address: 'الخرج', taxNumber: '310777888999003' } }),
    prisma.customer.create({ data: { code: 'CUS-004', name: 'ورشة السلام لصيانة المعدات', contact: 'م. يوسف العمري', phone: '+966508889900', email: 'workshop@salam.sa', address: 'جدة', taxNumber: '310888999000003' } }),
    prisma.customer.create({ data: { code: 'CUS-005', name: 'مصنع جدة للخرسانة الجاهزة', contact: 'أ. هاني باعشن', phone: '+966509990011', email: 'plant@jeddahrmc.sa', address: 'المنطقة الصناعية، جدة', taxNumber: '310999000111003' } }),
  ])

  const poItem = (sku: string) => items.find((i) => i.sku === sku)!
  const createPo = async (supplierIndex: number, warehouseId: string, lines: { itemId: string; qty: number; unitCost: number }[]) => {
    const number = await nextNumber('PO')
    const subtotal = lines.reduce((s, l) => s + l.qty * l.unitCost, 0)
    const taxAmount = Math.round(subtotal * 15) / 100
    return prisma.purchaseOrder.create({
      data: {
        number,
        supplierId: suppliers[supplierIndex].id,
        warehouseId,
        status: 'OPEN',
        expectedAt: days(rand(2, 12)),
        subtotal: Math.round(subtotal * 100) / 100,
        taxRate: 15,
        taxAmount,
        total: Math.round((subtotal + taxAmount) * 100) / 100,
        createdById: users[0].id,
        lines: { create: lines },
      },
      include: { lines: true },
    })
  }

  const po1 = await createPo(0, cairo.id, [
    { itemId: poItem('PMP-0001').id, qty: 20, unitCost: 4200 },
    { itemId: poItem('PMP-0002').id, qty: 30, unitCost: 85 },
    { itemId: poItem('PMP-0003').id, qty: 15, unitCost: 620 },
  ])
  await createPo(2, cairo.id, [
    { itemId: poItem('OIL-0021').id, qty: 500, unitCost: 95 },
    { itemId: poItem('OIL-0022').id, qty: 200, unitCost: 320 },
    { itemId: poItem('OIL-0023').id, qty: 200, unitCost: 340 },
  ])
  const po3 = await createPo(1, cairo.id, [
    { itemId: poItem('MXR-0005').id, qty: 20, unitCost: 950 },
    { itemId: poItem('MXR-0007').id, qty: 8, unitCost: 2100 },
  ])

  // Receive the third PO fully so receipts + invoice data exist.
  {
    const receiptNumber = await nextNumber('GRN')
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.receipt.create({
        data: {
          number: receiptNumber,
          poId: po3.id,
          warehouseId: cairo.id,
          notes: 'استلام تجريبي كامل',
          createdById: users[2].id,
        },
      })
      for (const line of po3.lines) {
        const { lotId } = await receiveStock(tx, {
          itemId: line.itemId,
          locationId: dock.id,
          qty: line.qty,
          lotCode: `PO-${po3.number}-${line.id.slice(-4)}`,
          expiryDate: days(240),
        })
        await tx.receiptLine.create({
          data: {
            receiptId: receipt.id,
            poLineId: line.id,
            itemId: line.itemId,
            locationId: dock.id,
            lotCode: `PO-${po3.number}-${line.id.slice(-4)}`,
            expiryDate: days(240),
            qty: line.qty,
          },
        })
        await tx.stockMovement.create({
          data: {
            type: 'RECEIVE',
            itemId: line.itemId,
            toLocationId: dock.id,
            lotId,
            qty: line.qty,
            refType: 'PURCHASE_ORDER',
            refId: po3.id,
            userId: users[2].id,
            userName: users[2].name,
            note: `${po3.number} · ${receiptNumber}`,
          },
        })
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { receivedQty: line.qty },
        })
      }
    })
    await prisma.purchaseOrder.update({ where: { id: po3.id }, data: { status: 'RECEIVED' } })
  }

  const soItem = (sku: string) => items.find((i) => i.sku === sku)!
  const createSo = async (
    customerIndex: number,
    warehouseId: string,
    lines: { itemId: string; qty: number; unitPrice: number }[],
    priority = 'NORMAL',
  ) => {
    const number = await nextNumber('SO')
    const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
    const taxAmount = Math.round(subtotal * 15) / 100
    return prisma.salesOrder.create({
      data: {
        number,
        customerId: customers[customerIndex].id,
        warehouseId,
        priority,
        shipTo: customers[customerIndex].address,
        status: 'OPEN',
        subtotal: Math.round(subtotal * 100) / 100,
        taxRate: 15,
        taxAmount,
        total: Math.round((subtotal + taxAmount) * 100) / 100,
        createdById: users[1].id,
        lines: { create: lines },
      },
      include: { lines: true },
    })
  }

  const so1 = await createSo(0, cairo.id, [
    { itemId: soItem('CNS-0027').id, qty: 24, unitPrice: 320 },
    { itemId: soItem('CNS-0028').id, qty: 12, unitPrice: 360 },
  ])
  await allocateOrder(so1.id, users[1].id)

  const so2 = await createSo(3, cairo.id, [
    { itemId: soItem('MCH-0009').id, qty: 8, unitPrice: 75 },
    { itemId: soItem('MCH-0010').id, qty: 4, unitPrice: 110 },
  ], 'HIGH')
  await allocateOrder(so2.id, users[1].id)

  const so3 = await createSo(2, cairo.id, [
    { itemId: soItem('VEH-0018').id, qty: 60, unitPrice: 190 },
    { itemId: soItem('VEH-0019').id, qty: 200, unitPrice: 390 },
  ], 'URGENT')
  await allocateOrder(so3.id, users[1].id)
  {
    const detail = await prisma.salesOrder.findUnique({ where: { id: so3.id }, include: { lines: true, allocations: true } })
    const line = detail!.lines[0]
    const allocation = detail!.allocations.find((a) => a.soLineId === line.id)!
    await pickLine({ soLineId: line.id, qty: 30, locationId: allocation.locationId, userId: users[2].id, userName: users[2].name })
  }

  const so4 = await createSo(1, cairo.id, [
    { itemId: soItem('WKS-0013').id, qty: 10, unitPrice: 720 },
    { itemId: soItem('WKS-0014').id, qty: 20, unitPrice: 50 },
  ])
  await allocateOrder(so4.id, users[1].id)
  {
    const detail = await prisma.salesOrder.findUnique({ where: { id: so4.id }, include: { lines: true, allocations: true } })
    for (const line of detail!.lines) {
      for (const allocation of detail!.allocations.filter((a) => a.soLineId === line.id)) {
        await pickLine({ soLineId: line.id, qty: allocation.qty, locationId: allocation.locationId, userId: users[2].id, userName: users[2].name })
      }
    }
  }

  const so5 = await createSo(4, cairo.id, [
    { itemId: soItem('OIL-0022').id, qty: 15, unitPrice: 450 },
    { itemId: soItem('OIL-0023').id, qty: 20, unitPrice: 480 },
  ])
  await allocateOrder(so5.id, users[1].id)
  {
    const detail = await prisma.salesOrder.findUnique({ where: { id: so5.id }, include: { lines: true, allocations: true } })
    for (const line of detail!.lines) {
      for (const allocation of detail!.allocations.filter((a) => a.soLineId === line.id)) {
        await pickLine({ soLineId: line.id, qty: allocation.qty, locationId: allocation.locationId, userId: users[2].id, userName: users[2].name })
      }
      await packLine({ soLineId: line.id, qty: line.qty })
    }
  }

  const so6 = await createSo(0, cairo.id, [
    { itemId: soItem('FLT-0024').id, qty: 20, unitPrice: 80 },
    { itemId: soItem('FLT-0025').id, qty: 10, unitPrice: 140 },
  ])
  await allocateOrder(so6.id, users[1].id)
  {
    const detail = await prisma.salesOrder.findUnique({ where: { id: so6.id }, include: { lines: true, allocations: true } })
    for (const line of detail!.lines) {
      for (const allocation of detail!.allocations.filter((a) => a.soLineId === line.id)) {
        await pickLine({ soLineId: line.id, qty: allocation.qty, locationId: allocation.locationId, userId: users[2].id, userName: users[2].name })
      }
      await packLine({ soLineId: line.id, qty: line.qty })
    }
    const { shipOrder } = await import('./lib/inventory.js')
    await shipOrder({ soId: so6.id, carrier: 'أرامكس', tracking: 'ARX-2026-88421', userId: users[2].id, userName: users[2].name })
  }

  // Invoices
  {
    const shipped = await prisma.salesOrder.findUnique({ where: { id: so6.id }, include: { lines: { include: { item: true } }, customer: true } })
    if (shipped) {
      const number = await nextNumber('INV')
      await prisma.invoice.create({
        data: {
          number,
          type: 'SALES',
          partnerType: 'CUSTOMER',
          partnerId: shipped.customerId,
          partnerName: shipped.customer?.name || 'عميل',
          refType: 'SALES_ORDER',
          refId: shipped.id,
          subtotal: shipped.subtotal,
          taxRate: shipped.taxRate,
          taxAmount: shipped.taxAmount,
          total: shipped.total,
          paidAmount: Math.round(shipped.total * 0.4 * 100) / 100,
          status: 'PARTIAL',
          createdById: users[1].id,
          notes: 'فاتورة مبيعات آلية',
          lines: {
            create: shipped.lines.map((l) => ({
              itemId: l.itemId,
              description: `${l.item.name} (${l.item.sku})`,
              qty: l.qty,
              unitPrice: l.unitPrice,
              total: l.qty * l.unitPrice,
            })),
          },
        },
      })
    }
    const po = await prisma.purchaseOrder.findUnique({ where: { id: po3.id }, include: { lines: { include: { item: true } }, supplier: true } })
    if (po) {
      const number = await nextNumber('INV')
      await prisma.invoice.create({
        data: {
          number,
          type: 'PURCHASE',
          partnerType: 'SUPPLIER',
          partnerId: po.supplierId,
          partnerName: po.supplier?.name || 'مورد',
          refType: 'PURCHASE_ORDER',
          refId: po.id,
          subtotal: po.subtotal,
          taxRate: po.taxRate,
          taxAmount: po.taxAmount,
          total: po.total,
          status: 'UNPAID',
          dueDate: days(15),
          createdById: users[1].id,
          lines: {
            create: po.lines.map((l) => ({
              itemId: l.itemId,
              description: `${l.item.name} (${l.item.sku})`,
              qty: l.qty,
              unitPrice: l.unitCost,
              total: l.qty * l.unitCost,
            })),
          },
        },
      })
    }
  }

  // Transfers
  const transferStockA = await prisma.stock.findFirst({
    where: { itemId: soItem('MCH-0009').id, quantity: { gte: 100 } },
  })
  const transferStockB = await prisma.stock.findFirst({
    where: { itemId: soItem('WKS-0016').id, quantity: { gte: 15 } },
  })
  const transferNumber = await nextNumber('TRF')
  const tr = await prisma.transfer.create({
    data: {
      number: transferNumber,
      fromWarehouseId: cairo.id,
      toWarehouseId: alex.id,
      notes: 'تحويل تجريبي قيد الإنشاء',
      createdById: users[1].id,
      lines: {
        create: [
          {
            itemId: soItem('MCH-0009').id,
            qty: 100,
            fromLocationId: transferStockA?.locationId || caiBins[0].id,
            toLocationId: alexBins[0].id,
          },
          {
            itemId: soItem('WKS-0016').id,
            qty: 15,
            fromLocationId: transferStockB?.locationId || caiBins[1].id,
            toLocationId: alexBins[1].id,
          },
        ],
      },
    },
  })
  void tr

  const transferStockC = await prisma.stock.findFirst({
    where: { itemId: soItem('FLT-0024').id, quantity: { gte: 20 } },
  })
  const transfer2Number = await nextNumber('TRF')
  const tr2 = await prisma.transfer.create({
    data: {
      number: transfer2Number,
      fromWarehouseId: cairo.id,
      toWarehouseId: alex.id,
      notes: 'تحويل تجريبي قيد النقل',
      createdById: users[1].id,
      lines: {
        create: [
          {
            itemId: soItem('FLT-0024').id,
            qty: 20,
            fromLocationId: transferStockC?.locationId || caiBins[2].id,
            toLocationId: alexBins[2].id,
          },
        ],
      },
    },
  })
  try {
    await dispatchTransfer(tr2.id, users[1].id, users[1].name)
  } catch (error) {
    console.warn('تعذر صرف التحويل التجريبي:', error instanceof Error ? error.message : error)
  }

  // Cycle counts: one open, one completed with variance.
  const count = await createCycleCount({
    warehouseId: cairo.id,
    locationId: caiBins[0].id,
    notes: 'جرد دوري لرف R01-C01',
    createdById: users[1].id,
  })
  const count2 = await createCycleCount({
    warehouseId: cairo.id,
    notes: 'جرد أسبوعي لمنطقة القاهرة',
    createdById: users[1].id,
  })
  const completed = await prisma.cycleCount.findUnique({ where: { id: count2.id }, include: { lines: true } })
  if (completed) {
    for (const line of completed.lines) {
      const countedQty = line.expectedQty - rand(0, 1)
      await prisma.cycleCountLine.update({ where: { id: line.id }, data: { countedQty } })
    }
    await submitCycleCount(count2.id, users[0].id, users[0].name)
  }
  void count

  await prisma.auditLog.create({
    data: { userId: users[0].id, userName: users[0].name, action: 'LOGIN', entity: 'User', entityId: users[0].id, details: '{"email":"admin@storege.app"}' },
  })
  await prisma.auditLog.create({
    data: { userId: users[1].id, userName: users[1].name, action: 'CREATE', entity: 'PurchaseOrder', entityId: po1.id, details: `{"number":"${po1.number}"}` },
  })
  await prisma.auditLog.create({
    data: { userId: users[2].id, userName: users[2].name, action: 'PICK', entity: 'SalesOrder', entityId: so4.id, details: '{"note":"demo pick"}' },
  })

  const counts = {
    users: await prisma.user.count(),
    warehouses: await prisma.warehouse.count(),
    locations: await prisma.location.count(),
    items: await prisma.item.count(),
    stockRows: await prisma.stock.count(),
    movements: await prisma.stockMovement.count(),
    purchaseOrders: await prisma.purchaseOrder.count(),
    salesOrders: await prisma.salesOrder.count(),
    invoices: await prisma.invoice.count(),
    counts: await prisma.cycleCount.count(),
  }
  console.log('✅ تم تجهيز بيانات ستورج:', counts)
  console.log('👤 admin@storege.app / Admin@12345')
}

main()
  .catch((error) => {
    console.error('❌ فشل تجهيز البيانات:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
