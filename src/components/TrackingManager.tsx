import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
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
  Link as LinkIcon, 
  CheckCircle2, 
  AlertCircle,
  QrCode,
  Plus,
} from 'lucide-react';

interface TrackingManagerProps {
  activeProfile: string | null;
}

export function TrackingManager({ activeProfile }: TrackingManagerProps) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-indigo-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-600">Totaal Trackings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">0</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-emerald-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-600">Gekoppeld</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">0</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-gradient-to-br from-white to-orange-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-600">Wacht op Koppeling</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">0</div>
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
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                    Geen tracking codes gevonden
                  </TableCell>
                </TableRow>
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
                </p>
                <p className="text-sm text-slate-600 mt-2">
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}