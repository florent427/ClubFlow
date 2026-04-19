import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ApolloProvider } from '@apollo/client/react';
import { apolloClient } from './lib/apollo';
import { isLoggedIn } from './lib/storage';
import { AdminLayout } from './components/AdminLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClubModulesPage } from './pages/ClubModulesPage';
import { MembersLayout } from './pages/members/MembersLayout';
import { MembersDirectoryPage } from './pages/members/MembersDirectoryPage';
import { MembersDynamicGroupsPage } from './pages/members/MembersDynamicGroupsPage';
import { MembersGradesPage } from './pages/members/MembersGradesPage';
import { MembersRolesPage } from './pages/members/MembersRolesPage';
import { FamiliesPage } from './pages/members/FamiliesPage';
import { NewMemberPage } from './pages/members/NewMemberPage';
import { NewFamilyPage } from './pages/members/NewFamilyPage';
import { PlanningPage } from './pages/PlanningPage';
import { CommunicationPage } from './pages/CommunicationPage';
import { BillingPage } from './pages/billing/BillingPage';
import { ClubLifePage } from './pages/club-life/ClubLifePage';
import { EventsPage } from './pages/events/EventsPage';
import { BookingPage } from './pages/booking/BookingPage';
import { BlogPage } from './pages/blog/BlogPage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { SettingsHubPage } from './pages/settings/SettingsHubPage';
import { MemberFieldsSettingsPage } from './pages/settings/MemberFieldsSettingsPage';
import { AdhesionSettingsPage } from './pages/settings/AdhesionSettingsPage';
import { PricingRulesPage } from './pages/settings/PricingRulesPage';
import { MailDomainSettingsPage } from './pages/settings/MailDomainSettingsPage';
import { MembersUiProvider } from './pages/members/members-ui-context';
import { ContactsPage } from './pages/contacts/ContactsPage';
import { ToastProvider } from './components/ToastProvider';
import { ClubModulesProvider } from './lib/club-modules-context';

function Protected({ children }: { children: ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <Protected>
                <ClubModulesProvider>
                  <MembersUiProvider>
                    <AdminLayout />
                  </MembersUiProvider>
                </ClubModulesProvider>
              </Protected>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="club-modules" element={<ClubModulesPage />} />
            <Route path="members" element={<MembersLayout />}>
              <Route index element={<MembersDirectoryPage />} />
              <Route path="new" element={<NewMemberPage />} />
              <Route path="grades" element={<MembersGradesPage />} />
              <Route
                path="dynamic-groups"
                element={<MembersDynamicGroupsPage />}
              />
              <Route path="roles" element={<MembersRolesPage />} />
              <Route path="families/new" element={<NewFamilyPage />} />
              <Route path="families" element={<FamiliesPage />} />
            </Route>
            <Route
              path="families"
              element={<Navigate to="/members/families" replace />}
            />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="planning" element={<PlanningPage />} />
            <Route path="communication" element={<CommunicationPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="vie-du-club" element={<ClubLifePage />} />
            <Route path="evenements" element={<EventsPage />} />
            <Route path="reservations" element={<BookingPage />} />
            <Route path="blog" element={<BlogPage />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<SettingsHubPage />} />
              <Route
                path="member-fields"
                element={<MemberFieldsSettingsPage />}
              />
              <Route path="adhesion" element={<AdhesionSettingsPage />} />
              <Route path="pricing-rules" element={<PricingRulesPage />} />
              <Route path="mail-domain" element={<MailDomainSettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </ApolloProvider>
  );
}
