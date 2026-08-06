import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState,
  DataTable, StoreBadge, EUR, EUR_SHORT, PCT, NUM,
} from '../shared';

interface ChannelProfitabilityProps {
  activeProfile: string;
}

export function ChannelProfitability({ activeProfile }: ChannelProfitabilityProps) {
  const { t } = useLanguage();
  const { dateRange, selectedStores, selectedCountries } = useAnalytics();

  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getChannelProfitability({
        installationId: activeProfile,
        from: dateRange.from,
        to: dateRange.to,
        stores: selectedStores,
        countries: selectedCountries,
      });
      setChannels(result.channels || []);
    } catch (error) {
      console.error('Failed to load channel profitability:', error);
      toast.error(t('errorLoadingAnalytics'));
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, dateRange, selectedStores, selectedCountries]);

  useEffect(() => { load(); }, [load]);

  // De gestapelde balk toont hoe de omzet uiteenvalt in kosten en winst.
  const chartData = channels.map((entry) => ({
    channel: entry.channel,
    cogs: Math.round(entry.cogs),
    commission: Math.round(entry.commission),
    adSpend: Math.round(entry.adSpend),
    netProfit: Math.round(Math.max(0, entry.netProfit)),
  }));

  const marginClass = (value: number, thresholds: [number, number]) =>
    value < thresholds[0] ? 'is-loss' : value < thresholds[1] ? 'is-thin' : 'is-good';

  const columns = [
    { key: 'channel', header: t('colStore') },
    { key: 'revenue', header: t('revenue'), align: 'right' as const },
    { key: 'cogs', header: t('colPurchase'), align: 'right' as const, hideOnMobile: true },
    { key: 'commission', header: t('colPlatform'), align: 'right' as const, hideOnMobile: true },
    { key: 'adSpend', header: t('colAdsShort'), align: 'right' as const, hideOnMobile: true },
    { key: 'grossMargin', header: t('colGrossMargin'), align: 'right' as const, hideOnMobile: true },
    { key: 'netMargin', header: t('colNetMargin'), align: 'right' as const },
    { key: 'netProfit', header: t('colNetProfit'), align: 'right' as const },
    { key: 'orders', header: t('ordersLabel'), align: 'right' as const, hideOnMobile: true },
    { key: 'cancelPct', header: t('colCancelShort'), align: 'right' as const, hideOnMobile: true },
    { key: 'roas', header: 'ROAS', align: 'right' as const, hideOnMobile: true },
    { key: 'countries', header: t('colCountries'), align: 'right' as const, hideOnMobile: true },
  ];

  const rows = channels.map((entry) => ({
    channel: <StoreBadge store={entry.channel} />,
    revenue: <span className="analytics-num">{EUR(entry.revenue)}</span>,
    cogs: <span className="text-slate-500">{EUR(entry.cogs)}</span>,
    commission: <span className="text-slate-500">{EUR(entry.commission)}</span>,
    adSpend: <span className="text-slate-500">{EUR(entry.adSpend)}</span>,
    grossMargin: (
      <span className={`analytics-margin ${marginClass(entry.grossMarginPct, [0.1, 0.2])}`}>
        {PCT(entry.grossMarginPct)}
      </span>
    ),
    netMargin: (
      <span className={`analytics-margin ${marginClass(entry.netMarginPct, [0, 0.05])}`}>
        {PCT(entry.netMarginPct)}
      </span>
    ),
    netProfit: (
      <span className={entry.netProfit < 0 ? 'analytics-num text-red-600' : 'analytics-num'}>
        {EUR(entry.netProfit)}
      </span>
    ),
    orders: <span className="analytics-num">{NUM(entry.activeOrders)}</span>,
    cancelPct: entry.cancelPct > 0.25
      ? <span className="analytics-pill-warn">{PCT(entry.cancelPct)}</span>
      : <span className="text-slate-400">{PCT(entry.cancelPct)}</span>,
    roas: <span className="text-slate-400">{entry.roas != null ? `${entry.roas.toFixed(1)}x` : '–'}</span>,
    countries: <span className="text-slate-500">{entry.countryCount}</span>,
  }));

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('channelProfitability')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('channelProfitability')}
        subtitle={t('channelProfitabilitySubtitle')}
      />

      {loading && channels.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <SectionCard title={t('revenueVsCostsTitle')}>
            {chartData.length === 0 ? (
              <EmptyState message={t('noDataForPeriod')} />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="channel" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={EUR_SHORT} width={50} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                    formatter={(value: number) => EUR(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="cogs" stackId="a" name={t('costCogs')} fill="#c7d2fe" isAnimationActive={false} />
                  <Bar dataKey="commission" stackId="a" name={t('colPlatform')} fill="#fde68a" isAnimationActive={false} />
                  <Bar dataKey="adSpend" stackId="a" name={t('costAdSpend')} fill="#f9a8d4" isAnimationActive={false} />
                  <Bar dataKey="netProfit" stackId="a" name={t('kpiNetProfit')} fill="#6ee7b7" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title={t('channelDetailTitle')}>
            <DataTable columns={columns} rows={rows} emptyMessage={t('noDataForPeriod')} />
          </SectionCard>
        </>
      )}
    </div>
  );
}