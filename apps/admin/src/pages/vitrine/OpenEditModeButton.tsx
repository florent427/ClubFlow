import { useMutation } from '@apollo/client/react';
import {
  ISSUE_VITRINE_EDIT_TOKEN,
  type IssueVitrineEditTokenData,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';

interface Props {
  redirect?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Bouton admin → vitrine : demande un JWT court à l'API, redirige l'onglet
 * vers `<vitrine>/api/edit/enter?token=...&redirect=<path>` qui pose le
 * cookie httpOnly et ramène l'utilisateur sur la page cible en mode
 * édition.
 */
export function OpenEditModeButton({
  redirect = '/',
  className,
  children,
}: Props) {
  const { showToast } = useToast();
  const [issue, { loading }] = useMutation<IssueVitrineEditTokenData>(
    ISSUE_VITRINE_EDIT_TOKEN,
  );

  async function handleClick(): Promise<void> {
    try {
      const { data } = await issue();
      if (!data?.issueVitrineEditToken) {
        showToast("Impossible d'obtenir le jeton d'édition.", 'error');
        return;
      }
      const { token, vitrineBaseUrl } = data.issueVitrineEditToken;
      const url = `${vitrineBaseUrl}/api/edit/enter?token=${encodeURIComponent(
        token,
      )}&redirect=${encodeURIComponent(redirect)}`;
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  return (
    <button
      type="button"
      className={className ?? 'btn btn-tight'}
      disabled={loading}
      onClick={() => void handleClick()}
    >
      {children ?? (loading ? 'Préparation…' : 'Éditer sur le site ↗')}
    </button>
  );
}
