import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Construction } from 'lucide-react';

interface PlaceholderViewProps {
  title: string;
  description: string;
  icon?: any;
}

export function PlaceholderView({ title, description, icon: Icon = Construction }: PlaceholderViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          {title}
        </h2>
        <p className="text-slate-600">{description}</p>
      </div>
      
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="py-24">
          <div className="text-center">
            <div className="inline-flex p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl mb-4">
              <Icon className="w-12 h-12 text-indigo-600" />
            </div>
            <h3 className="text-xl text-slate-900 mb-2">Binnenkort beschikbaar</h3>
            <p className="text-slate-600 max-w-md mx-auto">
              Deze functionaliteit wordt momenteel ontwikkeld en komt binnenkort beschikbaar in Dropsyncr.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
