import { prisma } from './prisma'

export const DEFAULT_SETTINGS: Record<string, string> = {
  companyName: 'مصنع الرياض للخرسانة وقطع الغيار',
  companyNameEn: 'Riyadh Concrete & Spare Parts Factory',
  companyPhone: '+966 11 000 0000',
  companyEmail: 'info@storege.sa',
  companyAddress: 'المدينة الصناعية الثانية، الرياض، المملكة العربية السعودية',
  companyTaxNumber: '310000000000003',
  currency: 'SAR',
  currencySymbol: 'ر.س',
  taxRate: '15',
  logoUrl: '',
  invoiceFooter: 'شكرًا لتعاملكم معنا — Thank you for your business',
  lowStockAlert: 'true',
  allowNegativeStock: 'false',
  autoAllocateOrders: 'true',
  labelWidth: '50',
  labelHeight: '25',
  labelSymbology: 'CODE128',
  labelShowName: 'true',
  labelShowPrice: 'true',
  labelShowSku: 'true',
  barcodePrefix: 'STG',
}

let cache: { at: number; values: Record<string, string> } | null = null

export async function getSettings(force = false): Promise<Record<string, string>> {
  if (!force && cache && Date.now() - cache.at < 5000) return cache.values
  const rows = await prisma.setting.findMany()
  const values = { ...DEFAULT_SETTINGS }
  for (const row of rows) values[row.key] = row.value
  cache = { at: Date.now(), values }
  return values
}

export async function updateSettings(values: Record<string, string>) {
  const entries = Object.entries(values)
  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    })
  }
  cache = null
  return getSettings(true)
}
