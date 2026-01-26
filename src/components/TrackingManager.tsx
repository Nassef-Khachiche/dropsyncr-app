import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from './ui/table';
import { 
  Mail, 
  Upload, 
  Link as LinkIcon, 
  CheckCircle2, 
  AlertCircle,
  QrCode,
  Plus,
  Sparkles
} from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';
import { toast } from 'sonner@2.0.3';

interface TrackingManagerProps {
  activeProfile: string;
}

// Mock tracking data
const mockTrackings = [
  {
    id: 1,
    trackingCode: 'TBA123456789012',
    supplier: 'Amazon',
    orderNumber: 'BOL-2024-00145',
    customerName: 'Jan Bakker',
    dateAdded: '2024-10-12',
    status: 'linked',
    source: 'email'
  },
  {
    id: 2,
    trackingCode: 'LP987654321NL',
    supplier: 'AliExpress',
    orderNumber: 'BOL-2024-00146',
    customerName: 'Marie Peeters',
    dateAdded: '2024-10-13',
    status: 'linked',
    source: 'manual'
  },
  {
    id: 3,
    trackingCode: 'TBA234567890123',
    supplier: 'Amazon',
    orderNumber: null,
    customerName: null,
    dateAdded: '2024-10-14',
    status: 'pending',
    source: 'email'
  },
  {
    id: 4,
    trackingCode: 'CJ123456789012NL',
    supplier: 'CJ Dropshipping',
    orderNumber: null,
    customerName: null,
    dateAdded: '2024-10-14',
    status: 'pending',
    source: 'email'
  },
];

export function TrackingManager({ activeProfile }: TrackingManagerProps) {
  const [bulkTracking, setBulkTracking] = useState('');
  const [manualTracking, setManualTracking] = useState('');

  const handleBulkAdd = () => {
    if (!bulkTracking.trim()) return;
    
    const codes = bulkTracking.split('\n').filter(code => code.trim());
    toast.success(`${codes.length} tracking code(s) toegevoegd`);
    setBulkTracking('');
  };

  const handleManualAdd = () => {
    if (!manualTracking.trim()) return;
    
    toast.success('Tracking code toegevoegd');
    setManualTracking('');
  };

  const linkedCount = mockTrackings.filter(t => t.status === 'linked').length;
  const pendingCount = mockTrackings.filter(t => t.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-indigo-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-600">Totaal Trackings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{mockTrackings.length}</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-emerald-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-600">Gekoppeld</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{linkedCount}</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-orange-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-600">Wacht op Koppeling</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">{pendingCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Add Tracking Codes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Email Import */}
        <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-purple-50/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                <Mail className="w-4 h-4 text-white" />
              </div>
              Email Import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-purple-200 bg-purple-50/50">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <AlertDescription className="text-slate-700">
                Automatische email parsing is alleen beschikbaar met backend integratie.
                Deze functie scant je inbox voor tracking emails van leveranciers.
              </AlertDescription>
            </Alert>
            <Button className="w-full gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/20" disabled>
              <Mail className="w-4 h-4" />
              Scan Inbox voor Trackings
            </Button>
            <p className="text-xs text-slate-500 text-center">
              Vereist Supabase backend configuratie
            </p>
          </CardContent>
        </Card>

        {/* Manual Add */}
        <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-indigo-50/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg">
                <Plus className="w-4 h-4 text-white" />
              </div>
              Handmatig Toevoegen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-700">Enkele Tracking Code</label>
              <div className="flex gap-2">
                <Input
                  placeholder="TBA123456789012"
                  value={manualTracking}
                  onChange={(e) => setManualTracking(e.target.value)}
                  className="border-slate-200 shadow-sm"
                />
                <Button onClick={handleManualAdd} className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-sm">
                  <Plus className="w-4 h-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-700">Bulk Import (één per regel)</label>
              <Textarea
                placeholder="TBA123456789012&#10;LP987654321NL&#10;CJ123456789012NL"
                value={bulkTracking}
                onChange={(e) => setBulkTracking(e.target.value)}
                rows={4}
                className="border-slate-200 shadow-sm"
              />
              <Button onClick={handleBulkAdd} className="w-full gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-sm">
                <Upload className="w-4 h-4" />
                Bulk Toevoegen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tracking Codes Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle>Tracking Codes Overzicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead>Tracking Code</TableHead>
                  <TableHead>Leverancier</TableHead>
                  <TableHead>Ordernummer</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Bron</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockTrackings.map((tracking) => (
                  <TableRow key={tracking.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-mono text-sm">{tracking.trackingCode}</TableCell>
                    <TableCell>{tracking.supplier}</TableCell>
                    <TableCell>
                      {tracking.orderNumber ? (
                        <span className="text-sm">{tracking.orderNumber}</span>
                      ) : (
                        <span className="text-slate-400 text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {tracking.customerName ? (
                        <span className="text-sm">{tracking.customerName}</span>
                      ) : (
                        <span className="text-slate-400 text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {new Date(tracking.dateAdded).toLocaleDateString('nl-NL')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs border-slate-300 bg-slate-50">
                        {tracking.source === 'email' ? <Mail className="w-3 h-3 mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                        {tracking.source === 'email' ? 'Email' : 'Handmatig'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tracking.status === 'linked' ? (
                        <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 border-0 gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Gekoppeld
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Wacht op Order
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {tracking.status === 'pending' && (
                        <Button variant="outline" size="sm" className="gap-2 border-slate-200 shadow-sm hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300">
                          <LinkIcon className="w-4 h-4" />
                          Koppel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-6 p-5 bg-gradient-to-br from-indigo-50 to-purple-50/50 rounded-xl border border-indigo-200/60">
            <div className="flex items-start gap-4">
              <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg shadow-sm">
                <QrCode className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-900">
                  <strong>Barcode Scanning:</strong> Wanneer pakketten binnenkomen, scan je de tracking barcode 
                  op het pakket. Het systeem zoekt automatisch de bijbehorende klantorder en genereert direct een verzendlabel.
                </p>
                <p className="text-sm text-slate-600 mt-2">
                  Dit gebeurt in de "Labels" sectie waar je direct labels kunt printen na het scannen.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
