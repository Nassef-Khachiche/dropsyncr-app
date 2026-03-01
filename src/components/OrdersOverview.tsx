import { useState, useEffect, Fragment } from 'react';
import { api } from '../services/api';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
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
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Trash2,
  MapPin,
  Calendar,
  ShoppingCart,
  Euro,
  Package,
  Truck,
  ImageIcon,
  Weight
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

const dhlLogo = new URL('../assets/dhl-logo.png', import.meta.url).href;
const dpdLogo = new URL('../assets/dpd-logo.png', import.meta.url).href;
const wegrowLogo = new URL('../assets/wegrow-logo.jpg', import.meta.url).href;

interface OrdersOverviewProps {
  activeProfile: string;
}

interface CarrierContract {
  id: number;
  carrierType: string;
  contractName: string;
  active: boolean;
}

export function OrdersOverview({ activeProfile }: OrdersOverviewProps) {
  const carrierLogoMap: Record<string, string> = {
    dhl: dhlLogo,
    dpd: dpdLogo,
    wegrow: wegrowLogo,
  };

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
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelOrder, setLabelOrder] = useState<any | null>(null);
  const [carrierContracts, setCarrierContracts] = useState<CarrierContract[]>([]);
  const [loadingCarriers, setLoadingCarriers] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [generatingLabel, setGeneratingLabel] = useState(false);
  const [labelPreviewUrl, setLabelPreviewUrl] = useState<string>('');
  const [generatedLabelMeta, setGeneratedLabelMeta] = useState<{
    shipmentId?: string | null;
    trackingCode?: string | null;
    trackingUrl?: string | null;
  } | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [deletingOrderIds, setDeletingOrderIds] = useState<number[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    if (activeProfile) {
      loadOrders();
    }
  }, [activeProfile, filterStatus, searchQuery]);

  useEffect(() => {
    setFilterStore('all');
  }, [activeProfile]);

  useEffect(() => {
    if (activeProfile && activeProfile !== 'all') {
      loadCarrierContracts();
    } else {
      setCarrierContracts([]);
    }
  }, [activeProfile]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const [data, integrationsData] = await Promise.all([
        api.getOrders({
          installationId: isAllStoresSelected ? undefined : activeProfile,
          userScoped: isAllStoresSelected,
          status: filterStatus !== 'all' ? filterStatus : undefined,
          search: searchQuery || undefined,
          limit: 100,
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
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCarrierContracts = async () => {
    try {
      setLoadingCarriers(true);
      const data = await api.getCarriers(activeProfile);
      const filtered = (data || [])
        .filter((carrier: any) => carrier.active)
        .map((carrier: any) => ({
          id: carrier.id,
          carrierType: carrier.carrierType,
          contractName: carrier.contractName,
          active: carrier.active,
        }));
      setCarrierContracts(filtered);
    } catch (error) {
      console.error('Failed to load carriers:', error);
    } finally {
      setLoadingCarriers(false);
    }
  };

  const normalizeOrderStatus = (order: any): 'openstaand' | 'verzonden' => {
    const rawStatus = String(order?.orderStatus || order?.status || '').toLowerCase();

    const openStatuses = [
      'openstaand',
      'open',
      'new',
      'announced',
      'arrived_at_wh',
      'onderweg-ffm',
      'binnengekomen-ffm',
      'label-aangemaakt',
    ];

    const shippedStatuses = [
      'verzonden',
      'verstuurd',
      'shipped',
      'delivered',
      'afgeleverd',
    ];

    if (shippedStatuses.includes(rawStatus)) return 'verzonden';
    if (openStatuses.includes(rawStatus)) return 'openstaand';

    return 'openstaand';
  };

  const handleOpenLabelDialog = (order: any) => {
    setLabelOrder(order);
    setSelectedContractId('');
    setLabelPreviewUrl('');
    setGeneratedLabelMeta(null);
    setShowLabelDialog(true);
  };

  const handleGenerateLabel = async () => {
    if (!labelOrder) return;
    if (!selectedContractId) return;

    try {
      setGeneratingLabel(true);
      const result = await api.generateCarrierLabels(Number(selectedContractId), {
        shippingMethod: null,
        packages: [
          {
            id: labelOrder.orderNumber || labelOrder.id,
            orderNumber: labelOrder.orderNumber,
            customerName: labelOrder.customerName,
            address: labelOrder.address,
            country: labelOrder.country,
            street: labelOrder.street || labelOrder.addressLine1 || labelOrder.shippingStreet || undefined,
            zipCode: labelOrder.zipCode || labelOrder.postalCode || labelOrder.shippingZipCode || undefined,
            city: labelOrder.city || labelOrder.town || labelOrder.shippingCity || undefined,
          },
        ],
      });

      const label = (result.labels || [])[0];
      if (label?.labelUrl) {
        setLabelPreviewUrl(label.labelUrl);
      }
      setGeneratedLabelMeta({
        shipmentId: label?.shipmentId || null,
        trackingCode: label?.trackingCode || null,
        trackingUrl: label?.trackingUrl || null,
      });
    } catch (error) {
      console.error('Failed to generate label:', error);
      let errorDescription = error instanceof Error ? error.message : 'Probeer het opnieuw';

      if (errorDescription.includes('ERR_DELICOM_TOKEN_INCORRECT')) {
        errorDescription = 'DPD verificatietoken is onjuist. Ga naar Vervoerders > DPD contract > Instellingen en vul een nieuw Auth Token in vanuit de DPD Login Service.';
      }

      toast.error('Kon label niet genereren', {
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

      return matchesIntegrationScope && matchesStore;
    })
    .sort((a, b) => {
      const aDate = a.orderDate ? new Date(a.orderDate).getTime() : 0;
      const bDate = b.orderDate ? new Date(b.orderDate).getTime() : 0;
      return bDate - aDate;
    });

  const storeFilterOptions = isAllStoresSelected
    ? integrationStoreOptions
    : Array.from(
        new Set(
          orders
            .map(order => order.storeName)
            .filter((storeName): storeName is string => Boolean(storeName))
        )
      ).map((storeName) => ({ id: storeName, name: storeName }));

  const toggleOrderDetails = (orderNumber: string) => {
    setExpandedOrder(expandedOrder === orderNumber ? null : orderNumber);
  };

  const filteredOrderIds = filteredOrders
    .map((order) => order.id)
    .filter((id: unknown): id is number => typeof id === 'number');
  const selectedFilteredCount = filteredOrderIds.filter((id) => selectedOrderIds.includes(id)).length;
  const allFilteredSelected = filteredOrderIds.length > 0 && selectedFilteredCount === filteredOrderIds.length;

  useEffect(() => {
    const allowedIds = new Set(filteredOrderIds);
    setSelectedOrderIds((prevSelected) => {
      const nextSelected = prevSelected.filter((id) => allowedIds.has(id));
      return nextSelected.length === prevSelected.length ? prevSelected : nextSelected;
    });
  }, [filteredOrders]);

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (!checked) {
      setSelectedOrderIds([]);
      return;
    }
    setSelectedOrderIds(filteredOrderIds);
  };

  const toggleSelectOrder = (orderId: number, checked: boolean) => {
    setSelectedOrderIds((prevSelected) => {
      if (checked) {
        if (prevSelected.includes(orderId)) return prevSelected;
        return [...prevSelected, orderId];
      }
      return prevSelected.filter((id) => id !== orderId);
    });
  };

  const handleDeleteOrder = async (order: any) => {
    if (!order?.id) {
      toast.error('Deze order kan niet worden verwijderd');
      return;
    }

    const confirmed = window.confirm(`Weet je zeker dat je order ${order.orderNumber} wilt verwijderen?`);
    if (!confirmed) return;

    try {
      setDeletingOrderIds((prev) => [...prev, order.id]);
      await api.deleteOrder(order.id);

      setOrders((prevOrders) => prevOrders.filter((entry) => entry.id !== order.id));
      setSelectedOrderIds((prevSelected) => prevSelected.filter((id) => id !== order.id));

      if (expandedOrder === order.orderNumber) {
        setExpandedOrder(null);
      }

      toast.success('Order verwijderd');
    } catch (error) {
      console.error('Failed to delete order:', error);
      toast.error('Kon order niet verwijderen', {
        description: error instanceof Error ? error.message : 'Probeer het opnieuw',
      });
    } finally {
      setDeletingOrderIds((prev) => prev.filter((id) => id !== order.id));
    }
  };

  const handleDeleteSelected = async () => {
    const selectedOrders = filteredOrders.filter((order) =>
      typeof order.id === 'number' && selectedOrderIds.includes(order.id)
    );

    if (selectedOrders.length === 0) {
      toast.error('Selecteer minimaal 1 order');
      return;
    }

    const confirmed = window.confirm(`Weet je zeker dat je ${selectedOrders.length} geselecteerde orders wilt verwijderen?`);
    if (!confirmed) return;

    try {
      setBulkDeleting(true);

      const results = await Promise.allSettled(
        selectedOrders.map((order) => api.deleteOrder(order.id))
      );

      const successfulIds: number[] = [];
      let failedCount = 0;

      results.forEach((result, index) => {
        const orderId = selectedOrders[index]?.id;
        if (result.status === 'fulfilled') {
          successfulIds.push(orderId);
        } else {
          failedCount++;
        }
      });

      if (successfulIds.length > 0) {
        const removedIdSet = new Set(successfulIds);
        setOrders((prevOrders) => prevOrders.filter((order) => !removedIdSet.has(order.id)));
        setSelectedOrderIds((prevSelected) => prevSelected.filter((id) => !removedIdSet.has(id)));

        if (expandedOrder) {
          const expandedStillExists = orders.some(
            (order) => order.orderNumber === expandedOrder && !removedIdSet.has(order.id)
          );
          if (!expandedStillExists) {
            setExpandedOrder(null);
          }
        }
      }

      if (successfulIds.length > 0) {
        toast.success(`${successfulIds.length} order${successfulIds.length === 1 ? '' : 's'} verwijderd`);
      }

      if (failedCount > 0) {
        toast.error(`${failedCount} order${failedCount === 1 ? '' : 's'} konden niet worden verwijderd`);
      }
    } catch (error) {
      console.error('Failed to delete selected orders:', error);
      toast.error('Kon geselecteerde orders niet verwijderen', {
        description: error instanceof Error ? error.message : 'Probeer het opnieuw',
      });
    } finally {
      setBulkDeleting(false);
    }
  };

  const exportToExcel = () => {
    // Prepare data for export
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
      'Trackingnummer': order.supplierTracking || '',
      'Status': order.status || '',
      'Orderstatus': order.orderStatus || '',
      'Zendingstatus': order.shippingStatus || ''
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    const colWidths = [
      { wch: 15 }, // Ordernummer
      { wch: 20 }, // Klantnaam
      { wch: 8 },  // Land
      { wch: 15 }, // Store
      { wch: 12 }, // Platform
      { wch: 12 }, // Aantal items
      { wch: 12 }, // Orderwaarde
      { wch: 15 }, // Besteldatum
      { wch: 15 }, // Leverdatum
      { wch: 40 }, // Adres
      { wch: 20 }, // Trackingnummer
      { wch: 20 }, // Status
      { wch: 15 }, // Orderstatus
      { wch: 25 }  // Zendingstatus
    ];
    ws['!cols'] = colWidths;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');

    // Generate filename with current date
    const date = new Date().toISOString().split('T')[0];
    const filename = `orders_export_${date}.xlsx`;

    // Save file
    XLSX.writeFile(wb, filename);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'verzonden') {
      return <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0">Verzonden</Badge>;
    }
    return <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">Openstaand</Badge>;
  };

  const getCountryFlag = (country: string) => {
    const flags: Record<string, string> = {
      'NL': '🇳🇱',
      'BE': '🇧🇪',
      'DE': '🇩🇪',
      'FR': '🇫🇷'
    };
    return flags[country] || '🌍';
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'openstaand':
        return <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">Openstaand</Badge>;
      case 'onderweg-ffm':
        return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">Onderweg naar FFM</Badge>;
      case 'binnengekomen-ffm':
        return <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50">Binnengekomen bij FFM</Badge>;
      case 'label-aangemaakt':
        return <Badge variant="outline" className="text-indigo-600 border-indigo-300 bg-indigo-50">Label aangemaakt</Badge>;
      case 'verstuurd':
        return <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 border-0">Verstuurd</Badge>;
      case 'afgeleverd':
        return <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0">Afgeleverd</Badge>;
      default:
        return <Badge variant="outline">Onbekend</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Bestellingen
        </h2>
        <p className="text-slate-600">Beheer en verwerk al je openstaande orders</p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-red-200 text-red-600 hover:bg-red-50"
                onClick={handleDeleteSelected}
                disabled={selectedFilteredCount === 0 || bulkDeleting}
              >
                {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Verwijder geselecteerd {selectedFilteredCount > 0 ? `(${selectedFilteredCount})` : ''}
              </Button>
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Zoek op ordernummer, klant of tracking..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-slate-200 shadow-sm"
              />
            </div>
            <Select value={filterStore} onValueChange={setFilterStore}>
              <SelectTrigger className="w-48 border-slate-200 shadow-sm">
                <SelectValue placeholder="Store" />
              </SelectTrigger>
              <SelectContent className="border-slate-200 shadow-lg">
                <SelectItem value="all">Alle stores</SelectItem>
                {storeFilterOptions.map((storeOption) => (
                  <SelectItem key={storeOption.id} value={storeOption.id}>
                    {storeOption.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48 border-slate-200 shadow-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="border-slate-200 shadow-lg">
                <SelectItem value="all">Alle statussen</SelectItem>
                <SelectItem value="openstaand">Openstaand</SelectItem>
                <SelectItem value="verzonden">Verzonden</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orders Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={(checked: boolean | 'indeterminate') => toggleSelectAllFiltered(checked === true)}
                      aria-label="Selecteer alle orders"
                    />
                  </TableHead>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Ordernummer</TableHead>
                  <TableHead>Klantnaam</TableHead>
                  <TableHead>Store naam</TableHead>
                  <TableHead className="text-center">Aantal items</TableHead>
                  <TableHead>Uiterste leverdatum</TableHead>
                  <TableHead>Trackingnummer leverancier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-slate-500">
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
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={typeof order.id === 'number' && selectedOrderIds.includes(order.id)}
                          onCheckedChange={(checked: boolean | 'indeterminate') => {
                            if (typeof order.id === 'number') {
                              toggleSelectOrder(order.id, checked === true);
                            }
                          }}
                          aria-label={`Selecteer order ${order.orderNumber}`}
                        />
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
                          <span className="text-xl">{getCountryFlag(order.country)}</span>
                        </div>
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
                        {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('nl-NL') : '-'}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm text-slate-900">{order.supplierTracking || '-'}</span>
                      </TableCell>
                      <TableCell>
                        {getOrderStatusBadge(order.status || 'onderweg-ffm')}
                      </TableCell>
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-200 text-red-600 hover:bg-red-50"
                          disabled={bulkDeleting || (typeof order.id === 'number' && deletingOrderIds.includes(order.id))}
                          onClick={() => handleDeleteOrder(order)}
                        >
                          {typeof order.id === 'number' && deletingOrderIds.includes(order.id)
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                    
                    {/* Expanded Details Row */}
                    {expandedOrder === order.orderNumber && (
                      <TableRow className="bg-gradient-to-r from-slate-50/80 to-indigo-50/30">
                        <TableCell colSpan={10} className="p-6">
                          <div className="flex gap-6">
                            {/* Left Column - Basic Info */}
                            <div className="flex-1 space-y-6">
                              {/* Header with Store and Status */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">
                                    {order.storeName}
                                  </Badge>
                                  <span className="text-slate-600">{order.orderNumber}</span>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-slate-200"
                                    onClick={() => handleOpenLabelDialog(order)}
                                  >
                                    <Package className="w-4 h-4 mr-2" />
                                    Label genereren
                                  </Button>
                                </div>
                              </div>

                              {/* Grid with details */}
                              <div className="grid grid-cols-2 gap-6">
                                {/* Ontvanger */}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <MapPin className="w-4 h-4" />
                                    <span>Ontvanger</span>
                                  </div>
                                  <p className="text-sm text-slate-900">{order.customerName}</p>
                                </div>

                                {/* Adres */}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <MapPin className="w-4 h-4" />
                                    <span>Adres</span>
                                  </div>
                                  <p className="text-sm text-slate-900">{order.address}</p>
                                </div>

                                {/* Besteldatum */}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <Calendar className="w-4 h-4" />
                                    <span>Besteldatum</span>
                                  </div>
                                  <p className="text-sm text-slate-900">
                                    {order.orderDate ? new Date(order.orderDate).toLocaleDateString('nl-NL') : '-'}
                                  </p>
                                </div>

                                {/* Inleverdatum */}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <Calendar className="w-4 h-4" />
                                    <span>Inleverdatum</span>
                                  </div>
                                  <p className="text-sm text-slate-900">-</p>
                                </div>

                                {/* Platform */}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <ShoppingCart className="w-4 h-4" />
                                    <span>Platform</span>
                                  </div>
                                  <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
                                    {order.platform}
                                  </Badge>
                                </div>

                                {/* Orderstatus */}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <Package className="w-4 h-4" />
                                    <span>Orderstatus</span>
                                  </div>
                                  <div>{getStatusBadge(normalizeOrderStatus(order))}</div>
                                </div>

                                {/* Orderwaarde */}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <Euro className="w-4 h-4" />
                                    <span>Orderwaarde</span>
                                  </div>
                                  <p className="text-sm text-slate-900">€ {order.orderValue?.toFixed(2) || '0.00'}</p>
                                </div>

                                {/* Zendingstatus */}
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <Truck className="w-4 h-4" />
                                    <span>Zendingstatus</span>
                                  </div>
                                  <p className="text-sm text-slate-900">{order.shippingStatus}</p>
                                </div>
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
                                          <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">SKU</span>
                                            <span className="text-slate-900 font-mono">{item.sku}</span>
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
            <span className="text-sm text-slate-700">{filteredOrders.length} orders gevonden</span>
            <div className="flex gap-6 text-sm">
              <span className="text-slate-600">
                <span className="text-orange-600">●</span> Openstaand: {filteredOrders.filter((o) => normalizeOrderStatus(o) === 'openstaand').length}
              </span>
              <span className="text-slate-600">
                <span className="text-emerald-600">●</span> Verzonden: {filteredOrders.filter((o) => normalizeOrderStatus(o) === 'verzonden').length}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showLabelDialog} onOpenChange={setShowLabelDialog}>
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
              ) : carrierContracts.length === 0 ? (
                <div className="text-sm text-slate-500">Geen actieve contracten</div>
              ) : (
                <RadioGroup
                  value={selectedContractId}
                  onValueChange={setSelectedContractId}
                  className="grid grid-cols-1 md:grid-cols-2 gap-3"
                >
                  {carrierContracts.map((contract) => {
                    const logo = carrierLogoMap[contract.carrierType] || null;
                    const isSelected = selectedContractId === String(contract.id);

                    return (
                      <label
                        key={contract.id}
                        htmlFor={`contract-${contract.id}`}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                        }`}
                      >
                        <RadioGroupItem
                          id={`contract-${contract.id}`}
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
                          <div className={`text-xs uppercase ${isSelected ? 'text-indigo-700' : 'text-slate-500'}`}>
                            {contract.carrierType}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </RadioGroup>
              )}
            </div>

            {labelPreviewUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">Label preview</span>
                  <a
                    href={labelPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    Open PDF
                  </a>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <iframe
                    title="Label preview"
                    src={labelPreviewUrl}
                    className="w-full h-full min-h-[680px]"
                  />
                </div>

                {generatedLabelMeta && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-slate-200 rounded-lg p-3 bg-slate-50/60">
                    <div>
                      <div className="text-xs text-slate-500">Shipment ID</div>
                      <div className="text-sm text-slate-900 font-mono break-all">{generatedLabelMeta.shipmentId || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Carrier tracking</div>
                      <div className="text-sm text-slate-900 font-mono break-all">{generatedLabelMeta.trackingCode || '-'}</div>
                    </div>
                    {generatedLabelMeta.trackingUrl && (
                      <div className="md:col-span-2">
                        <div className="text-xs text-slate-500">Tracking URL</div>
                        <a
                          href={generatedLabelMeta.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-indigo-600 hover:text-indigo-700 break-all"
                        >
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
            <Button
              variant="outline"
              onClick={() => setShowLabelDialog(false)}
              className="border-slate-200"
            >
              Sluiten
            </Button>
            <Button
              onClick={handleGenerateLabel}
              disabled={!selectedContractId || generatingLabel}
              className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
            >
              {generatingLabel && <Loader2 className="w-4 h-4 animate-spin" />}
              Label genereren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
