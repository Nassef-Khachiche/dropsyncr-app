import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Search,
  ArrowDownToLine,
  Printer,
  Copy,
  Check,
  Package,
  Loader2,
  RefreshCw,
  Plus,
  X,
  History,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  ShieldCheck,
  RotateCcw,
  SlidersHorizontal,
  Link,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { toast } from 'sonner';
import { api } from '../services/api';

interface InventoryManagementProps {
  activeProfile: string | null;
  isGlobalAdmin?: boolean;
}

interface InventoryItem {
  id: number;
  selected: boolean;
  installationId: number;
  foto: string | null;
  artikel_naam: string;
  ean: string;
  brand: string | null;
  sizeCategory: string | null;
  locaties: string[];
  klant: string;
  aangemeld: number;
  in_behandeling: number;
  gereserveerd: number;
  beschikbaar: number;
  totaal: number;
}

const MUTATION_TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  inbound:  { label: 'Inbound',      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',  icon: TrendingUp        },
  picked:   { label: 'Gepickt',      color: 'text-red-600 bg-red-50 border-red-200',              icon: TrendingDown      },
  reserved: { label: 'Gereserveerd', color: 'text-indigo-600 bg-indigo-50 border-indigo-200',     icon: ShieldCheck       },
  move:     { label: 'Verplaatst',   color: 'text-blue-600 bg-blue-50 border-blue-200',           icon: ArrowLeftRight    },
  return:   { label: 'Retour',       color: 'text-amber-600 bg-amber-50 border-amber-200',        icon: RotateCcw         },
  adjust:   { label: 'Correctie',    color: 'text-slate-600 bg-slate-50 border-slate-200',        icon: SlidersHorizontal },
};

const PAGE_SIZE = 25;

const getSizeCategoryColor = (size: string) => {
  const colors: Record<string, string> = {
    XS: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    S:  'bg-blue-100 text-blue-700 border-blue-200',
    M:  'bg-indigo-100 text-indigo-700 border-indigo-200',
    L:  'bg-purple-100 text-purple-700 border-purple-200',
    XL: 'bg-pink-100 text-pink-700 border-pink-200',
  };
  return colors[size] || 'bg-slate-100 text-slate-700 border-slate-200';
};

export function InventoryManagement({ activeProfile, isGlobalAdmin = false }: InventoryManagementProps) {
  const { t } = useLanguage();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState({ total: 0, totalAvailable: 0, totalReserved: 0 });
  const [loading, setLoading] = useState(false);
  const [activeStatusFilter, setActiveStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortValue, setSortValue] = useState('sort');
  const [clientFilter, setClientFilter] = useState('all-clients');
  const [copiedEan, setCopiedEan] = useState<string | null>(null);

  // Inbound dialog
  const [showInboundDialog, setShowInboundDialog] = useState(false);
  const [inboundSaving, setInboundSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [installations, setInstallations] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [inboundForm, setInboundForm] = useState({ installationId: '', locationId: '', quantity: '', notes: '' });

  // Print EAN dialog
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printLabelCount, setPrintLabelCount] = useState('1');
  const [printItems, setPrintItems] = useState<InventoryItem[]>([]);

  // History dialog (per product)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [mutations, setMutations] = useState<any[]>([]);
  const [mutationsLoading, setMutationsLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  // Globale history dialog
  const [showGlobalHistoryDialog, setShowGlobalHistoryDialog] = useState(false);
  const [globalMutations, setGlobalMutations] = useState<any[]>([]);
  const [globalMutationsLoading, setGlobalMutationsLoading] = useState(false);
  const [globalHistoryPeriod, setGlobalHistoryPeriod] = useState('today');
  const [globalHistoryPage, setGlobalHistoryPage] = useState(1);

  // Correctie dialog
  const [showCorrectieDialog, setShowCorrectieDialog] = useState(false);
  const [correctieItem, setCorrectieItem] = useState<InventoryItem | null>(null);
  const [correctieSaving, setCorrectieSaving] = useState(false);
  const [correctieForm, setCorrectieForm] = useState({ quantity: '', notes: '' });

  // EAN Alias dialog
  const [showAliasDialog, setShowAliasDialog] = useState(false);
  const [aliasItem, setAliasItem] = useState<InventoryItem | null>(null);
  const [aliases, setAliases] = useState<any[]>([]);
  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasProductSearch, setAliasProductSearch] = useState('');
  const [aliasProductResults, setAliasProductResults] = useState<any[]>([]);
  const [aliasProductLoading, setAliasProductLoading] = useState(false);
  const [aliasManualEan, setAliasManualEan] = useState('');
  const [aliasMode, setAliasMode] = useState<'product' | 'manual'>('product');

  const selectedCount = items.filter(item => item.selected).length;
  const allSelected = items.length > 0 && items.every(item => item.selected);
  const someSelected = items.some(item => item.selected) && !allSelected;
  const uniqueClients = Array.from(new Set(items.map(i => i.klant).filter(Boolean)));

  // Pagination helpers
  const paginatedMutations = mutations.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE);
  const historyTotalPages = Math.ceil(mutations.length / PAGE_SIZE);

  const pagedGlobalMutations = globalMutations.slice((globalHistoryPage - 1) * PAGE_SIZE, globalHistoryPage * PAGE_SIZE);
  const globalTotalPages = Math.ceil(globalMutations.length / PAGE_SIZE);

  const loadInventory = useCallback(async () => {
    if (!activeProfile && !isGlobalAdmin) return;
    try {
      setLoading(true);
      const params: any = {
        status: activeStatusFilter !== 'all' ? activeStatusFilter : undefined,
        search: searchQuery || undefined,
        sort: sortValue !== 'sort' ? sortValue : undefined,
      };
      if (activeProfile) params.installationId = activeProfile;
      const data = await api.getInventory(params);
      setItems((data.items || []).map((item: any) => ({ ...item, selected: false })));
      setStats(data.stats || { total: 0, totalAvailable: 0, totalReserved: 0 });
    } catch (error) {
      console.error('Failed to load inventory:', error);
      toast.error('Kon voorraad niet laden');
    } finally {
      setLoading(false);
    }
  }, [activeProfile, isGlobalAdmin, activeStatusFilter, searchQuery, sortValue]);

  useEffect(() => { loadInventory(); }, [loadInventory]);

  useEffect(() => {
    if (!isGlobalAdmin || !showInboundDialog) return;
    api.getInstallationsList()
      .then(data => setInstallations((data.installations || []).filter((i: any) => i.active)))
      .catch(() => setInstallations([]));
  }, [isGlobalAdmin, showInboundDialog]);

  useEffect(() => {
    if (!inboundForm.installationId) { setLocations([]); return; }
    api.getLocations(inboundForm.installationId)
      .then(data => setLocations((data.locations || []).filter((l: any) => l.type === 'case' && l.active)))
      .catch(() => setLocations([]));
  }, [inboundForm.installationId]);

  useEffect(() => {
    if (!productSearch || productSearch.length < 2) { setProductSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      try {
        setProductSearchLoading(true);
        const data = await api.getWarehouseProducts({ search: productSearch, limit: 20 });
        setProductSearchResults(data.products || []);
      } catch { setProductSearchResults([]); } finally { setProductSearchLoading(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [productSearch]);

  useEffect(() => {
    if (!aliasProductSearch || aliasProductSearch.length < 2) { setAliasProductResults([]); return; }
    const timeout = setTimeout(async () => {
      try {
        setAliasProductLoading(true);
        const installId = aliasItem ? String(aliasItem.installationId || activeProfile || '') : undefined;
        const data = await api.getWarehouseProducts({ search: aliasProductSearch, installationId: installId, limit: 20 });
        setAliasProductResults((data.products || []).filter((p: any) => p.id !== aliasItem?.id));
      } catch { setAliasProductResults([]); } finally { setAliasProductLoading(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [aliasProductSearch, aliasItem, activeProfile]);

  useEffect(() => {
    if (!showGlobalHistoryDialog) return;
    const load = async () => {
      setGlobalMutationsLoading(true);
      setGlobalHistoryPage(1);
      try {
        const data = await api.getAllMutations({ installationId: activeProfile || undefined, period: globalHistoryPeriod });
        setGlobalMutations(data.mutations || []);
      } catch {
        toast.error('Kon globale historie niet laden');
      } finally { setGlobalMutationsLoading(false); }
    };
    load();
  }, [showGlobalHistoryDialog, activeProfile, globalHistoryPeriod]);

  // ─── Inbound ────────────────────────────────────────────────────────────────

  const resetInboundDialog = () => {
    setSelectedProduct(null);
    setProductSearch('');
    setProductSearchResults([]);
    setInboundForm({ installationId: '', locationId: '', quantity: '', notes: '' });
  };

  const handleSelectProduct = (product: any) => {
    setSelectedProduct(product);
    setProductSearch('');
    setProductSearchResults([]);
    if (product.installationId) setInboundForm(prev => ({ ...prev, installationId: String(product.installationId) }));
  };

  const handleInboundSubmit = async () => {
    if (!selectedProduct) { toast.error('Selecteer een product'); return; }
    if (!inboundForm.installationId) { toast.error('Selecteer een klant/installatie'); return; }
    if (!inboundForm.locationId) { toast.error('Selecteer een locatie'); return; }
    if (!inboundForm.quantity || parseInt(inboundForm.quantity) <= 0) { toast.error('Voer een geldig aantal in'); return; }
    try {
      setInboundSaving(true);
      await api.inboundStock({
        installationId: parseInt(inboundForm.installationId),
        productId: selectedProduct.id,
        locationId: parseInt(inboundForm.locationId),
        quantity: parseInt(inboundForm.quantity),
        notes: inboundForm.notes || undefined,
      });
      toast.success(`${inboundForm.quantity}x ${selectedProduct.name} ingeboekt`);
      setShowInboundDialog(false);
      resetInboundDialog();
      loadInventory();
    } catch (error: any) {
      toast.error(error.message || 'Kon voorraad niet inboeken');
    } finally { setInboundSaving(false); }
  };

  // ─── Print EAN ──────────────────────────────────────────────────────────────

  const handleOpenPrintDialog = () => {
    const selected = items.filter(i => i.selected);
    if (selected.length === 0) return;
    setPrintItems(selected);
    setPrintLabelCount('1');
    setShowPrintDialog(true);
  };

  const handlePrintEan = () => {
    const count = parseInt(printLabelCount);
    if (!count || count <= 0) { toast.error('Voer een geldig aantal in'); return; }
    import('jspdf').then(({ jsPDF }) => {
      import('jsbarcode').then(({ default: JsBarcode }) => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [100, 50] });
        let labelIndex = 0;
        printItems.forEach(item => {
          if (!item.ean) return;
          for (let c = 0; c < count; c++) {
            if (labelIndex > 0) doc.addPage([100, 50], 'landscape');
            const canvas = document.createElement('canvas');
            JsBarcode(canvas, item.ean, { format: 'EAN13', width: 3, height: 60, displayValue: true, fontSize: 14, margin: 4 });
            doc.addImage(canvas.toDataURL('image/png'), 'PNG', 5, 3, 90, 35);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            const naam = item.artikel_naam.length > 55 ? item.artikel_naam.substring(0, 52) + '...' : item.artikel_naam;
            doc.text(naam, 5, 44, { maxWidth: 90 });
            labelIndex++;
          }
        });
        window.open(doc.output('bloburl'), '_blank');
        setShowPrintDialog(false);
        toast.success(`${labelIndex} label(s) gegenereerd`);
      });
    });
  };

  // ─── History per product ─────────────────────────────────────────────────────

  const handleOpenHistory = async (item: InventoryItem) => {
    setHistoryItem(item);
    setHistoryPage(1);
    setShowHistoryDialog(true);
    setMutationsLoading(true);
    try {
      const installId = String(item.installationId || activeProfile || '');
      const data = await api.getProductMutations(item.id, installId);
      setMutations(data.mutations || []);
    } catch {
      toast.error('Kon historie niet laden');
      setMutations([]);
    } finally { setMutationsLoading(false); }
  };

  // ─── Correctie ──────────────────────────────────────────────────────────────

  const handleOpenCorrectie = (item: InventoryItem) => {
    setCorrectieItem(item);
    setCorrectieForm({ quantity: '', notes: '' });
    setShowCorrectieDialog(true);
  };

  const handleCorrectieSubmit = async () => {
    if (!correctieItem) return;
    const qty = parseInt(correctieForm.quantity);
    if (!correctieForm.quantity || isNaN(qty) || qty === 0) { toast.error('Voer een geldig aantal in (positief of negatief)'); return; }
    if (!correctieForm.notes.trim()) { toast.error('Reden is verplicht bij een correctie'); return; }
    try {
      setCorrectieSaving(true);
      await api.adjustStock({
        installationId: correctieItem.installationId,
        productId: correctieItem.id,
        quantity: qty,
        notes: correctieForm.notes,
      });
      toast.success(`Correctie van ${qty > 0 ? '+' : ''}${qty} opgeslagen voor ${correctieItem.artikel_naam}`);
      setShowCorrectieDialog(false);
      setCorrectieItem(null);
      loadInventory();
    } catch (error: any) {
      toast.error(error.message || 'Kon correctie niet opslaan');
    } finally { setCorrectieSaving(false); }
  };

  // ─── EAN Aliassen ────────────────────────────────────────────────────────────

  const handleOpenAliasDialog = async (item: InventoryItem) => {
    setAliasItem(item);
    setAliasProductSearch('');
    setAliasProductResults([]);
    setAliasManualEan('');
    setAliasMode('product');
    setShowAliasDialog(true);
    setAliasLoading(true);
    try {
      const installId = String(item.installationId || activeProfile || '');
      const data = await api.getEanAliases(item.id, installId);
      setAliases(data.aliases || []);
    } catch {
      toast.error('Kon EAN aliassen niet laden');
      setAliases([]);
    } finally { setAliasLoading(false); }
  };

  const handleAddAliasFromProduct = async (product: any) => {
    if (!aliasItem || !product.ean) { toast.error('Dit product heeft geen EAN'); return; }
    try {
      setAliasSaving(true);
      const data = await api.addEanAlias(aliasItem.id, { ean: product.ean, installationId: aliasItem.installationId });
      setAliases(prev => [...prev, data.alias]);
      setAliasProductSearch('');
      setAliasProductResults([]);
      toast.success(`EAN ${product.ean} gekoppeld`);
    } catch (error: any) {
      toast.error(error.message || 'Kon EAN alias niet toevoegen');
    } finally { setAliasSaving(false); }
  };

  const handleAddAliasManual = async () => {
    if (!aliasItem || !aliasManualEan.trim()) { toast.error('Voer een EAN in'); return; }
    try {
      setAliasSaving(true);
      const data = await api.addEanAlias(aliasItem.id, { ean: aliasManualEan.trim(), installationId: aliasItem.installationId });
      setAliases(prev => [...prev, data.alias]);
      setAliasManualEan('');
      toast.success('EAN alias toegevoegd');
    } catch (error: any) {
      toast.error(error.message || 'Kon EAN alias niet toevoegen');
    } finally { setAliasSaving(false); }
  };

  const handleDeleteAlias = async (aliasId: number) => {
    if (!aliasItem) return;
    try {
      await api.deleteEanAlias(aliasItem.id, aliasId);
      setAliases(prev => prev.filter(a => a.id !== aliasId));
      toast.success('EAN alias verwijderd');
    } catch (error: any) {
      toast.error(error.message || 'Kon EAN alias niet verwijderen');
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const filteredItems = clientFilter === 'all-clients' ? items : items.filter(item => item.klant === clientFilter);
  const toggleSelectAll = () => setItems(items.map(item => ({ ...item, selected: !allSelected })));
  const toggleSelectItem = (id: number) => setItems(items.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
  const deselectAll = () => setItems(items.map(item => ({ ...item, selected: false })));

  const copyEan = (ean: string) => {
    navigator.clipboard.writeText(ean);
    setCopiedEan(ean);
    setTimeout(() => setCopiedEan(null), 2000);
  };

  const getClientBadgeStyle = (client: string) => {
    const colors = ['bg-purple-100 text-purple-700 border-purple-200', 'bg-teal-100 text-teal-700 border-teal-200', 'bg-amber-100 text-amber-700 border-amber-200', 'bg-blue-100 text-blue-700 border-blue-200', 'bg-rose-100 text-rose-700 border-rose-200'];
    return colors[client.charCodeAt(0) % colors.length];
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const renderMutationCard = (mutation: any, showProduct = false) => {
    const config = MUTATION_TYPE_CONFIG[mutation.type] || MUTATION_TYPE_CONFIG.adjust;
    const Icon = config.icon;
    const sign = mutation.quantity > 0 ? '+' : '';
    return (
      <div key={mutation.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${config.color}`}>
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold">{config.label}</span>
              {showProduct && mutation.productName && <span className="text-xs opacity-70 truncate max-w-[180px]">{mutation.productName}</span>}
              <span className="text-xs opacity-60">{formatDate(mutation.performedAt)}</span>
              {mutation.performedByName && <span className="text-xs opacity-60">· {mutation.performedByName}</span>}
              {mutation.orderId && <span className="text-xs opacity-60">· Order #{mutation.orderId}</span>}
              {mutation.notes && <span className="text-xs opacity-60 italic truncate max-w-[200px]">{mutation.notes}</span>}
            </div>
            {mutation.quantity !== 0 && <span className="text-xs font-bold tabular-nums shrink-0">{sign}{mutation.quantity}</span>}
          </div>
        </div>
      </div>
    );
  };

  const renderPagination = (page: number, totalPages: number, total: number, onPage: (p: number) => void) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <span className="text-xs text-slate-500">{total} mutaties · pagina {page} van {totalPages}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button
                key={p}
                onClick={() => onPage(p)}
                className={`w-7 h-7 text-xs rounded border transition-colors ${page === p ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {p}
              </button>
            );
          })}
          <button
            onClick={() => onPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const statusFilters = [
    { id: 'all', label: t('filterAll') },
    { id: 'gereserveerd', label: t('filterReserved') },
    { id: 'laag-voorraad', label: t('filterLowStock') },
  ];

  const colSpan = isGlobalAdmin ? 10 : 9;

  const periodOptions = [
    { value: 'today', label: 'Vandaag' },
    { value: 'week', label: 'Afgelopen week' },
    { value: 'month', label: 'Afgelopen maand' },
  ];

  return (
    <div className="space-y-6 min-w-0 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between min-w-0">
        <div className="min-w-0 flex-1 mr-4">
          <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2 truncate">{t('inventoryManagement')}</h2>
          <p className="text-slate-600 truncate">{t('inventoryManagementSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {isGlobalAdmin && (
            <Button onClick={() => { resetInboundDialog(); setShowInboundDialog(true); }} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 gap-2">
              <Plus className="w-4 h-4" />Voorraad inboeken
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowGlobalHistoryDialog(true)} className="gap-2 border-slate-200">
            <History className="w-4 h-4" />Historie
          </Button>
          <Button variant="outline" size="sm" onClick={loadInventory} disabled={loading} className="gap-2 border-slate-200">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4 min-w-0">
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500 mb-1">{t('total')}</p><p className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{stats.total}</p></div><div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center"><Package className="w-6 h-6 text-indigo-600" /></div></div></CardContent></Card>
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500 mb-1">{t('available')}</p><p className="text-3xl font-bold text-emerald-600">{stats.totalAvailable}</p></div><div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center"><Package className="w-6 h-6 text-emerald-600" /></div></div></CardContent></Card>
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500 mb-1">{t('reserved')}</p><p className="text-3xl font-bold text-indigo-600">{stats.totalReserved}</p></div><div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center"><Package className="w-6 h-6 text-indigo-600" /></div></div></CardContent></Card>
      </div>

      {/* Topbar */}
      <div className="flex items-center justify-between gap-3 min-w-0 flex-wrap">
        <div className="flex items-center gap-2.5 flex-1">
          <div className="relative flex-1 max-w-[340px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input type="text" placeholder={t('searchEanOrProduct')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-10 pl-10 pr-3 border-slate-200" />
          </div>
          {isGlobalAdmin && (
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="h-10 w-auto min-w-[140px] border-slate-200"><SelectValue placeholder={t('allClients')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all-clients">{t('allClients')}</SelectItem>
                {uniqueClients.map(client => <SelectItem key={client} value={client}>{client}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={sortValue} onValueChange={setSortValue}>
            <SelectTrigger className="h-10 w-auto min-w-[140px] border-slate-200"><SelectValue placeholder={t('sortBy')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sort">{t('sortBy')}</SelectItem>
              <SelectItem value="naam-asc">{t('sortNameAsc')}</SelectItem>
              <SelectItem value="naam-desc">{t('sortNameDesc')}</SelectItem>
              <SelectItem value="voorraad-laag">{t('sortStockLow')}</SelectItem>
              <SelectItem value="voorraad-hoog">{t('sortStockHigh')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" className="h-10 px-4 gap-2 border-slate-300 hover:bg-slate-50">
          <ArrowDownToLine className="w-4 h-4" />{t('incomingShipments')}
          <Badge className="ml-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white border-0">0</Badge>
        </Button>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600 mr-2">{t('status')}:</span>
        {statusFilters.map((filter) => (
          <button key={filter.id} onClick={() => setActiveStatusFilter(filter.id)}
            className={`px-4 py-2 rounded-full text-sm transition-all ${activeStatusFilter === filter.id ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'}`}>
            {filter.label}
          </button>
        ))}
      </div>

      {/* Bulk Action Bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 shadow-sm">
          <span className="text-sm text-slate-700 flex-1"><strong className="text-indigo-700">{selectedCount}</strong> {t('itemsSelected')}</span>
          <Button onClick={handleOpenPrintDialog} className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-md">
            <Printer className="w-4 h-4" />{t('printEanBarcode')}
          </Button>
          <Button variant="outline" onClick={deselectAll} className="border-slate-300 hover:bg-white">{t('deselectAll')}</Button>
        </div>
      )}

      {/* Inventory Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white w-full">
        <Table className="w-full">
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              <TableHead className="w-[40px] text-center">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" ref={(el) => { if (el) (el as any).indeterminate = someSelected; }} />
              </TableHead>
              <TableHead className="w-[52px]"></TableHead>
              <TableHead>{t('product')}</TableHead>
              <TableHead className="w-[140px]">{t('locations')}</TableHead>
              <TableHead className="w-[60px]">Size</TableHead>
              {isGlobalAdmin && <TableHead className="w-[130px]">{t('client')}</TableHead>}
              <TableHead className="w-[80px] text-right">{t('reserved')}</TableHead>
              <TableHead className="w-[80px] text-right">{t('available')}</TableHead>
              <TableHead className="w-[60px] text-right">{t('total')}</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={colSpan} className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" /></TableCell></TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow><TableCell colSpan={colSpan} className="text-center py-12 text-slate-400"><Package className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>{t('noItemsFound')}</p></TableCell></TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id} className={`transition-colors ${item.selected ? 'bg-indigo-50/50 hover:bg-indigo-50' : 'hover:bg-slate-50/50'}`}>
                  <TableCell className="text-center"><Checkbox checked={item.selected} onCheckedChange={() => toggleSelectItem(item.id)} /></TableCell>
                  <TableCell>
                    <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden">
                      {item.foto ? <img src={item.foto} alt={item.artikel_naam} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-slate-400" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-slate-900">{item.artikel_naam.length > 60 ? item.artikel_naam.substring(0, 60) + '...' : item.artikel_naam}</div>
                      {item.brand && <div className="text-xs text-slate-400">{item.brand}</div>}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-slate-600">{item.ean || '—'}</span>
                        {item.ean && (
                          <button onClick={() => copyEan(item.ean)} className="p-1 rounded hover:bg-slate-200 transition-colors">
                            {copiedEan === item.ean ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-400 hover:text-slate-600" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[120px]">
                    <div className="flex flex-wrap gap-1">
                      {item.locaties.length > 0 ? item.locaties.slice(0, 3).map((loc, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 border border-slate-200 text-slate-700">{loc}</span>
                      )) : <span className="text-slate-400 text-sm">—</span>}
                      {item.locaties.length > 3 && <span className="text-xs text-slate-400">+{item.locaties.length - 3}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.sizeCategory ? <Badge className={`${getSizeCategoryColor(item.sizeCategory)} border font-semibold text-xs`}>{item.sizeCategory}</Badge> : <span className="text-slate-400 text-sm">—</span>}
                  </TableCell>
                  {isGlobalAdmin && <TableCell><Badge variant="outline" className={getClientBadgeStyle(item.klant)}>{item.klant}</Badge></TableCell>}
                  <TableCell className="text-right text-sm">
                    <span className={item.gereserveerd > 0 ? 'text-indigo-600 font-medium' : 'text-slate-600'}>{item.gereserveerd || '—'}</span>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    <span className={item.beschikbaar > 5 ? 'text-emerald-600' : item.beschikbaar === 0 ? 'text-red-600' : 'text-amber-600'}>{item.beschikbaar}</span>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-slate-900">{item.totaal}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenAliasDialog(item)} className="h-8 w-8 p-0 text-slate-400 hover:text-purple-600" title="EAN aliassen beheren"><Link className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenCorrectie(item)} className="h-8 w-8 p-0 text-slate-400 hover:text-amber-600" title="Voorraad corrigeren"><SlidersHorizontal className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenHistory(item)} className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600" title="Historie bekijken"><History className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{filteredItems.length} {t('articles')}</span>
      </div>

      {/* ─── Print EAN dialog ─── */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>EAN labels printen</DialogTitle>
            <DialogDescription>{printItems.length} product(en) geselecteerd</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Aantal labels per product <span className="text-red-500">*</span></Label>
              <Input type="number" min="1" max="100" placeholder="bijv. 10" value={printLabelCount} onChange={(e) => setPrintLabelCount(e.target.value)} />
              <p className="text-xs text-slate-400">Totaal: {(parseInt(printLabelCount) || 0) * printItems.filter(i => i.ean).length} labels</p>
            </div>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
              {printItems.map(item => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                  <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-700 truncate flex-1">{item.artikel_naam}</span>
                  <span className="text-xs font-mono text-slate-400">{item.ean || 'geen EAN'}</span>
                </div>
              ))}
            </div>
            {printItems.some(i => !i.ean) && <p className="text-xs text-amber-600">Let op: producten zonder EAN worden overgeslagen.</p>}
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowPrintDialog(false)} className="flex-1">Annuleren</Button>
            <Button onClick={handlePrintEan} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 gap-2">
              <Printer className="w-4 h-4" />Printen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── History per product dialog ─── */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">Historie — {historyItem?.artikel_naam}</DialogTitle>
            <DialogDescription className="font-mono">{historyItem?.ean || ''}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-2">
            {mutationsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
            ) : mutations.length === 0 ? (
              <div className="text-center py-12 text-slate-400"><History className="w-10 h-10 mx-auto mb-2 text-slate-300" /><p>Geen mutaties gevonden</p></div>
            ) : (
              <div className="space-y-1">
                {paginatedMutations.map((mutation: any) => renderMutationCard(mutation, false))}
              </div>
            )}
          </div>
          <div className="pt-3 border-t border-slate-100 space-y-3">
            {renderPagination(historyPage, historyTotalPages, mutations.length, setHistoryPage)}
            <Button variant="outline" onClick={() => setShowHistoryDialog(false)} className="w-full">Sluiten</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Globale history dialog ─── */}
      <Dialog open={showGlobalHistoryDialog} onOpenChange={setShowGlobalHistoryDialog}>
        <DialogContent className="sm:max-w-[760px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Voorraad historie</DialogTitle>
            <DialogDescription>Alle mutaties gesorteerd op datum</DialogDescription>
            <div className="flex gap-2 mt-3">
              {periodOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setGlobalHistoryPeriod(option.value)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${globalHistoryPeriod === option.value ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-2 space-y-4">
            {globalMutationsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
            ) : globalMutations.length === 0 ? (
              <div className="text-center py-12 text-slate-400"><History className="w-10 h-10 mx-auto mb-2 text-slate-300" /><p>Geen mutaties gevonden</p></div>
            ) : (() => {
              const grouped = pagedGlobalMutations.reduce((acc: any, m: any) => {
                const day = new Date(m.performedAt).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' });
                if (!acc[day]) acc[day] = [];
                acc[day].push(m);
                return acc;
              }, {});
              return Object.entries(grouped).map(([day, dayMutations]: any) => (
                <div key={day}>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 px-1">{day}</div>
                  <div className="space-y-1">
                    {dayMutations.map((mutation: any) => renderMutationCard(mutation, true))}
                  </div>
                </div>
              ));
            })()}
          </div>
          <div className="pt-3 border-t border-slate-100 space-y-3">
            {renderPagination(globalHistoryPage, globalTotalPages, globalMutations.length, setGlobalHistoryPage)}
            <Button variant="outline" onClick={() => setShowGlobalHistoryDialog(false)} className="w-full">Sluiten</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── EAN Alias dialog ─── */}
      <Dialog open={showAliasDialog} onOpenChange={setShowAliasDialog}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link className="w-4 h-4 text-purple-600" />EAN aliassen</DialogTitle>
            <DialogDescription className="truncate">{aliasItem?.artikel_naam}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-xs text-slate-500 mb-1">Primaire EAN</p>
              <span className="text-sm font-mono font-medium text-slate-900">{aliasItem?.ean || '—'}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Gekoppelde EAN aliassen</p>
              {aliasLoading ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-indigo-600" /></div>
              ) : aliases.length === 0 ? (
                <div className="text-center py-5 text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  <Link className="w-7 h-7 mx-auto mb-1.5 text-slate-300" />
                  <p className="text-sm">Nog geen aliassen gekoppeld</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {aliases.map((alias: any) => (
                    <div key={alias.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-purple-100 bg-purple-50">
                      <span className="text-sm font-mono text-purple-900">{alias.ean}</span>
                      <button onClick={() => handleDeleteAlias(alias.id)} className="p-1 rounded hover:bg-purple-100 text-purple-400 hover:text-red-500 transition-colors" title="Verwijderen"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-3">
                <button onClick={() => setAliasMode('product')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${aliasMode === 'product' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Zoek product</button>
                <button onClick={() => setAliasMode('manual')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${aliasMode === 'manual' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Handmatig EAN</button>
              </div>
              {aliasMode === 'product' ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder="Zoek product op naam, EAN of merk..." value={aliasProductSearch} onChange={(e) => setAliasProductSearch(e.target.value)} className="pl-10" />
                  </div>
                  {(aliasProductResults.length > 0 || aliasProductLoading) && (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-44 overflow-y-auto">
                      {aliasProductLoading ? (
                        <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-indigo-600" /></div>
                      ) : aliasProductResults.map((product: any) => {
                        const alreadyLinked = aliases.some(a => a.ean === product.ean);
                        return (
                          <button key={product.id} onClick={() => !alreadyLinked && !aliasSaving && handleAddAliasFromProduct(product)} disabled={alreadyLinked || aliasSaving || !product.ean} className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${alreadyLinked ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-purple-50'}`}>
                            <div className="w-8 h-8 rounded border border-slate-200 bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {product.image ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-slate-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{product.name}</p>
                              <p className="text-xs text-slate-400 font-mono">{product.ean || 'geen EAN'}</p>
                            </div>
                            {alreadyLinked ? <span className="text-xs text-slate-400 shrink-0">al gekoppeld</span> : product.ean && <Plus className="w-4 h-4 text-purple-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-slate-400">De EAN van het geselecteerde product wordt als alias gekoppeld aan dit product.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input placeholder="bijv. 1234567890123" value={aliasManualEan} onChange={(e) => setAliasManualEan(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddAliasManual(); }} className="font-mono" />
                    <Button onClick={handleAddAliasManual} disabled={aliasSaving || !aliasManualEan.trim()} className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 shrink-0">
                      {aliasSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-400">Orders met deze EAN worden automatisch gekoppeld aan dit product en delen dezelfde voorraadpositie.</p>
                </div>
              )}
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100">
            <Button variant="outline" onClick={() => setShowAliasDialog(false)} className="w-full">Sluiten</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Correctie dialog ─── */}
      <Dialog open={showCorrectieDialog} onOpenChange={setShowCorrectieDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Voorraad corrigeren</DialogTitle>
            <DialogDescription className="truncate">{correctieItem?.artikel_naam}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {correctieItem && (
              <div className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm">
                <div className="text-center"><p className="text-xs text-slate-500">Huidig totaal</p><p className="text-lg font-bold text-slate-900">{correctieItem.totaal}</p></div>
                <div className="text-center"><p className="text-xs text-slate-500">Beschikbaar</p><p className="text-lg font-bold text-emerald-600">{correctieItem.beschikbaar}</p></div>
                <div className="text-center"><p className="text-xs text-slate-500">Gereserveerd</p><p className="text-lg font-bold text-indigo-600">{correctieItem.gereserveerd}</p></div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Correctie aantal <span className="text-red-500">*</span></Label>
              <Input type="number" placeholder="bijv. +5 of -3" value={correctieForm.quantity} onChange={(e) => setCorrectieForm(prev => ({ ...prev, quantity: e.target.value }))} />
              <p className="text-xs text-slate-400">
                Positief = voorraad toevoegen &nbsp;·&nbsp; Negatief = voorraad verwijderen
                {correctieForm.quantity && !isNaN(parseInt(correctieForm.quantity)) && correctieItem && (
                  <span className="ml-1 font-medium text-slate-600">→ nieuw totaal: {correctieItem.totaal + parseInt(correctieForm.quantity)}</span>
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Reden <span className="text-red-500">*</span></Label>
              <Input placeholder="bijv. telling verschil, beschadigd product..." value={correctieForm.notes} onChange={(e) => setCorrectieForm(prev => ({ ...prev, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowCorrectieDialog(false)} className="flex-1">Annuleren</Button>
            <Button onClick={handleCorrectieSubmit} disabled={correctieSaving} className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
              {correctieSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <SlidersHorizontal className="w-4 h-4 mr-2" />}
              Correctie opslaan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Voorraad inboeken dialog ─── */}
      <Dialog open={showInboundDialog} onOpenChange={(open) => { if (!open) { setShowInboundDialog(false); resetInboundDialog(); } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Voorraad inboeken</DialogTitle>
            <DialogDescription>Boek direct voorraad in op een locatie voor een klant.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Product <span className="text-red-500">*</span></Label>
              {selectedProduct ? (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-indigo-200 bg-indigo-50">
                  <div className="w-10 h-10 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                    {selectedProduct.image ? <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{selectedProduct.name}</p>
                    {selectedProduct.ean && <p className="text-xs font-mono text-slate-500">{selectedProduct.ean}</p>}
                    {selectedProduct.brand && <p className="text-xs text-slate-400">{selectedProduct.brand}</p>}
                  </div>
                  <button onClick={() => setSelectedProduct(null)} className="p-1 rounded hover:bg-indigo-100"><X className="w-4 h-4 text-slate-500" /></button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Zoek op naam, EAN of merk..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-10" />
                  {(productSearchResults.length > 0 || productSearchLoading) && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {productSearchLoading ? (
                        <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-indigo-600" /></div>
                      ) : productSearchResults.map((product) => (
                        <button key={product.id} onClick={() => handleSelectProduct(product)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left transition-colors">
                          <div className="w-8 h-8 rounded border border-slate-200 bg-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {product.image ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-slate-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{product.name}</p>
                            <p className="text-xs text-slate-400 font-mono">{product.ean || '—'} {product.brand ? `· ${product.brand}` : ''}</p>
                          </div>
                          <span className="text-xs text-slate-400 flex-shrink-0">{product.installation?.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Klant <span className="text-red-500">*</span></Label>
              <Select value={inboundForm.installationId} onValueChange={(v) => setInboundForm(prev => ({ ...prev, installationId: v, locationId: '' }))}>
                <SelectTrigger><SelectValue placeholder="Selecteer klant..." /></SelectTrigger>
                <SelectContent>{installations.map((inst: any) => <SelectItem key={inst.id} value={String(inst.id)}>{inst.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Locatie <span className="text-red-500">*</span></Label>
              <Select value={inboundForm.locationId} onValueChange={(v) => setInboundForm(prev => ({ ...prev, locationId: v }))} disabled={!inboundForm.installationId}>
                <SelectTrigger><SelectValue placeholder={inboundForm.installationId ? 'Selecteer locatie...' : 'Selecteer eerst een klant'} /></SelectTrigger>
                <SelectContent>{locations.map((loc: any) => <SelectItem key={loc.id} value={String(loc.id)}><span className="font-mono">{loc.code}</span></SelectItem>)}</SelectContent>
              </Select>
              {inboundForm.installationId && locations.length === 0 && <p className="text-xs text-amber-600">Geen actieve locaties gevonden voor deze klant.</p>}
            </div>
            <div className="space-y-2">
              <Label>Aantal <span className="text-red-500">*</span></Label>
              <Input type="number" min="1" placeholder="bijv. 50" value={inboundForm.quantity} onChange={(e) => setInboundForm(prev => ({ ...prev, quantity: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 text-xs">Notitie (optioneel)</Label>
              <Input placeholder="bijv. ontvangen van leverancier X" value={inboundForm.notes} onChange={(e) => setInboundForm(prev => ({ ...prev, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => { setShowInboundDialog(false); resetInboundDialog(); }} className="flex-1">Annuleren</Button>
            <Button onClick={handleInboundSubmit} disabled={inboundSaving} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
              {inboundSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}Inboeken
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}