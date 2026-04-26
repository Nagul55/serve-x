import { useEffect, useState } from 'react';
import { Mail, KeyRound, ArrowRight, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { servexApi } from '@/api/servexClient';

const LOGIN_LOGO = '/assets/Logo.png';

export default function Login({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('coordinator');
  const [otp, setOtp] = useState('');
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [devOtp, setDevOtp] = useState('');

  useEffect(() => {
    const authFlow = servexApi.auth.getStoredAuthFlow?.();
    if (authFlow?.requiresOtp && authFlow?.email && authFlow?.role) {
      setEmail(authFlow.email);
      setRole(authFlow.role);
      setIsOtpStep(true);
      setInfoMessage('Enter the OTP sent to your email to complete login.');
    }
  }, []);

  const handleRequestOtp = async (e) => {
    if (e) e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !role) {
      setErrorMessage('Email and role are required.');
      return;
    }

    setIsRequestingOtp(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const res = await servexApi.auth.sendOtp({ email: normalizedEmail, role });
      const nextDevOtp = res?.dev_otp || '';

      if (res?.delivery_method === 'development-fallback' && !nextDevOtp) {
        throw new Error('OTP delivery is unavailable. Configure SMTP or enable EXPOSE_DEV_OTP.');
      }

      setEmail(normalizedEmail);
      setIsOtpStep(true);
      setOtpRequested(true);
      setInfoMessage(
        res?.delivery_method === 'development-fallback'
          ? 'Email delivery is unavailable. Use the dev OTP shown below.'
          : 'OTP sent successfully. Check your email inbox.'
      );
      setDevOtp(nextDevOtp);
    } catch (error) {
      setErrorMessage(error.message || 'Failed to request OTP. Please try again.');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();

    if (!otp) {
      setErrorMessage('OTP is required.');
      return;
    }

    setIsVerifying(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      const result = await servexApi.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        role,
        otp,
      });
      await onLoginSuccess?.();
      if (result?.user?.role === 'field_officer') {
        navigate('/field-officer');
      } else {
        navigate('/');
      }
    } catch (error) {
      setErrorMessage(error.message || 'OTP verification failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-white text-black">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.06),transparent_28%,rgba(0,0,0,0.08)_68%,transparent)]" />
      <div className="absolute -top-20 -left-24 h-72 w-72 rounded-full border border-black/10" />
      <div className="absolute -bottom-20 right-0 h-72 w-72 rounded-full border border-black/10" />

      <div className="relative min-h-screen grid place-items-center p-6">
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center">
          <div className="flex flex-col items-start justify-center gap-0 lg:pr-4">
            <div className="w-56 h-52 md:w-72 md:h-64 overflow-hidden">
              <img
                src={LOGIN_LOGO}
                alt="ServeX"
                className="w-full h-full object-cover object-center scale-[1.55]"
              />
            </div>
            <h1 className="mt-1 text-4xl md:text-5xl font-extrabold font-jakarta leading-tight tracking-tight">
              Sign In to
              <span className="block text-black/70">ServeX Dashboard</span>
            </h1>
          </div>

          <div className="rounded-3xl border border-black/15 bg-white shadow-[0_25px_100px_rgba(0,0,0,0.12)] p-6 md:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold font-jakarta">Login</h2>
              <p className="text-sm text-black/60 mt-1">Enter email and role, then login using OTP.</p>
            </div>

            <form className="space-y-4" onSubmit={isOtpStep ? handleVerify : handleRequestOtp}>
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
                    disabled={isOtpStep}
                  />
                </div>
              </div>

              {!isOtpStep ? (
                <div>
                  <label className="text-sm font-medium text-black/90">Role</label>
                  <div className="mt-1.5 relative">
                    <UserRound className="h-4 w-4 text-black/45 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full pl-9 pr-3 h-10 rounded-md border border-black/25 bg-white text-black focus-visible:outline-none"
                    >
                      <option value="coordinator">Coordinator</option>
                      <option value="field_officer">Field Officer</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium text-black/90">OTP</label>
                  <div className="mt-1.5 relative">
                    <KeyRound className="h-4 w-4 text-black/45 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      inputMode="numeric"
                      maxLength={8}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Enter 4-8 digit code"
                      className="pl-9 bg-white border-black/25 text-black placeholder:text-black/40 focus-visible:ring-black"
                    />
                  </div>
                </div>
              )}

              {!isOtpStep ? (
                <Button
                  type="submit"
                  disabled={isRequestingOtp}
                  className="w-full bg-black text-white hover:bg-black/85 font-semibold"
                >
                  {isRequestingOtp ? 'Sending OTP...' : 'Send OTP'}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <div className="flex gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleRequestOtp()}
                    disabled={isRequestingOtp || isVerifying}
                    className="flex-1 border-black/25 text-black bg-white hover:bg-black/5"
                  >
                    {isRequestingOtp ? 'Requesting...' : otpRequested ? 'Resend OTP' : 'Send OTP'}
                  </Button>
                  <Button
                    type="submit"
                    disabled={isVerifying || isRequestingOtp}
                    className="flex-1 bg-black text-white hover:bg-black/85 font-semibold"
                  >
                    {isVerifying ? 'Verifying...' : 'Verify & Continue'}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}

              {isOtpStep ? (
                <div className="mt-1.5 relative">
                  <p className="text-xs text-black/60">
                    OTP login is required for both Coordinator and Field Officer.
                  </p>
                </div>
              ) : null}

              {isOtpStep ? (
                <button
                  type="button"
                  className="text-xs text-black/60 underline underline-offset-2"
                  onClick={() => {
                    setIsOtpStep(false);
                    setOtp('');
                    setOtpRequested(false);
                    setDevOtp('');
                    setInfoMessage('');
                    setErrorMessage('');
                  }}
                >
                  Change email or role
                </button>
              ) : null}

              {infoMessage ? (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                  {infoMessage}
                </p>
              ) : null}

              {devOtp ? (
                <p className="text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded-md px-3 py-2">
                  Dev OTP: <span className="font-semibold tracking-wider">{devOtp}</span>
                </p>
              ) : null}

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
