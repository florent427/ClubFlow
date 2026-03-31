import { isContactOnlySession } from '../lib/storage';
import { ContactLayout } from './ContactLayout';
import { MemberLayout } from './MemberLayout';

export function MemberOrContactShell() {
  if (isContactOnlySession()) {
    return <ContactLayout />;
  }
  return <MemberLayout />;
}
