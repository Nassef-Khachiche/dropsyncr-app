import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Administrators } from './Administrators';
import { Installations } from './Installations';
import { Shield, Building2 } from 'lucide-react';

interface AdministrativeProps {
  activeProfile: string;
}

export function Administrative({ activeProfile }: AdministrativeProps) {
  const [activeTab, setActiveTab] = useState('administrators');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Administratief
        </h2>
        <p className="text-slate-600">Beheer administrators en installaties</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="administrators" className="gap-2">
            <Shield className="w-4 h-4" />
            Administrators
          </TabsTrigger>
          <TabsTrigger value="installations" className="gap-2">
            <Building2 className="w-4 h-4" />
            Installaties
          </TabsTrigger>
        </TabsList>

        <TabsContent value="administrators" className="mt-6">
          <Administrators />
        </TabsContent>

        <TabsContent value="installations" className="mt-6">
          <Installations />
        </TabsContent>
      </Tabs>
    </div>
  );
}

