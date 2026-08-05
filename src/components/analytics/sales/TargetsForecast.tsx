import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { Target, TrendingUp, Loader2, CalendarClock, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState,
  DataTable, KpiCard, EUR, EUR_SHORT, PCT, NUM,
} from '../shared';

interface TargetsForecastProps {
  activeProfile: string;
}

// Dropsyncr-palet: zacht lavendel voor het doel, indigo voor de realisatie.
const TARGET_FILL = '#ddd6fe';
const ACTUAL_FILL = '#6366f1';

export function TargetsForecast({ activeProfile }: TargetsForecastProps) {
  const { t, language } = useLanguage();

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
      const result = await api.getTargetsForecast({ installationId: activeProfile, year });
      setData(result);
    } catch (error) {
      console.error('Failed to load targets forecast:', error);
      toast.error(t('errorLoadingAnalytics'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, year]);

  useEffect(() => { load(); }, [load]);

  const months: any[] = data?.months || [];
  const totals = data?.totals;

const statusClass = (entry: any) => {
    if (entry.isFuture || entry.achievedPct == null) return 'is-open';
    if (entry.achievedPct >= 1) return 'is-hit';
    if (entry.achievedPct >= 0.85) return 'is-near';
    return 'is-miss';
  };

  const statusLabel = (entry: any) => {
    if (entry.isFuture) return t('statusUpcoming');
    if (entry.achievedPct == null) return t('statusNoTarget');
    if (entry.achievedPct >= 1) return t('statusAchieved');
    if (entry.achievedPct >= 0.85) return t('statusNearly');
    return t('statusBehind');
  };

  const chartData = months.map((entry) => ({
    ...entry,
    label: monthLabel(entry.month),
  }));

  const yearOptions = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() + 1 - index);

  const columns = [
    { key: 'month', header: t('colMonth') },
    { key: 'target', header: t('colTarget'), align: 'right' as const },
    { key: 'actual', header: t('colRealised'), align: 'right' as const },
    { key: 'gap', header: t('colGap'), align: 'right' as const, hideOnMobile: true },
    { key: 'progress', header: t('colProgress'), align: 'center' as const, hideOnMobile: true },
    { key: 'orders', header: t('ordersLabel'), align: 'right' as const, hideOnMobile: true },
    { key: 'status', header: t('colStatus'), align: 'right' as const },
  ];

  const rows = months.map((entry) => {
    const pct = entry.achievedPct ?? 0;
    return {
      month: <span className={entry.isCurrent ? 'text-indigo-700' : 'text-slate-700'}>{monthLabel(entry.month, true)}</span>,
      target: <span className="text-slate-500">{entry.target > 0 ? EUR(entry.target) : '–'}</span>,
      actual: <span className="analytics-num">{EUR(entry.actual)}</span>,
      gap: entry.target > 0
        ? <span className={entry.gap > 0 ? 'text-rose-600' : 'text-emerald-600'}>
            {entry.gap > 0 ? `-${EUR(entry.gap)}` : `+${EUR(Math.abs(entry.gap))}`}
          </span>
        : <span className="text-slate-300">–</span>,
      progress: entry.target > 0 ? (
        <span className="analytics-progress">
          <span className="analytics-progress-track">
            <span
              className={`analytics-progress-fill ${statusClass(entry)}`}
              style={{ width: `${Math.max(4, Math.min(100, pct * 100))}%` }}
            />
          </span>
          <span className="analytics-progress-pct">{PCT(pct, 0)}</span>
        </span>
      ) : <span className="text-slate-300">–</span>,
      orders: <span className="text-slate-500">{NUM(entry.orders)}</span>,
      status: <span className={`analytics-status ${statusClass(entry)}`}>{statusLabel(entry)}</span>,
    };
  });

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('targetsForecast')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('targetsForecast')}
        subtitle={t('targetsForecastSubtitle')}
        showFilters={false}
        extra={
          <select
            className="analytics-select"
            value={year}
            onChange={(event) => setYear(parseInt(event.target.value, 10))}
          >
            {yearOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
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
          {!data.hasTargets && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t('noTargetsYetHint')}
            </div>
          )}

          <div className="analytics-kpi-grid">
            <KpiCard
              label={t('kpiYearTarget')}
              value={EUR(totals.target)}
              color="indigo"
              icon={<Target className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiRealised')}
              value={EUR(totals.actual)}
              sub={totals.achievedPct != null ? `${PCT(totals.achievedPct)} ${t('ofTarget')}` : undefined}
              color="emerald"
              icon={<Wallet className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={totals.gap > 0 ? t('kpiStillToGo') : t('kpiAboveTarget')}
              value={EUR(Math.abs(totals.gap))}
              color={totals.gap > 0 ? 'amber' : 'emerald'}
              icon={<TrendingUp className="w-4 h-4 text-white" />}
            />
            {data.currentForecast && (
              <KpiCard
                label={`${t('kpiForecast')} ${monthLabel(data.currentForecast.month, true)}`}
                value={EUR(data.currentForecast.forecast)}
                sub={`${t('basedOn')} ${data.currentForecast.daysPassed}/${data.currentForecast.daysInMonth} ${t('daysLabel')}`}
                color="purple"
                icon={<CalendarClock className="w-4 h-4 text-white" />}
              />
            )}
            {data.nextForecast && (
              <KpiCard
                label={`${t('kpiForecast')} ${monthLabel(data.nextForecast.month, true)}`}
                value={EUR(data.nextForecast.forecast)}
                sub={`${t('basedOnLast')} ${data.nextForecast.basedOnMonths} ${t('monthsLabel')}`}
                color="sky"
                icon={<CalendarClock className="w-4 h-4 text-white" />}
              />
            )}
          </div>

          <SectionCard title={t('targetVsActualTitle')}>
            {chartData.length === 0 ? (
              <EmptyState message={t('noDataForPeriod')} />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={EUR_SHORT} width={50} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                    formatter={(value: number) => EUR(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="target" name={t('colTarget')} fill={TARGET_FILL} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="actual" name={t('colRealised')} fill={ACTUAL_FILL} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  {data.currentForecast && (
                    <ReferenceLine
                      y={data.currentForecast.forecast}
                      stroke="#a855f7"
                      strokeDasharray="4 4"
                      label={{ value: t('forecastLabel'), position: 'right', fontSize: 10, fill: '#a855f7' }}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title={t('monthDetailTitle')}>
            <DataTable columns={columns} rows={rows} emptyMessage={t('noDataForPeriod')} />
          </SectionCard>
        </>
      )}
    </div>
  );
}