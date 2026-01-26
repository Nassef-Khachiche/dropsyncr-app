import { 
  Package, 
  ShoppingCart, 
  RotateCcw, 
  Plug, 
  Truck,
  Warehouse,
  TrendingUp,
  Sparkles,
  ListChecks,
  BarChart3,
  ChevronDown,
  ChevronRight,
  QrCode,
  FileText,
  Settings,
  MessageSquare,
  Shield
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from './ui/utils';
import { useAuth } from '../contexts/AuthContext';
import logo from 'figma:asset/b2d66254c08ae9c8c93a9cfe0d50ea2c9c5cd522.png';

interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  children?: MenuItem[];
}

const menuItems: { section: string; items: MenuItem[] }[] = [
  {
    section: 'ORDER MANAGEMENT',
    items: [
      {
        id: 'orders',
        label: 'Bestellingen',
        icon: ShoppingCart,
      },
      {
        id: 'tracking',
        label: 'Tracking',
        icon: QrCode,
      },
      {
        id: 'labels',
        label: 'Labels',
        icon: FileText,
      },
      {
        id: 'returns',
        label: 'Retouren',
        icon: RotateCcw,
      },
      {
        id: 'integrations',
        label: 'Integraties',
        icon: Plug,
      },
      {
        id: 'carriers',
        label: 'Vervoerders',
        icon: Truck,
      },
    ],
  },
  {
    section: 'WAREHOUSE MANAGEMENT',
    items: [
      {
        id: 'inventory',
        label: 'Voorraad managen',
        icon: Warehouse,
      },
      {
        id: 'inventory-analysis',
        label: 'Voorraadanalyse',
        icon: TrendingUp,
      },
    ],
  },
  {
    section: 'CONTENT ASSISTENT',
    items: [
      {
        id: 'ai-listing',
        label: 'AI Listing Builder',
        icon: Sparkles,
      },
      {
        id: 'assortment',
        label: 'Assortiment Checker',
        icon: ListChecks,
      },
    ],
  },
  {
    section: 'SYSTEEM',
    items: [
      {
        id: 'settings',
        label: 'Instellingen',
        icon: Settings,
      },
    ],
  },
  {
    section: 'ANALYTICS',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: BarChart3,
      },
      {
        id: 'fulfillment-analytics',
        label: 'Fulfilment Analytics',
        icon: TrendingUp,
      },
    ],
  },
  {
    section: 'SUPPORT',
    items: [
      {
        id: 'tickets',
        label: 'Support Tickets',
        icon: MessageSquare,
      },
    ],
  },
  {
    section: 'ADMINISTRATIEF',
    items: [
      {
        id: 'administrative',
        label: 'Administratief',
        icon: Shield,
      },
    ],
  },
];

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  const { user } = useAuth();
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'ORDER MANAGEMENT',
    'ANALYTICS'
  ]);

  // Update expanded sections when user loads and is global admin
  useEffect(() => {
    const isGlobalAdmin = user?.isGlobalAdmin === true || user?.isGlobalAdmin === 1 || user?.isGlobalAdmin === '1';
    
    if (isGlobalAdmin) {
      if (!expandedSections.includes('ADMINISTRATIEF')) {
        setExpandedSections(prev => [...prev, 'ADMINISTRATIEF']);
      }
    } else {
      // Remove ADMINISTRATIEF if user is not admin
      if (expandedSections.includes('ADMINISTRATIEF')) {
        setExpandedSections(prev => prev.filter(s => s !== 'ADMINISTRATIEF'));
      }
    }
  }, [user?.isGlobalAdmin, user]);

  // Filter menu items based on user permissions
  const filteredMenuItems = menuItems.map(group => {
    // Hide ADMINISTRATIEF section for non-global admins
    if (group.section === 'ADMINISTRATIEF') {
      // Check multiple possible values (true, 1, "1", "true")
      const isGlobalAdmin = 
        user?.isGlobalAdmin === true || 
        user?.isGlobalAdmin === 1 || 
        user?.isGlobalAdmin === '1' ||
        user?.isGlobalAdmin === 'true' ||
        user?.email === 'admin@dropsyncr.com'; // Fallback: show for admin email
      
      if (!isGlobalAdmin) {
        return null;
      }
    }
    return group;
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
          <div>
            <h2 className="text-lg bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">dropsyncr</h2>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        {filteredMenuItems.map((group) => {
          const isAdminSection = group.section === 'ADMINISTRATIEF';
          const isGlobalAdmin = user?.isGlobalAdmin === true || user?.isGlobalAdmin === 1 || user?.isGlobalAdmin === '1';
          // Always expand ADMINISTRATIEF section for global admins
          const shouldBeExpanded = isSectionExpanded(group.section) || (isAdminSection && isGlobalAdmin);
          
          return (
            <div key={group.section} className="mb-6">
              <button
                onClick={() => toggleSection(group.section)}
                className={cn(
                  "flex items-center justify-between w-full px-3 py-2 text-xs uppercase tracking-wider transition-colors mb-2",
                  isAdminSection && user?.isGlobalAdmin
                    ? "text-purple-600 hover:text-purple-700 font-semibold"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <span className="flex items-center gap-2">
                  {isAdminSection && isGlobalAdmin && (
                    <Shield className="w-3 h-3" />
                  )}
                  {group.section}
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
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200">
        <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm text-slate-900">Upgrade naar Pro</p>
              <p className="text-xs text-slate-600 mt-0.5">Unlock alle features</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
