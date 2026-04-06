import { useClubModules } from './club-modules-context';

export function useClubCommunicationEnabled(): boolean {
  const { isEnabled } = useClubModules();
  return isEnabled('COMMUNICATION');
}
