import { useState, useEffect } from 'react';
import { Building2, ChevronDown, LogOut, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

interface ProfileSwitcherProps {
  activeProfile: string;
  onProfileChange: (profileId: string) => void;
}

export function ProfileSwitcher({ activeProfile, onProfileChange }: ProfileSwitcherProps) {
  const { user, token, logout } = useAuth();
  const [installations, setInstallations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only load installations if user is authenticated and token exists
    if (user && token) {
      // Small delay to ensure token is fully set in localStorage
      const timer = setTimeout(() => {
        loadInstallations();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setLoading(false);
    }
  }, [user, token]);

  const loadInstallations = async (retryCount = 0) => {
    // Double-check token exists before making request
    const currentToken = localStorage.getItem('token');
    if (!currentToken) {
      console.log('[ProfileSwitcher] No token found, skipping installation load');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('[ProfileSwitcher] Loading installations, token length:', currentToken.length);
      const data = await api.getInstallations();
      console.log('[ProfileSwitcher] Installations loaded successfully:', data?.length || 0);
      setInstallations(data || []);
      
      // Set first installation as active if none selected or current one is invalid
      if (data && data.length > 0) {
        const currentExists = data.some(i => i.id.toString() === activeProfile);
        if (!activeProfile || !currentExists) {
          onProfileChange(data[0].id.toString());
        }
      }
    } catch (error: any) {
      console.error('[ProfileSwitcher] Failed to load installations:', error.message);
      
      // Retry once after a short delay if it's an auth error (might be timing issue)
      if (retryCount === 0 && error.message?.includes('session') || error.message?.includes('Authentication')) {
        console.log('[ProfileSwitcher] Retrying installation load after delay...');
        setTimeout(() => {
          loadInstallations(1);
        }, 500);
        return;
      }
      
      // If it's an auth error after retry, don't show it - the API service will handle logout
      // For other errors, just set empty installations
      if (!error.message?.includes('session') && !error.message?.includes('Authentication')) {
        setInstallations([]);
      }
    } finally {
      // Always set loading to false after initial attempt or retry
      if (retryCount > 0) {
        setLoading(false);
      } else {
        // For initial attempt (retryCount === 0), only set loading to false if:
        // 1. We're not retrying (which would have returned early in the catch block), OR
        // 2. We successfully completed the request (no early returns in catch)
        setLoading(false);
      }
    }
  };

  const currentInstallation = installations.find(i => i.id.toString() === activeProfile) || installations[0];
  
  const ownStores = installations.filter(i => i.type === 'own');
  const fulfilmentStores = installations.filter(i => i.type === 'fulfilment');

  if (loading) {
    return (
      <Button variant="outline" className="gap-2 border-slate-200 shadow-sm" disabled>
        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
        <span>Laden...</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 border-slate-200 shadow-sm hover:bg-slate-50">
          <Building2 className="w-4 h-4 text-indigo-600" />
          <span>{currentInstallation?.name || 'Geen installatie'}</span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 border-slate-200 shadow-lg">
        <DropdownMenuLabel className="text-slate-500">Eigen Stores</DropdownMenuLabel>
        {ownStores.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-slate-400">Geen eigen stores</div>
        ) : (
          ownStores.map(installation => (
            <DropdownMenuItem
              key={installation.id}
              onClick={() => onProfileChange(installation.id.toString())}
              className={activeProfile === installation.id.toString() ? 'bg-indigo-50 text-indigo-900' : ''}
            >
              <div className="flex flex-col gap-1">
                <span>{installation.name}</span>
                <span className="text-xs text-slate-500">{installation.country}</span>
              </div>
            </DropdownMenuItem>
          ))
        )}
        
        {fulfilmentStores.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-slate-500">Fulfilment Klanten</DropdownMenuLabel>
            {fulfilmentStores.map(installation => (
              <DropdownMenuItem
                key={installation.id}
                onClick={() => onProfileChange(installation.id.toString())}
                className={activeProfile === installation.id.toString() ? 'bg-indigo-50 text-indigo-900' : ''}
              >
                <div className="flex flex-col gap-1">
                  <span>{installation.name}</span>
                  {installation.contract && (
                    <span className="text-xs text-slate-500">{installation.contract}</span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={logout} className="text-red-600 focus:text-red-600 focus:bg-red-50">
          <LogOut className="w-4 h-4 mr-2" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
