import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Package,
  Search,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Archive,
  ArchiveRestore,
  MapPin,
  Loader2,
  Euro,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

type SizeCategory = 'XS' | 'S' | 'M' | 'L' | 'XL';

interface Product {
  id: number;
  ean: string | null;
  name: string;
  brand: string | null;
  sizeCategory: string | null;
  price: number;
  purchasePrice: number | null;
  totalStock: number;
  archived: boolean;
  image: string | null;
  locations: any[];
  installation: { id: number; name: string };
  weight?: number | null;
  dimensionL?: number | null;
  dimensionW?: number | null;
  dimensionH?: number | null;
}

interface ProductManagementProps {
  activeProfile: string | null;
  isGlobalAdmin?: boolean;
}

const SIZE_CATEGORIES: SizeCategory[] = ['XS', 'S', 'M', 'L', 'XL'];

const getSizeCategoryColor = (size: string) => {
  const colors: Record<string, string> = {
    XS: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    S: 'bg-blue-100 text-blue-700 border-blue-200',
    M: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    L: 'bg-purple-100 text-purple-700 border-purple-200',
    XL: 'bg-pink-100 text-pink-700 border-pink-200',
  };
  return colors[size] || 'bg-slate-100 text-slate-700 border-slate-200';
};

const SIZE_LABELS: Record<SizeCategory, string> = {
  XS: 'XS — < 23.5×16.5×3 cm, <1kg',
  S: 'S — 23.5×16.5×3 cm, max 1kg',
  M: 'M — 55×30×20 cm, max 8kg',
  L: 'L — 72×50×41 cm, max 15kg',
  XL: 'XL — > 72×50×41 cm, max 23kg',
};

const truncate = (str: string, n: number) => str.length > n ? str.substring(0, n) + '...' : str;
const PAGE_SIZE = 50;

// ─── ProductFields ────────────────────────────────────────────────────────────
// Size category en dimensions/weight zijn alleen zichtbaar voor global admins.
function ProductFields({ data, onChange, t, isGlobalAdmin = false }: {
  data: any; onChange: (key: string, value: any) => void; t: (k: string) => string; isGlobalAdmin?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{t('eanCode')}</Label>
          <Input placeholder="bijv. 8719327018750" value={data.ean || ''} onChange={e => onChange('ean', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('brand')}</Label>
          <Input placeholder="bijv. Samsung" value={data.brand || ''} onChange={e => onChange('brand', e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('productName')} <span className="text-red-500">*</span></Label>
        <Input placeholder="bijv. Draadloze Gaming Muis RGB" value={data.name || ''} onChange={e => onChange('name', e.target.value)} />
      </div>

      {isGlobalAdmin ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t('sizeCategory')}</Label>
            <Select value={data.sizeCategory || ''} onValueChange={v => onChange('sizeCategory', v)}>
              <SelectTrigger><SelectValue placeholder={t('selectSizeCategory')} /></SelectTrigger>
              <SelectContent>
                {SIZE_CATEGORIES.map(s => (
                  <SelectItem key={s} value={s}>
                    <div className="flex items-center gap-2">
                      <Badge className={`${getSizeCategoryColor(s)} border text-xs`}>{s}</Badge>
                      <span className="text-xs text-slate-500">{SIZE_LABELS[s].split('—')[1]?.trim()}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Inkoopprijs (€)</Label>
            <Input type="number" step="0.01" placeholder="bijv. 12.50" value={data.purchasePrice ?? ''} onChange={e => onChange('purchasePrice', e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Inkoopprijs (€)</Label>
          <Input type="number" step="0.01" placeholder="bijv. 12.50" value={data.purchasePrice ?? ''} onChange={e => onChange('purchasePrice', e.target.value)} />
        </div>
      )}

      {isGlobalAdmin && (
        <div className="space-y-2">
          <Label className="text-slate-500 text-xs">{t('dimensionsOptional')}</Label>
          <div className="grid grid-cols-4 gap-2">
            <Input type="number" placeholder="L (cm)" value={data.dimensionL || ''} onChange={e => onChange('dimensionL', e.target.value)} />
            <Input type="number" placeholder="W (cm)" value={data.dimensionW || ''} onChange={e => onChange('dimensionW', e.target.value)} />
            <Input type="number" placeholder="H (cm)" value={data.dimensionH || ''} onChange={e => onChange('dimensionH', e.target.value)} />
            <Input type="number" placeholder="kg" value={data.weight || ''} onChange={e => onChange('weight', e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── NewProductDialog ─────────────────────────────────────────────────────────
function NewProductDialog({ open, onClose, onCreated, activeProfile, t, isGlobalAdmin = false }: {
  open: boolean; onClose: () => void; onCreated: (p: any) => void; activeProfile: string | null; t: (k: string) => string; isGlobalAdmin?: boolean;
}) {
  const [form, setForm] = useState({ ean: '', name: '', brand: '', sizeCategory: '', price: '', purchasePrice: '', weight: '', dimensionL: '', dimensionW: '', dimensionH: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ ean: '', name: '', brand: '', sizeCategory: '', price: '', purchasePrice: '', weight: '', dimensionL: '', dimensionW: '', dimensionH: '' });
  }, [open]);

  const handleSubmit = async () => {
    if (!form.name) { toast.error(t('productNameRequired')); return; }
    if (!activeProfile) { toast.error(t('selectInstallationFirst')); return; }
    try {
      setSaving(true);
      const created = await api.createWarehouseProduct({
        installationId: parseInt(activeProfile, 10),
        ean: form.ean || null, name: form.name, brand: form.brand || null, sizeCategory: form.sizeCategory || null,
        price: parseFloat(form.price) || 0,
        purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : null,
        weight: form.weight ? parseFloat(form.weight) : null,
        dimensionL: form.dimensionL ? parseFloat(form.dimensionL) : null,
        dimensionW: form.dimensionW ? parseFloat(form.dimensionW) : null,
        dimensionH: form.dimensionH ? parseFloat(form.dimensionH) : null,
      });
      toast.success(t('productCreated'));
      onCreated(created);
      onClose();
    } catch (error: any) {
      toast.error(error.message || t('errorCreatingProduct'));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader><DialogTitle>{t('newProduct')}</DialogTitle><DialogDescription>{t('newProductSubtitle')}</DialogDescription></DialogHeader>
        <div className="pt-4">
          <ProductFields t={t} isGlobalAdmin={isGlobalAdmin} data={form} onChange={(key, value) => setForm(prev => ({ ...prev, [key]: value }))} />
          <div className="flex gap-3 pt-6">
            <Button variant="outline" onClick={onClose} className="flex-1">{t('cancel')}</Button>
            <Button onClick={handleSubmit} disabled={saving} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}{t('create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── EditProductDialog ────────────────────────────────────────────────────────
function EditProductDialog({ open, product, onClose, onUpdated, t, isGlobalAdmin = false }: {
  open: boolean; product: Product | null; onClose: () => void; onUpdated: (p: any) => void; t: (k: string) => string; isGlobalAdmin?: boolean;
}) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) setForm({ ...product });
  }, [product]);

  const handleSubmit = async () => {
    if (!product) return;
    try {
      setSaving(true);
      const updated = await api.updateWarehouseProduct(product.id, {
        ean: form.ean, name: form.name, brand: form.brand, sizeCategory: form.sizeCategory,
        price: form.price, purchasePrice: form.purchasePrice,
        weight: form.weight, dimensionL: form.dimensionL, dimensionW: form.dimensionW, dimensionH: form.dimensionH,
      });
      toast.success(t('productUpdated'));
      onUpdated(updated);
      onClose();
    } catch (error: any) {
      toast.error(error.message || t('errorUpdatingProduct'));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader><DialogTitle>{t('editProduct')}</DialogTitle><DialogDescription>{product?.name}</DialogDescription></DialogHeader>
        {product && (
          <div className="pt-4">
            <ProductFields t={t} isGlobalAdmin={isGlobalAdmin} data={form} onChange={(key, value) => setForm((prev: any) => ({ ...prev, [key]: value }))} />
            <div className="flex gap-3 pt-6">
              <Button variant="outline" onClick={onClose} className="flex-1">{t('cancel')}</Button>
              <Button onClick={handleSubmit} disabled={saving} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}{t('save')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────
export function ProductManagement({ activeProfile, isGlobalAdmin = false }: ProductManagementProps) {
  const { t } = useLanguage();

  const [products, setProducts] = useState<Product[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, archived: 0, totalValue: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'archived'>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showNewProductDialog, setShowNewProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // currentPage NIET in de deps van useCallback — voorkomt infinite loop
  const loadProducts = useCallback(async (page: number) => {
    try {
      setLoading(true);
      const params: any = {
        status: activeTab === 'all' ? undefined : activeTab,
        search: searchQuery || undefined,
        page,
        limit: PAGE_SIZE,
      };
      if (activeProfile) params.installationId = activeProfile;
      const data = await api.getWarehouseProducts(params);
      setProducts(data.products || []);
      setStats(data.stats || { total: 0, active: 0, archived: 0, totalValue: 0 });
      setPagination(data.pagination || { total: 0, page: 1, pages: 1 });
    } catch (error) {
      console.error('Failed to load products:', error);
      toast.error(t('errorLoadingProducts'));
    } finally {
      setLoading(false);
    }
  }, [activeProfile, activeTab, searchQuery]); // geen currentPage hier

  // Reset naar pagina 1 bij filter/zoek wijziging
  useEffect(() => { setCurrentPage(1); }, [activeProfile, activeTab, searchQuery]);

  // Laad producten wanneer loadProducts of currentPage wijzigt
  useEffect(() => { loadProducts(currentPage); }, [loadProducts, currentPage]);

  const uniqueClients = Array.from(new Set(products.map(p => p.installation?.name).filter(Boolean)));
  const filteredProducts = products.filter(p => clientFilter === 'all' || p.installation?.name === clientFilter);
  const totalPages = pagination.pages || 1;

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleArchiveProduct = async (product: Product) => {
    try {
      await api.updateWarehouseProduct(product.id, { archived: !product.archived });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, archived: !p.archived } : p));
      toast.success(product.archived ? t('productRestored') : t('productArchived'));
    } catch { toast.error(t('errorUpdatingProduct')); }
  };

  const handleDeleteProduct = async (product: Product) => {
    try {
      await api.deleteWarehouseProduct(product.id);
      setProducts(prev => prev.filter(p => p.id !== product.id));
      setStats(prev => ({ ...prev, total: prev.total - 1, active: prev.active - (product.archived ? 0 : 1), archived: prev.archived - (product.archived ? 1 : 0) }));
      toast.success(t('productDeleted'));
    } catch (error: any) { toast.error(error.message || t('errorDeletingProduct')); }
  };

  return (
    <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between min-w-0">
        <div className="min-w-0 flex-1 mr-4">
          <h1 className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2 truncate">{t('productManagement')}</h1>
          <p className="text-slate-600 truncate">{t('productManagementSubtitle')}</p>
        </div>
        <Button onClick={() => setShowNewProductDialog(true)} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 flex-shrink-0">
          <Plus className="w-4 h-4 mr-2" />{t('newProduct')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500 mb-1">{t('totalProducts')}</p><p className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{stats.total}</p></div><div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center"><Package className="w-6 h-6 text-indigo-600" /></div></div></CardContent></Card>
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500 mb-1">{t('active')}</p><p className="text-3xl font-bold text-emerald-600">{stats.active}</p></div><div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center"><Package className="w-6 h-6 text-emerald-600" /></div></div></CardContent></Card>
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500 mb-1">{t('archived')}</p><p className="text-3xl font-bold text-slate-600">{stats.archived}</p></div><div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center"><Archive className="w-6 h-6 text-slate-600" /></div></div></CardContent></Card>
        <Card className="border-slate-200 shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500 mb-1">Voorraadwaarde</p><p className="text-3xl font-bold text-purple-600">€{(stats.totalValue || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-xs text-slate-400 mt-0.5">op basis van inkoopprijs</p></div><div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center"><Euro className="w-6 h-6 text-purple-600" /></div></div></CardContent></Card>
      </div>

      {/* Filters */}
      <Card className="border-slate-200">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input placeholder={t('searchProductEanClient')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            {isGlobalAdmin && uniqueClients.length > 0 && (
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder={t('allClients')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allClients')}</SelectItem>
                  {uniqueClients.map(client => <SelectItem key={client} value={client!}>{client}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-2">
              {(['all', 'active', 'archived'] as const).map(tab => (
                <Button key={tab} variant={activeTab === tab ? 'default' : 'outline'} onClick={() => setActiveTab(tab)} className={activeTab === tab ? 'bg-gradient-to-r from-indigo-600 to-purple-600' : ''}>
                  {tab === 'all' ? `${t('filterAll')} (${stats.total})` : tab === 'active' ? `${t('active')} (${stats.active})` : `${t('archived')} (${stats.archived})`}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>{t('products')}</CardTitle>
          <CardDescription>
            {pagination.total} {pagination.total === 1 ? t('product') : t('productsFound')}
            {totalPages > 1 && ` · pagina ${currentPage} van ${totalPages}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
          ) : (
            <>
              <div className="border rounded-lg overflow-hidden">
                <Table className="table-fixed w-full">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="w-[60px]">{t('photo')}</TableHead>
                      <TableHead className="w-[140px]">{t('eanCode')}</TableHead>
                      <TableHead>{t('productName')}</TableHead>
                      {isGlobalAdmin && <TableHead className="w-[140px]">{t('client')}</TableHead>}
                      <TableHead className="w-[80px]">{t('sizeCategory')}</TableHead>
                      <TableHead className="w-[100px] text-right">{t('locations')}</TableHead>
                      <TableHead className="w-[80px] text-right">{t('total')}</TableHead>
                      <TableHead className="w-[110px] text-right">Inkoopprijs</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.length === 0 ? (
                      <TableRow><TableCell colSpan={isGlobalAdmin ? 9 : 8} className="text-center py-12 text-slate-500"><Package className="w-12 h-12 mx-auto mb-3 text-slate-300" /><p>{t('noProductsFound')}</p></TableCell></TableRow>
                    ) : filteredProducts.map((product) => (
                      <TableRow key={product.id} className="group hover:bg-slate-50">
                        <TableCell>
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                            {product.image ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-slate-400" />}
                          </div>
                        </TableCell>
                        <TableCell><span className="font-mono text-sm text-slate-600">{product.ean || '—'}</span></TableCell>
                        <TableCell>
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-slate-900">{truncate(product.name, 60)}</span>
                            {product.brand && <span className="text-xs text-slate-400">{product.brand}</span>}
                            {product.archived && <Badge variant="outline" className="w-fit mt-1 bg-slate-100 text-slate-600 border-slate-200 text-xs"><Archive className="w-3 h-3 mr-1" />{t('archived')}</Badge>}
                          </div>
                        </TableCell>
                        {isGlobalAdmin && <TableCell><span className="text-sm text-slate-600 truncate block">{product.installation?.name || '—'}</span></TableCell>}
                        <TableCell>
                          {product.sizeCategory ? <Badge className={`${getSizeCategoryColor(product.sizeCategory)} border font-semibold`}>{product.sizeCategory}</Badge> : <span className="text-slate-400 text-sm">—</span>}
                        </TableCell>
                        <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /><span className="text-slate-900">{product.locations?.length || 0}</span></div></TableCell>
                        <TableCell className="text-right"><span className="text-slate-900">{product.totalStock}</span></TableCell>
                        <TableCell className="text-right">
                          {product.purchasePrice != null ? <span className="font-medium text-slate-900">€{product.purchasePrice.toFixed(2)}</span> : <span className="text-slate-400">—</span>}
                        </TableCell>
                        <TableCell>
                          {isGlobalAdmin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"><MoreVertical className="w-4 h-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditingProduct(product)}><Edit className="w-4 h-4 mr-2" />{t('edit')}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleArchiveProduct(product)}>
                                  {product.archived ? <ArchiveRestore className="w-4 h-4 mr-2" /> : <Archive className="w-4 h-4 mr-2" />}
                                  {product.archived ? t('restore') : t('archive')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteProduct(product)}><Trash2 className="w-4 h-4 mr-2" />{t('delete')}</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-slate-500">{((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, pagination.total)} van {pagination.total} producten</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handlePageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-2 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let p: number;
                      if (totalPages <= 5) p = i + 1;
                      else if (currentPage <= 3) p = i + 1;
                      else if (currentPage >= totalPages - 2) p = totalPages - 4 + i;
                      else p = currentPage - 2 + i;
                      return <button key={p} onClick={() => handlePageChange(p)} className={`w-8 h-8 text-sm rounded border transition-colors ${currentPage === p ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{p}</button>;
                    })}
                    <button onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="p-2 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <NewProductDialog
        open={showNewProductDialog}
        onClose={() => setShowNewProductDialog(false)}
        onCreated={(created) => { setProducts(prev => [created, ...prev]); setStats(prev => ({ ...prev, total: prev.total + 1, active: prev.active + 1 })); }}
        activeProfile={activeProfile}
        t={t}
        isGlobalAdmin={isGlobalAdmin}
      />

      <EditProductDialog
        open={!!editingProduct}
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onUpdated={(updated) => { setProducts(prev => prev.map(p => p.id === updated.id ? updated : p)); setEditingProduct(null); loadProducts(currentPage); }}
        t={t}
        isGlobalAdmin={isGlobalAdmin}
      />
    </div>
  );
}