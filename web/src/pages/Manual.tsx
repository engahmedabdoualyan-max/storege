import { BookOpen, ExternalLink } from 'lucide-react'
import { Card, CardHeader, PageHeader } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { useCompany } from '../lib/company'

const SECTIONS_AR = [
  { title: 'نظرة عامة', body: 'Storege WMS نظام إدارة مخازن احترافي بالباركود وأجهزة الكف، مصمم لمصانع الخرسانة وقطع الغيار والورش ومستلزمات السيارات في المملكة العربية السعودية.' },
  { title: 'المميزات الرئيسية', body: 'استلام/صرف/نقل/جرد، لوط وسيريال، FEFO، باركود (EAN-13/Code128)، مصمم ملصقات، أوفلاين كامل، 9 لغات، SAR، مخزون استراتيجي، إجمالي البضائع، مطابقة فواتير الشراء.' },
  { title: 'البدء', body: 'سجّل الدخول (admin@storege.app / Admin@12345)، اختر المخزن، أضف الأصناف والمواقع، ثم ابدأ الاستلام (PO → استلام → putaway).' },
  { title: 'الجرد', body: 'أنشئ جردًا دوريًا (Cycle Count) بالموقع/المنطقة، أدخل الكميات، اعتمد لتعديل المخزون. الفروقات تُسجّل في سجل التدقيق.' },
  { title: 'جهاز الكف (/m)', body: 'واجهة للشاشات الصغيرة: استلام، putaway، pick، جرد. تعمل أوفلاين (IndexedDB) وتُرسل الطابور عند عودة الاتصال (X-Op-Id يمنع التكرار).' },
  { title: 'اللغات والعملة', body: '9 لغات (عربي/أردو RTL). جميع الأسعار بالريال (SAR)، ضريبة 15%. غيّر اللغة من القائمة (أعلى الواجهة).' },
  { title: 'الدعم', body: 'تطوير شركة فیمتو سوفت — www.fimtosoft.com' },
]

const SECTIONS_EN = [
  { title: 'Overview', body: 'Storege WMS is a professional barcode + handheld warehouse management system for Saudi concrete plants, spare-parts workshops and vehicle consumables.' },
  { title: 'Key features', body: 'Receive/ship/transfer/count, lots & serials, FEFO, barcodes (EAN-13/Code128), label designer, full offline, 9 languages, SAR, strategic stock, totals, purchase-invoice reconciliation.' },
  { title: 'Getting started', body: 'Sign in (admin@storege.app / Admin@12345), select a warehouse, add items & locations, then receive (PO → receive → putaway).' },
  { title: 'Cycle counts', body: 'Create a cycle count by location/zone, enter counted quantities, approve to adjust stock. Variances are audited.' },
  { title: 'Handheld (/m)', body: 'Mobile UI for receive, putaway, pick, count. Works offline (IndexedDB) and syncs when online (X-Op-Id idempotency).' },
  { title: 'Languages & currency', body: '9 languages (Arabic/Urdu RTL). All prices in SAR, 15% tax. Change language from the top selector.' },
  { title: 'Support', body: 'Developed by FimtoSoft — www.fimtosoft.com' },
]

export default function Manual() {
  const { lang } = useI18n()
  const { name } = useCompany()
  const sections = lang === 'ar' ? SECTIONS_AR : SECTIONS_EN
  const isAr = lang === 'ar'

  return (
    <div dir={isAr ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isAr ? 'كتيب استخدام Storege WMS' : 'Storege WMS User Manual'}
        subtitle={isAr ? `دليل مختصر لـ ${name}` : `Quick guide for ${name}`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader title={section.title} />
            <div className="p-4 text-sm leading-relaxed text-slate-600">{section.body}</div>
          </Card>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        <ExternalLink size={12} />
        <a href="https://www.fimtosoft.com" target="_blank" rel="noreferrer" className="font-bold text-brand-700 hover:underline">
          www.fimtosoft.com
        </a>
      </div>
    </div>
  )
}
