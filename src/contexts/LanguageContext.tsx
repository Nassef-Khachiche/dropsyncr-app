import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type LanguageCode = 'en' | 'nl' | 'de';

type TranslationKey =
  | 'loading'
  | 'orderManagement'
  | 'system'
  | 'administrativeSection'
  | 'orders'
  | 'tracking'
  | 'labels'
  | 'integrations'
  | 'carriers'
  | 'settings'
  | 'automationRules'
  | 'administrative'
  | 'noInstallation'
  | 'ownStores'
  | 'noOwnStores'
  | 'fulfilmentCustomers'
  | 'logout'
  | 'analytics'
  | 'dashboard'
  | 'fulfillmentAnalytics'
  | 'dashboardSubtitle'
  | 'totalRevenue'
  | 'totalOrders'
  | 'pendingOrders'
  | 'processedToday'
  | 'vsLastPeriod'
  | 'stillToShip'
  | 'labelsPrinted'
  | 'revenueOrdersOverview'
  | 'recentActivity'
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'lastMonth'
  | 'currentMonth'
  | 'thisYear'
  | 'custom'
  | 'choosePeriod'
  | 'startDate'
  | 'endDate'
  | 'cancel'
  | 'apply';

type Dictionary = Record<TranslationKey, string>;

const dictionaries: Record<LanguageCode, Dictionary> = {
  en: {
    loading: 'Loading...',
    orderManagement: 'ORDER MANAGEMENT',
    system: 'SYSTEM',
    administrativeSection: 'ADMINISTRATIVE',
    orders: 'Orders',
    tracking: 'Tracking',
    labels: 'Labels',
    integrations: 'Integrations',
    carriers: 'Carriers',
    settings: 'Settings',
    automationRules: 'Automation Rules',
    administrative: 'Administrative',
    noInstallation: 'No installation',
    ownStores: 'Own Stores',
    noOwnStores: 'No own stores',
    fulfilmentCustomers: 'Fulfilment Customers',
    logout: 'Logout',
    analytics: 'ANALYTICS',
    dashboard: 'Dashboard',
    fulfillmentAnalytics: 'Fulfillment Analytics',
    dashboardSubtitle: 'Overview of your most important metrics',
    totalRevenue: 'Total Revenue',
    totalOrders: 'Total Orders',
    pendingOrders: 'Pending Orders',
    processedToday: 'Processed Today',
    vsLastPeriod: 'vs last period',
    stillToShip: 'Still to ship',
    labelsPrinted: 'Labels printed & shipped',
    revenueOrdersOverview: 'Revenue & Orders Overview',
    recentActivity: 'Recent Activity',
    today: 'Today',
    yesterday: 'Yesterday',
    last7days: 'Last 7 days',
    lastMonth: 'Last month',
    currentMonth: 'Current month',
    thisYear: 'This year',
    custom: 'Custom',
    choosePeriod: 'Choose a period',
    startDate: 'Start date',
    endDate: 'End date',
    cancel: 'Cancel',
    apply: 'Apply',
  },
  nl: {
    loading: 'Laden...',
    orderManagement: 'ORDER MANAGEMENT',
    system: 'SYSTEEM',
    administrativeSection: 'ADMINISTRATIEF',
    orders: 'Bestellingen',
    tracking: 'Tracking',
    labels: 'Labels',
    integrations: 'Integraties',
    carriers: 'Vervoerders',
    settings: 'Instellingen',
    automationRules: 'Automatiserings Regels',
    administrative: 'Administratief',
    noInstallation: 'Geen installatie',
    ownStores: 'Eigen Stores',
    noOwnStores: 'Geen eigen stores',
    fulfilmentCustomers: 'Fulfilment Klanten',
    logout: 'Logout',
    analytics: 'ANALYTICS',
    dashboard: 'Dashboard',
    fulfillmentAnalytics: 'Fulfilment Analytics',
    dashboardSubtitle: 'Overzicht van je belangrijkste metrics',
    totalRevenue: 'Totale Omzet',
    totalOrders: 'Totale Orders',
    pendingOrders: 'Openstaande Orders',
    processedToday: 'Verwerkt Vandaag',
    vsLastPeriod: 'vs vorige periode',
    stillToShip: 'Nog te verzenden',
    labelsPrinted: 'Labels geprint & verzonden',
    revenueOrdersOverview: 'Omzet & Orders Overzicht',
    recentActivity: 'Recente Activiteit',
    today: 'Vandaag',
    yesterday: 'Gisteren',
    last7days: 'Afgelopen 7 dagen',
    lastMonth: 'Afgelopen maand',
    currentMonth: 'Huidige maand',
    thisYear: 'Dit jaar',
    custom: 'Aangepast',
    choosePeriod: 'Kies een periode',
    startDate: 'Startdatum',
    endDate: 'Einddatum',
    cancel: 'Annuleren',
    apply: 'Toepassen',
  },
  de: {
    loading: 'Lädt...',
    orderManagement: 'BESTELLMANAGEMENT',
    system: 'SYSTEM',
    administrativeSection: 'ADMINISTRATION',
    orders: 'Bestellungen',
    tracking: 'Sendungsverfolgung',
    labels: 'Etiketten',
    integrations: 'Integrationen',
    carriers: 'Versanddienstleister',
    settings: 'Einstellungen',
    automationRules: 'Automatisierungsregeln',
    administrative: 'Verwaltung',
    noInstallation: 'Keine Installation',
    ownStores: 'Eigene Stores',
    noOwnStores: 'Keine eigenen Stores',
    fulfilmentCustomers: 'Fulfilment-Kunden',
    logout: 'Abmelden',
    analytics: 'ANALYTICS',
    dashboard: 'Dashboard',
    fulfillmentAnalytics: 'Fulfillment Analyse',
    dashboardSubtitle: 'Übersicht Ihrer wichtigsten Kennzahlen',
    totalRevenue: 'Gesamtumsatz',
    totalOrders: 'Gesamtbestellungen',
    pendingOrders: 'Offene Bestellungen',
    processedToday: 'Heute verarbeitet',
    vsLastPeriod: 'vs. letzter Zeitraum',
    stillToShip: 'Noch zu versenden',
    labelsPrinted: 'Etiketten gedruckt & versendet',
    revenueOrdersOverview: 'Umsatz & Bestellungen Übersicht',
    recentActivity: 'Letzte Aktivität',
    today: 'Heute',
    yesterday: 'Gestern',
    last7days: 'Letzte 7 Tage',
    lastMonth: 'Letzter Monat',
    currentMonth: 'Aktueller Monat',
    thisYear: 'Dieses Jahr',
    custom: 'Benutzerdefiniert',
    choosePeriod: 'Zeitraum wählen',
    startDate: 'Startdatum',
    endDate: 'Enddatum',
    cancel: 'Abbrechen',
    apply: 'Anwenden',
  },
};

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const stored = localStorage.getItem('language') as LanguageCode | null;
    return stored === 'nl' || stored === 'de' || stored === 'en' ? stored : 'en';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (value: LanguageCode) => {
    setLanguageState(value);
  };

  const value = useMemo<LanguageContextType>(() => ({
    language,
    setLanguage,
    t: (key: TranslationKey) => dictionaries[language][key],
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
