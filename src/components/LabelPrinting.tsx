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
  QrCode, 
  Printer, 
  CheckCircle2, 
  Package,
  Scan,
  Trash2,
  CheckCheck,
  Sparkles,
  Truck,
  Loader2
} from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { toast } from 'sonner@2.0.3';
import { api } from '../services/api';

interface LabelPrintingProps {
  activeProfile: string;
}

interface ScannedPackage {
  id: number;
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
];

export function LabelPrinting({ activeProfile }: LabelPrintingProps) {
  const [scanInput, setScanInput] = useState('');
  const [scannedPackages, setScannedPackages] = useState<ScannedPackage[]>([
    {
      id: 1,
      trackingCode: 'TBA123456789012',
      orderNumber: 'BOL-2024-00145',
      customerName: 'Jan Bakker',
      address: 'Hoofdstraat 123, 1234 AB Amsterdam',
      supplier: 'Amazon',
      scannedAt: new Date(),
      labelGenerated: false,
      country: 'NL',
      productImage: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=200'
    },
    {
      id: 2,
      trackingCode: 'LP987654321NL',
      orderNumber: 'BOL-2024-00146',
      customerName: 'Marie Peeters',
      address: 'Kerkstraat 45, 2000 Antwerpen',
      supplier: 'AliExpress',
      scannedAt: new Date(),
      labelGenerated: false,
      country: 'BE',
      productImage: 'https://images.unsplash.com/photo-1585336261022-680e8a0b4e31?w=200'
    }
  ]);
  const [selectedPackages, setSelectedPackages] = useState<number[]>([]);
  const [showShippingDialog, setShowShippingDialog] = useState(false);
  const [selectedShippingMethod, setSelectedShippingMethod] = useState<string>('');
  const [carrierContracts, setCarrierContracts] = useState<CarrierContract[]>([]);
  const [loadingCarriers, setLoadingCarriers] = useState(false);
  const [generatingLabels, setGeneratingLabels] = useState(false);

  useEffect(() => {
    if (activeProfile) {
      loadCarrierContracts();
    } else {
      setCarrierContracts([]);
    }
  }, [activeProfile]);

  const loadCarrierContracts = async () => {
    try {
      setLoadingCarriers(true);
      const data = await api.getCarriers(activeProfile);
      const filtered = data
        .filter((carrier: any) => ['dhl', 'dpd'].includes(carrier.carrierType))
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

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;

    // Simulate finding the order linked to this tracking code
    const newPackage: ScannedPackage = {
      id: Date.now(),
      trackingCode: scanInput,
      orderNumber: `BOL-2024-00${Math.floor(Math.random() * 1000)}`,
      customerName: 'Nieuwe Klant',
      address: 'Straatnaam 1, 1234 AB Stad',
      supplier: 'Amazon',
      scannedAt: new Date(),
      labelGenerated: false,
      country: 'NL',
      productImage: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=200'
    };

    setScannedPackages([...scannedPackages, newPackage]);
    toast.success('Pakket gescand en klaar voor label!');
    setScanInput('');
  };

  const handleSelectAll = () => {
    if (selectedPackages.length === scannedPackages.length) {
      setSelectedPackages([]);
    } else {
      setSelectedPackages(scannedPackages.map(p => p.id));
    }
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

    const selectedIds = selectedPackages.length > 0 ? selectedPackages : scannedPackages.map(p => p.id);
    const packagesToPrint = scannedPackages.filter(p => selectedIds.includes(p.id));

    try {
      setGeneratingLabels(true);
      const result = await api.generateCarrierLabels(selectedMethod.contractId, {
        shippingMethod: selectedMethod.id,
        packages: packagesToPrint.map(p => ({
          id: p.id,
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
          labelCarrier: selectedMethod.carrier,
        };
      }));

      toast.success(`${packagesToPrint.length} label(s) gegenereerd via ${selectedMethod.name}`, {
        description: 'Labels zijn klaar om te printen'
      });

      setShowShippingDialog(false);
      setSelectedShippingMethod('');
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
      toast.error('Geen actieve DPD of DHL contracten beschikbaar');
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
      toast.error('Geen actieve DPD of DHL contracten beschikbaar');
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
              <div className="text-sm text-slate-600 mt-1">Gescand</div>
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
          {scannedPackages.length === 0 ? (
            <div className="text-center py-16 bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-xl border-2 border-dashed border-slate-200">
              <QrCode className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-600">Nog geen pakketten gescand</p>
              <p className="text-sm text-slate-500 mt-1">Scan een barcode om te beginnen</p>
            </div>
          ) : (
            <>
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedPackages.length === scannedPackages.length}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Tracking Code</TableHead>
                      <TableHead>Ordernummer</TableHead>
                      <TableHead>Klant</TableHead>
                      <TableHead>Adres</TableHead>
                      <TableHead>Leverancier</TableHead>
                      <TableHead>Gescand</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scannedPackages.map((pkg) => (
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
                            <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0 gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Klaar
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemovePackage(pkg.id)}
                            className="hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

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
              <Select value={selectedShippingMethod} onValueChange={setSelectedShippingMethod}>
                <SelectTrigger className="border-slate-200 shadow-sm">
                  <SelectValue placeholder="Kies een verzendmethode..." />
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
                      Geen actieve DPD of DHL contracten
                    </div>
                  )}
                  {availableShippingMethods.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {method.carrier}
                        </Badge>
                        <span>{method.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedShippingMethod && (
              <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
                <p className="text-sm text-indigo-900">
                  <strong>Geselecteerd:</strong> {availableShippingMethods.find(m => m.id === selectedShippingMethod)?.name}
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
              }}
            >
              Annuleren
            </Button>
            <Button
              type="button"
              onClick={handlePrintLabels}
              disabled={!selectedShippingMethod || generatingLabels}
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
