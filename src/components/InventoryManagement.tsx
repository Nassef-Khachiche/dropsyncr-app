import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
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
  Check
} from 'lucide-react';
import { Checkbox } from './ui/checkbox';

interface InventoryManagementProps {
  activeProfile: string | null;
}

interface InventoryItem {
  id: number;
  selected: boolean;
  foto: string | null;
  artikel_naam: string;
  ean: string;
  locaties: string[];
  klant: string;
  aangemeld: number;
  in_behandeling: number;
  gereserveerd: number;
  beschikbaar: number;
  totaal: number;
}

export function InventoryManagement({ activeProfile }: InventoryManagementProps) {
  const { t } = useLanguage();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [activeStatusFilter, setActiveStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedEan, setCopiedEan] = useState<string | null>(null);

  const selectedCount = items.filter(item => item.selected).length;
  const allSelected = items.length > 0 && items.every(item => item.selected);
  const someSelected = items.some(item => item.selected) && !allSelected;

  const toggleSelectAll = () => {
    setItems(items.map(item => ({ ...item, selected: !allSelected })));
  };

  const toggleSelectItem = (id: number) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  };

  const deselectAll = () => {
    setItems(items.map(item => ({ ...item, selected: false })));
  };

  const copyEan = (ean: string) => {
    navigator.clipboard.writeText(ean);
    setCopiedEan(ean);
    setTimeout(() => setCopiedEan(null), 2000);
  };

  const getClientBadgeStyle = (client: string) => {
    const colors = [
      'bg-purple-100 text-purple-700 border-purple-200',
      'bg-teal-100 text-teal-700 border-teal-200',
      'bg-amber-100 text-amber-700 border-amber-200',
      'bg-blue-100 text-blue-700 border-blue-200',
      'bg-rose-100 text-rose-700 border-rose-200',
    ];
    const index = client.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const statusFilters = [
    { id: 'all', label: t('filterAll') },
    { id: 'aangemeld', label: t('filterRegistered') },
    { id: 'in-behandeling', label: t('filterInProgress') },
    { id: 'gereserveerd', label: t('filterReserved') },
    { id: 'laag-voorraad', label: t('filterLowStock') },
  ];

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          {t('inventoryManagement')}
        </h2>
        <p className="text-slate-600">{t('inventoryManagementSubtitle')}</p>
      </div>

      {/* Topbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1">
          <div className="relative flex-1 max-w-[340px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="text"
              placeholder={t('searchEanOrProduct')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 pl-10 pr-3 border-slate-200 focus:border-indigo-300 focus:ring-indigo-200"
            />
          </div>

          <Select defaultValue="all-clients">
            <SelectTrigger className="h-10 w-auto min-w-[140px] border-slate-200">
              <SelectValue placeholder={t('allClients')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-clients">{t('allClients')}</SelectItem>
            </SelectContent>
          </Select>

          <Select defaultValue="sort">
            <SelectTrigger className="h-10 w-auto min-w-[140px] border-slate-200">
              <SelectValue placeholder={t('sortBy')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sort">{t('sortBy')}</SelectItem>
              <SelectItem value="naam-asc">{t('sortNameAsc')}</SelectItem>
              <SelectItem value="naam-desc">{t('sortNameDesc')}</SelectItem>
              <SelectItem value="voorraad-laag">{t('sortStockLow')}</SelectItem>
              <SelectItem value="voorraad-hoog">{t('sortStockHigh')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button 
          variant="outline"
          className="h-10 px-4 gap-2 border-slate-300 hover:bg-slate-50"
        >
          <ArrowDownToLine className="w-4 h-4" />
          {t('incomingShipments')}
          <Badge className="ml-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white border-0">
            0
          </Badge>
        </Button>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600 mr-2">{t('status')}:</span>
        {statusFilters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveStatusFilter(filter.id)}
            className={`px-4 py-2 rounded-full text-sm transition-all ${
              activeStatusFilter === filter.id
                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Bulk Action Bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 shadow-sm">
          <span className="text-sm text-slate-700 flex-1">
            <strong className="text-indigo-700">{selectedCount}</strong> {t('itemsSelected')}
          </span>
          <Button className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-md">
            <Printer className="w-4 h-4" />
            {t('printEanBarcode')}
          </Button>
          <Button 
            variant="outline"
            onClick={deselectAll}
            className="border-slate-300 hover:bg-white"
          >
            {t('deselectAll')}
          </Button>
        </div>
      )}

      {/* Inventory Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white w-full">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
              <TableHead className="w-[40px] text-center">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                  ref={(el) => {
                    if (el) (el as any).indeterminate = someSelected;
                  }}
                />
              </TableHead>
              <TableHead className="w-[52px]"></TableHead>
              <TableHead>{t('product')}</TableHead>
              <TableHead>{t('locations')}</TableHead>
              <TableHead>{t('client')}</TableHead>
              <TableHead className="text-right">{t('registered')}</TableHead>
              <TableHead className="text-right">{t('inProgress')}</TableHead>
              <TableHead className="text-right">{t('reserved')}</TableHead>
              <TableHead className="text-right">{t('available')}</TableHead>
              <TableHead className="text-right">{t('total')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-slate-400">
                  {t('noItemsFound')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow
                  key={item.id}
                  className={`transition-colors ${
                    item.selected 
                      ? 'bg-indigo-50/50 hover:bg-indigo-50' 
                      : 'hover:bg-slate-50/50'
                  }`}
                >
                  <TableCell className="text-center">
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={() => toggleSelectItem(item.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center">
                      <span className="text-lg">📦</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-slate-900 truncate max-w-[200px]">
                        {item.artikel_naam}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-slate-600">{item.ean}</span>
                        <button onClick={() => copyEan(item.ean)} className="p-1 rounded hover:bg-slate-200 transition-colors">
                          {copiedEan === item.ean ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-400 hover:text-slate-600" />
                          )}
                        </button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.locaties.map((loc, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 border border-slate-200 text-slate-700">
                          {loc}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getClientBadgeStyle(item.klant)}>
                      {item.klant}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm text-slate-600">
                    {item.aangemeld || '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className={item.in_behandeling > 0 ? 'text-orange-600 font-medium' : 'text-slate-600'}>
                      {item.in_behandeling || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className={item.gereserveerd > 0 ? 'text-indigo-600 font-medium' : 'text-slate-600'}>
                      {item.gereserveerd || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    <span className={item.beschikbaar > 5 ? 'text-emerald-600' : 'text-red-600'}>
                      {item.beschikbaar}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-slate-900">
                    {item.totaal}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{items.length} {t('articles')}</span>
      </div>
    </div>
  );
}