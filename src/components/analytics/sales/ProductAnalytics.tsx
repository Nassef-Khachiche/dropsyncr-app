import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { useAnalytics } from '../../../contexts/AnalyticsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  AnalyticsPageHeader, SectionCard, EmptyState,
  DataTable, EUR, EUR_SHORT, PCT, NUM,
} from '../shared';

interface ProductAnalyticsProps {
  activeProfile: string;
}

type SortKey = 'revenue' | 'units' | 'margin' | 'cancelPct';

const BAR_COLORS = [
  '#6366f1', '#7c5cf5', '#8b5cf6', '#9d5bf0', '#a855f7',
  '#b95ae8', '#c956dd', '#d954cf', '#e452bf', '#ec4899',
];

export function ProductAnalytics({ activeProfile }: ProductAnalyticsProps) {
  const { t } = useLanguage();
  const { dateRange, selectedStores, selectedCountries } = useAnalytics();

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');

  const load = useCallback(async () => {
    if (!activeProfile) return;
    try {
      setLoading(true);
      const result = await api.getProductAnalytics({
        installationId: activeProfile,
        from: dateRange.from,
        to: dateRange.to,
        stores: selectedStores,
        countries: selectedCountries,
      });
      setProducts(result.products || []);
    } catch (error) {
      console.error('Failed to load product analytics:', error);
      toast.error(t('errorLoadingAnalytics'));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [activeProfile, dateRange, selectedStores, selectedCountries]);

  useEffect(() => { load(); }, [load]);

  // Zoeken en sorteren gebeurt lokaal; de backend levert de hele lijst al
  // geaggregeerd aan.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    const matches = (product: any) => {
      if (!term) return true;
      return [product.productName, product.sku, product.ean, product.brand]
        .some((value) => String(value || '').toLowerCase().includes(term));
    };

    const sorters: Record<SortKey, (a: any, b: any) => number> = {
      revenue: (a, b) => b.revenue - a.revenue,
      units: (a, b) => b.units - a.units,
      margin: (a, b) => b.marginPct - a.marginPct,
      cancelPct: (a, b) => b.cancelPct - a.cancelPct,
    };

    return products.filter(matches).sort(sorters[sortKey]);
  }, [products, search, sortKey]);

  const topTen = visible.slice(0, 10).map((product) => ({
    ...product,
    label: product.sku || product.ean || product.productName?.slice(0, 14) || '-',
  }));

  const marginClass = (value: number) =>
    value < 0 ? 'is-loss' : value < 0.08 ? 'is-thin' : 'is-good';

  const columns = [
    { key: 'sku', header: t('colSku'), hideOnMobile: true },
    { key: 'ean', header: t('eanCode'), hideOnMobile: true },
    { key: 'product', header: t('product') },
    { key: 'brand', header: t('brand'), hideOnMobile: true },
    { key: 'units', header: t('colUnits'), align: 'right' as const },
    { key: 'revenue', header: t('revenue'), align: 'right' as const },
    { key: 'margin', header: t('colMargin'), align: 'right' as const, hideOnMobile: true },
    { key: 'marginPct', header: t('colMarginPct'), align: 'right' as const },
    { key: 'avgPrice', header: t('colAvgPrice'), align: 'right' as const, hideOnMobile: true },
    { key: 'cancelPct', header: t('colCancelShort'), align: 'right' as const, hideOnMobile: true },
    { key: 'returnPct', header: t('colReturnShort'), align: 'right' as const, hideOnMobile: true },
  ];

  const rows = visible.map((product) => ({
    sku: <span className="analytics-mono">{product.sku || '-'}</span>,
    ean: <span className="analytics-mono">{product.ean || '-'}</span>,
    product: (
      <span className="analytics-product-name" title={product.productName}>
        {product.productName}
      </span>
    ),
    brand: <span className="text-slate-500">{product.brand || '-'}</span>,
    units: <span className="analytics-num">{NUM(product.units)}</span>,
    revenue: <span className="analytics-num">{EUR(product.revenue)}</span>,
    margin: (
      <span className={product.margin < 0 ? 'analytics-num text-red-600' : 'analytics-num'}>
        {EUR(product.margin)}
      </span>
    ),
    marginPct: (
      <span className={`analytics-margin ${marginClass(product.marginPct)}`}>
        {PCT(product.marginPct)}
      </span>
    ),
    avgPrice: <span className="analytics-num">{EUR(product.avgPrice)}</span>,
    cancelPct: (
      <span className={product.cancelPct > 0.25 ? 'analytics-pill-warn' : 'text-slate-400'}>
        {PCT(product.cancelPct)}
      </span>
    ),
    returnPct: <span className="text-slate-400">{PCT(product.returnPct)}</span>,
  }));

  if (!activeProfile) {
    return (
      <div className="space-y-2">
        <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
          {t('productAnalytics')}
        </h2>
        <p className="text-slate-600">{t('selectInstallationFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader
        title={t('productAnalytics')}
        subtitle={t('productAnalyticsSubtitle')}
      />

      {loading && products.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <SectionCard title={t('topTenProductsTitle')}>
            {topTen.length === 0 ? (
              <EmptyState message={t('noDataForPeriod')} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topTen} layout="vertical" margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={EUR_SHORT} />
                  <YAxis type="category" dataKey="label" stroke="#94a3b8" tick={{ fontSize: 10 }} width={88} />
                  <Tooltip
                    formatter={(value: number) => [EUR(value), t('revenue')]}
                    labelFormatter={(label: string) => {
                      const match = topTen.find((entry) => entry.label === label);
                      return match?.productName || label;
                    }}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                  />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {topTen.map((_, index) => (
                      <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard
            title={`${t('allProducts')} (${visible.length})`}
            action={
              <div className="analytics-toolbar">
                <input
                  type="text"
                  className="analytics-input"
                  placeholder={t('searchProductSkuBrand')}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <select
                  className="analytics-select"
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                >
                  <option value="revenue">{t('sortByRevenue')}</option>
                  <option value="units">{t('sortByUnits')}</option>
                  <option value="margin">{t('sortByMargin')}</option>
                  <option value="cancelPct">{t('sortByCancelRate')}</option>
                </select>
              </div>
            }
          >
            <DataTable columns={columns} rows={rows} emptyMessage={t('noDataForPeriod')} />
          </SectionCard>
        </>
      )}
    </div>
  );
}