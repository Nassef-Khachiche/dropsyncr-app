import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Plus,
  Loader2,
  Save,
  Pencil,
  Trash2,
  ExternalLink,
  Eye,
  EyeOff,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

interface SupplierSettingsProps {
  activeProfile: string;
}

interface Supplier {
  id: number;
  name: string;
  websiteUrl: string | null;
  active: boolean;
  loginUrl: string | null;
  loginUsername: string | null;
  loginPassword: string | null;
  loginNote: string | null;
}

const emptyForm = {
  name: '',
  websiteUrl: '',
  active: true,
  loginUrl: '',
  loginUsername: '',
  loginPassword: '',
  loginNote: '',
};

export function SupplierSettings({ activeProfile }: SupplierSettingsProps) {
  const { t } = useLanguage();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [visiblePasswordId, setVisiblePasswordId] = useState<number | null>(null);

  useEffect(() => {
    if (activeProfile) loadSuppliers();
  }, [activeProfile]);

  const loadSuppliers = async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const data = await api.getSuppliers(activeProfile);
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
      toast.error(t('errorLoadingSuppliers'));
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowPassword(false);
    setDialogOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name || '',
      websiteUrl: supplier.websiteUrl || '',
      active: supplier.active,
      loginUrl: supplier.loginUrl || '',
      loginUsername: supplier.loginUsername || '',
      loginPassword: supplier.loginPassword || '',
      loginNote: supplier.loginNote || '',
    });
    setShowPassword(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t('supplierNameRequired'));
      return;
    }
    try {
      setSaving(true);
      if (editingId) {
        await api.updateSupplier(editingId, form);
        toast.success(t('supplierUpdated'));
      } else {
        await api.createSupplier({ installationId: parseInt(activeProfile, 10), ...form });
        toast.success(t('supplierCreated'));
      }
      setDialogOpen(false);
      await loadSuppliers();
    } catch (error: any) {
      console.error('Failed to save supplier:', error);
      toast.error(error?.message || t('errorSavingSupplier'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (supplier: Supplier) => {
    try {
      await api.deleteSupplier(supplier.id);
      toast.success(t('supplierDeleted'));
      await loadSuppliers();
    } catch (error: any) {
      console.error('Failed to delete supplier:', error);
      const message = String(error?.message || '');
      toast.error(message.includes('inkooporders') ? t('supplierInUse') : t('errorDeletingSupplier'));
    }
  };

  const toggleActive = async (supplier: Supplier) => {
    try {
      await api.updateSupplier(supplier.id, { active: !supplier.active });
      await loadSuppliers();
    } catch (error) {
      console.error('Failed to toggle supplier:', error);
      toast.error(t('errorSavingSupplier'));
    }
  };

  const renderWebsiteCell = (supplier: Supplier) => {
    if (!supplier.websiteUrl) {
      return <span className="text-slate-300">—</span>;
    }
    const label = supplier.websiteUrl.replace(/^https?:\/\//, '').slice(0, 30);
    return (
      <a href={supplier.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
        <ExternalLink className="w-3 h-3" />
        {label}
      </a>
    );
  };

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-lg text-slate-900">{t('suppliersTitle')}</CardTitle>
            <p className="text-sm text-slate-500">{t('suppliersSubtitle')}</p>
          </div>
          <Button
            onClick={openCreate}
            className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
          >
            <Plus className="w-4 h-4" />
            {t('newSupplier')}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{t('noSuppliersYet')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 px-3">{t('supplierName')}</th>
                    <th className="py-2 px-3">{t('supplierWebsite')}</th>
                    <th className="py-2 px-3">{t('supplierLoginUsername')}</th>
                    <th className="py-2 px-3">{t('supplierLoginPassword')}</th>
                    <th className="py-2 px-3">{t('status')}</th>
                    <th className="py-2 px-3 text-right">{t('edit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 text-slate-900">{supplier.name}</td>
                      <td className="py-2.5 px-3">{renderWebsiteCell(supplier)}</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {supplier.loginUsername || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {supplier.loginPassword ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-600">
                              {visiblePasswordId === supplier.id ? supplier.loginPassword : '••••••••'}
                            </span>
                            <button
                              onClick={() =>
                                setVisiblePasswordId(visiblePasswordId === supplier.id ? null : supplier.id)
                              }
                              className="text-slate-400 hover:text-slate-600"
                              title={visiblePasswordId === supplier.id ? t('hidePassword') : t('showPassword')}
                            >
                              {visiblePasswordId === supplier.id ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => toggleActive(supplier)}
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            supplier.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {supplier.active ? t('active') : t('inactive')}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(supplier)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                            title={t('edit')}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(supplier)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500"
                            title={t('delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t('editSupplier') : t('newSupplier')}</DialogTitle>
            <DialogDescription>{t('suppliersSubtitle')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm text-slate-700">{t('supplierName')}</label>
              <Input
                placeholder={t('supplierNamePlaceholder')}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="border-slate-200"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-700">{t('supplierWebsite')}</label>
              <Input
                placeholder={t('supplierWebsitePlaceholder')}
                value={form.websiteUrl}
                onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                className="border-slate-200"
              />
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-4">
              <div>
                <p className="text-sm text-slate-700">{t('supplierLoginSection')}</p>
                <p className="text-xs text-slate-400">{t('supplierLoginSectionHint')}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-slate-700">{t('supplierLoginUrl')}</label>
                <Input
                  placeholder={t('supplierWebsitePlaceholder')}
                  value={form.loginUrl}
                  onChange={(e) => setForm({ ...form, loginUrl: e.target.value })}
                  className="border-slate-200"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-slate-700">{t('supplierLoginUsername')}</label>
                  <Input
                    value={form.loginUsername}
                    onChange={(e) => setForm({ ...form, loginUsername: e.target.value })}
                    className="border-slate-200"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-700">{t('supplierLoginPassword')}</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={form.loginPassword}
                      onChange={(e) => setForm({ ...form, loginPassword: e.target.value })}
                      className="border-slate-200 pr-9"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      title={showPassword ? t('hidePassword') : t('showPassword')}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-slate-700">{t('supplierLoginNote')}</label>
                <textarea
                  placeholder={t('supplierLoginNotePlaceholder')}
                  value={form.loginNote}
                  onChange={(e) => setForm({ ...form, loginNote: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 resize-y"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">{t('supplierActive')}</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}