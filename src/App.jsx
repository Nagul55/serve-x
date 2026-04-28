import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from '@/components/Layout';
import ServeXLoader from '@/components/ServeXLoader';

// Page imports
import Dashboard from '@/pages/Dashboard';
import Needs from '@/pages/Needs';
import Volunteers from '@/pages/Volunteers';
import Dispatch from '@/pages/Dispatch';
import FieldReports from '@/pages/FieldReports';
import FieldOfficerPanel from '@/pages/FieldOfficerPanel';
import Login from '@/pages/Login';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, checkAppState, user } = useAuth();

  const userRole = user?.role || null;
  const isCoordinator = userRole === 'coordinator';
  const isFieldOfficer = userRole === 'field_officer';
  const isFieldOfficerVerified = Boolean(user?.field_officer_verified);

  if (isLoadingPublicSettings || isLoadingAuth) {
    return <ServeXLoader isLoading />;
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated && isCoordinator
            ? <Navigate to="/" replace />
            : isAuthenticated && isFieldOfficer && isFieldOfficerVerified
              ? <Navigate to="/field-officer" replace />
            : <Login onLoginSuccess={checkAppState} />
        }
      />
      <Route
        path="/field-officer"
        element={
          !isAuthenticated
            ? <Navigate to="/login" replace />
            : !isFieldOfficer
              ? <Navigate to="/" replace />
              : !isFieldOfficerVerified
                ? <Navigate to="/login" replace />
                : <FieldOfficerPanel />
        }
      />

      <Route element={isAuthenticated && isCoordinator ? <Layout /> : <Navigate to={isFieldOfficer ? '/field-officer' : '/login'} replace />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/needs" element={<Needs />} />
        <Route path="/volunteers" element={<Volunteers />} />
        <Route path="/dispatch" element={<Dispatch />} />
        <Route path="/field-reports" element={<FieldReports />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
