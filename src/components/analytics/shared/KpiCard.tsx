import { type ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export type KpiColor = 'indigo' | 'emerald' | 'purple' | 'amber' | 'sky' | 'rose';

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  /** Fractie: 0.14 wordt +14,0%. null of undefined verbergt de trend. */
  trend?: number | null;
  trendLabel?: string;
  /** Bij annuleringen is een stijging juist slecht. */
  invertTrendColor?: boolean;
  color?: KpiColor;
  icon?: ReactNode;
}

export function KpiCard({
  label, value, sub, trend, trendLabel, invertTrendColor = false, color = 'indigo', icon,
}: KpiCardProps) {
  const hasTrend = trend != null && Number.isFinite(trend);
  const up = hasTrend && trend! > 0;
  const down = hasTrend && trend! < 0;
  const good = invertTrendColor ? down : up;
  const bad = invertTrendColor ? up : down;

  const deltaClass = !hasTrend || (!up && !down)
    ? 'is-flat'
    : good ? 'is-up' : bad ? 'is-down' : 'is-flat';

  return (
    <div className={`analytics-kpi kpi-${color}`}>
      <div className="analytics-kpi-head">
        <span className="analytics-kpi-label">{label}</span>
        {icon && <span className="analytics-kpi-icon">{icon}</span>}
      </div>

      <div className="analytics-kpi-value">{value}</div>

      {(sub || hasTrend) && (
        <div className="analytics-kpi-foot">
          {hasTrend && (
            <span className={`analytics-kpi-delta ${deltaClass}`}>
              {up && <ArrowUpRight className="w-3 h-3" />}
              {down && <ArrowDownRight className="w-3 h-3" />}
              {!up && !down && <Minus className="w-3 h-3" />}
              {trend! > 0 ? '+' : ''}{(trend! * 100).toFixed(1)}%
            </span>
          )}
          {(sub || trendLabel) && <span>{sub || trendLabel}</span>}
        </div>
      )}
    </div>
  );
}