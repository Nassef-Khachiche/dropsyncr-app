import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../services/api';

export type DatePreset =
  | 'today' | 'yesterday' | 'last_7' | 'last_30'
  | 'this_month' | 'last_month' | 'this_year' | 'ytd';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
}

// Lokale datum naar YYYY-MM-DD, zonder timezone-verschuiving.
const iso = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const resolvePresetRange = (preset: DatePreset): DateRange => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return { from: iso(today), to: iso(today) };
    case 'yesterday': {
      const day = new Date(today);
      day.setDate(day.getDate() - 1);
      return { from: iso(day), to: iso(day) };
    }
    case 'last_7': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { from: iso(start), to: iso(today) };
    }
    case 'last_30': {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { from: iso(start), to: iso(today) };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: iso(start), to: iso(end) };
    }
    case 'this_year':
      return {
        from: iso(new Date(today.getFullYear(), 0, 1)),
        to: iso(new Date(today.getFullYear(), 11, 31)),
      };
    case 'ytd':
      return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) };
    case 'this_month':
    default:
      return {
        from: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: iso(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };
  }
};

interface AnalyticsContextType {
  datePreset: DatePreset;
  setDatePreset: (preset: DatePreset) => void;
  dateRange: DateRange;
  selectedStores: string[];
  setSelectedStores: (stores: string[]) => void;
  selectedCountries: string[];
  setSelectedCountries: (countries: string[]) => void;
  availableStores: string[];
  availableCountries: string[];
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

/**
 * Deelt periode en filters tussen alle analytics-tabs, zodat je bij het
 * wisselen van tab je selectie behoudt.
 */
export function AnalyticsProvider({
  children,
  activeProfile,
}: {
  children: ReactNode;
  activeProfile: string | null;
}) {
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [availableStores, setAvailableStores] = useState<string[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);

  const dateRange = useMemo(() => resolvePresetRange(datePreset), [datePreset]);

  // Filteropties komen uit de installatie zelf, niet uit een vaste lijst.
  useEffect(() => {
    if (!activeProfile) {
      setAvailableStores([]);
      setAvailableCountries([]);
      return;
    }
    let active = true;
    api.getAnalyticsFilters(activeProfile)
      .then((data) => {
        if (!active) return;
        setAvailableStores(data.stores || []);
        setAvailableCountries(data.countries || []);
      })
      .catch(() => {
        if (!active) return;
        setAvailableStores([]);
        setAvailableCountries([]);
      });
    return () => { active = false; };
  }, [activeProfile]);

  // Bij een andere installatie zijn oude filterwaarden niet meer geldig.
  useEffect(() => {
    setSelectedStores([]);
    setSelectedCountries([]);
  }, [activeProfile]);

  const value = useMemo<AnalyticsContextType>(() => ({
    datePreset,
    setDatePreset,
    dateRange,
    selectedStores,
    setSelectedStores,
    selectedCountries,
    setSelectedCountries,
    availableStores,
    availableCountries,
  }), [datePreset, dateRange, selectedStores, selectedCountries, availableStores, availableCountries]);

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
}