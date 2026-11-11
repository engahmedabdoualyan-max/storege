import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, RefreshCw } from 'lucide-react'
import { Button, Card, CardHeader, DataTable, EmptyState, PageHeader } from '../components/ui'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useWarehouse } from '../lib/warehouse'
import { useToast } from '../lib/toast'
import { qty } from '../lib/format'

type Suggestion = { itemId: string; sku: string; name: string; unit: string; onHand: number; minStock: number; shortage: number; qty: number; fromLocationId: string; fromLocationCode: string; toLocationId: string; toLocationCode: string }

export default function Replenishment() {
  const { t } = useI18n()
  const toast = useToast()
  const qc = useQueryClient()
  const { warehouseId } = useWarehouse()
  const query = useQuery({ queryKey: ['replenishment', warehouseId], queryFn: () => api.get<{ suggestions: Suggestion[]; count: number }>(`/api/replenishment?warehouseId=${warehouseId}`) })
  const moveMutation = useMutation({
    mutationFn: (s: Suggestion) => api.post('/api/inventory/move', { itemId: s.itemId, qty: s.qty, fromLocationId: s.fromLocationId, toLocationId: s.toLocationId }),
    onSuccess: () => { toast.push(t('تمت إعادة التعبئة')); qc.invalidateQueries({ queryKey: ['replenishment'] }) },
    onError: (e: Error) => toast.push(e.message, 'error'),
  })

  return (
    <div>
      <PageHeader title={t('إعادة التعبئة (Replenishment)')} subtitle={t('نقل من المخزون الاحتياطي إلى واجهة الالتقاط')} actions={
        <Button variant="secondary" onClick={() => query.refetch()}><RefreshCw size={15} /> {t('تحديث')}</Button>
      } />
      <Card>
        <CardHeader title={t('اقتراحات')} subtitle={`${query.data?.count || 0} ${t('صنف')} ${t('أقل من الحد')}`} />
        {(query.data?.suggestions || []).length === 0 ? (
          <EmptyState title={t('لا توجد اقتراحات')} description={t('جميع الأصناف فوق الحد')} />
        ) : (
          <DataTable headers={[t('الصنف'), t('المتاح'), t('الحد'), t('النقص'), t('من'), t('إلى'), t('الإجراء')]} rowCount={query.data?.suggestions.length}>
            {(query.data?.suggestions || []).map((s) => (
              <tr key={s.itemId} className="hover:bg-slate-50/70">
                <td className="px-3.5 py-2.5"><p className="text-xs font-bold text-slate-700">{s.name}</p><p className="font-mono text-[10px] text-slate-400">{s.sku}</p></td>
                <td className="px-3.5 py-2.5 text-xs tabular-nums">{qty(s.onHand)}</td>
                <td className="px-3.5 py-2.5 text-xs tabular-nums">{qty(s.minStock)}</td>
                <td className="px-3.5 py-2.5 text-xs font-extrabold tabular-nums text-rose-600">{qty(s.shortage)}</td>
                <td className="px-3.5 py-2.5 font-mono text-xs text-slate-600">{s.fromLocationCode}</td>
                <td className="px-3.5 py-2.5 font-mono text-xs text-slate-600">{s.toLocationCode}</td>
                <td className="px-3.5 py-2.5">
                  <Button size="sm" onClick={() => moveMutation.mutate(s)} loading={moveMutation.isPending}><ArrowDownToLine size={13} /> {t('نقل')}</Button>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    </div>
  )
}
