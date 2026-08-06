import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Loader2, Save, Target, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

interface TargetSettingsProps {
  activeProfile: string;
}

export function TargetSettings({ activeProfile }: TargetSettingsProps) {
  const { t, language } = useLanguage();

  const [year, setYear] = useState(new Date().getFullYear());
  const [years, setYears] = useState<number[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const locale = language === 'nl' ? 'nl-NL' : language === 'de' ? 'de-DE' : 'en-GB';

  const monthName = (month: number) =>
    new Date(2000, month - 1, 1).toLocaleString(locale, { month: 'long' });

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const data = await api.getRevenueTargets(activeProfile, year);
      const next: Record<number, string> = {};
      (data.months || []).forEach((row) => {
        next[row.month] = row.revenueTarget ? String(row.revenueTarget) : '';
      });
      setValues(next);
      setYears(data.years || []);
      setDirty(false);
    } catch (error) {
      console.error('Failed to load revenue targets:', error);
      toast.error(t('errorLoadingTargets'));
    } finally {
      setLoading(false);
    }
  }, [activeProfile, year]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (month: number, value: string) => {
    setValues((previous) => ({ ...previous, [month]: value }));
    setDirty(true);
  };

  // Handig bij het opzetten van een nieuw jaar: januari overal doortrekken.
  const spreadFirstMonth = () => {
    const first = parseFloat(String(values[1] || '').replace(',', '.')) || 0;
    if (first <= 0) {
      toast.error(t('fillJanuaryFirst'));
      return;
    }
    const next: Record<number, string> = {};
    for (let month = 1; month <= 12; month += 1) next[month] = String(first);
    setValues(next);
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const months = Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        return {
          month,
          revenueTarget: parseFloat(String(values[month] || '0').replace(',', '.')) || 0,
        };
      });

      await api.saveRevenueTargets({
        installationId: parseInt(activeProfile, 10),
        year,
        months,
      });

      toast.success(t('targetsSaved'));
      await load();
    } catch (error: any) {
      console.error('Failed to save revenue targets:', error);
      toast.error(error?.message || t('errorSavingTargets'));
    } finally {
      setSaving(false);
    }
  };

  const total = Array.from({ length: 12 }, (_, index) =>
    parseFloat(String(values[index + 1] || '0').replace(',', '.')) || 0,
  ).reduce((sum, value) => sum + value, 0);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg text-slate-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-500" />
            {t('targetsTitle')}
          </CardTitle>
          <p className="text-sm text-slate-500">{t('targetsSubtitle')}</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || loading || !dirty}
          className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('save')}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <select
                className="analytics-select"
                value={year}
                onChange={(event) => setYear(parseInt(event.target.value, 10))}
              >
                {years.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>

              <button
                onClick={spreadFirstMonth}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                {t('spreadJanuary')}
              </button>

              <span className="text-sm text-slate-500 ml-auto">
                {t('yearTotal')}: <span className="analytics-num">
                  € {total.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </span>
            </div>

            <div className="analytics-target-grid">
              {Array.from({ length: 12 }, (_, index) => {
                const month = index + 1;
                return (
                  <div key={month} className="analytics-target-field">
                    <label className="analytics-target-label">{monthName(month)}</label>
                    <div className="analytics-target-input">
                      <span>€</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={values[month] ?? ''}
                        onChange={(event) => handleChange(month, event.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {dirty && <p className="text-xs text-amber-600">{t('unsavedChanges')}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}