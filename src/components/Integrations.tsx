import { useState, useEffect, type MouseEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { 
  Store, 
  Plus,
  CheckCircle2,
  Settings,
  ExternalLink,
  ShoppingBag,
  Package,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { toast } from 'sonner';
import { api } from '../services/api';
import bolLogo from '../assets/ac132ff5f6e671e3f57b4815a5d22230995c302e.png';

interface IntegrationsProps {
  activeProfile: string;
}

interface Store {
  id: number;
  platform: string;
  platformId: string;
  name: string;
  connected: boolean;
  apiKey?: string;
  hasSecret?: boolean;
  processOrders?: boolean;
  active: boolean;
  logo: string;
  color: string;
}

const availablePlatforms = [
  {
    id: 'bol',
    name: 'Bol.com',
    description: 'Koppel je Bol.com winkel voor geautomatiseerde orderverwerking',
    logo: bolLogo,
    color: 'from-blue-500 to-blue-600',
    bgColor: 'from-blue-50 to-blue-100/50',
  },
];

export function Integrations({ activeProfile }: IntegrationsProps) {
  const [connectedStores, setConnectedStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<typeof availablePlatforms[0] | null>(null);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  
  // Form state
  const [shopName, setShopName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [processOrders, setProcessOrders] = useState(true);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (activeProfile) {
      loadIntegrations();
    }
  }, [activeProfile]);

  const loadIntegrations = async () => {
    if (!activeProfile) return;
    
    try {
      setLoading(true);
      const data = await api.getIntegrations(activeProfile);
      
      // Map backend integrations to frontend format
      const mappedStores = data.integrations.map((integration: any) => {
        // Normalize platform ID (handle both 'bol' and 'bol.com')
        const platformId = integration.platform === 'bol.com' ? 'bol' : integration.platform;
        const platform = availablePlatforms.find(p => p.id === platformId);
        return {
          id: integration.id,
          platform: integration.platform,
          platformId,
          name: integration.credentials?.shopName || platform?.name || integration.platform,
          connected: true,
          apiKey: integration.credentials?.clientId || '••••••••',
          hasSecret: integration.credentials?.hasSecret || false,
          processOrders: integration.settings?.processOrders ?? false,
          active: integration.active,
          logo: platform?.logo || bolLogo,
          color: platform?.color || 'from-blue-500 to-blue-600',
        };
      });
      
      setConnectedStores(mappedStores);
    } catch (error: any) {
      console.error('Failed to load integrations:', error);
      toast.error('Kon integraties niet laden');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectPlatform = (platform: typeof availablePlatforms[0]) => {
    setEditingStore(null);
    setSelectedPlatform(platform);
    setShowConnectionDialog(true);
    // Reset form
    setShopName('');
    setApiKey('');
    setApiSecret('');
    setProcessOrders(true);
    setIsActive(true);
  };

  const handleOpenSettings = (store: Store) => {
    const platform = availablePlatforms.find(p => p.id === store.platformId);
    if (!platform) {
      toast.error('Platform instellingen niet gevonden');
      return;
    }

    setEditingStore(store);
    setSelectedPlatform(platform);
    setShowConnectionDialog(true);
    setShopName(store.name || '');
    setApiKey('');
    setApiSecret('');
    setProcessOrders(store.processOrders ?? false);
    setIsActive(store.active);
  };

  const handleSubmitConnection = async () => {
    const normalizedShopName = shopName.trim();

    if (!normalizedShopName) {
      toast.error('Shopnaam is verplicht');
      return;
    }

    if (!editingStore && (!apiKey || !apiSecret)) {
      toast.error('Vul alle verplichte velden in');
      return;
    }

    if (!activeProfile) {
      toast.error('Selecteer eerst een installatie');
      return;
    }

    try {
      const integrationData = {
        installationId: parseInt(activeProfile),
        platform: selectedPlatform?.id === 'bol' ? 'bol.com' : selectedPlatform?.id || '',
        credentials: {
          ...(apiKey ? { clientId: apiKey } : {}),
          ...(apiSecret ? { clientSecret: apiSecret } : {}),
          shopName: normalizedShopName,
        },
        settings: {
          processOrders: processOrders,
        },
        active: isActive,
      };

      console.log('[Integration] Submitting integration:', { 
        installationId: integrationData.installationId,
        platform: integrationData.platform,
        active: integrationData.active,
        hasClientId: !!integrationData.credentials.clientId,
        hasClientSecret: !!integrationData.credentials.clientSecret,
      });

      if (editingStore) {
        const result = await api.updateIntegration(editingStore.id, {
          credentials: integrationData.credentials,
          settings: integrationData.settings,
          active: integrationData.active,
        });

        const updatedShopName = result.integration?.credentials?.shopName || normalizedShopName;
        setConnectedStores((prevStores) =>
          prevStores.map((store) =>
            store.id === editingStore.id
              ? {
                  ...store,
                  name: updatedShopName,
                  active: integrationData.active,
                  processOrders: integrationData.settings.processOrders,
                }
              : store
          )
        );

        console.log('[Integration] Integration updated:', result);
        toast.success(`${selectedPlatform?.name} instellingen bijgewerkt!`, {
          description: `${normalizedShopName} wijzigingen zijn opgeslagen`
        });
      } else {
        const result = await api.createIntegration(integrationData);
        console.log('[Integration] Integration created:', result);
        toast.success(`${selectedPlatform?.name} winkel succesvol gekoppeld!`, {
          description: `${normalizedShopName} is nu actief in Dropsyncr`
        });
      }
      
      setShowConnectionDialog(false);
      setSelectedPlatform(null);
      setEditingStore(null);
      
      // Reload integrations (required for newly created integrations)
      if (!editingStore) {
        await loadIntegrations();
      }
    } catch (error: any) {
      console.error('[Integration] Failed to save integration:', error);
      toast.error(editingStore ? 'Kon integratie niet bijwerken' : 'Kon integratie niet koppelen', {
        description: error.message || 'Probeer het opnieuw'
      });
    }
  };

  const handleToggleActive = async (id: number) => {
    const store = connectedStores.find(s => s.id === id);
    if (!store) return;

    try {
      await api.updateIntegration(id, { active: !store.active });
      setConnectedStores(connectedStores.map(s => 
        s.id === id ? { ...s, active: !s.active } : s
      ));
      toast.success('Status bijgewerkt');
    } catch (error: any) {
      console.error('Failed to update integration:', error);
      toast.error('Kon status niet bijwerken');
    }
  };

  const handleDisconnect = async (id: number) => {
    const store = connectedStores.find(s => s.id === id);
    if (!store) return;

    try {
      await api.deleteIntegration(id);
      setConnectedStores(connectedStores.filter(s => s.id !== id));
      toast.success(`${store?.name} is losgekoppeld`);
    } catch (error: any) {
      console.error('Failed to delete integration:', error);
      toast.error('Kon integratie niet verwijderen');
    }
  };

  const handleSyncOrders = async (storeId: number) => {
    if (!activeProfile) return;

    const store = connectedStores.find(s => s.id === storeId);
    if (!store || store.platform !== 'bol.com') {
      toast.error('Alleen Bol.com sync wordt momenteel ondersteund');
      return;
    }

    try {
      setSyncing(true);
      const result = await api.syncBolOrders(activeProfile);
      
      toast.success('Orders gesynchroniseerd!', {
        description: `${result.imported} nieuwe orders, ${result.updated} bijgewerkt`
      });
    } catch (error: any) {
      console.error('Failed to sync orders:', error);
      
      // Extract the most helpful error message
      let errorDescription = error.message || 'Controleer je API credentials';
      
      // If the error message contains the full backend error, clean it up
      if (errorDescription.includes('Failed to sync orders from Bol.com:')) {
        errorDescription = errorDescription.replace('Failed to sync orders from Bol.com:', '').trim();
      }
      
      toast.error('Kon orders niet synchroniseren', {
        description: errorDescription,
        duration: 10000, // Show for 10 seconds for longer error messages
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Integraties
          </h2>
          <p className="text-slate-600">Koppel je favoriete verkoopkanalen en marketplaces</p>
        </div>
        {!activeProfile && (
          <Alert className="max-w-md">
            <AlertDescription>
              Selecteer eerst een installatie rechtsboven om integraties te beheren
            </AlertDescription>
          </Alert>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          {/* Connected Stores */}
          {connectedStores.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg text-slate-900">Gekoppelde Stores ({connectedStores.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {connectedStores.map((store) => (
                  <Card key={store.id} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-2 flex items-center justify-center shadow-sm`}>
                            <img src={store.logo} alt={store.platform} className="w-full h-full object-contain" />
                          </div>
                          <div>
                            <h4 className="text-slate-900">{store.name}</h4>
                            <p className="text-sm text-slate-500">
                              {availablePlatforms.find(p => p.id === (store.platform === 'bol.com' ? 'bol' : store.platform))?.name || store.platform}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0 gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Gekoppeld
                        </Badge>
                      </div>

                      <div className="space-y-3 mb-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">API Key:</span>
                          <span className="font-mono text-slate-900">{store.apiKey}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">Status:</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-900">{store.active ? 'Actief' : 'Inactief'}</span>
                            <Switch checked={store.active} onCheckedChange={() => handleToggleActive(store.id)} />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {store.platform === 'bol.com' && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1 gap-2 border-slate-200"
                            onClick={() => handleSyncOrders(store.id)}
                            disabled={syncing || !store.active}
                          >
                            {syncing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                            Sync Orders
                          </Button>
                        )}
                        <div className="ml-auto flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 gap-1 border-slate-200"
                            onClick={() => handleOpenSettings(store)}
                          >
                            <Settings className="w-3.5 h-3.5" />
                            Instellingen
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 px-2 gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                            onClick={() => handleDisconnect(store.id)}
                          >
                            Ontkoppelen
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Available Platforms */}
      <div className="space-y-4">
        <h3 className="text-lg text-slate-900">Beschikbare Integraties</h3>
        <p className="text-sm text-slate-600">Je kunt meerdere accounts per platform toevoegen</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availablePlatforms.map((platform) => (
            <Card 
              key={platform.id} 
              className="border-slate-200 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all cursor-pointer group"
              onClick={() => handleConnectPlatform(platform)}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${platform.bgColor} p-3 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                    <img src={platform.logo} alt={platform.name} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-slate-900 mb-1">{platform.name}</h4>
                    <p className="text-sm text-slate-600 mb-3">{platform.description}</p>
                    <Button 
                      size="sm" 
                      className={`gap-2 bg-gradient-to-r ${platform.color} hover:opacity-90 shadow-md`}
                      onClick={(e: MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                        handleConnectPlatform(platform);
                      }}
                      disabled={!activeProfile}
                    >
                      <Plus className="w-4 h-4" />
                      Nieuw Toevoegen
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl shadow-lg">
              <Store className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-slate-900 mb-2">Multi-channel verkopen</h4>
              <p className="text-sm text-slate-700 mb-3">
                Koppel al je verkoopkanalen en beheer alle orders vanaf één centrale plek. 
                Dropsyncr synchroniseert automatisch je voorraad en orders tussen alle platforms.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-indigo-300 text-indigo-700 bg-white">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Automatische sync
                </Badge>
                <Badge variant="outline" className="border-purple-300 text-purple-700 bg-white">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Real-time updates
                </Badge>
                <Badge variant="outline" className="border-pink-300 text-pink-700 bg-white">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Centraal dashboard
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Dialog */}
      <Dialog
        open={showConnectionDialog}
        onOpenChange={(open: boolean) => {
          setShowConnectionDialog(open);
          if (!open) {
            setEditingStore(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedPlatform && (
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${selectedPlatform.color} p-2 flex items-center justify-center`}>
                    <img src={selectedPlatform.logo} alt={selectedPlatform.name} className="w-full h-full object-contain" />
                  </div>
                )}
                <DialogTitle>
                  {editingStore ? `${selectedPlatform?.name} Instellingen` : selectedPlatform?.name}
                </DialogTitle>
              </div>
              <a 
                href="#" 
                className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
                onClick={(e) => {
                  e.preventDefault();
                  toast.info('Help documentatie wordt geladen...');
                }}
              >
                Hoe koppel je?
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="shopname">Shopnaam</Label>
              <Input
                id="shopname"
                placeholder="Bijv. Mijn Webshop"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="border-slate-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apikey">
                {selectedPlatform?.id === 'bol' ? 'Client ID' : 'API Key'}
              </Label>
              <Input
                id="apikey"
                placeholder={
                  editingStore
                    ? (selectedPlatform?.id === 'bol' ? 'Laat leeg om huidige Client ID te behouden' : 'Laat leeg om huidige API key te behouden')
                    : (selectedPlatform?.id === 'bol' ? 'Voer je Client ID in' : 'Voer je API key in')
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="border-slate-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apisecret">
                {selectedPlatform?.id === 'bol' ? 'Client Secret' : 'API Secret'}
              </Label>
              <Input
                id="apisecret"
                type="password"
                placeholder={
                  editingStore
                    ? (selectedPlatform?.id === 'bol' ? 'Laat leeg om huidige Client Secret te behouden' : 'Laat leeg om huidige API secret te behouden')
                    : (selectedPlatform?.id === 'bol' ? 'Voer je Client Secret in' : 'Voer je API secret in')
                }
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className="border-slate-200"
              />
            </div>

            <div className="flex items-center space-x-2 py-2">
              <Checkbox 
                id="process-orders" 
                checked={processOrders}
                onCheckedChange={(checked: boolean | 'indeterminate') => setProcessOrders(checked === true)}
              />
              <Label 
                htmlFor="process-orders" 
                className="text-sm cursor-pointer"
              >
                Verwerk bestellingen in shop
              </Label>
            </div>

            <div className="flex items-center justify-between py-2">
              <Label htmlFor="active-toggle" className="text-sm">
                Actief
              </Label>
              <Switch 
                id="active-toggle"
                checked={isActive} 
                onCheckedChange={setIsActive}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={handleSubmitConnection}
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 shadow-lg"
            >
              {editingStore ? 'Wijzigingen Opslaan' : 'Koppelen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
