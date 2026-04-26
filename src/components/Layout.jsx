import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, AlertTriangle, Send, FileText,
  LogOut, Bell,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { servexApi } from '@/api/servexClient';
import MobileCardNav from '@/components/navigation/MobileCardNav';

const HEADER_NOTIFICATION_GIF = '/assets/header-notification.gif';
const HEADER_PROFILE_GIF = '/assets/header-profile.gif';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/needs', label: 'Community Needs', icon: AlertTriangle },
  { path: '/volunteers', label: 'Volunteers', icon: Users },
  { path: '/dispatch', label: 'Dispatch', icon: Send },
  { path: '/field-reports', label: 'Field Reports', icon: FileText },
];

function NotificationMenu({ notifications, unreadCount, onReadAll, onNotificationClick, formatTimeAgo }) {
  return (
    <div className="absolute right-0 mt-2 w-[340px] max-w-[90vw] rounded-xl border border-border bg-card shadow-lg z-50">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Notifications</p>
        </div>
        <button
          type="button"
          onClick={onReadAll}
          className="text-xs text-primary hover:underline disabled:opacity-50"
          disabled={unreadCount === 0}
        >
          Mark all read
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="px-3 py-6 text-sm text-muted-foreground text-center">No notifications yet.</p>
        ) : (
          notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNotificationClick(item.id, item.is_read)}
              className={`w-full text-left px-3 py-2 border-b border-border/60 last:border-b-0 hover:bg-accent/50 transition-colors ${
                item.is_read ? '' : 'bg-primary/5'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground leading-5">{item.title}</p>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {formatTimeAgo(item.created_date)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-5">{item.message}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function ProfileMenu({ username, onLogout }) {
  return (
    <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card shadow-lg p-3 z-50">
      <p className="text-xs text-muted-foreground">Signed in as</p>
      <p className="text-sm font-semibold text-foreground truncate mt-0.5 mb-3">{username}</p>
      <button
        type="button"
        onClick={onLogout}
        className="w-full inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Logout
      </button>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileGifCycle, setProfileGifCycle] = useState(0);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [username, setUsername] = useState('Coordinator');
  const profileMenuDesktopRef = useRef(null);
  const profileMenuMobileRef = useRef(null);
  const notificationMenuDesktopRef = useRef(null);
  const notificationMenuMobileRef = useRef(null);
  const mobileNavRef = useRef(null);

  const { data: notificationPayload } = useQuery({
    queryKey: ['notifications', 'header'],
    queryFn: () => servexApi.notifications.list(30),
    refetchInterval: 15000,
  });

  const notifications = notificationPayload?.items || [];
  const unreadCount = Number(notificationPayload?.unread_count || 0);

  const formatTimeAgo = (value) => {
    if (!value) return '';
    const created = new Date(value).getTime();
    if (!Number.isFinite(created)) return '';

    const diffMs = Date.now() - created;
    const diffMin = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  const refreshNotifications = () => {
    queryClient.invalidateQueries(['notifications', 'header']);
  };

  useEffect(() => {
    const timerId = setInterval(() => {
      setProfileGifCycle((v) => v + 1);
    }, 8000);

    return () => clearInterval(timerId);
  }, []);

  useEffect(() => {
    const storedUser = servexApi.auth.getStoredUser?.();
    setUsername(user?.email || storedUser?.email || 'Coordinator');
  }, [user]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (mobileNavRef.current && !mobileNavRef.current.contains(event.target)) {
        setMobileOpen(false);
      }

      const insideProfile = [profileMenuDesktopRef, profileMenuMobileRef]
        .some((ref) => ref.current && ref.current.contains(event.target));
      if (!insideProfile) {
        setIsProfileMenuOpen(false);
      }

      const insideNotification = [notificationMenuDesktopRef, notificationMenuMobileRef]
        .some((ref) => ref.current && ref.current.contains(event.target));
      if (!insideNotification) {
        setIsNotificationMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setIsNotificationMenuOpen(false);
    setIsProfileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout(true);
  };

  const handleNotificationToggle = () => {
    setIsNotificationMenuOpen((v) => !v);
  };

  const handleNotificationClick = async (id, isRead) => {
    if (!id || isRead) return;
    await servexApi.notifications.markRead(id);
    refreshNotifications();
  };

  const handleReadAll = async () => {
    await servexApi.notifications.markAllRead();
    refreshNotifications();
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="hidden lg:flex lg:static w-64 bg-sidebar border-r border-sidebar-border flex-col">
        <div className="flex items-center px-6 py-5 border-b border-sidebar-border">
          <span className="font-jakarta text-2xl font-extrabold tracking-wide text-sidebar-foreground">
            ServeX
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-sidebar-border">
          <p className="text-xs text-sidebar-foreground/50 font-medium">ServeX Coordinator</p>
          <p className="text-xs text-sidebar-foreground/30 mt-0.5">AI-Powered Dispatch</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-card border-b border-border flex-shrink-0 px-4 py-3 sm:px-6 sm:py-4">
          <div className="hidden lg:flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Community Intelligence Platform</span>
            <div className="flex items-center gap-3 ml-auto relative">
              <div ref={notificationMenuDesktopRef} className="relative">
                <button
                  type="button"
                  onClick={handleNotificationToggle}
                  className="relative rounded-md p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Open notifications"
                >
                  <img
                    src={HEADER_NOTIFICATION_GIF}
                    alt="Notifications"
                    className="w-7 h-7 object-contain"
                  />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-[18px] font-semibold text-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
                {isNotificationMenuOpen && (
                  <NotificationMenu
                    notifications={notifications}
                    unreadCount={unreadCount}
                    onReadAll={handleReadAll}
                    onNotificationClick={handleNotificationClick}
                    formatTimeAgo={formatTimeAgo}
                  />
                )}
              </div>

              <div ref={profileMenuDesktopRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen((v) => !v)}
                  className="rounded-md p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Open profile menu"
                >
                  <img
                    key={profileGifCycle}
                    src={HEADER_PROFILE_GIF}
                    alt="Current user"
                    className="w-7 h-7 object-contain"
                  />
                </button>
                {isProfileMenuOpen && (
                  <ProfileMenu username={username} onLogout={handleLogout} />
                )}
              </div>
            </div>
          </div>

          <div className="lg:hidden space-y-3" ref={mobileNavRef}>
            <div className="flex items-center justify-end relative">
              <div className="flex items-center gap-2">
                <div ref={notificationMenuMobileRef} className="relative">
                  <button
                    type="button"
                    onClick={handleNotificationToggle}
                    className="relative rounded-md p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label="Open notifications"
                  >
                    <img
                      src={HEADER_NOTIFICATION_GIF}
                      alt="Notifications"
                      className="w-7 h-7 object-contain"
                    />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-[18px] font-semibold text-center">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {isNotificationMenuOpen && (
                    <NotificationMenu
                      notifications={notifications}
                      unreadCount={unreadCount}
                      onReadAll={handleReadAll}
                      onNotificationClick={handleNotificationClick}
                      formatTimeAgo={formatTimeAgo}
                    />
                  )}
                </div>

                <div ref={profileMenuMobileRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setIsProfileMenuOpen((v) => !v)}
                    className="rounded-md p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label="Open profile menu"
                  >
                    <img
                      key={profileGifCycle}
                      src={HEADER_PROFILE_GIF}
                      alt="Current user"
                      className="w-7 h-7 object-contain"
                    />
                  </button>
                  {isProfileMenuOpen && (
                    <ProfileMenu username={username} onLogout={handleLogout} />
                  )}
                </div>
              </div>
            </div>

            <MobileCardNav
              open={mobileOpen}
              onToggle={() => setMobileOpen((v) => !v)}
              onNavigate={() => setMobileOpen(false)}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
