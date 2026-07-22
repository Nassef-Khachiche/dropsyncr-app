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

type TabId = 'open' | 'not_ordered' | 'ordered';

interface PurchaseItem {
  orderItemId: number;
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerEmail?: string | null;
  address?: string | null;
  country: string;
  storeName: string;
  platform: string;
  deliveryDate: string | null;
  ean: string | null;
  productName: string;
  productImage: string | null;
  supplierUrl: string | null;
  productPurchasePrice: number | null;
  quantity: number;
  sellPrice: number;
  purchaseOrder: {
    id: number;
    status: string;
    supplierName: string | null;
    supplierOrderId: string | null;
    supplierTracking: string | null;
    notOrderedReason: string | null;
  } | null;
}

const VAT_RATE = 0.21;
const COMMISSION_RATE = 0.15;
const PAGE_SIZE = 25;

const fmt = (value: number) => (Number(value) || 0).toFixed(2);

const formatDate = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
};

export function OrderManagement({ activeProfile }: OrderManagementProps) {
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<TabId>('open');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [counts, setCounts] = useState({ open: 0, not_ordered: 0, ordered: 0 });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [withoutTracking, setWithoutTracking] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [processing, setProcessing] = useState<PurchaseItem | null>(null);

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
      });
      setItems(data.items || []);
      setCounts(data.counts || { open: 0, not_ordered: 0, ordered: 0 });
      setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (error) {
      console.error('Failed to load purchase orders:', error);
      toast.error(t('errorLoadingPurchaseOrders'));
    } finally {
      setLoading(false);
    }
  }, [activeProfile, activeTab, search, page, withoutTracking]);

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
  };

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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-1">
          {t('purchasingTitle')}
        </h2>
        <p className="text-sm text-slate-500">{t('purchasingSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      <div className="flex items-center gap-2">
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
        {activeTab === 'ordered' && (
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
        )}
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
                <th className="py-2.5 px-3 text-center">{t('colItemsPrice')}</th>
                {activeTab !== 'ordered' && <th className="py-2.5 px-3">{t('colDeliveryDeadline')}</th>}
                {activeTab === 'not_ordered' && <th className="py-2.5 px-3">{t('colReason')}</th>}
                {activeTab === 'ordered' && <th className="py-2.5 px-3">{t('supplierName')}</th>}
                {activeTab === 'ordered' && <th className="py-2.5 px-3">{t('colSupplierOrderId')}</th>}
                {activeTab === 'ordered' && <th className="py-2.5 px-3">{t('colSupplierTracking')}</th>}
                <th className="py-2.5 px-3 text-right">{t('colAction')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} className="py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <Package className="w-7 h-7 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t('noPurchaseOrders')}</p>
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((item) => (
                  <tr key={item.orderItemId} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-800">{item.orderNumber}</td>
                    <td className="py-2.5 px-3 text-slate-800">{item.customerName}</td>
                    <td className="py-2.5 px-3 text-slate-600">{item.country}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {item.storeName}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-500">{item.ean || '-'}</td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="text-slate-900">{item.quantity}</div>
                      <div className="text-xs text-slate-500">EUR {fmt(item.sellPrice)}</div>
                    </td>
                    {activeTab !== 'ordered' && (
                      <td className="py-2.5 px-3 text-slate-600">{formatDate(item.deliveryDate)}</td>
                    )}
                    {activeTab === 'not_ordered' && (
                      <td className="py-2.5 px-3 text-slate-600">
                        {item.purchaseOrder?.notOrderedReason || '-'}
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
                      {activeTab !== 'ordered' ? (
                        <button
                          onClick={() => setProcessing(item)}
                          className="px-3 py-1.5 rounded-md text-xs text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                        >
                          {t('process')}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReset(item.purchaseOrder!.id)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-400"
                          title={t('resetToOpen')}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {t('pageLabel')} {pagination.page} {t('ofLabel')} {pagination.totalPages} ({pagination.total})
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('previousPage')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('nextPage')}
          </Button>
        </div>
      </div>

      {processing && (
        <ProcessDialog
          item={processing}
          suppliers={suppliers}
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
  const [editing, setEditing] = useState(!value);

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
        disabled={!draft.trim()}
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

// Placeholder history data — wordt later vervangen door een backend-endpoint
// dat eerdere PurchaseOrder-records voor dezelfde EAN teruggeeft.
const PLACEHOLDER_HISTORY = {
  timesOrdered: 4,
  lastOrderedDate: '2026-06-18',
  avgBuyPrice: 21.4,
  points: [
    { date: '12-2', price: 24.9 },
    { date: '19-3', price: 22.5 },
    { date: '2-5', price: 20.1 },
    { date: '18-6', price: 21.4 },
  ],
  recent: [
    { date: '18-6-2026', supplier: 'Amazon', buyPrice: 21.4, netProfit: 15.3 },
    { date: '2-5-2026', supplier: 'AliExpress', buyPrice: 20.1, netProfit: 16.2 },
    { date: '19-3-2026', supplier: 'Amazon', buyPrice: 22.5, netProfit: 14.1 },
  ],
};

function ProcessDialog({
  item,
  suppliers,
  onClose,
  onDone,
}: {
  item: PurchaseItem;
  suppliers: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLanguage();

  const [buyPrice, setBuyPrice] = useState(
    item.productPurchasePrice != null ? String(item.productPurchasePrice) : '0'
  );
  const [excludeVat, setExcludeVat] = useState(false);
  const [shippingCost, setShippingCost] = useState('7');
  const [supplierId, setSupplierId] = useState('');
  const [supplierOrderId, setSupplierOrderId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonDetails, setReasonDetails] = useState('');

  const sell = Number(item.sellPrice) || 0;
  const vat = (sell * VAT_RATE) / (1 + VAT_RATE);
  const commission = sell * COMMISSION_RATE;
  const buyNumber = parseFloat(buyPrice.replace(',', '.')) || 0;
  const buyNet = excludeVat ? buyNumber / (1 + VAT_RATE) : buyNumber;
  const shipping = parseFloat(shippingCost) || 0;
  const netProfit = sell - vat - commission - buyNet - shipping;

  const history = PLACEHOLDER_HISTORY;

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
        orderItemId: item.orderItemId,
        supplierId: parseInt(supplierId, 10),
        buyPrice: buyNumber,
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
        orderItemId: item.orderItemId,
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

  const supplierLink = item.supplierUrl;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        style={{ width: '98vw', maxWidth: '2000px', height: '92vh' }}
        className="!w-[97vw] !max-w-[1700px] sm:!max-w-[1700px] p-0 gap-0 overflow-hidden flex flex-col"
      >
        {/* Gradient header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-5 flex items-center gap-4 shrink-0">
          <h3 className="text-white font-semibold text-lg">
            {t('processOrder')} — {item.orderNumber}
          </h3>
          <span className="text-white/70 text-sm">{item.customerName}</span>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-white/15 border border-white/30 text-white hover:bg-white/25 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
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
          {/* Top row: 3 columns */}
          <div className="grid grid-cols-1 md:grid-cols-3">
            {/* Left: supplier */}
            <div className="p-8 space-y-4 md:border-r border-slate-200">
              <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">{t('supplierName')}</p>

              {supplierLink ? (
                <SupplierLink url={supplierLink} label={t('goToSupplier')} />
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-400 border border-slate-200 rounded-lg px-3 py-3 bg-slate-50">
                  <ExternalLink className="w-4 h-4" />
                  {t('noSupplierLinked')}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm text-slate-600">{t('buyPriceLabel')}</label>
                <Input
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  className="h-10 text-base border-slate-200"
                />
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
                  <span className="text-sm text-slate-700">{t('excludeVatLabel')}</span>
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
              <ProfitRow label={t('vatLabel')} value={`- EUR ${fmt(vat)}`} negative />
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
              <InfoTile icon={MapPin} label={t('addressLabel')} value={item.address || `${item.country}`} />
            </div>
          </div>

          {/* Product order history */}
          <div className="px-8 py-5 border-t border-slate-200 bg-slate-50/40">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-indigo-500" />
              <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">{t('orderHistoryTitle')}</p>
              <span className="text-[11px] text-slate-400">({t('historyPlaceholderNote')})</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <HistoryStat icon={Calendar} label={t('lastOrderedLabel')} value={formatDate(history.lastOrderedDate)} />
              <HistoryStat icon={TrendingUp} label={t('avgBuyPriceLabel')} value={`EUR ${fmt(history.avgBuyPrice)}`} />
              <HistoryStat icon={ShoppingBag} label={t('timesOrderedLabel')} value={String(history.timesOrdered)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-sm text-slate-600 mb-3">{t('buyPriceOverTime')}</p>
                <div style={{ width: '100%', height: 200 }}>
                  <ResponsiveContainer>
                    <LineChart data={history.points} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent orders list */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <p className="text-sm text-slate-600 mb-3">{t('recentOrdersLabel')}</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-100">
                      <th className="py-1.5 font-medium">{t('colDeliveryDeadline')}</th>
                      <th className="py-1.5 font-medium">{t('supplierName')}</th>
                      <th className="py-1.5 font-medium text-right">{t('buyPriceLabel')}</th>
                      <th className="py-1.5 font-medium text-right">{t('netProfitLabel')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.recent.map((row, index) => (
                      <tr key={index} className="border-b border-slate-50">
                        <td className="py-2 text-slate-600">{row.date}</td>
                        <td className="py-2 text-slate-700">{row.supplier}</td>
                        <td className="py-2 text-right text-slate-700">EUR {fmt(row.buyPrice)}</td>
                        <td className="py-2 text-right text-emerald-600">EUR {fmt(row.netProfit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-slate-200 bg-slate-50/60 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-11 px-8 text-base"
          >
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

        {/* Not-ordered reason panel */}
        {reasonOpen && (
          <div className="border-t border-slate-200 px-8 py-5 space-y-3 bg-white shrink-0">
            <div className="space-y-1.5">
              <label className="text-sm text-slate-600">{t('reasonLabel')}</label>
              <select
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setReasonDetails('');
                }}
                className="w-full h-10 px-3 text-base border border-slate-200 rounded-md outline-none focus:border-indigo-400 bg-white"
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
                <textarea
                  value={reasonDetails}
                  onChange={(e) => setReasonDetails(e.target.value)}
                  placeholder={t('reasonPlaceholder')}
                  rows={2}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-md outline-none focus:border-indigo-400"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setReasonOpen(false)}>
                {t('cancel')}
              </Button>
              <button
                onClick={handleNotOrdered}
                disabled={!reason || (reason === t('reasonElse') && !reasonDetails.trim()) || saving}
                className="px-5 py-2.5 rounded-md text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-40"
              >
                {t('confirmNotOrdered')}
              </button>
            </div>
          </div>
        )}
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
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm text-white bg-amber-500 hover:bg-amber-600">
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