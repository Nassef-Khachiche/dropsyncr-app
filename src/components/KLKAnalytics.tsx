import { useEffect, useState, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../services/api';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { Calendar } from './ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  ShoppingCart,
  Euro,
  Megaphone,
  Calendar as CalendarIcon,
  ShoppingBag,
  Store,
  Package,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';

interface KLKAnalyticsProps {
  activeProfile: string;
}

interface DailyData {
  date: string;
  omzet?: number;
  inkoopkosten?: number;
  cogs?: number;
  advertentiekosten?: number;
}

interface ChannelData {
  daily: DailyData[];
}

interface MockData {
  bol: ChannelData;
  kaufland: ChannelData;
  fleximedix: ChannelData;
  inandoutdoormatch: ChannelData;
  fulfilment: ChannelData;
}

const createEmptyKlkData = (): MockData => ({
  bol: { daily: [] },
  kaufland: { daily: [] },
  fleximedix: { daily: [] },
  inandoutdoormatch: { daily: [] },
  fulfilment: { daily: [] },
});

const normalizeKlkData = (payload: any): MockData => {
  const channels = payload?.channels || {};
  return {
    bol: { daily: Array.isArray(channels.bol?.daily) ? channels.bol.daily : [] },
    kaufland: { daily: Array.isArray(channels.kaufland?.daily) ? channels.kaufland.daily : [] },
    fleximedix: { daily: Array.isArray(channels.fleximedix?.daily) ? channels.fleximedix.daily : [] },
    inandoutdoormatch: { daily: Array.isArray(channels.inandoutdoormatch?.daily) ? channels.inandoutdoormatch.daily : [] },
    fulfilment: { daily: Array.isArray(channels.fulfilment?.daily) ? channels.fulfilment.daily : [] },
  };
};

/* const generateMockData = (): MockData => {
  const days = 19;
  const data: MockData = {
    bol: { daily: [] },
    kaufland: { daily: [] },
    fleximedix: { daily: [] },
    inandoutdoormatch: { daily: [] },
    fulfilment: { daily: [] },
  };

  for (let i = 1; i <= days; i++) {
    const date = `2026-03-${i.toString().padStart(2, '0')}`;
    
    const bolOmzet = 200 + Math.random() * 600;
    data.bol.daily.push({
      date,
      omzet: Math.round(bolOmzet * 100) / 100,
      inkoopkosten: Math.round(bolOmzet * (0.55 + Math.random() * 0.1) * 100) / 100,
    });

    const kauflandOmzet = 150 + Math.random() * 350;
    data.kaufland.daily.push({
      date,
      omzet: Math.round(kauflandOmzet * 100) / 100,
      inkoopkosten: Math.round(kauflandOmzet * (0.6 + Math.random() * 0.1) * 100) / 100,
    });

    const fleximedixOmzet = 300 + Math.random() * 900;
    data.fleximedix.daily.push({
      date,
      omzet: Math.round(fleximedixOmzet * 100) / 100,
      cogs: Math.round(fleximedixOmzet * (0.4 + Math.random() * 0.1) * 100) / 100,
      advertentiekosten: Math.round((50 + Math.random() * 100) * 100) / 100,
    });

    const inandoutOmzet = 400 + Math.random() * 1100;
    data.inandoutdoormatch.daily.push({
      date,
      omzet: Math.round(inandoutOmzet * 100) / 100,
      cogs: Math.round(inandoutOmzet * (0.45 + Math.random() * 0.1) * 100) / 100,
      advertentiekosten: Math.round((80 + Math.random() * 120) * 100) / 100,
    });

    const fulfilmentOmzet = 100 + Math.random() * 300;
    data.fulfilment.daily.push({
      date,
      omzet: Math.round(fulfilmentOmzet * 100) / 100,
    });
  }

  return data;
};

const MOCK_KLK_DATA = generateMockData(); */

interface PeriodPreset {
  id: string;
  label: string;
}

export function KLKAnalytics({ activeProfile }: KLKAnalyticsProps) {
  const { t } = useLanguage();
  const [selectedPeriod, setSelectedPeriod] = useState('current_month');
  const [customDateRange, setCustomDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [analyticsData, setAnalyticsData] = useState<MockData>(() => createEmptyKlkData());
  const [loading, setLoading] = useState(false);

  const PERIOD_PRESETS: PeriodPreset[] = [
    { id: 'today', label: t('today') },
    { id: 'yesterday', label: t('yesterday') },
    { id: 'last_7', label: t('last7days') },
    { id: 'last_month', label: t('lastMonth') },
    { id: 'current_month', label: t('currentMonth') },
    { id: 'this_year', label: t('thisYear') },
    { id: 'custom', label: t('custom') },
  ];

  const getDateRange = (): { start: Date; end: Date } => {
    const today = new Date();
    
    switch (selectedPeriod) {
      case 'today':
        return { start: today, end: today };
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { start: yesterday, end: yesterday };
      }
      case 'last_7': {
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        return { start, end: today };
      }
      case 'last_month': {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start, end };
      }
      case 'current_month':
        return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
      case 'this_year':
        return { start: new Date(today.getFullYear(), 0, 1), end: today };
      case 'custom':
        return {
          start: customDateRange.from || new Date(today.getFullYear(), today.getMonth(), 1),
          end: customDateRange.to || today,
        };
      default:
        return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: today };
    }
  };

  const dateRange = getDateRange();

  const formatApiDate = (date: Date) => date.toISOString().split('T')[0];

  useEffect(() => {
    if (!activeProfile) return;

    const loadAnalytics = async () => {
      try {
        setLoading(true);
        const data = await api.getKlkAnalytics({
          installationId: activeProfile,
          period: selectedPeriod,
          startDate: selectedPeriod === 'custom' ? formatApiDate(dateRange.start) : undefined,
          endDate: selectedPeriod === 'custom' ? formatApiDate(dateRange.end) : undefined,
        });
        setAnalyticsData(normalizeKlkData(data));
      } catch (error) {
        console.error('Failed to load KLK analytics:', error);
        setAnalyticsData(createEmptyKlkData());
      } finally {
        setLoading(false);
      }
    };

    void loadAnalytics();
  }, [activeProfile, selectedPeriod, customDateRange.from, customDateRange.to]);

  const filteredData = useMemo(() => {
    const filterByDate = (daily: DailyData[]) => {
      return daily.filter((d) => {
        const date = new Date(d.date);
        return date >= dateRange.start && date <= dateRange.end;
      });
    };

    return {
      bol: { daily: filterByDate(analyticsData.bol.daily) },
      kaufland: { daily: filterByDate(analyticsData.kaufland.daily) },
      fleximedix: { daily: filterByDate(analyticsData.fleximedix.daily) },
      inandoutdoormatch: { daily: filterByDate(analyticsData.inandoutdoormatch.daily) },
      fulfilment: { daily: filterByDate(analyticsData.fulfilment.daily) },
    };
  }, [analyticsData, dateRange.start, dateRange.end]);

  const totals = useMemo(() => {
    const sumOmzet = (channel: ChannelData) =>
      channel.daily.reduce((sum, d) => sum + (d.omzet || 0), 0);
    const sumInkoopkosten = (channel: ChannelData) =>
      channel.daily.reduce((sum, d) => sum + (d.inkoopkosten || 0), 0);
    const sumCogs = (channel: ChannelData) =>
      channel.daily.reduce((sum, d) => sum + (d.cogs || 0), 0);
    const sumAdSpend = (channel: ChannelData) =>
      channel.daily.reduce((sum, d) => sum + (d.advertentiekosten || 0), 0);

    const totalRevenue =
      sumOmzet(filteredData.bol) +
      sumOmzet(filteredData.kaufland) +
      sumOmzet(filteredData.fleximedix) +
      sumOmzet(filteredData.inandoutdoormatch) +
      sumOmzet(filteredData.fulfilment);

    const totalCogs =
      sumInkoopkosten(filteredData.bol) +
      sumInkoopkosten(filteredData.kaufland) +
      sumCogs(filteredData.fleximedix) +
      sumCogs(filteredData.inandoutdoormatch);

    const totalAdSpend = sumAdSpend(filteredData.fleximedix) + sumAdSpend(filteredData.inandoutdoormatch);

    const grossProfit = totalRevenue - totalCogs;
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return { totalRevenue, totalCogs, grossProfit, totalAdSpend, margin };
  }, [filteredData]);

  const combinedChartData = useMemo(() => {
    const dateMap = new Map<string, any>();

    filteredData.bol.daily.forEach((d) => {
      if (!dateMap.has(d.date)) dateMap.set(d.date, { date: d.date });
      dateMap.get(d.date)!.bol = d.omzet || 0;
    });
    filteredData.kaufland.daily.forEach((d) => {
      if (!dateMap.has(d.date)) dateMap.set(d.date, { date: d.date });
      dateMap.get(d.date)!.kaufland = d.omzet || 0;
    });
    filteredData.fleximedix.daily.forEach((d) => {
      if (!dateMap.has(d.date)) dateMap.set(d.date, { date: d.date });
      dateMap.get(d.date)!.fleximedix = d.omzet || 0;
    });
    filteredData.inandoutdoormatch.daily.forEach((d) => {
      if (!dateMap.has(d.date)) dateMap.set(d.date, { date: d.date });
      dateMap.get(d.date)!.inandoutdoormatch = d.omzet || 0;
    });
    filteredData.fulfilment.daily.forEach((d) => {
      if (!dateMap.has(d.date)) dateMap.set(d.date, { date: d.date });
      dateMap.get(d.date)!.fulfilment = d.omzet || 0;
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredData]);

  const formatCurrency = (value: number) => {
    return value.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
  };

  const formatDateDisplay = (date: Date) => {
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  };

  const exportAnalytics = () => {
    const rows = Object.entries(filteredData).flatMap(([channel, value]) =>
      value.daily.map((row) => ({
        Kanaal: channel,
        Datum: row.date,
        Omzet: row.omzet || 0,
        Inkoopkosten: row.inkoopkosten || 0,
        COGS: row.cogs || 0,
        Advertentiekosten: row.advertentiekosten || 0,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'KLK Analytics');
    XLSX.writeFile(wb, `klk_analytics_${formatApiDate(dateRange.start)}_${formatApiDate(dateRange.end)}.xlsx`);
  };

  const formatDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  };

  const getPeriodLabel = () => {
    const preset = PERIOD_PRESETS.find((p) => p.id === selectedPeriod);
    if (selectedPeriod === 'custom' && customDateRange.from && customDateRange.to) {
      return `${preset?.label} — ${formatDateDisplay(customDateRange.from)} t/m ${formatDateDisplay(customDateRange.to)}`;
    }
    return `${preset?.label} — ${formatDateDisplay(dateRange.start)} t/m ${formatDateDisplay(dateRange.end)}`;
  };

  const getChannelTotals = (channel: ChannelData, type: 'bol' | 'kaufland' | 'fleximedix' | 'inandoutdoormatch' | 'fulfilment') => {
    const omzet = channel.daily.reduce((sum, d) => sum + (d.omzet || 0), 0);
    
    if (type === 'bol' || type === 'kaufland') {
      const inkoopkosten = channel.daily.reduce((sum, d) => sum + (d.inkoopkosten || 0), 0);
      const brutowinst = omzet - inkoopkosten;
      const margin = omzet > 0 ? (brutowinst / omzet) * 100 : 0;
      return { omzet, inkoopkosten, brutowinst, margin };
    }
    
    if (type === 'fleximedix' || type === 'inandoutdoormatch') {
      const cogs = channel.daily.reduce((sum, d) => sum + (d.cogs || 0), 0);
      const advertentiekosten = channel.daily.reduce((sum, d) => sum + (d.advertentiekosten || 0), 0);
      const brutowinst = omzet - cogs - advertentiekosten;
      const margin = omzet > 0 ? (brutowinst / omzet) * 100 : 0;
      return { omzet, cogs, advertentiekosten, brutowinst, margin };
    }
    
    return { omzet, margin: 0 };
  };

  const channelColors = {
    bol: '#6366f1',
    kaufland: '#f59e0b',
    fleximedix: '#10b981',
    inandoutdoormatch: '#8b5cf6',
    fulfilment: '#14b8a6',
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            KLK Analytics
          </h2>
          <p className="text-slate-600">{t('klkSubtitle')}</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2 border-slate-200" onClick={exportAnalytics}>
            <FileSpreadsheet className="w-4 h-4" />
            Export
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 border-slate-200 min-w-[280px] justify-start">
                <CalendarIcon className="w-4 h-4" />
                <span className="flex-1 text-left">{getPeriodLabel()}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-3 space-y-2">
                {PERIOD_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={selectedPeriod === preset.id ? 'default' : 'ghost'}
                    className="w-full justify-start"
                    onClick={() => setSelectedPeriod(preset.id)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              {selectedPeriod === 'custom' && (
                <div className="border-t border-slate-200 p-3">
                  <p className="text-sm text-slate-600 mb-2">{t('selectPeriod')}:</p>
                  <Calendar
                    mode="range"
                    selected={{ from: customDateRange.from, to: customDateRange.to }}
                    onSelect={(range) => setCustomDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                  />
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Analytics laden...
        </div>
      )}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-emerald-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">{t('totalRevenue')}</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              {formatCurrency(totals.totalRevenue)}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs text-emerald-600">+8.3%</span>
              <span className="text-xs text-slate-500">{t('vsPreviousPeriod')}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-red-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">{t('totalPurchaseCosts')}</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-red-500 to-red-600 rounded-lg">
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
              {formatCurrency(totals.totalCogs)}
            </div>
            <p className="text-xs text-slate-500 mt-2">{t('purchaseCostsAndCogs')}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-indigo-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">{t('grossProfit')}</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg">
              <Euro className="w-4 h-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              {formatCurrency(totals.grossProfit)}
            </div>
            <p className="text-xs text-indigo-600 mt-2">{t('margin')}: {totals.margin.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-amber-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm text-slate-600">{t('advertisingCosts')}</CardTitle>
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg">
              <Megaphone className="w-4 h-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
              {formatCurrency(totals.totalAdSpend)}
            </div>
            <p className="text-xs text-slate-500 mt-2">{t('shopifyChannels')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Total Revenue Chart */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('totalRevenueAllChannels')}</CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: channelColors.bol }} />
                <span className="text-xs text-slate-600">bol.com</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: channelColors.kaufland }} />
                <span className="text-xs text-slate-600">Kaufland</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: channelColors.fleximedix }} />
                <span className="text-xs text-slate-600">FlexiMedix</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: channelColors.inandoutdoormatch }} />
                <span className="text-xs text-slate-600">InAndOutdoorMatch</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: channelColors.fulfilment }} />
                <span className="text-xs text-slate-600">Fulfilment</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={combinedChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={formatDateLabel} />
              <YAxis stroke="#94a3b8" tickFormatter={(value) => `€ ${(value / 1000).toFixed(1)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Bar dataKey="bol" stackId="a" fill={channelColors.bol} />
              <Bar dataKey="kaufland" stackId="a" fill={channelColors.kaufland} />
              <Bar dataKey="fleximedix" stackId="a" fill={channelColors.fleximedix} />
              <Bar dataKey="inandoutdoormatch" stackId="a" fill={channelColors.inandoutdoormatch} />
              <Bar dataKey="fulfilment" stackId="a" fill={channelColors.fulfilment} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Channel Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bol.com */}
        {(() => {
          const bolTotals = getChannelTotals(filteredData.bol, 'bol');
          return (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">bol.com</Badge>
                    <span className="text-xs text-slate-500">{formatDateDisplay(dateRange.start)} - {formatDateDisplay(dateRange.end)}</span>
                  </div>
                  <div className="text-xl" style={{ color: channelColors.bol }}>{formatCurrency(bolTotals.omzet)}</div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                    <span className="text-slate-600">{t('revenue')}</span>
                    <span className="text-slate-900">{formatCurrency(bolTotals.omzet)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                    <span className="text-slate-600">{t('purchaseCosts')}</span>
                    <span className="text-slate-900">{formatCurrency(bolTotals.inkoopkosten || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-600">{t('grossProfit')}</span>
                    <span className={bolTotals.brutowinst && bolTotals.brutowinst > 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {formatCurrency(bolTotals.brutowinst || 0)}
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={filteredData.bol.daily}>
                    <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={(value) => new Date(value).getDate().toString()} fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '12px' }} formatter={(value: number) => formatCurrency(value)} labelFormatter={formatDateLabel} />
                    <Bar dataKey="omzet" fill={channelColors.bol} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="text-right mt-2">
                  <span className="text-xs text-slate-500">{t('margin')}: {bolTotals.margin.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Kaufland */}
        {(() => {
          const kauflandTotals = getChannelTotals(filteredData.kaufland, 'kaufland');
          return (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-amber-600" />
                      <span className="text-slate-900">Kaufland</span>
                    </div>
                    <span className="text-xs text-slate-500">{formatDateDisplay(dateRange.start)} - {formatDateDisplay(dateRange.end)}</span>
                  </div>
                  <div className="text-xl" style={{ color: channelColors.kaufland }}>{formatCurrency(kauflandTotals.omzet)}</div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                    <span className="text-slate-600">{t('revenue')}</span>
                    <span className="text-slate-900">{formatCurrency(kauflandTotals.omzet)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                    <span className="text-slate-600">{t('purchaseCosts')}</span>
                    <span className="text-slate-900">{formatCurrency(kauflandTotals.inkoopkosten || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-600">{t('grossProfit')}</span>
                    <span className={kauflandTotals.brutowinst && kauflandTotals.brutowinst > 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {formatCurrency(kauflandTotals.brutowinst || 0)}
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={filteredData.kaufland.daily}>
                    <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={(value) => new Date(value).getDate().toString()} fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '12px' }} formatter={(value: number) => formatCurrency(value)} labelFormatter={formatDateLabel} />
                    <Bar dataKey="omzet" fill={channelColors.kaufland} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="text-right mt-2">
                  <span className="text-xs text-slate-500">{t('margin')}: {kauflandTotals.margin.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* FlexiMedix */}
        {(() => {
          const fleximedixTotals = getChannelTotals(filteredData.fleximedix, 'fleximedix');
          return (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-emerald-600" />
                      <span className="text-slate-900">Shopify — FlexiMedix</span>
                    </div>
                    <span className="text-xs text-slate-500">{formatDateDisplay(dateRange.start)} - {formatDateDisplay(dateRange.end)}</span>
                  </div>
                  <div className="text-xl" style={{ color: channelColors.fleximedix }}>{formatCurrency(fleximedixTotals.omzet)}</div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                    <span className="text-slate-600">{t('revenue')}</span>
                    <span className="text-slate-900">{formatCurrency(fleximedixTotals.omzet)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                    <span className="text-slate-600">COGS</span>
                    <span className="text-slate-900">{formatCurrency(fleximedixTotals.cogs || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                    <span className="text-slate-600">{t('advertisingCostsLabel')}</span>
                    <span className="text-slate-900">{formatCurrency(fleximedixTotals.advertentiekosten || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-600">{t('grossProfit')}</span>
                    <span className={fleximedixTotals.brutowinst && fleximedixTotals.brutowinst > 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {formatCurrency(fleximedixTotals.brutowinst || 0)}
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={filteredData.fleximedix.daily}>
                    <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={(value) => new Date(value).getDate().toString()} fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '12px' }} formatter={(value: number) => formatCurrency(value)} labelFormatter={formatDateLabel} />
                    <Bar dataKey="omzet" fill={channelColors.fleximedix} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="text-right mt-2">
                  <span className="text-xs text-slate-500">{t('margin')}: {fleximedixTotals.margin.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* InAndOutdoorMatch */}
        {(() => {
          const inandoutTotals = getChannelTotals(filteredData.inandoutdoormatch, 'inandoutdoormatch');
          return (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-purple-600" />
                      <span className="text-slate-900">Shopify — InAndOutdoorMatch</span>
                    </div>
                    <span className="text-xs text-slate-500">{formatDateDisplay(dateRange.start)} - {formatDateDisplay(dateRange.end)}</span>
                  </div>
                  <div className="text-xl" style={{ color: channelColors.inandoutdoormatch }}>{formatCurrency(inandoutTotals.omzet)}</div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                    <span className="text-slate-600">{t('revenue')}</span>
                    <span className="text-slate-900">{formatCurrency(inandoutTotals.omzet)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                    <span className="text-slate-600">COGS</span>
                    <span className="text-slate-900">{formatCurrency(inandoutTotals.cogs || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                    <span className="text-slate-600">{t('advertisingCostsLabel')}</span>
                    <span className="text-slate-900">{formatCurrency(inandoutTotals.advertentiekosten || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-600">{t('grossProfit')}</span>
                    <span className={inandoutTotals.brutowinst && inandoutTotals.brutowinst > 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {formatCurrency(inandoutTotals.brutowinst || 0)}
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={filteredData.inandoutdoormatch.daily}>
                    <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={(value) => new Date(value).getDate().toString()} fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '12px' }} formatter={(value: number) => formatCurrency(value)} labelFormatter={formatDateLabel} />
                    <Bar dataKey="omzet" fill={channelColors.inandoutdoormatch} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="text-right mt-2">
                  <span className="text-xs text-slate-500">{t('margin')}: {inandoutTotals.margin.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Fulfilment */}
        {(() => {
          const fulfilmentTotals = getChannelTotals(filteredData.fulfilment, 'fulfilment');
          return (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-teal-600" />
                      <span className="text-slate-900">Fulfilment</span>
                    </div>
                    <span className="text-xs text-slate-500">{formatDateDisplay(dateRange.start)} - {formatDateDisplay(dateRange.end)}</span>
                  </div>
                  <div className="text-xl" style={{ color: channelColors.fulfilment }}>{formatCurrency(fulfilmentTotals.omzet)}</div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-600">{t('revenue')}</span>
                    <span className="text-slate-900">{formatCurrency(fulfilmentTotals.omzet)}</span>
                  </div>
                  <p className="text-xs text-slate-500 italic py-2">{t('fulfilmentOnlyRevenue')}</p>
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={filteredData.fulfilment.daily}>
                    <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={(value) => new Date(value).getDate().toString()} fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem', fontSize: '12px' }} formatter={(value: number) => formatCurrency(value)} labelFormatter={formatDateLabel} />
                    <Bar dataKey="omzet" fill={channelColors.fulfilment} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          );
        })()}
      </div>
    </div>
  );
}