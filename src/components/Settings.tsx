import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  User,
  Users,
  Tag,
  Package,
  FileText,
  Gift,
  Code,
  Plus,
  Trash2,
  Edit,
  Mail,
  Shield,
  Settings as SettingsIcon,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface SettingsProps {
  activeProfile: string;
}

interface UserRole {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  lastActive: string;
}

interface Brand {
  id: number;
  name: string;
  logo: string;
  stores: number;
  products: number;
}

interface Packaging {
  id: number;
  name: string;
  dimensions: string;
  weight: string;
  price: number;
}

const mockUsers: UserRole[] = [
  {
    id: 1,
    name: 'Jan de Vries',
    email: 'jan@dropsyncr.nl',
    role: 'Administrator',
    status: 'Actief',
    lastActive: '2 minuten geleden'
  },
  {
    id: 2,
    name: 'Sophie Jansen',
    email: 'sophie@dropsyncr.nl',
    role: 'Manager',
    status: 'Actief',
    lastActive: '1 uur geleden'
  },
  {
    id: 3,
    name: 'Mark Bakker',
    email: 'mark@dropsyncr.nl',
    role: 'Medewerker',
    status: 'Inactief',
    lastActive: '3 dagen geleden'
  }
];

const mockBrands: Brand[] = [
  {
    id: 1,
    name: 'Zaltino',
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200',
    stores: 3,
    products: 124
  },
  {
    id: 2,
    name: 'Luxe Living',
    logo: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=200',
    stores: 2,
    products: 67
  }
];

const mockPackaging: Packaging[] = [
  {
    id: 1,
    name: 'Standaard Doos Small',
    dimensions: '20x15x10 cm',
    weight: '150g',
    price: 0.45
  },
  {
    id: 2,
    name: 'Standaard Doos Medium',
    dimensions: '30x20x15 cm',
    weight: '250g',
    price: 0.65
  },
  {
    id: 3,
    name: 'Standaard Doos Large',
    dimensions: '40x30x20 cm',
    weight: '400g',
    price: 0.95
  }
];

export function Settings({ activeProfile }: SettingsProps) {
  const [activeTab, setActiveTab] = useState('brands');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Instellingen
        </h2>
        <p className="text-slate-600">Beheer je account, gebruikers en systeeminstellingen</p>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white border border-slate-200 p-1 h-auto">
          <TabsTrigger value="brands" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white gap-2">
            <Tag className="w-4 h-4" />
            Brands
          </TabsTrigger>
          <TabsTrigger value="warehouse" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white gap-2">
            <Package className="w-4 h-4" />
            Magazijn
          </TabsTrigger>
          <TabsTrigger value="additional" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white gap-2">
            <SettingsIcon className="w-4 h-4" />
            Aanvullend
          </TabsTrigger>
        </TabsList>

        {/* Brands Tab */}
        <TabsContent value="brands" className="space-y-6 mt-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Brand Management</CardTitle>
                  <CardDescription>Beheer al je brands en merkidentiteiten</CardDescription>
                </div>
                <Button className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
                  <Plus className="w-4 h-4" />
                  Brand Toevoegen
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {mockBrands.map((brand) => (
                  <Card key={brand.id} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-16 h-16 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
                          <img src={brand.logo} alt={brand.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-slate-900 mb-1">{brand.name}</h4>
                          <p className="text-sm text-slate-600">{brand.stores} stores</p>
                        </div>
                      </div>

                      <div className="space-y-2 mb-4 pb-4 border-b border-slate-100">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">Producten:</span>
                          <span className="text-slate-900">{brand.products}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">Stores:</span>
                          <span className="text-slate-900">{brand.stores}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1 border-slate-200">
                          <Edit className="w-4 h-4 mr-2" />
                          Bewerken
                        </Button>
                        <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Warehouse Tab */}
        <TabsContent value="warehouse" className="space-y-6 mt-6">
          {/* Shipping Rules */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Verzendregels</CardTitle>
              <CardDescription>Configureer automatische verzendregels op basis van orderkenmerken</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-gradient-to-br from-slate-50 to-indigo-50/30 rounded-xl border border-slate-200">
                <h4 className="text-sm text-slate-900 mb-3">Automatische carrier selectie</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">Orders &lt; &euro;50 &rarr; PostNL Standaard</span>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">Orders &gt; &euro;50 &rarr; DHL Express</span>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">Buitenland &rarr; DPD Classic</span>
                    <Switch />
                  </div>
                </div>
              </div>
              <Button className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
                <Plus className="w-4 h-4" />
                Regel Toevoegen
              </Button>
            </CardContent>
          </Card>

          {/* Packing Slip Settings */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Pakbon Instellingen</CardTitle>
              <CardDescription>Personaliseer je pakbonnen met eigen branding</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="company-logo">Bedrijfslogo</Label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 bg-slate-100 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-300">
                    <Package className="w-8 h-8 text-slate-400" />
                  </div>
                  <Button variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Upload Logo
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="footer-text">Footer tekst</Label>
                <Textarea 
                  id="footer-text" 
                  placeholder="Bedankt voor je bestelling! Bezoek ons op www.example.com"
                  className="border-slate-200"
                />
              </div>

              <div className="flex items-center justify-between py-4 border-t border-slate-100">
                <div>
                  <h4 className="text-sm text-slate-900 mb-1">Toon prijzen op pakbon</h4>
                  <p className="text-sm text-slate-600">Laat orderwaarde zien voor klant</p>
                </div>
                <Switch />
              </div>

              <div className="flex items-center justify-between py-4 border-t border-slate-100">
                <div>
                  <h4 className="text-sm text-slate-900 mb-1">Automatisch printen</h4>
                  <p className="text-sm text-slate-600">Print pakbon bij order verwerking</p>
                </div>
                <Switch defaultChecked />
              </div>

              <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
                Wijzigingen Opslaan
              </Button>
            </CardContent>
          </Card>

          {/* Packaging */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Verpakkingen</CardTitle>
                  <CardDescription>Beheer al je verpakkingsmaterialen en kosten</CardDescription>
                </div>
                <Button className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
                  <Plus className="w-4 h-4" />
                  Verpakking Toevoegen
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead>Naam</TableHead>
                      <TableHead>Afmetingen</TableHead>
                      <TableHead>Gewicht</TableHead>
                      <TableHead>Prijs</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockPackaging.map((pkg) => (
                      <TableRow key={pkg.id} className="hover:bg-slate-50/50">
                        <TableCell className="text-sm text-slate-900">{pkg.name}</TableCell>
                        <TableCell className="text-sm text-slate-600">{pkg.dimensions}</TableCell>
                        <TableCell className="text-sm text-slate-600">{pkg.weight}</TableCell>
                        <TableCell className="text-sm text-slate-900">€ {pkg.price.toFixed(2)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Additional Tab */}
        <TabsContent value="additional" className="space-y-6 mt-6">
          {/* Affiliate Program */}
          <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-purple-50/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-purple-600" />
                Affiliate Programma
              </CardTitle>
              <CardDescription>Nodig vrienden uit en verdien beloningen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gradient-to-br from-indigo-50 to-purple-50/50 rounded-xl border border-indigo-200/60">
                  <div className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">12</div>
                  <div className="text-sm text-slate-600 mt-1">Uitnodigingen</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-xl border border-emerald-200/60">
                  <div className="text-3xl bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">8</div>
                  <div className="text-sm text-slate-600 mt-1">Conversies</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-pink-50/50 rounded-xl border border-purple-200/60">
                  <div className="text-3xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">&euro; 240</div>
                  <div className="text-sm text-slate-600 mt-1">Verdiend</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Jouw referral link</Label>
                <div className="flex gap-2">
                  <Input 
                    value="https://dropsyncr.com/ref/jan-devries" 
                    readOnly 
                    className="border-slate-200 bg-slate-50"
                  />
                  <Button 
                    variant="outline" 
                    className="gap-2 border-indigo-200 text-indigo-600"
                    onClick={() => toast.success('Link gekopieerd!')}
                  >
                    Kopieer
                  </Button>
                </div>
              </div>

              <div className="p-5 bg-gradient-to-br from-indigo-50 to-purple-50/50 rounded-xl border border-indigo-200/60">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg shadow-sm">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-sm space-y-2">
                    <p className="text-slate-900">
                      <strong>Verdien &euro;30 per referral!</strong>
                    </p>
                    <p className="text-slate-700">
                      Deel je link met vrienden en krijg &euro;30 voor elke nieuwe klant die zich aanmeldt via jouw link.
                      Je vriend krijgt ook 10% korting op de eerste maand!
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* API & Webhooks */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="w-5 h-5 text-indigo-600" />
                    API & Webhooks
                  </CardTitle>
                  <CardDescription>Beheer al je API sleutels en webhook configuraties</CardDescription>
                </div>
                <Button className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
                  <Plus className="w-4 h-4" />
                  API Key Toevoegen
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-sm text-slate-900 mb-1">Production API Key</h4>
                    <p className="text-xs text-slate-600">Aangemaakt op 12 jan 2024</p>
                  </div>
                  <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0">
                    Actief
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono">
                    sk_live_••••••••••••••••••••••••3xY2
                  </code>
                  <Button variant="outline" size="sm" onClick={() => toast.success('API key gekopieerd!')}>
                    Kopieer
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input 
                  placeholder="https://jouwapp.com/webhook/dropsyncr"
                  className="border-slate-200 font-mono text-sm"
                />
                <p className="text-xs text-slate-600">
                  Ontvang real-time updates over orders, voorraad en verzendingen
                </p>
              </div>

              <div className="flex items-center justify-between py-4 border-t border-slate-100">
                <div>
                  <h4 className="text-sm text-slate-900 mb-1">Webhook notificaties</h4>
                  <p className="text-sm text-slate-600">Stuur events naar je webhook URL</p>
                </div>
                <Switch defaultChecked />
              </div>

              <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
                Wijzigingen Opslaan
              </Button>

              <div className="p-5 bg-gradient-to-br from-indigo-50 to-purple-50/50 rounded-xl border border-indigo-200/60">
                <div className="flex items-start gap-4">
                  <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg shadow-sm">
                    <Code className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-sm space-y-2">
                    <p className="text-slate-900">
                      <strong>API Documentatie</strong>
                    </p>
                    <p className="text-slate-700">
                      Bekijk onze volledige API documentatie om te leren hoe je Dropsyncr kunt integreren in je eigen applicaties.
                    </p>
                    <Button variant="outline" size="sm" className="gap-2 border-indigo-200 text-indigo-600 mt-2">
                      Bekijk Documentatie
                      <Code className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
