import { isContactOnlySession } from '../lib/storage';
import { usePushResync } from '../lib/use-push-resync';
import { ContactLayout } from './ContactLayout';
import { MemberLayout } from './MemberLayout';

export function MemberOrContactShell() {
  // Session connectée : l'abonnement push de l'appareil suit le compte courant.
  usePushResync();
  if (isContactOnlySession()) {
    return <ContactLayout />;
  }
  return <MemberLayout />;
}
