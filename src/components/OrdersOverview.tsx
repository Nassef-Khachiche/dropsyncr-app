import { useState, useEffect, Fragment } from 'react';
import { api } from '../services/api';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { useLanguage } from '../contexts/LanguageContext';
import * as XLSX from 'xlsx';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from './ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { 
  Search, 
  Download, 
  Eye,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  MapPin,
  Calendar,
  ShoppingCart,
  Euro,
  Package,
  Truck,
  ImageIcon,
  Weight,
  RotateCcw,
  ArrowLeftRight,
  ShoppingBag,
  PackageCheck,
  AlertTriangle,
  Star,
  ClipboardList,
  CheckSquare,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const dhlLogo = new URL('../assets/dhl-logo.png', import.meta.url).href;
const dpdLogo = new URL('../assets/dpd-logo.png', import.meta.url).href;
const wegrowLogo = new URL('../assets/wegrow-logo.jpg', import.meta.url).href;
const postnlLogo = new URL('../assets/postnl-logo.png', import.meta.url).href;
const bpostLogo = new URL('../assets/bpost-logo.png', import.meta.url).href;
const bolLogo = new URL('../assets/bol-vvb.png', import.meta.url).href;

interface OrdersOverviewProps {
  activeProfile: string;
  isGlobalAdmin?: boolean;
}

interface CarrierContract {
  id: number | string;
  carrierType: string;
  contractName: string;
  active: boolean;
  credentials?: Record<string, any>;
}

interface BolDeliveryOption {
  shippingLabelOfferId?: string;
  transporterCode?: string;
  recommended?: boolean;
  handoverDetails?: {
    earliestHandoverDateTime?: string;
    latestHandoverDateTime?: string;
    collectionMethod?: string;
  };
}

const VVB_CONTRACT_ID = 'vvb';

const wegrowCarrierOptions = [
  { id: 'dhl-nl', name: 'DHL NL', logo: dhlLogo },
  { id: 'dhl-for-you-envelop', name: 'DHL For You - Envelop', logo: dhlLogo },
  { id: 'dhl-for-you-brievenbuspakje', name: 'DHL For You Brievenbuspakje', logo: dhlLogo },
  { id: 'dhl-for-you', name: 'DHL For You', logo: dhlLogo },
  { id: 'postnl-nederland-brievenbuspakketje-0-2kg', name: 'PostNL Brievenbuspakketje 0-2kg', logo: postnlLogo },
  { id: 'postnl-belgie-standaard-0-23kg', name: 'PostNL België Standaard 0-23kg', logo: postnlLogo },
];

const getWegrowCarrierOptionById = (carrierId: string) => {
  const normalizedCarrierId = String(carrierId || '').trim().toLowerCase();
  return wegrowCarrierOptions.find((option) => option.id === normalizedCarrierId) || null;
};

const shippingMethodDropdownOptions = wegrowCarrierOptions.map((option) => ({
  value: `wegrow-${option.id}`,
  label: option.name,
  logo: option.logo,
}));

const MANUAL_REVIEW_VALUES = ['handmatig controleren', 'handmatig_controleren'];

const manualShippingOverrides = [
  {
    value: 'WG PostNL - NEDERLAND | PostNL Standaard 0-23kg',
    label: 'WG PostNL - NEDERLAND | PostNL Standaard 0-23kg',
  },
  {
    value: 'WGW NL | DHL For You',
    label: 'WGW NL | DHL For You',
  },
];

const isManualShippingOverride = (value: string) => (
  manualShippingOverrides.some((option) => option.value === value)
);

const isLikelyUrl = (value: string) => /^https?:\/\//i.test(value);

const isLikelyPdfBase64 = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (normalized.startsWith('data:application/pdf;base64,')) return true;
  return /^JVBER/i.test(normalized);
};

const extractFirstStringMatch = (input: any, predicate: (value: string) => boolean): string | null => {
  const visited = new Set<any>();

  const walk = (value: any): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return predicate(trimmed) ? trimmed : null;
    }

    if (typeof value !== 'object') return null;
    if (visited.has(value)) return null;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }

    for (const nestedValue of Object.values(value)) {
      const found = walk(nestedValue);
      if (found) return found;
    }

    return null;
  };

  return walk(input);
};

const firstNonEmptyOrderValue = (...values: any[]) => {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return undefined;
};

const toValidDate = (value: any): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveDropOffDateRange = (order: any) => {
  const orderPayload = order?.orderPayload || {};
  const shipmentDetails = orderPayload?.shipmentDetails || order?.shipmentDetails || {};
  const isVvbOrder = Boolean(order?.isVVB) || String(order?.shippingMethod || '').trim().toLowerCase() === 'bol.com';

  const resolveMinDate = (values: any[]) => {
    const parsed = values.map((candidate) => toValidDate(candidate)).filter(Boolean) as Date[];
    if (parsed.length === 0) return null;
    return parsed.reduce((earliest, current) => (
      current.getTime() < earliest.getTime() ? current : earliest
    ));
  };

  const resolveMaxDate = (values: any[]) => {
    const parsed = values.map((candidate) => toValidDate(candidate)).filter(Boolean) as Date[];
    if (parsed.length === 0) return null;
    return parsed.reduce((latest, current) => (
      current.getTime() > latest.getTime() ? current : latest
    ));
  };

  const dropOffEarliestCandidates = [
    order?.earliestDropOffDate,
    orderPayload?.earliestDropOffDate,
    orderPayload?.earliestHandoverDateTime,
    shipmentDetails?.earliestDropOffDate,
    shipmentDetails?.earliestHandoverDateTime,
  ];

  const dropOffLatestCandidates = [
    order?.latestDropOffDate,
    orderPayload?.latestDropOffDate,
    orderPayload?.latestHandoverDateTime,
    shipmentDetails?.latestDropOffDate,
    shipmentDetails?.latestHandoverDateTime,
  ];

  const deliveryEarliestCandidates = [
    order?.earliestDeliveryDate,
    orderPayload?.earliestDeliveryDate,
    orderPayload?.deliveryPromiseStartDate,
    shipmentDetails?.earliestDeliveryDate,
    shipmentDetails?.deliveryPromiseStartDate,
  ];

  const deliveryLatestCandidates = [
    order?.latestDeliveryDate,
    order?.deliveryDate,
    orderPayload?.latestDeliveryDate,
    orderPayload?.deliveryDate,
    orderPayload?.deliveryPromiseEndDate,
    shipmentDetails?.latestDeliveryDate,
    shipmentDetails?.deliveryDate,
    shipmentDetails?.deliveryPromiseEndDate,
  ];

  const dropOffEarliestDate = resolveMinDate(dropOffEarliestCandidates);
  const dropOffLatestDate = resolveMaxDate(dropOffLatestCandidates);
  const deliveryEarliestDate = resolveMinDate(deliveryEarliestCandidates);
  const deliveryLatestDate = resolveMaxDate(deliveryLatestCandidates);

  const earliestDropOffDate = isVvbOrder
    ? (dropOffEarliestDate || deliveryEarliestDate)
    : (deliveryEarliestDate || dropOffEarliestDate);

  const latestDropOffDate = isVvbOrder
    ? (dropOffLatestDate || deliveryLatestDate)
    : (deliveryLatestDate || dropOffLatestDate);

  return {
    earliestDropOffDate,
    latestDropOffDate,
  };
};

const buildOrderLabelPackage = (order: any) => {
  const shipmentDetails = order?.orderPayload?.shipmentDetails || order?.shipmentDetails || order?.shippingAddress || {};
  const shipmentStreet = [
    shipmentDetails?.streetName,
    shipmentDetails?.houseNumber,
    shipmentDetails?.houseNumberExtension,
  ].filter(Boolean).join(' ').trim();

  return {
    id: order.orderNumber || order.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: firstNonEmptyOrderValue(order.customerName, shipmentDetails?.fullName, shipmentDetails?.firstName),
    email: firstNonEmptyOrderValue(order.customerEmail, order.email, shipmentDetails?.email),
    phone: firstNonEmptyOrderValue(order.phone, order.customerPhone, shipmentDetails?.phoneNumber),
    address: firstNonEmptyOrderValue(
      order.address,
      [shipmentStreet, shipmentDetails?.zipCode, shipmentDetails?.city].filter(Boolean).join(', ')
    ),
    country: firstNonEmptyOrderValue(order.country, order.shippingCountry, shipmentDetails?.countryCode) || 'NL',
    street: firstNonEmptyOrderValue(
      order.street,
      order.addressLine1,
      order.shippingStreet,
      shipmentStreet,
      shipmentDetails?.addressLine1,
      shipmentDetails?.street
    ),
    zipCode: firstNonEmptyOrderValue(
      order.zipCode,
      order.postalCode,
      order.shippingZipCode,
      shipmentDetails?.zipCode,
      shipmentDetails?.postalCode
    ),
    city: firstNonEmptyOrderValue(
      order.city,
      order.town,
      order.shippingCity,
      shipmentDetails?.city,
      shipmentDetails?.town
    ),
    shipmentDetails,
  };
};

const getNextWorkday = (date: Date): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  return next;
};

const formatBolDeliveryOptionDateTime = (value?: string) => {
  if (!value) return '-';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';

  return parsed.toLocaleString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const downloadLabelFile = async (url: string, filename = 'label.pdf') => {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noreferrer');
  }
};

export function OrdersOverview({ activeProfile, isGlobalAdmin = false }: OrdersOverviewProps) {
  const ORDERS_PER_PAGE = 50;

  const carrierLogoMap: Record<string, string> = {
    dhl: dhlLogo,
    dpd: dpdLogo,
    wegrow: wegrowLogo,
    postnl: postnlLogo,
    bpost: bpostLogo,
    bol: bolLogo,
  };

  const { t } = useLanguage();

  const isAllStoresSelected = activeProfile === 'all';
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [integrationStoreOptions, setIntegrationStoreOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [allowedIntegrationStoreNames, setAllowedIntegrationStoreNames] = useState<string[]>([]);
  const [allowedIntegrationInstallationIds, setAllowedIntegrationInstallationIds] = useState<number[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [filterFulfillmentType, setFilterFulfillmentType] = useState<string | null>(null);
  const [filterExpiringTomorrow, setFilterExpiringTomorrow] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterKanalen, setFilterKanalen] = useState<string[]>([]);
  const [filterLanden, setFilterLanden] = useState<string[]>([]);
  const [filterVerzendVia, setFilterVerzendVia] = useState<string[]>([]);
  const [filterVvbWindow, setFilterVvbWindow] = useState<'ochtend' | 'avond' | null>(null);
  const [sortField, setSortField] = useState<string>('orderDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pendingFilters, setPendingFilters] = useState<any>(null);
  const [statsOpenOrders, setStatsOpenOrders] = useState(0);
  const [statsNeedsPicking, setStatsNeedsPicking] = useState(0);
  const [statsExpiringTomorrow, setStatsExpiringTomorrow] = useState(0);
  const [statsProcessed, setStatsProcessed] = useState(0);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [showPicklistDialog, setShowPicklistDialog] = useState(false);
  const [picklistData, setPicklistData] = useState<any[]>([]);
  const [loadingPicklist, setLoadingPicklist] = useState(false);
  const [pickingOrders, setPickingOrders] = useState(false);

  // --- Normal label dialog state ---
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelOrder, setLabelOrder] = useState<any | null>(null);
  const [carrierContracts, setCarrierContracts] = useState<CarrierContract[]>([]);
  const [loadingCarriers, setLoadingCarriers] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [selectedWeGrowCarrier, setSelectedWeGrowCarrier] = useState<string>('');
  const [generatingLabel, setGeneratingLabel] = useState(false);
  const [labelPreviewUrl, setLabelPreviewUrl] = useState<string>('');
  const [generatedLabelMeta, setGeneratedLabelMeta] = useState<{
    shipmentId?: string | null;
    trackingCode?: string | null;
    trackingUrl?: string | null;
  } | null>(null);
  const [bolDeliveryOptions, setBolDeliveryOptions] = useState<BolDeliveryOption[]>([]);
  const [bolOrderItems, setBolOrderItems] = useState<Array<{ orderItemId: string; quantity: number }>>([]);
  const [selectedBolDeliveryOptionId, setSelectedBolDeliveryOptionId] = useState<string>('');
  const [loadingBolDeliveryOptions, setLoadingBolDeliveryOptions] = useState(false);

  // --- Return label dialog state ---
  const [showReturnLabelDialog, setShowReturnLabelDialog] = useState(false);
  const [returnLabelOrder, setReturnLabelOrder] = useState<any | null>(null);
  const [selectedReturnContractId, setSelectedReturnContractId] = useState<string>('');
  const [selectedReturnWeGrowCarrier, setSelectedReturnWeGrowCarrier] = useState<string>('');
  const [generatingReturnLabel, setGeneratingReturnLabel] = useState(false);
  const [returnLabelPreviewUrl, setReturnLabelPreviewUrl] = useState<string>('');
  const [generatedReturnLabelMeta, setGeneratedReturnLabelMeta] = useState<{
    shipmentId?: string | null;
    trackingCode?: string | null;
    trackingUrl?: string | null;
  } | null>(null);
  const [warehouseAddress, setWarehouseAddress] = useState<any | null>(null);

  const returnCarrierContracts = carrierContracts.filter(
    (contract) => contract.credentials?.supportsReturns === true
  );

  const [shippingMethodDrafts, setShippingMethodDrafts] = useState<Record<number, string>>({});
  const [savingShippingMethodOrderId, setSavingShippingMethodOrderId] = useState<number | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ customerName: '', address: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);

  useEffect(() => {
    if (activeProfile) {
      loadOrders();
    }
  }, [activeProfile, filterStatus, searchQuery, currentPage, filterFulfillmentType, filterExpiringTomorrow, filterStore, filterVvbWindow]);

  useEffect(() => {
    setCurrentPage(1);
}, [activeProfile, filterStatus, searchQuery, filterFulfillmentType, filterExpiringTomorrow, filterStore]);

  useEffect(() => {
    setFilterStore('all');
  }, [activeProfile]);

  useEffect(() => {
    if (!activeProfile) {
      setCarrierContracts([]);
      return;
    }

    if (activeProfile === 'all') {
      if (allowedIntegrationInstallationIds.length === 0) {
        setCarrierContracts([]);
        return;
      }

      loadCarrierContractsForInstallations(allowedIntegrationInstallationIds);
      return;
    }

    loadCarrierContracts(activeProfile);
  }, [activeProfile, allowedIntegrationInstallationIds]);

  useEffect(() => {
    const loadWarehouse = async () => {
      if (!activeProfile || activeProfile === 'all') return;
      try {
        const data = await api.getWarehouseAddress(activeProfile);
        setWarehouseAddress(data || null);
      } catch {
        setWarehouseAddress(null);
      }
    };
    loadWarehouse();
  }, [activeProfile]);

  useEffect(() => {
    const loadBolDeliveryOptions = async () => {
      if (!showLabelDialog || selectedContractId !== VVB_CONTRACT_ID || !labelOrder) {
        setBolDeliveryOptions([]);
        setBolOrderItems([]);
        setSelectedBolDeliveryOptionId('');
        setLoadingBolDeliveryOptions(false);
        return;
      }

      const installationId = String(
        labelOrder.installation?.id
        ?? labelOrder.installationId
        ?? ''
      ).trim();
      const bolOrderId = String(labelOrder.orderNumber || '').trim();
      const integrationId = labelOrder.integrationId
        ?? labelOrder.integration?.id
        ?? undefined;

      if (!installationId || !bolOrderId) {
        setBolDeliveryOptions([]);
        setSelectedBolDeliveryOptionId('');
        return;
      }

      try {
        setLoadingBolDeliveryOptions(true);
        const optionsResult = await api.getBolDeliveryOptions(installationId, bolOrderId, integrationId);
        const options = Array.isArray(optionsResult.deliveryOptions) ? optionsResult.deliveryOptions : [];

        setBolDeliveryOptions(options);
        setBolOrderItems(Array.isArray(optionsResult.orderItems) ? optionsResult.orderItems : []);

        const defaultOption = options.find((option: BolDeliveryOption) => option?.recommended)
          || optionsResult.selectedDeliveryOption
          || options[0]
          || null;

        setSelectedBolDeliveryOptionId(String(defaultOption?.shippingLabelOfferId || '').trim());
      } catch (error) {
        console.error('Failed to load Bol delivery options:', error);
        setBolDeliveryOptions([]);
        setSelectedBolDeliveryOptionId('');
        toast.error('Kon Bol delivery options niet laden', {
          description: error instanceof Error ? error.message : 'Probeer het opnieuw',
        });
      } finally {
        setLoadingBolDeliveryOptions(false);
      }
    };

    loadBolDeliveryOptions();
  }, [showLabelDialog, selectedContractId, labelOrder]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const [data, integrationsData] = await Promise.all([
        api.getOrders({
          installationId: isAllStoresSelected ? undefined : activeProfile,
          userScoped: isAllStoresSelected,
          status: filterStatus !== 'all' ? filterStatus : undefined,
          search: searchQuery || undefined,
          page: currentPage,
          limit: ORDERS_PER_PAGE,
          fulfillmentType: filterFulfillmentType || undefined,
          expiringTomorrow: filterExpiringTomorrow || undefined,
          storeName: filterStore !== 'all' ? filterStore : undefined,
          vvbWindow: filterVvbWindow || undefined,
        }),
        isAllStoresSelected ? api.getIntegrations(undefined, true) : Promise.resolve(null),
      ]);

      if (integrationsData) {
        const integrationStoreNames = Array.from(
          new Set(
            integrationsData.integrations
              .map((integration: any) => integration.credentials?.shopName)
              .filter((shopName: string | undefined): shopName is string => Boolean(shopName))
          )
        );

        const integrationInstallations = Array.from(
          new Map(
            integrationsData.integrations
              .filter((integration: any) => integration.installation?.id)
              .map((integration: any) => [
                integration.installation.id,
                integration.installation.name || `Store ${integration.installation.id}`,
              ])
          ).entries()
        );

        setAllowedIntegrationStoreNames(integrationStoreNames);
        setAllowedIntegrationInstallationIds(integrationInstallations.map(([id]) => Number(id)));
        setIntegrationStoreOptions(
          integrationStoreNames.map((shopName) => ({ id: shopName, name: shopName }))
        );
      } else {
        setAllowedIntegrationStoreNames([]);
        setAllowedIntegrationInstallationIds([]);
        setIntegrationStoreOptions([]);
      }

      setOrders(data.orders || []);
      setTotalOrders(Number(data.pagination?.total) || 0);
      setTotalPages(Math.max(1, Number(data.pagination?.pages) || 1));
      if (data.stats) {
        setStatsOpenOrders(data.stats.openOrders || 0);
        setStatsNeedsPicking(data.stats.needsPicking || 0);
        setStatsExpiringTomorrow(data.stats.expiringTomorrow || 0);
        setStatsProcessed(data.stats.processed || 0);
      }
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCarrierContracts = async (installationId: string) => {
    try {
      setLoadingCarriers(true);
      const data = await api.getCarriers(installationId);
      const filtered = (data || [])
        .filter((carrier: any) => carrier.active)
        .map((carrier: any) => ({
          id: carrier.id,
          carrierType: carrier.carrierType,
          contractName: carrier.contractName,
          active: carrier.active,
          credentials: carrier.credentials || {},
        }));
      setCarrierContracts(filtered);
    } catch (error) {
      console.error('Failed to load carriers:', error);
    } finally {
      setLoadingCarriers(false);
    }
  };

  const loadCarrierContractsForInstallations = async (installationIds: number[]) => {
    try {
      setLoadingCarriers(true);

      const uniqueInstallationIds = Array.from(new Set(
        (installationIds || []).filter((id) => Number.isInteger(id) && id > 0)
      ));

      if (uniqueInstallationIds.length === 0) {
        setCarrierContracts([]);
        return;
      }

      const carrierResponses = await Promise.allSettled(
        uniqueInstallationIds.map((installationId) => api.getCarriers(String(installationId)))
      );

      const merged = carrierResponses
        .filter((result): result is PromiseFulfilledResult<any[]> => result.status === 'fulfilled')
        .flatMap((result) => result.value || [])
        .filter((carrier: any) => carrier.active)
        .map((carrier: any) => ({
          id: carrier.id,
          carrierType: carrier.carrierType,
          contractName: carrier.contractName,
          active: carrier.active,
          credentials: carrier.credentials || {},
        }));

      const uniqueById = Array.from(
        new Map(merged.map((carrier) => [carrier.id, carrier])).values()
      );

      setCarrierContracts(uniqueById);
    } catch (error) {
      console.error('Failed to load carriers for all stores:', error);
      setCarrierContracts([]);
    } finally {
      setLoadingCarriers(false);
    }
  };

  const normalizeOrderStatus = (order: any): 'openstaand' | 'verzonden' => {
    const rawStatus = String(order?.status || order?.orderStatus || '').toLowerCase();

    const openStatuses = [
      'openstaand',
      'open',
      'new',
      'announced',
      'arrived_at_wh',
      'onderweg-ffm',
      'binnengekomen-ffm',
      'label-aangemaakt',
      'gepickt',
    ];

    const shippedStatuses = [
      'verzonden',
      'verstuurd',
      'send',
      'sent',
      'shipped',
      'processed',
      'completed',
      'finished',
      'delivered',
      'afgeleverd',
    ];

    if (shippedStatuses.includes(rawStatus)) return 'verzonden';
    if (openStatuses.includes(rawStatus)) return 'openstaand';

    return 'openstaand';
  };

  const handleOpenLabelDialog = (order: any) => {
    setLabelOrder(order);
    const normalizedOrderShippingMethod = String(order.shippingMethod || '').trim();
    let matchingContract = carrierContracts.find((contract) => (
      String(contract.id) === normalizedOrderShippingMethod || contract.contractName === normalizedOrderShippingMethod
    ));

    const normalizedMethodLower = normalizedOrderShippingMethod.toLowerCase();
    if (!matchingContract && normalizedMethodLower.startsWith('wegrow-')) {
      matchingContract = carrierContracts.find((contract) => contract.carrierType === 'wegrow');
    }

    const initialWegrowCarrier = normalizedMethodLower.startsWith('wegrow-')
      ? normalizedMethodLower.replace('wegrow-', '').trim()
      : '';

    const shouldDefaultToVvb = Boolean(order?.isVVB);

    setSelectedContractId(
      shouldDefaultToVvb
        ? VVB_CONTRACT_ID
        : (matchingContract ? String(matchingContract.id) : '')
    );
    setSelectedWeGrowCarrier(
      wegrowCarrierOptions.some((option) => option.id === initialWegrowCarrier)
        ? initialWegrowCarrier
        : ''
    );
    setLabelPreviewUrl(order?.label?.labelUrl || '');
    setGeneratedLabelMeta({
      shipmentId: order?.label?.id ? String(order.label.id) : null,
      trackingCode: order?.supplierTracking || order?.tracking?.trackingCode || null,
      trackingUrl: order?.tracking?.trackingUrl || null,
    });
    setShowLabelDialog(true);
  };

  const handleOpenReturnLabelDialog = (order: any) => {
    setReturnLabelOrder(order);
    setSelectedReturnContractId('');
    setSelectedReturnWeGrowCarrier('');
    setReturnLabelPreviewUrl('');
    setGeneratedReturnLabelMeta(null);
    setShowReturnLabelDialog(true);
  };

  const handleGenerateReturnLabel = async () => {
    if (!returnLabelOrder || !selectedReturnContractId) return;

    const selectedContract = returnCarrierContracts.find(
      (contract) => String(contract.id) === selectedReturnContractId
    );
    if (!selectedContract) {
      toast.error('Selecteer een geldig contract');
      return;
    }

    const selectedShippingMethod = selectedReturnContractId;

    const basePackage = buildOrderLabelPackage(returnLabelOrder);
    const credentials = selectedContract.credentials || {};

    const warehouseName = warehouseAddress?.name || credentials.senderName || credentials.senderName1 || 'Warehouse';
    const warehouseStreet = warehouseAddress
      ? [warehouseAddress.street, warehouseAddress.houseNumber].filter(Boolean).join(' ')
      : (credentials.senderStreet || '');
    const warehouseZip = warehouseAddress?.postalCode || credentials.senderZipCode || credentials.senderPostalCode || '';
    const warehouseCity = warehouseAddress?.city || credentials.senderCity || '';
    const warehouseCountry = warehouseAddress?.country || credentials.senderCountry || 'NL';
    const warehouseEmail = warehouseAddress?.email || credentials.senderEmail || null;
    const warehousePhone = warehouseAddress?.phone || credentials.senderPhone || null;

    const resolveCustomerStreet = () => {
      if (basePackage.street) return basePackage.street;
      const addr = String(basePackage.address || '').trim();
      if (!addr) return '';
      const parts = addr.split(',');
      return parts[0].trim();
    };

    const resolveCustomerZip = () => {
      if (basePackage.zipCode) return basePackage.zipCode;
      const addr = String(basePackage.address || '').trim();
      const match = addr.match(/([A-Z0-9]{4,10})\s*,?\s*([A-Za-zÀ-ÿ\s]+)$/);
      return match ? match[1].trim() : '';
    };

    const resolveCustomerCity = () => {
      if (basePackage.city) return basePackage.city;
      const addr = String(basePackage.address || '').trim();
      const parts = addr.split(',');
      if (parts.length >= 2) return parts[parts.length - 1].trim();
      return '';
    };

    const returnPackage = {
      ...basePackage,
      isReturn: true,
      senderName: basePackage.customerName,
      senderAddress: basePackage.address,
      senderStreet: resolveCustomerStreet(),
      senderZipCode: resolveCustomerZip(),
      senderCity: resolveCustomerCity(),
      senderCountry: basePackage.country,
      senderEmail: basePackage.email,
      senderPhone: basePackage.phone,
      customerName: warehouseName,
      street: warehouseStreet,
      zipCode: warehouseZip,
      city: warehouseCity,
      country: warehouseCountry,
      email: warehouseEmail,
      phone: warehousePhone,
      address: [warehouseStreet, warehouseZip, warehouseCity].filter(Boolean).join(', '),
    };

    try {
      setGeneratingReturnLabel(true);
      const result = await api.generateCarrierLabels(Number(selectedReturnContractId), {
        shippingMethod: selectedShippingMethod,
        packages: [returnPackage],
      });

      const label = (result.labels || [])[0];
      if (label?.labelUrl) {
        setReturnLabelPreviewUrl(label.labelUrl);
      }
      setGeneratedReturnLabelMeta({
        shipmentId: label?.shipmentId || null,
        trackingCode: label?.trackingCode || null,
        trackingUrl: label?.trackingUrl || null,
      });

      toast.success('Retourlabel succesvol gegenereerd');

      try {
        const installationId = String(
          returnLabelOrder.installation?.id ?? returnLabelOrder.installationId ?? activeProfile
        ).trim();
        await api.createReturn({
          installationId: parseInt(installationId, 10),
          orderNumber: returnLabelOrder.orderNumber,
          customerName: returnLabelOrder.customerName,
          customerEmail: returnLabelOrder.customerEmail || null,
          storeName: returnLabelOrder.storeName,
          ffmClientName: returnLabelOrder.storeName,
          type: 'unknown',
          platform: returnLabelOrder.platform || 'manual',
          trackingCode: label?.trackingCode || null,
          carrier: selectedContract.carrierType || null,
          status: 'registered',
          labelUrl: label?.labelUrl || null,
          items: [],
        });
      } catch (returnError) {
        console.error('Failed to create return record:', returnError);
      }
    } catch (error) {
      console.error('Failed to generate return label:', error);
      toast.error('Kon retourlabel niet genereren', {
        description: error instanceof Error ? error.message : 'Probeer het opnieuw',
      });
    } finally {
      setGeneratingReturnLabel(false);
    }
  };

  const getOrderShippingContractId = (order: any) => {
    if (typeof order.id !== 'number') return '';

    const draftValue = shippingMethodDrafts[order.id];
    if (draftValue !== undefined) return draftValue;

    const normalizedOrderShippingMethod = String(order.shippingMethod || '').trim();
    if (!normalizedOrderShippingMethod) return '';

    if (isManualShippingOverride(normalizedOrderShippingMethod)) {
      return normalizedOrderShippingMethod;
    }

    const matchingContract = carrierContracts.find((contract) => (
      String(contract.id) === normalizedOrderShippingMethod || contract.contractName === normalizedOrderShippingMethod
    ));
    return matchingContract ? String(matchingContract.id) : normalizedOrderShippingMethod;
  };

  const handleShippingMethodDraftChange = (orderId: number, contractId: string) => {
    setShippingMethodDrafts((prevDrafts) => ({
      ...prevDrafts,
      [orderId]: contractId,
    }));
  };

  const getApiErrorToastMeta = (error: unknown) => {
    const fallbackMessage = 'Probeer het opnieuw';
    const errorMessage = error instanceof Error ? error.message : fallbackMessage;
    const isBadRequest = errorMessage.includes('(HTTP 400)') || errorMessage.includes('HTTP 400');

    if (isBadRequest) {
      return {
        title: 'Actie niet toegestaan',
        description: errorMessage,
      };
    }

    return {
      title: null as string | null,
      description: errorMessage,
    };
  };

  const handleSaveShippingMethod = async (order: any, explicitSelection?: string) => {
    if (typeof order.id !== 'number') {
      toast.error('Deze order kan niet worden bijgewerkt');
      return;
    }

    if (normalizeOrderStatus(order) === 'verzonden') {
      toast.error('Verzendmethode kan niet worden aangepast voor verzonden orders');
      return;
    }

    const selectedOrderContractId = explicitSelection || getOrderShippingContractId(order);
    const selectedContract = carrierContracts.find((contract) => String(contract.id) === selectedOrderContractId);
    const selectedManualOverride = manualShippingOverrides.find((option) => option.value === selectedOrderContractId);
    const selectedDropdownOption = shippingMethodDropdownOptions.find((option) => option.value === selectedOrderContractId);

    if (!selectedContract && !selectedManualOverride && !selectedDropdownOption) {
      toast.error('Selecteer een verzendmethode');
      return;
    }

    try {
      setSavingShippingMethodOrderId(order.id);

      const updatedOrder = await api.updateOrder(order.id, {
        shippingMethod: selectedOrderContractId,
      });

      setOrders((prevOrders) => prevOrders.map((entry) => (
        entry.id === order.id
          ? {
              ...entry,
              shippingMethod: updatedOrder.shippingMethod || selectedOrderContractId,
            }
          : entry
      )));

      toast.success('Verzendmethode bijgewerkt');
    } catch (error) {
      console.error('Failed to update shipping method:', error);
      toast.error('Kon verzendmethode niet bijwerken', {
        description: error instanceof Error ? error.message : 'Probeer het opnieuw',
      });
    } finally {
      setSavingShippingMethodOrderId(null);
    }
  };

  const handleGenerateLabel = async () => {
    if (!labelOrder) return;
    if (!selectedContractId) return;

    if (selectedContractId === VVB_CONTRACT_ID) {
      try {
        setGeneratingLabel(true);

        const installationId = String(
          labelOrder.installation?.id
          ?? labelOrder.installationId
          ?? ''
        ).trim();
        const bolOrderId = String(labelOrder.orderNumber || '').trim();
        const integrationId = labelOrder.integrationId
          ?? labelOrder.integration?.id
          ?? undefined;

        if (!installationId || !bolOrderId) {
          toast.error('Bol label kan niet worden aangemaakt', {
            description: 'Installation ID of ordernummer ontbreekt',
          });
          return;
        }

        const preferredDeliveryOptionId = String(selectedBolDeliveryOptionId || '').trim();

        if (!preferredDeliveryOptionId) {
          toast.error('Selecteer eerst een Bol delivery option');
          return;
        }

        const bolLabelResult = await api.getBolShippingLabel(
          installationId,
          bolOrderId,
          integrationId,
          preferredDeliveryOptionId,
          bolOrderItems.length > 0 ? bolOrderItems : undefined,
        );
        const deliveryOptionValidation = bolLabelResult?.deliveryOptionValidation || null;
        const directLabelUrl = typeof bolLabelResult?.labelUrl === 'string' && isLikelyUrl(bolLabelResult.labelUrl.trim())
          ? bolLabelResult.labelUrl.trim()
          : null;
        const labelUrl = directLabelUrl || extractFirstStringMatch(bolLabelResult, isLikelyUrl);
        const pdfBase64 = extractFirstStringMatch(bolLabelResult, isLikelyPdfBase64);
        const resolvedLabelPreviewUrl = labelUrl
          || (pdfBase64
            ? (pdfBase64.startsWith('data:application/pdf;base64,') ? pdfBase64 : `data:application/pdf;base64,${pdfBase64}`)
            : '');

        const trackingUrl = extractFirstStringMatch(bolLabelResult, (value) => {
          const normalized = value.toLowerCase();
          return isLikelyUrl(value) && (normalized.includes('track') || normalized.includes('trace'));
        });
        const trackingCode = extractFirstStringMatch(
          bolLabelResult,
          (value) => value.length >= 6 && value.length <= 40 && /[a-z0-9]/i.test(value) && !isLikelyUrl(value)
        );

        if (resolvedLabelPreviewUrl) {
          setLabelPreviewUrl(resolvedLabelPreviewUrl);
        }

        setGeneratedLabelMeta({
          shipmentId: String(bolOrderId),
          trackingCode: trackingCode || null,
          trackingUrl: trackingUrl || null,
        });

        if (typeof labelOrder.id === 'number') {
          await api.updateOrder(labelOrder.id, {
            shippingMethod: 'Bol.com',
          });

          setOrders((prevOrders) => prevOrders.map((entry) => (
            entry.id === labelOrder.id
              ? {
                  ...entry,
                  shippingMethod: 'Bol.com',
                  label: {
                    ...(entry.label || {}),
                    labelUrl: resolvedLabelPreviewUrl || entry.label?.labelUrl || null,
                    status: resolvedLabelPreviewUrl ? 'generated' : (entry.label?.status || 'generated'),
                  },
                }
              : entry
          )));

          setLabelOrder((prevLabelOrder: any) => (
            prevLabelOrder
              ? {
                  ...prevLabelOrder,
                  shippingMethod: 'Bol.com',
                  label: {
                    ...(prevLabelOrder.label || {}),
                    labelUrl: resolvedLabelPreviewUrl || prevLabelOrder.label?.labelUrl || null,
                    status: resolvedLabelPreviewUrl ? 'generated' : (prevLabelOrder.label?.status || 'generated'),
                  },
                }
              : prevLabelOrder
          ));

          setShippingMethodDrafts((prevDrafts) => ({
            ...prevDrafts,
            [labelOrder.id]: 'Bol.com',
          }));
        }

        toast.success('Bol label aangemaakt');

        if (deliveryOptionValidation?.hasSelectedDeliveryOption) {
          if (deliveryOptionValidation.isDeliveryOptionAttached) {
            toast.success('VVB delivery option bevestigd', {
              description: 'Label bevat de juiste delivery option en handover window.',
            });
          } else {
            const mismatchDetails = [
              deliveryOptionValidation.matchesShippingLabelOfferId === false
                ? `Offer mismatch (verwacht ${deliveryOptionValidation.expectedShippingLabelOfferId}, kreeg ${deliveryOptionValidation.actualShippingLabelOfferId || 'onbekend'})`
                : null,
              deliveryOptionValidation.matchesTransporterCode === false
                ? `Transporter mismatch (verwacht ${deliveryOptionValidation.expectedTransporterCode}, kreeg ${deliveryOptionValidation.actualTransporterCode || 'onbekend'})`
                : null,
              !deliveryOptionValidation.hasHandoverWindow
                ? 'Handover window ontbreekt op delivery option.'
                : null,
            ].filter(Boolean).join(' | ');

            toast.error('VVB delivery option niet bevestigd', {
              description: mismatchDetails || 'De label response kon niet volledig worden gevalideerd.',
            });
          }
        }
      } catch (error) {
        console.error('Failed to generate Bol label:', error);
        const toastMeta = getApiErrorToastMeta(error);
        toast.error(toastMeta.title || 'Kon Bol label niet aanmaken', {
          description: toastMeta.description,
        });
      } finally {
        setGeneratingLabel(false);
      }

      return;
    }

    const selectedContract = carrierContracts.find((contract) => String(contract.id) === selectedContractId);
    if (!selectedContract) {
      toast.error('Selecteer een geldig contract');
      return;
    }

    if (selectedContract.carrierType === 'wegrow' && !selectedWeGrowCarrier) {
      toast.error('Selecteer een WeGrow verzendoptie');
      return;
    }

    const selectedShippingMethod = selectedContract.carrierType === 'wegrow'
      ? `wegrow-${selectedWeGrowCarrier}`
      : selectedContractId;

    try {
      setGeneratingLabel(true);
      const result = await api.generateCarrierLabels(Number(selectedContractId), {
        shippingMethod: selectedShippingMethod,
        ...(selectedContract.carrierType === 'wegrow' ? { wegrowCarrier: selectedWeGrowCarrier } : {}),
        packages: [buildOrderLabelPackage(labelOrder)],
      });

      const label = (result.labels || [])[0];
      if (label?.labelUrl) {
        setLabelPreviewUrl(label.labelUrl);
        window.open(label.labelUrl, '_blank', 'noreferrer');
      }
      setGeneratedLabelMeta({
        shipmentId: label?.shipmentId || null,
        trackingCode: label?.trackingCode || null,
        trackingUrl: label?.trackingUrl || null,
      });

      if (typeof labelOrder.id === 'number' && selectedShippingMethod) {
        setOrders((prevOrders) => prevOrders.map((entry) => (
          entry.id === labelOrder.id
            ? {
                ...entry,
                shippingMethod: selectedShippingMethod,
                label: {
                  ...(entry.label || {}),
                  labelUrl: label?.labelUrl || entry.label?.labelUrl || null,
                  status: 'generated',
                },
              }
            : entry
        )));
        setLabelOrder((prevLabelOrder: any) => (
          prevLabelOrder
            ? {
                ...prevLabelOrder,
                shippingMethod: selectedShippingMethod,
                label: {
                  ...(prevLabelOrder.label || {}),
                  labelUrl: label?.labelUrl || prevLabelOrder.label?.labelUrl || null,
                  status: 'generated',
                },
              }
            : prevLabelOrder
        ));
        setShippingMethodDrafts((prevDrafts) => ({
          ...prevDrafts,
          [labelOrder.id]: selectedContractId,
        }));
      }

      toast.success('Label succesvol gegenereerd');
    } catch (error) {
      console.error('Failed to generate label:', error);
      let errorDescription = getApiErrorToastMeta(error).description;

      if (errorDescription.includes('ERR_DELICOM_TOKEN_INCORRECT')) {
        errorDescription = 'DPD verificatietoken is onjuist. Ga naar Vervoerders > DPD contract > Instellingen en vul een nieuw Auth Token in vanuit de DPD Login Service.';
      }

      const toastMeta = getApiErrorToastMeta(error);
      toast.error(toastMeta.title || 'Kon label niet genereren', {
        description: errorDescription,
      });
    } finally {
      setGeneratingLabel(false);
    }
  };

  const filteredOrders = orders
    .filter(order => {
      const orderInstallationId = order.installation?.id ?? order.installationId;
      const orderStoreName = String(order.storeName || '');

      const matchesIntegrationScope = !isAllStoresSelected
        ? true
        : (
            allowedIntegrationStoreNames.includes(orderStoreName) ||
            allowedIntegrationInstallationIds.includes(orderInstallationId)
          );

      const matchesStore = isAllStoresSelected
        ? (filterStore === 'all' || orderStoreName === filterStore)
        : (filterStore === 'all' || order.storeName === filterStore);

      if (filterFulfillmentType && order.fulfillmentType !== filterFulfillmentType) return false;
      if (filterKanalen.length > 0 && !filterKanalen.includes(String(order.platform || ''))) return false;
      if (filterLanden.length > 0 && !filterLanden.includes(String(order.country || ''))) return false;
      if (filterVerzendVia.length > 0) {
        const isVvb = String(order.shippingMethod || '').toLowerCase().includes('bol');
        const verzendViaValue = isVvb ? 'bol' : 'eigen';
        if (!filterVerzendVia.includes(verzendViaValue)) return false;
      }
      return matchesIntegrationScope && matchesStore;
    })
    .sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortField === 'orderDate') { aVal = a.orderDate ? new Date(a.orderDate).getTime() : 0; bVal = b.orderDate ? new Date(b.orderDate).getTime() : 0; }
      else if (sortField === 'deliveryDate') {
        const isVvb = (o: any) => Boolean(o.isVVB) || String(o.shippingMethod || '').toLowerCase().includes('bol');
        const aDate = isVvb(a) && a.latestDropOffDate ? a.latestDropOffDate : a.deliveryDate;
        const bDate = isVvb(b) && b.latestDropOffDate ? b.latestDropOffDate : b.deliveryDate;
        aVal = aDate ? new Date(aDate).getTime() : 0;
        bVal = bDate ? new Date(bDate).getTime() : 0;
      }
      else if (sortField === 'storeName') { aVal = String(a.storeName || ''); bVal = String(b.storeName || ''); }
      else { aVal = a.orderDate ? new Date(a.orderDate).getTime() : 0; bVal = b.orderDate ? new Date(b.orderDate).getTime() : 0; }
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  const uniqueKanalen = Array.from(new Set(orders.map(o => String(o.platform || '')).filter(Boolean)));
  const uniqueLanden = Array.from(new Set(orders.map(o => String(o.country || '')).filter(Boolean))); 

  const storeFilterOptions = isAllStoresSelected
    ? integrationStoreOptions
    : Array.from(
        new Set(
          orders
            .map(order => order.storeName)
            .filter((storeName): storeName is string => Boolean(storeName))
        )
      ).map((storeName) => ({ id: storeName, name: storeName }));

  const toggleOrderSelection = (orderId: number) => {
    setSelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const handleOpenPicklist = async () => {
    if (selectedOrders.length === 0) return;
    try {
      setLoadingPicklist(true);
      setShowPicklistDialog(true);
      const data = await api.getPicklist(selectedOrders);
      setPicklistData(data.orders || []);
    } catch (error) {
      toast.error('Kon picklijst niet laden');
    } finally {
      setLoadingPicklist(false);
    }
  };

  const handlePickOrders = async () => {
    if (selectedOrders.length === 0) return;
    try {
      setPickingOrders(true);
      const result = await api.pickOrders(selectedOrders, activeProfile);
      toast.success(`${result.processed} order(s) gepickt`);
      if (result.errors > 0) {
        toast.error(`${result.errors} order(s) mislukt`);
      }
      setSelectedOrders([]);
      setShowPicklistDialog(false);
      loadOrders();
    } catch (error) {
      toast.error('Kon orders niet picken');
    } finally {
      setPickingOrders(false);
    }
  };

  const toggleOrderDetails = (orderNumber: string) => {
    setExpandedOrder(expandedOrder === orderNumber ? null : orderNumber);
  };

  const exportToExcel = () => {
    const exportData = filteredOrders.map(order => ({
      'Ordernummer': order.orderNumber,
      'Klantnaam': order.customerName,
      'Land': order.country,
      'Store': order.storeName,
      'Platform': order.platform || 'bol.com',
      'Aantal items': order.itemCount,
      'Orderwaarde': order.orderValue ? `€${order.orderValue.toFixed(2)}` : '',
      'Besteldatum': order.orderDate ? new Date(order.orderDate).toLocaleDateString('nl-NL') : '',
      'Leverdatum': order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('nl-NL') : '',
      'Adres': order.address || '',
      'Trackingnummer': order.supplierTracking || order?.tracking?.trackingCode || '',
      'Status': order.status || '',
      'Orderstatus': order.orderStatus || '',
      'Zendingstatus': order.shippingStatus || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const colWidths = [
      { wch: 15 }, { wch: 20 }, { wch: 8  }, { wch: 15 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 40 },
      { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 25 }
    ];
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `orders_export_${date}.xlsx`);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'verzonden') {
      return <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0">Verzonden</Badge>;
    }
    return <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">Openstaand</Badge>;
  };

  const normalizeCountryCode = (country: string) => String(country || '').trim().toUpperCase();

  const getCountryFlagUrl = (country: string) => {
    const normalizedCode = normalizeCountryCode(country);
    if (!/^[A-Z]{2}$/.test(normalizedCode)) return null;
    return `https://flagcdn.com/24x18/${normalizedCode.toLowerCase()}.png`;
  };

  const getCountryDisplay = (country: string) => {
    const normalizedCode = normalizeCountryCode(country);
    return {
      code: normalizedCode || '-',
      flagUrl: getCountryFlagUrl(country),
    };
  };

 const getFulfillmentTypeBadge = (fulfillmentType: string | null) => {
  if (!fulfillmentType) return null;
  if (fulfillmentType === 'fulfillment') {
    return (
      <Badge variant="outline" className="text-xs border-indigo-200 text-indigo-600 bg-indigo-50 px-1.5 py-0">
        FFM
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs border-purple-200 text-purple-600 bg-purple-50 px-1.5 py-0">
      DS
    </Badge>
  );
};

  const getOrderStatusBadge = (status: string) => {
    const normalizedStatus = String(status || '').trim().toLowerCase();

    switch (normalizedStatus) {
      case 'gepickt':
        return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">Gepickt</Badge>;
      case 'openstaand':
        return <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">Openstaand</Badge>;
      case 'onderweg-ffm':
        return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">Onderweg naar FFM</Badge>;
      case 'binnengekomen-ffm':
        return <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50">Binnengekomen bij FFM</Badge>;
      case 'label-aangemaakt':
        return <Badge variant="outline" className="text-indigo-600 border-indigo-300 bg-indigo-50">Label aangemaakt</Badge>;
      case 'verstuurd':
      case 'verzonden':
      case 'shipped':
      case 'processed':
      case 'finished':
      case 'send':
      case 'sent':
      case 'dispatched':
      case 'fulfilled':
      case 'fulfilment_completed':
      case 'fulfillment_completed':
      case 'completed':
        return <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0">Verstuurd</Badge>;
      case 'afgeleverd':
      case 'delivered':
        return <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0">Afgeleverd</Badge>;
      default:
        return <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">Openstaand</Badge>;
    }
  };

  const resolveShippingSelectionMeta = (selectionValue: string) => {
    const normalizedSelection = String(selectionValue || '').trim();
    if (!normalizedSelection) {
      return {
        label: 'Niet ingesteld',
        logo: null as string | null,
        icon: null as 'search' | null,
      };
    }

    const normalizedLower = normalizedSelection.toLowerCase();
    if (MANUAL_REVIEW_VALUES.includes(normalizedLower)) {
      return {
        label: 'handmatig controleren',
        logo: null as string | null,
        icon: 'search' as const,
      };
    }

    const matchingContract = carrierContracts.find((contract) => (
      String(contract.id) === normalizedSelection || contract.contractName === normalizedSelection
    ));
    if (matchingContract) {
      const isWegrowContract = String(matchingContract.carrierType || '').toLowerCase() === 'wegrow';
      return {
        label: isWegrowContract
          ? matchingContract.contractName
          : `${matchingContract.contractName} (${matchingContract.carrierType.toUpperCase()})`,
        logo: carrierLogoMap[matchingContract.carrierType] || null,
        icon: null as 'search' | null,
      };
    }

    if (normalizedLower.startsWith('wegrow-')) {
      const wegrowCarrier = normalizedLower.replace('wegrow-', '').trim();
      const wegrowCarrierOption = getWegrowCarrierOptionById(wegrowCarrier);
      const wegrowCarrierLabel = wegrowCarrierOption?.name || wegrowCarrier.toUpperCase();

      return {
        label: wegrowCarrierLabel,
        logo: wegrowCarrierOption?.logo || carrierLogoMap[wegrowCarrier] || carrierLogoMap.wegrow || null,
        icon: null as 'search' | null,
      };
    }

    const manualOption = manualShippingOverrides.find((option) => option.value === normalizedSelection);
    if (manualOption) {
      if (normalizedLower.includes('postnl')) {
        return { label: manualOption.label, logo: carrierLogoMap.postnl || null, icon: null as 'search' | null };
      }
      if (normalizedLower.includes('bpost')) {
        return { label: manualOption.label, logo: carrierLogoMap.bpost || null, icon: null as 'search' | null };
      }
      if (normalizedLower.includes('dhl')) {
        return { label: manualOption.label, logo: carrierLogoMap.dhl || null, icon: null as 'search' | null };
      }
      if (normalizedLower.includes('dpd')) {
        return { label: manualOption.label, logo: carrierLogoMap.dpd || null, icon: null as 'search' | null };
      }
      return { label: manualOption.label, logo: carrierLogoMap.wegrow || null, icon: null as 'search' | null };
    }

    if (normalizedLower.includes('postnl')) {
      return { label: normalizedSelection, logo: carrierLogoMap.postnl || null, icon: null as 'search' | null };
    }
    if (normalizedLower.includes('bol.com') || normalizedLower === 'bol' || normalizedLower === 'bolcom') {
      return { label: 'Bol.com - VVB', logo: carrierLogoMap.bol || null, icon: null as 'search' | null };
    }
    if (normalizedLower === VVB_CONTRACT_ID) {
      return { label: 'VVB', logo: carrierLogoMap.bol || null, icon: null as 'search' | null };
    }
    if (normalizedLower.includes('bpost')) {
      return { label: normalizedSelection, logo: carrierLogoMap.bpost || null, icon: null as 'search' | null };
    }
    if (normalizedLower.includes('dhl')) {
      return { label: normalizedSelection, logo: carrierLogoMap.dhl || null, icon: null as 'search' | null };
    }
    if (normalizedLower.includes('dpd')) {
      return { label: normalizedSelection, logo: carrierLogoMap.dpd || null, icon: null as 'search' | null };
    }
    if (normalizedLower.includes('wegrow')) {
      return { label: normalizedSelection, logo: carrierLogoMap.wegrow || null, icon: null as 'search' | null };
    }

    return { label: normalizedSelection, logo: null as string | null, icon: null as 'search' | null };
  };

  const renderShippingSelectionIcon = (
    meta: { label: string; logo: string | null; icon: 'search' | null },
    sizeClass = 'w-5 h-5',
    withBorder = true,
  ) => {
    if (meta.logo) {
      return (
        <div className={`${sizeClass} ${withBorder ? 'rounded bg-white border border-slate-200 p-0.5' : ''} flex items-center justify-center`}>
          <img src={meta.logo} alt={meta.label} className="w-full h-full object-contain" />
        </div>
      );
    }

    if (meta.icon === 'search') {
      return (
        <div className={`${sizeClass} ${withBorder ? 'rounded bg-slate-50 border border-slate-200' : ''} flex items-center justify-center`}>
          <Search className="w-3.5 h-3.5 text-slate-500" />
        </div>
      );
    }

    return null;
  };

  const selectedContract = carrierContracts.find((contract) => String(contract.id) === selectedContractId);
  const isWeGrowContractSelected = selectedContract?.carrierType === 'wegrow';
  const isVvbContractSelected = selectedContractId === VVB_CONTRACT_ID;
  const selectedBolDeliveryOption = bolDeliveryOptions.find(
    (option) => String(option?.shippingLabelOfferId || '').trim() === selectedBolDeliveryOptionId
  ) || null;
  const hasNativeVvbContract = carrierContracts.some((contract) => {
    const normalizedId = String(contract.id || '').trim().toLowerCase();
    const normalizedName = String(contract.contractName || '').trim().toLowerCase();
    return normalizedId === VVB_CONTRACT_ID || normalizedName === 'vvb';
  });

  const labelDialogContracts: CarrierContract[] = hasNativeVvbContract
    ? carrierContracts
    : [
        ...carrierContracts,
        {
          id: VVB_CONTRACT_ID,
          carrierType: 'bol',
          contractName: 'VVB',
          active: true,
        },
      ];

  const selectedReturnContract = returnCarrierContracts.find(
    (contract) => String(contract.id) === selectedReturnContractId
  );
  const isReturnWeGrowSelected = selectedReturnContract?.carrierType === 'wegrow';

  const startOrderIndex = totalOrders === 0 ? 0 : ((currentPage - 1) * ORDERS_PER_PAGE) + 1;
  const endOrderIndex = Math.min(currentPage * ORDERS_PER_PAGE, totalOrders);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Bestellingen
        </h2>
        <p className="text-slate-600">Beheer en verwerk al je openstaande orders</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${filterStatus === 'openstaand' && !filterFulfillmentType && !filterExpiringTomorrow ? 'ring-2 ring-indigo-500 border-indigo-300' : ''}`} onClick={() => { if (filterStatus === 'openstaand' && !filterFulfillmentType && !filterExpiringTomorrow) { setFilterStatus('all'); } else { setFilterStatus('openstaand'); setFilterFulfillmentType(null); setFilterExpiringTomorrow(false); } }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1"> {t('openOrders')} </p>
                <p className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{statsOpenOrders}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                <ShoppingBag className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Needs picking — alleen voor global admins */}
        {isGlobalAdmin && (
          <Card className={`border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${filterStatus === 'openstaand' && filterFulfillmentType === 'fulfillment' ? 'ring-2 ring-indigo-500 border-indigo-300' : ''}`} onClick={() => { if (filterStatus === 'openstaand' && filterFulfillmentType === 'fulfillment') { setFilterStatus('all'); setFilterFulfillmentType(null); } else { setFilterStatus('openstaand'); setFilterFulfillmentType('fulfillment'); setFilterExpiringTomorrow(false); } }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 mb-1">{t('needsPicking')}</p>
                  <p className="text-3xl font-bold text-emerald-600">{statsNeedsPicking}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <PackageCheck className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setFilterStatus('openstaand'); setFilterFulfillmentType(null); setFilterExpiringTomorrow(true); }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">{t('expiringTomorrow')}</p>
                <p className={`text-3xl font-bold ${statsExpiringTomorrow > 0 ? 'text-amber-600' : 'text-slate-600'}`}>{statsExpiringTomorrow}</p>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${statsExpiringTomorrow > 0 ? 'bg-amber-100' : 'bg-slate-100'}`}>
                <AlertTriangle className={`w-6 h-6 ${statsExpiringTomorrow > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setFilterStatus('verzonden'); setFilterFulfillmentType(null); setFilterExpiringTomorrow(false); }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">{t('processed')}</p>
                <p className="text-3xl font-bold text-purple-600">{statsProcessed}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Star className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2 border-slate-200 shadow-sm"
                onClick={exportToExcel}
                disabled={filteredOrders.length === 0}
              >
                <Download className="w-4 h-4" />
                Exporteren
              </Button>
              {isGlobalAdmin && selectedOrders.length > 0 && (
                <Button
                  size="sm"
                  className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                  onClick={handleOpenPicklist}
                >
                  <ClipboardList className="w-4 h-4" />
                  Picklijst ({selectedOrders.length})
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-slate-200 shadow-sm"
                onClick={loadOrders}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Vernieuwen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="space-y-3 mb-6">
            <div className="flex gap-3 items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Zoek op ordernummer, klant of tracking..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 border-slate-200 shadow-sm"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className={`gap-2 border-slate-200 shadow-sm h-10 px-4 ${showFilterPanel ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : ''}`}
                onClick={() => setShowFilterPanel(v => !v)}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
                {(filterKanalen.length + filterLanden.length + filterVerzendVia.length) > 0 && (
                  <span className="ml-1 bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {filterKanalen.length + filterLanden.length + filterVerzendVia.length}
                  </span>
                )}
              </Button>
              <Select value={filterStore} onValueChange={setFilterStore}>
                <SelectTrigger className="w-48 border-slate-200 shadow-sm"><SelectValue placeholder="Store" /></SelectTrigger>
                <SelectContent className="border-slate-200 shadow-lg">
                  <SelectItem value="all">Alle stores</SelectItem>
                  {storeFilterOptions.map((storeOption) => (
                    <SelectItem key={storeOption.id} value={storeOption.id}>{storeOption.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48 border-slate-200 shadow-sm"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent className="border-slate-200 shadow-lg">
                  <SelectItem value="all">Alle statussen</SelectItem>
                  <SelectItem value="openstaand">Openstaand</SelectItem>
                  <SelectItem value="gepickt">Gepickt</SelectItem>
                  <SelectItem value="verzonden">Verzonden</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sortering — altijd zichtbaar */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-slate-600 font-medium">Sorteren:</span>
              {[
                { value: 'storeName', label: 'Store' },
                { value: 'deliveryDate', label: 'Uiterste leverdatum' },
                { value: 'orderDate', label: 'Besteldatum' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { if (sortField === opt.value) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); } else { setSortField(opt.value); setSortDir('asc'); } }}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition-all ${sortField === opt.value ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white border-indigo-500 shadow-sm' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600'}`}
                >
                  {opt.label}
                  {sortField === opt.value && <span className="text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              ))}
            </div>

            {/* Uitklap filter paneel */}
            {showFilterPanel && (
              <div className="border border-slate-200 rounded-xl p-4 bg-gradient-to-br from-slate-50 to-indigo-50/30 space-y-4">

                {/* Filter kolommen */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {/* Store */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Store</p>
                    <div className="space-y-1.5">
                      {storeFilterOptions.map(opt => (
                        <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={filterStore === opt.id} onChange={() => setFilterStore(filterStore === opt.id ? 'all' : opt.id)} className="accent-indigo-600" />
                          <span className="text-sm text-slate-700">{opt.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Ordertype — alleen voor admins (voorraad/dropship onderscheid) */}
                  {isGlobalAdmin && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Ordertype</p>
                      <div className="space-y-1.5">
                        {[{ value: 'fulfillment', label: 'Voorraadorders' }, { value: 'dropship', label: 'Dropshiporders' }].map(opt => (
                          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={filterFulfillmentType === opt.value} onChange={() => setFilterFulfillmentType(filterFulfillmentType === opt.value ? null : opt.value)} className="accent-indigo-600" />
                            <span className="text-sm text-slate-700">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Kanaal */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Kanaal</p>
                    <div className="space-y-1.5">
                      {uniqueKanalen.map(kanaal => (
                        <label key={kanaal} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={filterKanalen.includes(kanaal)} onChange={() => setFilterKanalen(prev => prev.includes(kanaal) ? prev.filter(k => k !== kanaal) : [...prev, kanaal])} className="accent-indigo-600" />
                          <span className="text-sm text-slate-700 capitalize">{kanaal}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Verzenden via */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Verzenden via</p>
                    <div className="space-y-1.5">
                      {[{ value: 'bol', label: 'Bol' }, { value: 'eigen', label: 'Eigen verzendwijze' }].map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={filterVerzendVia.includes(opt.value)} onChange={() => setFilterVerzendVia(prev => prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value])} className="accent-indigo-600" />
                          <span className="text-sm text-slate-700">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Land */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Land</p>
                    <div className="space-y-1.5">
                      {uniqueLanden.map(land => (
                        <label key={land} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={filterLanden.includes(land)} onChange={() => setFilterLanden(prev => prev.includes(land) ? prev.filter(l => l !== land) : [...prev, land])} className="accent-indigo-600" />
                          <span className="text-sm text-slate-700">{land}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Status</p>
                    <div className="space-y-1.5">
                      {[{ value: 'openstaand', label: 'Openstaand' }, { value: 'gepickt', label: 'Gepickt' }, { value: 'verzonden', label: 'Verzonden' }].map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={filterStatus === opt.value} onChange={() => setFilterStatus(filterStatus === opt.value ? 'all' : opt.value)} className="accent-indigo-600" />
                          <span className="text-sm text-slate-700">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* VVB filtering — alleen admins */}
                  {isGlobalAdmin && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">VVB filtering</p>
                      <div className="space-y-1.5">
                        {[{ value: 'ochtend' as const, label: 'VVB Ochtend vandaag (09:30)' }, { value: 'avond' as const, label: 'VVB Avond vandaag (18:00)' }].map(opt => (
                          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={filterVvbWindow === opt.value} onChange={() => setFilterVvbWindow(filterVvbWindow === opt.value ? null : opt.value)} className="accent-indigo-600" />
                            <span className="text-sm text-slate-700">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reset */}
                <div className="flex justify-end border-t border-slate-200 pt-3">
                  <Button variant="outline" size="sm" className="gap-2 border-slate-200" onClick={() => { setFilterKanalen([]); setFilterLanden([]); setFilterVerzendVia([]); setFilterFulfillmentType(null); setFilterStatus('all'); setFilterStore('all'); setFilterVvbWindow(null); setSortField('orderDate'); setSortDir('desc'); }}>
                    <X className="w-3.5 h-3.5" />
                    Reset filters
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Orders Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="w-8">
                    {isGlobalAdmin && filterFulfillmentType === 'fulfillment' && filteredOrders.length > 0 && (
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-indigo-600 cursor-pointer"
                        checked={filteredOrders.filter(o => String(o.status || '').toLowerCase() !== 'gepickt' && String(o.orderStatus || '').toLowerCase() !== 'gepickt').every(o => selectedOrders.includes(o.id))}
                        onChange={() => {
                          const allIds = filteredOrders.filter(o => String(o.status || '').toLowerCase() !== 'gepickt' && String(o.orderStatus || '').toLowerCase() !== 'gepickt').map(o => o.id);
                          const allSelected = allIds.every(id => selectedOrders.includes(id));
                          setSelectedOrders(allSelected ? [] : allIds);
                        }}
                      />
                    )}
                  </TableHead>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Ordernummer</TableHead>
                  <TableHead>Klantnaam</TableHead>
                  <TableHead>Land</TableHead>
                  <TableHead>Store naam</TableHead>
                  <TableHead className="text-center">Aantal items</TableHead>
                  <TableHead>Uiterste leverdatum</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead className="w-28 text-center">Verzend</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-slate-500">
                      Geen orders gevonden
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <Fragment key={order.orderNumber}>
                      <TableRow 
                        className="hover:bg-slate-50/50 cursor-pointer"
                        onClick={() => toggleOrderDetails(order.orderNumber)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {isGlobalAdmin && order.fulfillmentType === 'fulfillment' && normalizeOrderStatus(order) === 'openstaand' && String(order.status || '').toLowerCase() !== 'gepickt' && String(order.orderStatus || '').toLowerCase() !== 'gepickt' && (
                            <input
                              type="checkbox"
                              checked={selectedOrders.includes(order.id)}
                              onChange={() => toggleOrderSelection(order.id)}
                              className="w-4 h-4 accent-indigo-600 cursor-pointer"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {expandedOrder === order.orderNumber ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{order.orderNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {order.orderItems?.[0]?.productImage && (
                              <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                                <img 
                                  src={order.orderItems[0].productImage} 
                                  alt={order.orderItems[0].productName}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <span>{order.customerName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const countryDisplay = getCountryDisplay(order.country);
                            return (
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                                {countryDisplay.flagUrl ? (
                                  <img src={countryDisplay.flagUrl} alt={countryDisplay.code} className="h-3 w-4 rounded-[2px]" loading="lazy" />
                                ) : (
                                  <span>🌍</span>
                                )}
                                <span>{countryDisplay.code}</span>
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">
                            {order.storeName}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-center">
                            <div className="text-sm text-slate-900">{order.itemCount}</div>
                            <div className="text-xs text-slate-500">€ {order.orderValue?.toFixed(2) || '0.00'}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {(() => {
                            const isVvb = Boolean(order.isVVB) || String(order.shippingMethod || '').toLowerCase().includes('bol');
                            if (isVvb && order.latestDropOffDate) {
                              return new Date(order.latestDropOffDate).toLocaleString('nl-NL', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                                timeZone: 'Europe/Amsterdam',
                              });
                            }
                            return order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('nl-NL') : '-';
                          })()}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm text-slate-900">{order.supplierTracking || order?.tracking?.trackingCode || '-'}</span>
                        </TableCell>
                        <TableCell className="text-center" onClick={(event) => event.stopPropagation()}>
                          {isGlobalAdmin && (() => {
                            const shippingSelection = getOrderShippingContractId(order);
                            const shippingMeta = resolveShippingSelectionMeta(shippingSelection);
                            const isDisabled = normalizeOrderStatus(order) === 'verzonden' || savingShippingMethodOrderId === order.id;

                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto rounded-xl p-1.5 transition-all duration-200 hover:bg-slate-100 hover:shadow-sm hover:scale-[1.04]"
                                    disabled={isDisabled}
                                    aria-label="Wijzig verzendmethode"
                                    title={isDisabled ? shippingMeta.label : `Verzendmethode: ${shippingMeta.label}. Klik om te wijzigen`}
                                  >
                                    <div className="relative flex items-center justify-center">
                                      {shippingMeta.logo ? (
                                        <div className="w-9 h-9 p-1.5 flex items-center justify-center">
                                          <img src={shippingMeta.logo} alt={shippingMeta.label} className="w-full h-full object-contain" />
                                        </div>
                                      ) : (
                                        <div className="w-9 h-9 flex items-center justify-center">
                                          {shippingMeta.icon
                                            ? renderShippingSelectionIcon(shippingMeta, 'w-9 h-9', false)
                                            : <span className="text-xs text-slate-400">-</span>}
                                        </div>
                                      )}
                                    </div>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="center" className="border-slate-200 shadow-lg min-w-[240px]">
                                  {carrierContracts
                                    .filter((contract) => String(contract.carrierType || '').toLowerCase() !== 'wegrow')
                                    .map((contract) => {
                                      const contractValue = String(contract.id);
                                      const contractMeta = resolveShippingSelectionMeta(contractValue);

                                      return (
                                        <DropdownMenuItem
                                          key={`contract-${contractValue}`}
                                          className="cursor-pointer"
                                          onSelect={async () => {
                                            if (typeof order.id !== 'number') return;
                                            handleShippingMethodDraftChange(order.id, contractValue);
                                            await handleSaveShippingMethod(order, contractValue);
                                          }}
                                        >
                                          <div className="flex items-center gap-2">
                                            {renderShippingSelectionIcon(contractMeta)}
                                            <span>{contractMeta.label}</span>
                                          </div>
                                        </DropdownMenuItem>
                                      );
                                    })}

                                  {shippingMethodDropdownOptions.map((option) => {
                                    const optionMeta = resolveShippingSelectionMeta(option.value);

                                    return (
                                      <DropdownMenuItem
                                        key={`dropdown-${option.value}`}
                                        className="cursor-pointer"
                                        onSelect={async () => {
                                          if (typeof order.id !== 'number') return;
                                          handleShippingMethodDraftChange(order.id, option.value);
                                          await handleSaveShippingMethod(order, option.value);
                                        }}
                                      >
                                        <div className="flex items-center gap-2">
                                          {renderShippingSelectionIcon(optionMeta)}
                                          <span>{optionMeta.label}</span>
                                        </div>
                                      </DropdownMenuItem>
                                    );
                                  })}

                                  {(() => {
                                    const currentSelection = getOrderShippingContractId(order);
                                    if (!currentSelection) return null;

                                    const hasContractOption = carrierContracts.some(
                                      (contract) => String(contract.id) === currentSelection
                                    );
                                    const hasManualOption = isManualShippingOverride(currentSelection);
                                    const hasDropdownOption = shippingMethodDropdownOptions.some(
                                      (option) => option.value === currentSelection
                                    );

                                    if (hasContractOption || hasManualOption || hasDropdownOption) return null;

                                    const fallbackMeta = resolveShippingSelectionMeta(currentSelection);

                                    return (
                                      <DropdownMenuItem
                                        className="cursor-pointer"
                                        onSelect={async () => {
                                          if (typeof order.id !== 'number') return;
                                          handleShippingMethodDraftChange(order.id, currentSelection);
                                          await handleSaveShippingMethod(order, currentSelection);
                                        }}
                                      >
                                        <div className="flex items-center gap-2">
                                          {renderShippingSelectionIcon(fallbackMeta)}
                                          <span>{fallbackMeta.label}</span>
                                        </div>
                                      </DropdownMenuItem>
                                    );
                                  })()}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getOrderStatusBadge(order.status || 'onderweg-ffm')}
                            {getFulfillmentTypeBadge(order.fulfillmentType)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                          {isGlobalAdmin && (
                            <div className="flex items-center justify-end">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="border border-slate-200 shadow-sm hover:bg-slate-100 hover:shadow cursor-pointer"
                                    aria-label="Meer acties"
                                    title="Meer acties"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="border-slate-200 shadow-lg">
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onSelect={() => handleOpenLabelDialog(order)}
                                  >
                                    <Package className="w-4 h-4" />
                                    Label genereren
                                  </DropdownMenuItem>
                                  {order?.label?.labelUrl && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="cursor-pointer"
                                        onSelect={() => window.open(order.label.labelUrl, '_blank', 'noreferrer')}
                                      >
                                        <Download className="w-4 h-4" />
                                        Label downloaden
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  {returnCarrierContracts.length > 0 && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="cursor-pointer text-violet-700 focus:text-violet-700 focus:bg-violet-50"
                                        onSelect={() => handleOpenReturnLabelDialog(order)}
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                        Retourlabel genereren
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    
                      {/* Expanded Details Row */}
                      {expandedOrder === order.orderNumber && (
                        <TableRow className="bg-gradient-to-r from-slate-50/80 to-indigo-50/30">
                          <TableCell colSpan={12} className="p-6">
                            <div className="flex gap-6">
                              {/* Left Column - Basic Info */}
                              <div className="flex-1 space-y-6">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">
                                      {order.storeName}
                                    </Badge>
                                    <span className="text-slate-600">{order.orderNumber}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {editingOrderId === order.id ? (
                                      <>
                                        <Button size="sm" variant="outline" className="h-7 text-xs border-slate-200" onClick={() => setEditingOrderId(null)}>
                                          Annuleren
                                        </Button>
                                        <Button size="sm" className="h-7 text-xs bg-gradient-to-r from-indigo-500 to-purple-500" onClick={async () => {
                                          try {
                                            await api.updateOrder(order.id, { customerName: editForm.customerName, address: editForm.address });
                                            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, customerName: editForm.customerName, address: editForm.address } : o));
                                            setEditingOrderId(null);
                                            toast.success('Order bijgewerkt');
                                          } catch {
                                            toast.error('Kon order niet bijwerken');
                                          }
                                        }}>
                                          Opslaan
                                        </Button>
                                      </>
                                    ) : (
                                      <Button size="sm" variant="outline" className="h-7 text-xs border-slate-200" onClick={() => {
                                        setEditForm({ customerName: order.customerName, address: order.address });
                                        setEditingOrderId(order.id);
                                      }}>
                                        <Pencil className="w-3 h-3 mr-1" />
                                        Bewerken
                                      </Button>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                      <MapPin className="w-4 h-4" />
                                      <span>Ontvanger</span>
                                    </div>
                                    {editingOrderId === order.id ? (
                                      <Input
                                        value={editForm.customerName}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, customerName: e.target.value }))}
                                        className="border-slate-200 h-8 text-sm"
                                      />
                                    ) : (
                                      <p className="text-sm text-slate-900">{order.customerName}</p>
                                    )}
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                      <MapPin className="w-4 h-4" />
                                      <span>Adres</span>
                                    </div>
                                    {editingOrderId === order.id ? (
                                      <Input
                                        value={editForm.address}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                                        className="border-slate-200 h-8 text-sm"
                                      />
                                    ) : (
                                      <p className="text-sm text-slate-900">{order.address}</p>
                                    )}
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                      <Calendar className="w-4 h-4" />
                                      <span>Besteldatum</span>
                                    </div>
                                    <p className="text-sm text-slate-900">
                                      {order.orderDate ? new Date(order.orderDate).toLocaleDateString('nl-NL') : '-'}
                                    </p>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                      <Calendar className="w-4 h-4" />
                                      <span>Vroegste inleverdatum</span>
                                    </div>
                                    <p className="text-sm text-slate-900">
                                      {resolveDropOffDateRange(order).earliestDropOffDate
                                        ? resolveDropOffDateRange(order).earliestDropOffDate?.toLocaleDateString('nl-NL')
                                        : '-'}
                                    </p>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                      <ShoppingCart className="w-4 h-4" />
                                      <span>Platform</span>
                                    </div>
                                    <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
                                      {order.platform}
                                    </Badge>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                      <Calendar className="w-4 h-4" />
                                      <span>Uiterste inleverdatum</span>
                                    </div>
                                    <p className="text-sm text-slate-900">
                                      {resolveDropOffDateRange(order).latestDropOffDate
                                        ? resolveDropOffDateRange(order).latestDropOffDate?.toLocaleDateString('nl-NL')
                                        : '-'}
                                    </p>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                      <Package className="w-4 h-4" />
                                      <span>Orderstatus</span>
                                    </div>
                                    <div>{getStatusBadge(normalizeOrderStatus(order))}</div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                      <Euro className="w-4 h-4" />
                                      <span>Orderwaarde</span>
                                    </div>
                                    <p className="text-sm text-slate-900">€ {order.orderValue?.toFixed(2) || '0.00'}</p>
                                  </div>

                                  {isGlobalAdmin && (
                                  <div className="space-y-2 col-span-2">
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                      <Package className="w-4 h-4" />
                                      <span>Verzendmethode (handmatig)</span>
                                    </div>
                                    <p className="text-sm text-slate-700">
                                      Huidig: {resolveShippingSelectionMeta(String(order.shippingMethod || '')).label}
                                    </p>
                                    {(() => {
                                      const currentShippingMeta = resolveShippingSelectionMeta(getOrderShippingContractId(order));
                                      if (!currentShippingMeta.logo && !currentShippingMeta.icon) return null;

                                      return (
                                        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white p-3">
                                          {renderShippingSelectionIcon(currentShippingMeta)}
                                          <span className="text-xs text-slate-700">{currentShippingMeta.label}</span>
                                        </div>
                                      );
                                    })()}
                                    <Select
                                      value={getOrderShippingContractId(order)}
                                      onValueChange={async (value: string) => {
                                        if (typeof order.id !== 'number') return;
                                        handleShippingMethodDraftChange(order.id, value);
                                        await handleSaveShippingMethod(order, value);
                                      }}
                                      disabled={
                                        normalizeOrderStatus(order) === 'verzonden'
                                        || savingShippingMethodOrderId === order.id
                                      }
                                    >
                                      <SelectTrigger className="w-full border-slate-200 shadow-sm">
                                        <SelectValue placeholder="Selecteer verzendmethode">
                                          {(() => {
                                            const selectionMeta = resolveShippingSelectionMeta(getOrderShippingContractId(order));
                                            return (
                                              <div className="flex items-center gap-2 min-w-0">
                                                {renderShippingSelectionIcon(selectionMeta)}
                                                <span className="truncate">{selectionMeta.label}</span>
                                              </div>
                                            );
                                          })()}
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent className="border-slate-200 shadow-lg">
                                        {carrierContracts
                                          .filter((contract) => String(contract.carrierType || '').toLowerCase() !== 'wegrow')
                                          .map((contract) => {
                                          const contractValue = String(contract.id);
                                          const contractMeta = resolveShippingSelectionMeta(contractValue);
                                          return (
                                            <SelectItem key={`contract-${contractValue}`} value={contractValue}>
                                              <div className="flex items-center gap-2">
                                                {renderShippingSelectionIcon(contractMeta)}
                                                <span>{contractMeta.label}</span>
                                              </div>
                                            </SelectItem>
                                          );
                                        })}
                                        {shippingMethodDropdownOptions.map((option) => {
                                          const optionMeta = resolveShippingSelectionMeta(option.value);
                                          return (
                                            <SelectItem key={`dropdown-${option.value}`} value={option.value}>
                                              <div className="flex items-center gap-2">
                                                {renderShippingSelectionIcon(optionMeta)}
                                                <span>{optionMeta.label}</span>
                                              </div>
                                            </SelectItem>
                                          );
                                        })}
                                        {(() => {
                                          const currentSelection = getOrderShippingContractId(order);
                                          if (!currentSelection) return null;
                                          const hasContractOption = carrierContracts.some((contract) => String(contract.id) === currentSelection);
                                          const hasManualOption = isManualShippingOverride(currentSelection);
                                          const hasDropdownOption = shippingMethodDropdownOptions.some((option) => option.value === currentSelection);
                                          if (hasContractOption || hasManualOption || hasDropdownOption) return null;
                                          const fallbackMeta = resolveShippingSelectionMeta(currentSelection);
                                          return (
                                            <SelectItem value={currentSelection}>
                                              <div className="flex items-center gap-2">
                                                {renderShippingSelectionIcon(fallbackMeta)}
                                                <span>{fallbackMeta.label}</span>
                                              </div>
                                            </SelectItem>
                                          );
                                        })()}
                                      </SelectContent>
                                    </Select>
                                    {savingShippingMethodOrderId === order.id && (
                                      <div className="flex items-center gap-2 text-xs text-slate-500">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Opslaan...
                                      </div>
                                    )}
                                  </div>
                                  )}
                                </div>
                              </div>

                              {/* Right Column - Product Info */}
                              {order.orderItems && order.orderItems.length > 0 && (
                                <div className="w-80 p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
                                  {order.orderItems.map((item: any, idx: number) => (
                                    <div key={idx} className="space-y-3">
                                      <div className="aspect-square w-full bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center">
                                        {(item.productImage || order.productImage) ? (
                                          <img 
                                            src={item.productImage || order.productImage}
                                            alt={item.productName || order.productName || 'Product afbeelding'}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <ImageIcon className="w-10 h-10 text-slate-400" />
                                        )}
                                      </div>
                                      
                                      <div className="space-y-3">
                                        <p className="text-sm text-slate-900 line-clamp-2">{item.productName}</p>
                                        
                                        <div className="space-y-2 pt-2 border-t border-slate-200">
                                          {item.ean && (
                                            <div className="flex justify-between text-sm">
                                              <span className="text-slate-500">EAN</span>
                                              <span className="text-slate-900 font-mono">{item.ean}</span>
                                            </div>
                                          )}
                                          {item.sku && (
                                            <div className="flex justify-between items-center gap-3 text-sm">
                                              <span className="text-slate-500">SKU</span>
                                              <span className="text-slate-900 font-mono max-w-[170px] truncate text-right" title={item.sku}>
                                                {item.sku}
                                              </span>
                                            </div>
                                          )}
                                          <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Aantal besteld</span>
                                            <span className="text-slate-900">{item.quantity || order.itemCount}</span>
                                          </div>
                                          <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Prijs</span>
                                            <span className="text-slate-900">€ {item.price?.toFixed(2) || '0.00'}</span>
                                          </div>
                                          {item.weight && (
                                            <div className="flex justify-between text-sm">
                                              <span className="text-slate-500">Gewicht</span>
                                              <span className="text-slate-900">{item.weight}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Summary */}
          <div className="mt-6 flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-indigo-50/30 rounded-xl border border-slate-200">
            <div className="text-sm text-slate-700">
              {totalOrders} orders gevonden
              {totalOrders > 0 && (
                <span className="text-slate-500"> • {startOrderIndex} - {endOrderIndex}</span>
              )}
            </div>
            <div className="flex gap-6 text-sm">
              <span className="text-slate-600">
                <span className="text-orange-600">●</span> Openstaand: {filteredOrders.filter((o) => normalizeOrderStatus(o) === 'openstaand').length}
              </span>
              <span className="text-slate-600">
                <span className="text-emerald-600">●</span> Verzonden: {filteredOrders.filter((o) => normalizeOrderStatus(o) === 'verzonden').length}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-200"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={loading || currentPage <= 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Vorige
            </Button>
            <span className="text-sm text-slate-600 px-2">
              Pagina {currentPage} van {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-200"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={loading || currentPage >= totalPages}
            >
              Volgende
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== NORMAL LABEL DIALOG ===== */}
      <Dialog
        open={showLabelDialog}
        onOpenChange={(open: boolean) => {
          setShowLabelDialog(open);
          if (!open) {
            setSelectedWeGrowCarrier('');
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl min-h-[800px] h-[96vh] max-h-[96vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Label genereren</DialogTitle>
            <DialogDescription>
              Selecteer een contract en genereer een verzendlabel voor {labelOrder?.orderNumber || 'de order'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-auto">
            <div className="space-y-2">
              <label className="text-sm text-slate-700">Contract</label>
              {loadingCarriers ? (
                <div className="text-sm text-slate-500">Contracten laden...</div>
              ) : labelDialogContracts.length === 0 ? (
                <div className="text-sm text-slate-500">Geen actieve contracten</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {labelDialogContracts.flatMap((contract) => {
                    if (contract.carrierType === 'wegrow') {
                      return wegrowCarrierOptions.map((option) => {
                        const syntheticId = `wegrow-${contract.id}-${option.id}`;
                        const isSelected = selectedContractId === String(contract.id) && selectedWeGrowCarrier === option.id;
                        return (
                          <label
                            key={syntheticId}
                            htmlFor={`contract-${syntheticId}`}
                            className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                              isSelected
                                ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                            }`}
                            onClick={() => {
                              setSelectedContractId(String(contract.id));
                              setSelectedWeGrowCarrier(option.id);
                            }}
                          >
                            <input
                              type="radio"
                              checked={isSelected}
                              onChange={() => {}}
                              className="mt-0.5 accent-indigo-600"
                            />
                            <div className="w-8 h-8 rounded-md bg-white border border-slate-200 p-1 flex items-center justify-center">
                              <img src={option.logo} alt={option.name} className="w-full h-full object-contain" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm text-slate-900 truncate">{option.name}</div>
                            </div>
                          </label>
                        );
                      });
                    }

                    const logo = carrierLogoMap[contract.carrierType] || null;
                    const isSelected = selectedContractId === String(contract.id);
                    return [(
                      <label
                        key={contract.id}
                        onClick={() => { setSelectedContractId(String(contract.id)); setSelectedWeGrowCarrier(''); }}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                        }`}
                      >
                        <input
                          type="radio"
                          checked={isSelected}
                          onChange={() => {}}
                          className="mt-0.5 accent-indigo-600"
                        />
                        {logo && (
                          <div className="w-8 h-8 rounded-md bg-white border border-slate-200 p-1 flex items-center justify-center">
                            <img src={logo} alt={contract.carrierType} className="w-full h-full object-contain" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm text-slate-900 truncate">{contract.contractName}</div>
                          <div className={`text-xs uppercase ${isSelected ? 'text-indigo-700' : 'text-slate-500'}`}>
                            {contract.carrierType}
                          </div>
                        </div>
                      </label>
                    )];
                  })}
                </div>
              )}
            </div>

            {isVvbContractSelected && (
              <div className="space-y-3 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-indigo-50/60 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white border border-sky-200 p-1.5 flex items-center justify-center shadow-sm">
                    <img src={bolLogo} alt="Bol.com" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-900">Bol delivery option</label>
                    <p className="text-xs text-slate-600">Kies welke Bol handover optie gebruikt moet worden voor dit VVB-label.</p>
                  </div>
                </div>

                {loadingBolDeliveryOptions ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Delivery options laden...
                  </div>
                ) : bolDeliveryOptions.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-3 text-sm text-slate-500">
                    Geen Bol delivery options gevonden voor deze order
                  </div>
                ) : (
                  <Select value={selectedBolDeliveryOptionId} onValueChange={setSelectedBolDeliveryOptionId}>
                    <SelectTrigger className="h-12 border-sky-200 bg-white shadow-sm data-[placeholder]:text-slate-500">
                      <SelectValue placeholder="Kies een delivery option">
                        {selectedBolDeliveryOption ? (() => {
                          const transporter = String(selectedBolDeliveryOption?.transporterCode || 'Onbekend');
                          return (
                            <div className="flex min-w-0 items-center gap-2 text-left">
                              <Truck className="w-4 h-4 text-sky-700 shrink-0" />
                              <span className="truncate text-sm font-medium text-slate-900">{transporter}</span>
                              {selectedBolDeliveryOption?.recommended && (
                                <span className="inline-flex shrink-0 items-center ms-3 px-3 py-1 rounded-full text-sm font-medium leading-none text-white transition-all bg-gradient-to-r from-emerald-500 to-teal-500 shadow-md">
                                  Aanbevolen
                                </span>
                              )}
                            </div>
                          );
                        })() : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="border-slate-200 shadow-lg max-h-80">
                      {bolDeliveryOptions.map((option, index) => {
                        const optionId = String(option?.shippingLabelOfferId || '').trim() || `option-${index}`;
                        const earliest = formatBolDeliveryOptionDateTime(option?.handoverDetails?.earliestHandoverDateTime);
                        const latest = formatBolDeliveryOptionDateTime(option?.handoverDetails?.latestHandoverDateTime);
                        const transporter = String(option?.transporterCode || 'Onbekend');
                        const collectionMethod = String(option?.handoverDetails?.collectionMethod || '-');

                        return (
                          <SelectItem key={`${optionId}-${index}`} value={optionId}>
                            <div className="flex min-w-0 items-start gap-3 py-1.5">
                              <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                                <Truck className="w-4 h-4 text-sky-700" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-slate-900">{transporter}</span>
                                  {option?.recommended && (
                                    <Badge className="rounded-full border-0 bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg">
                                      Aanbevolen
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-1 text-xs text-slate-600">
                                  {earliest} {'->'} {latest}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Inlevermethode: {collectionMethod}
                                </div>
                              </div>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}

                {selectedBolDeliveryOption && !loadingBolDeliveryOptions && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border border-sky-200 bg-white/80 p-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Vervoerder</div>
                      <div className="text-sm text-slate-900 font-medium">{String(selectedBolDeliveryOption?.transporterCode || 'Onbekend')}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Venster</div>
                      <div className="text-sm text-slate-900">{formatBolDeliveryOptionDateTime(selectedBolDeliveryOption?.handoverDetails?.earliestHandoverDateTime)} {'->'} {formatBolDeliveryOptionDateTime(selectedBolDeliveryOption?.handoverDetails?.latestHandoverDateTime)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Inlevermethode</div>
                      <div className="text-sm text-slate-900">{String(selectedBolDeliveryOption?.handoverDetails?.collectionMethod || '-')}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {labelPreviewUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">Label preview</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="border-slate-200 shadow-sm" asChild>
                      <a href={labelPreviewUrl} target="_blank" rel="noreferrer">
                        <Eye className="w-4 h-4 mr-1.5" />
                        Volledige preview
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-200 shadow-sm"
                      onClick={() => downloadLabelFile(labelPreviewUrl, `label-${labelOrder?.orderNumber || 'download'}.pdf`)}
                    >
                      <Download className="w-4 h-4 mr-1.5" />
                      Download label
                    </Button>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <iframe title="Label preview" src={labelPreviewUrl} className="w-full h-full min-h-[760px]" />
                </div>
                {generatedLabelMeta && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-slate-200 rounded-lg p-3 bg-slate-50/60">
                    <div>
                      <div className="text-xs text-slate-500">Shipment ID</div>
                      <div className="text-sm text-slate-900 font-mono break-all">{generatedLabelMeta.shipmentId || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Tracking</div>
                      <div className="text-sm text-slate-900 font-mono break-all">{generatedLabelMeta.trackingCode || '-'}</div>
                    </div>
                    {generatedLabelMeta.trackingUrl && (
                      <div className="md:col-span-2">
                        <div className="text-xs text-slate-500">Tracking URL</div>
                        <a href={generatedLabelMeta.trackingUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:text-indigo-700 break-all">
                          {generatedLabelMeta.trackingUrl}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLabelDialog(false)} className="border-slate-200">
              Sluiten
            </Button>
            <Button
              onClick={handleGenerateLabel}
              disabled={
                !selectedContractId
                || (isWeGrowContractSelected && !selectedWeGrowCarrier)
                || (isVvbContractSelected && (!selectedBolDeliveryOptionId || loadingBolDeliveryOptions || bolDeliveryOptions.length === 0))
                || generatingLabel
              }
              className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
            >
              {generatingLabel && <Loader2 className="w-4 h-4 animate-spin" />}
              {isVvbContractSelected ? 'Bol label genereren' : 'Label genereren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== RETURN LABEL DIALOG ===== */}
      <Dialog
        open={showReturnLabelDialog}
        onOpenChange={(open: boolean) => {
          setShowReturnLabelDialog(open);
          if (!open) {
            setSelectedReturnContractId('');
            setSelectedReturnWeGrowCarrier('');
            setReturnLabelPreviewUrl('');
            setGeneratedReturnLabelMeta(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl min-h-[600px] h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <RotateCcw className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <DialogTitle>Retourlabel genereren</DialogTitle>
                <DialogDescription>
                  Retourlabel voor {returnLabelOrder?.orderNumber || 'de order'} — klant verzendt terug naar warehouse.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-auto">

            {/* Address summary */}
            {returnLabelOrder && (
              <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-purple-50/40 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowLeftRight className="w-4 h-4 text-violet-500" />
                  <span className="text-sm text-violet-800">Adressen omgedraaid voor retour</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-white border border-violet-100 p-3 space-y-1">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Zender (klant)</div>
                    <div className="text-sm text-slate-900">{returnLabelOrder.customerName}</div>
                    <div className="text-xs text-slate-600">{returnLabelOrder.address || '-'}</div>
                    <div className="text-xs text-slate-500">{returnLabelOrder.country || 'NL'}</div>
                  </div>
                  <div className="rounded-lg bg-white border border-violet-100 p-3 space-y-1">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Ontvanger (warehouse)</div>
                    {selectedReturnContract?.credentials?.senderName || selectedReturnContract?.credentials?.senderName1 ? (
                      <>
                        <div className="text-sm text-slate-900">
                          {selectedReturnContract.credentials.senderName || selectedReturnContract.credentials.senderName1}
                        </div>
                        <div className="text-xs text-slate-600">
                          {[
                            selectedReturnContract.credentials.senderStreet,
                            selectedReturnContract.credentials.senderZipCode || selectedReturnContract.credentials.senderPostalCode,
                            selectedReturnContract.credentials.senderCity,
                          ].filter(Boolean).join(', ') || '-'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {selectedReturnContract.credentials.senderCountry || 'NL'}
                        </div>
                      </>
                    ) : warehouseAddress ? (
                      <>
                        <div className="text-sm text-slate-900">{warehouseAddress.name || '-'}</div>
                        <div className="text-xs text-slate-600">
                          {[warehouseAddress.street, warehouseAddress.houseNumber].filter(Boolean).join(' ')}
                          {warehouseAddress.postalCode || warehouseAddress.city ? `, ${[warehouseAddress.postalCode, warehouseAddress.city].filter(Boolean).join(' ')}` : ''}
                        </div>
                        <div className="text-xs text-slate-500">{warehouseAddress.country || 'NL'}</div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-400 italic">
                        {selectedReturnContractId
                          ? 'Geen warehouse adres ingesteld'
                          : 'Selecteer eerst een contract'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Contract selection */}
            <div className="space-y-2">
              <label className="text-sm text-slate-700">Contract (alleen met retourlabels ingeschakeld)</label>
              {loadingCarriers ? (
                <div className="text-sm text-slate-500">Contracten laden...</div>
              ) : returnCarrierContracts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/40 p-4 text-sm text-slate-500">
                  Geen contracten met retourlabels ingeschakeld. Ga naar{' '}
                  <span className="text-violet-600">Vervoerders → Instellingen</span>{' '}
                  en zet "Retourlabels inschakelen" aan bij DPD of WeGrow.
                </div>
              ) : (
                <RadioGroup
                  value={selectedReturnContractId}
                  onValueChange={(value: string) => {
                    setSelectedReturnContractId(value);
                    const contract = returnCarrierContracts.find((entry) => String(entry.id) === value);
                    if (contract?.carrierType !== 'wegrow') {
                      setSelectedReturnWeGrowCarrier('');
                    }
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-3"
                >
                  {returnCarrierContracts.map((contract) => {
                    const logo = carrierLogoMap[contract.carrierType] || null;
                    const isSelected = selectedReturnContractId === String(contract.id);

                    return (
                      <label
                        key={contract.id}
                        htmlFor={`return-contract-${contract.id}`}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-violet-300 bg-violet-50 ring-1 ring-violet-200'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                        }`}
                      >
                        <RadioGroupItem
                          id={`return-contract-${contract.id}`}
                          value={String(contract.id)}
                          className="mt-0.5"
                        />
                        {logo && (
                          <div className="w-8 h-8 rounded-md bg-white border border-slate-200 p-1 flex items-center justify-center">
                            <img src={logo} alt={contract.carrierType} className="w-full h-full object-contain" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm text-slate-900 truncate">{contract.contractName}</div>
                          <div className={`text-xs uppercase ${isSelected ? 'text-violet-700' : 'text-slate-500'}`}>
                            {contract.carrierType}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup>
              )}
            </div>

            {/* Return label preview */}
            {returnLabelPreviewUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">Retourlabel preview</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="border-slate-200 shadow-sm" asChild>
                      <a href={returnLabelPreviewUrl} target="_blank" rel="noreferrer">
                        <Eye className="w-4 h-4 mr-1.5" />
                        Volledige preview
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-200 shadow-sm"
                      onClick={() => downloadLabelFile(returnLabelPreviewUrl, `retourlabel-${returnLabelOrder?.orderNumber || 'download'}.pdf`)}
                    >
                      <Download className="w-4 h-4 mr-1.5" />
                      Download label
                    </Button>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <iframe title="Retourlabel preview" src={returnLabelPreviewUrl} className="w-full h-full min-h-[500px]" />
                </div>
                {generatedReturnLabelMeta && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-slate-200 rounded-lg p-3 bg-slate-50/60">
                    <div>
                      <div className="text-xs text-slate-500">Shipment ID</div>
                      <div className="text-sm text-slate-900 font-mono break-all">{generatedReturnLabelMeta.shipmentId || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Tracking</div>
                      <div className="text-sm text-slate-900 font-mono break-all">{generatedReturnLabelMeta.trackingCode || '-'}</div>
                    </div>
                    {generatedReturnLabelMeta.trackingUrl && (
                      <div className="md:col-span-2">
                        <div className="text-xs text-slate-500">Tracking URL</div>
                        <a href={generatedReturnLabelMeta.trackingUrl} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 hover:text-indigo-700 break-all">
                          {generatedReturnLabelMeta.trackingUrl}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReturnLabelDialog(false)} className="border-slate-200">
              Sluiten
            </Button>
            <Button
              onClick={handleGenerateReturnLabel}
              disabled={
                !selectedReturnContractId
                || generatingReturnLabel
              }
              className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
            >
              {generatingReturnLabel && <Loader2 className="w-4 h-4 animate-spin" />}
              <RotateCcw className="w-4 h-4" />
              Retourlabel genereren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== PICKLIJST DIALOG ===== */}
      <Dialog open={showPicklistDialog} onOpenChange={setShowPicklistDialog}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <DialogTitle>Picklijst</DialogTitle>
                <DialogDescription>
                  {selectedOrders.length} order(s) geselecteerd om te picken
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-4">
            {loadingPicklist ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : (
              picklistData.map((order) => (
                <div key={order.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-medium text-slate-900">{order.orderNumber}</span>
                      <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">
                        {order.storeName}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-500">{order.customerName}</span>
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white h-9 px-4 text-sm font-medium"
                        disabled={pickingOrders}
                        onClick={async () => {
                          try {
                            setPickingOrders(true);
                            await api.pickOrders([order.id], activeProfile);
                            toast.success(`Order ${order.orderNumber} gepickt`);
                            setSelectedOrders(prev => prev.filter(id => id !== order.id));
                            setPicklistData(prev => prev.filter(o => o.id !== order.id));
                            loadOrders();
                            if (picklistData.length <= 1) {
                              setShowPicklistDialog(false);
                            }
                          } catch {
                            toast.error('Kon order niet picken');
                          } finally {
                            setPickingOrders(false);
                          }
                        }}
                      >
                        <CheckSquare className="w-3 h-3" />
                        Gepickt
                      </Button>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {order.orderItems?.map((item: any) => (
                      <div key={item.id} className="px-4 py-4 flex items-center gap-6">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{item.productName}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{item.ean || '-'}</p>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="flex flex-col gap-1">
                            {item.product?.locations?.length > 0 ? (
                              item.product.locations.map((loc: any, i: number) => (
                                <span key={i} className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold px-3 py-1.5 rounded-lg font-mono">
                                  📍 {loc.location}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400 text-sm">Geen locatie</span>
                            )}
                          </div>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs text-slate-400">Aantal</span>
                            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold text-lg">
                              {item.quantity}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="border-slate-200 gap-2"
              onClick={() => {
                const printWindow = window.open('', '_blank');
                if (!printWindow) return;
                const html = `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <title>Picklijst</title>
                    <style>
                      body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; }
                      h1 { font-size: 20px; margin-bottom: 4px; }
                      .subtitle { color: #666; margin-bottom: 24px; }
                      .order { border: 1px solid #ddd; border-radius: 8px; margin-bottom: 16px; overflow: hidden; }
                      .order-header { background: #f5f5f5; padding: 10px 16px; display: flex; justify-content: space-between; font-weight: bold; }
                      .item { padding: 10px 16px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
                      .item-info { flex: 1; }
                      .item-name { font-weight: 500; margin-bottom: 2px; }
                      .item-ean { color: #888; font-size: 11px; font-family: monospace; }
                      .item-location { background: #fff8e1; border: 1px solid #f0c040; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-family: monospace; }
                      .item-qty { width: 32px; height: 32px; border-radius: 50%; background: #e8e8ff; color: #3333aa; font-weight: bold; display: flex; align-items: center; justify-content: center; font-size: 14px; }
                      @media print { body { padding: 0; } }
                    </style>
                  </head>
                  <body>
                    <h1>Picklijst</h1>
                    <p class="subtitle">${picklistData.length} order(s) — ${new Date().toLocaleDateString('nl-NL')}</p>
                    ${picklistData.map(order => `
                      <div class="order">
                        <div class="order-header">
                          <span>${order.orderNumber} — ${order.storeName}</span>
                          <span>${order.customerName}</span>
                        </div>
                        ${(order.orderItems || []).map((item: any) => `
                          <div class="item">
                            <div class="item-info">
                              <div class="item-name">${item.productName}</div>
                              <div class="item-ean">${item.ean || '-'}</div>
                            </div>
                            <div style="display:flex;align-items:center;gap:12px;">
                              ${item.product?.locations?.length > 0
                                ? item.product.locations.map((loc: any) => `<span class="item-location">📍 ${loc.location}</span>`).join(' ')
                                : '<span style="color:#aaa;font-size:11px;">Geen locatie</span>'
                              }
                              <div class="item-qty">${item.quantity}</div>
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    `).join('')}
                    <script>window.onload = () => { window.print(); }</script>
                  </body>
                  </html>
                `;
                printWindow.document.write(html);
                printWindow.document.close();
              }}
            >
              <Download className="w-4 h-4" />
              Afdrukken
            </Button>
            <Button variant="outline" onClick={() => setShowPicklistDialog(false)} className="border-slate-200">
              Sluiten
            </Button>
            <Button
              onClick={handlePickOrders}
              disabled={pickingOrders || loadingPicklist}
              className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
            >
              {pickingOrders && <Loader2 className="w-4 h-4 animate-spin" />}
              <CheckSquare className="w-4 h-4" />
              Alles gepickt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>          

    </div>
  );
}