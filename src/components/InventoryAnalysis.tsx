import { Card, CardContent } from './ui/card';
import { TrendingUp, Sparkles } from 'lucide-react';

interface InventoryAnalysisProps {
  activeProfile: string;
}

export function InventoryAnalysis({ activeProfile }: InventoryAnalysisProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Voorraadanalyse
        </h2>
        <p className="text-slate-600">Analyseer je voorraad en ontvang slimme aanvuladviezen</p>
      </div>

      {/* Coming Soon Card */}
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50/50 shadow-lg">
        <CardContent className="p-16 text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full blur-xl opacity-50"></div>
              <div className="relative p-6 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full shadow-xl">
                <TrendingUp className="w-12 h-12 text-white" />
              </div>
            </div>
          </div>
          <h3 className="text-3xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-3">
            Coming Soon
          </h3>
          <p className="text-slate-700 text-lg max-w-md mx-auto mb-6">
            We werken hard aan geavanceerde voorraadanalyse tools met AI-gedreven inzichten
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-indigo-600">
            <Sparkles className="w-4 h-4" />
            <span>Binnenkort beschikbaar in Dropsyncr</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
