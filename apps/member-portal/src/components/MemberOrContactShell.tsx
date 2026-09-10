import { isContactOnlySession } from '../lib/storage';
import { usePushResync } from '../lib/use-push-resync';
import { ContactLayout } from './ContactLayout';
import { EngagementPrompt } from './EngagementPrompt';
import { MemberLayout } from './MemberLayout';

export function MemberOrContactShell() {
  // Session connectée : l'abonnement push de l'appareil suit le compte courant.
  usePushResync();
  return (
    <>
      {/* Invitation à installer le portail et à autoriser les notifications :
          même espace pour un membre et pour un contact, la cloche est là aussi. */}
      <EngagementPrompt />
      {isContactOnlySession() ? <ContactLayout /> : <MemberLayout />}
    </>
  );
}
