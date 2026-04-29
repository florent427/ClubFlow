import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AccountingHomeScreen } from '../../screens/accounting/AccountingHomeScreen';
import { AccountingReviewQueueScreen } from '../../screens/accounting/AccountingReviewQueueScreen';
import { AccountingSettingsScreen } from '../../screens/accounting/AccountingSettingsScreen';
import { AgentAuditScreen } from '../../screens/agent/AgentAuditScreen';
import { AikoChatScreen } from '../../screens/agent/AikoChatScreen';
import { AnnouncementsScreen } from '../../screens/club-life/AnnouncementsScreen';
import { BlogPostEditorScreen } from '../../screens/blog/BlogPostEditorScreen';
import { BlogPostsScreen } from '../../screens/blog/BlogPostsScreen';
import { CampaignDetailScreen } from '../../screens/communication/CampaignDetailScreen';
import { CampaignsScreen } from '../../screens/communication/CampaignsScreen';
import { ChatGroupSettingsScreen } from '../../screens/messaging/ChatGroupSettingsScreen';
import { EntryDetailScreen } from '../../screens/accounting/EntryDetailScreen';
import { ExportScreen } from '../../screens/accounting/ExportScreen';
import { InvoiceDetailScreen } from '../../screens/billing/InvoiceDetailScreen';
import { InvoicesScreen } from '../../screens/billing/InvoicesScreen';
import { MediaLibraryScreen } from '../../screens/vitrine/MediaLibraryScreen';
import { MessagingHomeScreen } from '../../screens/messaging/MessagingHomeScreen';
import { MessagingThreadScreen } from '../../screens/messaging/MessagingThreadScreen';
import { MoreMenuScreen } from '../../screens/MoreMenuScreen';
import { NewAnnouncementScreen } from '../../screens/club-life/NewAnnouncementScreen';
import { NewBlogPostScreen } from '../../screens/blog/NewBlogPostScreen';
import { NewCampaignScreen } from '../../screens/communication/NewCampaignScreen';
import { NewChatGroupScreen } from '../../screens/messaging/NewChatGroupScreen';
import { NewEntryScreen } from '../../screens/accounting/NewEntryScreen';
import { NewInvoiceScreen } from '../../screens/billing/NewInvoiceScreen';
import { NewShopProductScreen } from '../../screens/shop/NewShopProductScreen';
import { NewSponsorshipScreen } from '../../screens/sponsoring/NewSponsorshipScreen';
import { NewSubsidyScreen } from '../../screens/subsidies/NewSubsidyScreen';
import { NewSurveyScreen } from '../../screens/club-life/NewSurveyScreen';
import { PeriodLockScreen } from '../../screens/accounting/PeriodLockScreen';
import { QuickMessageScreen } from '../../screens/communication/QuickMessageScreen';
import { ReceiptScannerScreen } from '../../screens/accounting/ReceiptScannerScreen';
import { RecordPaymentScreen } from '../../screens/billing/RecordPaymentScreen';
import { ShopOrderDetailScreen } from '../../screens/shop/ShopOrderDetailScreen';
import { ShopOrdersScreen } from '../../screens/shop/ShopOrdersScreen';
import { ShopProductsScreen } from '../../screens/shop/ShopProductsScreen';
import { SponsorshipDetailScreen } from '../../screens/sponsoring/SponsorshipDetailScreen';
import { SponsorshipsScreen } from '../../screens/sponsoring/SponsorshipsScreen';
import { SubsidiesScreen } from '../../screens/subsidies/SubsidiesScreen';
import { SubsidyDetailScreen } from '../../screens/subsidies/SubsidyDetailScreen';
import { SurveyDetailScreen } from '../../screens/club-life/SurveyDetailScreen';
import { SurveysScreen } from '../../screens/club-life/SurveysScreen';
import { SystemAdminsScreen } from '../../screens/system-admin/SystemAdminsScreen';
import { SystemDashboardScreen } from '../../screens/system-admin/SystemDashboardScreen';
import { SystemUsersScreen } from '../../screens/system-admin/SystemUsersScreen';
import { VitrineArticleEditorScreen } from '../../screens/vitrine/VitrineArticleEditorScreen';
import { VitrineArticlesScreen } from '../../screens/vitrine/VitrineArticlesScreen';
import { VitrineBrandingScreen } from '../../screens/vitrine/VitrineBrandingScreen';
import { VitrineCategoriesScreen } from '../../screens/vitrine/VitrineCategoriesScreen';
import { VitrineCommentsScreen } from '../../screens/vitrine/VitrineCommentsScreen';
import { VitrineGalleryScreen } from '../../screens/vitrine/VitrineGalleryScreen';
import { VitrineHomeScreen } from '../../screens/vitrine/VitrineHomeScreen';
import { VitrinePageEditorScreen } from '../../screens/vitrine/VitrinePageEditorScreen';
import { VitrinePagesScreen } from '../../screens/vitrine/VitrinePagesScreen';
import { VitrineSettingsScreen } from '../../screens/vitrine/VitrineSettingsScreen';

import { AdhesionPricingRulesScreen } from '../../screens/settings/AdhesionPricingRulesScreen';
import { AdhesionSettingsScreen } from '../../screens/settings/AdhesionSettingsScreen';
import { AiSettingsScreen } from '../../screens/settings/AiSettingsScreen';
import { ClubBrandingScreen } from '../../screens/settings/ClubBrandingScreen';
import { ClubModulesScreen } from '../../screens/settings/ClubModulesScreen';
import { MailDomainScreen } from '../../screens/settings/MailDomainScreen';
import { MemberFieldsScreen } from '../../screens/settings/MemberFieldsScreen';
import { PricingRulesScreen } from '../../screens/settings/PricingRulesScreen';
import { ProfileScreen } from '../../screens/settings/ProfileScreen';
import { SettingsHubScreen } from '../../screens/settings/SettingsHubScreen';

const Stack = createNativeStackNavigator();

/**
 * Stack "Plus" : home avec grille des modules + tous les écrans
 * non couverts par les 3 autres tabs.
 */
export function MoreStack() {
  return (
    <Stack.Navigator
      initialRouteName="MoreMenu"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="MoreMenu" component={MoreMenuScreen} />
      {/* Communication */}
      <Stack.Screen name="Campaigns" component={CampaignsScreen} />
      <Stack.Screen name="CampaignDetail" component={CampaignDetailScreen} />
      <Stack.Screen name="NewCampaign" component={NewCampaignScreen} />
      <Stack.Screen name="QuickMessage" component={QuickMessageScreen} />
      {/* Messaging */}
      <Stack.Screen name="MessagingHome" component={MessagingHomeScreen} />
      <Stack.Screen name="MessagingThread" component={MessagingThreadScreen} />
      <Stack.Screen name="NewChatGroup" component={NewChatGroupScreen} />
      <Stack.Screen name="ChatGroupSettings" component={ChatGroupSettingsScreen} />
      {/* Club life */}
      <Stack.Screen name="Announcements" component={AnnouncementsScreen} />
      <Stack.Screen name="NewAnnouncement" component={NewAnnouncementScreen} />
      <Stack.Screen name="Surveys" component={SurveysScreen} />
      <Stack.Screen name="SurveyDetail" component={SurveyDetailScreen} />
      <Stack.Screen name="NewSurvey" component={NewSurveyScreen} />
      {/* Blog */}
      <Stack.Screen name="BlogPosts" component={BlogPostsScreen} />
      <Stack.Screen name="BlogPostEditor" component={BlogPostEditorScreen} />
      <Stack.Screen name="NewBlogPost" component={NewBlogPostScreen} />
      {/* Billing */}
      <Stack.Screen name="Invoices" component={InvoicesScreen} />
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} />
      <Stack.Screen name="NewInvoice" component={NewInvoiceScreen} />
      <Stack.Screen name="RecordPayment" component={RecordPaymentScreen} />
      {/* Accounting */}
      <Stack.Screen name="AccountingHome" component={AccountingHomeScreen} />
      <Stack.Screen name="ReviewQueue" component={AccountingReviewQueueScreen} />
      <Stack.Screen name="EntryDetail" component={EntryDetailScreen} />
      <Stack.Screen name="NewEntry" component={NewEntryScreen} />
      <Stack.Screen name="ReceiptScanner" component={ReceiptScannerScreen} />
      <Stack.Screen name="PeriodLock" component={PeriodLockScreen} />
      <Stack.Screen name="AccountingSettings" component={AccountingSettingsScreen} />
      <Stack.Screen name="Export" component={ExportScreen} />
      {/* Shop */}
      <Stack.Screen name="ShopProducts" component={ShopProductsScreen} />
      <Stack.Screen name="ShopProductEditor" component={NewShopProductScreen} />
      <Stack.Screen name="ShopOrders" component={ShopOrdersScreen} />
      <Stack.Screen name="ShopOrderDetail" component={ShopOrderDetailScreen} />
      {/* Sponsoring / Subsidies */}
      <Stack.Screen name="Sponsorships" component={SponsorshipsScreen} />
      <Stack.Screen name="SponsorshipDetail" component={SponsorshipDetailScreen} />
      <Stack.Screen name="NewSponsorship" component={NewSponsorshipScreen} />
      <Stack.Screen name="Subsidies" component={SubsidiesScreen} />
      <Stack.Screen name="SubsidyDetail" component={SubsidyDetailScreen} />
      <Stack.Screen name="NewSubsidy" component={NewSubsidyScreen} />
      {/* Vitrine */}
      <Stack.Screen name="VitrineHome" component={VitrineHomeScreen} />
      <Stack.Screen name="VitrinePages" component={VitrinePagesScreen} />
      <Stack.Screen name="VitrinePageEditor" component={VitrinePageEditorScreen} />
      <Stack.Screen name="VitrineArticles" component={VitrineArticlesScreen} />
      <Stack.Screen name="VitrineArticleEditor" component={VitrineArticleEditorScreen} />
      <Stack.Screen name="VitrineCategories" component={VitrineCategoriesScreen} />
      <Stack.Screen name="VitrineComments" component={VitrineCommentsScreen} />
      <Stack.Screen name="VitrineGallery" component={VitrineGalleryScreen} />
      <Stack.Screen name="MediaLibrary" component={MediaLibraryScreen} />
      <Stack.Screen name="VitrineBranding" component={VitrineBrandingScreen} />
      <Stack.Screen name="VitrineSettings" component={VitrineSettingsScreen} />
      {/* Settings */}
      <Stack.Screen name="SettingsHub" component={SettingsHubScreen} />
      <Stack.Screen name="ClubBranding" component={ClubBrandingScreen} />
      <Stack.Screen name="ClubModules" component={ClubModulesScreen} />
      <Stack.Screen name="MemberFields" component={MemberFieldsScreen} />
      <Stack.Screen name="Adhesion" component={AdhesionSettingsScreen} />
      <Stack.Screen name="PricingRules" component={PricingRulesScreen} />
      <Stack.Screen name="AdhesionPricingRules" component={AdhesionPricingRulesScreen} />
      <Stack.Screen name="MailDomain" component={MailDomainScreen} />
      <Stack.Screen name="AiSettings" component={AiSettingsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      {/* Agent */}
      <Stack.Screen name="AikoChat" component={AikoChatScreen} />
      <Stack.Screen name="AgentAudit" component={AgentAuditScreen} />
      {/* System Admin */}
      <Stack.Screen name="SystemDashboard" component={SystemDashboardScreen} />
      <Stack.Screen name="SystemAdmins" component={SystemAdminsScreen} />
      <Stack.Screen name="SystemUsers" component={SystemUsersScreen} />
    </Stack.Navigator>
  );
}
