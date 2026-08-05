import { useState, useEffect, useCallback } from 'react';
import { Euro, Receipt, TrendingUp, ShoppingBag, Percent, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState, KpiCard,
  DataTable, StoreBadge, EUR, PCT, NUM,
} from '../shared';

interface DailySummaryProps {
  activeProfile: string;
}

export function DailySummary({ activeProfile }: DailySummaryProps) {
  const { t, language } = useLanguage();
  const { selectedStores, selectedCountries } = useAnalytics();

  const [months, setMonths] = useState<{ month: string; days: string[] }[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const locale = language === 'nl' ? 'nl-NL' : language === 'de' ? 'de-DE' : 'en-GB';

  const monthLabel = (month: string) => {
    const [year, monthNumber] = month.split('-');
    return new Date(Number(year), Number(monthNumber) - 1, 1)
      .toLocaleString(locale, { month: 'long', year: 'numeric' });
  };

  const dayLabel = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleString(locale, {
      weekday: 'short', day: 'numeric', month: 'short',
    });

  // Eerst de beschikbare maanden ophalen; de dagenlijst volgt uit de keuze.
  useEffect(() => {
    if (!activeProfile) return;
    let active = true;
    api.getDailySummaryPeriods(activeProfile)
      .then((result) => {
        if (!active) return;
        const list = result.months || [];
        setMonths(list);
        if (list.length > 0) {
          setSelectedMonth(list[0].month);
          setSelectedDay(list[0].days[0]);
        }
      })
      .catch(() => { if (active) setMonths([]); });
    return () => { active = false; };
  }, [activeProfile]);

  const daysInMonth = months.find((entry) => entry.month === selectedMonth)?.days || [];

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    const days = months.find((entry) => entry.month === month)?.days || [];
    setSelectedDay(days[0] || '');
  };

  const load = useCallback(async () => {
    if (!activeProfile || !selectedDay) return;
    try {
      setLoading(true);
      const result = await api.getDailySummary({
        installationId: activeProfile,
        day: selectedDay,
        stores: selectedStores,
        countries: selectedCountries,
      });
      setData(result);
    } catch (error) {
      console.error('Failed to load daily summary:', error);
      toast.error(t('errorLoadingAnalytics'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, selectedDay, selectedStores, selectedCountries]);

  useEffect(() => { load(); }, [load]);

  const totals = data?.totals;
  const orders: any[] = data?.orders || [];
  const byStore: any[] = data?.byStore || [];

  const purchaseBadge = (status: string) => {
    const map: Record<string, { className: string; label: string }> = {
      stock: { className: 'is-open', label: t('purchaseStock') },
      ordered: { className: 'is-hit', label: t('purchaseOrdered') },
      partial: { className: 'is-near', label: t('purchasePartial') },
      not_ordered: { className: 'is-miss', label: t('purchaseNotOrdered') },
    };
    const entry = map[status] || map.stock;
    return <span className={`analytics-status ${entry.className}`}>{entry.label}</span>;
  };

  const orderColumns = [
    { key: 'orderNumber', header: t('orderNumber') },
    { key: 'customer', header: t('customerName'), hideOnMobile: true },
    { key: 'store', header: t('colStore'), hideOnMobile: true },
    { key: 'country', header: t('colCountry'), align: 'center' as const, hideOnMobile: true },
    { key: 'type', header: t('colOrderType'), align: 'center' as const },
    { key: 'purchased', header: t('colPurchased'), align: 'center' as const, hideOnMobile: true },
    { key: 'items', header: t('colUnits'), align: 'right' as const, hideOnMobile: true },
    { key: 'revenue', header: t('revenue'), align: 'right' as const },
    { key: 'grossProfit', header: t('colGrossProfit'), align: 'right' as const },
    { key: 'netProfit', header: t('colNetProfit'), align: 'right' as const, hideOnMobile: true },
    { key: 'marginPct', header: t('colMarginPct'), align: 'right' as const, hideOnMobile: true },
  ];

  const orderRows = orders.map((order) => ({
    orderNumber: (
      <span className={order.cancelled ? 'analytics-mono line-through' : 'analytics-mono'}>
        {order.orderNumber}
      </span>
    ),
    customer: <span className="text-slate-600">{order.customerName || '-'}</span>,
    store: order.storeName ? <StoreBadge store={order.storeName} /> : '-',
    country: <span className="analytics-mono">{order.country || '-'}</span>,
    type: (
      <span className={`analytics-type ${order.orderType === 'DS' ? 'is-ds' : 'is-ffm'}`}>
        {order.orderType}
      </span>
    ),
    purchased: purchaseBadge(order.purchaseStatus),
    items: <span className="text-slate-500">{NUM(order.items)}</span>,
    revenue: <span className="analytics-num">{EUR(order.revenue)}</span>,
    grossProfit: (
      <span className={order.grossProfit < 0 ? 'analytics-num text-rose-600' : 'analytics-num'}>
        {EUR(order.grossProfit)}
      </span>
    ),
    netProfit: (
      <span className={order.netProfit < 0 ? 'analytics-num text-rose-600' : 'analytics-num'}>
        {EUR(order.netProfit)}
      </span>
    ),
    marginPct: (
      <span className={`analytics-margin ${
        order.marginPct < 0 ? 'is-loss' : order.marginPct < 0.08 ? 'is-thin' : 'is-good'
      }`}>
        {PCT(order.marginPct)}
      </span>
    ),
  }));

  const storeColumns = [
    { key: 'store', header: t('colStore') },
    { key: 'revenue', header: t('revenue'), align: 'right' as const },
    { key: 'orders', header: t('ordersLabel'), align: 'right' as const },
  ];

  const storeRows = byStore.map((entry) => ({
    store: <StoreBadge store={entry.store} />,
    revenue: <span className="analytics-num">{EUR(entry.revenue)}</span>,
    orders: <span className="analytics-num">{NUM(entry.orders)}</span>,
  }));

  /*
   * Btw staat bewust niet in de kostenlijst: de omzet is al exclusief btw, dus
   * hij drukt de winst niet. Hij wordt er los onder getoond als geïnd bedrag.
   */
  const costRows = totals ? [
    { label: t('costCogs'), value: totals.cogs, color: '#6366f1' },
    { label: t('costShipping'), value: totals.shippingCosts, color: '#0ea5e9' },
    { label: t('costCommission'), value: totals.commission, color: '#f59e0b' },
    { label: t('costAdSpend'), value: totals.adSpend || 0, color: '#a855f7' },
    { label: t('costFixed'), value: totals.fixedCosts || 0, color: '#f43f5e' },
  ] : [];

  const totalCosts = costRows.reduce((sum, entry) => sum + entry.value, 0);
  const costBarSegments = [
    ...costRows,
    { label: t('kpiNetProfit'), value: Math.max(0, totals?.netProfit || 0), color: '#10b981' },
  ];
  const barTotal = costBarSegments.reduce((sum, entry) => sum + entry.value, 0) || 1;

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('dailySummary')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('dailySummary')}
        subtitle={t('dailySummarySubtitle')}
        showFilters={false}
        extra={
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="analytics-select"
              value={selectedMonth}
              onChange={(event) => handleMonthChange(event.target.value)}
            >
              {months.map((entry) => (
                <option key={entry.month} value={entry.month}>{monthLabel(entry.month)}</option>
              ))}
            </select>
            <select
              className="analytics-select"
              value={selectedDay}
              onChange={(event) => setSelectedDay(event.target.value)}
            >
              {daysInMonth.map((day) => (
                <option key={day} value={day}>{dayLabel(day)}</option>
              ))}
            </select>
          </div>
        }
      />

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : !data || !totals ? (
        <SectionCard><EmptyState message={t('noOrdersThisDay')} /></SectionCard>
      ) : (
        <>
          <div className="analytics-kpi-grid">
            <KpiCard
              label={t('kpiNetRevenue')}
              value={EUR(totals.revenue)}
              sub={`${NUM(totals.itemCount)} ${t('unitsShort')}`}
              color="indigo"
              icon={<Euro className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('colGrossProfit')}
              value={EUR(totals.grossProfit)}
              color="purple"
              icon={<TrendingUp className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiNetProfit')}
              value={EUR(totals.netProfit)}
              sub={`${PCT(totals.netMarginPct)} ${t('margin').toLowerCase()}`}
              color="emerald"
              icon={<Percent className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiActiveOrders')}
              value={NUM(totals.orderCount - totals.cancelCount)}
              sub={totals.cancelCount > 0 ? `${NUM(totals.cancelCount)} ${t('cancelledLabel')}` : undefined}
              color="sky"
              icon={<ShoppingBag className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiAvgOrderValue')}
              value={EUR(totals.avgOrderValue)}
              color="amber"
              icon={<Receipt className="w-4 h-4 text-white" />}
            />
          </div>

          <div className="analytics-split-grid">
            <SectionCard title={t('costBreakdownTitle')}>
              <div className="analytics-costbar">
                {costBarSegments.map((item) => (
                  item.value > 0 && (
                    <span
                      key={item.label}
                      title={`${item.label} — ${EUR(item.value)}`}
                      style={{ width: `${(item.value / barTotal) * 100}%`, backgroundColor: item.color }}
                    />
                  )
                ))}
              </div>

              <div className="mt-4">
                {costBarSegments.map((item) => (
                  <div key={item.label} className="analytics-costrow">
                    <span className="analytics-cost-dot" style={{ backgroundColor: item.color, marginTop: 0 }} />
                    <span className="analytics-costrow-label">{item.label}</span>
                    <span className="analytics-costrow-share">
                      {totals.revenue > 0 ? PCT(item.value / totals.revenue, 0) : '–'}
                    </span>
                    <span className="analytics-costrow-value">{EUR(item.value)}</span>
                  </div>
                ))}
              </div>

              <div className="analytics-costtotal">
                <span className="text-slate-600">{t('totalCosts')}</span>
                <span className="analytics-costtotal-value text-slate-900">{EUR(totalCosts)}</span>
              </div>

              <div className="analytics-vatnote">
                <span>{t('vatCollected')}</span>
                <span className="analytics-num">{EUR(totals.vat)}</span>
              </div>
            </SectionCard>

            <SectionCard title={t('revenuePerStoreTitle')}>
              <DataTable columns={storeColumns} rows={storeRows} emptyMessage={t('noDataForPeriod')} />
            </SectionCard>
          </div>

          <SectionCard title={`${t('ordersOfDay')} (${orders.length})`}>
            <DataTable columns={orderColumns} rows={orderRows} emptyMessage={t('noOrdersThisDay')} />
          </SectionCard>
        </>
      )}
    </div>
  );
}