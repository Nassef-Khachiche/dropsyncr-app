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
  Loader2,
  Calendar,
  ChevronDown,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
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
import { useLanguage } from '../contexts/LanguageContext';

interface DashboardProps {
  activeProfile: string | null;
}

export function Dashboard({ activeProfile }: DashboardProps) {
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    pendingOrders: 0,
    processedToday: 0,
  });
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(() => t('today'));
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const dateOptions = [
    t('today'),
    t('yesterday'),
    t('last7days'),
    t('lastMonth'),
    t('currentMonth'),
    t('thisYear'),
    t('custom'),
  ];

  useEffect(() => {
    if (activeProfile) {
      loadDashboardData();
    } else {
      setLoading(false);
    }
  }, [activeProfile, dateFilter, customStartDate, customEndDate]);

  const getDashboardQuery = () => {
    if (dateFilter === t('today')) return { period: 'today' };
    if (dateFilter === t('yesterday')) return { period: 'yesterday' };
    if (dateFilter === t('last7days')) return { period: 'last_7' };
    if (dateFilter === t('lastMonth')) return { period: 'last_month' };
    if (dateFilter === t('thisYear')) return { period: 'this_year' };
    if (customStartDate || customEndDate) return { period: 'custom', startDate: customStartDate, endDate: customEndDate };
    return { period: 'current_month' };
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const data = await api.getDashboardStats({
        installationId: activeProfile || undefined,
        ...getDashboardQuery(),
      });
      setStats(data.stats || {
        totalRevenue: 0,
        totalOrders: 0,
        pendingOrders: 0,
        processedToday: 0,
      });
      setRevenueData(data.charts?.revenueData || []);
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
      setStats({ totalRevenue: 0, totalOrders: 0, pendingOrders: 0, processedToday: 0 });
      setRevenueData([]);
    } finally {
      setLoading(false);
    }
  };

  const exportDashboard = () => {
    const rows = revenueData.map((row) => ({
      Datum: row.label || row.date,
      Omzet: row.revenue || 0,
      Orders: row.orders || 0,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Dashboard');
    XLSX.writeFile(wb, `dashboard_export_${new Date().toISOString().split('T')[0]}.xlsx`);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-indigo-600">{t('dashboard')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('dashboardSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportDashboard}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg bg-white shadow-sm hover:bg-slate-50 transition-colors text-sm text-slate-700"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export</span>
          </button>
          <div className="relative">
            <button
              onClick={() => { setShowDateDropdown(!showDateDropdown); setShowCustomPicker(false); }}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg bg-white shadow-sm hover:bg-slate-50 transition-colors text-sm text-slate-700"
            >
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>{dateFilter}</span>
              <ChevronDown className="w-4 h-4 text-slate-500" />
            </button>

            {/* Datum dropdown */}
            {showDateDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-50">
                {dateOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      if (option === t('custom')) {
                        setShowCustomPicker(true);
                        setShowDateDropdown(false);
                      } else {
                        setDateFilter(option);
                        setShowCustomPicker(false);
                        setShowDateDropdown(false);
                      }
                    }}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors first:rounded-t-xl last:rounded-b-xl ${
                      dateFilter === option ? 'font-medium' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                    style={dateFilter === option ? { backgroundColor: '#4f46e5', color: 'white' } : {}}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {/* Aangepaste datumpicker */}
            {showCustomPicker && (
              <div className="absolute mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-4" style={{ right: '0' }}>
              <p className="text-sm font-medium text-slate-700 mb-3">{t('choosePeriod')}</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">{t('startDate')}</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">{t('endDate')}</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowCustomPicker(false)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={() => {
                      setDateFilter(customStartDate && customEndDate ? `${customStartDate} t/m ${customEndDate}` : 'Aangepast');
                      setShowCustomPicker(false);
                    }}
                    style={{ backgroundColor: '#4f46e5', color: 'white' }}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium"
                  >
                    {t('apply')}
                  </button>
                </div>
              </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-indigo-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">{t('totalRevenue')}</CardTitle>
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
              <span className="text-xs text-slate-500">{t('vsLastPeriod')}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-purple-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">{t('totalOrders')}</CardTitle>
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
              <span className="text-xs text-slate-500">{t('vsLastPeriod')}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-orange-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">{t('pendingOrders')}</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg">
              <Clock className="w-4 h-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
              {stats.pendingOrders}
            </div>
            <p className="text-xs text-slate-500 mt-2">{t('stillToShip')}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-emerald-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">{t('processedToday')}</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              {stats.processedToday}
            </div>
            <p className="text-xs text-slate-500 mt-2">{t('labelsPrinted')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <div className="grid grid-cols-1 gap-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>{t('revenueOrdersOverview')}</CardTitle>
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
                <XAxis dataKey="label" stroke="#94a3b8" />
                <YAxis yAxisId="left" stroke="#94a3b8" />
                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }} />
                <Legend />
                <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#colorRevenue)" name={`${t('totalRevenue')} (€)`} strokeWidth={2} />
                <Area yAxisId="right" type="monotone" dataKey="orders" stroke="#8b5cf6" fill="url(#colorOrders)" name={t('totalOrders')} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}