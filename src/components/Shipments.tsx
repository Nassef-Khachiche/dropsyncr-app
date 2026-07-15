import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Search, ExternalLink, Loader2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface ShipmentsProps {
  activeProfile: string | null;
}

export function Shipments({ activeProfile }: ShipmentsProps) {
  const SHIPMENTS_PER_PAGE = 50;

  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalShipments, setTotalShipments] = useState(0);

  const loadShipments = async () => {
    try {
      setLoading(true);
      const data = await api.getShipments({
        installationId: activeProfile && activeProfile !== 'all' ? activeProfile : undefined,
        search: searchQuery || undefined,
        page: currentPage,
        limit: SHIPMENTS_PER_PAGE,
      });

      setShipments(data.shipments || []);
      setTotalShipments(Number(data.pagination?.total) || 0);
      setTotalPages(Math.max(1, Number(data.pagination?.pages) || 1));
    } catch (error) {
      console.error('Failed to load shipments:', error);
      setShipments([]);
      setTotalShipments(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeProfile) return;
    loadShipments();
  }, [activeProfile, currentPage, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeProfile, searchQuery]);

  const resolveCarrierLabel = (shipment: any) => {
    if (shipment?.carrier?.contractName) {
      return `${shipment.carrier.contractName} (${String(shipment.carrier.carrierType || '').toUpperCase()})`;
    }

    if (shipment?.order?.shippingMethod) {
      return String(shipment.order.shippingMethod);
    }

    return 'Bol.com / VVB';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Shipments
        </h2>
        <p className="text-slate-600">Bekijk en zoek alle recent aangemaakte shipments en open labels direct</p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Shipment Overzicht</CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-slate-200 shadow-sm"
              onClick={loadShipments}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Vernieuwen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-center mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Zoek op ordernummer, klant, tracking of contract..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-slate-200 shadow-sm"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead>Datum</TableHead>
                  <TableHead>Ordernummer</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Land</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : shipments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                      Geen shipments gevonden
                    </TableCell>
                  </TableRow>
                ) : (
                  shipments.map((shipment) => (
                    <TableRow key={shipment.id} className="hover:bg-slate-50/50">
                      <TableCell className="text-sm text-slate-600">
                        {shipment.createdAt ? new Date(shipment.createdAt).toLocaleString('nl-NL') : '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{shipment.order?.orderNumber || '-'}</TableCell>
                      <TableCell>{shipment.order?.customerName || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50">
                          {shipment.order?.storeName || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>{shipment.order?.country || '-'}</TableCell>
                      <TableCell className="text-sm text-slate-700">{resolveCarrierLabel(shipment)}</TableCell>
                      <TableCell className="font-mono text-sm">{shipment.order?.supplierTracking || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50">
                          {shipment.status || 'generated'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 border-slate-200"
                          onClick={() => {
                            if (!shipment.labelUrl) return;
                            window.open(shipment.labelUrl, '_blank', 'noopener,noreferrer');
                          }}
                          disabled={!shipment.labelUrl}
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open label
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-slate-600">{totalShipments} shipments gevonden</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-200"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={loading || currentPage <= 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Vorige
              </Button>
              <span className="text-sm text-slate-600 px-2">Pagina {currentPage} van {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-200"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={loading || currentPage >= totalPages}
              >
                Volgende
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
