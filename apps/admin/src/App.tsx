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
import { MembershipCartsPage } from './pages/members/MembershipCartsPage';
import { NewMemberPage } from './pages/members/NewMemberPage';
import { NewFamilyPage } from './pages/members/NewFamilyPage';
import { PlanningPage } from './pages/PlanningPage';
import { CommunicationPage } from './pages/CommunicationPage';
import { MessagingAdminPage } from './pages/MessagingAdminPage';
import { BillingPage } from './pages/billing/BillingPage';
import { ClubLifePage } from './pages/club-life/ClubLifePage';
import { EventsPage } from './pages/events/EventsPage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { BookingPage } from './pages/booking/BookingPage';
import { BlogPage } from './pages/blog/BlogPage';
import { ShopPage } from './pages/shop/ShopPage';
import { SponsoringPage } from './pages/sponsoring/SponsoringPage';
import { SubsidiesPage } from './pages/subsidies/SubsidiesPage';
import { AccountingPage } from './pages/accounting/AccountingPage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { SettingsHubPage } from './pages/settings/SettingsHubPage';
import { MemberFieldsSettingsPage } from './pages/settings/MemberFieldsSettingsPage';
import { AdhesionSettingsPage } from './pages/settings/AdhesionSettingsPage';
import { PricingRulesPage } from './pages/settings/PricingRulesPage';
import { MailDomainSettingsPage } from './pages/settings/MailDomainSettingsPage';
import { ClubBrandingSettingsPage } from './pages/settings/ClubBrandingSettingsPage';
import { AiSettingsPage } from './pages/settings/AiSettingsPage';
import AccountingSettingsPage from './pages/settings/AccountingSettingsPage';
import AdhesionPricingRulesPage from './pages/settings/AdhesionPricingRulesPage';
import { AgentChatPage } from './pages/agent/AgentChatPage';
import { AgentAuditPage } from './pages/agent/AgentAuditPage';
import { VitrineHomePage } from './pages/vitrine/VitrineHomePage';
import { VitrinePageEditor } from './pages/vitrine/VitrinePageEditor';
import { VitrineArticlesPage } from './pages/vitrine/VitrineArticlesPage';
// VitrineAnnouncementsPage déprécié : annonces et articles fusionnés dans
// VitrineArticlesPage via le champ `channel`. On redirige /vitrine/annonces
// vers /vitrine/articles?channel=NEWS.
import { VitrineGalleryPage } from './pages/vitrine/VitrineGalleryPage';
import { VitrineSettingsPage } from './pages/vitrine/VitrineSettingsPage';
import { MediaLibraryPage } from './pages/vitrine/MediaLibraryPage';
import { VitrineArticleEditor } from './pages/vitrine/VitrineArticleEditor';
import { VitrineBrandingPage } from './pages/vitrine/VitrineBrandingPage';
import { VitrineCategoriesPage } from './pages/vitrine/VitrineCategoriesPage';
import { VitrineCommentsPage } from './pages/vitrine/VitrineCommentsPage';
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
              <Route path="adhesions" element={<MembershipCartsPage />} />
            </Route>
            <Route
              path="families"
              element={<Navigate to="/members/families" replace />}
            />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="planning" element={<PlanningPage />} />
            <Route path="communication" element={<CommunicationPage />} />
            <Route
              path="communication/messagerie"
              element={<MessagingAdminPage />}
            />
            <Route path="billing" element={<BillingPage />} />
            <Route path="vie-du-club" element={<ClubLifePage />} />
            <Route path="evenements" element={<EventsPage />} />
            <Route path="projets" element={<ProjectsPage />} />
            <Route path="reservations" element={<BookingPage />} />
            <Route path="blog" element={<BlogPage />} />
            <Route path="boutique" element={<ShopPage />} />
            <Route path="sponsoring" element={<SponsoringPage />} />
            <Route path="subventions" element={<SubsidiesPage />} />
            <Route path="comptabilite" element={<AccountingPage />} />
            <Route path="vitrine">
              <Route index element={<VitrineHomePage />} />
              <Route path="articles" element={<VitrineArticlesPage />} />
              <Route path="articles/:id" element={<VitrineArticleEditor />} />
              <Route path="categories" element={<VitrineCategoriesPage />} />
              <Route path="commentaires" element={<VitrineCommentsPage />} />
              <Route
                path="annonces"
                element={<Navigate to="/vitrine/articles?channel=NEWS" replace />}
              />
              <Route path="galerie" element={<VitrineGalleryPage />} />
              <Route path="medias" element={<MediaLibraryPage />} />
              <Route path="settings" element={<VitrineSettingsPage />} />
              <Route path="branding" element={<VitrineBrandingPage />} />
              <Route path="pages/:slug" element={<VitrinePageEditor />} />
            </Route>
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<SettingsHubPage />} />
              <Route
                path="member-fields"
                element={<MemberFieldsSettingsPage />}
              />
              <Route path="adhesion" element={<AdhesionSettingsPage />} />
              <Route path="pricing-rules" element={<PricingRulesPage />} />
              <Route path="mail-domain" element={<MailDomainSettingsPage />} />
              <Route path="branding" element={<ClubBrandingSettingsPage />} />
              <Route path="ai" element={<AiSettingsPage />} />
              <Route path="accounting" element={<AccountingSettingsPage />} />
              <Route
                path="adhesion-pricing-rules"
                element={<AdhesionPricingRulesPage />}
              />
            </Route>
            <Route path="agent" element={<AgentChatPage />} />
            <Route path="agent/audit" element={<AgentAuditPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </ApolloProvider>
  );
}
