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
  | 'klkAnalytics'
  | 'warehouseManagement'
  | 'inventoryManagement'
  | 'inventoryAnalysis'
  | 'klkSubtitle'
  | 'totalRevenue'
  | 'totalPurchaseCosts'
  | 'grossProfit'
  | 'advertisingCosts'
  | 'vsPreviousPeriod'
  | 'purchaseCostsAndCogs'
  | 'margin'
  | 'shopifyChannels'
  | 'totalRevenueAllChannels'
  | 'revenue'
  | 'purchaseCosts'
  | 'advertisingCostsLabel'
  | 'fulfilmentOnlyRevenue'
  | 'selectPeriod'
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
  | 'inventoryManagementSubtitle'
  | 'searchEanOrProduct'
  | 'allClients'
  | 'sortBy'
  | 'sortNameAsc'
  | 'sortNameDesc'
  | 'sortStockLow'
  | 'sortStockHigh'
  | 'incomingShipments'
  | 'filterAll'
  | 'filterRegistered'
  | 'filterInProgress'
  | 'filterReserved'
  | 'filterLowStock'
  | 'itemsSelected'
  | 'printEanBarcode'
  | 'deselectAll'
  | 'product'
  | 'locations'
  | 'client'
  | 'registered'
  | 'inProgress'
  | 'reserved'
  | 'available'
  | 'total'
  | 'noItemsFound'
  | 'articles'
  | 'status'
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
    klkAnalytics: 'KLK Analytics',
    warehouseManagement: 'WAREHOUSE MANAGEMENT',
    inventoryManagement: 'Manage Inventory',
    inventoryAnalysis: 'Inventory Analysis',
    klkSubtitle: 'Overview of all revenue and costs per sales channel',
    totalRevenue: 'Total Revenue',
    totalPurchaseCosts: 'Total Purchase Costs',
    grossProfit: 'Gross Profit',
    advertisingCosts: 'Advertising Costs',
    vsPreviousPeriod: 'vs previous period',
    purchaseCostsAndCogs: 'Purchase costs + COGS',
    margin: 'Margin',
    shopifyChannels: 'Shopify channels',
    totalRevenueAllChannels: 'Total revenue — all channels',
    revenue: 'Revenue',
    purchaseCosts: 'Purchase costs',
    advertisingCostsLabel: 'Advertising costs',
    fulfilmentOnlyRevenue: 'Fulfilment only has revenue — no costs here',
    selectPeriod: 'Select period',
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
    inventoryManagementSubtitle: 'Manage your inventory and stock locations',
    searchEanOrProduct: 'Search by EAN or product name...',
    allClients: 'All clients',
    sortBy: 'Sort by...',
    sortNameAsc: 'Name (A-Z)',
    sortNameDesc: 'Name (Z-A)',
    sortStockLow: 'Stock (low-high)',
    sortStockHigh: 'Stock (high-low)',
    incomingShipments: 'Incoming shipments',
    filterAll: 'All',
    filterRegistered: 'Registered',
    filterInProgress: 'In progress',
    filterReserved: 'Reserved',
    filterLowStock: 'Low stock',
    itemsSelected: 'item(s) selected',
    printEanBarcode: 'Print EAN barcode',
    deselectAll: 'Deselect all',
    product: 'Product',
    locations: 'Location(s)',
    client: 'Client',
    registered: 'Registered',
    inProgress: 'In prog.',
    reserved: 'Reserved',
    available: 'Available',
    total: 'Total',
    noItemsFound: 'No items found',
    articles: 'articles',
    status: 'Status',
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
    klkAnalytics: 'KLK Analytics',
    warehouseManagement: 'WAREHOUSE MANAGEMENT',
    inventoryManagement: 'Voorraad managen',
    inventoryAnalysis: 'Voorraadanalyse',
    klkSubtitle: 'Overzicht van alle omzet en kosten per verkoopkanaal',
    totalRevenue: 'Totale omzet',
    totalPurchaseCosts: 'Totale inkoopkosten',
    grossProfit: 'Brutowinst',
    advertisingCosts: 'Advertentiekosten',
    vsPreviousPeriod: 'vs vorige periode',
    purchaseCostsAndCogs: 'Inkoopkosten + COGS',
    margin: 'Marge',
    shopifyChannels: 'Shopify kanalen',
    totalRevenueAllChannels: 'Totale omzet — alle kanalen',
    revenue: 'Omzet',
    purchaseCosts: 'Inkoopkosten',
    advertisingCostsLabel: 'Advertentiekosten',
    fulfilmentOnlyRevenue: 'Fulfilment heeft alleen omzet — geen kosten hier',
    selectPeriod: 'Selecteer periode',
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
    inventoryManagementSubtitle: 'Beheer je inventaris en voorraadlocaties',
    searchEanOrProduct: 'Zoek op EAN of artikelnaam...',
    allClients: 'Alle klanten',
    sortBy: 'Sorteer op...',
    sortNameAsc: 'Naam (A-Z)',
    sortNameDesc: 'Naam (Z-A)',
    sortStockLow: 'Voorraad (laag-hoog)',
    sortStockHigh: 'Voorraad (hoog-laag)',
    incomingShipments: 'Aankomende zendingen',
    filterAll: 'Alles',
    filterRegistered: 'Aangemeld',
    filterInProgress: 'In behandeling',
    filterReserved: 'Gereserveerd',
    filterLowStock: 'Laag op voorraad',
    itemsSelected: 'artikel(en) geselecteerd',
    printEanBarcode: 'EAN barcode printen',
    deselectAll: 'Deselecteer alles',
    product: 'Artikel',
    locations: 'Locatie(s)',
    client: 'Klant',
    registered: 'Aangemeld',
    inProgress: 'In beh.',
    reserved: 'Gereserveerd',
    available: 'Beschikbaar',
    total: 'Totaal',
    noItemsFound: 'Geen artikelen gevonden',
    articles: 'artikelen',
    status: 'Status',
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
    klkAnalytics: 'KLK Analytics',
    warehouseManagement: 'LAGERVERWALTUNG',
    inventoryManagement: 'Bestand verwalten',
    inventoryAnalysis: 'Bestandsanalyse',
    klkSubtitle: 'Übersicht aller Umsätze und Kosten pro Verkaufskanal',
    totalRevenue: 'Gesamtumsatz',
    totalPurchaseCosts: 'Gesamteinkaufskosten',
    grossProfit: 'Bruttogewinn',
    advertisingCosts: 'Werbekosten',
    vsPreviousPeriod: 'vs. vorheriger Zeitraum',
    purchaseCostsAndCogs: 'Einkaufskosten + COGS',
    margin: 'Marge',
    shopifyChannels: 'Shopify-Kanäle',
    totalRevenueAllChannels: 'Gesamtumsatz — alle Kanäle',
    revenue: 'Umsatz',
    purchaseCosts: 'Einkaufskosten',
    advertisingCostsLabel: 'Werbekosten',
    fulfilmentOnlyRevenue: 'Fulfilment hat nur Umsatz — keine Kosten hier',
    selectPeriod: 'Zeitraum auswählen',
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
    inventoryManagementSubtitle: 'Verwalten Sie Ihren Bestand und Lagerorte',
    searchEanOrProduct: 'Nach EAN oder Artikelname suchen...',
    allClients: 'Alle Kunden',
    sortBy: 'Sortieren nach...',
    sortNameAsc: 'Name (A-Z)',
    sortNameDesc: 'Name (Z-A)',
    sortStockLow: 'Bestand (niedrig-hoch)',
    sortStockHigh: 'Bestand (hoch-niedrig)',
    incomingShipments: 'Eingehende Sendungen',
    filterAll: 'Alle',
    filterRegistered: 'Angemeldet',
    filterInProgress: 'In Bearbeitung',
    filterReserved: 'Reserviert',
    filterLowStock: 'Geringer Bestand',
    itemsSelected: 'Artikel ausgewählt',
    printEanBarcode: 'EAN-Barcode drucken',
    deselectAll: 'Alle abwählen',
    product: 'Artikel',
    locations: 'Standort(e)',
    client: 'Kunde',
    registered: 'Angemeldet',
    inProgress: 'In Bearb.',
    reserved: 'Reserviert',
    available: 'Verfügbar',
    total: 'Gesamt',
    noItemsFound: 'Keine Artikel gefunden',
    articles: 'Artikel',
    status: 'Status',
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
