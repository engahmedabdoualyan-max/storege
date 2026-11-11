import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export type CompanySettings = Record<string, string>

export function useCompany() {
  const query = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: () => api.get<CompanySettings>('/api/settings'),
    staleTime: 60_000,
  })
  const settings = query.data || {}
  return {
    ...query,
    settings,
    name: settings.companyName || 'Storege',
    nameEn: settings.companyNameEn || 'Storege',
    logoUrl: settings.logoUrl || '',
    currency: settings.currency || 'SAR',
    currencySymbol: settings.currencySymbol || 'ر.س',
    taxRate: settings.taxRate || '15',
  }
}
