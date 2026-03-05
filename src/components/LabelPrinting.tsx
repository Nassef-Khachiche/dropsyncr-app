import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { 
  QrCode, 
  Printer, 
  CheckCircle2, 
  Package,
  Scan,
  Trash2,
  CheckCheck,
  Sparkles,
  Truck,
  Eye,
  Download,
  MoreHorizontal,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { toast } from 'sonner@2.0.3';
import { api } from '../services/api';
import dhlLogo from '../assets/dhl-logo.png';
import dpdLogo from '../assets/dpd-logo.png';
import postnlLogo from '../assets/postnl-logo.png';
import bpostLogo from '../assets/bpost-logo.png';

interface LabelPrintingProps {
  activeProfile: string;
}

interface ScannedPackage {
  id: number;
  orderId: number;
  trackingCode: string;
  orderNumber: string;
  customerName: string;
  address: string;
  supplier: string;
  scannedAt: Date;
  labelGenerated: boolean;
  country: string;
  productImage: string;
  labelUrl?: string;
  labelCarrier?: string;
}

interface CarrierContract {
  id: number;
  carrierType: string;
  contractName: string;
  active: boolean;
}

const baseShippingMethods = [
  { id: 'dhl-parcel', name: 'DHL Parcel Connect', carrier: 'DHL', carrierType: 'dhl' },
  { id: 'dhl-express', name: 'DHL Express', carrier: 'DHL', carrierType: 'dhl' },
  { id: 'dpd-classic', name: 'DPD Classic', carrier: 'DPD', carrierType: 'dpd' },
  { id: 'wegrow', name: 'WeGrow', carrier: 'WeGrow', carrierType: 'wegrow' },
];

const wegrowCarrierOptions = [
  { id: 'dhl', name: 'DHL', logo: dhlLogo },
  { id: 'postnl', name: 'PostNL', logo: postnlLogo },
  { id: 'bpost', name: 'Bpost', logo: bpostLogo },
];

export function LabelPrinting({ activeProfile }: LabelPrintingProps) {
  const PACKAGES_PER_PAGE = 50;

  const carrierLogoMap: Record<string, string> = {
    dhl: dhlLogo,
    dpd: dpdLogo,
    wegrow: dhlLogo,
  };

  const [scanInput, setScanInput] = useState('');
  const [scannedPackages, setScannedPackages] = useState<ScannedPackage[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<number[]>([]);
  const [currentPackagesPage, setCurrentPackagesPage] = useState(1);
  const [showShippingDialog, setShowShippingDialog] = useState(false);
  const [selectedShippingMethod, setSelectedShippingMethod] = useState<string>('');
  const [selectedWeGrowCarrier, setSelectedWeGrowCarrier] = useState<string>('');
  const [carrierContracts, setCarrierContracts] = useState<CarrierContract[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingCarriers, setLoadingCarriers] = useState(false);
  const [generatingLabels, setGeneratingLabels] = useState(false);

  useEffect(() => {
    if (activeProfile) {
      loadCarrierContracts();
      loadLabelOrders();
    } else {
      setCarrierContracts([]);
      setScannedPackages([]);
      setSelectedPackages([]);
    }
  }, [activeProfile]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(scannedPackages.length / PACKAGES_PER_PAGE));
    if (currentPackagesPage > totalPages) {
      setCurrentPackagesPage(totalPages);
    }
  }, [scannedPackages.length, currentPackagesPage]);

  const mapOrderToPackage = (order: any): ScannedPackage | null => {
    if (typeof order?.id !== 'number') return null;

    const orderItems = Array.isArray(order.orderItems) ? order.orderItems : [];
    const firstItem = orderItems[0] || {};

    return {
      id: order.id,
      orderId: order.id,
      trackingCode: String(order.supplierTracking || '').trim(),
      orderNumber: String(order.orderNumber || `ORDER-${order.id}`),
      customerName: String(order.customerName || 'Onbekende klant'),
      address: String(order.address || ''),
      supplier: String(order.storeName || order.platform || 'Onbekend'),
      scannedAt: new Date(order.updatedAt || order.createdAt || Date.now()),
      labelGenerated: Boolean(order.label?.id) || String(order.orderStatus || '').toLowerCase() === 'label-aangemaakt',
      country: String(order.country || 'NL').toUpperCase(),
      productImage: String(firstItem.productImage || firstItem.product?.image || 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=200'),
      labelUrl: order.label?.labelUrl || undefined,
      labelCarrier: String(order.shippingMethod || ''),
    };
  };

  const loadLabelOrders = async () => {
    if (!activeProfile) return;

    try {
      setLoadingOrders(true);
      const data = await api.getOrders({
        installationId: activeProfile,
        status: 'openstaand',
        limit: 200,
      });

      const mappedPackages = (data.orders || [])
        .map(mapOrderToPackage)
        .filter((pkg: ScannedPackage | null): pkg is ScannedPackage => pkg !== null);

      setScannedPackages(mappedPackages);
      setSelectedPackages((prevSelected) => prevSelected.filter((pkgId) => mappedPackages.some((pkg) => pkg.id === pkgId)));
    } catch (error: any) {
      console.error('Failed to load label orders:', error);
      toast.error('Kon orders voor labels niet laden');
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadCarrierContracts = async () => {
    try {
      setLoadingCarriers(true);
      const data = await api.getCarriers(activeProfile);
      const filtered = data
        .filter((carrier: any) => ['dhl', 'dpd', 'wegrow'].includes(carrier.carrierType))
        .map((carrier: any) => ({
          id: carrier.id,
          carrierType: carrier.carrierType,
          contractName: carrier.contractName,
          active: carrier.active,
        }))
        .filter((carrier: CarrierContract) => carrier.active);

      setCarrierContracts(filtered);
    } catch (error: any) {
      console.error('Failed to load carriers:', error);
      toast.error('Kon vervoerders niet laden');
    } finally {
      setLoadingCarriers(false);
    }
  };

  const carrierByType = carrierContracts.reduce<Record<string, CarrierContract>>((acc, carrier) => {
    if (!acc[carrier.carrierType]) {
      acc[carrier.carrierType] = carrier;
    }
    return acc;
  }, {});

  const availableShippingMethods = baseShippingMethods
    .filter(method => !!carrierByType[method.carrierType])
    .map(method => ({
      ...method,
      contractId: carrierByType[method.carrierType]?.id,
      contractName: carrierByType[method.carrierType]?.contractName,
    }));

  const selectedMethod = availableShippingMethods.find(m => m.id === selectedShippingMethod);
  const isWeGrowMethod = selectedMethod?.carrierType === 'wegrow';
  const selectedWeGrowCarrierName = wegrowCarrierOptions.find(option => option.id === selectedWeGrowCarrier)?.name;

  const totalPackagesPages = Math.max(1, Math.ceil(scannedPackages.length / PACKAGES_PER_PAGE));
  const packageStartIndex = (currentPackagesPage - 1) * PACKAGES_PER_PAGE;
  const paginatedScannedPackages = scannedPackages.slice(packageStartIndex, packageStartIndex + PACKAGES_PER_PAGE);
  const visiblePackageIds = paginatedScannedPackages.map((pkg) => pkg.id);
  const allVisibleSelected = visiblePackageIds.length > 0 && visiblePackageIds.every((pkgId) => selectedPackages.includes(pkgId));
  const someVisibleSelected = visiblePackageIds.some((pkgId) => selectedPackages.includes(pkgId)) && !allVisibleSelected;

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;
    if (!activeProfile) {
      toast.error('Selecteer eerst een installatie');
      return;
    }

    try {
      const searchTerm = scanInput.trim();
      const data = await api.getOrders({
        installationId: activeProfile,
        search: searchTerm,
        limit: 25,
      });

      const matchingOrder = (data.orders || []).find((order: any) => {
        const orderNumber = String(order.orderNumber || '').trim().toLowerCase();
        const supplierTracking = String(order.supplierTracking || '').trim().toLowerCase();
        const normalizedSearch = searchTerm.toLowerCase();
        return orderNumber === normalizedSearch || supplierTracking === normalizedSearch;
      }) || (data.orders || [])[0];

      const mappedPackage = mapOrderToPackage(matchingOrder);

      if (!mappedPackage) {
        toast.error('Geen order gevonden voor deze scan');
        return;
      }

      const alreadyExists = scannedPackages.some((pkg) => pkg.id === mappedPackage.id);
      if (alreadyExists) {
        toast.info('Order staat al op de labels pagina');
      } else {
        setScannedPackages((prev) => [mappedPackage, ...prev]);
        setCurrentPackagesPage(1);
        toast.success('Order gevonden en toegevoegd aan labels');
      }
    } catch (error: any) {
      console.error('Failed to scan order:', error);
      toast.error('Kon scan niet verwerken', {
        description: error.message || 'Probeer het opnieuw',
      });
    } finally {
      setScanInput('');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedPackages((previousSelected) => previousSelected.filter((pkgId) => !visiblePackageIds.includes(pkgId)));
      return;
    }

    setSelectedPackages((previousSelected) => Array.from(new Set([...previousSelected, ...visiblePackageIds])));
  };

  const handleSelectPackage = (id: number) => {
    if (selectedPackages.includes(id)) {
      setSelectedPackages(selectedPackages.filter(p => p !== id));
    } else {
      setSelectedPackages([...selectedPackages, id]);
    }
  };

  const handleOpenPrintDialog = () => {
    if (selectedPackages.length === 0) {
      toast.error('Selecteer minimaal één pakket om te printen');
      return;
    }
    if (!activeProfile) {
      toast.error('Selecteer eerst een installatie');
      return;
    }
    setShowShippingDialog(true);
  };

  const handlePrintLabels = async () => {
    if (!selectedShippingMethod) {
      toast.error('Selecteer een verzendmethode');
      return;
    }

    if (!activeProfile) {
      toast.error('Selecteer eerst een installatie');
      return;
    }

    const selectedMethod = availableShippingMethods.find(m => m.id === selectedShippingMethod);
    if (!selectedMethod?.contractId) {
      toast.error('Geen actief contract gevonden voor deze verzendmethode');
      return;
    }

    if (selectedMethod.carrierType === 'wegrow' && !selectedWeGrowCarrier) {
      toast.error('Selecteer een WeGrow vervoerder (DHL, PostNL of Bpost)');
      return;
    }

    const selectedIds = selectedPackages.length > 0 ? selectedPackages : scannedPackages.map(p => p.id);
    const packagesToPrint = scannedPackages.filter(p => selectedIds.includes(p.id));

    try {
      setGeneratingLabels(true);
      const resolvedShippingMethod = selectedMethod.carrierType === 'wegrow'
        ? `wegrow-${selectedWeGrowCarrier}`
        : selectedMethod.id;

      const result = await api.generateCarrierLabels(selectedMethod.contractId, {
        shippingMethod: resolvedShippingMethod,
        ...(selectedMethod.carrierType === 'wegrow' ? { wegrowCarrier: selectedWeGrowCarrier } : {}),
        packages: packagesToPrint.map(p => ({
          id: p.orderNumber,
          orderId: p.orderId,
          orderNumber: p.orderNumber,
          customerName: p.customerName,
          address: p.address,
          country: p.country,
        })),
      });

      const labelsByPackage = new Map<number, any>();
      (result.labels || []).forEach((label: any) => {
        labelsByPackage.set(label.packageId, label);
      });

      setScannedPackages(prev => prev.map(pkg => {
        if (!selectedIds.includes(pkg.id)) return pkg;
        const label = labelsByPackage.get(pkg.id);
        return {
          ...pkg,
          labelGenerated: true,
          labelUrl: label?.labelUrl || pkg.labelUrl,
          labelCarrier: selectedMethod.carrierType === 'wegrow' && selectedWeGrowCarrierName
            ? `WeGrow (${selectedWeGrowCarrierName})`
            : selectedMethod.carrier,
        };
      }));

      const methodLabel = selectedMethod.carrierType === 'wegrow' && selectedWeGrowCarrierName
        ? `${selectedMethod.name} - ${selectedWeGrowCarrierName}`
        : selectedMethod.name;

      toast.success(`${packagesToPrint.length} label(s) gegenereerd via ${methodLabel}`, {
        description: 'Labels zijn klaar om te printen'
      });

      await loadLabelOrders();

      setShowShippingDialog(false);
      setSelectedShippingMethod('');
      setSelectedWeGrowCarrier('');
    } catch (error: any) {
      console.error('Failed to generate labels:', error);
      toast.error('Kon labels niet genereren', {
        description: error.message || 'Probeer het opnieuw'
      });
    } finally {
      setGeneratingLabels(false);
    }
  };

  const handlePrintSelected = () => {
    if (selectedPackages.length === 0) {
      toast.error('Selecteer minimaal één pakket om te printen');
      return;
    }
    if (!activeProfile) {
      toast.error('Selecteer eerst een installatie');
      return;
    }
    if (availableShippingMethods.length === 0) {
      toast.error('Geen actieve DPD, DHL of WeGrow contracten beschikbaar');
      return;
    }
    setShowShippingDialog(true);
  };

  const handlePrintAll = () => {
    if (scannedPackages.length === 0) {
      toast.error('Geen pakketten om te printen');
      return;
    }
    if (!activeProfile) {
      toast.error('Selecteer eerst een installatie');
      return;
    }
    if (availableShippingMethods.length === 0) {
      toast.error('Geen actieve DPD, DHL of WeGrow contracten beschikbaar');
      return;
    }
    setShowShippingDialog(true);
  };

  const handleProcessOrders = () => {
    const count = selectedPackages.length || scannedPackages.length;
    toast.success(`${count} order(s) worden verwerkt in Bol.com...`, {
      description: 'Tracking codes worden toegevoegd en orders worden als verzonden gemarkeerd.'
    });
  };

  const handleRemovePackage = (id: number) => {
    setScannedPackages(scannedPackages.filter(p => p.id !== id));
    setSelectedPackages(selectedPackages.filter(p => p !== id));
    toast.success('Pakket verwijderd uit lijst');
  };

  const handleClearAll = () => {
    setScannedPackages([]);
    setSelectedPackages([]);
    setCurrentPackagesPage(1);
    toast.success('Alle pakketten verwijderd');
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Labels Printen
        </h2>
        <p className="text-slate-600">Scan pakketten en genereer verzendlabels</p>
      </div>

      {!activeProfile && (
        <Alert className="max-w-md">
          <AlertDescription>
            Selecteer eerst een installatie rechtsboven om labels te genereren
          </AlertDescription>
        </Alert>
      )}

      {/* Scanner Interface */}
      <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-indigo-50/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg">
              <Scan className="w-4 h-4 text-white" />
            </div>
            Barcode Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert className="border-indigo-200 bg-indigo-50/50">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <AlertDescription className="text-slate-700">
              Scan de tracking barcode op het binnengekomen pakket. Het systeem zoekt automatisch 
              de bijbehorende klantorder en genereert direct een verzendlabel.
            </AlertDescription>
          </Alert>

          <form onSubmit={handleScan} className="flex gap-3">
            <div className="flex-1 relative">
              <QrCode className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Scan barcode of voer tracking code in..."
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                className="pl-11 h-12 border-slate-200 shadow-sm"
                autoFocus
              />
            </div>
            <Button type="submit" size="lg" className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg shadow-indigo-500/20 px-8">
              <Scan className="w-5 h-5" />
              Scan
            </Button>
          </form>

          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center p-4 bg-gradient-to-br from-indigo-50 to-purple-50/50 rounded-xl border border-indigo-200/60">
              <div className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{scannedPackages.length}</div>
              <div className="text-sm text-slate-600 mt-1">Orders</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-xl border border-emerald-200/60">
              <div className="text-3xl bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                {scannedPackages.filter(p => p.labelGenerated).length}
              </div>
              <div className="text-sm text-slate-600 mt-1">Labels Klaar</div>
            </div>
            <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-pink-50/50 rounded-xl border border-purple-200/60">
              <div className="text-3xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{selectedPackages.length}</div>
              <div className="text-sm text-slate-600 mt-1">Geselecteerd</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scanned Packages */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" />
              Gescande Pakketten ({scannedPackages.length})
            </CardTitle>
            <div className="flex gap-2">
              {scannedPackages.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleClearAll}
                  className="gap-2 border-slate-200 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                  Wis Alles
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingOrders ? (
            <div className="text-center py-16 bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-xl border-2 border-dashed border-slate-200">
              <Loader2 className="w-16 h-16 mx-auto mb-4 text-slate-300 animate-spin" />
              <p className="text-slate-600">Orders laden...</p>
            </div>
          ) : scannedPackages.length === 0 ? (
            <div className="text-center py-16 bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-xl border-2 border-dashed border-slate-200">
              <QrCode className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-600">Nog geen orders gevonden</p>
              <p className="text-sm text-slate-500 mt-1">Scan een barcode of ververs de pagina</p>
            </div>
          ) : (
            <>
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="w-12">
                        <Checkbox
                          checked={allVisibleSelected ? true : (someVisibleSelected ? 'indeterminate' : false)}
                          onCheckedChange={(checked: boolean | 'indeterminate') => handleSelectAll(checked === true)}
                        />
                      </TableHead>
                      <TableHead>Tracking Code</TableHead>
                      <TableHead>Ordernummer</TableHead>
                      <TableHead>Klant</TableHead>
                      <TableHead>Adres</TableHead>
                      <TableHead>Leverancier</TableHead>
                      <TableHead>Gescand</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Options</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedScannedPackages.map((pkg) => (
                      <TableRow key={pkg.id} className="hover:bg-slate-50/50">
                        <TableCell>
                          <Checkbox
                            checked={selectedPackages.includes(pkg.id)}
                            onCheckedChange={() => handleSelectPackage(pkg.id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{pkg.trackingCode}</TableCell>
                        <TableCell className="text-sm">{pkg.orderNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                              <img 
                                src={pkg.productImage} 
                                alt="product"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span>{pkg.customerName}</span>
                            <span className="text-lg">{getCountryFlag(pkg.country)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">{pkg.address}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-slate-300 bg-slate-50">{pkg.supplier}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {pkg.scannedAt.toLocaleTimeString('nl-NL', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </TableCell>
                        <TableCell>
                          {pkg.labelGenerated && (
                            <div className="space-y-1">
                              <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0 gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Klaar
                              </Badge>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="border border-slate-200 shadow-sm hover:bg-slate-100 hover:shadow cursor-pointer"
                                  aria-label="Meer opties"
                                  title="Meer opties"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="border-slate-200 shadow-lg">
                                <DropdownMenuItem
                                  className="cursor-pointer"
                                  onSelect={() => {
                                    if (!pkg.labelUrl) return;
                                    window.open(pkg.labelUrl, '_blank', 'noopener,noreferrer');
                                  }}
                                  disabled={!pkg.labelGenerated || !pkg.labelUrl}
                                >
                                  <Eye className="w-4 h-4" />
                                  Preview
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="cursor-pointer"
                                  onSelect={() => {
                                    if (!pkg.labelUrl) return;
                                    const link = document.createElement('a');
                                    link.href = pkg.labelUrl;
                                    link.download = '';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                  disabled={!pkg.labelGenerated || !pkg.labelUrl}
                                >
                                  <Download className="w-4 h-4" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="cursor-pointer"
                                  variant="destructive"
                                  onSelect={() => handleRemovePackage(pkg.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Verwijderen
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {scannedPackages.length > PACKAGES_PER_PAGE && (
                <div className="mt-4 flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3 bg-slate-50/50">
                  <p className="text-sm text-slate-600">
                    Pagina {currentPackagesPage} van {totalPackagesPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 border-slate-200"
                      onClick={() => setCurrentPackagesPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPackagesPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Vorige
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 border-slate-200"
                      onClick={() => setCurrentPackagesPage((prev) => Math.min(totalPackagesPages, prev + 1))}
                      disabled={currentPackagesPage === totalPackagesPages}
                    >
                      Volgende
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 flex items-center justify-between p-5 bg-gradient-to-r from-slate-50 to-indigo-50/30 rounded-xl border border-slate-200">
                <div className="space-y-1">
                  <p className="text-sm text-slate-900">
                    {selectedPackages.length > 0 
                      ? `${selectedPackages.length} pakket(ten) geselecteerd`
                      : `${scannedPackages.length} pakket(ten) klaar voor verwerking`
                    }
                  </p>
                  <p className="text-xs text-slate-600">
                    Kies verzendmethode bij het printen van labels
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={handlePrintSelected}
                    disabled={selectedPackages.length === 0}
                    className="gap-2 border-slate-200 shadow-sm"
                  >
                    <Printer className="w-4 h-4" />
                    Print Geselecteerde
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handlePrintAll}
                    className="gap-2 border-slate-200 shadow-sm"
                  >
                    <Printer className="w-4 h-4" />
                    Print Alle Labels
                  </Button>
                  <Button 
                    onClick={handleProcessOrders}
                    className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/20"
                  >
                    <CheckCheck className="w-4 h-4" />
                    Afronden & Verwerken
                  </Button>
                </div>
              </div>

              {/* Info Box */}
              <div className="mt-4 p-5 bg-gradient-to-br from-indigo-50 to-purple-50/50 rounded-xl border border-indigo-200/60">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg shadow-sm">
                    <CheckCheck className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-sm space-y-2">
                    <p className="text-slate-900">
                      <strong>Workflow:</strong>
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
                      <li>Scan alle binnengekomen pakketten (100+ achter elkaar mogelijk)</li>
                      <li>Selecteer pakketten met checkboxes (optioneel)</li>
                      <li>Klik op "Print Alle Labels" - er verschijnt een popup</li>
                      <li>Kies de verzendmethode in de popup en bevestig</li>
                      <li>Labels worden gegenereerd met gekozen verzendmethode</li>
                      <li>Klik op "Afronden" om alle orders te verwerken in Bol.com</li>
                    </ol>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Shipping Method Dialog */}
      <Dialog open={showShippingDialog} onOpenChange={setShowShippingDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-indigo-600" />
              Selecteer Verzendmethode
            </DialogTitle>
            <DialogDescription>
              Kies de verzendmethode voor {selectedPackages.length > 0 ? selectedPackages.length : scannedPackages.length} geselecteerde pakket(ten)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-700">Verzendmethode</label>
              <Select
                value={selectedShippingMethod}
                onValueChange={(value) => {
                  setSelectedShippingMethod(value);
                  if (value !== 'wegrow') {
                    setSelectedWeGrowCarrier('');
                  }
                }}
              >
                <SelectTrigger className="border-slate-200 shadow-sm">
                  <SelectValue placeholder="Kies een verzendmethode...">
                    {selectedMethod ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded bg-white border border-slate-200 p-0.5 flex items-center justify-center">
                          <img
                            src={carrierLogoMap[selectedMethod.carrierType] || dhlLogo}
                            alt={selectedMethod.carrier}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <span className="truncate">{selectedMethod.name}</span>
                      </div>
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="border-slate-200 shadow-lg">
                  {loadingCarriers && (
                    <div className="flex items-center justify-center py-3 text-sm text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Contracten laden...
                    </div>
                  )}
                  {!loadingCarriers && availableShippingMethods.length === 0 && (
                    <div className="px-3 py-2 text-sm text-slate-500">
                      Geen actieve DPD, DHL of WeGrow contracten
                    </div>
                  )}
                  {availableShippingMethods.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-white border border-slate-200 p-0.5 flex items-center justify-center">
                          <img
                            src={carrierLogoMap[method.carrierType] || dhlLogo}
                            alt={method.carrier}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <span>{method.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isWeGrowMethod && (
              <div className="space-y-2">
                <label className="text-sm text-slate-700">WeGrow vervoerder</label>
                <Select value={selectedWeGrowCarrier} onValueChange={setSelectedWeGrowCarrier}>
                  <SelectTrigger className="border-slate-200 shadow-sm">
                    <SelectValue placeholder="Kies DHL, PostNL of Bpost..." />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 shadow-lg">
                    {wegrowCarrierOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-white border border-slate-200 p-1 flex items-center justify-center">
                            <img src={option.logo} alt={option.name} className="w-full h-full object-contain" />
                          </div>
                          <span>{option.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedShippingMethod && (
              <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
                <p className="text-sm text-indigo-900">
                  <strong>Geselecteerd:</strong> {selectedMethod?.name}
                  {isWeGrowMethod && selectedWeGrowCarrierName ? ` - ${selectedWeGrowCarrierName}` : ''}
                </p>
                <p className="text-xs text-indigo-700 mt-1">
                  {selectedPackages.length > 0 ? selectedPackages.length : scannedPackages.length} label(s) worden gegenereerd
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowShippingDialog(false);
                setSelectedShippingMethod('');
                setSelectedWeGrowCarrier('');
              }}
            >
              Annuleren
            </Button>
            <Button
              type="button"
              onClick={handlePrintLabels}
              disabled={!selectedShippingMethod || (isWeGrowMethod && !selectedWeGrowCarrier) || generatingLabels}
              className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
            >
              {generatingLabels ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              {generatingLabels ? 'Genereren...' : 'Print Labels'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
