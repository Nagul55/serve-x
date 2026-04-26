import { useEffect, useMemo, useState } from 'react';

const STATUS_MESSAGES = [
  'Connecting to field data...',
  'Loading urgency scores...',
  'Fetching volunteer pool...',
  'Preparing coordinator view...',
];

export default function ServeXLoader({ isLoading }) {
  const [statusIndex, setStatusIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(Boolean(isLoading));

  useEffect(() => {
    if (isLoading) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isLoading]);

  useEffect(() => {
    if (!isVisible) return undefined;
    const timer = setInterval(() => {
      setStatusIndex((current) => (current + 1) % STATUS_MESSAGES.length);
    }, 600);
    return () => clearInterval(timer);
  }, [isVisible]);

  const loaderStyle = useMemo(() => ({
    opacity: isLoading ? 1 : 0,
    transition: 'opacity 400ms ease',
  }), [isLoading]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]" style={loaderStyle}>
      <style>
        {`
          @keyframes servexLoad {
            0% { width: 0%; opacity: 1; }
            70% { width: 100%; opacity: 1; }
            90% { width: 100%; opacity: 0; }
            100% { width: 0%; opacity: 0; }
          }
        `}
      </style>

      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <h1 className="text-[32px] leading-none font-extrabold tracking-tight">
          <span className="text-white">Serve</span>
          <span className="text-[#1D9E75]">X</span>
        </h1>
        <p className="text-[13px] tracking-[0.18em] text-[#475569] uppercase">
          Smart Volunteer Coordination
        </p>

        <div className="w-[200px] h-[3px] rounded-full bg-[#1E293B] overflow-hidden">
          <div
            className="h-full"
            style={{
              animation: 'servexLoad 1.8s ease-in-out infinite',
              background: 'linear-gradient(90deg, #1D9E75, #085041)',
            }}
          />
        </div>

        <p className="text-sm text-slate-300 min-h-[20px]">{STATUS_MESSAGES[statusIndex]}</p>
        <p className="text-xs text-[#64748B]">ServeX v1.0 · Sevai Trust · Salem District</p>
      </div>
    </div>
  );
}
