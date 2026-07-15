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
  | 'shipments'
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
  | 'returns'
  | 'apply'
  | 'returnsSubtitle'
  | 'returnsSelectInstallation'
  | 'openReturns'
  | 'processedThisMonth'
  | 'waitingForQr'
  | 'inReturnBox'
  | 'openReturnsTab'
  | 'processedReturnsTab'
  | 'returnBoxTab'
  | 'searchReturns'
  | 'registerReturn'
  | 'noOpenReturns'
  | 'noProcessedReturns'
  | 'noReturnBoxItems'
  | 'articlesInReturnBox'
  | 'totalSalesValue'
  | 'createShipment'
  | 'destroy'
  | 'processReturn'
  | 'processedReturn'
  | 'productsFromOrder'
  | 'noItemsKnown'
  | 'dropshipRetourQr'
  | 'uploadQrCode'
  | 'processedOn'
  | 'processing'
  | 'quantity'
  | 'inspectionStatus'
  | 'processReturnBtn'
  | 'viewReturn'
  | 'close'
  | 'goBack'
  | 'yesProcessReturn'
  | 'createShipmentFor'
  | 'destroyItemsFor'
  | 'warningIrreversible'
  | 'createShipmentDescription'
  | 'destroyDescription'
  | 'yesCreateShipment'
  | 'yesDestroy'
  | 'registerReturnTitle'
  | 'orderNumber'
  | 'customerName'
  | 'email'
  | 'ffmClient'
  | 'returnType'
  | 'ownStock'
  | 'dropship'
  | 'returnReason'
  | 'selectReason'
  | 'damagedProduct'
  | 'wrongProduct'
  | 'notAsDescribed'
  | 'changedMind'
  | 'deliveryComplaint'
  | 'returnToSupplier'
  | 'other'
  | 'explanation'
  | 'explanationPlaceholder'
  | 'statusRegistered'
  | 'statusWaitingQr'
  | 'statusQrReceived'
  | 'statusReturned'
  | 'statusReceived'
  | 'statusProcessed'
  | 'qrRequired'
  | 'qrReceived'
  | 'unknown'
  | 'emailCopied'
  | 'nameCopied'
  | 'orderNumberCopied'
  | 'eanCopied'
  | 'copyEmail'
  | 'copyName'
  | 'copyOrderNumber'
  | 'copyEan'
  | 'inspectionReturnReceived'
  | 'inspectionExchangeProduct'
  | 'inspectionNotMeetConditions'
  | 'inspectionRepairProduct'
  | 'inspectionCustomerKeeps'
  | 'inspectionStillApproved'
  | 'inspectionReturnToSupplier'
  | 'settingsSubtitle'
  | 'settingsSelectInstallation'
  | 'warehouseTab'
  | 'warehouseTitle'
  | 'warehouseSubtitle'
  | 'warehouseName'
  | 'warehouseNamePlaceholder'
  | 'warehouseEmail'
  | 'warehouseEmailPlaceholder'
  | 'warehousePhone'
  | 'warehousePhonePlaceholder'
  | 'warehouseAddressSection'
  | 'warehouseStreet'
  | 'warehouseStreetPlaceholder'
  | 'warehouseHouseNumber'
  | 'warehousePostalCode'
  | 'warehouseCity'
  | 'warehouseCityPlaceholder'
  | 'warehouseCountry'
  | 'warehouseSaved'
  | 'warehouseSaveError'
  | 'save'
  | 'delete'
  | 'locationManagement'
  | 'locationManagementSubtitle'
  | 'newLocation'
  | 'totalRows'
  | 'totalSections'
  | 'totalCases'
  | 'totalPallets'
  | 'searchLocationCode'
  | 'locationOverview'
  | 'locationOverviewSubtitle'
  | 'noLocationsFound'
  | 'noLocationsYet'
  | 'row'
  | 'section'
  | 'case'
  | 'pallet'
  | 'inactive'
  | 'deactivate'
  | 'activate'
  | 'locationDeleted'
  | 'locationActivated'
  | 'locationDeactivated'
  | 'errorLoadingLocations'
  | 'errorUpdatingLocation'
  | 'errorDeletingLocation'
  | 'errorCreatingLocation'
  | 'locationCreated'
  | 'locationsCreated'
  | 'locationType'
  | 'parentRow'
  | 'parentSection'
  | 'parentCase'
  | 'selectRow'
  | 'selectSection'
  | 'selectCase'
  | 'locationCode'
  | 'locationCodeRequired'
  | 'parentLocationRequired'
  | 'newLocationSubtitle'
  | 'create'
  | 'locationCodeRowPlaceholder'
  | 'locationCodeSectionPlaceholder'
  | 'locationCodeCasePlaceholder'
  | 'locationCodePalletPlaceholder'
  | 'bulkCreate'
  | 'bulkCreateSubtitle'
  | 'startCode'
  | 'amount'
  | 'perRow'
  | 'perSection'
  | 'perCase'
  | 'preview'
  | 'rows'
  | 'upTo'
  | 'exampleSection'
  | 'exampleCase'
  | 'examplePallet'
  | 'locationsLower'
  | 'printBarcode'
  | 'printAllBarcodes'
  | 'arrowUpdated'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowNone'
  | 'productManagement'
  | 'productManagementSubtitle'
  | 'newProduct'
  | 'totalProducts'
  | 'active'
  | 'archived'
  | 'products'
  | 'productsFound'
  | 'photo'
  | 'eanCode'
  | 'productName'
  | 'brand'
  | 'sizeCategory'
  | 'selectSizeCategory'
  | 'purchasePrice'
  | 'dimensionsOptional'
  | 'noProductsFound'
  | 'productCreated'
  | 'productUpdated'
  | 'productArchived'
  | 'productRestored'
  | 'productDeleted'
  | 'errorLoadingProducts'
  | 'errorCreatingProduct'
  | 'errorUpdatingProduct'
  | 'errorDeletingProduct'
  | 'productNameRequired'
  | 'selectInstallationFirst'
  | 'newProductSubtitle'
  | 'editProduct'
  | 'archive'
  | 'restore'
  | 'edit'
  | 'totalValue'
  | 'openOrders'
  | 'needsPicking'
  | 'expiringTomorrow'
  | 'processed'
  | 'searchProductEanClient'
  | 'receivedAtDate';

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
    shipments: 'Shipments',
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
    totalRevenueAllChannels: 'Total revenue - all channels',
    revenue: 'Revenue',
    purchaseCosts: 'Purchase costs',
    advertisingCostsLabel: 'Advertising costs',
    fulfilmentOnlyRevenue: 'Fulfilment only has revenue - no costs here',
    selectPeriod: 'Select period',
    dashboardSubtitle: 'Overview of your most important metrics',
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
    returns: 'Returns',
    apply: 'Apply',
    returnsSubtitle: 'Overview of all registered returns',
    returnsSelectInstallation: 'Select an installation to view returns',
    openReturns: 'Open returns',
    processedThisMonth: 'Processed this month',
    waitingForQr: 'Waiting for QR',
    inReturnBox: 'In return box',
    openReturnsTab: 'Open returns',
    processedReturnsTab: 'Processed returns',
    returnBoxTab: 'Return box',
    searchReturns: 'Search by return number, RMA, order number or customer...',
    registerReturn: 'Register return',
    noOpenReturns: 'No open returns found.',
    noProcessedReturns: 'No processed returns found.',
    noReturnBoxItems: 'No items in the return box.',
    articlesInReturnBox: 'article(s) in return box',
    totalSalesValue: 'Total sales value',
    createShipment: 'Create shipment',
    destroy: 'Destroy',
    processReturn: 'process?',
    processedReturn: '- processed',
    productsFromOrder: 'Products from order',
    noItemsKnown: 'No items known',
    dropshipRetourQr: 'This is a dropship return. Upload the QR code once the customer has shared it.',
    uploadQrCode: 'Upload QR code',
    processedOn: 'Processed on',
    processing: 'Processing',
    quantity: 'Quantity',
    inspectionStatus: 'Status',
    processReturnBtn: 'Process',
    viewReturn: 'View',
    close: 'Close',
    goBack: 'Cancel',
    yesProcessReturn: 'Yes, process return',
    createShipmentFor: 'Create shipment for',
    destroyItemsFor: 'Destroy items for',
    warningIrreversible: 'Warning: this action cannot be undone.',
    createShipmentDescription: 'A return shipment will be created for all unsellable items.',
    destroyDescription: 'All unsellable items will be destroyed.',
    yesCreateShipment: 'Yes, create shipment',
    yesDestroy: 'Yes, destroy',
    registerReturnTitle: 'Register return',
    orderNumber: 'Order number',
    customerName: 'Customer name',
    email: 'Email',
    ffmClient: 'FFM client (store)',
    returnType: 'Return type',
    ownStock: 'Own stock',
    dropship: 'Dropship',
    returnReason: 'Return reason',
    selectReason: 'Select reason',
    damagedProduct: 'Damaged product',
    wrongProduct: 'Wrong product',
    notAsDescribed: 'Not as described',
    changedMind: 'Changed mind',
    deliveryComplaint: 'Delivery complaint',
    returnToSupplier: 'Return to supplier',
    other: 'Other',
    explanation: 'Explanation (optional)',
    explanationPlaceholder: 'Describe the reason...',
    statusRegistered: 'Registered',
    statusWaitingQr: 'Waiting for QR',
    statusQrReceived: 'QR received',
    statusReturned: 'Returned',
    statusReceived: 'Received',
    statusProcessed: 'Processed',
    qrRequired: 'QR required',
    qrReceived: 'QR received',
    unknown: 'Unknown',
    emailCopied: 'Email copied',
    nameCopied: 'Name copied',
    orderNumberCopied: 'Order number copied',
    eanCopied: 'EAN copied',
    copyEmail: 'Copy email',
    copyName: 'Copy name',
    copyOrderNumber: 'Copy order number',
    copyEan: 'Copy EAN',
    inspectionReturnReceived: 'Return received in good condition',
    inspectionExchangeProduct: 'Exchange product',
    inspectionNotMeetConditions: 'Return does not meet conditions',
    inspectionRepairProduct: 'Product received for repair',
    inspectionCustomerKeeps: 'Customer keeps product, credit paid',
    inspectionStillApproved: 'Still approved',
    inspectionReturnToSupplier: 'Return to supplier',
    settingsSubtitle: 'Manage your account and system settings',
    settingsSelectInstallation: 'Select an installation to manage settings',
    warehouseTab: 'Warehouse',
    warehouseTitle: 'Warehouse Address',
    warehouseSubtitle: 'This address is used as the recipient for return labels',
    warehouseName: 'Company name',
    warehouseNamePlaceholder: 'e.g. Dropsyncr Warehouse',
    warehouseEmail: 'Email',
    warehouseEmailPlaceholder: 'warehouse@example.com',
    warehousePhone: 'Phone number',
    warehousePhonePlaceholder: '+31 6 12345678',
    warehouseAddressSection: 'Address',
    warehouseStreet: 'Street',
    warehouseStreetPlaceholder: 'Warehouse Street',
    warehouseHouseNumber: 'House number',
    warehousePostalCode: 'Postal code',
    warehouseCity: 'City',
    warehouseCityPlaceholder: 'Amsterdam',
    warehouseCountry: 'Country',
    warehouseSaved: 'Warehouse address saved',
    warehouseSaveError: 'Could not save warehouse address',
    save: 'Save',
    delete: 'Delete',
    locationManagement: 'Location Management',
    locationManagementSubtitle: 'Manage warehouse locations',
    newLocation: 'New location',
    totalRows: 'Total Rows',
    totalSections: 'Total Sections',
    totalCases: 'Total Cases',
    totalPallets: 'Total Pallet Locations',
    searchLocationCode: 'Search by location code...',
    locationOverview: 'Location overview',
    locationOverviewSubtitle: 'Hierarchical overview of all warehouse locations',
    noLocationsFound: 'No locations found',
    noLocationsYet: 'No locations created yet',
    row: 'Row',
    section: 'Section',
    case: 'Case',
    pallet: 'Pallet location',
    inactive: 'Inactive',
    deactivate: 'Deactivate',
    activate: 'Activate',
    locationDeleted: 'Location deleted',
    locationActivated: 'Location activated',
    locationDeactivated: 'Location deactivated',
    errorLoadingLocations: 'Could not load locations',
    errorUpdatingLocation: 'Could not update location',
    errorDeletingLocation: 'Could not delete location',
    errorCreatingLocation: 'Could not create location',
    locationCreated: 'Location created',
    locationsCreated: 'locations created',
    locationType: 'Location type',
    parentRow: 'Parent row',
    parentSection: 'Parent section',
    parentCase: 'Parent case',
    selectRow: 'Select a row',
    selectSection: 'Select a section',
    selectCase: 'Select a case',
    locationCode: 'Location code',
    locationCodeRequired: 'Please enter a location code',
    parentLocationRequired: 'Please select a parent location',
    newLocationSubtitle: 'Create a new warehouse location',
    create: 'Create',
    locationCodeRowPlaceholder: 'e.g. A',
    locationCodeSectionPlaceholder: 'e.g. A-01',
    locationCodeCasePlaceholder: 'e.g. A-01-1',
    locationCodePalletPlaceholder: 'e.g. A-01-1-P1',
    bulkCreate: 'Bulk create',
    bulkCreateSubtitle: 'Create multiple rows, sections, cases and pallet locations at once',
    startCode: 'Start code',
    amount: 'Amount',
    perRow: 'per row',
    perSection: 'per section',
    perCase: 'per case',
    preview: 'Preview',
    rows: 'Rows',
    upTo: 'to',
    exampleSection: 'Example section',
    exampleCase: 'Example case',
    examplePallet: 'Example pallet location',
    locationsLower: 'locations',
    printBarcode: 'Print barcode',
    printAllBarcodes: 'Print all barcodes in row',
    arrowUpdated: 'Arrow direction updated',
    arrowUp: 'Arrow up',
    arrowDown: 'Arrow down',
    arrowNone: 'No arrow',
    productManagement: 'Product Management',
    productManagementSubtitle: 'Manage products and product information',
    newProduct: 'New product',
    totalProducts: 'Total products',
    active: 'Active',
    archived: 'Archived',
    products: 'Products',
    productsFound: 'products found',
    photo: 'Photo',
    eanCode: 'EAN code',
    productName: 'Product name',
    brand: 'Brand',
    sizeCategory: 'Size category',
    selectSizeCategory: 'Select size category',
    purchasePrice: 'Purchase price',
    dimensionsOptional: 'Dimensions & weight (optional)',
    noProductsFound: 'No products found',
    productCreated: 'Product created',
    productUpdated: 'Product updated',
    productArchived: 'Product archived',
    productRestored: 'Product restored',
    productDeleted: 'Product deleted',
    errorLoadingProducts: 'Could not load products',
    errorCreatingProduct: 'Could not create product',
    errorUpdatingProduct: 'Could not update product',
    errorDeletingProduct: 'Could not delete product',
    productNameRequired: 'Product name is required',
    selectInstallationFirst: 'Please select an installation first',
    newProductSubtitle: 'Add a new product to the catalogue',
    editProduct: 'Edit product',
    archive: 'Archive',
    restore: 'Restore',
    edit: 'Edit',
    searchProductEanClient: 'Search by product name, EAN or client...',
    totalValue: 'Total value',
    openOrders: 'Open orders',
    needsPicking: 'Needs picking',
    expiringTomorrow: 'Expiring tomorrow',
    processed: 'Processed',
    receivedAtDate: 'Arrival date (optional)',
  },
  nl: {
    loading: 'Laden...',
    orderManagement: 'ORDER MANAGEMENT',
    system: 'SYSTEEM',
    administrativeSection: 'ADMINISTRATIEF',
    orders: 'Bestellingen',
    tracking: 'Tracking',
    labels: 'Labels',
    shipments: 'Shipments',
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
    totalRevenueAllChannels: 'Totale omzet - alle kanalen',
    revenue: 'Omzet',
    purchaseCosts: 'Inkoopkosten',
    advertisingCostsLabel: 'Advertentiekosten',
    fulfilmentOnlyRevenue: 'Fulfilment heeft alleen omzet - geen kosten hier',
    selectPeriod: 'Selecteer periode',
    dashboardSubtitle: 'Overzicht van je belangrijkste metrics',
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
    returns: 'Retouren',
    apply: 'Toepassen',
    returnsSubtitle: 'Overzicht van alle aangemelde retouren',
    returnsSelectInstallation: 'Selecteer eerst een installatie om retouren te bekijken',
    openReturns: 'Openstaande retouren',
    processedThisMonth: 'Verwerkt deze maand',
    waitingForQr: 'Wachten op QR',
    inReturnBox: 'In retourbox',
    openReturnsTab: 'Openstaande retouren',
    processedReturnsTab: 'Verwerkte retouren',
    returnBoxTab: 'Retourbox',
    searchReturns: 'Zoek op retournummer, RMA, ordernummer of klantnaam...',
    registerReturn: 'Retour aanmelden',
    noOpenReturns: 'Geen openstaande retouren gevonden.',
    noProcessedReturns: 'Geen verwerkte retouren gevonden.',
    noReturnBoxItems: 'Geen artikelen in de retourbox.',
    articlesInReturnBox: 'artikel(en) in retourbox',
    totalSalesValue: 'Totale verkoopwaarde',
    createShipment: 'Zending aanmaken',
    destroy: 'Vernietigen',
    processReturn: 'verwerken?',
    processedReturn: '- verwerkt',
    productsFromOrder: 'Producten uit order',
    noItemsKnown: 'Geen artikelen bekend',
    dropshipRetourQr: 'Dit is een dropship retour. Upload de QR code zodra de klant die heeft gedeeld.',
    uploadQrCode: 'QR code uploaden',
    processedOn: 'Verwerkt op',
    processing: 'Verwerking',
    quantity: 'Aantal',
    inspectionStatus: 'Status',
    processReturnBtn: 'Verwerk',
    viewReturn: 'Bekijk',
    close: 'Sluiten',
    goBack: 'Annuleren',
    yesProcessReturn: 'Ja, behandel retour',
    createShipmentFor: 'Zending aanmaken voor',
    destroyItemsFor: 'Artikelen vernietigen voor',
    warningIrreversible: 'Let op: deze actie kan niet ongedaan worden gemaakt.',
    createShipmentDescription: 'Er wordt een retourzending aangemaakt voor alle onverkoopbare artikelen.',
    destroyDescription: 'Alle onverkoopbare artikelen worden vernietigd.',
    yesCreateShipment: 'Ja, zending aanmaken',
    yesDestroy: 'Ja, vernietigen',
    registerReturnTitle: 'Retour aanmelden',
    orderNumber: 'Ordernummer',
    customerName: 'Klantnaam',
    email: 'E-mail',
    ffmClient: 'FFM klant (store)',
    returnType: 'Type retour',
    ownStock: 'Eigen voorraad',
    dropship: 'Dropship',
    returnReason: 'Retour reden',
    selectReason: 'Selecteer reden',
    damagedProduct: 'Beschadigd product',
    wrongProduct: 'Verkeerd product',
    notAsDescribed: 'Niet zoals beschreven',
    changedMind: 'Van gedachten veranderd',
    deliveryComplaint: 'Klacht over bezorging',
    returnToSupplier: 'Retour naar leverancier',
    other: 'Anders',
    explanation: 'Toelichting (optioneel)',
    explanationPlaceholder: 'Beschrijf de reden...',
    statusRegistered: 'Aangemeld',
    statusWaitingQr: 'Wacht op QR',
    statusQrReceived: 'QR ontvangen',
    statusReturned: 'Teruggestuurd',
    statusReceived: 'Ontvangen',
    statusProcessed: 'Verwerkt',
    qrRequired: 'QR vereist',
    qrReceived: 'QR ontvangen',
    unknown: 'Onbekend',
    emailCopied: 'E-mail gekopieerd',
    nameCopied: 'Naam gekopieerd',
    orderNumberCopied: 'Ordernummer gekopieerd',
    eanCopied: 'EAN gekopieerd',
    copyEmail: 'E-mail kopieren',
    copyName: 'Naam kopieren',
    copyOrderNumber: 'Ordernummer kopieren',
    copyEan: 'EAN kopieren',
    inspectionReturnReceived: 'Retour goed ontvangen',
    inspectionExchangeProduct: 'Omruiling product',
    inspectionNotMeetConditions: 'Retour voldoet niet aan voorwaarden',
    inspectionRepairProduct: 'Product ter reparatie ontvangen',
    inspectionCustomerKeeps: 'Klant houdt product, tegoed uitbetaald',
    inspectionStillApproved: 'Alsnog akkoord',
    inspectionReturnToSupplier: 'Retour naar leverancier',
    settingsSubtitle: 'Beheer je account en systeeminstellingen',
    settingsSelectInstallation: 'Selecteer een installatie om instellingen te beheren',
    warehouseTab: 'Magazijn',
    warehouseTitle: 'Magazijnadres',
    warehouseSubtitle: 'Dit adres wordt gebruikt als ontvanger voor retourlabels',
    warehouseName: 'Bedrijfsnaam',
    warehouseNamePlaceholder: 'bijv. Dropsyncr Warehouse',
    warehouseEmail: 'E-mail',
    warehouseEmailPlaceholder: 'magazijn@example.com',
    warehousePhone: 'Telefoonnummer',
    warehousePhonePlaceholder: '+31 6 12345678',
    warehouseAddressSection: 'Adres',
    warehouseStreet: 'Straat',
    warehouseStreetPlaceholder: 'Magazijnstraat',
    warehouseHouseNumber: 'Huisnummer',
    warehousePostalCode: 'Postcode',
    warehouseCity: 'Stad',
    warehouseCityPlaceholder: 'Amsterdam',
    warehouseCountry: 'Land',
    warehouseSaved: 'Magazijnadres opgeslagen',
    warehouseSaveError: 'Kon magazijnadres niet opslaan',
    save: 'Opslaan',
    delete: 'Verwijderen',
    locationManagement: 'Locatiebeheer',
    locationManagementSubtitle: 'Beheer warehouse locaties',
    newLocation: 'Nieuwe locatie',
    totalRows: 'Totaal Rijen',
    totalSections: 'Totaal Secties',
    totalCases: 'Totaal Cases',
    totalPallets: 'Totaal Palletplaatsen',
    searchLocationCode: 'Zoek op locatiecode...',
    locationOverview: 'Locatieoverzicht',
    locationOverviewSubtitle: 'Hierarchisch overzicht van alle warehouse locaties',
    noLocationsFound: 'Geen locaties gevonden',
    noLocationsYet: 'Nog geen locaties aangemaakt',
    row: 'Rij',
    section: 'Sectie',
    case: 'Case',
    pallet: 'Palletplaats',
    inactive: 'Inactief',
    deactivate: 'Deactiveren',
    activate: 'Activeren',
    locationDeleted: 'Locatie verwijderd',
    locationActivated: 'Locatie geactiveerd',
    locationDeactivated: 'Locatie gedeactiveerd',
    errorLoadingLocations: 'Kon locaties niet laden',
    errorUpdatingLocation: 'Kon locatie niet bijwerken',
    errorDeletingLocation: 'Kon locatie niet verwijderen',
    errorCreatingLocation: 'Kon locatie niet aanmaken',
    locationCreated: 'Locatie aangemaakt',
    locationsCreated: 'locaties aangemaakt',
    locationType: 'Type locatie',
    parentRow: 'Bovenliggende rij',
    parentSection: 'Bovenliggende sectie',
    parentCase: 'Bovenliggende case',
    selectRow: 'Selecteer een rij',
    selectSection: 'Selecteer een sectie',
    selectCase: 'Selecteer een case',
    locationCode: 'Locatiecode',
    locationCodeRequired: 'Voer een locatiecode in',
    parentLocationRequired: 'Selecteer een bovenliggende locatie',
    newLocationSubtitle: 'Maak een nieuwe warehouse locatie aan',
    create: 'Aanmaken',
    locationCodeRowPlaceholder: 'bijv. A',
    locationCodeSectionPlaceholder: 'bijv. A-01',
    locationCodeCasePlaceholder: 'bijv. A-01-1',
    locationCodePalletPlaceholder: 'bijv. A-01-1-P1',
    bulkCreate: 'Bulk aanmaken',
    bulkCreateSubtitle: 'Maak meerdere rijen, secties, cases en palletplaatsen tegelijk aan',
    startCode: 'Startcode',
    amount: 'Aantal',
    perRow: 'per rij',
    perSection: 'per sectie',
    perCase: 'per case',
    preview: 'Voorbeeld',
    rows: 'Rijen',
    upTo: 't/m',
    exampleSection: 'Voorbeeld sectie',
    exampleCase: 'Voorbeeld case',
    examplePallet: 'Voorbeeld palletplaats',
    locationsLower: 'locaties',
    printBarcode: 'Barcode printen',
    printAllBarcodes: 'Alle barcodes van rij printen',
    arrowUpdated: 'Pijlrichting bijgewerkt',
    arrowUp: 'Pijl omhoog',
    arrowDown: 'Pijl omlaag',
    arrowNone: 'Geen pijl',
    productManagement: 'Productbeheer',
    productManagementSubtitle: 'Beheer producten en productinformatie',
    newProduct: 'Nieuw product',
    totalProducts: 'Totaal producten',
    active: 'Actief',
    archived: 'Gearchiveerd',
    products: 'Producten',
    productsFound: 'producten gevonden',
    photo: 'Foto',
    eanCode: 'EAN code',
    productName: 'Productnaam',
    brand: 'Merk',
    sizeCategory: 'Maatcategorie',
    selectSizeCategory: 'Selecteer maatcategorie',
    purchasePrice: 'Inkoopprijs',
    dimensionsOptional: 'Afmetingen & gewicht (optioneel)',
    noProductsFound: 'Geen producten gevonden',
    productCreated: 'Product aangemaakt',
    productUpdated: 'Product bijgewerkt',
    productArchived: 'Product gearchiveerd',
    productRestored: 'Product hersteld',
    productDeleted: 'Product verwijderd',
    errorLoadingProducts: 'Kon producten niet laden',
    errorCreatingProduct: 'Kon product niet aanmaken',
    errorUpdatingProduct: 'Kon product niet bijwerken',
    errorDeletingProduct: 'Kon product niet verwijderen',
    productNameRequired: 'Productnaam is verplicht',
    selectInstallationFirst: 'Selecteer eerst een installatie',
    newProductSubtitle: 'Voeg een nieuw product toe aan de catalogus',
    editProduct: 'Product bewerken',
    archive: 'Archiveren',
    restore: 'Herstellen',
    edit: 'Bewerken',
    searchProductEanClient: 'Zoek op productnaam, EAN of klant...',
    totalValue: 'Totale waarde',
    openOrders: 'Open orders',
    needsPicking: 'Te picken',
    expiringTomorrow: 'Verloopt morgen',
    processed: 'Verwerkt',
    receivedAtDate: 'Binnenkomst datum (optioneel)',
  },
  de: {
    loading: 'Ladt...',
    orderManagement: 'BESTELLMANAGEMENT',
    system: 'SYSTEM',
    administrativeSection: 'ADMINISTRATION',
    orders: 'Bestellungen',
    tracking: 'Sendungsverfolgung',
    labels: 'Etiketten',
    shipments: 'Sendungen',
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
    klkSubtitle: 'Ubersicht aller Umsatze und Kosten pro Verkaufskanal',
    totalRevenue: 'Gesamtumsatz',
    totalPurchaseCosts: 'Gesamteinkaufskosten',
    grossProfit: 'Bruttogewinn',
    advertisingCosts: 'Werbekosten',
    vsPreviousPeriod: 'vs. vorheriger Zeitraum',
    purchaseCostsAndCogs: 'Einkaufskosten + COGS',
    margin: 'Marge',
    shopifyChannels: 'Shopify-Kanale',
    totalRevenueAllChannels: 'Gesamtumsatz - alle Kanale',
    revenue: 'Umsatz',
    purchaseCosts: 'Einkaufskosten',
    advertisingCostsLabel: 'Werbekosten',
    fulfilmentOnlyRevenue: 'Fulfilment hat nur Umsatz - keine Kosten hier',
    selectPeriod: 'Zeitraum auswahlen',
    dashboardSubtitle: 'Ubersicht Ihrer wichtigsten Kennzahlen',
    totalOrders: 'Gesamtbestellungen',
    pendingOrders: 'Offene Bestellungen',
    processedToday: 'Heute verarbeitet',
    vsLastPeriod: 'vs. letzter Zeitraum',
    stillToShip: 'Noch zu versenden',
    labelsPrinted: 'Etiketten gedruckt & versendet',
    revenueOrdersOverview: 'Umsatz & Bestellungen Ubersicht',
    recentActivity: 'Letzte Aktivitat',
    today: 'Heute',
    yesterday: 'Gestern',
    last7days: 'Letzte 7 Tage',
    lastMonth: 'Letzter Monat',
    currentMonth: 'Aktueller Monat',
    thisYear: 'Dieses Jahr',
    custom: 'Benutzerdefiniert',
    choosePeriod: 'Zeitraum wahlen',
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
    itemsSelected: 'Artikel ausgewahlt',
    printEanBarcode: 'EAN-Barcode drucken',
    deselectAll: 'Alle abwahlen',
    product: 'Artikel',
    locations: 'Standort(e)',
    client: 'Kunde',
    registered: 'Angemeldet',
    inProgress: 'In Bearb.',
    reserved: 'Reserviert',
    available: 'Verfugbar',
    total: 'Gesamt',
    noItemsFound: 'Keine Artikel gefunden',
    articles: 'Artikel',
    status: 'Status',
    returns: 'Retouren',
    apply: 'Anwenden',
    returnsSubtitle: 'Ubersicht aller registrierten Retouren',
    returnsSelectInstallation: 'Wahlen Sie eine Installation aus, um Retouren anzuzeigen',
    openReturns: 'Offene Retouren',
    processedThisMonth: 'Diesen Monat verarbeitet',
    waitingForQr: 'Warten auf QR',
    inReturnBox: 'In Retourenbox',
    openReturnsTab: 'Offene Retouren',
    processedReturnsTab: 'Verarbeitete Retouren',
    returnBoxTab: 'Retourenbox',
    searchReturns: 'Suche nach Retouren-Nr., RMA, Bestellnummer oder Kunde...',
    registerReturn: 'Retoure anmelden',
    noOpenReturns: 'Keine offenen Retouren gefunden.',
    noProcessedReturns: 'Keine verarbeiteten Retouren gefunden.',
    noReturnBoxItems: 'Keine Artikel in der Retourenbox.',
    articlesInReturnBox: 'Artikel in Retourenbox',
    totalSalesValue: 'Gesamtverkaufswert',
    createShipment: 'Sendung erstellen',
    destroy: 'Vernichten',
    processReturn: 'verarbeiten?',
    processedReturn: '- verarbeitet',
    productsFromOrder: 'Produkte aus Bestellung',
    noItemsKnown: 'Keine Artikel bekannt',
    dropshipRetourQr: 'Dies ist eine Dropship-Retoure. Laden Sie den QR-Code hoch, sobald der Kunde ihn geteilt hat.',
    uploadQrCode: 'QR-Code hochladen',
    processedOn: 'Verarbeitet am',
    processing: 'Verarbeitung',
    quantity: 'Menge',
    inspectionStatus: 'Status',
    processReturnBtn: 'Verarbeiten',
    viewReturn: 'Anzeigen',
    close: 'Schliessen',
    goBack: 'Abbrechen',
    yesProcessReturn: 'Ja, Retoure bearbeiten',
    createShipmentFor: 'Sendung erstellen fur',
    destroyItemsFor: 'Artikel vernichten fur',
    warningIrreversible: 'Achtung: Diese Aktion kann nicht ruckgangig gemacht werden.',
    createShipmentDescription: 'Eine Rucksendung wird fur alle unverkauflichen Artikel erstellt.',
    destroyDescription: 'Alle unverkauflichen Artikel werden vernichtet.',
    yesCreateShipment: 'Ja, Sendung erstellen',
    yesDestroy: 'Ja, vernichten',
    registerReturnTitle: 'Retoure anmelden',
    orderNumber: 'Bestellnummer',
    customerName: 'Kundenname',
    email: 'E-Mail',
    ffmClient: 'FFM-Kunde (Store)',
    returnType: 'Retourentyp',
    ownStock: 'Eigener Bestand',
    dropship: 'Dropship',
    returnReason: 'Retourengrund',
    selectReason: 'Grund auswahlen',
    damagedProduct: 'Beschadigtes Produkt',
    wrongProduct: 'Falsches Produkt',
    notAsDescribed: 'Nicht wie beschrieben',
    changedMind: 'Meinung geandert',
    deliveryComplaint: 'Lieferbeschwerden',
    returnToSupplier: 'Rucksendung an Lieferanten',
    other: 'Sonstiges',
    explanation: 'Erlauterung (optional)',
    explanationPlaceholder: 'Grund beschreiben...',
    statusRegistered: 'Angemeldet',
    statusWaitingQr: 'Warten auf QR',
    statusQrReceived: 'QR erhalten',
    statusReturned: 'Zuruckgesendet',
    statusReceived: 'Erhalten',
    statusProcessed: 'Verarbeitet',
    qrRequired: 'QR erforderlich',
    qrReceived: 'QR erhalten',
    unknown: 'Unbekannt',
    emailCopied: 'E-Mail kopiert',
    nameCopied: 'Name kopiert',
    orderNumberCopied: 'Bestellnummer kopiert',
    eanCopied: 'EAN kopiert',
    copyEmail: 'E-Mail kopieren',
    copyName: 'Name kopieren',
    copyOrderNumber: 'Bestellnummer kopieren',
    copyEan: 'EAN kopieren',
    inspectionReturnReceived: 'Retoure gut erhalten',
    inspectionExchangeProduct: 'Umtauschprodukt',
    inspectionNotMeetConditions: 'Retoure erfullt nicht die Bedingungen',
    inspectionRepairProduct: 'Produkt zur Reparatur erhalten',
    inspectionCustomerKeeps: 'Kunde behalt Produkt, Guthaben ausgezahlt',
    inspectionStillApproved: 'Trotzdem genehmigt',
    inspectionReturnToSupplier: 'Rucksendung an Lieferanten',
    settingsSubtitle: 'Verwalten Sie Ihr Konto und Systemeinstellungen',
    settingsSelectInstallation: 'Wahlen Sie eine Installation aus',
    warehouseTab: 'Lager',
    warehouseTitle: 'Lageradresse',
    warehouseSubtitle: 'Diese Adresse wird als Empfanger fur Retourenetiketten verwendet',
    warehouseName: 'Firmenname',
    warehouseNamePlaceholder: 'z.B. Dropsyncr Lager',
    warehouseEmail: 'E-Mail',
    warehouseEmailPlaceholder: 'lager@example.com',
    warehousePhone: 'Telefonnummer',
    warehousePhonePlaceholder: '+49 30 12345678',
    warehouseAddressSection: 'Adresse',
    warehouseStreet: 'Strasse',
    warehouseStreetPlaceholder: 'Lagerstrasse',
    warehouseHouseNumber: 'Hausnummer',
    warehousePostalCode: 'Postleitzahl',
    warehouseCity: 'Stadt',
    warehouseCityPlaceholder: 'Berlin',
    warehouseCountry: 'Land',
    warehouseSaved: 'Lageradresse gespeichert',
    warehouseSaveError: 'Lageradresse konnte nicht gespeichert werden',
    save: 'Speichern',
    delete: 'Loschen',
    locationManagement: 'Standortverwaltung',
    locationManagementSubtitle: 'Lagerstandorte verwalten',
    newLocation: 'Neuer Standort',
    totalRows: 'Gesamt Reihen',
    totalSections: 'Gesamt Sektionen',
    totalCases: 'Gesamt Cases',
    totalPallets: 'Gesamt Palettenplatze',
    searchLocationCode: 'Nach Standortcode suchen...',
    locationOverview: 'Standortubersicht',
    locationOverviewSubtitle: 'Hierarchische Ubersicht aller Lagerstandorte',
    noLocationsFound: 'Keine Standorte gefunden',
    noLocationsYet: 'Noch keine Standorte erstellt',
    row: 'Reihe',
    section: 'Sektion',
    case: 'Case',
    pallet: 'Palettenplatz',
    inactive: 'Inaktiv',
    deactivate: 'Deaktivieren',
    activate: 'Aktivieren',
    locationDeleted: 'Standort geloscht',
    locationActivated: 'Standort aktiviert',
    locationDeactivated: 'Standort deaktiviert',
    errorLoadingLocations: 'Standorte konnten nicht geladen werden',
    errorUpdatingLocation: 'Standort konnte nicht aktualisiert werden',
    errorDeletingLocation: 'Standort konnte nicht geloscht werden',
    errorCreatingLocation: 'Standort konnte nicht erstellt werden',
    locationCreated: 'Standort erstellt',
    locationsCreated: 'Standorte erstellt',
    locationType: 'Standorttyp',
    parentRow: 'Ubergeordnete Reihe',
    parentSection: 'Ubergeordnete Sektion',
    parentCase: 'Ubergeordnete Case',
    selectRow: 'Reihe auswahlen',
    selectSection: 'Sektion auswahlen',
    selectCase: 'Case auswahlen',
    locationCode: 'Standortcode',
    locationCodeRequired: 'Bitte einen Standortcode eingeben',
    parentLocationRequired: 'Bitte einen ubergeordneten Standort auswahlen',
    newLocationSubtitle: 'Neuen Lagerstandort erstellen',
    create: 'Erstellen',
    locationCodeRowPlaceholder: 'z.B. A',
    locationCodeSectionPlaceholder: 'z.B. A-01',
    locationCodeCasePlaceholder: 'z.B. A-01-1',
    locationCodePalletPlaceholder: 'z.B. A-01-1-P1',
    bulkCreate: 'Massenanlage',
    bulkCreateSubtitle: 'Mehrere Reihen, Sektionen, Cases und Palettenplatze auf einmal erstellen',
    startCode: 'Startcode',
    amount: 'Anzahl',
    perRow: 'pro Reihe',
    perSection: 'pro Sektion',
    perCase: 'pro Case',
    preview: 'Vorschau',
    rows: 'Reihen',
    upTo: 'bis',
    exampleSection: 'Beispiel Sektion',
    exampleCase: 'Beispiel Case',
    examplePallet: 'Beispiel Palettenplatz',
    locationsLower: 'Standorte',
    printBarcode: 'Barcode drucken',
    printAllBarcodes: 'Alle Barcodes der Reihe drucken',
    arrowUpdated: 'Pfeilrichtung aktualisiert',
    arrowUp: 'Pfeil nach oben',
    arrowDown: 'Pfeil nach unten',
    arrowNone: 'Kein Pfeil',
    productManagement: 'Produktverwaltung',
    productManagementSubtitle: 'Produkte und Produktinformationen verwalten',
    newProduct: 'Neues Produkt',
    totalProducts: 'Produkte gesamt',
    active: 'Aktiv',
    archived: 'Archiviert',
    products: 'Produkte',
    productsFound: 'Produkte gefunden',
    photo: 'Foto',
    eanCode: 'EAN-Code',
    productName: 'Produktname',
    brand: 'Marke',
    sizeCategory: 'Grosskategorie',
    selectSizeCategory: 'Grosskategorie auswahlen',
    purchasePrice: 'Einkaufspreis',
    dimensionsOptional: 'Abmessungen & Gewicht (optional)',
    noProductsFound: 'Keine Produkte gefunden',
    productCreated: 'Produkt erstellt',
    productUpdated: 'Produkt aktualisiert',
    productArchived: 'Produkt archiviert',
    productRestored: 'Produkt wiederhergestellt',
    productDeleted: 'Produkt geloscht',
    errorLoadingProducts: 'Produkte konnten nicht geladen werden',
    errorCreatingProduct: 'Produkt konnte nicht erstellt werden',
    errorUpdatingProduct: 'Produkt konnte nicht aktualisiert werden',
    errorDeletingProduct: 'Produkt konnte nicht geloscht werden',
    productNameRequired: 'Produktname ist erforderlich',
    selectInstallationFirst: 'Bitte zuerst eine Installation auswahlen',
    newProductSubtitle: 'Neues Produkt zum Katalog hinzufugen',
    editProduct: 'Produkt bearbeiten',
    archive: 'Archivieren',
    restore: 'Wiederherstellen',
    edit: 'Bearbeiten',
    searchProductEanClient: 'Nach Produktname, EAN oder Kunde suchen...',
    totalValue: 'Gesamtwert',
    openOrders: 'Offene Bestellungen',
    needsPicking: 'Zu picken',
    expiringTomorrow: 'Lauft morgen ab',
    processed: 'Verarbeitet',
    receivedAtDate: 'Eingangsdatum (optional)',
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
    t: (key: TranslationKey) => dictionaries[language][key] ?? dictionaries['en'][key] ?? key,
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