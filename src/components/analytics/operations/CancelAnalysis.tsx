import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { PackageX, Percent, TrendingDown, Receipt, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState, KpiCard,
  DataTable, StoreBadge, EUR, PCT, NUM,
} from '../shared';

interface CancelAnalysisProps {
  activeProfile: string;
}

type View = 'store' | 'product';

// Rood naarmate de ratio hoger ligt.
const rateColor = (rate: number) =>
  rate > 0.25 ? '#f43f5e' : rate > 0.12 ? '#f59e0b' : '#6366f1';

export function CancelAnalysis({ activeProfile }: CancelAnalysisProps) {
  const { t } = useLanguage();
  const { dateRange, selectedStores, selectedCountries } = useAnalytics();

  const [view, setView] = useState<View>('store');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getCancelAnalysis({
        installationId: activeProfile,
        from: dateRange.from,
        to: dateRange.to,
        stores: selectedStores,
        countries: selectedCountries,
      });
      setData(result);
    } catch (error) {
      console.error('Failed to load cancel analysis:', error);
      toast.error(t('errorLoadingAnalytics'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, dateRange, selectedStores, selectedCountries]);

  useEffect(() => { load(); }, [load]);

  const kpis = data?.kpis;
  const byStore: any[] = data?.byStore || [];
  const byProduct: any[] = data?.byProduct || [];

  const rateBar = (rate: number) => (
    <span className="analytics-progress">
      <span className="analytics-progress-track">
        <span
          className="analytics-progress-fill"
          style={{
            width: `${Math.max(3, Math.min(100, rate * 200))}%`,
            background: rateColor(rate),
          }}
        />
      </span>
      <span
        className="analytics-progress-pct"
        style={{ color: rate > 0.25 ? '#be123c' : rate > 0.12 ? '#b45309' : undefined }}
      >
        {PCT(rate)}
      </span>
    </span>
  );

  const storeColumns = [
    { key: 'store', header: t('colStore'), width: '12rem' },
    { key: 'total', header: t('colTotalOrders'), align: 'right' as const, width: '9rem' },
    { key: 'cancelled', header: t('colCancelled'), align: 'right' as const, width: '9rem' },
    { key: 'rate', header: t('colCancelShort'), align: 'center' as const, width: '11rem' },
    { key: 'lost', header: t('colLostRevenue'), align: 'right' as const },
  ];

  const storeRows = byStore.map((entry) => ({
    store: <StoreBadge store={entry.store} />,
    total: <span className="analytics-num">{NUM(entry.total)}</span>,
    cancelled: <span className="analytics-num">{NUM(entry.cancelled)}</span>,
    rate: rateBar(entry.cancelPct),
    lost: <span className="text-rose-600">{EUR(entry.lostRevenue)}</span>,
  }));

  const productColumns = [
    { key: 'sku', header: t('colSku'), width: '9rem', hideOnMobile: true },
    { key: 'ean', header: t('eanCode'), width: '10rem', hideOnMobile: true },
    { key: 'product', header: t('product') },
    { key: 'total', header: t('colTotalOrders'), align: 'right' as const, width: '8rem', hideOnMobile: true },
    { key: 'cancelled', header: t('colCancelled'), align: 'right' as const, width: '8rem' },
    { key: 'rate', header: t('colCancelShort'), align: 'center' as const, width: '11rem' },
    { key: 'lost', header: t('colLostRevenue'), align: 'right' as const, width: '10rem', hideOnMobile: true },
  ];

  const productRows = byProduct.map((entry) => ({
    sku: <span className="analytics-mono">{entry.sku || '-'}</span>,
    ean: <span className="analytics-mono">{entry.ean || '-'}</span>,
    product: (
      <span className="analytics-product-name" title={entry.productName}>
        {entry.productName}
      </span>
    ),
    total: <span className="text-slate-500">{NUM(entry.total)}</span>,
    cancelled: <span className="analytics-num">{NUM(entry.cancelled)}</span>,
    rate: rateBar(entry.cancelPct),
    lost: <span className="text-rose-600">{EUR(entry.lostRevenue)}</span>,
  }));

  // Top 10 voor de grafiek, aflopend op ratio.
  const chartData = (view === 'store' ? byStore : byProduct)
    .slice(0, 10)
    .map((entry) => ({
      label: view === 'store'
        ? entry.store
        : (entry.sku || entry.ean || String(entry.productName || '').slice(0, 14)),
      rate: Math.round(entry.cancelPct * 1000) / 10,
      cancelled: entry.cancelled,
      name: view === 'store' ? entry.store : entry.productName,
    }));

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('cancelAnalysis')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('cancelAnalysis')}
        subtitle={t('cancelAnalysisSubtitle')}
        extra={
          <div className="analytics-segmented">
            <button onClick={() => setView('store')} className={view === 'store' ? 'is-active' : ''}>
              {t('viewPerStore')}
            </button>
            <button onClick={() => setView('product')} className={view === 'product' ? 'is-active' : ''}>
              {t('viewPerProduct')}
            </button>
          </div>
        }
      />

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : !data || !kpis ? (
        <SectionCard><EmptyState message={t('noDataForPeriod')} /></SectionCard>
      ) : (
        <>
          <div className="analytics-kpi-grid is-four">
            <KpiCard
              label={t('kpiCancelledTotal')}
              value={NUM(kpis.cancelCount)}
              sub={`${t('ofLabel')} ${NUM(kpis.totalOrders)} ${t('ordersLabel').toLowerCase()}`}
              color="rose"
              icon={<PackageX className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiCancelRate')}
              value={PCT(kpis.cancelPct)}
              color={kpis.cancelPct > 0.2 ? 'rose' : kpis.cancelPct > 0.1 ? 'amber' : 'emerald'}
              icon={<Percent className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiLostRevenue')}
              value={EUR(kpis.lostRevenue)}
              color="amber"
              icon={<TrendingDown className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiAvgCancelValue')}
              value={EUR(kpis.avgCancelValue)}
              color="purple"
              icon={<Receipt className="w-4 h-4 text-white" />}
            />
          </div>

          <SectionCard title={view === 'store' ? t('cancelRatePerStoreTitle') : t('cancelRatePerProductTitle')}>
            {chartData.length === 0 ? (
              <EmptyState message={t('noCancellations')} />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#94a3b8"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <YAxis type="category" dataKey="label" stroke="#94a3b8" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip
                    cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                    formatter={(value: number) => [`${value}%`, t('colCancelShort')]}
                    labelFormatter={(label: string) => {
                      const match = chartData.find((entry) => entry.label === label);
                      return match?.name || label;
                    }}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                  />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={rateColor(entry.rate / 100)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title={view === 'store' ? t('storeDetailTitle') : t('productDetailTitle')}>
            {view === 'store' ? (
              <DataTable columns={storeColumns} rows={storeRows} emptyMessage={t('noCancellations')} />
            ) : (
              <DataTable columns={productColumns} rows={productRows} emptyMessage={t('noCancellations')} />
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}