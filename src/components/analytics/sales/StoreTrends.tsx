import { useState, useEffect, useCallback, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState,
  DataTable, StoreBadge, EUR, EUR_SHORT, PCT, NUM,
} from '../shared';

interface StoreTrendsProps {
  activeProfile: string;
}

type Granularity = 'week' | 'month';

const LINE_COLORS = [
  '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#a78bfa',
];

// Hoeveel lijnen we standaard tonen; meer wordt onleesbaar.
const DEFAULT_VISIBLE = 6;

export function StoreTrends({ activeProfile }: StoreTrendsProps) {
  const { t } = useLanguage();
  const { dateRange, selectedStores, selectedCountries } = useAnalytics();

  const [granularity, setGranularity] = useState<Granularity>('week');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getStoreTrends({
        installationId: activeProfile,
        from: dateRange.from,
        to: dateRange.to,
        granularity,
        stores: selectedStores,
        countries: selectedCountries,
      });
      setData(result);
    } catch (error) {
      console.error('Failed to load store trends:', error);
      toast.error(t('errorLoadingAnalytics'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, dateRange, granularity, selectedStores, selectedCountries]);

  useEffect(() => { load(); }, [load]);

  const stores: string[] = data?.stores || [];
  const summary: any[] = data?.summary || [];

  // Bij een nieuwe set stores standaard alleen de grootste tonen.
  useEffect(() => {
    if (stores.length === 0) return;
    setHidden(stores.slice(DEFAULT_VISIBLE));
  }, [data?.stores?.join('|')]);

  /*
   * Recharts leest een dataKey als pad, dus een storenaam met een punt erin
   * zou stukgaan. We werken daarom met neutrale sleutels en houden het label
   * er los naast.
   */
  const keyByStore = useMemo(() => {
    const map = new Map<string, string>();
    stores.forEach((store, index) => map.set(store, `s${index}`));
    return map;
  }, [stores]);

  const colorByStore = useMemo(() => {
    const map = new Map<string, string>();
    stores.forEach((store, index) => map.set(store, LINE_COLORS[index % LINE_COLORS.length]));
    return map;
  }, [stores]);

  const chartData = useMemo(() => {
    return (data?.series || []).map((row: any) => {
      const entry: Record<string, any> = { period: row.period };
      for (const store of stores) {
        entry[keyByStore.get(store)!] = row.values?.[store] ?? 0;
      }
      return entry;
    });
  }, [data, stores, keyByStore]);

  const visibleStores = stores.filter((store) => !hidden.includes(store));

  const toggleStore = (store: string) => {
    setHidden((previous) =>
      previous.includes(store)
        ? previous.filter((entry) => entry !== store)
        : [...previous, store],
    );
  };

  const columns = [
    { key: 'rank', header: '#', hideOnMobile: true },
    { key: 'store', header: t('colStore') },
    { key: 'revenue', header: t('revenue'), align: 'right' as const },
    { key: 'orders', header: t('ordersLabel'), align: 'right' as const },
    { key: 'cancelled', header: t('colCancellations'), align: 'right' as const, hideOnMobile: true },
    { key: 'cancelPct', header: t('colCancelShort'), align: 'right' as const, hideOnMobile: true },
    { key: 'avgOrder', header: t('colAvgOrder'), align: 'right' as const, hideOnMobile: true },
  ];

  const rows = summary.map((entry, index) => ({
    rank: <span className="analytics-rank-cell">{index + 1}</span>,
    store: <StoreBadge store={entry.store} />,
    revenue: <span className="analytics-num">{EUR(entry.revenue)}</span>,
    orders: <span className="analytics-num">{NUM(entry.orders)}</span>,
    cancelled: <span className="text-slate-500">{NUM(entry.cancelled)}</span>,
    cancelPct: entry.cancelPct > 0.25
      ? <span className="analytics-pill-warn">{PCT(entry.cancelPct)}</span>
      : <span className="text-slate-400">{PCT(entry.cancelPct)}</span>,
    avgOrder: <span className="analytics-num">{EUR(entry.avgOrderValue)}</span>,
  }));

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('storeTrends')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('storeTrends')}
        subtitle={t('storeTrendsSubtitle')}
      />

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="analytics-segmented">
              {(['week', 'month'] as Granularity[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setGranularity(option)}
                  className={granularity === option ? 'is-active' : ''}
                >
                  {option === 'week' ? t('perWeek') : t('perMonth')}
                </button>
              ))}
            </div>

            <div className="analytics-store-pills">
              {stores.map((store) => {
                const active = !hidden.includes(store);
                const color = colorByStore.get(store);
                return (
                  <button
                    key={store}
                    onClick={() => toggleStore(store)}
                    className={`analytics-store-pill ${active ? 'is-active' : ''}`}
                    style={active ? { backgroundColor: color } : undefined}
                  >
                    <span className="analytics-store-dot" style={{ backgroundColor: color }} />
                    {store}
                  </button>
                );
              })}
            </div>
          </div>

          <SectionCard title={t('revenueOverTimeTitle')}>
            {chartData.length === 0 || visibleStores.length === 0 ? (
              <EmptyState message={
                chartData.length === 0 ? t('noDataForPeriod') : t('selectAtLeastOneStore')
              } />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#94a3b8" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={EUR_SHORT} width={50} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                    formatter={(value: number, key: string) => {
                      const store = stores.find((entry) => keyByStore.get(entry) === key);
                      return [EUR(value), store || key];
                    }}
                  />
                  <Legend
                    formatter={(key: string) => stores.find((entry) => keyByStore.get(entry) === key) || key}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  {visibleStores.map((store) => (
                    <Line
                      key={store}
                      type="monotone"
                      dataKey={keyByStore.get(store)}
                      stroke={colorByStore.get(store)}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title={t('storeOverviewTitle')}>
            <DataTable columns={columns} rows={rows} emptyMessage={t('noDataForPeriod')} />
          </SectionCard>
        </>
      )}
    </div>
  );
}