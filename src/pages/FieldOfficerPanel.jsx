import { useEffect, useMemo, useState } from 'react';
import { LogOut, MessageCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { servexApi } from '@/api/servexClient';

const DEFAULT_WHATSAPP_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER || '14155238886').replace(/[^\d]/g, '');
const DEFAULT_WHATSAPP_MESSAGE = 'hey servex';

export default function FieldOfficerPanel() {
  const [accessConfig, setAccessConfig] = useState({
    number: DEFAULT_WHATSAPP_NUMBER,
    message: DEFAULT_WHATSAPP_MESSAGE,
    provider: 'unknown',
    isLoading: true,
  });

  useEffect(() => {
    let disposed = false;

    const loadAccess = async () => {
      try {
        const data = await servexApi.auth.fieldOfficerAccess();
        if (disposed) return;

        const number = String(data?.whatsappNumber || '').replace(/[^\d]/g, '');
        const message = String(data?.launcherMessage || '').trim() || DEFAULT_WHATSAPP_MESSAGE;
        const provider = String(data?.whatsappProvider || 'unknown').trim() || 'unknown';

        setAccessConfig({
          number: number || DEFAULT_WHATSAPP_NUMBER,
          message,
          provider,
          isLoading: false,
        });
      } catch {
        if (disposed) return;
        setAccessConfig((prev) => ({
          ...prev,
          isLoading: false,
        }));
      }
    };

    loadAccess();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const handleExitToLogin = async () => {
      await servexApi.auth.logout();
      window.location.replace('/login');
    };

    const onPopState = () => {
      void handleExitToLogin();
    };

    window.history.pushState({ fieldOfficerPanel: true }, '', window.location.pathname);
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const launchUrl = useMemo(() => {
    if (!accessConfig.number) return '';
    return `https://wa.me/${accessConfig.number}?text=${encodeURIComponent(accessConfig.message)}`;
  }, [accessConfig.message, accessConfig.number]);

  const providerLabel = accessConfig.provider.replace(/_/g, ' ');

  const handleLogout = async () => {
    await servexApi.auth.logout();
    window.location.replace('/login');
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          <div className="flex items-center justify-end mb-3">
            <Button variant="outline" className="gap-2" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
              Back to Login
            </Button>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold font-jakarta text-foreground">Field Officer Panel</h1>
          </div>
          <p className="text-muted-foreground mb-6">
            Submit on-ground updates and survey information through the official ServeX WhatsApp chatbot.
          </p>

          <a href={launchUrl || '#'} target="_blank" rel="noreferrer">
            <Button className="gap-2 text-base px-6 py-6" disabled={!launchUrl}>
              <MessageCircle className="w-5 h-5" />
              Talk to ServeX AI
            </Button>
          </a>

          <p className="text-xs text-muted-foreground mt-4">
            This opens the official ServeX WhatsApp chat with a pre-filled message.
          </p>

          <p className="text-xs text-muted-foreground mt-2">
            Provider: {providerLabel}. Number: {accessConfig.number ? `+${accessConfig.number}` : 'Not configured'}.
          </p>

          {accessConfig.isLoading ? (
            <p className="text-xs text-muted-foreground mt-2">
              Loading latest WhatsApp access details...
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
