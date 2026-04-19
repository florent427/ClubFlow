import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ApolloProvider } from '@apollo/client/react';
import { apolloClient } from './lib/apollo';
import { getClubId, getToken, hasMemberSession } from './lib/storage';
import { MemberOrContactShell } from './components/MemberOrContactShell';
import { MemberOnly } from './components/MemberOnly';
import { ToastProvider } from './components/ToastProvider';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage';
import { SelectProfilePage } from './pages/SelectProfilePage';
import { HomeEntry } from './components/HomeEntry';
import { ProgressionPage } from './pages/ProgressionPage';
import { PlanningPage } from './pages/PlanningPage';
import { FamilyPage } from './pages/FamilyPage';
import { BillingPage } from './pages/BillingPage';
import { SettingsPage } from './pages/SettingsPage';
import { MessagingPage } from './pages/MessagingPage';
import { NewsPage } from './pages/NewsPage';
import { EventsPage } from './pages/EventsPage';
import { BookingPage } from './pages/BookingPage';
import { BlogListPage, BlogPostPage } from './pages/BlogPage';
import { ShopPage } from './pages/ShopPage';
import { JoinFamilyInvitePage } from './pages/JoinFamilyInvitePage';
import { PublicSiteLayout } from './pages/public/PublicSiteLayout';
import { PublicHomePage } from './pages/public/PublicHomePage';
import { PublicNewsPage } from './pages/public/PublicNewsPage';
import { PublicEventsPage } from './pages/public/PublicEventsPage';
import {
  PublicBlogListPage,
  PublicBlogPostPage,
} from './pages/public/PublicBlogPage';
import { PublicShopPage } from './pages/public/PublicShopPage';

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
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
            <Route path="/rejoindre" element={<JoinFamilyInvitePage />} />
            <Route path="/site/:slug" element={<PublicSiteLayout />}>
              <Route index element={<PublicHomePage />} />
              <Route path="actus" element={<PublicNewsPage />} />
              <Route path="evenements" element={<PublicEventsPage />} />
              <Route path="blog" element={<PublicBlogListPage />} />
              <Route path="blog/:postSlug" element={<PublicBlogPostPage />} />
              <Route path="boutique" element={<PublicShopPage />} />
            </Route>
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
              <Route path="/famille" element={<FamilyPage />} />
              <Route path="/factures" element={<BillingPage />} />
              <Route path="/parametres" element={<SettingsPage />} />
              <Route
                path="/messagerie"
                element={
                  <MemberOnly>
                    <MessagingPage />
                  </MemberOnly>
                }
              />
              <Route path="/actus" element={<NewsPage />} />
              <Route path="/evenements" element={<EventsPage />} />
              <Route path="/reservations" element={<BookingPage />} />
              <Route path="/blog" element={<BlogListPage />} />
              <Route path="/blog/:slug" element={<BlogPostPage />} />
              <Route path="/boutique" element={<ShopPage />} />
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
