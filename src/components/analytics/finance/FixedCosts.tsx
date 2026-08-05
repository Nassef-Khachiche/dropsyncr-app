import { useState, useEffect, useCallback } from 'react';
import {
  Building2, CalendarRange, Plus, Pencil, Trash2, Check, X, Loader2, FolderPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { api } from '../../../services/api';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState, KpiCard, EUR, PCT, NUM,
} from '../shared';

interface FixedCostsProps {
  activeProfile: string;
}

// Vaste tinten per positie, zodat een categorie altijd dezelfde kleur houdt.
const GROUP_COLORS = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#14b8a6', '#a855f7'];

export function FixedCosts({ activeProfile }: FixedCostsProps) {
  const { t } = useLanguage();

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);

  const [editingGroup, setEditingGroup] = useState<number | null>(null);
  const [groupDraft, setGroupDraft] = useState('');

  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [itemDraft, setItemDraft] = useState({ name: '', amount: '' });

  const [addingItemTo, setAddingItemTo] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({ name: '', amount: '' });

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getFixedCosts(activeProfile);
      setData(result);
    } catch (error) {
      console.error('Failed to load fixed costs:', error);
      toast.error(t('errorLoadingFixedCosts'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeProfile]);

  useEffect(() => { load(); }, [load]);

  const groups: any[] = data?.groups || [];
  const totals = data?.totals;
  const perMonth = totals?.perMonth || 0;

  // De twee zwaarste categorieën verdienen een eigen KPI.
  const ranked = [...groups].sort((a, b) => b.total - a.total);
  const [biggest, secondBiggest] = ranked;

  const colorFor = (groupId: number) => {
    const index = groups.findIndex((group) => group.id === groupId);
    return GROUP_COLORS[(index < 0 ? 0 : index) % GROUP_COLORS.length];
  };

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await api.createFixedCostGroup({
        installationId: parseInt(activeProfile, 10),
        name: newGroupName.trim(),
      });
      setNewGroupName('');
      setAddingGroup(false);
      await load();
    } catch (error: any) {
      toast.error(error?.message || t('errorSavingFixedCosts'));
    }
  };

  const handleRenameGroup = async (id: number) => {
    if (!groupDraft.trim()) return;
    try {
      await api.updateFixedCostGroup(id, groupDraft.trim());
      setEditingGroup(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || t('errorSavingFixedCosts'));
    }
  };

  const handleDeleteGroup = async (id: number, name: string) => {
    if (!window.confirm(t('deleteGroupConfirm').replace('{name}', name))) return;
    try {
      await api.deleteFixedCostGroup(id);
      toast.success(t('groupDeleted'));
      await load();
    } catch (error: any) {
      toast.error(error?.message || t('errorSavingFixedCosts'));
    }
  };

  const handleAddItem = async (groupId: number) => {
    if (!newItem.name.trim()) return;
    try {
      await api.createFixedCostItem({
        installationId: parseInt(activeProfile, 10),
        groupId,
        name: newItem.name.trim(),
        amountPerMonth: parseFloat(String(newItem.amount).replace(',', '.')) || 0,
      });
      setNewItem({ name: '', amount: '' });
      setAddingItemTo(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || t('errorSavingFixedCosts'));
    }
  };

  const handleSaveItem = async (id: number) => {
    try {
      await api.updateFixedCostItem(id, {
        name: itemDraft.name.trim(),
        amountPerMonth: parseFloat(String(itemDraft.amount).replace(',', '.')) || 0,
      });
      setEditingItem(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || t('errorSavingFixedCosts'));
    }
  };

  const handleDeleteItem = async (id: number) => {
    try {
      await api.deleteFixedCostItem(id);
      await load();
    } catch (error: any) {
      toast.error(error?.message || t('errorSavingFixedCosts'));
    }
  };

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('fixedCosts')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('fixedCosts')}
        subtitle={t('fixedCostsSubtitle')}
        showFilters={false}
        extra={
          <Button
            onClick={() => setAddingGroup(true)}
            className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
          >
            <FolderPlus className="w-4 h-4" />
            {t('newCategory')}
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
              label={t('kpiPerMonth')}
              value={EUR(perMonth)}
              sub={`${NUM(totals?.itemCount || 0)} ${t('costItemsLabel')}`}
              color="indigo"
              icon={<Building2 className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={t('kpiPerYear')}
              value={EUR(totals?.perYear || 0)}
              sub={t('twelveMonths')}
              color="purple"
              icon={<CalendarRange className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={biggest ? biggest.name : t('kpiLargestPost')}
              value={EUR(biggest?.total || 0)}
              sub={biggest && perMonth > 0 ? `${PCT(biggest.total / perMonth, 0)} ${t('ofTotal')}` : undefined}
              color="amber"
              icon={<Building2 className="w-4 h-4 text-white" />}
            />
            <KpiCard
              label={secondBiggest ? secondBiggest.name : t('kpiSecondLargestPost')}
              value={EUR(secondBiggest?.total || 0)}
              sub={secondBiggest && perMonth > 0 ? `${PCT(secondBiggest.total / perMonth, 0)} ${t('ofTotal')}` : undefined}
              color="sky"
              icon={<Building2 className="w-4 h-4 text-white" />}
            />
          </div>

          <SectionCard title={t('distributionTitle')}>
            {groups.length === 0 || perMonth === 0 ? (
              <EmptyState message={t('noFixedCostsYet')} />
            ) : (
              <>
                <div className="analytics-costbar">
                  {ranked.map((group) => (
                    group.total > 0 && (
                      <span
                        key={group.id}
                        title={`${group.name} — ${EUR(group.total)}`}
                        style={{ width: `${(group.total / perMonth) * 100}%`, backgroundColor: colorFor(group.id) }}
                      />
                    )
                  ))}
                </div>

                <div className="mt-4">
                  {ranked.map((group) => (
                    <div key={group.id} className="analytics-costrow">
                      <span className="analytics-cost-dot" style={{ backgroundColor: colorFor(group.id), marginTop: 0 }} />
                      <span className="analytics-costrow-label">{group.name}</span>
                      <span className="analytics-costrow-share">
                        {perMonth > 0 ? PCT(group.total / perMonth, 0) : '–'}
                      </span>
                      <span className="analytics-costrow-value">{EUR(group.total)}</span>
                    </div>
                  ))}
                </div>

                <div className="analytics-costtotal">
                  <span className="text-slate-600">{t('totalPerMonth')}</span>
                  <span className="analytics-costtotal-value text-slate-900">{EUR(perMonth)}</span>
                </div>
              </>
            )}
          </SectionCard>

          {addingGroup && (
            <div className="analytics-addcard">
              <div className="analytics-addrow">
                <input
                  autoFocus
                  className="analytics-input"
                  placeholder={t('categoryNamePlaceholder')}
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleAddGroup();
                    if (event.key === 'Escape') { setAddingGroup(false); setNewGroupName(''); }
                  }}
                />
                <Button
                  onClick={handleAddGroup}
                  className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                >
                  <Plus className="w-4 h-4" />
                  {t('add')}
                </Button>
                <Button variant="outline" onClick={() => { setAddingGroup(false); setNewGroupName(''); }}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          )}

          {groups.length === 0 && !addingGroup ? (
            <SectionCard><EmptyState message={t('createFirstCategory')} /></SectionCard>
          ) : (
            <div className="analytics-split-grid">
              {groups.map((group) => (
                <div key={group.id} className="analytics-costgroup">
                  <div className="analytics-costgroup-head" style={{ borderLeftColor: colorFor(group.id) }}>
                    {editingGroup === group.id ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          autoFocus
                          className="analytics-input flex-1"
                          value={groupDraft}
                          onChange={(event) => setGroupDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') handleRenameGroup(group.id);
                            if (event.key === 'Escape') setEditingGroup(null);
                          }}
                        />
                        <button onClick={() => handleRenameGroup(group.id)} className="analytics-icon-btn is-confirm">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingGroup(null)} className="analytics-icon-btn">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="analytics-costgroup-name">{group.name}</span>
                        <span className="analytics-costgroup-total">{EUR(group.total)}</span>
                        <button
                          onClick={() => { setEditingGroup(group.id); setGroupDraft(group.name); }}
                          className="analytics-icon-btn"
                          title={t('edit')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.id, group.name)}
                          className="analytics-icon-btn is-danger"
                          title={t('delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="analytics-costgroup-body">
                    {group.items.length === 0 && addingItemTo !== group.id && (
                      <p className="text-xs text-slate-400 py-2">{t('noItemsInCategory')}</p>
                    )}

                    {group.items.map((item: any) => (
                      <div key={item.id} className="analytics-costitem">
                        {editingItem === item.id ? (
                          <>
                            <input
                              autoFocus
                              className="analytics-input flex-1"
                              value={itemDraft.name}
                              onChange={(event) => setItemDraft({ ...itemDraft, name: event.target.value })}
                            />
                            <div className="analytics-target-input" style={{ width: '7rem' }}>
                              <span>€</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={itemDraft.amount}
                                onChange={(event) => setItemDraft({ ...itemDraft, amount: event.target.value })}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') handleSaveItem(item.id);
                                  if (event.key === 'Escape') setEditingItem(null);
                                }}
                              />
                            </div>
                            <button onClick={() => handleSaveItem(item.id)} className="analytics-icon-btn is-confirm">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingItem(null)} className="analytics-icon-btn">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm text-slate-700 truncate">{item.name}</span>
                            <span className="analytics-num text-sm">{EUR(item.amountPerMonth)}</span>
                            <button
                              onClick={() => {
                                setEditingItem(item.id);
                                setItemDraft({ name: item.name, amount: String(item.amountPerMonth) });
                              }}
                              className="analytics-icon-btn"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteItem(item.id)} className="analytics-icon-btn is-danger">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}

                    {addingItemTo === group.id ? (
                      <div className="analytics-costitem">
                        <input
                          autoFocus
                          className="analytics-input flex-1"
                          placeholder={t('itemNamePlaceholder')}
                          value={newItem.name}
                          onChange={(event) => setNewItem({ ...newItem, name: event.target.value })}
                        />
                        <div className="analytics-target-input" style={{ width: '7rem' }}>
                          <span>€</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0"
                            value={newItem.amount}
                            onChange={(event) => setNewItem({ ...newItem, amount: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') handleAddItem(group.id);
                              if (event.key === 'Escape') setAddingItemTo(null);
                            }}
                          />
                        </div>
                        <button onClick={() => handleAddItem(group.id)} className="analytics-icon-btn is-confirm">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setAddingItemTo(null)} className="analytics-icon-btn">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingItemTo(group.id); setNewItem({ name: '', amount: '' }); }}
                        className="analytics-additem"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t('addCostItem')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}