import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ApolloProvider } from '@apollo/client/react';
import { apolloClient } from './lib/apollo';
import { getClubId, getToken, hasMemberSession } from './lib/storage';
import { MemberOrContactShell } from './components/MemberOrContactShell';
import { MemberOnly } from './components/MemberOnly';
import { ToastProvider } from './components/ToastProvider';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { SelectProfilePage } from './pages/SelectProfilePage';
import { HomeEntry } from './components/HomeEntry';
import { ProgressionPage } from './pages/ProgressionPage';
import { PlanningPage } from './pages/PlanningPage';
import { FamilyPage } from './pages/FamilyPage';
import { SettingsPage } from './pages/SettingsPage';
import { MessagingPage } from './pages/MessagingPage';

function Protected() {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  if (!getClubId()) {
    return <Navigate to="/select-profile" replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
            <Route path="/select-profile" element={<SelectProfilePage />} />
            <Route element={<Protected />}>
              <Route element={<MemberOrContactShell />}>
              <Route path="/" element={<HomeEntry />} />
              <Route
                path="/progression"
                element={
                  <MemberOnly>
                    <ProgressionPage />
                  </MemberOnly>
                }
              />
              <Route
                path="/planning"
                element={
                  <MemberOnly>
                    <PlanningPage />
                  </MemberOnly>
                }
              />
              <Route
                path="/famille"
                element={
                  <MemberOnly>
                    <FamilyPage />
                  </MemberOnly>
                }
              />
              <Route
                path="/parametres"
                element={
                  <MemberOnly>
                    <SettingsPage />
                  </MemberOnly>
                }
              />
              <Route
                path="/messagerie"
                element={
                  <MemberOnly>
                    <MessagingPage />
                  </MemberOnly>
                }
              />
              </Route>
            </Route>
            <Route
              path="*"
              element={
                <Navigate
                  to={hasMemberSession() ? '/' : '/login'}
                  replace
                />
              }
            />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ApolloProvider>
  );
}
