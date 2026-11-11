import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Boxes, ClipboardList, Layers } from 'lucide-react'
import { Button, Card, CardHeader, DataTable, PageHeader } from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { money, num, qty } from '../lib/format'

type SalesOrder = { id: string; number: string; status: string; customer?: { name: string } }
type WaveLine = { itemId: string; sku: string; name: string; unit: string; locationId: string; locationCode: string; qty: number; picked: number }

export default function WavePicking() {
  const { t, lang } = useI18n()
  const [selected, setSelected] = useState<string[]>([])
  const [ids, setIds] = useState('')

  const ordersQuery = useQuery({
    queryKey: ['sales-orders-wave'],
    queryFn: () => api.get<{ items: SalesOrder[]; total: number }>('/api/sales-orders?status=ALLOCATED'),
  })

  const waveQuery = useQuery({
    queryKey: ['pick-wave', ids],
    queryFn: () => api.get<{ lines: WaveLine[]; orders: number }>(`/api/reports/pick-wave?ids=${encodeURIComponent(ids)}`),
    enabled: Boolean(ids),
  })

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  const generate = () => setIds(selected.join(','))

  return (
    <div>
      <PageHeader
        title={t('موجات الالتقاط (Wave Picking)')}
        subtitle={t('تجميع أوامر بيع متعددة في قائمة التقط واحد')}
        actions={
          <Button onClick={generate} disabled={!selected.length}>
            <Layers size={16} /> {t('توليد قائمة الالتقاط')}
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader title={t('أوامر بيع مخصصة')} subtitle={`${num(selected.length)} ${t('محدد')}`} />
          <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
            {(ordersQuery.data?.items || []).map((order) => (
              <label key={order.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(order.id)}
                  onChange={() => toggle(order.id)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-700">{order.number}</p>
                  <p className="truncate text-[10px] text-slate-400">{order.customer?.name || '—'}</p>
                </div>
                <span className="text-[10px] font-bold text-slate-500">{order.status}</span>
              </label>
            ))}
            {!(ordersQuery.data?.items || []).length ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">{t('لا توجد أوامر مخصصة')}</p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t('قائمة التقط المجمّعة')}
            subtitle={ids ? `${t('أوامر')}: ${waveQuery.data?.orders || 0}` : t('اختر أوامر ثم توليد')}
            actions={
              <Button variant="secondary" onClick={() => { setSelected([]); setIds('') }}>
                <ClipboardList size={15} /> {t('إعادة تعيين')}
              </Button>
            }
          />
          {waveQuery.isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">{t('جاري التحميل...')}</div>
          ) : (
            <DataTable
              headers={[t('الصنف'), t('الموقع'), t('الكمية'), t('مُلتقط'), t('المتبقي')]}
              rowCount={waveQuery.data?.lines.length}
            >
              {(waveQuery.data?.lines || []).map((line) => (
                <tr key={`${line.itemId}-${line.locationId}`} className="hover:bg-slate-50/70">
                  <td className="px-3.5 py-2.5">
                    <p className="text-xs font-bold text-slate-700">{line.name}</p>
                    <p className="font-mono text-[10px] text-slate-400">{line.sku}</p>
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-xs text-slate-600">{line.locationCode}</td>
                  <td className="px-3.5 py-2.5 text-xs font-bold tabular-nums text-slate-700">{qty(line.qty)}</td>
                  <td className="px-3.5 py-2.5 text-xs tabular-nums text-emerald-700">{qty(line.picked)}</td>
                  <td className="px-3.5 py-2.5 text-xs font-extrabold tabular-nums text-rose-600">{qty(Math.max(0, line.qty - line.picked))}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>
      </div>
    </div>
  )
}
