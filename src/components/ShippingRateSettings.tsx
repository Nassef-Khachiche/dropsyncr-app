import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, Loader2, Save, Euro } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

interface ShippingRateSettingsProps {
  activeProfile: string;
}

// Landnamen bij de codes die de backend teruggeeft (EU_COUNTRIES uit vatRates.js).
const COUNTRY_NAMES: Record<string, string> = {
  AT: 'Oostenrijk',
  BE: 'België',
  BG: 'Bulgarije',
  CY: 'Cyprus',
  CZ: 'Tsjechië',
  DE: 'Duitsland',
  DK: 'Denemarken',
  EE: 'Estland',
  ES: 'Spanje',
  FI: 'Finland',
  FR: 'Frankrijk',
  GR: 'Griekenland',
  HR: 'Kroatië',
  HU: 'Hongarije',
  IE: 'Ierland',
  IT: 'Italië',
  LT: 'Litouwen',
  LU: 'Luxemburg',
  LV: 'Letland',
  MT: 'Malta',
  NL: 'Nederland',
  PL: 'Polen',
  PT: 'Portugal',
  RO: 'Roemenië',
  SE: 'Zweden',
  SI: 'Slovenië',
  SK: 'Slowakije',
};

export function ShippingRateSettings({ activeProfile }: ShippingRateSettingsProps) {
  const { t } = useLanguage();

  const [countries, setCountries] = useState<string[]>([]);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (activeProfile) loadRates();
  }, [activeProfile]);

  const loadRates = async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const data = await api.getShippingRates(activeProfile);
      const nextRates: Record<string, string> = {};
      const nextConfigured: Record<string, boolean> = {};
      const codes: string[] = [];
      (data.rates || []).forEach((row: any) => {
        codes.push(row.countryCode);
        nextRates[row.countryCode] = String(row.amount ?? 0);
        nextConfigured[row.countryCode] = Boolean(row.configured);
      });
      setCountries(codes);
      setRates(nextRates);
      setConfigured(nextConfigured);
      setDirty(false);
    } catch (error) {
      console.error('Failed to load shipping rates:', error);
      toast.error(t('errorLoadingShippingRates'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (countryCode: string, value: string) => {
    setRates((prev) => ({ ...prev, [countryCode]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = countries.map((countryCode) => ({
        countryCode,
        amount: parseFloat(String(rates[countryCode] ?? '0').replace(',', '.')) || 0,
      }));
      await api.saveShippingRates({
        installationId: parseInt(activeProfile, 10),
        rates: payload,
      });
      toast.success(t('shippingRatesSaved'));
      await loadRates();
    } catch (error: any) {
      console.error('Failed to save shipping rates:', error);
      toast.error(error?.message || t('errorSavingShippingRates'));
    } finally {
      setSaving(false);
    }
  };

  const term = search.trim().toLowerCase();
  const visibleCountries = countries.filter((code) => {
    if (!term) return true;
    const name = COUNTRY_NAMES[code] || code;
    return code.toLowerCase().includes(term) || name.toLowerCase().includes(term);
  });

  const configuredCount = countries.filter((code) => configured[code]).length;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg text-slate-900">{t('shippingRatesTitle')}</CardTitle>
          <p className="text-sm text-slate-500">{t('shippingRatesSubtitle')}</p>
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
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="relative max-w-sm flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder={t('searchCountry')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-9 text-sm border-slate-200"
                />
              </div>
              <span className="text-xs text-slate-400">
                {configuredCount} / {countries.length} {t('shippingRatesConfigured')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleCountries.map((code) => (
                <div
                  key={code}
                  className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 transition-colors ${
                    configured[code] ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <span className="w-8 shrink-0 text-xs font-mono font-semibold text-slate-500">{code}</span>
                  <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">
                    {COUNTRY_NAMES[code] || code}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Euro className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={rates[code] ?? ''}
                      onChange={(e) => handleChange(code, e.target.value)}
                      className="w-20 text-right text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
              ))}
            </div>

            {dirty && <p className="text-xs text-amber-600">{t('unsavedChanges')}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}