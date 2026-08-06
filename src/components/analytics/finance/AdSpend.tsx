import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { Megaphone, Target, Percent, Copy, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState, KpiCard,
  DataTable, StoreBadge, EUR, EUR_SHORT, PCT, NUM, shortDate,
} from '../shared';

interface AdSpendProps {
  activeProfile: string;
}

type Mode = 'overview' | 'entry';

const BAR_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#0ea5e9', '#f59e0b', '#10b981', '#f43f5e'];

export function AdSpend({ activeProfile }: AdSpendProps) {
  const { t, language } = useLanguage();
  const { dateRange, selectedStores, selectedCountries, availableStores } = useAnalytics();

  const [mode, setMode] = useState<Mode>('overview');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const locale = language === 'nl' ? 'nl-NL' : language === 'de' ? 'de-DE' : 'en-GB';

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getAdSpendAnalytics({
        installationId: activeProfile,
        from: dateRange.from,
        to: dateRange.to,
        stores: selectedStores,
        countries: selectedCountries,
      });
      setData(result);
    } catch (error) {
      console.error('Failed to load ad spend:', error);
      toast.error(t('errorLoadingAnalytics'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, dateRange, selectedStores, selectedCountries]);

  useEffect(() => { if (mode === 'overview') load(); }, [load, mode]);

  const totals = data?.totals;
  const channels: any[] = data?.channels || [];
  const daily = (data?.daily || []).map((entry: any) => ({ ...entry, label: shortDate(entry.date) }));

  const columns = [
    { key: 'channel', header: t('colChannel'), width: '12rem' },
    { key: 'spend', header: t('colSpend'), align: 'right' as const, width: '9rem' },
    { key: 'share', header: t('colShare'), align: 'right' as const, width: '7rem', hideOnMobile: true },
    { key: 'revenue', header: t('revenue'), align: 'right' as const, width: '10rem', hideOnMobile: true },
    { key: 'calculatedRoas', header: t('colRoasCalculated'), align: 'right' as const, width: '9rem' },
    { key: 'reportedRoas', header: t('colRoasReported'), align: 'right' as const, width: '9rem', hideOnMobile: true },
    { key: 'adRatio', header: t('colAdRatio'), align: 'right' as const, hideOnMobile: true },
  ];

  const roasClass = (value: number | null) => {
    if (value == null) return 'is-thin';
    return value >= 4 ? 'is-good' : value >= 2 ? 'is-thin' : 'is-loss';
  };

  const rows = channels.map((entry) => ({
    channel: <StoreBadge store={entry.storeName} />,
    spend: <span className="analytics-num">{EUR(entry.spend)}</span>,
    share: <span className="text-slate-400">{PCT(entry.share, 0)}</span>,
    revenue: <span className="text-slate-500">{EUR(entry.revenue)}</span>,
    calculatedRoas: entry.calculatedRoas != null
      ? <span className={`analytics-margin ${roasClass(entry.calculatedRoas)}`}>{entry.calculatedRoas.toFixed(2)}x</span>
      : <span className="text-slate-300">–</span>,
    reportedRoas: entry.reportedRoas != null
      ? <span className="text-slate-600">{entry.reportedRoas.toFixed(2)}x</span>
      : <span className="text-slate-300">–</span>,
    adRatio: entry.adRatio != null
      ? <span className={entry.adRatio > 0.1 ? 'text-rose-600' : 'text-slate-500'}>{PCT(entry.adRatio)}</span>
      : <span className="text-slate-300">–</span>,
  }));

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('adSpend')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('adSpend')}
        subtitle={t('adSpendSubtitle')}
        showFilters={mode === 'overview'}
        hideCountryFilter
        extra={
          <div className="analytics-segmented">
            <button
              onClick={() => setMode('overview')}
              className={mode === 'overview' ? 'is-active' : ''}
            >
              {t('modeOverview')}
            </button>
            <button
              onClick={() => setMode('entry')}
              className={mode === 'entry' ? 'is-active' : ''}
            >
              {t('modeEntry')}
            </button>
          </div>
        }
      />

      {mode === 'entry' ? (
        <AdSpendEntry activeProfile={activeProfile} stores={availableStores} locale={locale} />
      ) : loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : !data || !totals ? (
        <SectionCard><EmptyState message={t('noAdSpendYet')} /></SectionCard>
      ) : (
        <>
          <div className="analytics-kpi-grid is-four">
            <KpiCard
              label={t('kpiTotalAdSpend')}
              value={EUR(totals.spend)}
              sub={`${NUM(totals.entryCount)} ${t('entriesLabel')}`}
              color="purple"
              icon={<Megaphone className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiRoasCalculated')}
              value={totals.calculatedRoas != null ? `${totals.calculatedRoas.toFixed(2)}x` : '–'}
              sub={t('basedOnOwnRevenue')}
              color="indigo"
              icon={<Target className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiRoasReported')}
              value={totals.reportedRoas != null ? `${totals.reportedRoas.toFixed(2)}x` : '–'}
              sub={t('asReportedByPlatform')}
              color="sky"
              icon={<Target className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiAdRatio')}
              value={PCT(totals.adRatio)}
              sub={t('ofRevenue')}
              color={totals.adRatio > 0.1 ? 'rose' : 'emerald'}
              icon={<Percent className="w-4 h-4 text-white" />}
            />
          </div>

          <SectionCard title={t('adSpendVsRevenueTitle')}>
            {daily.length === 0 ? (
              <EmptyState message={t('noAdSpendYet')} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={daily} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="adspend-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="adrevenue-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={EUR_SHORT} width={50} />
                  <Tooltip
                    formatter={(value: number) => EUR(value)}
                    cursor={{ stroke: '#cbd5e1' }}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" name={t('revenue')} stroke="#6366f1" fill="url(#adrevenue-grad)" strokeWidth={2} isAnimationActive={false} />
                  <Area type="monotone" dataKey="spend" name={t('colSpend')} stroke="#a855f7" fill="url(#adspend-grad)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <div className="analytics-split-grid">
            <SectionCard title={t('spendPerChannelTitle')}>
              {channels.length === 0 ? (
                <EmptyState message={t('noAdSpendYet')} />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={channels} layout="vertical" margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={EUR_SHORT} />
                    <YAxis type="category" dataKey="storeName" stroke="#94a3b8" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip
                      formatter={(value: number) => [EUR(value), t('colSpend')]}
                      cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                    />
                    <Bar dataKey="spend" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                      {channels.map((_, index) => (
                        <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            <SectionCard title={t('roasPerChannelTitle')}>
              <DataTable
                columns={columns.slice(0, 2).concat(columns.slice(4, 6))}
                rows={rows}
                emptyMessage={t('noAdSpendYet')}
              />
            </SectionCard>
          </div>

          <SectionCard title={t('channelDetailTitle')}>
            <DataTable columns={columns} rows={rows} emptyMessage={t('noAdSpendYet')} />
          </SectionCard>
        </>
      )}
    </div>
  );
}

/**
 * Invoerscherm: kies maand en channel, vul per dag bedrag en ROAS in.
 * Alles van één maand wordt in één keer opgeslagen.
 */
function AdSpendEntry({
  activeProfile,
  stores,
  locale,
}: {
  activeProfile: string;
  stores: string[];
  locale: string;
}) {
  const { t } = useLanguage();
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [storeName, setStoreName] = useState('');
  const [days, setDays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!storeName && stores.length > 0) setStoreName(stores[0]);
  }, [stores]);

  const load = useCallback(async () => {
    if (!activeProfile || !storeName) return;
    try {
      setLoading(true);
      const result = await api.getAdSpendMonth({
        installationId: activeProfile, year, month, storeName,
      });
      setDays((result.days || []).map((entry) => ({
        date: entry.date,
        amount: entry.amount ? String(entry.amount) : '',
        reportedRoas: entry.reportedRoas != null ? String(entry.reportedRoas) : '',
      })));
      setDirty(false);
    } catch (error) {
      console.error('Failed to load ad spend month:', error);
      toast.error(t('errorLoadingAdSpend'));
    } finally {
      setLoading(false);
    }
  }, [activeProfile, year, month, storeName]);

  useEffect(() => { load(); }, [load]);

  const update = (index: number, field: 'amount' | 'reportedRoas', value: string) => {
    setDays((previous) => previous.map((entry, position) =>
      position === index ? { ...entry, [field]: value } : entry,
    ));
    setDirty(true);
  };

  // Handig bij een vast dagbudget: de eerste ingevulde dag over de rest kopiëren.
  const spreadFirst = () => {
    const first = days.find((entry) => parseFloat(String(entry.amount).replace(',', '.')) > 0);
    if (!first) {
      toast.error(t('fillFirstDayFirst'));
      return;
    }
    setDays((previous) => previous.map((entry) => ({
      ...entry,
      amount: first.amount,
      reportedRoas: first.reportedRoas,
    })));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.saveAdSpendMonth({
        installationId: parseInt(activeProfile, 10),
        storeName,
        days: days.map((entry) => ({
          date: entry.date,
          amount: parseFloat(String(entry.amount).replace(',', '.')) || 0,
          reportedRoas: parseFloat(String(entry.reportedRoas).replace(',', '.')) || null,
        })),
      });
      toast.success(t('adSpendSaved'));
      await load();
    } catch (error: any) {
      console.error('Failed to save ad spend:', error);
      toast.error(error?.message || t('errorSavingAdSpend'));
    } finally {
      setSaving(false);
    }
  };

  const total = days.reduce(
    (sum, entry) => sum + (parseFloat(String(entry.amount).replace(',', '.')) || 0), 0,
  );

  const monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);
  const yearOptions = Array.from({ length: 4 }, (_, index) => now.getFullYear() - index);

  const dayLabel = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });

  if (stores.length === 0) {
    return <SectionCard><EmptyState message={t('noChannelsAvailable')} /></SectionCard>;
  }

  return (
    <SectionCard
      title={t('enterAdSpendTitle')}
      action={
        <Button
          onClick={handleSave}
          disabled={saving || loading || !dirty}
          className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <select className="analytics-select" value={storeName} onChange={(event) => setStoreName(event.target.value)}>
            {stores.map((store) => (
              <option key={store} value={store}>{store}</option>
            ))}
          </select>
          <select className="analytics-select" value={month} onChange={(event) => setMonth(parseInt(event.target.value, 10))}>
            {monthOptions.map((option) => (
              <option key={option} value={option}>
                {new Date(2000, option - 1, 1).toLocaleString(locale, { month: 'long' })}
              </option>
            ))}
          </select>
          <select className="analytics-select" value={year} onChange={(event) => setYear(parseInt(event.target.value, 10))}>
            {yearOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <button
            onClick={spreadFirst}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {t('spreadFirstDay')}
          </button>

          <span className="text-sm text-slate-500 ml-auto">
            {t('monthTotal')}: <span className="analytics-num">{EUR(total)}</span>
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="analytics-adspend-grid">
            {days.map((entry, index) => (
              <div key={entry.date} className="analytics-adspend-day">
                <span className="analytics-adspend-label">{dayLabel(entry.date)}</span>
                <div className="analytics-adspend-fields">
                  <div className="analytics-target-input">
                    <span>€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      value={entry.amount}
                      onChange={(event) => update(index, 'amount', event.target.value)}
                    />
                  </div>
                  <div className="analytics-target-input">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={t('roasShort')}
                      value={entry.reportedRoas}
                      onChange={(event) => update(index, 'reportedRoas', event.target.value)}
                    />
                    <span>x</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {dirty && <p className="text-xs text-amber-600">{t('unsavedChanges')}</p>}
      </div>
    </SectionCard>
  );
}