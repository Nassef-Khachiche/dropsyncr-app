import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from './ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from './ui/tooltip';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Search, Plus, Mail, Copy, Upload, CheckCircle, PackageOpen, X,
  Image as ImageIcon, AlertCircle, Truck, Trash2, Package, Loader2, RefreshCw, Download, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

interface RetourenProps { activeProfile: string; }

type RetourStatus = 'registered' | 'waiting_for_qr' | 'qr_received' | 'returned' | 'received' | 'processed';
type ReturnBoxStatus = null | 'pending' | 'shipped' | 'destroyed';
type InspectionStatus = 'RETURN_RECEIVED' | 'EXCHANGE_PRODUCT' | 'RETURN_DOES_NOT_MEET_CONDITIONS' | 'REPAIR_PRODUCT' | 'CUSTOMER_KEEPS_PRODUCT_PAID' | 'STILL_APPROVED' | 'RETURN_TO_SUPPLIER';

interface ReturnItem { id: number; productName: string; ean: string | null; rmaId: string | null; quantity: number; price: number; imageUrl: string | null; }
interface Return { id: number; returnNumber: string; rmaId: string | null; orderNumber: string; customerName: string; customerEmail: string | null; storeName: string; ffmClientName: string; platform: string; type: string; status: RetourStatus; registrationDate: string; carrier: string | null; trackingCode: string | null; returnReason: string | null; returnReasonNote: string | null; qrCodeUrl: string | null; inspectionStatus: InspectionStatus | null; inspectionCount: number | null; processedAt: string | null; returnBoxStatus: ReturnBoxStatus; items: ReturnItem[]; }

function formatTimestamp(isoString: string, language: string): string {
  const date = new Date(isoString);
  return date.toLocaleString(language === 'nl' ? 'nl-NL' : language === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatCurrency(amount: number): string { return amount.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' }); }
function getTrackingUrl(carrier: string, code: string): string {
  const lower = carrier.toLowerCase();
  if (lower.includes('postnl')) return `https://postnl.nl/tracktrace/?B=${code}&P=&D=&T=C`;
  if (lower.includes('dhl')) return `https://www.dhl.com/nl-nl/home/tracking/tracking-parcel.html?submit=1&tracking-id=${code}`;
  if (lower.includes('bpost')) return `https://track.bpost.cloud/btr/web/#/search?itemCode=${code}`;
  if (lower.includes('ups')) return `https://www.ups.com/track?tracknum=${code}`;
  return '#';
}

export function Retouren({ activeProfile }: RetourenProps) {
  const { t, language } = useLanguage();
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'open' | 'processed' | 'returnbox'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeReturn, setActiveReturn] = useState<Return | null>(null);
  const [dialogInspectionStatus, setDialogInspectionStatus] = useState<InspectionStatus>('RETURN_RECEIVED');
  const [dialogInspectionCount, setDialogInspectionCount] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showNewReturnModal, setShowNewReturnModal] = useState(false);
  const [showReturnBoxActionModal, setShowReturnBoxActionModal] = useState(false);
  const [returnBoxActionClient, setReturnBoxActionClient] = useState<string | null>(null);
  const [returnBoxActionType, setReturnBoxActionType] = useState<'ship' | 'destroy' | null>(null);
  const [newReturnForm, setNewReturnForm] = useState({
    orderNumber: '', customerName: '', customerEmail: '', ffmClientName: '',
    type: 'own_stock', returnReason: '', returnReasonNote: '',
    street: '', houseNumber: '', postalCode: '', city: '', country: 'NL', carrierId: '',
  });
  const [carrierContracts, setCarrierContracts] = useState<any[]>([]);
  const [warehouseAddress, setWarehouseAddress] = useState<any | null>(null);
  const [generatingLabelForId, setGeneratingLabelForId] = useState<number | null>(null);
  const [generatedLabelUrls, setGeneratedLabelUrls] = useState<Record<number, string>>({});

  useEffect(() => { if (activeProfile) loadReturns(); }, [activeProfile]);

  useEffect(() => {
    if (!activeProfile) return;
    const loadWarehouse = async () => {
      try {
        const data = await api.getWarehouseAddress(activeProfile);
        setWarehouseAddress(data || null);
      } catch {
        setWarehouseAddress(null);
      }
    };
    loadWarehouse();
  }, [activeProfile]);

  useEffect(() => {
    if (!activeProfile || !showNewReturnModal) return;
    const loadCarriers = async () => {
      try {
        const data = await api.getCarriers(activeProfile);
        setCarrierContracts((data || []).filter((c: any) => c.active));
      } catch {
        setCarrierContracts([]);
      }
    };
    loadCarriers();
  }, [activeProfile, showNewReturnModal]);

  const loadReturns = async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const data = await api.getReturns({ installationId: activeProfile });
      setReturns(data.returns || []);
    } catch (error) {
      console.error('Failed to load returns:', error);
      toast.error(t('noOpenReturns'));
    } finally {
      setLoading(false);
    }
  };

  const openCount = returns.filter((r) => r.status !== 'processed').length;
  const processedThisMonthCount = returns.filter((r) => {
    if (r.status !== 'processed' || !r.processedAt) return false;
    const d = new Date(r.processedAt); const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const waitingForQrCount = returns.filter((r) => r.type === 'dropship' && !r.qrCodeUrl && r.status !== 'processed').length;
  const returnBoxCount = returns.filter((r) => r.returnBoxStatus === 'pending').length;

  const getFilteredReturns = () => {
    let filtered: Return[] = [];
    if (activeTab === 'open') {
      filtered = returns.filter((r) => r.status !== 'processed');
      if (searchQuery === '__filter_waiting_qr__') {
        filtered = filtered.filter((r) => r.type === 'dropship' && !r.qrCodeUrl);
      } else if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter((r) => r.returnNumber.toLowerCase().includes(q) || (r.rmaId || '').toLowerCase().includes(q) || r.orderNumber.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q) || r.ffmClientName.toLowerCase().includes(q));
      }
    } else if (activeTab === 'processed') {
      filtered = returns.filter((r) => r.status === 'processed');
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter((r) => r.returnNumber.toLowerCase().includes(q) || (r.rmaId || '').toLowerCase().includes(q) || r.orderNumber.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q) || r.ffmClientName.toLowerCase().includes(q));
      }
    }
    return filtered;
  };

  const returnBoxGroups: Record<string, Return[]> = {};
  returns.filter((r) => r.returnBoxStatus === 'pending').forEach((r) => {
    if (!returnBoxGroups[r.ffmClientName]) returnBoxGroups[r.ffmClientName] = [];
    returnBoxGroups[r.ffmClientName].push(r);
  });

  const handleGenerateLabelForReturn = async (ret: Return) => {
    // Find the carrier contract — prefer matching carrier type, fallback to any return-enabled contract
    const allCarriers = await api.getCarriers(activeProfile).catch(() => []);
    const returnContracts = (allCarriers || []).filter((c: any) => c.active && c.credentials?.supportsReturns);

    const contract = ret.carrier
      ? (returnContracts.find((c: any) => c.carrierType === ret.carrier) || returnContracts[0])
      : returnContracts[0];

    if (!contract) {
      toast.error('Geen actief retourcontract gevonden. Schakel "Retourlabels inschakelen" in bij een carrier.');
      return;
    }

    const wh = warehouseAddress;
    const warehouseStreet = wh ? [wh.street, wh.houseNumber].filter(Boolean).join(' ') : (contract.credentials?.senderStreet || '');
    const warehouseZip = wh?.postalCode || contract.credentials?.senderZipCode || '';
    const warehouseCity = wh?.city || contract.credentials?.senderCity || '';
    const warehouseCountry = wh?.country || contract.credentials?.senderCountry || 'NL';
    const warehouseName = wh?.name || contract.credentials?.senderName || 'Warehouse';

    // Parse customer address - prefer individual fields, fall back to combined address
    const addrParts = String(ret.address || '').split(',').map((p: string) => p.trim());
    const customerStreet = (ret as any).street || addrParts[0] || '';
    const customerZip = (ret as any).postalCode || addrParts[1] || '';
    const customerCity = (ret as any).city || addrParts[2] || '';
    const customerCountry = (ret as any).country || addrParts[3] || 'NL';

    const returnPackage = {
      id: ret.returnNumber,
      orderId: null,
      orderNumber: ret.orderNumber,
      isReturn: true,
      // Sender = customer
      customerName: warehouseName,
      senderName: ret.customerName,
      senderStreet: customerStreet,
      senderZipCode: customerZip,
      senderCity: customerCity,
      senderCountry: customerCountry,
      senderEmail: ret.customerEmail || null,
      senderPhone: null,
      // Receiver = warehouse
      street: warehouseStreet,
      zipCode: warehouseZip,
      city: warehouseCity,
      country: warehouseCountry,
      address: [warehouseStreet, warehouseZip, warehouseCity].filter(Boolean).join(', '),
      email: wh?.email || null,
      phone: wh?.phone || null,
    };

    try {
      setGeneratingLabelForId(ret.id);
      const result = await api.generateCarrierLabels(Number(contract.id), {
        shippingMethod: String(contract.id),
        packages: [returnPackage],
      });

      const label = (result.labels || [])[0];
      if (label?.labelUrl) {
        console.log('Label URL received:', label.labelUrl.substring(0, 100));
        // Open label
        if (label.labelUrl.startsWith('http')) {
          window.open(label.labelUrl, '_blank');
        } else {
          // Fallback: blob open for base64
          const base64Match = label.labelUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (base64Match) {
            const blob = new Blob([Uint8Array.from(atob(base64Match[2]), c => c.charCodeAt(0))], { type: base64Match[1] });
            window.open(URL.createObjectURL(blob), '_blank');
          }
        }
        toast.success('Retourlabel aangemaakt');
        // Save URL to DB (only if short enough)
        if (label.labelUrl.startsWith('http')) {
          try {
            await api.updateReturn(ret.id, { qrCodeUrl: label.labelUrl });
            setReturns((prev) => prev.map((r) => r.id === ret.id ? { ...r, qrCodeUrl: label.labelUrl } : r));
          } catch (err) {
            console.error('Failed to save label URL:', err);
            setGeneratedLabelUrls((prev) => ({ ...prev, [ret.id]: label.labelUrl }));
          }
        } else {
          setGeneratedLabelUrls((prev) => ({ ...prev, [ret.id]: label.labelUrl }));
        }
      }
    } catch (error) {
      console.error('Failed to generate return label:', error);
      toast.error('Kon retourlabel niet genereren', {
        description: error instanceof Error ? error.message : 'Probeer het opnieuw',
      });
    } finally {
      setGeneratingLabelForId(null);
    }
  };

  const handleOpenProcess = (ret: Return) => { setActiveReturn(ret); setDialogInspectionStatus('RETURN_RECEIVED'); setDialogInspectionCount(ret.items[0]?.quantity || 1); };

  const handleQRUpload = async () => {
    if (!activeReturn) return;
    try {
      const updated = await api.updateReturn(activeReturn.id, { status: 'qr_received', qrCodeUrl: `qr-uploaded-${activeReturn.returnNumber}` });
      setReturns((prev) => prev.map((r) => (r.id === activeReturn.id ? { ...r, ...updated } : r)));
      setActiveReturn((prev) => prev ? { ...prev, ...updated } : prev);
      toast.success(`${t('qrReceived')}: ${activeReturn.returnNumber}`);
    } catch { toast.error(t('noOpenReturns')); }
  };

  const handleProcessReturn = async () => {
    if (!activeReturn) return;
    setIsProcessing(true);
    try {
      const isReturnBox = dialogInspectionStatus === 'RETURN_DOES_NOT_MEET_CONDITIONS';
      const updated = await api.updateReturn(activeReturn.id, { status: 'processed', inspectionStatus: dialogInspectionStatus, inspectionCount: dialogInspectionCount, processedAt: new Date().toISOString(), returnBoxStatus: isReturnBox ? 'pending' : null });
      setReturns((prev) => prev.map((r) => (r.id === activeReturn.id ? { ...r, ...updated } : r)));
      toast.success(t('inspectionReturnReceived'));
      setActiveReturn(null);
    } catch { toast.error(t('noProcessedReturns')); } finally { setIsProcessing(false); }
  };

  const handleReturnBoxAction = async () => {
    if (!returnBoxActionClient || !returnBoxActionType) return;
    setIsProcessing(true);
    try {
      const items = returns.filter((r) => r.ffmClientName === returnBoxActionClient && r.returnBoxStatus === 'pending');
      await Promise.all(items.map((r) => api.updateReturn(r.id, { returnBoxStatus: returnBoxActionType === 'ship' ? 'shipped' : 'destroyed' })));
      await loadReturns();
      toast.success(returnBoxActionType === 'ship' ? t('yesCreateShipment') : t('yesDestroy'));
      setShowReturnBoxActionModal(false); setReturnBoxActionClient(null); setReturnBoxActionType(null);
    } catch { toast.error(t('noOpenReturns')); } finally { setIsProcessing(false); }
  };

  const handleCreateReturn = async () => {
    if (!activeProfile) return;
    try {
      const selectedCarrier = carrierContracts.find((c: any) => String(c.id) === newReturnForm.carrierId);
      const customerAddress = [
        [newReturnForm.street, newReturnForm.houseNumber].filter(Boolean).join(' '),
        newReturnForm.postalCode,
        newReturnForm.city,
        newReturnForm.country,
      ].filter(Boolean).join(', ');
      const newReturn = await api.createReturn({
        installationId: parseInt(activeProfile, 10),
        orderNumber: newReturnForm.orderNumber,
        customerName: newReturnForm.customerName,
        customerEmail: newReturnForm.customerEmail || null,
        storeName: newReturnForm.ffmClientName,
        ffmClientName: newReturnForm.ffmClientName,
        type: newReturnForm.type,
        returnReason: newReturnForm.returnReason || null,
        returnReasonNote: newReturnForm.returnReasonNote || null,
        platform: 'manual',
        carrier: selectedCarrier?.carrierType || null,
        address: customerAddress,
        street: [newReturnForm.street, newReturnForm.houseNumber].filter(Boolean).join(' '),
        postalCode: newReturnForm.postalCode,
        city: newReturnForm.city,
        country: newReturnForm.country,
        items: [],
      });
      setReturns((prev) => [newReturn, ...prev]);
      setShowNewReturnModal(false);
      setNewReturnForm({ orderNumber: '', customerName: '', customerEmail: '', ffmClientName: '', type: 'own_stock', returnReason: '', returnReasonNote: '' });
      toast.success(`${t('registerReturn')}: ${newReturn.returnNumber}`);
    } catch { toast.error(t('noOpenReturns')); }
  };

  const getStatusBadge = (status: RetourStatus) => {
    const map: Record<RetourStatus, { label: string; className: string }> = {
      registered: { label: t('statusRegistered'), className: 'bg-amber-100 text-amber-700 border-amber-200' },
      waiting_for_qr: { label: t('statusWaitingQr'), className: 'bg-amber-100 text-amber-700 border-amber-200' },
      qr_received: { label: t('statusQrReceived'), className: 'bg-blue-100 text-blue-700 border-blue-200' },
      returned: { label: t('statusReturned'), className: 'bg-blue-100 text-blue-700 border-blue-200' },
      received: { label: t('statusReceived'), className: 'bg-amber-100 text-amber-700 border-amber-200' },
      processed: { label: t('statusProcessed'), className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    };
    const entry = map[status] || { label: status, className: 'bg-slate-100 text-slate-700 border-slate-200' };
    return <Badge variant="outline" className={entry.className}>{entry.label}</Badge>;
  };

  const getInspectionStatusLabel = (status: InspectionStatus): string => {
    const map: Record<InspectionStatus, string> = {
      RETURN_RECEIVED: t('inspectionReturnReceived'), EXCHANGE_PRODUCT: t('inspectionExchangeProduct'),
      RETURN_DOES_NOT_MEET_CONDITIONS: t('inspectionNotMeetConditions'), REPAIR_PRODUCT: t('inspectionRepairProduct'),
      CUSTOMER_KEEPS_PRODUCT_PAID: t('inspectionCustomerKeeps'), STILL_APPROVED: t('inspectionStillApproved'),
      RETURN_TO_SUPPLIER: t('inspectionReturnToSupplier'),
    };
    return map[status];
  };

  const getFfmBadge = (name: string, large = false) => {
    const classes = large ? 'px-3 py-1 text-base' : 'px-2 py-0.5 text-xs';
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colorOptions = ['bg-purple-100 text-purple-700 border-purple-200', 'bg-teal-100 text-teal-700 border-teal-200', 'bg-amber-100 text-amber-700 border-amber-200', 'bg-blue-100 text-blue-700 border-blue-200', 'bg-rose-100 text-rose-700 border-rose-200'];
    return <Badge variant="outline" className={`${colorOptions[hash % colorOptions.length]} ${classes}`}>{name}</Badge>;
  };

  const filteredReturns = getFilteredReturns();
  const returnBoxModalItems = returnBoxActionClient ? returns.filter((r) => r.ffmClientName === returnBoxActionClient && r.returnBoxStatus === 'pending') : [];
  const returnBoxModalTotal = returnBoxModalItems.reduce((sum, r) => sum + r.items.reduce((s, item) => s + item.price * item.quantity, 0), 0);

  if (!activeProfile) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">{t('returns')}</h2>
          <p className="text-slate-600">{t('returnsSelectInstallation')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">{t('returns')}</h2>
        <p className="text-slate-600">{t('returnsSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setActiveTab('open'); setSearchQuery(''); }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-slate-500 mb-1">{t('openReturns')}</p><p className="text-3xl font-bold text-amber-600">{openCount}</p></div>
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center"><PackageOpen className="w-6 h-6 text-amber-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setActiveTab('processed'); setSearchQuery(''); }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-slate-500 mb-1">{t('processedThisMonth')}</p><p className="text-3xl font-bold text-emerald-600">{processedThisMonthCount}</p></div>
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle className="w-6 h-6 text-emerald-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setActiveTab('open'); setSearchQuery('__filter_waiting_qr__'); }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-slate-500 mb-1">{t('waitingForQr')}</p><p className="text-3xl font-bold text-red-600">{waitingForQrCount}</p></div>
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center"><AlertCircle className="w-6 h-6 text-red-600" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setActiveTab('returnbox'); setSearchQuery(''); }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-slate-500 mb-1">{t('inReturnBox')}</p><p className="text-3xl font-bold text-purple-600">{returnBoxCount}</p></div>
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center"><Package className="w-6 h-6 text-purple-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <TabsList className="bg-slate-100 p-1">
            <TabsTrigger value="open" className="gap-2">{t('openReturnsTab')}{openCount > 0 && <Badge variant="outline" className="ml-1 bg-white border-slate-200">{openCount}</Badge>}</TabsTrigger>
            <TabsTrigger value="processed" className="gap-2">{t('processedReturnsTab')}{returns.filter((r) => r.status === 'processed').length > 0 && <Badge variant="outline" className="ml-1 bg-white border-slate-200">{returns.filter((r) => r.status === 'processed').length}</Badge>}</TabsTrigger>
            <TabsTrigger value="returnbox" className="gap-2">{t('returnBoxTab')}{returnBoxCount > 0 && <Badge variant="outline" className="ml-1 bg-white border-slate-200">{returnBoxCount}</Badge>}</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-3">
            {activeTab !== 'returnbox' && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input placeholder={t('searchReturns')} value={searchQuery === '__filter_waiting_qr__' ? '' : searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 pr-10 border-slate-200 w-[420px]" />
                {searchQuery.length > 0 && searchQuery !== '__filter_waiting_qr__' && (
                  <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
                )}
              </div>
            )}
            <Button variant="outline" size="sm" className="gap-2 border-slate-200" onClick={loadReturns} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
            {activeTab === 'open' && (
              <Button onClick={() => setShowNewReturnModal(true)} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
                <Plus className="w-4 h-4 mr-2" />{t('registerReturn')}
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="open" className="space-y-3">
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
            : filteredReturns.length === 0 ? <Card className="border-slate-200 shadow-sm"><CardContent className="py-12 text-center"><PackageOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-500">{t('noOpenReturns')}</p></CardContent></Card>
            : filteredReturns.map((ret) => <ReturnCard key={ret.id} ret={ret} onProcess={handleOpenProcess} onGenerateLabel={handleGenerateLabelForReturn} generatingLabelForId={generatingLabelForId} generatedLabelUrls={generatedLabelUrls} getStatusBadge={getStatusBadge} getFfmBadge={getFfmBadge} isProcessed={false} t={t} language={language} />)}
        </TabsContent>

        <TabsContent value="processed" className="space-y-3">
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
            : filteredReturns.length === 0 ? <Card className="border-slate-200 shadow-sm"><CardContent className="py-12 text-center"><PackageOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-500">{t('noProcessedReturns')}</p></CardContent></Card>
            : filteredReturns.map((ret) => <ReturnCard key={ret.id} ret={ret} onProcess={handleOpenProcess} onGenerateLabel={handleGenerateLabelForReturn} generatingLabelForId={generatingLabelForId} generatedLabelUrls={generatedLabelUrls} getStatusBadge={getStatusBadge} getFfmBadge={getFfmBadge} isProcessed={true} t={t} language={language} />)}
        </TabsContent>

        <TabsContent value="returnbox" className="space-y-4">
          {Object.keys(returnBoxGroups).length === 0 ? (
            <Card className="border-slate-200 shadow-sm"><CardContent className="py-12 text-center"><PackageOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-500">{t('noReturnBoxItems')}</p></CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(returnBoxGroups).map(([clientName, items]) => {
                const totalValue = items.reduce((sum, r) => sum + r.items.reduce((s, item) => s + item.price * item.quantity, 0), 0);
                const totalCount = items.reduce((sum, r) => sum + r.items.reduce((s, item) => s + item.quantity, 0), 0);
                return (
                  <Card key={clientName} className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="space-y-2">
                        {getFfmBadge(clientName, true)}
                        <p className="font-bold text-lg">{totalCount} {t('articlesInReturnBox')}</p>
                        <p className="text-amber-600 font-semibold">{t('totalSalesValue')}: {formatCurrency(totalValue)}</p>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-2">
                        {items.map((ret) => ret.items.map((item, idx) => (
                          <div key={`${ret.id}-${idx}`} className="flex items-start justify-between text-sm py-1">
                            <div className="flex-1 min-w-0"><p className="font-mono text-xs text-slate-500">{ret.returnNumber}</p><p className="truncate">{item.productName}</p>{item.ean && <p className="font-mono text-xs text-slate-400">EAN: {item.ean}</p>}</div>
                            <div className="text-right ml-2"><p className="text-slate-600">{item.quantity}x</p><p className="text-slate-500">{formatCurrency(item.price)}</p></div>
                          </div>
                        )))}
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => { setReturnBoxActionClient(clientName); setReturnBoxActionType('ship'); setShowReturnBoxActionModal(true); }} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"><Truck className="w-4 h-4 mr-2" />{t('createShipment')}</Button>
                        <Button variant="outline" onClick={() => { setReturnBoxActionClient(clientName); setReturnBoxActionType('destroy'); setShowReturnBoxActionModal(true); }} className="flex-1 border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4 mr-2" />{t('destroy')}</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Process Dialog */}
      <Dialog open={activeReturn !== null} onOpenChange={(open) => !open && setActiveReturn(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('returns')} {activeReturn?.returnNumber} {activeReturn?.status === 'processed' ? t('processedReturn') : t('processReturn')}</DialogTitle>
          </DialogHeader>
          {activeReturn && (
            <div className="space-y-4">
              <div className="flex items-center gap-2"><p className="text-sm text-slate-500">{t('productsFromOrder')} {activeReturn.orderNumber}</p>{getFfmBadge(activeReturn.ffmClientName)}</div>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
                {activeReturn.items.length === 0 ? <div className="p-4 text-sm text-slate-400 text-center">{t('noItemsKnown')}</div> : activeReturn.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3">
                    <div className="w-12 h-12 flex-shrink-0 rounded bg-slate-100 flex items-center justify-center">{item.imageUrl ? <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover rounded" /> : <ImageIcon className="w-6 h-6 text-slate-400" />}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{item.productName}</p>
                      {item.ean && <div className="flex items-center gap-1 mt-0.5"><span className="text-xs text-slate-500 font-mono">EAN: {item.ean}</span><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(item.ean!); toast.success(t('eanCopied')); }} className="h-4 w-4 p-0"><Copy className="w-3 h-3" /></Button></TooltipTrigger><TooltipContent>{t('copyEan')}</TooltipContent></Tooltip></TooltipProvider></div>}
                    </div>
                    <div className="text-right"><p className="text-sm">{item.quantity}x</p><p className="text-sm font-medium">{formatCurrency(item.price)}</p></div>
                  </div>
                ))}
              </div>
              {activeReturn.returnReason && <div className="border border-slate-200 rounded-lg p-3 flex items-center gap-2"><Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300">{activeReturn.returnReason}</Badge>{activeReturn.returnReasonNote && <><span className="text-slate-300">|</span><p className="text-sm text-slate-600 italic">{activeReturn.returnReasonNote}</p></>}</div>}
              {activeReturn.type === 'dropship' && !activeReturn.qrCodeUrl && activeReturn.status !== 'processed' && (
                <Alert className="border-amber-200 bg-amber-50"><AlertCircle className="h-4 w-4 text-amber-600" /><AlertDescription className="text-amber-900"><p className="mb-3">{t('dropshipRetourQr')}</p><Button variant="outline" onClick={handleQRUpload} className="border-amber-300"><Upload className="w-4 h-4 mr-2" />{t('uploadQrCode')}</Button></AlertDescription></Alert>
              )}
              {activeReturn.status === 'processed' && activeReturn.inspectionStatus && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2"><CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" /><div><p className="text-sm text-emerald-900 font-medium">{t('processedOn')} {activeReturn.processedAt && formatTimestamp(activeReturn.processedAt, language)}</p><p className="text-sm text-emerald-800">{t('status')}: {getInspectionStatusLabel(activeReturn.inspectionStatus)}</p></div></div>
              )}
              {activeReturn.status !== 'processed' && (
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <h3 className="font-semibold text-sm">{t('processing')}</h3>
                  <div className="flex gap-3">
                    <div className="w-[180px]">
                      <label className="block text-sm text-slate-700 mb-2">{t('quantity')}</label>
                      <Select value={dialogInspectionCount.toString()} onValueChange={(v) => setDialogInspectionCount(Number(v))}><SelectTrigger className="border-slate-200"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: activeReturn.items[0]?.quantity || 1 }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm text-slate-700 mb-2">{t('inspectionStatus')}</label>
                      <Select value={dialogInspectionStatus} onValueChange={(v) => setDialogInspectionStatus(v as InspectionStatus)}><SelectTrigger className="border-slate-200"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="RETURN_RECEIVED">{t('inspectionReturnReceived')}</SelectItem><SelectItem value="EXCHANGE_PRODUCT">{t('inspectionExchangeProduct')}</SelectItem><SelectItem value="RETURN_DOES_NOT_MEET_CONDITIONS">{t('inspectionNotMeetConditions')}</SelectItem><SelectItem value="REPAIR_PRODUCT">{t('inspectionRepairProduct')}</SelectItem><SelectItem value="CUSTOMER_KEEPS_PRODUCT_PAID">{t('inspectionCustomerKeeps')}</SelectItem><SelectItem value="STILL_APPROVED">{t('inspectionStillApproved')}</SelectItem><SelectItem value="RETURN_TO_SUPPLIER">{t('inspectionReturnToSupplier')}</SelectItem></SelectContent></Select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveReturn(null)}>{activeReturn?.status === 'processed' ? t('close') : t('goBack')}</Button>
            {activeReturn?.status !== 'processed' && <Button onClick={handleProcessReturn} disabled={isProcessing} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">{isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{t('yesProcessReturn')}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Returnbox Action Modal */}
      <Dialog open={showReturnBoxActionModal} onOpenChange={setShowReturnBoxActionModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{returnBoxActionType === 'ship' ? t('createShipmentFor') : t('destroyItemsFor')} {returnBoxActionClient}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {returnBoxActionType === 'destroy' && <Alert className="border-amber-200 bg-amber-50"><AlertCircle className="h-4 w-4 text-amber-600" /><AlertDescription className="text-amber-900"><strong>{t('warningIrreversible')}</strong></AlertDescription></Alert>}
            <p className="text-sm text-slate-600">{returnBoxActionType === 'ship' ? t('createShipmentDescription') : t('destroyDescription')}</p>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-200 max-h-60 overflow-y-auto">
              {returnBoxModalItems.map((ret) => ret.items.map((item, idx) => (
                <div key={`${ret.id}-${idx}`} className="flex items-start justify-between p-3 text-sm"><div className="flex-1 min-w-0"><p className="font-mono text-xs text-slate-500">{ret.returnNumber}</p><p className="font-medium truncate">{item.productName}</p></div><div className="text-right ml-2"><p>{item.quantity}x</p><p className="font-medium">{formatCurrency(item.price)}</p></div></div>
              )))}
            </div>
            <div className={`p-3 rounded-lg border ${returnBoxActionType === 'destroy' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}><p className={`font-semibold ${returnBoxActionType === 'destroy' ? 'text-red-700' : 'text-amber-700'}`}>{t('totalSalesValue')}: {formatCurrency(returnBoxModalTotal)}</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReturnBoxActionModal(false); setReturnBoxActionClient(null); setReturnBoxActionType(null); }}>{t('cancel')}</Button>
            <Button variant={returnBoxActionType === 'destroy' ? 'destructive' : 'default'} onClick={handleReturnBoxAction} disabled={isProcessing} className={returnBoxActionType === 'ship' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700' : ''}>{isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{returnBoxActionType === 'ship' ? t('yesCreateShipment') : t('yesDestroy')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Return Modal */}
      <Dialog open={showNewReturnModal} onOpenChange={setShowNewReturnModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t('registerReturnTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="block text-sm text-slate-700 mb-2">{t('orderNumber')} <span className="text-red-500">*</span></label><Input placeholder="C0-O0-1T-OC-J8" value={newReturnForm.orderNumber} onChange={(e) => setNewReturnForm({ ...newReturnForm, orderNumber: e.target.value })} className="border-slate-200" /></div>
            <div><label className="block text-sm text-slate-700 mb-2">{t('customerName')} <span className="text-red-500">*</span></label><Input placeholder="Jan Bakker" value={newReturnForm.customerName} onChange={(e) => setNewReturnForm({ ...newReturnForm, customerName: e.target.value })} className="border-slate-200" /></div>
            <div><label className="block text-sm text-slate-700 mb-2">{t('email')}</label><Input type="email" placeholder="jan@example.com" value={newReturnForm.customerEmail} onChange={(e) => setNewReturnForm({ ...newReturnForm, customerEmail: e.target.value })} className="border-slate-200" /></div>

            {/* Address */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="block text-sm text-slate-700">{t('warehouseStreet')} <span className="text-red-500">*</span></label>
                <Input placeholder={t('warehouseStreetPlaceholder')} value={newReturnForm.street} onChange={(e) => setNewReturnForm({ ...newReturnForm, street: e.target.value })} className="border-slate-200" />
              </div>
              <div className="space-y-1">
                <label className="block text-sm text-slate-700">{t('warehouseHouseNumber')}</label>
                <Input placeholder="12A" value={newReturnForm.houseNumber} onChange={(e) => setNewReturnForm({ ...newReturnForm, houseNumber: e.target.value })} className="border-slate-200" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="block text-sm text-slate-700">{t('warehousePostalCode')} <span className="text-red-500">*</span></label>
                <Input placeholder="1234 AB" value={newReturnForm.postalCode} onChange={(e) => setNewReturnForm({ ...newReturnForm, postalCode: e.target.value })} className="border-slate-200" />
              </div>
              <div className="space-y-1">
                <label className="block text-sm text-slate-700">{t('warehouseCity')} <span className="text-red-500">*</span></label>
                <Input placeholder={t('warehouseCityPlaceholder')} value={newReturnForm.city} onChange={(e) => setNewReturnForm({ ...newReturnForm, city: e.target.value })} className="border-slate-200" />
              </div>
              <div className="space-y-1">
                <label className="block text-sm text-slate-700">{t('warehouseCountry')}</label>
                <Select value={newReturnForm.country} onValueChange={(v) => setNewReturnForm({ ...newReturnForm, country: v })}>
                  <SelectTrigger className="border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['NL','BE','DE','FR','GB','ES','IT','PL','CZ','AT','CH','SE','DK','NO','FI'].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div><label className="block text-sm text-slate-700 mb-2">{t('ffmClient')} <span className="text-red-500">*</span></label><Input placeholder="Streetwear BV" value={newReturnForm.ffmClientName} onChange={(e) => setNewReturnForm({ ...newReturnForm, ffmClientName: e.target.value })} className="border-slate-200" /></div>

            {/* Carrier */}
            <div>
              <label className="block text-sm text-slate-700 mb-2">{t('carriers')}</label>
              <Select value={newReturnForm.carrierId} onValueChange={(v) => setNewReturnForm({ ...newReturnForm, carrierId: v })}>
                <SelectTrigger className="border-slate-200"><SelectValue placeholder="-" /></SelectTrigger>
                <SelectContent>
                  {carrierContracts.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.contractName} ({c.carrierType.toUpperCase()})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><label className="block text-sm text-slate-700 mb-2">{t('returnType')} <span className="text-red-500">*</span></label><Select value={newReturnForm.type} onValueChange={(v) => setNewReturnForm({ ...newReturnForm, type: v })}><SelectTrigger className="border-slate-200"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="own_stock">{t('ownStock')}</SelectItem><SelectItem value="dropship">{t('dropship')}</SelectItem></SelectContent></Select></div>
            <div><label className="block text-sm text-slate-700 mb-2">{t('returnReason')}</label><Select value={newReturnForm.returnReason} onValueChange={(v) => setNewReturnForm({ ...newReturnForm, returnReason: v })}><SelectTrigger className="border-slate-200"><SelectValue placeholder={t('selectReason')} /></SelectTrigger><SelectContent><SelectItem value="Damaged product">{t('damagedProduct')}</SelectItem><SelectItem value="Wrong product">{t('wrongProduct')}</SelectItem><SelectItem value="Not as described">{t('notAsDescribed')}</SelectItem><SelectItem value="Changed mind">{t('changedMind')}</SelectItem><SelectItem value="Delivery complaint">{t('deliveryComplaint')}</SelectItem><SelectItem value="Return to supplier">{t('returnToSupplier')}</SelectItem><SelectItem value="Other">{t('other')}</SelectItem></SelectContent></Select></div>
            <div><label className="block text-sm text-slate-700 mb-2">{t('explanation')}</label><Textarea rows={3} placeholder={t('explanationPlaceholder')} value={newReturnForm.returnReasonNote} onChange={(e) => setNewReturnForm({ ...newReturnForm, returnReasonNote: e.target.value })} className="border-slate-200" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewReturnModal(false)}>{t('cancel')}</Button>
            <Button onClick={handleCreateReturn} disabled={!newReturnForm.orderNumber || !newReturnForm.customerName || !newReturnForm.ffmClientName} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">{t('registerReturn')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReturnCard({ ret, onProcess, onGenerateLabel, generatingLabelForId, generatedLabelUrls, getStatusBadge, getFfmBadge, isProcessed, t, language }: { ret: Return; onProcess: (ret: Return) => void; onGenerateLabel: (ret: Return) => void; generatingLabelForId: number | null; generatedLabelUrls: Record<number, string>; getStatusBadge: (status: RetourStatus) => JSX.Element; getFfmBadge: (name: string, large?: boolean) => JSX.Element; isProcessed: boolean; t: (key: any) => string; language: string; }) {
  return (
    <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => onProcess(ret)}>
      <CardContent className="p-0">
        <div className="flex items-stretch">
          <div className="min-w-[200px] p-4 border-r border-slate-200">
            <p className="font-bold text-base mb-1">{ret.returnNumber}</p>
            <p className="text-xs text-slate-500 mb-2">{formatTimestamp(ret.registrationDate, language)}</p>
            {getFfmBadge(ret.ffmClientName)}
          </div>
          <div className="flex-1 p-4 border-r border-slate-200">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-bold">{ret.customerName}</p>
              {ret.customerEmail && <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(ret.customerEmail!); toast.success(t('emailCopied')); }} className="h-6 w-6 p-0"><Mail className="w-3 h-3" /></Button></TooltipTrigger><TooltipContent>{t('copyEmail')}</TooltipContent></Tooltip></TooltipProvider>}
              <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(ret.customerName); toast.success(t('nameCopied')); }} className="h-6 w-6 p-0"><Copy className="w-3 h-3" /></Button></TooltipTrigger><TooltipContent>{t('copyName')}</TooltipContent></Tooltip></TooltipProvider>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <span>{t('productsFromOrder')} {ret.orderNumber}</span>
              <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(ret.orderNumber); toast.success(t('orderNumberCopied')); }} className="h-5 w-5 p-0"><Copy className="w-3 h-3" /></Button></TooltipTrigger><TooltipContent>{t('copyOrderNumber')}</TooltipContent></Tooltip></TooltipProvider>
            </div>
          </div>
          <div className="min-w-[200px] p-4 border-r border-slate-200 space-y-2">
            <p className="text-sm text-slate-500">{ret.carrier || t('unknown')}</p>
            {ret.trackingCode && ret.carrier && <a href={getTrackingUrl(ret.carrier, ret.trackingCode)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-sm text-blue-600 hover:underline block">{ret.trackingCode}</a>}
            <div className="flex flex-col gap-1">
              {ret.type === 'dropship' && (ret.qrCodeUrl ? <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 w-fit">{t('qrReceived')}</Badge> : <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 w-fit">{t('qrRequired')}</Badge>)}
              {getStatusBadge(ret.status)}
            </div>
          </div>
          <div className="min-w-[140px] p-4 flex items-center justify-center gap-2">
            {ret.qrCodeUrl || generatedLabelUrls[ret.id] ? (
              <Button variant="outline" size="sm" className="border-slate-200 shrink-0" onClick={(e) => { e.stopPropagation(); window.open(ret.qrCodeUrl || generatedLabelUrls[ret.id], '_blank'); }} title="Label downloaden"><Download className="w-4 h-4" /></Button>
            ) : !isProcessed ? (
              <Button variant="outline" size="sm" className="border-slate-200 shrink-0 text-indigo-600" onClick={(e) => { e.stopPropagation(); onGenerateLabel(ret); }} disabled={generatingLabelForId === ret.id} title="Retourlabel genereren">
                {generatingLabelForId === ret.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              </Button>
            ) : null}
            <Button onClick={(e) => { e.stopPropagation(); onProcess(ret); }} variant={isProcessed ? 'outline' : 'default'} className={isProcessed ? '' : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'}>{isProcessed ? t('viewReturn') : t('processReturnBtn')}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}