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
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';

interface Location {
  id: number;
  code: string;
  type: 'row' | 'section' | 'case';
  parentId: number | null;
  active: boolean;
  installationId: number;
}

interface LocationManagerProps {
  activeProfile: string;
  isGlobalAdmin?: boolean;
}

function generateBarcodePDF(code: string) {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, code, {
    format: 'CODE128',
    width: 2,
    height: 80,
    displayValue: true,
    fontSize: 14,
    margin: 10,
  });

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [80, 40] });
  const imgData = canvas.toDataURL('image/png');
  pdf.addImage(imgData, 'PNG', 0, 0, 80, 40);
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

function generateRowBarcodePDF(codes: string[]) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [80, 40] });

  codes.forEach((code, index) => {
    if (index > 0) pdf.addPage();
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, code, {
      format: 'CODE128',
      width: 2,
      height: 80,
      displayValue: true,
      fontSize: 14,
      margin: 10,
    });
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, 80, 40);
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

  // Single create dialog
  const [showNewLocationDialog, setShowNewLocationDialog] = useState(false);
  const [newLocationType, setNewLocationType] = useState<'row' | 'section' | 'case'>('row');
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

    if (isNaN(rowCount) || isNaN(sectionCount) || isNaN(caseCount) || rowCount < 1) {
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
            cases.push({ code: `${sectionCode}-${incrementCode(bulkCaseStart, c)}` });
          }
          sections.push({ code: sectionCode, cases });
        }
        rows.push({ code: rowCode, sections });
      }

      const result = await api.bulkCreateLocations({ installationId, rows });
      setLocations(prev => [...prev, ...result.locations]);
      toast.success(`${result.count} locaties aangemaakt`);
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
  const getRowOptions = () => locations.filter(l => l.type === 'row' && l.active);
  const getSectionOptions = () => locations.filter(l => l.type === 'section' && l.active);

  const filteredRows = getRowLocations().filter(row =>
    row.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTypeIcon = (type: 'row' | 'section' | 'case') => {
    if (type === 'row') return <MapPin className="w-4 h-4 text-indigo-600" />;
    if (type === 'section') return <Package className="w-4 h-4 text-purple-600" />;
    return <Barcode className="w-4 h-4 text-pink-600" />;
  };

  const getTypeBadgeColor = (type: 'row' | 'section' | 'case') => {
    if (type === 'row') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (type === 'section') return 'bg-purple-100 text-purple-700 border-purple-200';
    return 'bg-pink-100 text-pink-700 border-pink-200';
  };

  const LocationActions = ({ location }: { location: Location }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => generateBarcodePDF(location.code)}>
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
    const total = rows + rows * sections + rows * sections * cases;
    const firstRow = bulkRowStart;
    const lastRow = incrementCode(bulkRowStart, rows - 1);
    const firstSection = `${firstRow}-${bulkSectionStart}`;
    const firstCase = `${firstSection}-${bulkCaseStart}`;
    return { total, firstRow, lastRow, firstSection, firstCase };
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
          <CardHeader><CardTitle className="text-sm font-medium text-slate-600">{t('totalRows')}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <p className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{getRowLocations().length}</p>
              <MapPin className="w-5 h-5 text-indigo-600 mb-1" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-100 bg-gradient-to-br from-white to-purple-50/30">
          <CardHeader><CardTitle className="text-sm font-medium text-slate-600">{t('totalSections')}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <p className="text-3xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{locations.filter(l => l.type === 'section').length}</p>
              <Package className="w-5 h-5 text-purple-600 mb-1" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-pink-100 bg-gradient-to-br from-white to-pink-50/30">
          <CardHeader><CardTitle className="text-sm font-medium text-slate-600">{t('totalCases')}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <p className="text-3xl bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">{locations.filter(l => l.type === 'case').length}</p>
              <Barcode className="w-5 h-5 text-pink-600 mb-1" />
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
                          const codes = [row.code, ...sections.flatMap(s => [s.code, ...getCasesBySection(s.id).map(c => c.code)])];
                          generateRowBarcodePDF(codes);
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

                          {isSectionExpanded && cases.map(caseLocation => (
                            <div key={caseLocation.id} className={`flex items-center gap-3 p-3 pl-20 hover:bg-slate-50 rounded-lg group ${!caseLocation.active ? 'opacity-50' : ''}`}>
                              <div className="w-8" />
                              {getTypeIcon(caseLocation.type)}
                              <span className="text-slate-900 min-w-[100px]">{caseLocation.code}</span>
                              <Badge className={`${getTypeBadgeColor(caseLocation.type)} border`}>{t('case')}</Badge>
                              {!caseLocation.active && <Badge variant="outline" className="text-slate-400 border-slate-300">{t('inactive')}</Badge>}
                              <div className="ml-auto flex items-center gap-2">
                                <Button variant="ghost" size="sm" onClick={() => generateBarcodePDF(caseLocation.code)} className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100" title={t('printBarcode')}>
                                  <Printer className="w-4 h-4 text-slate-500" />
                                </Button>
                                {isGlobalAdmin && (
                                  <Switch checked={caseLocation.active} onCheckedChange={() => handleToggleActive(caseLocation)} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                                <LocationActions location={caseLocation} />
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
              <div className="grid grid-cols-3 gap-2">
                {(['row', 'section', 'case'] as const).map(type => (
                  <Button key={type} variant={newLocationType === type ? 'default' : 'outline'} onClick={() => { setNewLocationType(type); setSelectedParentId(''); }} className={newLocationType === type ? 'bg-gradient-to-r from-indigo-600 to-purple-600' : ''}>
                    {getTypeIcon(type)}<span className="ml-2">{t(type)}</span>
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
            <div className="space-y-2">
              <Label>{t('locationCode')} <span className="text-red-500">*</span></Label>
              <Input placeholder={newLocationType === 'row' ? t('locationCodeRowPlaceholder') : newLocationType === 'section' ? t('locationCodeSectionPlaceholder') : t('locationCodeCasePlaceholder')} value={newLocationCode} onChange={(e) => setNewLocationCode(e.target.value.toUpperCase())} />
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
        <DialogContent className="sm:max-w-[560px]">
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

            {/* Preview */}
            {(() => {
              const preview = getBulkPreview();
              return (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-1 text-sm text-slate-600">
                  <p className="font-medium text-slate-800">{t('preview')}</p>
                  <p>Rijen: <span className="font-mono text-indigo-600">{preview.firstRow}</span> t/m <span className="font-mono text-indigo-600">{preview.lastRow}</span></p>
                  <p>Voorbeeld sectie: <span className="font-mono text-purple-600">{preview.firstSection}</span></p>
                  <p>Voorbeeld case: <span className="font-mono text-pink-600">{preview.firstCase}</span></p>
                  <p className="font-semibold text-slate-800 pt-1">Totaal: {preview.total} locaties</p>
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