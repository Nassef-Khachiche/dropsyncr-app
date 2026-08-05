import { useState } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { useAnalytics, type DatePreset } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';

const PRESETS: DatePreset[] = [
  'today', 'yesterday', 'last_7', 'last_30',
  'this_month', 'last_month', 'this_year', 'ytd',
];

export function GlobalFilters({ hideCountries = false }: { hideCountries?: boolean }) {
  const { t } = useLanguage();
  const {
    datePreset, setDatePreset, dateRange,
    selectedStores, setSelectedStores,
    selectedCountries, setSelectedCountries,
    availableStores, availableCountries,
  } = useAnalytics();

  const [showPresets, setShowPresets] = useState(false);

  const presetLabels: Record<DatePreset, string> = {
    today: t('today'),
    yesterday: t('yesterday'),
    last_7: t('last7days'),
    last_30: t('last30days'),
    this_month: t('currentMonth'),
    last_month: t('lastMonth'),
    this_year: t('thisYear'),
    ytd: t('yearToDate'),
  };

  const toggle = (list: string[], setList: (next: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  };

  const summaryLabel = (selected: string[], allLabel: string, pluralLabel: string) =>
    selected.length === 0 ? allLabel : selected.length === 1 ? selected[0] : `${selected.length} ${pluralLabel}`;

  const hasFilters = selectedStores.length > 0 || selectedCountries.length > 0;

  return (
   <div className="analytics-filters flex items-center gap-2 flex-wrap">
      <div className="relative">
        <button
          onClick={() => setShowPresets((open) => !open)}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>{presetLabels[datePreset]}</span>
          <span className="text-slate-400 text-xs">
            {dateRange.from} – {dateRange.to}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
        {showPresets && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowPresets(false)} />
            <div className="absolute top-10 left-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-1 min-w-[180px]">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => { setDatePreset(preset); setShowPresets(false); }}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                    datePreset === preset ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {presetLabels[preset]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <FilterChip
        label={summaryLabel(selectedStores, t('allStores'), t('storesLabel'))}
        active={selectedStores.length > 0}
        onClear={() => setSelectedStores([])}
        options={availableStores}
        selected={selectedStores}
        onToggle={(value) => toggle(selectedStores, setSelectedStores, value)}
        emptyLabel={t('noOptionsAvailable')}
      />

      {!hideCountries && (
        <FilterChip
          label={summaryLabel(selectedCountries, t('allCountries'), t('countriesLabel'))}
          active={selectedCountries.length > 0}
          onClear={() => setSelectedCountries([])}
          options={availableCountries}
          selected={selectedCountries}
          onToggle={(value) => toggle(selectedCountries, setSelectedCountries, value)}
          emptyLabel={t('noOptionsAvailable')}
        />
      )}

      {hasFilters && (
        <button
          onClick={() => { setSelectedStores([]); setSelectedCountries([]); }}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
        >
          <X className="w-3 h-3" /> {t('resetFilters')}
        </button>
      )}
    </div>
  );
}

function FilterChip({
  label, active, onClear, options, selected, onToggle, emptyLabel,
}: {
  label: string;
  active: boolean;
  onClear: () => void;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  emptyLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div className={`flex items-center border rounded-lg overflow-hidden text-sm h-9 transition-colors ${
        active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'
      }`}>
        <button
          onClick={() => setOpen((value) => !value)}
          className={`flex items-center gap-1.5 px-3 h-full max-w-[160px] transition-colors ${
            active ? 'text-indigo-700' : 'text-slate-700'
          }`}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>
        {active && (
          <button onClick={onClear} className="pr-2 pl-1 h-full text-indigo-400 hover:text-indigo-700">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-10 left-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-1 min-w-[180px] max-h-64 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">{emptyLabel}</div>
            ) : options.map((option) => (
              <label
                key={option}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer rounded-md text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  className="rounded shrink-0"
                  checked={selected.includes(option)}
                  onChange={() => onToggle(option)}
                />
                <span className="truncate">{option}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}