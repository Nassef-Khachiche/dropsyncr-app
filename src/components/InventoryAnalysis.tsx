import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from './ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { 
  TrendingUp,
  AlertTriangle,
  FileSpreadsheet,
  Package,
  Info
} from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';

interface InventoryAnalysisProps {
  activeProfile: string;
}

const stockHealthData = [
  { name: 'Totaal', value: 850, color: '#3b82f6' },
  { name: 'Nieuwe artikelen', value: 220, color: '#3b82f6' },
  { name: 'Geen verkopen', value: 30, color: '#1e293b' },
  { name: 'Meer dan 12 weken', value: 180, color: '#ef4444' },
  { name: '8-12 weken', value: 45, color: '#f97316' },
  { name: '4-8 weken', value: 65, color: '#f59e0b' },
  { name: '0-4 weken', value: 85, color: '#10b981' },
];

const replenishmentAdvice = [
  {
    ean: '8721085279021',
    bsku: '--',
    title: 'Zaltino - Siliconen Lekbak - 60x60 - Waterdicht',
    salesLast28d: 1,
    freeStock: 1,
    salesForecast: 14,
    replenishmentAdvice: 13
  },
  {
    ean: '8721085279021',
    bsku: '--',
    title: 'MP3 Speler Digitale Radio - DAB/DAB+ en FM-ra',
    salesLast28d: 1,
    freeStock: 1,
    salesForecast: 2,
    replenishmentAdvice: 1
  },
];

export function InventoryAnalysis({ activeProfile }: InventoryAnalysisProps) {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Lvb Voorraad Analyse
        </h2>
        <p className="text-slate-600">Analyseer je voorraad en ontvang slimme aanvuladviezen</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white border border-slate-200 p-1 h-auto">
          <TabsTrigger value="overview" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white">
            Overzicht en actie
          </TabsTrigger>
          <TabsTrigger value="unhealthy" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white">
            Ongezonde voorraad
          </TabsTrigger>
          <TabsTrigger value="no-buybox" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white">
            Voorraad zonder koopblok
          </TabsTrigger>
          <TabsTrigger value="not-online" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white">
            Voorraad niet online
          </TabsTrigger>
          <TabsTrigger value="replenishment" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white">
            Aanvuladvies
          </TabsTrigger>
          <TabsTrigger value="export" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export excel
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stock Health Chart */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Voorraadgezondheid</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={stockHealthData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" stroke="#64748b" />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      stroke="#64748b"
                      width={90}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px'
                      }}
                      formatter={(value) => [`${value} items`, 'Items op voorraad']}
                    />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                      {stockHealthData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Metrics Cards */}
            <div className="space-y-6">
              {/* Turnover Speed */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg text-slate-900">Voorraadnomloopsnelheid</h3>
                    <Info className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-4xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                      204
                    </span>
                    <span className="text-slate-600">dagen</span>
                  </div>
                  <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">
                    Ongezond
                  </Badge>
                </CardContent>
              </Card>

              {/* Stock Ceiling Regular */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg text-slate-900">Voorraadplafond Regulier</h3>
                    <Info className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">Voorraadplafond huidige maand</span>
                        <Info className="w-4 h-4 text-slate-400" />
                      </div>
                      <span className="text-2xl text-slate-900">1400</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">Verwachte voorraadplafond volgende maand</span>
                        <Info className="w-4 h-4 text-slate-400" />
                      </div>
                      <span className="text-2xl text-slate-900">1400</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stock Ceiling XL */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg text-slate-900">Voorraadplafond XL</h3>
                    <Info className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">Voorraadplafond XL huidige maand</span>
                        <Info className="w-4 h-4 text-slate-400" />
                      </div>
                      <span className="text-2xl text-slate-900">100</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">Verwachte voorraadplafond XL volgende maand</span>
                        <Info className="w-4 h-4 text-slate-400" />
                      </div>
                      <span className="text-2xl text-slate-900">100</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Replenishment Advice Tab */}
        <TabsContent value="replenishment" className="space-y-6 mt-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Aanvuladvies</CardTitle>
              <p className="text-sm text-slate-600 mt-2">
                Artikelen waarvan onvoldoende voorraad is om aan de verkoopprognose te voldoen.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-amber-200 bg-amber-50/50">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-sm text-slate-700">
                  <strong>Let op:</strong> de verkoopprognose is geen garantie dat binnen het voorraadplafond blijven. 
                  De totale voorraad moet altijd binnen het voorraadplafond blijven.
                </AlertDescription>
              </Alert>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead>EAN</TableHead>
                      <TableHead>BSKU</TableHead>
                      <TableHead>Titel</TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          Mijn verkopen - 28d
                          <Info className="w-4 h-4 text-slate-400" />
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          Vrije voorraad
                          <Info className="w-4 h-4 text-slate-400" />
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          Mijn verkoopprognose
                          <Info className="w-4 h-4 text-slate-400" />
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          Aanvul-advies
                          <Info className="w-4 h-4 text-slate-400" />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {replenishmentAdvice.map((item, index) => (
                      <TableRow key={index} className="hover:bg-slate-50/50">
                        <TableCell className="font-mono text-sm">{item.ean}</TableCell>
                        <TableCell className="text-sm text-slate-600">{item.bsku}</TableCell>
                        <TableCell className="text-sm max-w-md">{item.title}</TableCell>
                        <TableCell className="text-center text-sm">{item.salesLast28d}</TableCell>
                        <TableCell className="text-center text-sm">{item.freeStock}</TableCell>
                        <TableCell className="text-center text-sm">{item.salesForecast}</TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-gradient-to-r from-orange-500 to-red-500 border-0">
                            {item.replenishmentAdvice}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Placeholder Tabs */}
        <TabsContent value="unhealthy" className="mt-6">
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
              <h3 className="text-lg text-slate-900 mb-2">Ongezonde voorraad</h3>
              <p className="text-sm text-slate-600">
                Artikelen met voorraad die langer dan 12 weken niet verkocht zijn
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="no-buybox" className="mt-6">
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <Package className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg text-slate-900 mb-2">Voorraad zonder koopblok</h3>
              <p className="text-sm text-slate-600">
                Artikelen op voorraad waar je geen koopblok op hebt
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="not-online" className="mt-6">
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <TrendingUp className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg text-slate-900 mb-2">Voorraad niet online</h3>
              <p className="text-sm text-slate-600">
                Artikelen op voorraad die niet online staan
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="mt-6">
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <FileSpreadsheet className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-lg text-slate-900 mb-2">Export naar Excel</h3>
              <p className="text-sm text-slate-600 mb-4">
                Exporteer je voorraadanalyse naar een Excel bestand
              </p>
              <Button className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600">
                <FileSpreadsheet className="w-4 h-4" />
                Download Excel
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Info Card */}
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl shadow-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-slate-900 mb-2">Slimme Voorraadanalyse</h4>
              <p className="text-sm text-slate-700">
                Dropsyncr analyseert je voorraadprestaties en geeft geautomatiseerde adviezen voor optimale voorraadniveaus. 
                Verminder overstock en vermijd out-of-stock situaties met onze AI-gedreven inzichten.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
