import { useState } from 'react';
import { LogIn, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/dropsyncr-wit-transparant.png';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login mislukt. Probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex" style={{ background: '#1a1a2e' }}>

      {/* Linker kant */}
      <div className="flex-1 relative flex flex-col p-12" style={{ background: 'linear-gradient(135deg, #2d1b69 0%, #4f46e5 50%, #7c3aed 100%)' }}>
        
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full opacity-30" style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #a78bfa, transparent)' }} />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden">
            <img src={logo} alt="Dropsyncr" className="w-full h-full object-cover" />
          </div>
          <span className="text-white font-bold text-lg tracking-widest">DROPSYNCR</span>
        </div>

        {/* Tekst midden */}
        <div className="relative z-10" style={{ marginTop: '212px' }}>
          <h2 className="text-3xl font-bold text-white leading-snug mb-3">
            Jouw fulfilment,<br />volledig in controle.
          </h2>
          <p className="text-white text-sm">Slim platform voor orders, voorraad en verzending.</p>
          <div className="flex items-center gap-2 mt-8">
            <div className="w-6 h-1 rounded-full bg-white opacity-40" />
            <div className="w-6 h-1 rounded-full bg-white opacity-40" />
            <div className="w-8 h-1 rounded-full bg-white" />
          </div>
        </div>

        {/* Footer links */}
        <div className="relative z-10 " style={{ marginTop: '430px' }}>
          <p className="text-white text-xs">© 2026 Dropsyncr — Alle rechten voorbehouden</p>
        </div>
      </div>

      {/* Rechter kant */}
      <div className="flex-1 flex flex-col justify-between p-12" style={{ background: '#1e1e2e' }}>

        {/* Lege ruimte bovenin zodat formulier gecentreerd is */}
        <div />

        {/* Formulier gecentreerd */}
        <div className="flex items-center justify-center">
          <div style={{ width: '800px' }}>

            <div className="mb-8">
              <h1 className="text-2xl font-bold mb-2" style={{ color: '#f1f5f9' }}>Inloggen</h1>
              <p className="text-sm" style={{ color: '#94a3b8' }}>Voer je gegevens in om verder te gaan</p>
            </div>

            {error && (
              <div className="mb-5 p-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-xl">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#cbd5e1' }}>
                  E-mailadres
                </label>
                <div className="relative">
                  <Mail className="absolute top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6366f1', left: '16px' }} />
                  <input
                    type="email"
                    placeholder="jouw@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    style={{ background: '#2a2a3e', border: '1px solid #3a3a5c', color: '#f1f5f9', paddingLeft: '48px' }}
                    className="w-full h-12 pr-4 rounded-xl text-sm outline-none transition-all"
                    onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                    onBlur={(e) => e.target.style.borderColor = '#3a3a5c'}
                  />
                </div>
              </div>

              {/* Wachtwoord */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#cbd5e1' }}>
                  Wachtwoord
                </label>
                <div className="relative">
                  <Lock className="absolute top-1/2 -translate-y-1/2 h-5 w-5" style={{ color: '#6366f1', left: '16px' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    style={{ background: '#2a2a3e', border: '1px solid #3a3a5c', color: '#f1f5f9', paddingLeft: '48px' }}
                    className="w-full h-12 pr-12 rounded-xl text-sm outline-none transition-all"
                    onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                    onBlur={(e) => e.target.style.borderColor = '#3a3a5c'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2"
                    style={{ color: '#64748b' }}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Login knop */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
                style={{ background: 'linear-gradient(to right, #4f46e5, #7c3aed)' }}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Inloggen...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    Inloggen
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Footer rechts — zelfde hoogte als links */}
        <div>
          <p className="text-xs" style={{ color: '#ffffff' }}>
            
          </p>
        </div>
      </div>
    </div>
  );
}