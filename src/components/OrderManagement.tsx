import { useState, useEffect, useCallback } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import {
  Dialog,
  DialogContent,
} from './ui/dialog';
import {
  Search,
  RefreshCw,
  ExternalLink,
  Check,
  Copy,
  Package,
  AlertCircle,
  Loader2,
  RotateCcw,
  ShoppingBag,
  AlertTriangle,
  PackageCheck,
  User,
  Hash,
  MapPin,
  Calendar,
  TrendingUp,
  History,
  Ban,
  Archive,
  Layers,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

interface OrderManagementProps {
  activeProfile: string;
}

type TabId = 'open' | 'not_ordered' | 'ordered' | 'canceled';

interface PurchaseItem {
  orderItemIds: number[];
  orderItemId: number;
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerEmail?: string | null;
  address?: string | null;
  country: string;
  storeName: string;
  platform: string;
  orderDate: string | null;
  deliveryDate: string | null;
  vatRate: number;
  defaultShippingCost: number;
  ean: string | null;
  productName: string;
  productImage: string | null;
  supplierUrl: string | null;
  productPurchasePrice: number | null;
  quantity: number;
  unitSellPrice: number;
  sellPrice: number;
  mergedItemCount: number;
  purchaseOrder: {
    id: number;
    status: string;
    supplierName: string | null;
    supplierOrderId: string | null;
    supplierTracking: string | null;
    notOrderedReason: string | null;
    processedAt: string | null;
    processedByName: string | null;
  } | null;
}

interface HistoryData {
  timesOrdered: number;
  lastOrderedDate: string | null;
  avgBuyPrice: number | null;
  points: { date: string; price: number }[];
  recent: {
    date: string | null;
    orderNumber: string | null;
    supplier: string | null;
    buyPrice: number | null;
    netProfit: number | null;
  }[];
}

const COMMISSION_RATE = 0.15;
const PAGE_SIZE = 25;
const DEFAULT_VAT_RATE = 0.21;

// 19% blijft 19%, 25,5% houdt zijn decimaal.
const formatVatPercent = (rate: number) => {
  const percent = rate * 100;
  const text = Number.isInteger(percent) ? String(percent) : percent.toFixed(1).replace('.', ',');
  return `${text}%`;
};

const fmt = (value: number | null | undefined) => (Number(value) || 0).toFixed(2);

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
};

const formatDateTime = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()} ${time}`;
};

const formatShortDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getDate()}-${date.getMonth() + 1}`;
};

export function OrderManagement({ activeProfile }: OrderManagementProps) {
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<TabId>('open');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [counts, setCounts] = useState({ open: 0, not_ordered: 0, ordered: 0, canceled: 0 });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [archiveInfo, setArchiveInfo] = useState({ active: false, recentDays: 30 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [withoutTracking, setWithoutTracking] = useState(false);
  const [includeArchive, setIncludeArchive] = useState(false);
  const [stores, setStores] = useState<string[]>([]);
  const [storeFilter, setStoreFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'orderDate' | 'deliveryDate'>('orderDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [processing, setProcessing] = useState<PurchaseItem | null>(null);
  const [confirmReset, setConfirmReset] = useState<PurchaseItem | null>(null);

  const loadItems = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const data = await api.getPurchaseOrders({
        installationId: activeProfile,
        tab: activeTab,
        search,
        page,
        limit: PAGE_SIZE,
        withoutTracking: activeTab === 'ordered' ? withoutTracking : false,
        includeArchive: activeTab === 'ordered' ? includeArchive : false,
        storeName: storeFilter,
        sortBy,
        sortDir,
      });
      setItems(data.items || []);
      setStores(data.stores || []);
      setCounts(data.counts || { open: 0, not_ordered: 0, ordered: 0, canceled: 0 });
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
      setArchiveInfo(data.archive || { active: false, recentDays: 30 });
    } catch (error) {
      console.error('Failed to load purchase orders:', error);
      toast.error(t('errorLoadingPurchaseOrders'));
    } finally {
      setLoading(false);
    }
  }, [activeProfile, activeTab, search, page, withoutTracking, includeArchive, storeFilter, sortBy, sortDir]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!activeProfile) return;
    api.getSuppliers(activeProfile)
      .then((data) => setSuppliers((Array.isArray(data) ? data : []).filter((s: any) => s.active)))
      .catch(() => setSuppliers([]));
  }, [activeProfile]);

  const changeTab = (tab: TabId) => {
    setActiveTab(tab);
    setPage(1);
    setWithoutTracking(false);
    setIncludeArchive(false);
  };

  // Klik op dezelfde kolom draait de richting om; een andere kolom start oplopend.
  const toggleSort = (field: 'orderDate' | 'deliveryDate') => {
    if (sortBy === field) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  const sortOptions: { id: 'orderDate' | 'deliveryDate'; label: string }[] = [
    { id: 'orderDate', label: t('colOrderDate') },
    { id: 'deliveryDate', label: t('colDeliveryDeadline') },
  ];

  const handleTrackingSave = async (purchaseOrderId: number, tracking: string) => {
    try {
      await api.updatePurchaseOrderTracking(purchaseOrderId, tracking);
      toast.success(t('trackingSaved'));
      await loadItems();
    } catch (error) {
      console.error('Failed to save tracking:', error);
      toast.error(t('errorProcessingOrder'));
    }
  };

  const handleReset = async (purchaseOrderId: number) => {
    try {
      await api.resetPurchaseOrder(purchaseOrderId);
      await loadItems();
    } catch (error) {
      console.error('Failed to reset purchase order:', error);
      toast.error(t('errorProcessingOrder'));
    }
  };

  // Manager keurt een niet-bestelde regel definitief af.
  const handleCancel = async (item: PurchaseItem) => {
    try {
      await api.markPurchaseOrderCanceled({ orderItemIds: item.orderItemIds });
      toast.success(t('orderMarkedCanceled'));
      await loadItems();
    } catch (error: any) {
      console.error('Failed to cancel purchase order:', error);
      toast.error(error?.message || t('errorProcessingOrder'));
    }
  };

  const statCards: {
    id: TabId;
    label: string;
    count: number;
    icon: any;
    valueClass: string;
    iconWrapClass: string;
    iconClass: string;
  }[] = [
    {
      id: 'open',
      label: t('tabOpenOrders'),
      count: counts.open,
      icon: ShoppingBag,
      valueClass: 'bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent',
      iconWrapClass: 'bg-indigo-100',
      iconClass: 'text-indigo-600',
    },
    {
      id: 'not_ordered',
      label: t('tabNotOrdered'),
      count: counts.not_ordered,
      icon: AlertTriangle,
      valueClass: counts.not_ordered > 0 ? 'text-amber-600' : 'text-slate-600',
      iconWrapClass: counts.not_ordered > 0 ? 'bg-amber-100' : 'bg-slate-100',
      iconClass: counts.not_ordered > 0 ? 'text-amber-600' : 'text-slate-400',
    },
    {
      id: 'ordered',
      label: t('tabOrdered'),
      count: counts.ordered,
      icon: PackageCheck,
      valueClass: 'text-emerald-600',
      iconWrapClass: 'bg-emerald-100',
      iconClass: 'text-emerald-600',
    },
    {
      id: 'canceled',
      label: t('tabCanceled'),
      count: counts.canceled,
      icon: Ban,
      valueClass: counts.canceled > 0 ? 'text-red-600' : 'text-slate-600',
      iconWrapClass: counts.canceled > 0 ? 'bg-red-100' : 'bg-slate-100',
      iconClass: counts.canceled > 0 ? 'text-red-600' : 'text-slate-400',
    },
  ];

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('purchasingTitle')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  // Regels van dezelfde order krijgen om-en-om een tint, zodat je in één oogopslag
  // ziet welke rijen bij elkaar horen.
  const orderTintIndex = new Map<number, number>();
  let tintCounter = 0;
  items.forEach((item) => {
    if (!orderTintIndex.has(item.orderId)) {
      orderTintIndex.set(item.orderId, tintCounter % 2);
      tintCounter += 1;
    }
  });

  const rowsPerOrder = new Map<number, number>();
  items.forEach((item) => {
    rowsPerOrder.set(item.orderId, (rowsPerOrder.get(item.orderId) || 0) + 1);
  });

  // 5 vaste kolommen + besteldatum + actie, plus wat de tab er zelf bij zet.
  const columnCount =
    7 +
    (activeTab === 'ordered' ? 5 : 2) +
    (activeTab === 'not_ordered' || activeTab === 'canceled' ? 3 : 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-1">
          {t('purchasingTitle')}
        </h2>
        <p className="text-sm text-slate-500">{t('purchasingSubtitle')}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const isActive = activeTab === card.id;
          return (
            <Card
              key={card.id}
              onClick={() => changeTab(card.id)}
              className={`border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${
                isActive ? 'ring-2 ring-indigo-500 border-indigo-300' : ''
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500 mb-1">{card.label}</p>
                    <p className={`text-3xl font-bold ${card.valueClass}`}>{card.count}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${card.iconWrapClass}`}>
                    <Icon className={`w-6 h-6 ${card.iconClass}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={loadItems}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </button>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder={t('searchPurchasing')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10 h-9 text-sm border-slate-200 bg-white focus:border-indigo-300"
          />
        </div>
        <select
          value={storeFilter}
          onChange={(e) => {
            setStoreFilter(e.target.value);
            setPage(1);
          }}
          className={`h-9 px-3 text-sm border rounded-lg outline-none transition-colors ${
            storeFilter !== 'all'
              ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
              : 'border-slate-300 bg-white text-slate-700'
          }`}
        >
          <option value="all">{t('allStores')}</option>
          {stores.map((store) => (
            <option key={store} value={store}>
              {store}
            </option>
          ))}
        </select>
        {activeTab === 'ordered' && (
          <>
            <button
              onClick={() => {
                setWithoutTracking((v) => !v);
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-xs border transition-colors ${
                withoutTracking
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              {t('withoutTracking')}
            </button>
            <button
              onClick={() => {
                setIncludeArchive((v) => !v);
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-xs border transition-colors ${
                includeArchive
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              {includeArchive ? t('hideArchive') : t('showArchive')}
            </button>
          </>
        )}
      </div>

      {activeTab === 'ordered' && !archiveInfo.active && (
        <p className="text-xs text-slate-400">
          {t('archiveHint')} {archiveInfo.recentDays} {t('archiveHintDays')}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-600 mr-2">{t('sortBy')}:</span>
        {sortOptions.map((option) => {
          const isActive = sortBy === option.id;
          return (
            <button
              key={option.id}
              onClick={() => toggleSort(option.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md'
                  : 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
              }`}
            >
              {option.label}
              {isActive &&
                (sortDir === 'asc' ? (
                  <ArrowUp className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDown className="w-3.5 h-3.5" />
                ))}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <th className="py-2.5 px-3">{t('orderNumber')}</th>
                <th className="py-2.5 px-3">{t('customerName')}</th>
                <th className="py-2.5 px-3">{t('colCountry')}</th>
                <th className="py-2.5 px-3">{t('colStore')}</th>
                <th className="py-2.5 px-3">{t('eanCode')}</th>
                <th className="py-2.5 px-3">{t('colOrderDate')}</th>
                {activeTab !== 'ordered' && (
                  <th className="py-2.5 px-3 text-center">{t('colItemsPrice')}</th>
                )}
                {activeTab !== 'ordered' && (
                  <th className="py-2.5 px-3">{t('colDeliveryDeadline')}</th>
                )}
                {activeTab === 'ordered' && <th className="py-2.5 px-3">{t('colOrderedAt')}</th>}
                {activeTab === 'ordered' && <th className="py-2.5 px-3">{t('colOrderedBy')}</th>}
                {(activeTab === 'not_ordered' || activeTab === 'canceled') && (
                  <th className="py-2.5 px-3">{t('colReason')}</th>
                )}
                {(activeTab === 'not_ordered' || activeTab === 'canceled') && (
                  <th className="py-2.5 px-3">{t('colProcessedAt')}</th>
                )}
                {(activeTab === 'not_ordered' || activeTab === 'canceled') && (
                  <th className="py-2.5 px-3">{t('colProcessedBy')}</th>
                )}
                {activeTab === 'ordered' && <th className="py-2.5 px-3">{t('supplierName')}</th>}
                {activeTab === 'ordered' && <th className="py-2.5 px-3">{t('colSupplierOrderId')}</th>}
                {activeTab === 'ordered' && <th className="py-2.5 px-3">{t('colSupplierTracking')}</th>}
                <th className="py-2.5 px-3 text-right">{t('colAction')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={columnCount} className="py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className="py-12 text-center text-slate-400">
                    <Package className="w-7 h-7 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t('noPurchaseOrders')}</p>
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((item, index) => {
                  const previous = index > 0 ? items[index - 1] : null;
                  const isFirstOfOrder = !previous || previous.orderId !== item.orderId;
                  const tint = orderTintIndex.get(item.orderId) === 1 ? 'bg-slate-50/70' : 'bg-white';
                  const siblingCount = rowsPerOrder.get(item.orderId) || 1;

                  return (
                    <tr
                      key={item.orderItemIds.join('-')}
                      className={`border-b border-slate-100 hover:bg-indigo-50/40 transition-colors ${tint} ${
                        isFirstOfOrder ? 'border-t-2 border-t-slate-200' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        {isFirstOfOrder ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-800">{item.orderNumber}</span>
                            {siblingCount > 1 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100">
                                <Layers className="w-3 h-3" />
                                {siblingCount}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs pl-3">↳</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">
                        {isFirstOfOrder ? item.customerName : ''}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{isFirstOfOrder ? item.country : ''}</td>
                      <td className="py-2.5 px-3">
                        {isFirstOfOrder && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {item.storeName}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-slate-500">{item.ean || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {isFirstOfOrder ? formatDate(item.orderDate) : ''}
                      </td>
                      {activeTab !== 'ordered' && (
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {item.quantity > 1 ? (
                              <span
                                className="inline-flex items-center justify-center min-w-[30px] px-2 py-0.5 rounded font-bold text-amber-900 bg-amber-100 border border-amber-300"
                                title={t('multipleUnitsTitle')}
                              >
                                {item.quantity}×
                              </span>
                            ) : (
                              <span className="text-slate-900">{item.quantity}</span>
                            )}
                            {item.mergedItemCount > 1 && (
                              <span
                                className="text-[10px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100"
                                title={t('mergedItemsTitle')}
                              >
                                {item.mergedItemCount} {t('linesLabel')}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">EUR {fmt(item.sellPrice)}</div>
                        </td>
                      )}
                      {activeTab !== 'ordered' && (
                        <td className="py-2.5 px-3 text-slate-600">
                          {isFirstOfOrder ? formatDate(item.deliveryDate) : ''}
                        </td>
                      )}
                      {activeTab === 'ordered' && (
                        <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                          {formatDateTime(item.purchaseOrder?.processedAt || null)}
                        </td>
                      )}
                      {activeTab === 'ordered' && (
                        <td className="py-2.5 px-3 text-slate-700">
                          {item.purchaseOrder?.processedByName || '-'}
                        </td>
                      )}
                      {(activeTab === 'not_ordered' || activeTab === 'canceled') && (
                        <td className="py-2.5 px-3 text-slate-600">
                          {item.purchaseOrder?.notOrderedReason || '-'}
                        </td>
                      )}
                      {(activeTab === 'not_ordered' || activeTab === 'canceled') && (
                        <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                          {formatDateTime(item.purchaseOrder?.processedAt || null)}
                        </td>
                      )}
                      {(activeTab === 'not_ordered' || activeTab === 'canceled') && (
                        <td className="py-2.5 px-3 text-slate-700">
                          {item.purchaseOrder?.processedByName || '-'}
                        </td>
                      )}
                      {activeTab === 'ordered' && (
                        <td className="py-2.5 px-3 text-slate-700">
                          {item.purchaseOrder?.supplierName || '-'}
                        </td>
                      )}
                      {activeTab === 'ordered' && (
                        <td className="py-2.5 px-3 font-mono text-xs text-slate-600">
                          {item.purchaseOrder?.supplierOrderId || '-'}
                        </td>
                      )}
                      {activeTab === 'ordered' && (
                        <td className="py-2.5 px-3">
                          <TrackingCell
                            value={item.purchaseOrder?.supplierTracking || ''}
                            onSave={(tracking) => handleTrackingSave(item.purchaseOrder!.id, tracking)}
                            placeholder={t('enterTracking')}
                            confirmLabel={t('confirm')}
                            editLabel={t('edit')}
                          />
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(activeTab === 'open' || activeTab === 'not_ordered') && (
                            <button
                              onClick={() => setProcessing(item)}
                              className="px-3 py-1.5 rounded-md text-xs text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                            >
                              {t('process')}
                            </button>
                          )}
                          {activeTab === 'not_ordered' && (
                            <button
                              onClick={() => handleCancel(item)}
                              className="px-3 py-1.5 rounded-md text-xs border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                              title={t('markAsCanceledTitle')}
                            >
                              {t('markAsCanceled')}
                            </button>
                          )}
                          {(activeTab === 'ordered' || activeTab === 'canceled') && (
                            <button
                              onClick={() => setConfirmReset(item)}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                              title={t('resetToOpen')}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {t('pageLabel')} {pagination.page} {t('ofLabel')} {pagination.totalPages} ({pagination.total} {t('ordersLabel')})
        </span>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => setPage(1)}
            title={t('firstPage')}
            className="px-2"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('previousPage')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="gap-1"
          >
            {t('nextPage')}
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPage(pagination.totalPages)}
            title={t('lastPage')}
            className="px-2"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {confirmReset && (
        <Dialog open onOpenChange={(open) => !open && setConfirmReset(null)}>
          <DialogContent className="sm:max-w-lg overflow-hidden">
            <div className="space-y-5 min-w-0">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-slate-900">{t('resetToOpen')}</h3>
                  <p className="text-sm text-slate-500 mt-1">{t('resetConfirmText')}</p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 min-w-0 overflow-hidden">
                <div className="font-mono text-sm text-slate-800 truncate">{confirmReset.orderNumber}</div>
                <div className="text-sm text-slate-500 truncate">{confirmReset.productName}</div>
                {confirmReset.mergedItemCount > 1 && (
                  <div className="text-xs text-amber-700 mt-1">
                    {confirmReset.mergedItemCount} {t('mergedItemsLabel')}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setConfirmReset(null)} className="h-10 px-6">
                  {t('cancel')}
                </Button>
                <button
                  onClick={async () => {
                    const target = confirmReset;
                    setConfirmReset(null);
                    await handleReset(target.purchaseOrder!.id);
                  }}
                  style={{ backgroundColor: '#d97706', color: '#ffffff' }}
                  className="h-10 px-6 rounded-md text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
                >
                  {t('confirmReset')}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}     

      {processing && (
        <ProcessDialog
          item={processing}
          suppliers={suppliers}
          activeProfile={activeProfile}
          onClose={() => setProcessing(null)}
          onDone={async () => {
            setProcessing(null);
            await loadItems();
          }}
        />
      )}
    </div>
  );
}

function TrackingCell({
  value,
  onSave,
  placeholder,
  confirmLabel,
  editLabel,
}: {
  value: string;
  onSave: (tracking: string) => void;
  placeholder: string;
  confirmLabel: string;
  editLabel: string;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(value.length === 0);

  if (!editing && value) {
    return (
      <div className="flex items-center gap-2">
        <Check className="w-3 h-3 text-emerald-600 shrink-0" />
        <span className="font-mono text-xs text-emerald-800">{value}</span>
        <button
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          {editLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            onSave(draft.trim());
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-2 py-1 text-xs font-mono border border-slate-200 rounded outline-none focus:border-indigo-400"
      />
      <button
        disabled={draft.trim().length === 0}
        onClick={() => {
          onSave(draft.trim());
          setEditing(false);
        }}
        className="px-2 py-1 rounded text-[11px] text-white bg-gradient-to-r from-indigo-500 to-purple-500 disabled:opacity-40"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

function ProcessDialog({
  item,
  suppliers,
  activeProfile,
  onClose,
  onDone,
}: {
  item: PurchaseItem;
  suppliers: any[];
  activeProfile: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLanguage();

  const [buyPrice, setBuyPrice] = useState(
    item.productPurchasePrice != null ? String(item.productPurchasePrice) : '0'
  );
  const [excludeVat, setExcludeVat] = useState(false);
  const [shippingCost, setShippingCost] = useState(
    item.defaultShippingCost != null ? String(item.defaultShippingCost) : '0'
  );
  const [supplierId, setSupplierId] = useState('');
  const [supplierOrderId, setSupplierOrderId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonDetails, setReasonDetails] = useState('');

  const [history, setHistory] = useState<HistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [supplierLink, setSupplierLink] = useState(item.supplierUrl || '');
  const [urlInput, setUrlInput] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);

  useEffect(() => {
    let active = true;
    setHistoryLoading(true);
    api.getProductPurchaseHistory({
      installationId: activeProfile,
      ean: item.ean || '',
      excludeOrderId: item.orderId,
    })
      .then((data) => {
        if (active) setHistory(data);
      })
      .catch(() => {
        if (active) setHistory(null);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeProfile, item.ean, item.orderId]);

  // De inkoper vult de stuksprijs in; de marge rekent met het totaal van de regel.
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const sell = Number(item.sellPrice) || 0;
  const vatRate = Number(item.vatRate) || DEFAULT_VAT_RATE;
  const vatLabelSuffix = `${item.country} ${formatVatPercent(vatRate)}`;
  const vat = (sell * vatRate) / (1 + vatRate);
  const commission = sell * COMMISSION_RATE;
  const unitBuy = parseFloat(String(buyPrice).replace(',', '.')) || 0;
  const totalBuy = unitBuy * quantity;
  const buyNet = excludeVat ? totalBuy / (1 + vatRate) : totalBuy;
  const shipping = parseFloat(shippingCost) || 0;
  const netProfit = sell - vat - commission - buyNet - shipping;

  const reasonOptions = [
    t('reasonPricingError'),
    t('reasonOutOfStock'),
    t('reasonDeliveryTooLate'),
    t('reasonElse'),
  ];

  const handleCopy = () => {
    const text = `${item.orderNumber} - ${item.customerName} - ${item.storeName}`;
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => undefined
    );
  };

  const handleOrdered = async () => {
    if (!supplierId) return;
    try {
      setSaving(true);
      await api.processPurchaseOrder({
        orderItemIds: item.orderItemIds,
        supplierId: parseInt(supplierId, 10),
        buyPrice: unitBuy,
        excludeVat,
        shippingCost: shipping,
        supplierOrderId,
        note,
      });
      toast.success(t('orderProcessed'));
      onDone();
    } catch (error: any) {
      console.error('Failed to process order:', error);
      toast.error(error?.message || t('errorProcessingOrder'));
    } finally {
      setSaving(false);
    }
  };

  const handleNotOrdered = async () => {
    const finalReason = reason === t('reasonElse') ? reasonDetails.trim() : reason;
    if (!finalReason) return;
    try {
      setSaving(true);
      await api.markPurchaseOrderNotOrdered({
        orderItemIds: item.orderItemIds,
        reason: finalReason,
        note,
      });
      toast.success(t('orderMarkedNotOrdered'));
      onDone();
    } catch (error: any) {
      console.error('Failed to mark not ordered:', error);
      toast.error(error?.message || t('errorProcessingOrder'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    try {
      setSavingUrl(true);
      const result = await api.saveProductSupplierUrl({ orderItemId: item.orderItemId, url });
      setSupplierLink(result.supplierUrl);
      setUrlInput('');
      setEditingUrl(false);
      toast.success(t('supplierLinkSaved'));
    } catch (error: any) {
      console.error('Failed to save supplier url:', error);
      toast.error(error?.message || t('errorSavingSupplierLink'));
    } finally {
      setSavingUrl(false);
    }
  };

  const chartData = (history?.points || []).map((point) => ({
    date: formatShortDate(point.date),
    price: point.price,
  }));
  const hasHistory = Boolean(history && history.timesOrdered > 0);
  const canConfirmNotOrdered =
    reason.length > 0 && (reason !== t('reasonElse') || reasonDetails.trim().length > 0) && !saving;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        style={{ width: '97vw', maxWidth: '1700px', height: '92vh' }}
        className="!w-[97vw] !max-w-[1700px] sm:!max-w-[1700px] p-0 gap-0 overflow-hidden flex flex-col"
      >
        {/* Gradient header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-5 flex items-center gap-4 shrink-0">
          <h3 className="text-white font-semibold text-lg">
            {t('processOrder')} — {item.orderNumber}
          </h3>
          <span style={{ color: 'rgba(255,255,255,0.85)' }} className="text-sm">
            {item.customerName}
          </span>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-white/15 border border-white/30 text-white hover:bg-white/25 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {item.mergedItemCount > 1 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-white/15 border border-white/30 text-white">
              <Layers className="w-3.5 h-3.5" />
              {item.mergedItemCount} {t('mergedItemsLabel')}
            </span>
          )}
        </div>

        {/* Sub-header strip */}
        <div className="px-8 py-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div
            className="grid items-start gap-x-10"
            style={{ gridTemplateColumns: '160px minmax(0,1fr) 90px 130px 160px' }}
          >
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">{t('eanCode')}</div>
              <div className="text-base font-mono text-slate-800 truncate">{item.ean || '-'}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">{t('product')}</div>
              <div className="text-base text-slate-800 truncate">{item.productName}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1 truncate">{t('quantity')}</div>
              <div className="text-base text-slate-800">{item.quantity}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1 truncate">{t('sellPriceLabel')}</div>
              <div className="text-base text-slate-800 whitespace-nowrap">EUR {fmt(sell)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1 truncate">{t('colDeliveryDeadline')}</div>
              <div className="text-base text-slate-800 whitespace-nowrap">{formatDate(item.deliveryDate)}</div>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3">
            {/* Left: supplier */}
            <div className="p-8 space-y-4 md:border-r border-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">{t('supplierName')}</p>

              {supplierLink && !editingUrl ? (
                <div className="space-y-2">
                  <SupplierLink url={supplierLink} label={t('goToSupplier')} />
                  <button
                    onClick={() => {
                      setUrlInput(supplierLink);
                      setEditingUrl(true);
                    }}
                    className="text-xs text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    {t('changeSupplierLink')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {!supplierLink && (
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-400 border border-slate-200 rounded-lg px-3 py-2.5 bg-slate-50">
                      <ExternalLink className="w-4 h-4" />
                      {t('noSupplierLinked')}
                    </div>
                  )}
                  <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveUrl();
                    }}
                    placeholder={t('pasteAmazonUrl')}
                    className="h-10 text-sm border-slate-200"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveUrl}
                      disabled={urlInput.trim().length === 0 || savingUrl}
                      style={{
                        backgroundColor: urlInput.trim().length > 0 && !savingUrl ? '#f59e0b' : '#e2e8f0',
                        color: urlInput.trim().length > 0 && !savingUrl ? '#ffffff' : '#94a3b8',
                        cursor: urlInput.trim().length > 0 && !savingUrl ? 'pointer' : 'not-allowed',
                      }}
                      className="flex-1 h-10 rounded-md text-sm font-medium shadow-sm transition-colors"
                    >
                      {savingUrl ? t('saving') : t('saveSupplierLink')}
                    </button>
                    {editingUrl && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setUrlInput('');
                          setEditingUrl(false);
                        }}
                        className="h-10 px-4"
                      >
                        {t('cancel')}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm text-slate-600">{t('buyPriceUnitLabel')}</label>
                <Input
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="h-10 text-base border-slate-200"
                />
                {quantity > 1 && (
                  <p className="text-xs text-slate-400">
                    {quantity} × EUR {fmt(unitBuy)} = EUR {fmt(totalBuy)}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-slate-600">{t('supplierOrderIdLabel')}</label>
                <Input
                  value={supplierOrderId}
                  onChange={(e) => setSupplierOrderId(e.target.value)}
                  className="h-10 text-base border-slate-200"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeVat}
                    onChange={(e) => setExcludeVat(e.target.checked)}
                    className="rounded border-slate-300 accent-indigo-600 w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">
                    {t('excludeVatLabel')} ({formatVatPercent(vatRate)})
                  </span>
                </label>
                <p className="text-xs text-slate-400 ml-6 mt-1">
                  {t('netLabel')}: EUR {fmt(buyNet)}
                </p>
              </div>
            </div>

            {/* Middle: profit calculation */}
            <div className="p-8 space-y-2.5 md:border-r border-slate-200 bg-slate-50/40">
              <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-1">{t('profitCalculation')}</p>
              <ProfitRow label={t('sellPriceLabel')} value={`EUR ${fmt(sell)}`} />
              <ProfitRow label={`${t('vatLabel')} (${vatLabelSuffix})`} value={`- EUR ${fmt(vat)}`} negative />
              <ProfitRow label={t('commissionLabel')} value={`- EUR ${fmt(commission)}`} negative />
              <ProfitRow label={t('buyPriceNetLabel')} value={`- EUR ${fmt(buyNet)}`} negative />
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">{t('shippingCostLabel')}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-red-500">- EUR</span>
                  <input
                    type="number"
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                    className="w-16 text-right text-sm text-red-500 border border-slate-200 rounded px-2 py-1 outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-4">
                <span className="text-base font-semibold text-slate-900">{t('netProfitLabel')}</span>
                <span className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  EUR {fmt(netProfit)}
                </span>
              </div>
            </div>

            {/* Right: supplier & note */}
            <div className="p-8 space-y-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">{t('supplierAndNote')}</p>

              <div className="space-y-1.5">
                <label className="text-sm text-slate-600">
                  {t('supplierName')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className={`w-full h-10 px-3 text-base border rounded-md outline-none bg-white focus:border-indigo-400 ${
                    supplierId ? 'border-indigo-300 text-slate-900' : 'border-slate-200 text-slate-400'
                  }`}
                >
                  <option value="">{t('chooseSupplier')}</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-slate-600">{t('noteLabel')}</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('notePlaceholder')}
                  rows={6}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-md outline-none focus:border-indigo-400 resize-y"
                />
              </div>
            </div>
          </div>

          {/* Customer / order / address block */}
          <div className="px-8 py-5 border-t border-slate-200">
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-3">{t('customerDetails')}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InfoTile icon={User} label={t('customerName')} value={item.customerName} />
              <InfoTile icon={Hash} label={t('orderNumber')} value={item.orderNumber} mono />
              <InfoTile icon={MapPin} label={t('addressLabel')} value={item.address || item.country} />
            </div>
          </div>

          {/* Product order history */}
          <div className="px-8 py-5 border-t border-slate-200 bg-slate-50/40">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-indigo-500" />
              <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">{t('orderHistoryTitle')}</p>
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              </div>
            ) : !hasHistory ? (
              <div className="text-center py-8 text-slate-400">
                <History className="w-6 h-6 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t('noHistoryYet')}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                  <HistoryStat
                    icon={Calendar}
                    label={t('lastOrderedLabel')}
                    value={formatDate(history!.lastOrderedDate)}
                  />
                  <HistoryStat
                    icon={TrendingUp}
                    label={t('avgBuyPriceLabel')}
                    value={history!.avgBuyPrice != null ? `EUR ${fmt(history!.avgBuyPrice)}` : '-'}
                  />
                  <HistoryStat
                    icon={ShoppingBag}
                    label={t('timesOrderedLabel')}
                    value={String(history!.timesOrdered)}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <p className="text-sm text-slate-600 mb-3">{t('buyPriceOverTime')}</p>
                    {chartData.length < 2 ? (
                      <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
                        {t('notEnoughDataForChart')}
                      </div>
                    ) : (
                      <div style={{ width: '100%', height: 200 }}>
                        <ResponsiveContainer>
                          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                            <Tooltip />
                            <Line type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <p className="text-sm text-slate-600 mb-3">{t('recentOrdersLabel')}</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-100">
                          <th className="py-1.5 font-medium">{t('dateLabel')}</th>
                          <th className="py-1.5 font-medium">{t('supplierName')}</th>
                          <th className="py-1.5 font-medium text-right">{t('buyPriceLabel')}</th>
                          <th className="py-1.5 font-medium text-right">{t('netProfitLabel')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history!.recent.map((row, index) => (
                          <tr key={index} className="border-b border-slate-50">
                            <td className="py-2 text-slate-600">{formatDate(row.date)}</td>
                            <td className="py-2 text-slate-700">{row.supplier || '-'}</td>
                            <td className="py-2 text-right text-slate-700">EUR {fmt(row.buyPrice)}</td>
                            <td
                              className={`py-2 text-right ${
                                (row.netProfit || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                              }`}
                            >
                              EUR {fmt(row.netProfit)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Not-ordered reason panel — in de body zodat hij meescrollt */}
          {reasonOpen && (
            <div className="px-8 py-5 border-t-2 border-red-200 bg-red-50/40">
              <p className="text-xs uppercase tracking-wide text-red-500 font-semibold mb-3">
                {t('markAsNotOrdered')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm text-slate-600">{t('reasonLabel')}</label>
                  <select
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setReasonDetails('');
                    }}
                    className={`w-full h-10 px-3 text-base border rounded-md outline-none bg-white focus:border-indigo-400 ${
                      reason ? 'border-indigo-300 text-slate-900' : 'border-slate-200 text-slate-400'
                    }`}
                  >
                    <option value="">{t('chooseReason')}</option>
                    {reasonOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {reason === t('reasonElse') && (
                  <div className="space-y-1.5">
                    <label className="text-sm text-slate-600">{t('detailsLabel')}</label>
                    <Input
                      value={reasonDetails}
                      onChange={(e) => setReasonDetails(e.target.value)}
                      placeholder={t('reasonPlaceholder')}
                      className="h-10 text-base border-slate-200"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <Button variant="outline" onClick={() => setReasonOpen(false)} className="h-10 px-6">
                  {t('cancel')}
                </Button>
                <button
                  onClick={handleNotOrdered}
                  disabled={!canConfirmNotOrdered}
                  style={{
                    backgroundColor: canConfirmNotOrdered ? '#dc2626' : '#cbd5e1',
                    color: '#ffffff',
                    cursor: canConfirmNotOrdered ? 'pointer' : 'not-allowed',
                  }}
                  className="h-10 px-6 rounded-md text-sm font-medium shadow-sm transition-colors"
                >
                  {saving ? t('saving') : t('confirmNotOrdered')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-slate-200 bg-slate-50/60 shrink-0">
          <Button variant="outline" onClick={onClose} className="h-11 px-8 text-base">
            {t('cancel')}
          </Button>
          <div className="flex gap-4">
            <button
              onClick={() => {
                setReason('');
                setReasonDetails('');
                setReasonOpen(true);
              }}
              className="h-11 px-8 rounded-md text-base border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
            >
              {t('markAsNotOrdered')}
            </button>
            <Button
              onClick={handleOrdered}
              disabled={!supplierId || saving}
              className="gap-2 h-11 px-8 text-base bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {t('markAsOrdered')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoTile({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined
    );
  };

  return (
    <div className="flex items-start gap-3 border border-slate-200 rounded-lg px-4 py-3 bg-white group">
      <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-indigo-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-0.5">{label}</div>
        <div className={`text-sm text-slate-800 break-words ${mono ? 'font-mono' : ''}`}>{value}</div>
      </div>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
        title="Copy"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

function HistoryStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border border-slate-200 rounded-lg px-4 py-3 bg-white">
      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-indigo-500" />
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-0.5">{label}</div>
        <div className="text-lg font-semibold text-slate-800">{value}</div>
      </div>
    </div>
  );
}

function SupplierLink({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm text-white bg-amber-500 hover:bg-amber-600"
    >
      <ExternalLink className="w-4 h-4" />
      {label}
    </a>
  );
}

function ProfitRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm ${negative ? 'text-red-500' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}