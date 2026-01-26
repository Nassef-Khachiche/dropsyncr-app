import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from './ui/table';
import { 
  Package, 
  Search,
  Filter,
  MoreVertical,
  Plus,
  RefreshCw,
  Upload,
  Download,
  Edit
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface ProductOverviewProps {
  activeProfile: string;
}

interface Product {
  id: number;
  sku: string;
  ean: string;
  name: string;
  image: string;
  brand: string;
  price: number;
  totalStock: number;
  availableStock: number;
  fulfillmentStock: number;
  locations: string[];
  salesPerMonth: number;
  internalRef?: string;
  bundled: boolean;
  archived: boolean;
}

const mockProducts: Product[] = [
  {
    id: 1,
    sku: 'ZAL-EMR-001',
    ean: '8721085278871',
    name: 'EMR Pen - Voor reMarkable 2 & Tablets - Stylus',
    image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=200',
    brand: 'Zaltino',
    price: 39.95,
    totalStock: 54,
    availableStock: 48,
    fulfillmentStock: 50,
    locations: ['A-01-02', 'B-03-01'],
    salesPerMonth: 12,
    bundled: false,
    archived: false
  },
  {
    id: 2,
    sku: 'ZAL-WCH-002',
    ean: '8721085279144',
    name: 'Zaltino - Horloge met Trilwekker - 15 Alarmen - Zwart',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200',
    brand: 'Zaltino',
    price: 29.95,
    totalStock: 182,
    availableStock: 175,
    fulfillmentStock: 180,
    locations: ['A-02-03', 'C-01-05'],
    salesPerMonth: 28,
    bundled: false,
    archived: false
  },
  {
    id: 3,
    sku: 'ZAL-LKB-003',
    ean: '8721085279212',
    name: 'Zaltino - Lekbak - Olie Opvangen - Waterdrichte lekbak',
    image: 'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?w=200',
    brand: 'Zaltino',
    price: 39.95,
    totalStock: 41,
    availableStock: 38,
    fulfillmentStock: 40,
    locations: ['B-01-02'],
    salesPerMonth: 8,
    bundled: false,
    archived: false
  },
  {
    id: 4,
    sku: 'ZAL-PAR-004',
    ean: '8721085070167',
    name: 'Balkonparasolvoet Kunststof Vulbaar - Parasolvoet in Antraciet',
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=200',
    brand: 'Zaltino',
    price: 19.99,
    totalStock: 24,
    availableStock: 20,
    fulfillmentStock: 22,
    locations: ['C-02-01'],
    salesPerMonth: 15,
    bundled: false,
    archived: false
  },
  {
    id: 5,
    sku: 'ZAL-SER-005',
    ean: '8721085279168',
    name: 'Zaltino - Steelgradies verwijderkit - Serum - Anti-aging',
    image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=200',
    brand: 'Zaltino',
    price: 32.95,
    totalStock: 94,
    availableStock: 88,
    fulfillmentStock: 90,
    locations: ['A-03-02', 'B-02-04'],
    salesPerMonth: 22,
    bundled: false,
    archived: false
  },
  {
    id: 6,
    sku: 'LUX-OIL-006',
    ean: '9785258013270',
    name: 'Oliefles - met Schenktuit - 300ml - Luxe glas olijfolie',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=200',
    brand: 'Luxe',
    price: 12.95,
    totalStock: 69,
    availableStock: 65,
    fulfillmentStock: 68,
    locations: ['A-01-05'],
    salesPerMonth: 18,
    bundled: false,
    archived: false
  },
  {
    id: 7,
    sku: 'BDL-START-001',
    ean: '8721085279999',
    name: 'Starter Bundle - Stylus + Horloge',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200',
    brand: 'Zaltino',
    price: 59.90,
    totalStock: 15,
    availableStock: 15,
    fulfillmentStock: 15,
    locations: ['BUNDLE'],
    salesPerMonth: 5,
    bundled: true,
    archived: false
  },
  {
    id: 8,
    sku: 'OLD-PROD-001',
    ean: '8721085270000',
    name: 'Oude Stylus - Discontinued',
    image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=200',
    brand: 'Zaltino',
    price: 24.95,
    totalStock: 0,
    availableStock: 0,
    fulfillmentStock: 0,
    locations: [],
    salesPerMonth: 0,
    bundled: false,
    archived: true
  },
];

const filterOptions = [
  { label: 'Actieve lijst', count: 130, active: true },
  { label: 'Gearchiveerd', count: 8 },
  { label: 'Bundels', count: 5 },
  { label: 'Niet-bundels', count: 125 },
  { label: 'Voorraad = 0', count: 12 },
  { label: 'Voorraad > 0', count: 118 },
  { label: 'Gevlagde producten', count: 3 },
  { label: 'Gesynchroniseerde voorraad', count: 115 },
];

export function ProductOverview({ activeProfile }: ProductOverviewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('Actieve lijst');
  const [sortBy, setSortBy] = useState('most-sold');
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [itemsPerPage, setItemsPerPage] = useState('50');

  const handleSelectAll = () => {
    if (selectedProducts.length === mockProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(mockProducts.map(p => p.id));
    }
  };

  const handleSelectProduct = (id: number) => {
    if (selectedProducts.includes(id)) {
      setSelectedProducts(selectedProducts.filter(p => p !== id));
    } else {
      setSelectedProducts([...selectedProducts, id]);
    }
  };

  const handleSync = () => {
    toast.success('Producten synchroniseren...', {
      description: 'Alle producten worden gesynchroniseerd met je stores'
    });
  };

  const handleImport = () => {
    toast.info('Import wizard openen...');
  };

  const handleExport = () => {
    toast.success('Exporteren naar Excel...', {
      description: 'Je productlijst wordt geëxporteerd'
    });
  };

  const handleBulkCorrection = () => {
    if (selectedProducts.length === 0) {
      toast.error('Selecteer minimaal één product');
      return;
    }
    toast.info(`Bulk voorraad correctie voor ${selectedProducts.length} product(en)`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Artikelen
        </h2>
        <p className="text-slate-600">Beheer eenvoudig je assortiment</p>
      </div>

      {/* Action Buttons */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Button className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-md">
              <Plus className="w-4 h-4" />
              Nieuw product
            </Button>
            <Button variant="outline" className="gap-2 border-slate-200" onClick={handleSync}>
              <RefreshCw className="w-4 h-4" />
              Synchroniseer
            </Button>
            <Button variant="outline" className="gap-2 border-slate-200" onClick={handleImport}>
              <Upload className="w-4 h-4" />
              Importeren
            </Button>
            <Button variant="outline" className="gap-2 border-slate-200" onClick={handleExport}>
              <Download className="w-4 h-4" />
              Exporteer
            </Button>
            <Button 
              variant="outline" 
              className="gap-2 border-slate-200" 
              onClick={handleBulkCorrection}
              disabled={selectedProducts.length === 0}
            >
              <Edit className="w-4 h-4" />
              Bulk voorraad correctie
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((filter) => (
          <button
            key={filter.label}
            onClick={() => setSelectedFilter(filter.label)}
            className={`px-4 py-2 rounded-lg text-sm transition-all ${
              selectedFilter === filter.label
                ? filter.active 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md'
                  : 'bg-indigo-500 text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
            }`}
          >
            {filter.label} ({filter.count})
          </button>
        ))}
      </div>

      {/* Search and Controls */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Select value={itemsPerPage} onValueChange={setItemsPerPage}>
              <SelectTrigger className="w-[100px] border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-slate-600">Items weergeven</span>
            
            <div className="flex-1 relative ml-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Doorzoek alles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 border-slate-200"
              />
            </div>

            <Button variant="outline" size="sm" className="gap-2 border-slate-200">
              <Package className="w-4 h-4" />
              Kolommen
            </Button>
            <Button variant="outline" size="sm" className="gap-2 border-slate-200">
              Select
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {mockProducts.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Package className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-600 mb-1">Geen items om weer te geven</p>
              <p className="text-sm text-slate-500">Geen items weergeven beschikbaar in de tabel</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedProducts.length === mockProducts.length}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-20">Afbeelding</TableHead>
                    <TableHead className="min-w-[300px]">Titel</TableHead>
                    <TableHead>Geen locatie</TableHead>
                    <TableHead>Voorraadlocaties</TableHead>
                    <TableHead className="text-center">Voorraad fulfillment</TableHead>
                    <TableHead className="text-center">Beschikbare voorraad</TableHead>
                    <TableHead className="text-center">Totale voorraad</TableHead>
                    <TableHead className="text-center">Verkoop per maand</TableHead>
                    <TableHead>Niet op voorraad in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockProducts.map((product) => (
                    <TableRow key={product.id} className="hover:bg-slate-50/50">
                      <TableCell>
                        <Checkbox
                          checked={selectedProducts.includes(product.id)}
                          onCheckedChange={() => handleSelectProduct(product.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden">
                          <img 
                            src={product.image} 
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm text-slate-900 line-clamp-2">{product.name}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>SKU: {product.sku}</span>
                            <span>•</span>
                            <span>EAN: {product.ean}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm text-slate-900">€ {product.price.toFixed(2)}</span>
                            {product.bundled && (
                              <Badge variant="outline" className="text-xs border-purple-300 bg-purple-50 text-purple-700">
                                Bundle
                              </Badge>
                            )}
                            {product.archived && (
                              <Badge variant="outline" className="text-xs border-slate-300 bg-slate-50 text-slate-600">
                                Gearchiveerd
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">--</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {product.locations.length > 0 ? (
                            product.locations.map((loc, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs border-indigo-300 bg-indigo-50 text-indigo-700">
                                {loc}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-slate-400">Geen locatie</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm ${product.fulfillmentStock > 0 ? 'text-slate-900' : 'text-red-600'}`}>
                          {product.fulfillmentStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm ${product.availableStock > 0 ? 'text-slate-900' : 'text-red-600'}`}>
                          {product.availableStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-sm ${product.totalStock > 0 ? 'text-slate-900' : 'text-red-600'}`}>
                          {product.totalStock}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-slate-900">{product.salesPerMonth}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">--</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination Info */}
      <div className="text-sm text-slate-600">
        Zoek ("") | Pagina 1 van 3
      </div>

      {/* Info Card */}
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl shadow-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="text-slate-900 mb-2">Automatische Product Sync</h4>
              <p className="text-sm text-slate-700">
                Alle producten van je gekoppelde stores worden automatisch geïmporteerd en gesynchroniseerd. 
                Wijzigingen in je webshop worden direct doorgevoerd in Dropsyncr.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
