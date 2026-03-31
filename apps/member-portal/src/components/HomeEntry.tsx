import { isContactOnlySession } from '../lib/storage';
import { ContactHomePage } from '../pages/ContactHomePage';
import { DashboardPage } from '../pages/DashboardPage';

export function HomeEntry() {
  return isContactOnlySession() ? <ContactHomePage /> : <DashboardPage />;
}
