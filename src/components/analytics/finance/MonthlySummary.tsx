import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Euro, TrendingUp, Percent, ShoppingBag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState, KpiCard,
  DataTable, EUR, EUR_SHORT, PCT, NUM,
} from '../shared';

interface MonthlySummaryProps {
  activeProfile: string;
}

// Dropsyncr-palet: indigo voor omzet, paars voor winst.
const REVENUE_FILL = '#6366f1';
const PROFIT_FILL = '#a855f7';

export function MonthlySummary({ activeProfile }: MonthlySummaryProps) {
  const { t, language } = useLanguage();
  const { selectedStores, selectedCountries } = useAnalytics();

  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const locale = language === 'nl' ? 'nl-NL' : language === 'de' ? 'de-DE' : 'en-GB';

  const monthLabel = (month: number, long = false) =>
    new Date(2000, month - 1, 1).toLocaleString(locale, { month: long ? 'long' : 'short' });

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getMonthlySummary({
        installationId: activeProfile,
        year,
        stores: selectedStores,
        countries: selectedCountries,
      });
      setData(result);
    } catch (error) {
      console.error('Failed to load monthly summary:', error);
      toast.error(t('errorLoadingAnalytics'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, year, selectedStores, selectedCountries]);

  useEffect(() => { load(); }, [load]);

  const months: any[] = data?.months || [];
  const totals = data?.totals;
  const availableYears: number[] = data?.availableYears?.length
    ? data.availableYears
    : [new Date().getFullYear()];

  // Maanden zonder omzet weglaten uit de grafieken, anders krijg je een
  // halflege as voor de maanden die nog moeten komen.
  const activeMonths = months.filter((entry) => entry.orderCount > 0);

  const chartData = activeMonths.map((entry) => ({
    label: monthLabel(entry.month),
    revenue: Math.round(entry.revenue),
    profit: Math.round(entry.netProfit),
    marginPct: Math.round(entry.netMarginPct * 1000) / 10,
  }));

  const marginClass = (value: number) =>
    value < 0 ? 'is-loss' : value < 0.08 ? 'is-thin' : 'is-good';

  const columns = [
    { key: 'month', header: t('colMonth') },
    { key: 'revenue', header: t('revenue'), align: 'right' as const },
    { key: 'cogs', header: t('colPurchase'), align: 'right' as const, hideOnMobile: true },
    { key: 'shipping', header: t('costShipping'), align: 'right' as const, hideOnMobile: true },
    { key: 'commission', header: t('colPlatform'), align: 'right' as const, hideOnMobile: true },
    { key: 'adSpend', header: t('colAdsShort'), align: 'right' as const, hideOnMobile: true },
    { key: 'fixedCosts', header: t('costFixed'), align: 'right' as const, hideOnMobile: true },
    { key: 'netProfit', header: t('colNetProfit'), align: 'right' as const },
    { key: 'marginPct', header: t('colMarginPct'), align: 'right' as const },
    { key: 'orders', header: t('ordersLabel'), align: 'right' as const, hideOnMobile: true },
    { key: 'cancelPct', header: t('colCancelShort'), align: 'right' as const, hideOnMobile: true },
  ];

  const rows = months.map((entry) => ({
    month: <span className="text-slate-700">{monthLabel(entry.month, true)}</span>,
    revenue: <span className="analytics-num">{EUR(entry.revenue)}</span>,
    cogs: <span className="text-slate-500">{EUR(entry.cogs)}</span>,
    shipping: <span className="text-slate-500">{EUR(entry.shippingCosts)}</span>,
    commission: <span className="text-slate-500">{EUR(entry.commission)}</span>,
    adSpend: <span className="text-slate-400">{EUR(entry.adSpend)}</span>,
    fixedCosts: <span className="text-slate-400">{EUR(entry.fixedCosts)}</span>,
    netProfit: (
      <span className={entry.netProfit < 0 ? 'analytics-num text-rose-600' : 'analytics-num'}>
        {EUR(entry.netProfit)}
      </span>
    ),
    marginPct: entry.revenue > 0
      ? <span className={`analytics-margin ${marginClass(entry.netMarginPct)}`}>{PCT(entry.netMarginPct)}</span>
      : <span className="text-slate-300">–</span>,
    orders: <span className="text-slate-600">{NUM(entry.activeOrders)}</span>,
    cancelPct: <span className="text-slate-400">{PCT(entry.cancelPct)}</span>,
  }));

  // Totaalregel onderaan, visueel afgezet tegen de maanden.
  if (totals) {
    rows.push({
      month: <span className="analytics-total-cell">{t('totalLabel')} {year}</span>,
      revenue: <span className="analytics-total-cell">{EUR(totals.revenue)}</span>,
      cogs: <span className="analytics-total-cell">{EUR(totals.cogs)}</span>,
      shipping: <span className="analytics-total-cell">{EUR(totals.shippingCosts)}</span>,
      commission: <span className="analytics-total-cell">{EUR(totals.commission)}</span>,
      adSpend: <span className="analytics-total-cell">{EUR(totals.adSpend)}</span>,
      fixedCosts: <span className="analytics-total-cell">{EUR(totals.fixedCosts)}</span>,
      netProfit: (
        <span className={`analytics-total-cell ${totals.netProfit < 0 ? 'text-rose-600' : ''}`}>
          {EUR(totals.netProfit)}
        </span>
      ),
      marginPct: <span className={`analytics-margin ${marginClass(totals.netMarginPct)}`}>{PCT(totals.netMarginPct)}</span>,
      orders: <span className="analytics-total-cell">{NUM(totals.activeOrders)}</span>,
      cancelPct: <span className="analytics-total-cell">–</span>,
    } as any);
  }

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('monthlySummary')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('monthlySummary')}
        subtitle={t('monthlySummarySubtitle')}
        showFilters={false}
        extra={
          <select
            className="analytics-select"
            value={year}
            onChange={(event) => setYear(parseInt(event.target.value, 10))}
          >
            {availableYears.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        }
      />

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : !data || !totals ? (
        <SectionCard><EmptyState message={t('noDataForPeriod')} /></SectionCard>
      ) : (
        <>
          <div className="analytics-kpi-grid">
            <KpiCard
              label={`${t('kpiNetRevenue')} ${year}`}
              value={EUR(totals.revenue)}
              color="indigo"
              icon={<Euro className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={`${t('kpiNetProfit')} ${year}`}
              value={EUR(totals.netProfit)}
              color="purple"
              icon={<TrendingUp className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('colMarginPct')}
              value={PCT(totals.netMarginPct)}
              color="emerald"
              icon={<Percent className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('colPurchase')}
              value={EUR(totals.cogs)}
              color="sky"
              icon={<Euro className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiActiveOrders')}
              value={NUM(totals.activeOrders)}
              sub={totals.cancelCount > 0 ? `${NUM(totals.cancelCount)} ${t('cancelledLabel')}` : undefined}
              color="amber"
              icon={<ShoppingBag className="w-4 h-4 text-white" />}
            />
          </div>

          <SectionCard title={t('revenueAndProfitTitle')}>
            {chartData.length === 0 ? (
              <EmptyState message={t('noDataForPeriod')} />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={EUR_SHORT} width={50} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                    formatter={(value: number) => EUR(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name={t('revenue')} fill={REVENUE_FILL} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="profit" name={t('colNetProfit')} fill={PROFIT_FILL} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title={t('marginTrendTitle')}>
            {chartData.length === 0 ? (
              <EmptyState message={t('noDataForPeriod')} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${value}%`}
                    width={45}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, t('colMarginPct')]}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="marginPct"
                    stroke={REVENUE_FILL}
                    strokeWidth={2}
                    dot={{ r: 3, fill: REVENUE_FILL }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title={t('monthlyPnlTitle')}>
            <DataTable columns={columns} rows={rows} emptyMessage={t('noDataForPeriod')} />
          </SectionCard>
        </>
      )}
    </div>
  );
}