import React, { useState } from 'react';
import { AppSidebar } from './components/AppSidebar';
import { OrdersOverview } from './components/OrdersOverview';
import { TrackingManager } from './components/TrackingManager';
import { LabelPrinting } from './components/LabelPrinting';
import { Integrations } from './components/Integrations';
import { Carriers } from './components/Carriers';
import { Settings } from './components/Settings';
import { ProfileSwitcher } from './components/ProfileSwitcher';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { GlobalTextTranslator } from './components/GlobalTextTranslator';
import { Login } from './components/Login';
import { Administrative } from './components/Administrative';
import { AutomatiseringsRegels } from './components/AutomatiseringsRegels';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { Loader2 } from 'lucide-react';

export default function App() {
  const { isAuthenticated, loading, logout } = useAuth();
  const { t } = useLanguage();
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('orders');

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
      case 'orders':
        return <OrdersOverview activeProfile={activeProfile} />;
      case 'tracking':
        return <TrackingManager activeProfile={activeProfile} />;
      case 'labels':
        return <LabelPrinting activeProfile={activeProfile} />;
      case 'integrations':
        return <Integrations activeProfile={activeProfile} />;
      case 'carriers':
        return <Carriers activeProfile={activeProfile} />;
      case 'settings':
        return <Settings activeProfile={activeProfile} />;
      case 'administrative':
        return <Administrative activeProfile={activeProfile} />;
      case 'automation-rules':
        return <AutomatiseringsRegels activeProfile={activeProfile} />;
      default:
        return <OrdersOverview activeProfile={activeProfile} />;
    }
  };

  // Show loading spinner while checking authentication
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

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <Login />;
  }

  // Show main app if authenticated
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      <GlobalTextTranslator />
      {/* Sidebar */}
      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-40 shadow-sm">
          <div className="px-8 py-5 flex items-center justify-end">
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <ProfileSwitcher 
                activeProfile={activeProfile} 
                onProfileChange={setActiveProfile} 
              />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-auto">
          <div className="mx-auto">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}
