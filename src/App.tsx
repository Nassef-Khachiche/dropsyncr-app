import React, { useState } from 'react';
import { AppSidebar } from './components/AppSidebar';
import { OrdersOverview } from './components/OrdersOverview';
import { TrackingManager } from './components/TrackingManager';
import { LabelPrinting } from './components/LabelPrinting';
import { Shipments } from './components/Shipments';
import { Integrations } from './components/Integrations';
import { Carriers } from './components/Carriers';
import { ProfileSwitcher } from './components/ProfileSwitcher';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { GlobalTextTranslator } from './components/GlobalTextTranslator';
import { Login } from './components/Login';
import { Administrative } from './components/Administrative';
import { AutomatiseringsRegels } from './components/AutomatiseringsRegels';
import { Dashboard } from './components/Dashboard';
import { FulfillmentAnalytics } from './components/FulfillmentAnalytics';
import { KLKAnalytics } from './components/KLKAnalytics';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { InventoryManagement } from './components/InventoryManagement';
import { InventoryAnalysis } from './components/InventoryAnalysis';
import { Settings } from './components/Settings';
import { Retouren } from './components/Retouren';
import { LocationManager } from './components/LocationManager';
import { ProductManagement } from './components/ProductManagement';
import { OrderManagement } from './components/OrderManagement';
import { Loader2, Menu, X } from 'lucide-react';
import { Toaster } from 'sonner';
import { Button } from './components/ui/button';

export default function App() {
  const { isAuthenticated, loading, logout, user } = useAuth();
  const { t } = useLanguage();
  const [activeProfile, setActiveProfile] = useState<string | null>(
    () => localStorage.getItem('activeProfile')
  );

  const handleProfileChange = (profileId: string) => {
    localStorage.setItem('activeProfile', profileId);
    setActiveProfile(profileId);
  };
  const [activeView, setActiveView] = useState('orders');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isGlobalAdmin =
    user?.isGlobalAdmin === true ||
    user?.isGlobalAdmin === 1 ||
    user?.isGlobalAdmin === '1' ||
    user?.isGlobalAdmin === 'true' ||
    user?.email === 'admin@dropsyncr.com';

  React.useEffect(() => {
    const handleLogout = () => {
      localStorage.removeItem('activeProfile');
      logout();
    };
    
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [logout]);

  const renderView = () => {
    switch (activeView) {
      case 'orders':
        return <OrdersOverview activeProfile={activeProfile} isGlobalAdmin={isGlobalAdmin} />;
      case 'purchasing':
        return <OrderManagement activeProfile={activeProfile || ''} />;
      case 'tracking':
        return <TrackingManager activeProfile={activeProfile} />;
      case 'labels':
        return <LabelPrinting activeProfile={activeProfile} />;
      case 'shipments':
        return <Shipments activeProfile={activeProfile} />;
      case 'returns':
        return <Retouren activeProfile={activeProfile} />;
      case 'integrations':
        return <Integrations activeProfile={activeProfile} />;
      case 'carriers':
        return <Carriers activeProfile={activeProfile} />;
      case 'administrative':
        return <Administrative activeProfile={activeProfile} />;
      case 'automation-rules':
        return <AutomatiseringsRegels activeProfile={activeProfile} />;
      case 'dashboard':
        return <Dashboard activeProfile={activeProfile} />;
      case 'klk-analytics':
        return <KLKAnalytics activeProfile={activeProfile} />;
      case 'fulfillment-analytics':
        return <FulfillmentAnalytics activeProfile={activeProfile} />;
      case 'inventory-management':
        return <InventoryManagement activeProfile={activeProfile} isGlobalAdmin={isGlobalAdmin} />;
      case 'inventory-analysis':
        return <InventoryAnalysis activeProfile={activeProfile} />;
      case 'location-management':
        return <LocationManager activeProfile={activeProfile || ''} isGlobalAdmin={isGlobalAdmin} />;
      case 'product-management':
        return <ProductManagement activeProfile={activeProfile} isGlobalAdmin={isGlobalAdmin} />;
      case 'settings':
        return <Settings activeProfile={activeProfile} />;
      default:
        return <OrdersOverview activeProfile={activeProfile} isGlobalAdmin={isGlobalAdmin} />;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-600">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="app-shell flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 overflow-hidden">
      <GlobalTextTranslator />
      <Toaster richColors position="top-right" />
      {mobileMenuOpen && (
        <div className="mobile-navigation-layer" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="mobile-navigation-backdrop" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />
          <div className="mobile-navigation-panel">
            <button className="mobile-navigation-close" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)}>
              <X className="w-5 h-5" />
            </button>
            <AppSidebar
              className="app-sidebar-mobile"
              activeView={activeView}
              onViewChange={(view) => {
                setActiveView(view);
                setMobileMenuOpen(false);
              }}
            />
          </div>
        </div>
      )}
      <AppSidebar className="app-sidebar-desktop" activeView={activeView} onViewChange={setActiveView} />
      
      <div className="app-workspace flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-40 shadow-sm">
          <div className="app-header px-8 py-5 flex items-center justify-end">
            <Button
              className="mobile-menu-trigger"
              variant="outline"
              size="icon"
              aria-label="Open navigation"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="app-header-actions flex items-center gap-3">
              <LanguageSwitcher />
              <ProfileSwitcher 
                activeProfile={activeProfile} 
                onProfileChange={handleProfileChange} 
              />
            </div>
          </div>
        </header>

        <main className="app-main flex-1 p-8 overflow-auto min-w-0">
          <div className="min-w-0 max-w-full">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}