import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Download, ShoppingCart, ListTree, Package, Truck, Landmark,
  CalendarRange, Undo2, CreditCard, Megaphone, Building2, Check, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useLanguage } from '../../../contexts/LanguageContext';
import { AnalyticsPageHeader, SectionCard, NUM } from '../shared';

interface AnalyticsExportsProps {
  activeProfile: string;
}

interface ExportDefinition {
  id: string;
  icon: any;
  gradient: string;
  titleKey: string;
  descriptionKey: string;
}

const EXPORTS: ExportDefinition[] = [
  { id: 'orders', icon: ShoppingCart, gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)', titleKey: 'exportOrders', descriptionKey: 'exportOrdersDesc' },
  { id: 'order-items', icon: ListTree, gradient: 'linear-gradient(135deg,#8b5cf6,#a855f7)', titleKey: 'exportOrderItems', descriptionKey: 'exportOrderItemsDesc' },
  { id: 'products', icon: Package, gradient: 'linear-gradient(135deg,#0ea5e9,#3b82f6)', titleKey: 'exportProducts', descriptionKey: 'exportProductsDesc' },
  { id: 'purchase-orders', icon: Truck, gradient: 'linear-gradient(135deg,#f59e0b,#f97316)', titleKey: 'exportPurchaseOrders', descriptionKey: 'exportPurchaseOrdersDesc' },
  { id: 'vat', icon: Landmark, gradient: 'linear-gradient(135deg,#14b8a6,#0ea5e9)', titleKey: 'exportVat', descriptionKey: 'exportVatDesc' },
  { id: 'monthly-pnl', icon: CalendarRange, gradient: 'linear-gradient(135deg,#10b981,#14b8a6)', titleKey: 'exportPnl', descriptionKey: 'exportPnlDesc' },
  { id: 'returns', icon: Undo2, gradient: 'linear-gradient(135deg,#f43f5e,#ec4899)', titleKey: 'exportReturns', descriptionKey: 'exportReturnsDesc' },
  { id: 'payouts', icon: CreditCard, gradient: 'linear-gradient(135deg,#10b981,#059669)', titleKey: 'exportPayouts', descriptionKey: 'exportPayoutsDesc' },
  { id: 'ad-spend', icon: Megaphone, gradient: 'linear-gradient(135deg,#a855f7,#ec4899)', titleKey: 'exportAdSpend', descriptionKey: 'exportAdSpendDesc' },
  { id: 'fixed-costs', icon: Building2, gradient: 'linear-gradient(135deg,#64748b,#475569)', titleKey: 'exportFixedCosts', descriptionKey: 'exportFixedCostsDesc' },
];

// Lokale datum naar YYYY-MM-DD, zonder timezone-verschuiving.
const iso = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
};

export function AnalyticsExports({ activeProfile }: AnalyticsExportsProps) {
  const { t } = useLanguage();

  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  const loadCounts = useCallback(async () => {
    if (!activeProfile || !from || !to) return;
    try {
      setLoadingCounts(true);
      const result = await api.getExportCounts({ installationId: activeProfile, from, to });
      setCounts(result.counts || {});
    } catch (error) {
      console.error('Failed to load export counts:', error);
      setCounts({});
    } finally {
      setLoadingCounts(false);
    }
  }, [activeProfile, from, to]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  // Presets op basis van vandaag, zodat ze niet verouderen.
  const presets = [
    {
      label: t('currentMonth'),
      from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: iso(now),
    },
    {
      label: t('lastMonth'),
      from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
    },
    {
      label: t('currentQuarter'),
      from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)),
      to: iso(now),
    },
    {
      label: t('yearToDate'),
      from: iso(new Date(now.getFullYear(), 0, 1)),
      to: iso(now),
    },
    {
      label: `${now.getFullYear() - 1}`,
      from: `${now.getFullYear() - 1}-01-01`,
      to: `${now.getFullYear() - 1}-12-31`,
    },
  ];

  const handleExport = async (definition: ExportDefinition) => {
    try {
      setBusy(definition.id);
      const result = await api.downloadAnalyticsExport({
        installationId: activeProfile,
        type: definition.id,
        from,
        to,
      });

      const sheet = XLSX.utils.aoa_to_sheet([result.headers, ...result.rows]);

      // Kolombreedte op basis van de langste waarde, met een plafond.
      sheet['!cols'] = result.headers.map((header, index) => {
        const longest = result.rows.reduce((max, row) => {
          const length = String(row[index] ?? '').length;
          return length > max ? length : max;
        }, String(header).length);
        return { wch: Math.min(45, Math.max(10, longest + 2)) };
      });

      const workbook = XLSX.utils.book_new();
      // Excel accepteert maximaal 31 tekens voor een tabbladnaam.
      XLSX.utils.book_append_sheet(workbook, sheet, result.sheetName.slice(0, 31));
      XLSX.writeFile(workbook, result.filename);

      setDone((previous) => [...previous.filter((id) => id !== definition.id), definition.id]);
      toast.success(t('exportDownloaded'), {
        description: `${NUM(result.rowCount)} ${t('rowsLabel')} · ${from} – ${to}`,
      });
    } catch (error: any) {
      console.error('Export failed:', error);
      toast.error(t('exportFailed'), { description: error?.message });
    } finally {
      setBusy(null);
    }
  };

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('analyticsExports')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('analyticsExports')}
        subtitle={t('analyticsExportsSubtitle')}
        showFilters={false}
      />

      <SectionCard title={t('exportPeriodTitle')}>
        <div className="analytics-export-period">
          <div>
            <label className="analytics-form-label">{t('fromLabel')}</label>
            <input
              type="date"
              className="analytics-input"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div>
            <label className="analytics-form-label">{t('toLabel')}</label>
            <input
              type="date"
              className="analytics-input"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="analytics-export-presets">
            {presets.map((preset) => {
              const active = preset.from === from && preset.to === to;
              return (
                <button
                  key={preset.label}
                  onClick={() => { setFrom(preset.from); setTo(preset.to); }}
                  className={`analytics-store-pill ${active ? 'is-active' : ''}`}
                  style={active ? { backgroundColor: '#6366f1' } : undefined}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <div className="analytics-export-grid">
        {EXPORTS.map((definition) => {
          const Icon = definition.icon;
          const count = counts[definition.id];
          const isBusy = busy === definition.id;
          const isDone = done.includes(definition.id);
          const isEmpty = count === 0;

          return (
            <div key={definition.id} className="analytics-export-card">
              <div className="analytics-export-head">
                <span className="analytics-export-icon" style={{ background: definition.gradient }}>
                  <Icon className="w-5 h-5 text-white" />
                </span>
                {isDone && <Check className="w-4 h-4 text-emerald-500" />}
              </div>

              <h3 className="analytics-export-title">{t(definition.titleKey as any)}</h3>
              <p className="analytics-export-desc">{t(definition.descriptionKey as any)}</p>

              <p className="analytics-export-count">
                {loadingCounts
                  ? t('loadingLabel')
                  : count == null
                    ? '—'
                    : `${NUM(count)} ${t('rowsInPeriod')}`}
              </p>

              <button
                onClick={() => handleExport(definition)}
                disabled={isBusy || isEmpty}
                className="analytics-export-button"
                style={isEmpty ? undefined : { background: definition.gradient }}
              >
                {isBusy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t('busyLabel')}
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    {t('downloadXlsx')}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}