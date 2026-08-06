import { 
  Package, 
  ShoppingCart, 
  BarChart2,
  TrendingUp,
  Plug, 
  Truck,
  ChevronDown,
  ChevronRight,
  QrCode,
  FileText,
  Shield,
  Workflow,
  Warehouse,
  BarChart3,
  LayoutDashboard,
  PieChart,
  Target,
  CalendarDays,
  CalendarRange,
  Landmark,
  CreditCard,
  Megaphone,
  Building2,
  AlertTriangle,
  PackageX,
  Undo2,
  Download,
  Settings,
  RotateCcw,
  MapPin,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from './ui/utils';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import logo from '../assets/dropsyncr-wit-transparant.png';


interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  className?: string;
}

type MenuLabelKey =
  | 'orders' | 'tracking' | 'labels' | 'shipments' | 'integrations' | 'carriers'
  | 'settings' | 'automationRules' | 'administrative' | 'dashboard' | 'klkAnalytics'
  | 'fulfillmentAnalytics' | 'warehouseManagement' | 'inventoryManagement'
  | 'inventoryAnalysis' | 'returns' | 'locationManagement' | 'productManagement'
  | 'purchasing' | 'analyticsOverview' | 'productAnalytics' | 'storeTrends'
  | 'channelProfitability' | 'targetsForecast' | 'dailySummary' | 'monthlySummary' | 'vatOverview' | 'payouts' | 'adSpend' | 'fixedCosts' | 'signals' | 'cancelAnalysis' | 'returnsAnalytics' | 'analyticsExports'
  | 'salesSection' | 'financeSection' | 'operationsSection' | 'exportsSection';

interface MenuItem {
  id: string;
  labelKey: MenuLabelKey;
  icon?: any;
  adminOnly?: boolean;
  /** Met children wordt dit een uitklapbare subgroep in plaats van een link. */
  children?: MenuItem[];
}

const menuItems: {
  sectionKey:
    | 'orderManagement'
    | 'warehouseManagement'
    | 'analytics'
    | 'system'
    | 'administrativeSection';
  items: MenuItem[];
}[] = [
  {
    sectionKey: 'orderManagement',
    items: [
      { id: 'orders', labelKey: 'orders', icon: ShoppingCart },
      { id: 'purchasing', labelKey: 'purchasing', icon: Package },
      { id: 'tracking', labelKey: 'tracking', icon: QrCode, adminOnly: true },
      { id: 'labels', labelKey: 'labels', icon: FileText, adminOnly: true },
      { id: 'shipments', labelKey: 'shipments', icon: Truck, adminOnly: true },
      { id: 'returns', labelKey: 'returns', icon: RotateCcw, adminOnly: true },
    ],
  },
  {
    sectionKey: 'warehouseManagement',
    items: [
      { id: 'inventory-management', labelKey: 'inventoryManagement', icon: Warehouse },
      { id: 'inventory-analysis', labelKey: 'inventoryAnalysis', icon: BarChart3, adminOnly: true },
      { id: 'location-management', labelKey: 'locationManagement', icon: MapPin, adminOnly: true },
      { id: 'product-management', labelKey: 'productManagement', icon: Package },
      { id: 'carriers', labelKey: 'carriers', icon: Truck, adminOnly: true },
    ],
  },
  {
    sectionKey: 'analytics',
    items: [
      // Subgroepen. Per tab die we bouwen komt hier een item bij.
      {
        id: 'group-sales',
        labelKey: 'salesSection',
        adminOnly: true,
        children: [
          { id: 'analytics-overview', labelKey: 'analyticsOverview', icon: LayoutDashboard, adminOnly: true },
          { id: 'product-analytics', labelKey: 'productAnalytics', icon: BarChart3, adminOnly: true },
          { id: 'store-trends', labelKey: 'storeTrends', icon: TrendingUp, adminOnly: true },
          { id: 'channel-profitability', labelKey: 'channelProfitability', icon: PieChart, adminOnly: true },
          { id: 'targets-forecast', labelKey: 'targetsForecast', icon: Target, adminOnly: true },
        ],
      },
      {
        id: 'group-finance',
        labelKey: 'financeSection',
        adminOnly: true,
        children: [
          { id: 'daily-summary', labelKey: 'dailySummary', icon: CalendarDays, adminOnly: true },
          { id: 'monthly-summary', labelKey: 'monthlySummary', icon: CalendarRange, adminOnly: true },
          { id: 'vat-overview', labelKey: 'vatOverview', icon: Landmark, adminOnly: true },
          { id: 'payouts', labelKey: 'payouts', icon: CreditCard, adminOnly: true },
          { id: 'ad-spend', labelKey: 'adSpend', icon: Megaphone, adminOnly: true },
          { id: 'fixed-costs', labelKey: 'fixedCosts', icon: Building2, adminOnly: true },
        ],
      },
      {
        id: 'group-operations',
        labelKey: 'operationsSection',
        adminOnly: true,
        children: [
          { id: 'signals', labelKey: 'signals', icon: AlertTriangle, adminOnly: true },
          { id: 'cancel-analysis', labelKey: 'cancelAnalysis', icon: PackageX, adminOnly: true },
          { id: 'returns-analytics', labelKey: 'returnsAnalytics', icon: Undo2, adminOnly: true },
        ],
      },
      {
        id: 'group-exports',
        labelKey: 'exportsSection',
        adminOnly: true,
        children: [
          { id: 'analytics-exports', labelKey: 'analyticsExports', icon: Download, adminOnly: true },
        ],
      },
    ],
  },
  {
    sectionKey: 'system',
    items: [
      { id: 'integrations', labelKey: 'integrations', icon: Plug },
      { id: 'automation-rules', labelKey: 'automationRules', icon: Workflow, adminOnly: true },
      { id: 'settings', labelKey: 'settings', icon: Settings, adminOnly: true },
    ],
  },
  {
    sectionKey: 'administrativeSection',
    items: [
      { id: 'administrative', labelKey: 'administrative', icon: Shield },
    ],
  },
];

export function AppSidebar({ activeView, onViewChange, className }: AppSidebarProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'orderManagement'
  ]);

  const isGlobalAdmin = 
    user?.isGlobalAdmin === true || 
    user?.isGlobalAdmin === 1 || 
    user?.isGlobalAdmin === '1' ||
    user?.isGlobalAdmin === 'true' ||
    user?.email === 'admin@dropsyncr.com';

  const filteredMenuItems = menuItems.map(group => {
    if (group.sectionKey === 'administrativeSection' && !isGlobalAdmin) {
      return null;
    }

    const filteredItems = group.items
      .filter(item => {
        if (item.adminOnly && !isGlobalAdmin) return false;
        return true;
      })
      .map(item => {
        if (!item.children) return item;
        // Een subgroep zonder zichtbare items heeft geen bestaansrecht.
        const children = item.children.filter(child => !(child.adminOnly && !isGlobalAdmin));
        return children.length > 0 ? { ...item, children } : null;
      })
      .filter(Boolean) as MenuItem[];

    if (filteredItems.length === 0) return null;

    return { ...group, items: filteredItems };
  }).filter(Boolean) as typeof menuItems;

  const toggleSection = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const isSectionExpanded = (section: string) => expandedSections.includes(section);

  return (
    <aside className={cn("w-64 bg-white border-r border-slate-200 flex flex-col h-dvh sticky top-0 self-stretch", className)}>
      {/* Logo */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg flex-shrink-0 p-1">
            <img src={logo} alt="Dropsyncr" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-lg bg-gradient-to-r fw-bolder from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            <b>DROPSYNCR</b>
          </h2>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto p-4">
        {/* Losstaand bovenaan, opent het analytics-overzicht. */}
        {isGlobalAdmin && (
          <div className="mb-6">
            <SidebarLink
              item={{ id: 'dashboard', labelKey: 'dashboard', icon: LayoutDashboard }}
              isActive={activeView === 'dashboard'}
              label={t('dashboard')}
              onClick={() => onViewChange('dashboard')}
            />
          </div>
        )}

        {filteredMenuItems.map((group) => {
          const isAdminSection = group.sectionKey === 'administrativeSection';
          const shouldBeExpanded = isSectionExpanded(group.sectionKey);
          
          return (
            <div key={group.sectionKey} className="mb-6">
              <button
                onClick={() => toggleSection(group.sectionKey)}
                className={cn(
                  "flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider transition-colors mb-2",
                  isAdminSection && isGlobalAdmin
                    ? "text-purple-600 hover:text-purple-700 font-semibold"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <span className="flex items-center gap-2">
                  {isAdminSection && isGlobalAdmin && (
                    <Shield className="w-3 h-3" />
                  )}
                  {t(group.sectionKey)}
                </span>
                {shouldBeExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
              
              {shouldBeExpanded && (
                <div className="space-y-1">
                  {group.items.map((item) => {
                    if (item.children) {
                      const subExpanded = isSectionExpanded(item.id);
                      return (
                        <div key={item.id}>
                          <button
                            onClick={() => toggleSection(item.id)}
                            className="flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <span>{t(item.labelKey)}</span>
                            {subExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>
                          {subExpanded && (
                            <div className="space-y-1 pl-3 ml-3 border-l border-slate-100">
                              {item.children.map((child) => (
                                <SidebarLink
                                  key={child.id}
                                  item={child}
                                  isActive={activeView === child.id}
                                  label={t(child.labelKey)}
                                  onClick={() => onViewChange(child.id)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <SidebarLink
                        key={item.id}
                        item={item}
                        isActive={activeView === item.id}
                        label={t(item.labelKey)}
                        onClick={() => onViewChange(item.id)}
                      />
                    );
                  })}
                </div>
              )}
           </div>
          );
        })}
      </nav>
    </aside>
  );
}

function SidebarLink({
  item,
  isActive,
  label,
  onClick,
}: {
  item: MenuItem;
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-all",
        isActive
          ? "bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 shadow-sm"
          : "text-slate-700 hover:bg-slate-50"
      )}
    >
      {Icon && (
        <Icon className={cn("w-4 h-4", isActive ? "text-indigo-600" : "text-slate-400")} />
      )}
      <span>{label}</span>
    </button>
  );
}