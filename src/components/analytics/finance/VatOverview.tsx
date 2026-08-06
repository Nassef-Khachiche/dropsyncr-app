import { useState, useEffect, useCallback } from 'react';
import { Loader2, Globe2, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState, KpiCard,
  DataTable, EUR, PCT, NUM,
} from '../shared';

interface VatOverviewProps {
  activeProfile: string;
}

export function VatOverview({ activeProfile }: VatOverviewProps) {
  const { t } = useLanguage();
  const { selectedStores, selectedCountries } = useAnalytics();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getVatOverview({
        installationId: activeProfile,
        year,
        quarter,
        stores: selectedStores,
        countries: selectedCountries,
      });
      setData(result);
    } catch (error) {
      console.error('Failed to load VAT overview:', error);
      toast.error(t('errorLoadingAnalytics'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, year, quarter, selectedStores, selectedCountries]);

  useEffect(() => { load(); }, [load]);

  const periods: { year: number; quarter: number }[] = data?.availablePeriods || [];

  const columns = (withVat: boolean) => [
    { key: 'country', header: t('colCountry') },
    { key: 'gross', header: t('colRevenueIncl'), align: 'right' as const, hideOnMobile: true },
    { key: 'net', header: t('colRevenueExcl'), align: 'right' as const },
    ...(withVat ? [
      { key: 'rate', header: t('vatLabel'), align: 'right' as const, hideOnMobile: true },
      { key: 'vat', header: t('colVatAmount'), align: 'right' as const },
    ] : []),
    { key: 'orders', header: t('ordersLabel'), align: 'right' as const, hideOnMobile: true },
  ];

  const buildRows = (list: any[], totals: any, withVat: boolean) => {
    const rows = list.map((entry) => ({
      country: <span className="analytics-country">{entry.country}</span>,
      gross: <span className="text-slate-500">{EUR(entry.grossRevenue)}</span>,
      net: <span className="analytics-num">{EUR(entry.netRevenue)}</span>,
      rate: <span className="text-slate-500">{PCT(entry.vatRate, 0)}</span>,
      vat: <span className="analytics-num">{EUR(entry.vatAmount)}</span>,
      orders: <span className="text-slate-500">{NUM(entry.orderCount)}</span>,
    }));

    if (list.length > 0) {
      rows.push({
        country: <span className="analytics-total-cell">{t('totalLabel')}</span>,
        gross: <span className="analytics-total-cell">{EUR(totals.grossRevenue)}</span>,
        net: <span className="analytics-total-cell">{EUR(totals.netRevenue)}</span>,
        rate: <span className="analytics-total-cell">–</span>,
        vat: <span className="analytics-total-cell">{EUR(totals.vatAmount)}</span>,
        orders: <span className="analytics-total-cell">{NUM(totals.orderCount)}</span>,
      } as any);
    }

    return rows;
  };

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('vatOverview')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  const eu = data?.eu;
  const nonEu = data?.nonEu;

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('vatOverview')}
        subtitle={t('vatOverviewSubtitle')}
        showFilters={false}
        extra={
          <select
            className="analytics-select"
            value={`${year}-${quarter}`}
            onChange={(event) => {
              const [nextYear, nextQuarter] = event.target.value.split('-').map(Number);
              setYear(nextYear);
              setQuarter(nextQuarter);
            }}
          >
            {periods.map((period) => (
              <option key={`${period.year}-${period.quarter}`} value={`${period.year}-${period.quarter}`}>
                Q{period.quarter} {period.year}
              </option>
            ))}
          </select>
        }
      />

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : !data ? (
        <SectionCard><EmptyState message={t('noDataForPeriod')} /></SectionCard>
      ) : (
        <>
          <div className="analytics-kpi-grid is-three">
            <KpiCard
              label={t('kpiVatToDeclare')}
              value={EUR(eu.totals.vatAmount)}
              sub={`Q${quarter} ${year}`}
              color="indigo"
              icon={<Landmark className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiEuRevenue')}
              value={EUR(eu.totals.netRevenue)}
              sub={`${eu.totals.countryCount} ${t('countriesLabel')}`}
              color="purple"
              icon={<Landmark className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiNonEuRevenue')}
              value={EUR(nonEu.totals.netRevenue)}
              sub={`${NUM(nonEu.totals.orderCount)} ${t('ordersLabel').toLowerCase()}`}
              color="amber"
              icon={<Globe2 className="w-4 h-4 text-white" />}
            />
          </div>

          <SectionCard title={t('vatEuTitle')}>
            {eu.countries.length === 0 ? (
              <EmptyState message={t('noDataForPeriod')} />
            ) : (
              <DataTable
                columns={columns(true)}
                rows={buildRows(eu.countries, eu.totals, true)}
                emptyMessage={t('noDataForPeriod')}
              />
            )}
          </SectionCard>

          <SectionCard title={t('vatNonEuTitle')}>
            {nonEu.countries.length === 0 ? (
              <EmptyState message={t('noNonEuOrders')} />
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-3">{t('vatNonEuHint')}</p>
                <DataTable
                  columns={columns(false)}
                  rows={buildRows(nonEu.countries, nonEu.totals, false)}
                  emptyMessage={t('noNonEuOrders')}
                />
              </>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}