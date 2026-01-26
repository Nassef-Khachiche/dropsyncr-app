import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
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
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Users,
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  FileSpreadsheet,
  Calendar,
  ChevronRight,
  Building2
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface FulfillmentAnalyticsProps {
  activeProfile: string;
}

interface ClientStats {
  id: number;
  name: string;
  logo: string;
  ordersProcessed: number;
  totalRevenue: number;
  avgOrderValue: number;
  trend: number;
  stores: string[];
  status: 'active' | 'inactive';
}

const mockClientStats: ClientStats[] = [
  {
    id: 1,
    name: 'Shopcentral',
    logo: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200',
    ordersProcessed: 1247,
    totalRevenue: 3741.00,
    avgOrderValue: 3.00,
    trend: 12.5,
    stores: ['Bol.com', 'Amazon'],
    status: 'active'
  },
  {
    id: 2,
    name: 'Inovra',
    logo: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=200',
    ordersProcessed: 892,
    totalRevenue: 2676.00,
    avgOrderValue: 3.00,
    trend: 8.3,
    stores: ['Bol.com', 'Shopify'],
    status: 'active'
  },
  {
    id: 3,
    name: 'TechGear Solutions',
    logo: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200',
    ordersProcessed: 645,
    totalRevenue: 1935.00,
    avgOrderValue: 3.00,
    trend: -3.2,
    stores: ['Bol.com', 'Kaufland'],
    status: 'active'
  },
  {
    id: 4,
    name: 'HomeStyle Living',
    logo: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=200',
    ordersProcessed: 423,
    totalRevenue: 1269.00,
    avgOrderValue: 3.00,
    trend: 15.7,
    stores: ['Shopify'],
    status: 'active'
  },
  {
    id: 5,
    name: 'BeautyBox Pro',
    logo: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=200',
    ordersProcessed: 234,
    totalRevenue: 702.00,
    avgOrderValue: 3.00,
    trend: -1.8,
    stores: ['Bol.com'],
    status: 'inactive'
  }
];

const monthlyData = [
  { month: 'Jan', orders: 2847, revenue: 8541 },
  { month: 'Feb', orders: 3123, revenue: 9369 },
  { month: 'Mrt', orders: 2956, revenue: 8868 },
  { month: 'Apr', orders: 3441, revenue: 10323 },
  { month: 'Mei', orders: 3789, revenue: 11367 },
  { month: 'Jun', orders: 4234, revenue: 12702 },
];

const clientDistribution = [
  { name: 'Shopcentral', value: 1247, color: '#6366f1' },
  { name: 'Inovra', value: 892, color: '#8b5cf6' },
  { name: 'TechGear', value: 645, color: '#ec4899' },
  { name: 'HomeStyle', value: 423, color: '#14b8a6' },
  { name: 'BeautyBox', value: 234, color: '#f59e0b' },
];

export function FulfillmentAnalytics({ activeProfile }: FulfillmentAnalyticsProps) {
  const [period, setPeriod] = useState('current-month');
  const [selectedClient, setSelectedClient] = useState<number | null>(null);

  const totalOrders = mockClientStats.reduce((sum, client) => sum + client.ordersProcessed, 0);
  const totalRevenue = mockClientStats.reduce((sum, client) => sum + client.totalRevenue, 0);
  const activeClients = mockClientStats.filter(c => c.status === 'active').length;

  const handleExport = () => {
    toast.success('Rapport wordt gegenereerd...', {
      description: 'Je fulfilment rapport wordt voorbereid voor download'
    });
  };

  const handleViewClient = (clientId: number) => {
    setSelectedClient(clientId);
    toast.info('Client details openen...');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Fulfilment Analytics
          </h2>
          <p className="text-slate-600">Overzicht van alle verwerkte orders per klant</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[200px] border-slate-200">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current-month">Deze maand</SelectItem>
              <SelectItem value="last-month">Vorige maand</SelectItem>
              <SelectItem value="quarter">Dit kwartaal</SelectItem>
              <SelectItem value="year">Dit jaar</SelectItem>
              <SelectItem value="custom">Aangepaste periode</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            className="gap-2 border-slate-200"
            onClick={handleExport}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exporteer Rapport
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl shadow-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-1">Actieve Klanten</p>
            <p className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              {activeClients}
            </p>
            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +2 deze maand
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl shadow-lg">
                <Package className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-1">Orders Verwerkt</p>
            <p className="text-3xl bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              {totalOrders.toLocaleString()}
            </p>
            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +18% vs vorige maand
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-1">Totale Omzet</p>
            <p className="text-3xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              &euro; {totalRevenue.toLocaleString()}
            </p>
            <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +12% vs vorige maand
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl shadow-lg">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-1">Gem. Order Waarde</p>
            <p className="text-3xl bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
              &euro; {(totalRevenue / totalOrders).toFixed(2)}
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Per verwerkte order
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Orders & Omzet Trend</CardTitle>
            <CardDescription>Maandelijkse ontwikkeling</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="orders" 
                  stroke="#6366f1" 
                  strokeWidth={2}
                  name="Orders"
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#8b5cf6" 
                  strokeWidth={2}
                  name="Omzet (€)"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Client Distribution */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Verdeling per Klant</CardTitle>
            <CardDescription>Orders per klant dit maand</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={clientDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {clientDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Client Overview Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Klant Overzicht</CardTitle>
          <CardDescription>Gedetailleerd overzicht per fulfilment klant</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead>Klant</TableHead>
                  <TableHead>Stores</TableHead>
                  <TableHead className="text-center">Orders Verwerkt</TableHead>
                  <TableHead className="text-right">Totale Kosten</TableHead>
                  <TableHead className="text-right">Gem. per Order</TableHead>
                  <TableHead className="text-center">Trend</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockClientStats.map((client) => (
                  <TableRow key={client.id} className="hover:bg-slate-50/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                          <img 
                            src={client.logo} 
                            alt={client.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="text-sm text-slate-900">{client.name}</p>
                          <p className="text-xs text-slate-500">ID: FFM-{client.id.toString().padStart(3, '0')}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {client.stores.map((store, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs border-indigo-300 bg-indigo-50 text-indigo-700">
                            {store}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm text-slate-900">{client.ordersProcessed.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm text-slate-900">&euro; {client.totalRevenue.toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm text-slate-900">&euro; {client.avgOrderValue.toFixed(2)}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {client.trend > 0 ? (
                        <span className="text-sm text-emerald-600 flex items-center justify-center gap-1">
                          <TrendingUp className="w-4 h-4" />
                          +{client.trend}%
                        </span>
                      ) : (
                        <span className="text-sm text-red-600 flex items-center justify-center gap-1">
                          <TrendingDown className="w-4 h-4" />
                          {client.trend}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {client.status === 'active' ? (
                        <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0">
                          Actief
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-300 text-slate-600">
                          Inactief
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleViewClient(client.id)}
                        className="gap-1 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                      >
                        Details
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl shadow-lg">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-slate-900 mb-2">Fulfilment Services Dashboard</h4>
              <p className="text-sm text-slate-700 mb-3">
                Als fulfilment center verwerk je orders voor meerdere klanten. Dit dashboard geeft je een compleet overzicht 
                van alle verwerkte orders, omzet per klant en trends. Gebruik de export functie om gedetailleerde rapporten 
                te genereren voor facturering.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-indigo-300 text-indigo-700 bg-white">
                  Real-time tracking
                </Badge>
                <Badge variant="outline" className="border-purple-300 text-purple-700 bg-white">
                  Automatische facturering
                </Badge>
                <Badge variant="outline" className="border-pink-300 text-pink-700 bg-white">
                  Multi-client support
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
