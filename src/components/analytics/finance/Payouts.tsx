import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CreditCard, Wallet, Hash, Layers, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../ui/dialog';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState, KpiCard,
  DataTable, StoreBadge, EUR, EUR_SHORT, NUM,
} from '../shared';

interface PayoutsProps {
  activeProfile: string;
}

interface PayoutForm {
  id?: number;
  payoutDate: string;
  periodFrom: string;
  periodTo: string;
  amount: string;
  storeName: string;
  note: string;
}

const emptyForm = (): PayoutForm => ({
  payoutDate: new Date().toISOString().slice(0, 10),
  periodFrom: '',
  periodTo: '',
  amount: '',
  storeName: '',
  note: '',
});

export function Payouts({ activeProfile }: PayoutsProps) {
  const { t, language } = useLanguage();
  const { dateRange, selectedStores, availableStores } = useAnalytics();

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<PayoutForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const locale = language === 'nl' ? 'nl-NL' : language === 'de' ? 'de-DE' : 'en-GB';

  const formatDay = (value: string) =>
    value ? new Date(`${value}T12:00:00`).toLocaleDateString(locale) : '–';

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getPayouts({
        installationId: activeProfile,
        from: dateRange.from,
        to: dateRange.to,
        stores: selectedStores,
      });
      setData(result);
    } catch (error) {
      console.error('Failed to load payouts:', error);
      toast.error(t('errorLoadingPayouts'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, dateRange, selectedStores]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (payout: any) => {
    setForm({
      id: payout.id,
      payoutDate: payout.payoutDate,
      periodFrom: payout.periodFrom,
      periodTo: payout.periodTo,
      amount: String(payout.amount),
      storeName: payout.storeName || '',
      note: payout.note || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      payoutDate: form.payoutDate,
      periodFrom: form.periodFrom,
      periodTo: form.periodTo,
      amount: parseFloat(String(form.amount).replace(',', '.')) || 0,
      storeName: form.storeName || undefined,
      note: form.note || undefined,
    };

    if (!payload.payoutDate || !payload.periodFrom || !payload.periodTo) {
      toast.error(t('fillAllRequiredFields'));
      return;
    }
    if (payload.amount <= 0) {
      toast.error(t('amountMustBePositive'));
      return;
    }

    try {
      setSaving(true);
      if (form.id) {
        await api.updatePayout(form.id, payload);
        toast.success(t('payoutUpdated'));
      } else {
        await api.createPayout({ ...payload, installationId: parseInt(activeProfile, 10) });
        toast.success(t('payoutCreated'));
      }
      setDialogOpen(false);
      await load();
    } catch (error: any) {
      console.error('Failed to save payout:', error);
      toast.error(error?.message || t('errorSavingPayout'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deletePayout(id);
      toast.success(t('payoutDeleted'));
      setConfirmDelete(null);
      await load();
    } catch (error: any) {
      console.error('Failed to delete payout:', error);
      toast.error(error?.message || t('errorDeletingPayout'));
    }
  };

  const payouts: any[] = data?.payouts || [];
  const totals = data?.totals;

  // Oudste eerst in de grafiek, zodat je het verloop over tijd leest.
  const chartData = [...payouts].reverse().map((payout) => ({
    label: formatDay(payout.payoutDate),
    amount: Math.round(payout.amount),
  }));

  const columns = [
    { key: 'payoutDate', header: t('colPayoutDate'), width: '11rem' },
    { key: 'periodFrom', header: t('periodFrom'), width: '10rem', hideOnMobile: true },
    { key: 'periodTo', header: t('periodTo'), width: '10rem', hideOnMobile: true },
    { key: 'store', header: t('colChannel'), width: '8rem', hideOnMobile: true },
    { key: 'amount', header: t('colAmount'), align: 'right' as const, width: '12rem' },
    { key: 'note', header: t('note'), align: 'right' as const, width: '12rem'},
    { key: 'actions', header: '', align: 'right' as const, width: '5rem' },
  ];

  const rows = payouts.map((payout) => ({
    payoutDate: <span className="text-slate-700">{formatDay(payout.payoutDate)}</span>,
    periodFrom: <span className="text-slate-500">{formatDay(payout.periodFrom)}</span>,
    periodTo: <span className="text-slate-500">{formatDay(payout.periodTo)}</span>,
    store: payout.storeName ? <StoreBadge store={payout.storeName} /> : <span className="text-slate-300">–</span>,
    amount: <span className="analytics-amount-positive">{EUR(payout.amount)}</span>,
    note: <span className="text-slate-400 text-xs">{payout.note || '–'}</span>,
    actions: (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={() => openEdit(payout)}
          className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
          title={t('edit')}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setConfirmDelete(payout.id)}
          className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
          title={t('delete')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </span>
    ),
  }));

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('payouts')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('payouts')}
        subtitle={t('payoutsSubtitle')}
        hideCountryFilter
        extra={
          <Button
            onClick={openNew}
            className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
          >
            <Plus className="w-4 h-4" />
            {t('newPayout')}
          </Button>
        }
      />

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <div className="analytics-kpi-grid is-four">
            <KpiCard
              label={t('kpiTotalPaidOut')}
              value={EUR(totals?.amount || 0)}
              color="emerald"
              icon={<CreditCard className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiLastPayout')}
              value={EUR(totals?.last?.amount || 0)}
              sub={totals?.last ? formatDay(totals.last.payoutDate) : undefined}
              color="indigo"
              icon={<Wallet className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiAvgPayout')}
              value={EUR(totals?.average || 0)}
              color="purple"
              icon={<Hash className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiPayoutCount')}
              value={NUM(totals?.count || 0)}
              sub={t('payoutsLabel')}
              color="sky"
              icon={<Layers className="w-4 h-4 text-white" />}
            />
          </div>

          <SectionCard title={t('payoutsPerDateTitle')}>
            {chartData.length === 0 ? (
              <EmptyState message={t('noPayoutsYet')} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={EUR_SHORT} width={50} />
                  <Tooltip
                    formatter={(value: number) => [EUR(value), t('colAmount')]}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                  />
                  <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title={t('payoutHistoryTitle')}>
            <DataTable columns={columns} rows={rows} emptyMessage={t('noPayoutsYet')} />
          </SectionCard>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? t('editPayout') : t('newPayout')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="analytics-form-label">{t('colPayoutDate')} *</label>
              <input
                type="date"
                className="analytics-input w-full"
                value={form.payoutDate}
                onChange={(event) => setForm({ ...form, payoutDate: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="analytics-form-label">{t('periodFrom')} *</label>
                <input
                  type="date"
                  className="analytics-input w-full"
                  value={form.periodFrom}
                  onChange={(event) => setForm({ ...form, periodFrom: event.target.value })}
                />
              </div>
              <div>
                <label className="analytics-form-label">{t('periodTo')} *</label>
                <input
                  type="date"
                  className="analytics-input w-full"
                  value={form.periodTo}
                  onChange={(event) => setForm({ ...form, periodTo: event.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="analytics-form-label">{t('colAmount')} (EUR) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="analytics-input w-full"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                />
              </div>
              <div>
                <label className="analytics-form-label">{t('colChannel')}</label>
                <select
                  className="analytics-select w-full"
                  value={form.storeName}
                  onChange={(event) => setForm({ ...form, storeName: event.target.value })}
                >
                  <option value="">{t('noChannelSelected')}</option>
                  {availableStores.map((store) => (
                    <option key={store} value={store}>{store}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="analytics-form-label">{t('note')}</label>
              <textarea
                rows={2}
                className="analytics-input w-full"
                style={{ height: 'auto', paddingTop: '.5rem', paddingBottom: '.5rem' }}
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cancel')}</Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('deletePayoutTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">{t('deletePayoutConfirm')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>{t('cancel')}</Button>
            <Button
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}