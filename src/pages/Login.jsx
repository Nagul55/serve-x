import { useState } from 'react';
import { Mail, KeyRound, ArrowRight, UserRound, Shield, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { servexApi } from '@/api/servexClient';

const LOGIN_LOGO = '/assets/Logo.png';
const DEMO_CREDENTIALS = {
  coordinator: {
    email: 'coordinator@gmail.com',
    password: 'coordinator@123',
  },
  field_officer: {
    email: 'fieldofficer@gmail.com',
    password: 'fieldofficer@gmail.com',
  },
};

export default function Login({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState(DEMO_CREDENTIALS.coordinator.email);
  const [role, setRole] = useState('coordinator');
  const [password, setPassword] = useState(DEMO_CREDENTIALS.coordinator.password);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !role) {
      setErrorMessage('Email, role, and password are required.');
      return;
    }

    setIsLoggingIn(true);
    setErrorMessage('');

    try {
      const result = await servexApi.auth.login({
        email: email.trim().toLowerCase(),
        role,
        password,
      });
      await onLoginSuccess?.();
      if (result?.user?.role === 'field_officer') {
        navigate('/field-officer');
      } else {
        navigate('/');
      }
    } catch (error) {
      setErrorMessage(error.message || 'Login failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRoleChange = (nextRole) => {
    setRole(nextRole);
    const next = DEMO_CREDENTIALS[nextRole] || DEMO_CREDENTIALS.coordinator;
    setEmail(next.email);
    setPassword(next.password);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-white text-black">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.06),transparent_28%,rgba(0,0,0,0.08)_68%,transparent)]" />
      <div className="absolute -top-20 -left-24 h-72 w-72 rounded-full border border-black/10" />
      <div className="absolute -bottom-20 right-0 h-72 w-72 rounded-full border border-black/10" />

      <div className="relative min-h-screen grid place-items-center p-4 sm:p-6">
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center">
          <div className="flex flex-col items-center lg:items-start justify-center gap-0 lg:pr-4">
            <div className="w-44 h-40 sm:w-56 sm:h-52 md:w-72 md:h-64 overflow-hidden">
              <img
                src={LOGIN_LOGO}
                alt="ServeX"
                className="w-full h-full object-cover object-center scale-[1.55]"
              />
            </div>
            <h1 className="mt-1 text-3xl sm:text-4xl md:text-5xl font-extrabold font-jakarta leading-tight tracking-tight text-center lg:text-left">
              Sign In to
              <span className="block text-black/70">ServeX Dashboard</span>
            </h1>
          </div>

          <div className="rounded-3xl border border-black/15 bg-white shadow-[0_25px_100px_rgba(0,0,0,0.12)] p-6 md:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold font-jakarta">Login</h2>
              <p className="text-sm text-black/60 mt-1">Use the prefilled hackathon credentials and continue.</p>
            </div>

            <form className="space-y-4" onSubmit={handleLogin}>
              <div>
                <label className="text-sm font-medium text-black/90">Email ID</label>
                <div className="mt-1.5 relative">
                  <Mail className="h-4 w-4 text-black/45 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@servex.org"
                    className="pl-9 bg-white border-black/25 text-black placeholder:text-black/40 focus-visible:ring-black"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-black/90">Role</label>
                <div className="mt-1.5 relative">
                  <UserRound className="h-4 w-4 text-black/45 absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                  <Select value={role} onValueChange={handleRoleChange}>
                    <SelectTrigger className="pl-9 h-11 bg-gradient-to-b from-white to-slate-50 border-black/20 text-black focus:ring-black/40 rounded-xl shadow-sm">
                      <SelectValue placeholder="Choose role" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-black/15 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)]">
                      <SelectItem value="coordinator" className="rounded-lg py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <Shield className="h-4 w-4 text-black/70" />
                          Coordinator
                        </span>
                      </SelectItem>
                      <SelectItem value="field_officer" className="rounded-lg py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <UserCircle2 className="h-4 w-4 text-black/70" />
                          Field Officer
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-black/90">Password</label>
                <div className="mt-1.5 relative">
                  <KeyRound className="h-4 w-4 text-black/45 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="pl-9 bg-white border-black/25 text-black placeholder:text-black/40 focus-visible:ring-black"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-black text-white hover:bg-black/85 font-semibold"
              >
                {isLoggingIn ? 'Signing In...' : 'Sign In'}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>

              {errorMessage ? (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {errorMessage}
                </p>
              ) : null}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
