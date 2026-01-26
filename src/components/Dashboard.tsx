import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { 
  Package, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Euro,
  ArrowUpRight,
  Loader2
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart
} from 'recharts';
import { api } from '../services/api';

interface DashboardProps {
  activeProfile: string | null;
}

export function Dashboard({ activeProfile }: DashboardProps) {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    pendingOrders: 0,
    processedToday: 0,
  });
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [ordersBySupplier, setOrdersBySupplier] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only load if activeProfile is a valid numeric ID
    if (activeProfile && !isNaN(parseInt(activeProfile))) {
      loadDashboardData();
    } else {
      // If no valid profile, set loading to false and show empty state
      setLoading(false);
    }
  }, [activeProfile]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const data = await api.getDashboardStats(activeProfile);
      setStats(data.stats || {
        totalRevenue: 0,
        totalOrders: 0,
        pendingOrders: 0,
        processedToday: 0,
      });
      setRevenueData(data.charts?.revenueData || []);
      setOrdersBySupplier(data.charts?.ordersBySupplier || []);
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
      // Set default values on error
      setStats({
        totalRevenue: 0,
        totalOrders: 0,
        pendingOrders: 0,
        processedToday: 0,
      });
      setRevenueData([]);
      setOrdersBySupplier([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-indigo-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">Totale Omzet</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg">
              <Euro className="w-4 h-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              €{stats.totalRevenue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs text-emerald-600">+12.5%</span>
              <span className="text-xs text-slate-500">vs vorige week</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-purple-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">Totale Orders</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg">
              <Package className="w-4 h-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              {stats.totalOrders}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs text-emerald-600">+8.2%</span>
              <span className="text-xs text-slate-500">vs vorige week</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-orange-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">Openstaande Orders</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg">
              <Clock className="w-4 h-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
              {stats.pendingOrders}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Nog te verzenden
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-emerald-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">Verwerkt Vandaag</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              {stats.processedToday}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Labels geprint & verzonden
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Omzet & Orders Overzicht</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={revenueData.length > 0 ? revenueData : [{ date: 'No data', revenue: 0, orders: 0 }]}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis yAxisId="left" stroke="#94a3b8" />
                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                />
                <Legend />
                <Area 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#6366f1" 
                  fill="url(#colorRevenue)"
                  name="Omzet (€)"
                  strokeWidth={2}
                />
                <Area 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="orders" 
                  stroke="#8b5cf6" 
                  fill="url(#colorOrders)"
                  name="Orders"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Orders by Supplier */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Orders per Leverancier</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={ordersBySupplier.length > 0 ? ordersBySupplier : [{ supplier: 'No data', orders: 0, percentage: 0 }]}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="supplier" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                />
                <Bar dataKey="orders" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Recente Activiteit</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { 
                type: 'success', 
                message: '15 orders verwerkt en verzonden', 
                time: '5 minuten geleden',
                icon: CheckCircle,
                gradient: 'from-emerald-500 to-teal-500'
              },
              { 
                type: 'info', 
                message: '23 nieuwe tracking codes toegevoegd', 
                time: '12 minuten geleden',
                icon: Package,
                gradient: 'from-indigo-500 to-purple-500'
              },
              { 
                type: 'warning', 
                message: '5 orders wachten op tracking code', 
                time: '1 uur geleden',
                icon: AlertCircle,
                gradient: 'from-orange-500 to-amber-500'
              },
              { 
                type: 'success', 
                message: '45 orders geïmporteerd van Bol.com', 
                time: '2 uur geleden',
                icon: TrendingUp,
                gradient: 'from-indigo-500 to-blue-500'
              },
            ].map((activity, index) => {
              const Icon = activity.icon;

              return (
                <div key={index} className="flex items-start gap-4 p-4 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-colors border border-slate-100">
                  <div className={`p-2.5 bg-gradient-to-br ${activity.gradient} rounded-lg shadow-sm`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-900">{activity.message}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{activity.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
