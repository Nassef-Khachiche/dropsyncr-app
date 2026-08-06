import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Undo2, Percent, Euro, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState, KpiCard,
  DataTable, StoreBadge, EUR, EUR_SHORT, PCT, NUM,
} from '../shared';

interface ReturnsAnalyticsProps {
  activeProfile: string;
}

const BAR_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#0ea5e9', '#f59e0b', '#10b981', '#f43f5e'];

export function ReturnsAnalytics({ activeProfile }: ReturnsAnalyticsProps) {
  const { t, language } = useLanguage();
  const { dateRange, selectedStores, selectedCountries } = useAnalytics();

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const locale = language === 'nl' ? 'nl-NL' : language === 'de' ? 'de-DE' : 'en-GB';

  const monthLabel = (month: string) => {
    const [year, monthNumber] = month.split('-');
    return new Date(Number(year), Number(monthNumber) - 1, 1)
      .toLocaleString(locale, { month: 'short', year: '2-digit' });
  };

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getReturnsAnalytics({
        installationId: activeProfile,
        from: dateRange.from,
        to: dateRange.to,
        stores: selectedStores,
        countries: selectedCountries,
      });
      setData(result);
    } catch (error) {
      console.error('Failed to load returns analytics:', error);
      toast.error(t('errorLoadingAnalytics'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, dateRange, selectedStores, selectedCountries]);

  useEffect(() => { load(); }, [load]);

  const kpis = data?.kpis;
  const byStore: any[] = data?.byStore || [];
  const timeline = (data?.timeline || []).map((entry: any) => ({
    ...entry,
    label: monthLabel(entry.month),
  }));

  const rateColor = (rate: number | null) =>
    rate == null ? 'is-thin' : rate > 0.1 ? 'is-loss' : rate > 0.05 ? 'is-thin' : 'is-good';

  const columns = [
    { key: 'store', header: t('colStore') },
    { key: 'returns', header: t('colReturns'), align: 'right' as const },
    { key: 'units', header: t('colUnits'), align: 'right' as const, hideOnMobile: true },
    { key: 'orders', header: t('colOrdersInPeriod'), align: 'right' as const, hideOnMobile: true },
    { key: 'rate', header: t('colReturnShort'), align: 'right' as const },
    { key: 'value', header: t('colReturnValue'), align: 'right' as const },
    { key: 'processed', header: t('colProcessed'), align: 'right' as const, hideOnMobile: true },
  ];

  const rows = byStore.map((entry) => ({
    store: <StoreBadge store={entry.store} />,
    returns: <span className="analytics-num">{NUM(entry.returns)}</span>,
    units: <span className="text-slate-500">{NUM(entry.units)}</span>,
    orders: <span className="text-slate-500">{NUM(entry.orderCount)}</span>,
    rate: entry.returnRate != null
      ? <span className={`analytics-margin ${rateColor(entry.returnRate)}`}>{PCT(entry.returnRate)}</span>
      : <span className="text-slate-300">–</span>,
    value: <span className="analytics-num">{EUR(entry.value)}</span>,
    processed: (
      <span className="text-slate-500">
        {NUM(entry.processed)} / {NUM(entry.returns)}
      </span>
    ),
  }));

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('returnsAnalytics')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('returnsAnalytics')}
        subtitle={t('returnsAnalyticsSubtitle')}
      />

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : !data || !kpis ? (
        <SectionCard><EmptyState message={t('noReturnsInPeriod')} /></SectionCard>
      ) : (
        <>
          <div className="analytics-kpi-grid is-four">
            <KpiCard
              label={t('kpiTotalReturns')}
              value={NUM(kpis.totalReturns)}
              sub={`${NUM(kpis.totalUnits)} ${t('unitsShort')}`}
              color="rose"
              icon={<Undo2 className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiReturnRate')}
              value={PCT(kpis.returnRate)}
              sub={t('relativeToOrders')}
              color={kpis.returnRate > 0.1 ? 'rose' : kpis.returnRate > 0.05 ? 'amber' : 'emerald'}
              icon={<Percent className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiReturnValue')}
              value={EUR(kpis.totalValue)}
              sub={`${t('avgLabel')} ${EUR(kpis.avgValue)}`}
              color="amber"
              icon={<Euro className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiProcessed')}
              value={`${NUM(kpis.processedCount)} / ${NUM(kpis.totalReturns)}`}
              sub={kpis.openCount > 0 ? `${NUM(kpis.openCount)} ${t('stillOpen')}` : undefined}
              color="indigo"
              icon={<CheckCircle2 className="w-4 h-4 text-white" />}
            />
          </div>

          <div className="analytics-charts-grid">
            <div className="min-w-0">
              <SectionCard title={t('returnsOverTimeTitle')}>
                {timeline.length === 0 ? (
                  <EmptyState message={t('noReturnsInPeriod')} />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={timeline} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="returns-grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
                      <Tooltip
                        cursor={{ stroke: '#cbd5e1' }}
                        formatter={(value: number) => [NUM(value), t('colReturns')]}
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="returns"
                        stroke="#6366f1"
                        fill="url(#returns-grad)"
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </SectionCard>
            </div>

            <div className="min-w-0">
              <SectionCard title={t('returnsPerStoreTitle')}>
                {byStore.length === 0 ? (
                  <EmptyState message={t('noReturnsInPeriod')} />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={byStore} layout="vertical" margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="store" stroke="#94a3b8" tick={{ fontSize: 10 }} width={90} />
                      <Tooltip
                        cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                        formatter={(value: number) => [NUM(value), t('colReturns')]}
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                      />
                      <Bar dataKey="returns" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                        {byStore.map((_, index) => (
                          <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </SectionCard>
            </div>
          </div>

          <SectionCard title={t('returnsStoreDetailTitle')}>
            <DataTable columns={columns} rows={rows} emptyMessage={t('noReturnsInPeriod')} />
          </SectionCard>
        </>
      )}
    </div>
  );
}