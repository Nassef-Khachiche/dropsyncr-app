import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  User,
  Users,
  Tag,
  Warehouse,
  Settings as SettingsIcon,
  Loader2,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

interface SettingsProps {
  activeProfile: string;
}

type SettingsTab = 'warehouse';

const EU_COUNTRIES = [
  { code: 'NL', name: 'Nederland' },
  { code: 'BE', name: 'België' },
  { code: 'DE', name: 'Deutschland' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'ES', name: 'España' },
  { code: 'IT', name: 'Italia' },
  { code: 'PL', name: 'Polska' },
  { code: 'CZ', name: 'Česká republika' },
  { code: 'AT', name: 'Österreich' },
  { code: 'CH', name: 'Schweiz' },
  { code: 'SE', name: 'Sverige' },
  { code: 'DK', name: 'Danmark' },
  { code: 'NO', name: 'Norge' },
  { code: 'FI', name: 'Suomi' },
];

export function Settings({ activeProfile }: SettingsProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<SettingsTab>('warehouse');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [warehouseForm, setWarehouseForm] = useState({
    name: '',
    email: '',
    phone: '',
    street: '',
    houseNumber: '',
    postalCode: '',
    city: '',
    country: 'NL',
  });

  useEffect(() => {
    if (activeProfile) {
      loadWarehouseAddress();
    }
  }, [activeProfile]);

  const loadWarehouseAddress = async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const data = await api.getWarehouseAddress(activeProfile);
      if (data) {
        setWarehouseForm({
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          street: data.street || '',
          houseNumber: data.houseNumber || '',
          postalCode: data.postalCode || '',
          city: data.city || '',
          country: data.country || 'NL',
        });
      }
    } catch (error) {
      console.error('Failed to load warehouse address:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWarehouse = async () => {
    if (!activeProfile) return;
    try {
      setSaving(true);
      await api.upsertWarehouseAddress({
        installationId: parseInt(activeProfile, 10),
        ...warehouseForm,
      });
      toast.success(t('warehouseSaved'));
    } catch (error) {
      console.error('Failed to save warehouse address:', error);
      toast.error(t('warehouseSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'warehouse' as SettingsTab, label: t('warehouseTab'), icon: Warehouse },
  ];

  if (!activeProfile) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            {t('settings')}
          </h2>
          <p className="text-slate-600">{t('settingsSelectInstallation')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          {t('settings')}
        </h2>
        <p className="text-slate-600">{t('settingsSubtitle')}</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-t-lg border-b-2 transition-colors ${
                isActive
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                  : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Warehouse tab */}
      {activeTab === 'warehouse' && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">{t('warehouseTitle')}</CardTitle>
            <p className="text-sm text-slate-500">{t('warehouseSubtitle')}</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Name + Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-slate-700">{t('warehouseName')}</label>
                    <Input
                      placeholder={t('warehouseNamePlaceholder')}
                      value={warehouseForm.name}
                      onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                      className="border-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-slate-700">{t('warehouseEmail')}</label>
                    <Input
                      type="email"
                      placeholder={t('warehouseEmailPlaceholder')}
                      value={warehouseForm.email}
                      onChange={(e) => setWarehouseForm({ ...warehouseForm, email: e.target.value })}
                      className="border-slate-200"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <label className="text-sm text-slate-700">{t('warehousePhone')}</label>
                  <Input
                    placeholder={t('warehousePhonePlaceholder')}
                    value={warehouseForm.phone}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, phone: e.target.value })}
                    className="border-slate-200 max-w-sm"
                  />
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-sm text-slate-500 mb-4">{t('warehouseAddressSection')}</p>

                  {/* Street + House number */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-sm text-slate-700">{t('warehouseStreet')}</label>
                      <Input
                        placeholder={t('warehouseStreetPlaceholder')}
                        value={warehouseForm.street}
                        onChange={(e) => setWarehouseForm({ ...warehouseForm, street: e.target.value })}
                        className="border-slate-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-700">{t('warehouseHouseNumber')}</label>
                      <Input
                        placeholder="12A"
                        value={warehouseForm.houseNumber}
                        onChange={(e) => setWarehouseForm({ ...warehouseForm, houseNumber: e.target.value })}
                        className="border-slate-200"
                      />
                    </div>
                  </div>

                  {/* Postal code + City + Country */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm text-slate-700">{t('warehousePostalCode')}</label>
                      <Input
                        placeholder="1234 AB"
                        value={warehouseForm.postalCode}
                        onChange={(e) => setWarehouseForm({ ...warehouseForm, postalCode: e.target.value })}
                        className="border-slate-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-700">{t('warehouseCity')}</label>
                      <Input
                        placeholder={t('warehouseCityPlaceholder')}
                        value={warehouseForm.city}
                        onChange={(e) => setWarehouseForm({ ...warehouseForm, city: e.target.value })}
                        className="border-slate-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-slate-700">{t('warehouseCountry')}</label>
                      <Select
                        value={warehouseForm.country}
                        onValueChange={(v) => setWarehouseForm({ ...warehouseForm, country: v })}
                      >
                        <SelectTrigger className="border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EU_COUNTRIES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSaveWarehouse}
                    disabled={saving}
                    className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t('save')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}