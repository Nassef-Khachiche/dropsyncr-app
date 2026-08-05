import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Clock, PackageX, TrendingDown, HelpCircle,
  Megaphone, Settings2, ShieldCheck, ChevronRight, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { AnalyticsPageHeader, SectionCard, EUR } from '../shared';

interface SignalsProps {
  activeProfile: string;
  onNavigate?: (view: string) => void;
}

const CATEGORY_ICONS: Record<string, any> = {
  purchasing: Clock,
  fulfilment: PackageX,
  margin: TrendingDown,
  quality: AlertTriangle,
  marketing: Megaphone,
  setup: Settings2,
};

export function Signals({ activeProfile, onNavigate }: SignalsProps) {
  const { t } = useLanguage();
  const { dateRange, selectedStores, selectedCountries } = useAnalytics();

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getSignals({
        installationId: activeProfile,
        from: dateRange.from,
        to: dateRange.to,
        stores: selectedStores,
        countries: selectedCountries,
      });
      setData(result);
    } catch (error) {
      console.error('Failed to load signals:', error);
      toast.error(t('errorLoadingSignals'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, dateRange, selectedStores, selectedCountries]);

  useEffect(() => { load(); }, [load]);

  const signals: any[] = data?.signals || [];
  const counts = data?.counts || { critical: 0, warning: 1, info: 0, total: 0 };

  /*
   * De backend levert een sleutel plus losse waarden aan in plaats van een
   * kant-en-klare zin, zodat de teksten vertaalbaar blijven. Hier vullen we
   * de placeholders in.
   */
  const fill = (key: string, params: Record<string, any> = {}) => {
    let text = t(key as any);
    for (const [name, value] of Object.entries(params)) {
      const formatted = ['revenue', 'loss', 'spend'].includes(name)
        ? EUR(Number(value))
        : String(value);
      text = text.replace(`{${name}}`, formatted);
    }
    return text;
  };

  const visible = filter === 'all'
    ? signals
    : signals.filter((signal) => signal.severity === filter);

  const summaryCards = [
    { key: 'critical' as const, label: t('severityCritical'), count: counts.critical },
    { key: 'warning' as const, label: t('severityWarning'), count: counts.warning },
    { key: 'info' as const, label: t('severityInfo'), count: counts.info },
  ];

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('signals')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader title={t('signals')} subtitle={t('signalsSubtitle')} />

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <div className="analytics-kpi-grid is-three">
            {summaryCards.map((card) => (
              <button
                key={card.key}
                onClick={() => setFilter(filter === card.key ? 'all' : card.key)}
                className={`analytics-signal-summary sev-${card.key} ${filter === card.key ? 'is-active' : ''}`}
              >
                <span className="analytics-signal-count">{card.count}</span>
                <span className="analytics-signal-summary-label">{card.label}</span>
              </button>
            ))}
          </div>

          {signals.length === 0 ? (
            <SectionCard>
              <div className="analytics-signal-empty">
                <ShieldCheck className="w-10 h-10" />
                <p>{t('noSignalsFound')}</p>
                <span>{t('noSignalsHint')}</span>
              </div>
            </SectionCard>
          ) : (
            <SectionCard
              title={filter === 'all'
                ? `${signals.length} ${t('activeSignals')}`
                : `${visible.length} ${t('activeSignals')}`}
              action={filter !== 'all' && (
                <button onClick={() => setFilter('all')} className="text-xs text-indigo-600 hover:underline">
                  {t('showAll')}
                </button>
              )}
            >
              <div className="space-y-2.5">
                {visible.map((signal) => {
                  const Icon = CATEGORY_ICONS[signal.category] || HelpCircle;
                  return (
                    <div key={signal.id} className={`analytics-signal sev-${signal.severity}`}>
                      <span className="analytics-signal-icon">
                        <Icon className="w-4 h-4" />
                      </span>

                      <div className="analytics-signal-body">
                        <span className="analytics-signal-category">
                          {t(`signalCategory_${signal.category}` as any)}
                        </span>
                        <span className="analytics-signal-title">
                          {fill(signal.titleKey, signal.params)}
                        </span>
                        <span className="analytics-signal-detail">
                          {fill(signal.detailKey, signal.params)}
                        </span>
                      </div>

                      <span className="analytics-signal-value">{signal.value}</span>

                      {signal.actionView && onNavigate && (
                        <button
                          onClick={() => onNavigate(signal.actionView)}
                          className="analytics-signal-action"
                          title={t('goToPage')}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}