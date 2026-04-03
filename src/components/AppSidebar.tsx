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
  BarChart3
} from 'lucide-react';
import { useState } from 'react';
import { cn } from './ui/utils';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import logo from '../assets/dropsyncr-logo.png';

interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

interface MenuItem {
  id: string;
  labelKey: 'orders' | 'tracking' | 'labels' | 'integrations' | 'carriers' | 'settings' | 'automationRules' | 'administrative' | 'dashboard' | 'klkAnalytics' | 'fulfillmentAnalytics' | 'warehouseManagement' | 'inventoryManagement' | 'inventoryAnalysis';
  icon: any;
  adminOnly?: boolean;
  children?: MenuItem[];
}

const menuItems: { sectionKey: 'orderManagement' | 'system' | 'warehouseManagement' | 'analytics' | 'administrativeSection'; items: MenuItem[] }[] = [
  {
    sectionKey: 'orderManagement',
    items: [
      { id: 'orders', labelKey: 'orders', icon: ShoppingCart },
      { id: 'tracking', labelKey: 'tracking', icon: QrCode },
      { id: 'labels', labelKey: 'labels', icon: FileText },
      { id: 'integrations', labelKey: 'integrations', icon: Plug },
      { id: 'carriers', labelKey: 'carriers', icon: Truck },
    ],
  },
  {
    sectionKey: 'system',
    items: [
      { id: 'automation-rules', labelKey: 'automationRules', icon: Workflow },
    ],
  },
  {
    sectionKey: 'warehouseManagement',
    items: [
      { id: 'inventory-management', labelKey: 'inventoryManagement', icon: Warehouse },
      { id: 'inventory-analysis', labelKey: 'inventoryAnalysis', icon: BarChart3 },
    ],
  },
  {
    sectionKey: 'analytics',
    items: [
      { id: 'dashboard', labelKey: 'dashboard', icon: BarChart2 },
      { id: 'klk-analytics', labelKey: 'klkAnalytics', icon: TrendingUp, adminOnly: true },
      { id: 'fulfillment-analytics', labelKey: 'fulfillmentAnalytics', icon: Package, adminOnly: true },
    ],
  },
  {
    sectionKey: 'administrativeSection',
    items: [
      { id: 'administrative', labelKey: 'administrative', icon: Shield },
    ],
  },
];

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
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
    // Verberg administratieve sectie voor niet-admins
    if (group.sectionKey === 'administrativeSection' && !isGlobalAdmin) {
      return null;
    }

    // Filter adminOnly items binnen een sectie
    const filteredItems = group.items.filter(item => {
      if (item.adminOnly && !isGlobalAdmin) return false;
      return true;
    });

    // Als er geen items meer over zijn, verberg de hele sectie
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
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full overflow-hidden shadow-lg flex-shrink-0">
            <img src={logo} alt="Dropsyncr" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-lg bg-gradient-to-r fw-bolder from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            <b>DROPSYNCR</b>
          </h2>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
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
                    const Icon = item.icon;
                    const isActive = activeView === item.id;
                    
                    return (
                      <button
                        key={item.id}
                        onClick={() => onViewChange(item.id)}
                        className={cn(
                          "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-all",
                          isActive
                            ? "bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 shadow-sm"
                            : "text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        <Icon className={cn(
                          "w-4 h-4",
                          isActive ? "text-indigo-600" : "text-slate-400"
                        )} />
                        <span>{t(item.labelKey)}</span>
                      </button>
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