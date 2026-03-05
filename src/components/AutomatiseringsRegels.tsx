import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
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
  TableRow,
} from './ui/table';
import { Plus, Workflow, Edit, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';

interface AutomatiseringsRegelsProps {
  activeProfile: string | null;
}

interface AutomationRule {
  id: number;
  installationId: number;
  installationName?: string;
  name: string;
  countryCode: string;
  carrierType: string;
  priority: number;
  active: boolean;
}

interface InstallationOption {
  id: number;
  name: string;
}

interface CarrierContract {
  id: number;
  installationId: number;
  carrierType: string;
  contractName: string;
  active: boolean;
}

interface CarrierSelectionOption {
  value: string;
  label: string;
  logoUrl: string | null;
}

interface RuleFormData {
  name: string;
  countryCode: string;
  carrierType: string;
  priority: string;
  installationId: string;
  active: boolean;
}

const postnlLogo = new URL('../assets/postnl-logo.png', import.meta.url).href;
const dhlLogo = new URL('../assets/dhl-logo.png', import.meta.url).href;
const dpdLogo = new URL('../assets/dpd-logo.png', import.meta.url).href;
const bpostLogo = new URL('../assets/bpost-logo.png', import.meta.url).href;
const wegrowLogo = new URL('../assets/wegrow-logo.jpg', import.meta.url).href;

const carrierLogoMap: Record<string, string | null> = {
  postnl: postnlLogo,
  dhl: dhlLogo,
  dpd: dpdLogo,
  bpost: bpostLogo,
  wegrow: wegrowLogo,
};

const defaultCountryOptions = [
  'NL', 'BE', 'DE', 'FR', 'LU', 'AT', 'ES', 'IT', 'PT', 'IE',
  'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'HR', 'SI', 'DK', 'SE',
  'NO', 'FI', 'EE', 'LV', 'LT', 'CH', 'GB', 'US', 'CA', 'AU',
];

const countryAliases: Record<string, string> = {
  NETHERLANDS: 'NL',
  NEDERLAND: 'NL',
  BELGIUM: 'BE',
  BELGIE: 'BE',
  BELGIË: 'BE',
  GERMANY: 'DE',
  DEUTSCHLAND: 'DE',
  FRANCE: 'FR',
  LUXEMBOURG: 'LU',
  AUSTRIA: 'AT',
  OOSTENRIJK: 'AT',
  SPAIN: 'ES',
  SPANJE: 'ES',
  ITALY: 'IT',
  ITALIE: 'IT',
  PORTUGAL: 'PT',
  IRELAND: 'IE',
  IERLAND: 'IE',
  POLAND: 'PL',
  POLEN: 'PL',
  CZECHIA: 'CZ',
  CZECH_REPUBLIC: 'CZ',
  SLOVAKIA: 'SK',
  HUNGARY: 'HU',
  ROMANIA: 'RO',
  BULGARIA: 'BG',
  CROATIA: 'HR',
  SLOVENIA: 'SI',
  DENMARK: 'DK',
  DENEMARKEN: 'DK',
  SWEDEN: 'SE',
  ZWEDEN: 'SE',
  NORWAY: 'NO',
  NOORWEGEN: 'NO',
  FINLAND: 'FI',
  ESTONIA: 'EE',
  LATVIA: 'LV',
  LITHUANIA: 'LT',
  SWITZERLAND: 'CH',
  ZWITSERLAND: 'CH',
  UNITED_KINGDOM: 'GB',
  UK: 'GB',
  GREAT_BRITAIN: 'GB',
  UNITED_STATES: 'US',
  USA: 'US',
  CANADA: 'CA',
  AUSTRALIA: 'AU',
};

export function AutomatiseringsRegels({ activeProfile }: AutomatiseringsRegelsProps) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [installations, setInstallations] = useState<InstallationOption[]>([]);
  const [carrierOptionsByInstallation, setCarrierOptionsByInstallation] = useState<Record<number, CarrierSelectionOption[]>>({});
  const [formData, setFormData] = useState<RuleFormData>({
    name: '',
    countryCode: '',
    carrierType: '',
    priority: '100',
    installationId: '',
    active: true,
  });

  const isAllStoresMode = activeProfile === 'all';

  useEffect(() => {
    if (activeProfile) {
      loadRules();
    }
  }, [activeProfile]);

  useEffect(() => {
    if (isAllStoresMode) {
      loadInstallations();
    }
  }, [isAllStoresMode]);

  useEffect(() => {
    if (!activeProfile) return;

    const selectedInstallationId = isAllStoresMode
      ? parseInt(formData.installationId, 10)
      : parseInt(activeProfile, 10);

    if (!Number.isInteger(selectedInstallationId)) return;

    void loadCarrierOptionsForInstallation(selectedInstallationId);
  }, [activeProfile, isAllStoresMode, formData.installationId]);

  const loadRules = async () => {
    if (!activeProfile) {
      setRules([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await api.getAutomationRules({
        installationId: activeProfile,
        userScoped: activeProfile === 'all',
      });

      const mappedRules: AutomationRule[] = response.rules.map((rule: any) => ({
        id: rule.id,
        installationId: rule.installationId,
        installationName: rule.installation?.name,
        name: rule.name,
        countryCode: rule.countryCode,
        carrierType: rule.carrierType,
        priority: rule.priority,
        active: rule.active,
      }));

      setRules(mappedRules);

      const uniqueInstallationIds = Array.from(new Set(mappedRules.map((rule) => rule.installationId)));
      await Promise.all(uniqueInstallationIds.map((installationId) => loadCarrierOptionsForInstallation(installationId)));
    } catch (error: any) {
      console.error('Failed to load automation rules:', error);
      toast.error(error.message || 'Kon automatiseringsregels niet laden');
    } finally {
      setLoading(false);
    }
  };

  const loadInstallations = async () => {
    try {
      const data = await api.getInstallations();
      const mapped: InstallationOption[] = (data || []).map((installation: any) => ({
        id: installation.id,
        name: installation.name,
      }));

      setInstallations(mapped);

      if (!formData.installationId && mapped.length > 0) {
        setFormData((previousData) => ({
          ...previousData,
          installationId: String(mapped[0].id),
        }));
      }
    } catch (error: any) {
      console.error('Failed to load installations:', error);
      toast.error('Kon installaties niet laden');
    }
  };

  const activeCount = useMemo(() => rules.filter((rule) => rule.active).length, [rules]);

  const loadCarrierOptionsForInstallation = async (installationId: number) => {
    if (!Number.isInteger(installationId) || installationId <= 0) return;
    if (carrierOptionsByInstallation[installationId]) return;

    try {
      const contracts: CarrierContract[] = await api.getCarriers(String(installationId));
      const activeContracts = (contracts || []).filter((contract) => contract.active);

      const selectionOptions: CarrierSelectionOption[] = activeContracts.flatMap((contract) => {
        const normalizedCarrierType = String(contract.carrierType || '').trim().toLowerCase();
        const normalizedContractName = String(contract.contractName || '').trim();
        if (!normalizedContractName) return [];

        if (normalizedCarrierType === 'wegrow') {
          return [
            {
              value: `${normalizedContractName} | wegrow-dhl`,
              label: `${normalizedContractName} · WeGrow DHL`,
              logoUrl: dhlLogo,
            },
            {
              value: `${normalizedContractName} | wegrow-postnl`,
              label: `${normalizedContractName} · WeGrow PostNL`,
              logoUrl: postnlLogo,
            },
            {
              value: `${normalizedContractName} | wegrow-bpost`,
              label: `${normalizedContractName} · WeGrow Bpost`,
              logoUrl: bpostLogo,
            },
          ];
        }

        return [{
          value: `${normalizedContractName} | ${normalizedCarrierType.toUpperCase()}`,
          label: normalizedContractName,
          logoUrl: carrierLogoMap[normalizedCarrierType] || null,
        }];
      });

      setCarrierOptionsByInstallation((previousMap) => ({
        ...previousMap,
        [installationId]: selectionOptions,
      }));
    } catch (error) {
      console.error('Failed to load carrier options:', error);
    }
  };

  const getCarrierPresentation = (carrierValue: string, installationId: number) => {
    const normalizedValue = String(carrierValue || '').trim();
    const installationOptions = carrierOptionsByInstallation[installationId] || [];
    const matchingOption = installationOptions.find((option) => option.value === normalizedValue);

    if (matchingOption) {
      return {
        label: matchingOption.label,
        logoUrl: matchingOption.logoUrl,
      };
    }

    const [contractPart = '', servicePart = ''] = normalizedValue.split('|').map((segment) => segment.trim());
    const normalizedService = servicePart.toLowerCase();

    if (normalizedService.includes('wegrow-dhl')) {
      return { label: `${contractPart || 'WeGrow'} · WeGrow DHL`, logoUrl: dhlLogo };
    }
    if (normalizedService.includes('wegrow-postnl')) {
      return { label: `${contractPart || 'WeGrow'} · WeGrow PostNL`, logoUrl: postnlLogo };
    }
    if (normalizedService.includes('wegrow-bpost')) {
      return { label: `${contractPart || 'WeGrow'} · WeGrow Bpost`, logoUrl: bpostLogo };
    }
    if (normalizedService.includes('postnl')) {
      return { label: contractPart || 'PostNL', logoUrl: postnlLogo };
    }
    if (normalizedService.includes('dhl')) {
      return { label: contractPart || 'DHL', logoUrl: dhlLogo };
    }
    if (normalizedService.includes('dpd')) {
      return { label: contractPart || 'DPD', logoUrl: dpdLogo };
    }
    if (normalizedService.includes('bpost')) {
      return { label: contractPart || 'Bpost', logoUrl: bpostLogo };
    }
    if (normalizedService.includes('wegrow')) {
      return { label: contractPart || 'WeGrow', logoUrl: wegrowLogo };
    }

    const normalizedToken = normalizedValue.toLowerCase();
    if (normalizedToken.includes('postnl')) return { label: contractPart || 'PostNL', logoUrl: postnlLogo };
    if (normalizedToken.includes('dhl')) return { label: contractPart || 'DHL', logoUrl: dhlLogo };
    if (normalizedToken.includes('dpd')) return { label: contractPart || 'DPD', logoUrl: dpdLogo };
    if (normalizedToken.includes('bpost')) return { label: contractPart || 'Bpost', logoUrl: bpostLogo };
    if (normalizedToken.includes('wegrow')) return { label: contractPart || 'WeGrow', logoUrl: wegrowLogo };

    return {
      label: normalizedValue || '-',
      logoUrl: null,
    };
  };

  const normalizeCountryCodeForDisplay = (countryCode: string) => {
    const normalized = String(countryCode || '').trim().toUpperCase();
    if (!normalized) return '';
    if (/^[A-Z]{2}$/.test(normalized)) return normalized;

    const key = normalized.replace(/\s+/g, '_');
    return countryAliases[key] || normalized;
  };

  const getCountryFlagUrl = (countryCode: string) => {
    const normalizedCode = normalizeCountryCodeForDisplay(countryCode);
    if (!/^[A-Z]{2}$/.test(normalizedCode)) return null;
    return `https://flagcdn.com/24x18/${normalizedCode.toLowerCase()}.png`;
  };

  const countryOptions = useMemo(() => {
    const dynamicCodesFromRules = rules
      .map((rule) => normalizeCountryCodeForDisplay(rule.countryCode))
      .filter(Boolean);

    const currentFormCode = normalizeCountryCodeForDisplay(formData.countryCode);

    return Array.from(
      new Set([
        ...defaultCountryOptions,
        ...dynamicCodesFromRules,
        ...(currentFormCode ? [currentFormCode] : []),
      ])
    );
  }, [rules, formData.countryCode]);

  const formatCountryDisplay = (countryCode: string) => {
    const normalizedCode = normalizeCountryCodeForDisplay(countryCode);
    if (!normalizedCode) {
      return {
        code: '-',
        flagUrl: null,
      };
    }

    return {
      code: normalizedCode,
      flagUrl: getCountryFlagUrl(normalizedCode),
    };
  };

  const selectedInstallationIdForForm = isAllStoresMode
    ? parseInt(formData.installationId, 10)
    : parseInt(activeProfile || '', 10);

  const selectedCarrierOptionsBase = Number.isInteger(selectedInstallationIdForForm)
    ? (carrierOptionsByInstallation[selectedInstallationIdForForm] || [])
    : [];

  const selectedCarrierOptions = useMemo(() => {
    const currentCarrierValue = String(formData.carrierType || '').trim();
    if (!currentCarrierValue) return selectedCarrierOptionsBase;

    const hasCurrentValue = selectedCarrierOptionsBase.some((option) => option.value === currentCarrierValue);
    if (hasCurrentValue) return selectedCarrierOptionsBase;

    const fallbackPresentation = Number.isInteger(selectedInstallationIdForForm)
      ? getCarrierPresentation(currentCarrierValue, selectedInstallationIdForForm)
      : { label: currentCarrierValue, logoUrl: null };

    return [
      ...selectedCarrierOptionsBase,
      {
        value: currentCarrierValue,
        label: fallbackPresentation.label,
        logoUrl: fallbackPresentation.logoUrl || null,
      },
    ];
  }, [selectedCarrierOptionsBase, formData.carrierType, selectedInstallationIdForForm]);

  const resetForm = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      countryCode: '',
      carrierType: '',
      priority: '100',
      installationId: isAllStoresMode && installations.length > 0
        ? String(installations[0].id)
        : activeProfile || '',
      active: true,
    });
  };

  const openCreateDialog = () => {
    if (!activeProfile) {
      toast.error('Selecteer eerst een installatie');
      return;
    }
    resetForm();
    setShowDialog(true);
  };

  const openEditDialog = (rule: AutomationRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      countryCode: rule.countryCode,
      carrierType: rule.carrierType,
      priority: String(rule.priority),
      installationId: String(rule.installationId),
      active: rule.active,
    });
    setShowDialog(true);
  };

  const submitRule = async () => {
    const normalizedCountryCode = formData.countryCode.trim().toUpperCase();
    const selectedCarrierAssignment = formData.carrierType.trim();
    const parsedPriority = parseInt(formData.priority, 10);
    const selectedInstallationId = isAllStoresMode
      ? parseInt(formData.installationId, 10)
      : parseInt(activeProfile || '', 10);

    if (!normalizedCountryCode) {
      toast.error('Selecteer een landcode');
      return;
    }

    if (!selectedCarrierAssignment) {
      toast.error('Selecteer een vervoerder');
      return;
    }

    if (!Number.isInteger(parsedPriority)) {
      toast.error('Prioriteit moet een heel getal zijn');
      return;
    }

    if (!Number.isInteger(selectedInstallationId)) {
      toast.error('Selecteer een geldige installatie');
      return;
    }

    const selectedCarrierPresentation = Number.isInteger(selectedInstallationId)
      ? getCarrierPresentation(selectedCarrierAssignment, selectedInstallationId)
      : { label: selectedCarrierAssignment };
    const ruleName = formData.name.trim() || `Order naar ${normalizedCountryCode} => ${selectedCarrierPresentation.label}`;

    try {
      setSubmitting(true);

      if (editingRule) {
        await api.updateAutomationRule(editingRule.id, {
          name: ruleName,
          countryCode: normalizedCountryCode,
          carrierType: selectedCarrierAssignment,
          priority: parsedPriority,
          active: formData.active,
        });
        toast.success('Regel bijgewerkt');
      } else {
        await api.createAutomationRule({
          installationId: selectedInstallationId,
          name: ruleName,
          countryCode: normalizedCountryCode,
          carrierType: selectedCarrierAssignment,
          priority: parsedPriority,
          active: formData.active,
        });
        toast.success('Regel toegevoegd');
      }

      setShowDialog(false);
      await loadRules();
    } catch (error: any) {
      console.error('Failed to save automation rule:', error);
      toast.error(error.message || 'Kon regel niet opslaan');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleRule = async (rule: AutomationRule) => {
    try {
      await api.updateAutomationRule(rule.id, { active: !rule.active });
      setRules((previousRules) =>
        previousRules.map((currentRule) =>
          currentRule.id === rule.id ? { ...currentRule, active: !currentRule.active } : currentRule
        )
      );
    } catch (error: any) {
      console.error('Failed to update status:', error);
      toast.error(error.message || 'Kon status niet aanpassen');
    }
  };

  const deleteRule = async (ruleId: number) => {
    try {
      await api.deleteAutomationRule(ruleId);
      setRules((previousRules) => previousRules.filter((rule) => rule.id !== ruleId));
      toast.success('Regel verwijderd');
    } catch (error: any) {
      console.error('Failed to delete rule:', error);
      toast.error(error.message || 'Kon regel niet verwijderen');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Automatiserings Regels
          </h2>
          <p className="text-slate-600">Stel in welk land welke vervoerder gebruikt wordt voor orders</p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
          <Plus className="w-4 h-4" />
          Nieuwe regel
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-6">
            <CardDescription>Totaal regels</CardDescription>
            <CardTitle>{rules.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-6">
            <CardDescription>Actieve regels</CardDescription>
            <CardTitle className="text-emerald-600">{activeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-6">
            <CardDescription>Context</CardDescription>
            <CardTitle className="text-base text-slate-700">
              {isAllStoresMode ? 'Alle installaties' : 'Geselecteerde installatie'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="w-5 h-5 text-indigo-600" />
            Regeloverzicht
          </CardTitle>
          <CardDescription>Volgorde wordt van boven naar beneden uitgevoerd</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regel</TableHead>
                {isAllStoresMode && <TableHead>Installatie</TableHead>}
                <TableHead>Als land</TableHead>
                <TableHead>Gebruik vervoerder</TableHead>
                <TableHead>Prioriteit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAllStoresMode ? 7 : 6} className="text-center text-slate-500 py-10">
                    Nog geen regels aangemaakt
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="text-slate-900">{rule.name}</TableCell>
                    {isAllStoresMode && (
                      <TableCell className="text-slate-700">{rule.installationName || `#${rule.installationId}`}</TableCell>
                    )}
                    <TableCell>
                      <Badge variant="outline" className="border-slate-200 text-slate-700">
                        {(() => {
                          const countryDisplay = formatCountryDisplay(rule.countryCode);
                          return (
                            <span className="inline-flex items-center gap-2">
                              {countryDisplay.flagUrl ? (
                                <img src={countryDisplay.flagUrl} alt={countryDisplay.code} className="h-3 w-4 rounded-[2px]" loading="lazy" />
                              ) : (
                                <span>🌍</span>
                              )}
                              <span>{countryDisplay.code}</span>
                            </span>
                          );
                        })()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const carrierDisplay = getCarrierPresentation(rule.carrierType, rule.installationId);
                        return (
                          <div className="flex items-center justify-start">
                            {carrierDisplay.logoUrl && (
                              <div className="w-10 h-10 flex items-center justify-center">
                                <img src={carrierDisplay.logoUrl} alt={carrierDisplay.label} className="w-full h-full object-contain" loading="lazy" />
                              </div>
                            )}
                            {!carrierDisplay.logoUrl && <span className="text-xs text-slate-400">-</span>}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-slate-700">{rule.priority}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Switch checked={rule.active} onCheckedChange={() => toggleRule(rule)} />
                        <span className={rule.active ? 'text-emerald-600 text-sm' : 'text-slate-500 text-sm'}>
                          {rule.active ? 'Actief' : 'Inactief'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="border-slate-200" onClick={() => openEditDialog(rule)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => deleteRule(rule.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Regel bewerken' : 'Nieuwe regel'}</DialogTitle>
            <DialogDescription>
              Voorbeeld: als landcode `NL` is, gebruik `PostNL`.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isAllStoresMode && (
              <div className="space-y-2">
                <Label>Installatie</Label>
                <Select
                  value={formData.installationId}
                  onValueChange={(value) => setFormData((previousData) => ({ ...previousData, installationId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer installatie" />
                  </SelectTrigger>
                  <SelectContent>
                    {installations.map((installation) => (
                      <SelectItem key={installation.id} value={String(installation.id)}>
                        {installation.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Regelnaam</Label>
              <Input
                value={formData.name}
                onChange={(event) => setFormData((previousData) => ({ ...previousData, name: event.target.value }))}
                placeholder="Bijv. Order naar NL => PostNL"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Land</Label>
                <Select
                  value={formData.countryCode}
                  onValueChange={(value) => setFormData((previousData) => ({ ...previousData, countryCode: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer land" />
                  </SelectTrigger>
                  <SelectContent>
                    {countryOptions.map((countryCode) => {
                      const countryDisplay = formatCountryDisplay(countryCode);
                      return (
                      <SelectItem key={countryCode} value={countryCode}>
                        <span className="inline-flex items-center gap-2">
                          {countryDisplay.flagUrl ? (
                            <img src={countryDisplay.flagUrl} alt={countryDisplay.code} className="h-3 w-4 rounded-[2px]" loading="lazy" />
                          ) : (
                            <span>🌍</span>
                          )}
                          <span>{countryDisplay.code}</span>
                        </span>
                      </SelectItem>
                    );})}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Vervoerder</Label>
                <Select
                  value={formData.carrierType}
                  onValueChange={(value) => setFormData((previousData) => ({ ...previousData, carrierType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecteer vervoerder" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedCarrierOptions.map((carrier) => (
                      <SelectItem key={carrier.value} value={carrier.value}>
                        <span className="inline-flex items-center gap-2">
                          {carrier.logoUrl && (
                            <img src={carrier.logoUrl} alt={carrier.label} className="h-4 w-4 rounded-sm object-contain" loading="lazy" />
                          )}
                          <span>{carrier.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div className="space-y-2">
                <Label>Prioriteit (lager = eerst)</Label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(event) => setFormData((previousData) => ({ ...previousData, priority: event.target.value }))}
                  placeholder="100"
                />
              </div>

              <div className="flex items-center justify-between border border-slate-200 rounded-md p-3">
                <span className="text-sm text-slate-700">Regel actief</span>
                <Switch
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData((previousData) => ({ ...previousData, active: checked }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={submitting}>
              Annuleren
            </Button>
            <Button
              onClick={submitRule}
              disabled={submitting}
              className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRule ? 'Opslaan' : 'Aanmaken'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
