import { type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { GlobalFilters } from './GlobalFilters';

export function AnalyticsPageHeader({
  title,
  subtitle,
  extra,
  showFilters = true,
  hideCountryFilter = false,
}: {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
  showFilters?: boolean;
  hideCountryFilter?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            {title}
          </h2>
          {subtitle && <p className="text-slate-600">{subtitle}</p>}
        </div>
        {extra}
      </div>
      {showFilters && <GlobalFilters hideCountries={hideCountryFilter} />}
    </div>
  );
}

export function SectionCard({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      {(title || action) && (
        <CardHeader>
          <div className="flex items-center justify-between">
            {title && <CardTitle className="text-base text-slate-900">{title}</CardTitle>}
            {action}
          </div>
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-slate-400 text-center py-8">{message}</p>;
}