import React, { useState } from 'react';
import { 
  RotateCcw, 
  Plug, 
  Truck,
  Warehouse,
  TrendingUp,
  Sparkles,
  ListChecks
} from 'lucide-react';
import { AppSidebar } from './components/AppSidebar';
import { Dashboard } from './components/Dashboard';
import { OrdersOverview } from './components/OrdersOverview';
import { TrackingManager } from './components/TrackingManager';
import { LabelPrinting } from './components/LabelPrinting';
import { Integrations } from './components/Integrations';
import { Carriers } from './components/Carriers';
import { ProductOverview } from './components/ProductOverview';
import { InventoryAnalysis } from './components/InventoryAnalysis';
import { FulfillmentAnalytics } from './components/FulfillmentAnalytics';
import { TicketSystem } from './components/TicketSystem';
import { AIListingBuilder } from './components/AIListingBuilder';
import { Settings } from './components/Settings';
import { PlaceholderView } from './components/PlaceholderView';
import { ProfileSwitcher } from './components/ProfileSwitcher';
import { Login } from './components/Login';
import { Administrative } from './components/Administrative';
import { useAuth } from './contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function App() {
  const { isAuthenticated, loading, logout } = useAuth();
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('dashboard');

  // Listen for auth logout events (from API service)
  React.useEffect(() => {
    const handleLogout = () => {
      logout();
    };
    
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [logout]);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard activeProfile={activeProfile} />;
      case 'orders':
        return <OrdersOverview activeProfile={activeProfile} />;
      case 'tracking':
        return <TrackingManager activeProfile={activeProfile} />;
      case 'labels':
        return <LabelPrinting activeProfile={activeProfile} />;
      case 'returns':
        return <PlaceholderView 
          title="Retouren" 
          description="Beheer en verwerk alle retouren van je klanten"
          icon={RotateCcw}
        />;
      case 'integrations':
        return <Integrations activeProfile={activeProfile} />;
      case 'carriers':
        return <Carriers activeProfile={activeProfile} />;
      case 'inventory':
        return <ProductOverview activeProfile={activeProfile} />;
      case 'inventory-analysis':
        return <InventoryAnalysis activeProfile={activeProfile} />;
      case 'ai-listing':
        return <AIListingBuilder activeProfile={activeProfile} />;
      case 'assortment':
        return <PlaceholderView 
          title="Assortiment Checker" 
          description="Analyseer en optimaliseer je productassortiment"
          icon={ListChecks}
        />;
      case 'settings':
        return <Settings activeProfile={activeProfile} />;
      case 'fulfillment-analytics':
        return <FulfillmentAnalytics activeProfile={activeProfile} />;
      case 'tickets':
        return <TicketSystem activeProfile={activeProfile} />;
      case 'administrative':
        return <Administrative activeProfile={activeProfile} />;
      default:
        return <Dashboard activeProfile={activeProfile} />;
    }
  };

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login />;
  }

  // Show main app if authenticated
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* Sidebar */}
      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-40 shadow-sm">
          <div className="px-8 py-5 flex items-center justify-end">
            <ProfileSwitcher 
              activeProfile={activeProfile} 
              onProfileChange={setActiveProfile} 
            />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-auto">
          <div className="max-w-[1400px] mx-auto">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}
