import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
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
  MapPin,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  Printer,
  MoreVertical,
  Trash2,
  Package,
  Barcode,
  Loader2,
  Power,
  Layers,
  Boxes,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';

type LocationType = 'row' | 'section' | 'case' | 'pallet';
type ArrowDirection = 'up' | 'down' | 'none';

interface Location {
  id: number;
  code: string;
  type: LocationType;
  parentId: number | null;
  active: boolean;
  installationId: number;
  arrowDirection?: ArrowDirection;
}

interface LocationManagerProps {
  activeProfile: string;
  isGlobalAdmin?: boolean;
}

// Tekent een zwarte pijl (omhoog/omlaag) in een kolom op het label.
function drawArrow(
  pdf: jsPDF,
  centerX: number,
  zoneTop: number,
  zoneHeight: number,
  direction: ArrowDirection
) {
  if (direction === 'none') return;

  const headHalf = 9;   // halve breedte pijlpunt
  const headHeight = 16;
  const shaftHalf = 3;  // halve breedte schacht
  const top = zoneTop;
  const bottom = zoneTop + zoneHeight;

  pdf.setFillColor(0, 0, 0);

  if (direction === 'up') {
    // punt boven
    pdf.triangle(centerX, top, centerX - headHalf, top + headHeight, centerX + headHalf, top + headHeight, 'F');
    // schacht eronder
    pdf.rect(centerX - shaftHalf, top + headHeight, shaftHalf * 2, bottom - (top + headHeight), 'F');
  } else if (direction === 'down') {
    // punt onder
    pdf.triangle(centerX, bottom, centerX - headHalf, bottom - headHeight, centerX + headHalf, bottom - headHeight, 'F');
    // schacht erboven
    pdf.rect(centerX - shaftHalf, top, shaftHalf * 2, bottom - headHeight - top, 'F');
  }
}

// Magazijnlabel op thermische printer (150 x 102 mm, liggend, zwart-wit).
// Barcode bovenaan; daaronder de code in vakjes RIJ/SECTIE/CASE/PALLET,
// met rechts een richtingspijl (omhoog/omlaag) indien ingesteld.
function generateBarcodePDF(code: string, arrowDirection: ArrowDirection = 'none') {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, code, {
    format: 'CODE128',
    width: 3,
    height: 120,
    displayValue: false,
    margin: 0,
  });
  const barcodeImg = canvas.toDataURL('image/png');

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [150, 102] });

  const pageWidth = 150;
  const margin = 8;
  const contentWidth = pageWidth - margin * 2; // 134mm

  // Barcode bovenaan, over de volle breedte
  const barcodeY = 8;
  const barcodeHeight = 26;
  pdf.addImage(barcodeImg, 'PNG', margin, barcodeY, contentWidth, barcodeHeight);

  // Volledige code als tekst
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(0, 0, 0);
  pdf.text(code, pageWidth / 2, barcodeY + barcodeHeight + 11, { align: 'center' });

  // Code opsplitsen (RIJ-SECTIE-CASE[-PALLET])
  const parts = code.split('-');
  const labels = ['RIJ', 'SECTIE', 'CASE', 'PALLET'];
  const cells = labels.map((label, i) => ({ label, value: parts[i] !== undefined ? parts[i] : '' }));

  // Layout: vakjes links, pijl-kolom rechts
  const arrowZoneWidth = 24;
  const gridWidth = contentWidth - arrowZoneWidth;
  const gridTop = barcodeY + barcodeHeight + 20;
  const cellGap = 5;
  const cellCount = 4;
  const cellWidth = (gridWidth - cellGap * (cellCount - 1)) / cellCount;
  const cellHeight = 30;
  const labelStripHeight = 10;

  cells.forEach((cell, i) => {
    const x = margin + i * (cellWidth + cellGap);
    const hasValue = cell.value !== '';

    pdf.setLineWidth(0.7);
    pdf.setDrawColor(0, 0, 0);
    pdf.rect(x, gridTop, cellWidth, cellHeight + labelStripHeight);

    pdf.setTextColor(hasValue ? 0 : 180, hasValue ? 0 : 180, hasValue ? 0 : 180);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.text(hasValue ? cell.value : '-', x + cellWidth / 2, gridTop + cellHeight / 2 + 5, { align: 'center' });

    pdf.setFillColor(0, 0, 0);
    pdf.rect(x, gridTop + cellHeight, cellWidth, labelStripHeight, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(cell.label, x + cellWidth / 2, gridTop + cellHeight + labelStripHeight - 3.5, { align: 'center' });
  });

  // Pijl rechts
  const arrowCenterX = margin + gridWidth + arrowZoneWidth / 2;
  drawArrow(pdf, arrowCenterX, gridTop, cellHeight + labelStripHeight, arrowDirection);

  pdf.setTextColor(0, 0, 0);

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// Print meerdere labels achter elkaar (één per pagina), zelfde ontwerp + pijl.
function generateRowBarcodePDF(items: { code: string; arrowDirection: ArrowDirection }[]) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [150, 102] });

  items.forEach((item, index) => {
    if (index > 0) pdf.addPage([150, 102], 'landscape');
    const { code, arrowDirection } = item;

    const canvas = document.createElement('canvas');
    JsBarcode(canvas, code, { format: 'CODE128', width: 3, height: 120, displayValue: false, margin: 0 });
    const barcodeImg = canvas.toDataURL('image/png');

    const pageWidth = 150;
    const margin = 8;
    const contentWidth = pageWidth - margin * 2;

    const barcodeY = 8;
    const barcodeHeight = 26;
    pdf.addImage(barcodeImg, 'PNG', margin, barcodeY, contentWidth, barcodeHeight);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.setTextColor(0, 0, 0);
    pdf.text(code, pageWidth / 2, barcodeY + barcodeHeight + 11, { align: 'center' });

    const parts = code.split('-');
    const labels = ['RIJ', 'SECTIE', 'CASE', 'PALLET'];
    const cells = labels.map((label, i) => ({ label, value: parts[i] !== undefined ? parts[i] : '' }));

    const arrowZoneWidth = 24;
    const gridWidth = contentWidth - arrowZoneWidth;
    const gridTop = barcodeY + barcodeHeight + 20;
    const cellGap = 5;
    const cellCount = 4;
    const cellWidth = (gridWidth - cellGap * (cellCount - 1)) / cellCount;
    const cellHeight = 30;
    const labelStripHeight = 10;

    cells.forEach((cell, i) => {
      const x = margin + i * (cellWidth + cellGap);
      const hasValue = cell.value !== '';

      pdf.setLineWidth(0.7);
      pdf.setDrawColor(0, 0, 0);
      pdf.rect(x, gridTop, cellWidth, cellHeight + labelStripHeight);

      pdf.setTextColor(hasValue ? 0 : 180, hasValue ? 0 : 180, hasValue ? 0 : 180);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(24);
      pdf.text(hasValue ? cell.value : '-', x + cellWidth / 2, gridTop + cellHeight / 2 + 5, { align: 'center' });

      pdf.setFillColor(0, 0, 0);
      pdf.rect(x, gridTop + cellHeight, cellWidth, labelStripHeight, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(cell.label, x + cellWidth / 2, gridTop + cellHeight + labelStripHeight - 3.5, { align: 'center' });
    });

    const arrowCenterX = margin + gridWidth + arrowZoneWidth / 2;
    drawArrow(pdf, arrowCenterX, gridTop, cellHeight + labelStripHeight, arrowDirection);

    pdf.setTextColor(0, 0, 0);
  });

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

export function LocationManager({ activeProfile, isGlobalAdmin = false }: LocationManagerProps) {
  const { t } = useLanguage();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<number[]>([]);
  const [expandedSections, setExpandedSections] = useState<number[]>([]);
  const [expandedCases, setExpandedCases] = useState<number[]>([]);

  // Single create dialog
  const [showNewLocationDialog, setShowNewLocationDialog] = useState(false);
  const [newLocationType, setNewLocationType] = useState<LocationType>('row');
  const [newLocationCode, setNewLocationCode] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Bulk create dialog
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [bulkRowStart, setBulkRowStart] = useState('A');
  const [bulkRowCount, setBulkRowCount] = useState('1');
  const [bulkSectionStart, setBulkSectionStart] = useState('01');
  const [bulkSectionCount, setBulkSectionCount] = useState('5');
  const [bulkCaseStart, setBulkCaseStart] = useState('1');
  const [bulkCaseCount, setBulkCaseCount] = useState('3');
  const [bulkPalletStart, setBulkPalletStart] = useState('P1');
  const [bulkPalletCount, setBulkPalletCount] = useState('0');
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    if (activeProfile) loadLocations();
  }, [activeProfile]);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const data = await api.getLocations(activeProfile);
      setLocations(data.locations || []);
    } catch (error) {
      toast.error(t('errorLoadingLocations'));
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (rowId: number) => {
    setExpandedRows(prev => prev.includes(rowId) ? prev.filter(id => id !== rowId) : [...prev, rowId]);
  };

  const toggleSection = (sectionId: number) => {
    setExpandedSections(prev => prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]);
  };

  const toggleCase = (caseId: number) => {
    setExpandedCases(prev => prev.includes(caseId) ? prev.filter(id => id !== caseId) : [...prev, caseId]);
  };

  const handleToggleActive = async (location: Location) => {
    if (!isGlobalAdmin) return;
    try {
      await api.updateLocation(location.id, { active: !location.active });
      setLocations(prev => prev.map(l => l.id === location.id ? { ...l, active: !l.active } : l));
      toast.success(location.active ? t('locationDeactivated') : t('locationActivated'));
    } catch {
      toast.error(t('errorUpdatingLocation'));
    }
  };

  const handleDeleteLocation = async (location: Location) => {
    if (!isGlobalAdmin) return;
    try {
      await api.deleteLocation(location.id);
      setLocations(prev => prev.filter(l => l.id !== location.id));
      toast.success(t('locationDeleted'));
    } catch (error: any) {
      toast.error(error.message || t('errorDeletingLocation'));
    }
  };

  const handleSetArrow = async (location: Location, arrowDirection: ArrowDirection) => {
    if (!isGlobalAdmin) return;
    try {
      await api.updateLocation(location.id, { arrowDirection });
      setLocations(prev => prev.map(l => l.id === location.id ? { ...l, arrowDirection } : l));
      toast.success(t('arrowUpdated'));
    } catch {
      toast.error(t('errorUpdatingLocation'));
    }
  };

  const handleCreateLocation = async () => {
    if (!newLocationCode.trim()) { toast.error(t('locationCodeRequired')); return; }
    if (newLocationType !== 'row' && !selectedParentId) { toast.error(t('parentLocationRequired')); return; }
    try {
      setSaving(true);
      const newLocation = await api.createLocation({
        installationId: parseInt(activeProfile, 10),
        code: newLocationCode.trim(),
        type: newLocationType,
        parentId: selectedParentId ? parseInt(selectedParentId, 10) : null,
      });
      setLocations(prev => [...prev, newLocation]);
      toast.success(t('locationCreated'));
      setShowNewLocationDialog(false);
      setNewLocationCode('');
      setSelectedParentId('');
      setNewLocationType('row');
    } catch (error: any) {
      toast.error(error.message || t('errorCreatingLocation'));
    } finally {
      setSaving(false);
    }
  };

  // Bulk create logic
  const incrementCode = (code: string, step: number): string => {
    // Prefix + number (e.g. "P1" -> "P2", "P01" -> "P02")
    const prefixMatch = code.match(/^([A-Za-z]+)(\d+)$/);
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      const numPart = prefixMatch[2];
      const num = parseInt(numPart, 10) + step;
      return `${prefix}${String(num).padStart(numPart.length, '0')}`;
    }
    // Numeric
    if (/^\d+$/.test(code)) {
      const num = parseInt(code, 10) + step;
      return String(num).padStart(code.length, '0');
    }
    // Single letter
    if (/^[A-Za-z]$/.test(code)) {
      return String.fromCharCode(code.charCodeAt(0) + step);
    }
    // Fallback
    return code + step;
  };

  const handleBulkCreate = async () => {
    const rowCount = parseInt(bulkRowCount, 10);
    const sectionCount = parseInt(bulkSectionCount, 10);
    const caseCount = parseInt(bulkCaseCount, 10);
    const palletCount = parseInt(bulkPalletCount, 10);

    if (
      isNaN(rowCount) || isNaN(sectionCount) || isNaN(caseCount) || isNaN(palletCount) ||
      rowCount < 1
    ) {
      toast.error('Vul geldige aantallen in');
      return;
    }

    try {
      setBulkSaving(true);
      const installationId = parseInt(activeProfile, 10);

      // Build the entire structure client-side, send as one request
      const rows = [];
      for (let r = 0; r < rowCount; r++) {
        const rowCode = incrementCode(bulkRowStart, r);
        const sections = [];
        for (let s = 0; s < sectionCount; s++) {
          const sectionCode = `${rowCode}-${incrementCode(bulkSectionStart, s)}`;
          const cases = [];
          for (let c = 0; c < caseCount; c++) {
            const caseCode = `${sectionCode}-${incrementCode(bulkCaseStart, c)}`;
            const pallets = [];
            for (let p = 0; p < palletCount; p++) {
              pallets.push({ code: `${caseCode}-${incrementCode(bulkPalletStart, p)}` });
            }
            cases.push({ code: caseCode, pallets });
          }
          sections.push({ code: sectionCode, cases });
        }
        rows.push({ code: rowCode, sections });
      }

      const result = await api.bulkCreateLocations({ installationId, rows });
      setLocations(prev => [...prev, ...result.locations]);
      toast.success(`${result.count} ${t('locationsCreated')}`);
      setShowBulkDialog(false);
    } catch (error: any) {
      toast.error(error.message || t('errorCreatingLocation'));
    } finally {
      setBulkSaving(false);
    }
  };

  const getRowLocations = () => locations.filter(l => l.type === 'row');
  const getSectionsByRow = (rowId: number) => locations.filter(l => l.type === 'section' && l.parentId === rowId);
  const getCasesBySection = (sectionId: number) => locations.filter(l => l.type === 'case' && l.parentId === sectionId);
  const getPalletsByCase = (caseId: number) => locations.filter(l => l.type === 'pallet' && l.parentId === caseId);

  // Bepaalt de pijlrichting voor een label: case = eigen pijl, pallet = pijl van parent-case.
  const resolveArrow = (location: Location): ArrowDirection => {
    if (location.type === 'case') return location.arrowDirection || 'none';
    if (location.type === 'pallet') {
      const parentCase = locations.find(l => l.id === location.parentId);
      return parentCase?.arrowDirection || 'none';
    }
    return 'none';
  };

  const getRowOptions = () => locations.filter(l => l.type === 'row' && l.active);
  const getSectionOptions = () => locations.filter(l => l.type === 'section' && l.active);
  const getCaseOptions = () => locations.filter(l => l.type === 'case' && l.active);

  const filteredRows = getRowLocations().filter(row =>
    row.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTypeIcon = (type: LocationType) => {
    if (type === 'row') return <MapPin className="w-4 h-4 text-indigo-600" />;
    if (type === 'section') return <Package className="w-4 h-4 text-purple-600" />;
    if (type === 'case') return <Barcode className="w-4 h-4 text-pink-600" />;
    return <Boxes className="w-4 h-4 text-amber-600" />;
  };

  const getTypeBadgeColor = (type: LocationType) => {
    if (type === 'row') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (type === 'section') return 'bg-purple-100 text-purple-700 border-purple-200';
    if (type === 'case') return 'bg-pink-100 text-pink-700 border-pink-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
  };

  const getTypeLabel = (type: LocationType) => {
    if (type === 'row') return t('row');
    if (type === 'section') return t('section');
    if (type === 'case') return t('case');
    return t('pallet');
  };

  const LocationActions = ({ location }: { location: Location }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => generateBarcodePDF(location.code, resolveArrow(location))}>
          <Printer className="w-4 h-4 mr-2" />
          {t('printBarcode')}
        </DropdownMenuItem>
        {isGlobalAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleToggleActive(location)}>
              <Power className="w-4 h-4 mr-2" />
              {location.active ? t('deactivate') : t('activate')}
            </DropdownMenuItem>
            {location.type === 'case' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleSetArrow(location, 'up')}>
                  <ArrowUp className="w-4 h-4 mr-2" />
                  {t('arrowUp')}
                  {location.arrowDirection === 'up' && <span className="ml-auto text-indigo-600">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSetArrow(location, 'down')}>
                  <ArrowDown className="w-4 h-4 mr-2" />
                  {t('arrowDown')}
                  {location.arrowDirection === 'down' && <span className="ml-auto text-indigo-600">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSetArrow(location, 'none')}>
                  <Minus className="w-4 h-4 mr-2" />
                  {t('arrowNone')}
                  {(!location.arrowDirection || location.arrowDirection === 'none') && <span className="ml-auto text-indigo-600">✓</span>}
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteLocation(location)}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t('delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Preview for bulk
  const getBulkPreview = () => {
    const rows = parseInt(bulkRowCount, 10) || 0;
    const sections = parseInt(bulkSectionCount, 10) || 0;
    const cases = parseInt(bulkCaseCount, 10) || 0;
    const pallets = parseInt(bulkPalletCount, 10) || 0;
    const total =
      rows +
      rows * sections +
      rows * sections * cases +
      rows * sections * cases * pallets;
    const firstRow = bulkRowStart;
    const lastRow = incrementCode(bulkRowStart, rows - 1);
    const firstSection = `${firstRow}-${bulkSectionStart}`;
    const firstCase = `${firstSection}-${bulkCaseStart}`;
    const firstPallet = `${firstCase}-${bulkPalletStart}`;
    return { total, firstRow, lastRow, firstSection, firstCase, firstPallet, pallets };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            {t('locationManagement')}
          </h1>
          <p className="text-slate-600">{t('locationManagementSubtitle')}</p>
        </div>
        {isGlobalAdmin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowBulkDialog(true)}
              className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            >
              <Layers className="w-4 h-4 mr-2" />
              {t('bulkCreate')}
            </Button>
            <Button
              onClick={() => setShowNewLocationDialog(true)}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('newLocation')}
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
          <CardHeader><CardTitle className="text-sm font-medium text-slate-600">{t('totalRows')}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <p className="text-3xl font-bold text-indigo-600">{getRowLocations().length}</p>
              <MapPin className="w-5 h-5 text-indigo-600 mb-1" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-100 bg-gradient-to-br from-white to-purple-50/30">
          <CardHeader><CardTitle className="text-sm font-medium text-slate-600">{t('totalSections')}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <p className="text-3xl font-bold text-purple-600">{locations.filter(l => l.type === 'section').length}</p>
              <Package className="w-5 h-5 text-purple-600 mb-1" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-pink-100 bg-gradient-to-br from-white to-pink-50/30">
          <CardHeader><CardTitle className="text-sm font-medium text-slate-600">{t('totalCases')}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <p className="text-3xl font-bold text-pink-600">{locations.filter(l => l.type === 'case').length}</p>
              <Barcode className="w-5 h-5 text-pink-600 mb-1" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-100 bg-gradient-to-br from-white to-amber-50/30">
          <CardHeader><CardTitle className="text-sm font-medium text-slate-600">{t('totalPallets')}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <p className="text-3xl font-bold text-amber-600">{locations.filter(l => l.type === 'pallet').length}</p>
              <Boxes className="w-5 h-5 text-amber-600 mb-1" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="border-slate-200">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input placeholder={t('searchLocationCode')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
        </CardContent>
      </Card>

      {/* Locations Tree */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>{t('locationOverview')}</CardTitle>
          <CardDescription>{t('locationOverviewSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              {searchQuery ? t('noLocationsFound') : t('noLocationsYet')}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredRows.map(row => {
                const isRowExpanded = expandedRows.includes(row.id);
                const sections = getSectionsByRow(row.id);
                return (
                  <div key={row.id}>
                    <div className={`flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg group ${!row.active ? 'opacity-50' : ''}`}>
                      <Button variant="ghost" size="sm" onClick={() => toggleRow(row.id)} className="h-8 w-8 p-0">
                        {isRowExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </Button>
                      {getTypeIcon(row.type)}
                      <span className="font-semibold text-slate-900 min-w-[100px]">{row.code}</span>
                      <Badge className={`${getTypeBadgeColor(row.type)} border`}>{t('row')}</Badge>
                      {!row.active && <Badge variant="outline" className="text-slate-400 border-slate-300">{t('inactive')}</Badge>}
                      <div className="ml-auto flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => generateBarcodePDF(row.code)} className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100" title={t('printBarcode')}>
                          <Printer className="w-4 h-4 text-slate-500" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => {
                          const sections = getSectionsByRow(row.id);
                          const palletItems = sections.flatMap(s =>
                            getCasesBySection(s.id).flatMap(c =>
                              getPalletsByCase(c.id).map(p => ({ code: p.code, arrowDirection: resolveArrow(p) }))
                            )
                          );
                          if (palletItems.length === 0) {
                            toast.error('Geen palletplaatsen in deze rij');
                            return;
                          }
                          generateRowBarcodePDF(palletItems);
                        }} className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100" title={t('printAllBarcodes')}>
                          <Layers className="w-4 h-4 text-slate-500" />
                        </Button>
                        {isGlobalAdmin && (
                          <Switch checked={row.active} onCheckedChange={() => handleToggleActive(row)} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                        <LocationActions location={row} />
                      </div>
                    </div>

                    {isRowExpanded && sections.map(section => {
                      const isSectionExpanded = expandedSections.includes(section.id);
                      const cases = getCasesBySection(section.id);
                      return (
                        <div key={section.id}>
                          <div className={`flex items-center gap-3 p-3 pl-12 hover:bg-slate-50 rounded-lg group ${!section.active ? 'opacity-50' : ''}`}>
                            <Button variant="ghost" size="sm" onClick={() => toggleSection(section.id)} className="h-8 w-8 p-0">
                              {isSectionExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </Button>
                            {getTypeIcon(section.type)}
                            <span className="font-medium text-slate-900 min-w-[100px]">{section.code}</span>
                            <Badge className={`${getTypeBadgeColor(section.type)} border`}>{t('section')}</Badge>
                            {!section.active && <Badge variant="outline" className="text-slate-400 border-slate-300">{t('inactive')}</Badge>}
                            <div className="ml-auto flex items-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => generateBarcodePDF(section.code)} className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100" title={t('printBarcode')}>
                                <Printer className="w-4 h-4 text-slate-500" />
                              </Button>
                              {isGlobalAdmin && (
                                <Switch checked={section.active} onCheckedChange={() => handleToggleActive(section)} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                              )}
                              <LocationActions location={section} />
                            </div>
                          </div>

                          {isSectionExpanded && cases.map(caseLocation => {
                            const isCaseExpanded = expandedCases.includes(caseLocation.id);
                            const pallets = getPalletsByCase(caseLocation.id);
                            return (
                              <div key={caseLocation.id}>
                                <div className={`flex items-center gap-3 p-3 pl-20 hover:bg-slate-50 rounded-lg group ${!caseLocation.active ? 'opacity-50' : ''}`}>
                                  {pallets.length > 0 ? (
                                    <Button variant="ghost" size="sm" onClick={() => toggleCase(caseLocation.id)} className="h-8 w-8 p-0">
                                      {isCaseExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    </Button>
                                  ) : (
                                    <div className="w-8" />
                                  )}
                                  {getTypeIcon(caseLocation.type)}
                                  <span className="text-slate-900 min-w-[100px]">{caseLocation.code}</span>
                                  <Badge className={`${getTypeBadgeColor(caseLocation.type)} border`}>{t('case')}</Badge>
                                  {caseLocation.arrowDirection === 'up' && <ArrowUp className="w-4 h-4 text-slate-600" />}
                                  {caseLocation.arrowDirection === 'down' && <ArrowDown className="w-4 h-4 text-slate-600" />}
                                  {!caseLocation.active && <Badge variant="outline" className="text-slate-400 border-slate-300">{t('inactive')}</Badge>}
                                  <div className="ml-auto flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => generateBarcodePDF(caseLocation.code, resolveArrow(caseLocation))} className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100" title={t('printBarcode')}>
                                      <Printer className="w-4 h-4 text-slate-500" />
                                    </Button>
                                    {isGlobalAdmin && (
                                      <Switch checked={caseLocation.active} onCheckedChange={() => handleToggleActive(caseLocation)} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                    <LocationActions location={caseLocation} />
                                  </div>
                                </div>

                                {isCaseExpanded && pallets.map(pallet => (
                                  <div key={pallet.id} className={`flex items-center gap-3 p-3 pl-28 hover:bg-slate-50 rounded-lg group ${!pallet.active ? 'opacity-50' : ''}`}>
                                    <div className="w-8" />
                                    {getTypeIcon(pallet.type)}
                                    <span className="text-slate-900 min-w-[100px]">{pallet.code}</span>
                                    <Badge className={`${getTypeBadgeColor(pallet.type)} border`}>{t('pallet')}</Badge>
                                    {!pallet.active && <Badge variant="outline" className="text-slate-400 border-slate-300">{t('inactive')}</Badge>}
                                    <div className="ml-auto flex items-center gap-2">
                                      <Button variant="ghost" size="sm" onClick={() => generateBarcodePDF(pallet.code, resolveArrow(pallet))} className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100" title={t('printBarcode')}>
                                        <Printer className="w-4 h-4 text-slate-500" />
                                      </Button>
                                      {isGlobalAdmin && (
                                        <Switch checked={pallet.active} onCheckedChange={() => handleToggleActive(pallet)} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                      )}
                                      <LocationActions location={pallet} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Single Create Dialog */}
      <Dialog open={showNewLocationDialog} onOpenChange={setShowNewLocationDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('newLocation')}</DialogTitle>
            <DialogDescription>{t('newLocationSubtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>{t('locationType')}</Label>
              <div className="grid grid-cols-4 gap-2">
                {(['row', 'section', 'case', 'pallet'] as const).map(type => (
                  <Button key={type} variant={newLocationType === type ? 'default' : 'outline'} onClick={() => { setNewLocationType(type); setSelectedParentId(''); }} className={newLocationType === type ? 'bg-gradient-to-r from-indigo-600 to-purple-600' : ''}>
                    {getTypeIcon(type)}<span className="ml-2">{getTypeLabel(type)}</span>
                  </Button>
                ))}
              </div>
            </div>
            {newLocationType === 'section' && (
              <div className="space-y-2">
                <Label>{t('parentRow')} <span className="text-red-500">*</span></Label>
                <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                  <SelectTrigger><SelectValue placeholder={t('selectRow')} /></SelectTrigger>
                  <SelectContent>{getRowOptions().map(row => <SelectItem key={row.id} value={String(row.id)}>{row.code}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {newLocationType === 'case' && (
              <div className="space-y-2">
                <Label>{t('parentSection')} <span className="text-red-500">*</span></Label>
                <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                  <SelectTrigger><SelectValue placeholder={t('selectSection')} /></SelectTrigger>
                  <SelectContent>{getSectionOptions().map(s => <SelectItem key={s.id} value={String(s.id)}>{s.code}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {newLocationType === 'pallet' && (
              <div className="space-y-2">
                <Label>{t('parentCase')} <span className="text-red-500">*</span></Label>
                <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                  <SelectTrigger><SelectValue placeholder={t('selectCase')} /></SelectTrigger>
                  <SelectContent>{getCaseOptions().map(c => <SelectItem key={c.id} value={String(c.id)}>{c.code}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('locationCode')} <span className="text-red-500">*</span></Label>
              <Input placeholder={newLocationType === 'row' ? t('locationCodeRowPlaceholder') : newLocationType === 'section' ? t('locationCodeSectionPlaceholder') : newLocationType === 'case' ? t('locationCodeCasePlaceholder') : t('locationCodePalletPlaceholder')} value={newLocationCode} onChange={(e) => setNewLocationCode(e.target.value.toUpperCase())} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowNewLocationDialog(false)} className="flex-1">{t('cancel')}</Button>
              <Button onClick={handleCreateLocation} disabled={saving} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                {t('create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Create Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('bulkCreate')}</DialogTitle>
            <DialogDescription>{t('bulkCreateSubtitle')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            {/* Rows */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-600" />
                <Label className="text-indigo-700 font-semibold">{t('row')}</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">{t('startCode')}</Label>
                  <Input value={bulkRowStart} onChange={(e) => setBulkRowStart(e.target.value.toUpperCase())} placeholder="A" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">{t('amount')}</Label>
                  <Input type="number" min="1" value={bulkRowCount} onChange={(e) => setBulkRowCount(e.target.value)} placeholder="1" />
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-purple-600" />
                <Label className="text-purple-700 font-semibold">{t('section')} {t('perRow')}</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">{t('startCode')}</Label>
                  <Input value={bulkSectionStart} onChange={(e) => setBulkSectionStart(e.target.value)} placeholder="01" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">{t('amount')}</Label>
                  <Input type="number" min="0" value={bulkSectionCount} onChange={(e) => setBulkSectionCount(e.target.value)} placeholder="5" />
                </div>
              </div>
            </div>

            {/* Cases */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-pink-600" />
                <Label className="text-pink-700 font-semibold">{t('case')} {t('perSection')}</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">{t('startCode')}</Label>
                  <Input value={bulkCaseStart} onChange={(e) => setBulkCaseStart(e.target.value)} placeholder="1" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">{t('amount')}</Label>
                  <Input type="number" min="0" value={bulkCaseCount} onChange={(e) => setBulkCaseCount(e.target.value)} placeholder="3" />
                </div>
              </div>
            </div>

            {/* Pallets (palletplaats) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-amber-600" />
                <Label className="text-amber-700 font-semibold">{t('pallet')} {t('perCase')}</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">{t('startCode')}</Label>
                  <Input value={bulkPalletStart} onChange={(e) => setBulkPalletStart(e.target.value.toUpperCase())} placeholder="P1" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500">{t('amount')}</Label>
                  <Input type="number" min="0" value={bulkPalletCount} onChange={(e) => setBulkPalletCount(e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            {/* Preview */}
            {(() => {
              const preview = getBulkPreview();
              return (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-1 text-sm text-slate-600">
                  <p className="font-medium text-slate-800">{t('preview')}</p>
                  <p>{t('rows')}: <span className="font-mono text-indigo-600">{preview.firstRow}</span> {t('upTo')} <span className="font-mono text-indigo-600">{preview.lastRow}</span></p>
                  <p>{t('exampleSection')}: <span className="font-mono text-purple-600">{preview.firstSection}</span></p>
                  <p>{t('exampleCase')}: <span className="font-mono text-pink-600">{preview.firstCase}</span></p>
                  {preview.pallets > 0 && (
                    <p>{t('examplePallet')}: <span className="font-mono text-amber-600">{preview.firstPallet}</span></p>
                  )}
                  <p className="font-semibold text-slate-800 pt-1">{t('total')}: {preview.total} {t('locationsLower')}</p>
                </div>
              );
            })()}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowBulkDialog(false)} className="flex-1">{t('cancel')}</Button>
              <Button onClick={handleBulkCreate} disabled={bulkSaving} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
                {bulkSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Layers className="w-4 h-4 mr-2" />}
                {t('bulkCreate')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}