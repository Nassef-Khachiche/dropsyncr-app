import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { 
  Truck, 
  Plus,
  CheckCircle2,
  Settings,
  Trash2,
  Package,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { toast } from 'sonner@2.0.3';
import { api } from '../services/api';

interface CarriersProps {
  activeProfile: string;
}

interface Contract {
  id: number;
  carrier: string;
  contractName: string;
  active: boolean;
  credentials: Record<string, any>;
  carrierLogo: string;
  carrierColor: string;
}

const availableCarriers = [
  {
    id: 'dhl',
    name: 'DHL',
    logo: 'https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=200',
    color: 'from-yellow-400 to-red-500',
    bgColor: 'from-yellow-50 to-red-50/50',
    fields: [
      { name: 'contractName', label: 'Contractnaam', type: 'text', placeholder: 'Bijv. DHL Express Contract' },
      { name: 'userId', label: 'UserId', type: 'text', placeholder: 'Voer je User ID in' },
      { name: 'accountNumber', label: 'Accountnummer', type: 'text', placeholder: 'Voer je accountnummer in' },
      { name: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter new API key' },
    ]
  },
  {
    id: 'dpd',
    name: 'DPD',
    logo: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=200',
    color: 'from-red-500 to-red-600',
    bgColor: 'from-red-50 to-red-100/50',
    fields: [
      { name: 'contractName', label: 'Contractnaam', type: 'text', placeholder: 'Bijv. DPD Classic Contract' },
      { name: 'username', label: 'Username', type: 'text', placeholder: 'Voer je username in' },
      { name: 'password', label: 'Password', type: 'password', placeholder: 'Enter new password' },
    ],
    hasCheckbox: { name: 'sandbox', label: 'Sandbox' }
  },
];

export function Carriers({ activeProfile }: CarriersProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  const [showDialog, setShowDialog] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<string>('');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isActive, setIsActive] = useState(true);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeProfile) {
      loadCarriers();
    } else {
      setContracts([]);
      setLoading(false);
    }
  }, [activeProfile]);

  const loadCarriers = async () => {
    try {
      setLoading(true);
      const data = await api.getCarriers(activeProfile);

      const mappedContracts: Contract[] = data.map((carrier: any) => {
        const carrierInfo = availableCarriers.find(c => c.id === carrier.carrierType);
        return {
          id: carrier.id,
          carrier: carrier.carrierType,
          contractName: carrier.contractName,
          active: carrier.active,
          credentials: carrier.credentials || {},
          carrierLogo: carrierInfo?.logo || 'https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=200',
          carrierColor: carrierInfo?.color || 'from-slate-400 to-slate-500',
        };
      });

      setContracts(mappedContracts);
    } catch (error: any) {
      console.error('Failed to load carriers:', error);
      toast.error('Kon vervoerders niet laden');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = () => {
    if (!activeProfile) {
      toast.error('Selecteer eerst een installatie');
      return;
    }
    setShowDialog(true);
    setSelectedCarrier('');
    setFormData({});
    setIsActive(true);
    setShowPasswords({});
  };

  const handleCarrierChange = (carrierId: string) => {
    setSelectedCarrier(carrierId);
    setFormData({});
    setShowPasswords({});
  };

  const handleInputChange = (fieldName: string, value: string | boolean) => {
    setFormData({
      ...formData,
      [fieldName]: value
    });
  };

  const togglePasswordVisibility = (fieldName: string) => {
    setShowPasswords({
      ...showPasswords,
      [fieldName]: !showPasswords[fieldName]
    });
  };

  const handleSubmit = async () => {
    const carrier = availableCarriers.find(c => c.id === selectedCarrier);
    if (!carrier) {
      toast.error('Selecteer een vervoerder');
      return;
    }

    if (!formData.contractName) {
      toast.error('Contractnaam is verplicht');
      return;
    }

    // Check if all required fields are filled
    const missingFields = carrier.fields.filter(field => !formData[field.name]);
    if (missingFields.length > 0) {
      toast.error('Vul alle verplichte velden in');
      return;
    }

    if (!activeProfile) {
      toast.error('Selecteer eerst een installatie');
      return;
    }

    try {
      const { contractName, ...credentials } = formData;
      const carrierData = {
        installationId: parseInt(activeProfile),
        carrierType: selectedCarrier,
        contractName: contractName,
        active: isActive,
        credentials: credentials,
      };

      await api.createCarrier(carrierData);

      toast.success(`${carrier.name} contract succesvol toegevoegd!`, {
        description: `${contractName} is nu actief`
      });

      setShowDialog(false);
      await loadCarriers();
    } catch (error: any) {
      console.error('Failed to create carrier:', error);
      toast.error('Kon contract niet toevoegen', {
        description: error.message || 'Probeer het opnieuw'
      });
    }
  };

  const handleToggleActive = async (id: number) => {
    const contract = contracts.find(c => c.id === id);
    if (!contract) return;

    try {
      await api.updateCarrier(id, { active: !contract.active });
      setContracts(contracts.map(c => 
        c.id === id ? { ...c, active: !c.active } : c
      ));
      toast.success('Status bijgewerkt');
    } catch (error: any) {
      console.error('Failed to update carrier:', error);
      toast.error('Kon status niet bijwerken');
    }
  };

  const handleDelete = async (id: number) => {
    const contract = contracts.find(c => c.id === id);
    if (!contract) return;

    try {
      await api.deleteCarrier(id);
      setContracts(contracts.filter(c => c.id !== id));
      toast.success(`${contract?.contractName} is verwijderd`);
    } catch (error: any) {
      console.error('Failed to delete carrier:', error);
      toast.error('Kon contract niet verwijderen');
    }
  };

  const maskCredentialValue = (key: string, value: any) => {
    if (value === null || value === undefined) return '';
    const lowerKey = key.toLowerCase();
    const shouldMask = lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('key');
    if (!shouldMask) return String(value);
    const stringValue = String(value);
    if (stringValue.length <= 4) return '••••';
    return `${stringValue.slice(0, 2)}••••${stringValue.slice(-2)}`;
  };

  const selectedCarrierData = availableCarriers.find(c => c.id === selectedCarrier);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Vervoerders
          </h2>
          <p className="text-slate-600">Beheer je verzendcontracten en vervoerdersintegraties</p>
        </div>
        {!activeProfile && (
          <Alert className="max-w-md">
            <AlertDescription>
              Selecteer eerst een installatie rechtsboven om vervoerders te beheren
            </AlertDescription>
          </Alert>
        )}
        <Button 
          onClick={handleOpenDialog}
          disabled={!activeProfile}
          className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-lg shadow-indigo-500/20"
        >
          <Plus className="w-5 h-5" />
          Contract Toevoegen
        </Button>
      </div>

      {/* Connected Contracts */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : contracts.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-lg text-slate-900">Actieve Contracten ({contracts.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contracts.map((contract) => {
              const carrier = availableCarriers.find(c => c.id === contract.carrier);
              return (
                <Card key={contract.id} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${contract.carrierColor} p-2 flex items-center justify-center shadow-lg`}>
                          <img src={contract.carrierLogo} alt={contract.carrier} className="w-full h-full object-contain" />
                        </div>
                        <div>
                          <h4 className="text-slate-900">{contract.contractName}</h4>
                          <p className="text-sm text-slate-500">{carrier?.name || contract.carrier}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      {Object.entries(contract.credentials).slice(0, 2).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <span className="text-slate-600 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                          <span className="font-mono text-slate-900 text-xs">{maskCredentialValue(key, value)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-sm text-slate-600">Status:</span>
                        <div className="flex items-center gap-2">
                          {contract.active ? (
                            <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0 gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Actief
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-500">
                              Inactief
                            </Badge>
                          )}
                          <Switch checked={contract.active} onCheckedChange={() => handleToggleActive(contract.id)} />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 gap-2 border-slate-200"
                        onClick={() => toast.info('Instellingen openen...')}
                      >
                        <Settings className="w-4 h-4" />
                        Instellingen
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                        onClick={() => handleDelete(contract.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-12">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Truck className="w-10 h-10 text-indigo-400" />
              </div>
              <h3 className="text-lg text-slate-900 mb-2">Nog geen contracten</h3>
              <p className="text-sm text-slate-600 mb-4">
                Voeg je eerste verzendcontract toe om labels te kunnen printen
              </p>
              <Button 
                onClick={handleOpenDialog}
                disabled={!activeProfile}
                className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
              >
                <Plus className="w-4 h-4" />
                Contract Toevoegen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Carriers Info */}
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl shadow-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-slate-900 mb-2">Ondersteunde Vervoerders</h4>
              <p className="text-sm text-slate-700 mb-3">
                Dropsyncr ondersteunt alle grote verzendpartners. Koppel je contracten en begin direct met het printen van labels.
              </p>
              <div className="flex flex-wrap gap-2">
                {availableCarriers.map((carrier) => (
                  <Badge key={carrier.id} variant="outline" className="border-indigo-300 text-indigo-700 bg-white">
                    {carrier.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Contract Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contract Toevoegen</DialogTitle>
            <DialogDescription>
              Voeg een nieuw verzendcontract toe aan je account
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Carrier Selection */}
            <div className="space-y-2">
              <Label htmlFor="carrier">Vervoerder</Label>
              <Select value={selectedCarrier} onValueChange={handleCarrierChange}>
                <SelectTrigger className="border-slate-200">
                  <SelectValue placeholder="Selecteer een vervoerder..." />
                </SelectTrigger>
                <SelectContent className="border-slate-200">
                  {availableCarriers.map((carrier) => (
                    <SelectItem key={carrier.id} value={carrier.id}>
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded bg-gradient-to-br ${carrier.bgColor} flex items-center justify-center`}>
                          <img src={carrier.logo} alt={carrier.name} className="w-4 h-4 object-contain" />
                        </div>
                        <span>{carrier.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic Fields */}
            {selectedCarrierData && (
              <>
                {selectedCarrierData.fields.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name}>{field.label}</Label>
                    <div className="relative">
                      <Input
                        id={field.name}
                        type={field.type === 'password' && showPasswords[field.name] ? 'text' : field.type}
                        placeholder={field.placeholder}
                        value={formData[field.name] || ''}
                        onChange={(e) => handleInputChange(field.name, e.target.value)}
                        className="border-slate-200"
                      />
                      {field.type === 'password' && (
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility(field.name)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-500 hover:text-teal-600"
                        >
                          {showPasswords[field.name] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Checkbox if exists */}
                {selectedCarrierData.hasCheckbox && (
                  <div className="flex items-center space-x-2 py-2">
                    <Checkbox 
                      id={selectedCarrierData.hasCheckbox.name}
                      checked={formData[selectedCarrierData.hasCheckbox.name] || false}
                      onCheckedChange={(checked) => handleInputChange(selectedCarrierData.hasCheckbox!.name, checked)}
                    />
                    <Label 
                      htmlFor={selectedCarrierData.hasCheckbox.name}
                      className="text-sm cursor-pointer"
                    >
                      {selectedCarrierData.hasCheckbox.label}
                    </Label>
                  </div>
                )}

                {/* Active Toggle */}
                <div className="flex items-center justify-between py-2 border-t border-slate-100">
                  <Label htmlFor="active-toggle" className="text-sm">
                    Actief
                  </Label>
                  <Switch 
                    id="active-toggle"
                    checked={isActive} 
                    onCheckedChange={setIsActive}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedCarrier}
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 shadow-lg"
            >
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
