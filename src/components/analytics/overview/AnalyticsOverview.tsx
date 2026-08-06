import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { ShoppingBag, TrendingUp, XCircle, Euro, Package, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState, KpiCard,
  DataTable, StoreBadge, EUR, EUR_SHORT, PCT, NUM, shortDate,
} from '../shared';

interface AnalyticsOverviewProps {
  activeProfile: string;
}

const BAR_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#10b981', '#0ea5e9', '#f43f5e', '#14b8a6'];

export function AnalyticsOverview({ activeProfile }: AnalyticsOverviewProps) {
  const { t } = useLanguage();
  const { dateRange, selectedStores, selectedCountries } = useAnalytics();

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getAnalyticsOverview({
        installationId: activeProfile,
        from: dateRange.from,
        to: dateRange.to,
        stores: selectedStores,
        countries: selectedCountries,
      });
      setData(result);
    } catch (error) {
      console.error('Failed to load analytics overview:', error);
      toast.error(t('errorLoadingAnalytics'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, dateRange, selectedStores, selectedCountries]);

  useEffect(() => { load(); }, [load]);

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-xl sm:text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('analyticsOverview')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  const kpi = data?.kpi;
  const trends = data?.trends || {};
  const costs = data?.costs || {};
  const daily = (data?.daily || []).map((entry: any) => ({ ...entry, label: shortDate(entry.date) }));
  const byStore = data?.byStore || [];
  const topProducts = data?.topProducts || [];
  const netRevenue = kpi?.netRevenue || 0;

  const costRows = [
    { label: t('costCogs'), value: costs.cogs || 0, color: '#6366f1' },
    { label: t('costShipping'), value: costs.shippingCosts || 0, color: '#0ea5e9' },
    { label: t('costCommission'), value: costs.commission || 0, color: '#f59e0b' },
    { label: t('costAdSpend'), value: costs.adSpend || 0, color: '#a855f7' },
    { label: t('costFixed'), value: costs.fixedCosts || 0, color: '#f43f5e' },
  ];

  const storeColumns = [
    { key: 'store', header: t('colStore') },
    { key: 'revenue', header: t('revenue'), align: 'right' as const },
    { key: 'orders', header: t('ordersLabel'), align: 'right' as const },
    { key: 'cancel', header: t('kpiCancelRate'), align: 'right' as const, hideOnMobile: true },
  ];

  const storeRows = byStore.map((row: any) => ({
    store: <StoreBadge store={row.store} />,
    revenue: <span className="analytics-num">{EUR(row.revenue)}</span>,
    orders: <span className="analytics-num">{NUM(row.orders)}</span>,
    cancel: row.cancelPct > 0.2
      ? <span className="analytics-pill-warn">{PCT(row.cancelPct)}</span>
      : <span className="text-slate-400">{PCT(row.cancelPct)}</span>,
  }));

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('analyticsOverview')}
        subtitle={t('analyticsOverviewSubtitle')}
      />

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : !data ? (
        <SectionCard><EmptyState message={t('noDataForPeriod')} /></SectionCard>
      ) : (
        <>
         <div className="analytics-kpi-grid">
            <KpiCard
              label={t('kpiNetRevenue')}
              value={EUR(kpi.netRevenue)}
              trend={trends.netRevenue}
              trendLabel={t('vsPreviousPeriod')}
              color="indigo"
              icon={<Euro className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiNetProfit')}
              value={EUR(kpi.netProfit)}
              sub={`${PCT(kpi.netMarginPct)} ${t('margin').toLowerCase()}`}
              color="emerald"
              icon={<TrendingUp className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiActiveOrders')}
              value={NUM(kpi.activeOrders)}
              trend={trends.activeOrders}
              trendLabel={t('vsPreviousPeriod')}
              color="purple"
              icon={<ShoppingBag className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiCancelRate')}
              value={PCT(kpi.cancelPct)}
              sub={data.statusesAvailable?.cancelled ? undefined : t('statusNotTrackedYet')}
              trend={data.statusesAvailable?.cancelled ? trends.cancelPct : null}
              invertTrendColor
              color="amber"
              icon={<XCircle className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiAvgOrderValue')}
              value={EUR(kpi.avgOrderValue)}
              trend={trends.avgOrderValue}
              trendLabel={t('vsPreviousPeriod')}
              color="sky"
              icon={<Package className="w-4 h-4 text-white" />}
            />
          </div>

          <div className="analytics-charts-grid">
            <div className="min-w-0">
              <SectionCard title={t('dailyRevenueTitle')}>
                {daily.length === 0 ? (
                  <EmptyState message={t('noDataForPeriod')} />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={daily} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="ao-revenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={EUR_SHORT} width={50} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                        formatter={(value: number) => [EUR(value), t('revenue')]}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#ao-revenue)" strokeWidth={2} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </SectionCard>
            </div>

            <div className="min-w-0">
              <SectionCard title={t('revenuePerStoreTitle')}>
                {byStore.length === 0 ? (
                  <EmptyState message={t('noDataForPeriod')} />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={byStore} layout="vertical" margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={EUR_SHORT} />
                      <YAxis type="category" dataKey="store" stroke="#94a3b8" tick={{ fontSize: 11 }} width={78} />
                      <Tooltip
                        formatter={(value: number) => [EUR(value), t('revenue')]}
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                      />
                      <Bar dataKey="revenue" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                        {byStore.map((_: any, index: number) => (
                          <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </SectionCard>
            </div>
          </div>

          <div className="analytics-split-grid">
            <SectionCard title={t('storeBreakdownTitle')}>
              <DataTable columns={storeColumns} rows={storeRows} emptyMessage={t('noDataForPeriod')} />
            </SectionCard>

            <SectionCard title={t('topProductsTitle')}>
              {topProducts.length === 0 ? (
                <EmptyState message={t('noDataForPeriod')} />
              ) : (
                <div className="space-y-2.5">
                  {topProducts.map((product: any, index: number) => {
                    const max = topProducts[0].revenue || 1;
                    return (
                      <div key={product.key} className="flex items-center gap-3">
                        <span className="analytics-rank">{index + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-700 truncate">{product.productName}</div>
                          <div className="analytics-bar-track">
                            <div
                              className="analytics-bar-fill"
                              style={{ width: `${(product.revenue / max) * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="analytics-cost-value" style={{ fontSize: '.8125rem' }}>{EUR(product.revenue)}</div>
                          <div className="text-xs text-slate-400">{product.units} {t('unitsShort')}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title={t('costBreakdownTitle')}>
            <div className="analytics-cost-grid">
              {costRows.map((item) => (
                <div key={item.label} className="analytics-cost">
                  <span className="analytics-cost-dot" style={{ backgroundColor: item.color }} />
                  <div className="min-w-0">
                    <div className="analytics-cost-label">{item.label}</div>
                    <div className="analytics-cost-value">{EUR(item.value)}</div>
                    <div className="analytics-cost-share">
                      {netRevenue > 0 ? PCT(item.value / netRevenue) : '–'} {t('ofRevenue')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}