import { useState, useEffect, Fragment } from 'react';
import { api } from '../services/api';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
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

interface OrdersOverviewProps {
  activeProfile: string;
}

interface CarrierContract {
  id: number;
  carrierType: string;
  contractName: string;
  active: boolean;
}

// Extended mock orders data
const mockOrders = [
  {
    orderNumber: 'A0009HICA9',
    customerName: 'Karin Gebruge',
    country: 'BE',
    storeName: 'Shopcentral',
    itemCount: 1,
    deliveryDate: '2024-10-16',
    supplierTracking: 'TBA123456789012',
    status: 'onderweg-ffm',
    // Detail fields
    address: 'Ouden Dendermondesteenweg 278, 9300 AALST, BE',
    orderDate: '2024-10-14',
    platform: 'bol.com',
    orderStatus: 'openstaand',
    orderValue: 49.99,
    shippingStatus: 'Met Landmrankglobal',
    productImage: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=200',
    productName: 'Opgewaardeerde tablethouder voor bed - Opvouwbare standaard met 360 graden rotatie',
    ean: '8785347099208',
    sku: 'B00K6K08Q',
    weight: '12.9 kg',
    supplier: 'Amazon'
  },
  {
    orderNumber: 'A0009HAK3',
    customerName: 'Sophie van Dam',
    country: 'NL',
    storeName: 'Inovra',
    itemCount: 2,
    deliveryDate: '2024-10-16',
    supplierTracking: 'LP987654321NL',
    status: 'binnengekomen-ffm',
    address: 'Mosselscheerloop 14, 1234 AB Amsterdam, NL',
    orderDate: '2024-10-14',
    platform: 'bol.com',
    orderStatus: 'openstaand',
    orderValue: 38.98,
    shippingStatus: 'PostNL Standaard 0-23kg',
    productImage: 'https://images.unsplash.com/photo-1585336261022-680e8a0b4e31?w=200',
    productName: 'Speelgoed Garage voor Kinderen met Autolift - Speelautoset - Cartoon Dier Design',
    ean: '8723838184435',
    sku: 'B07K3NK891',
    weight: '2.3 kg',
    supplier: 'AliExpress'
  },
  {
    orderNumber: 'A0009HLM5',
    customerName: 'Thomas Janssen',
    country: 'NL',
    storeName: 'Shopcentral',
    itemCount: 1,
    deliveryDate: '2024-10-17',
    supplierTracking: 'CJ789012345NL',
    status: 'label-aangemaakt',
    address: 'Kerkstraat 89, 5611 GH Eindhoven, NL',
    orderDate: '2024-10-14',
    platform: 'bol.com',
    orderStatus: 'openstaand',
    orderValue: 29.99,
    shippingStatus: 'Wacht op tracking',
    productImage: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=200',
    productName: 'Draadloze Bluetooth Speaker - Waterdicht - 360 graden surround sound',
    ean: '8719988766543',
    sku: 'B08L5M9K2',
    weight: '0.8 kg',
    supplier: 'CJ Dropshipping'
  },
  {
    orderNumber: 'A0009HXK9',
    customerName: 'Emma Peeters',
    country: 'BE',
    storeName: 'Inovra',
    itemCount: 3,
    deliveryDate: '2024-10-15',
    supplierTracking: 'TBA234567890123',
    status: 'verstuurd',
    address: 'Grote Markt 23, 2000 Antwerpen, BE',
    orderDate: '2024-10-13',
    platform: 'bol.com',
    orderStatus: 'verzonden',
    orderValue: 84.97,
    shippingStatus: '3pack Bussuite',
    productImage: 'https://images.unsplash.com/photo-1611312449408-fcece27cdbb7?w=200',
    productName: 'LED Strip Lights - 10M RGB Kleurveranderende Verlichting met Afstandsbediening',
    ean: '8719988761234',
    sku: 'B09C4NK123',
    weight: '1.2 kg',
    supplier: 'Amazon'
  },
  {
    orderNumber: 'A0009HZP2',
    customerName: 'Lucas Vermeer',
    country: 'NL',
    storeName: 'Shopcentral',
    itemCount: 1,
    deliveryDate: '2024-10-12',
    supplierTracking: 'TBA345678901234',
    status: 'afgeleverd',
    address: 'Marktstraat 56, 3011 NL Rotterdam, NL',
    orderDate: '2024-10-11',
    platform: 'bol.com',
    orderStatus: 'afgeleverd',
    orderValue: 19.99,
    shippingStatus: 'PostNL Standaard 0-23kg',
    productImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200',
    productName: 'Premium Koptelefoon met Noise Cancelling - Draadloos',
    ean: '8719988767890',
    sku: 'B08M3PK456',
    weight: '0.5 kg',
    supplier: 'Amazon'
  },
];

export function OrdersOverview({ activeProfile }: OrdersOverviewProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [showLabelDialog, setShowLabelDialog] = useState(false);
  const [labelOrder, setLabelOrder] = useState<any | null>(null);
  const [carrierContracts, setCarrierContracts] = useState<CarrierContract[]>([]);
  const [loadingCarriers, setLoadingCarriers] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [generatingLabel, setGeneratingLabel] = useState(false);
  const [labelPreviewUrl, setLabelPreviewUrl] = useState<string>('');

  useEffect(() => {
    if (activeProfile) {
      loadOrders();
    }
  }, [activeProfile, filterStatus, searchQuery]);

  useEffect(() => {
    if (activeProfile) {
      loadCarrierContracts();
    } else {
      setCarrierContracts([]);
    }
  }, [activeProfile]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await api.getOrders({
        installationId: activeProfile,
        status: filterStatus !== 'all' ? filterStatus : undefined,
        search: searchQuery || undefined,
        limit: 100,
      });
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

  const handleOpenLabelDialog = (order: any) => {
    setLabelOrder(order);
    setSelectedContractId('');
    setLabelPreviewUrl('');
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
          },
        ],
      });

      const label = (result.labels || [])[0];
      if (label?.labelUrl) {
        setLabelPreviewUrl(label.labelUrl);
      }
    } catch (error) {
      console.error('Failed to generate label:', error);
      toast.error('Kon label niet genereren', {
        description: error instanceof Error ? error.message : 'Probeer het opnieuw',
      });
    } finally {
      setGeneratingLabel(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesStore = filterStore === 'all' || order.storeName === filterStore;
    return matchesStore;
  });

  const toggleOrderDetails = (orderNumber: string) => {
    setExpandedOrder(expandedOrder === orderNumber ? null : orderNumber);
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
                <SelectItem value="Shopcentral">Shopcentral</SelectItem>
                <SelectItem value="Inovra">Inovra</SelectItem>
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
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Ordernummer</TableHead>
                  <TableHead>Klantnaam</TableHead>
                  <TableHead>Store naam</TableHead>
                  <TableHead className="text-center">Aantal items</TableHead>
                  <TableHead>Uiterste leverdatum</TableHead>
                  <TableHead>Trackingnummer leverancier</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
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
                    </TableRow>
                    
                    {/* Expanded Details Row */}
                    {expandedOrder === order.orderNumber && (
                      <TableRow className="bg-gradient-to-r from-slate-50/80 to-indigo-50/30">
                        <TableCell colSpan={8} className="p-6">
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
                                  <div>{getStatusBadge(order.orderStatus)}</div>
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
                                    {item.productImage && (
                                      <div className="aspect-square w-full bg-slate-100 rounded-lg overflow-hidden">
                                        <img 
                                          src={item.productImage}
                                          alt={item.productName}
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    )}
                                    
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
                <span className="text-orange-600">●</span> Openstaand: {filteredOrders.filter(o => o.orderStatus === 'openstaand').length}
              </span>
              <span className="text-slate-600">
                <span className="text-emerald-600">●</span> Verzonden: {filteredOrders.filter(o => o.orderStatus === 'verzonden').length}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showLabelDialog} onOpenChange={setShowLabelDialog}>
        <DialogContent className="sm:max-w-5xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Label genereren</DialogTitle>
            <DialogDescription>
              Selecteer een contract en genereer een verzendlabel voor {labelOrder?.orderNumber || 'de order'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-auto">
            <div className="space-y-2">
              <label className="text-sm text-slate-700">Contract</label>
              <Select value={selectedContractId} onValueChange={setSelectedContractId}>
                <SelectTrigger className="border-slate-200 shadow-sm">
                  <SelectValue placeholder={loadingCarriers ? 'Contracten laden...' : 'Kies een contract'} />
                </SelectTrigger>
                <SelectContent className="border-slate-200 shadow-lg">
                  {carrierContracts.length === 0 && !loadingCarriers && (
                    <div className="px-3 py-2 text-sm text-slate-500">Geen actieve contracten</div>
                  )}
                  {carrierContracts.map((contract) => (
                    <SelectItem key={contract.id} value={String(contract.id)}>
                      {contract.contractName} ({contract.carrierType.toUpperCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
