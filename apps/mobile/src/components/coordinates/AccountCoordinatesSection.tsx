import { useMutation } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { VIEWER_UPDATE_COORDINATES } from '../../lib/coordinates-documents';
import {
  draftFromGraph,
  resolvePersonCoordinates,
  type CoordinatesErrors,
  type CoordinatesGraph,
} from '../../lib/coordinates';
import { palette, radius, spacing, typography } from '../../lib/theme';
import { Button } from '../ui';
import { FieldError } from './FieldError';
import { PersonCoordinatesForm } from './PersonCoordinatesForm';

/**
 * « Vos coordonnées » : affiché dans les formulaires d'inscription tant que
 * le compte payeur n'a pas de portable et d'adresse complets — l'API
 * refuse d'ajouter quelqu'un au panier avant. Enregistre via
 * `viewerUpdateCoordinates(target: ACCOUNT)`, puis `onSaved` (refetch).
 */
export function AccountCoordinatesSection({
  account,
  onSaved,
}: {
  account: CoordinatesGraph | null;
  onSaved: () => void | Promise<unknown>;
}) {
  const [draft, setDraft] = useState(() => draftFromGraph(account));
  const [errors, setErrors] = useState<CoordinatesErrors | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [save, { loading }] = useMutation(VIEWER_UPDATE_COORDINATES);

  // Pré-remplissage quand le statut arrive après l'ouverture.
  useEffect(() => {
    setDraft(draftFromGraph(account));
  }, [account]);

  async function onSave() {
    setServerError(null);
    const res = resolvePersonCoordinates(draft, {
      account: null,
      offerSameAsAccount: false,
      requireBirthPlace: false,
    });
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors(null);
    try {
      await save({
        variables: { input: { target: 'ACCOUNT', targetId: null, ...res.input } },
      });
      await onSaved();
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Vos coordonnées</Text>
      <Text style={styles.desc}>
        Votre portable et votre adresse sont nécessaires pour une adhésion en
        ligne. Ils seront proposés pour les membres de votre foyer.
      </Text>
      <PersonCoordinatesForm
        draft={draft}
        onChange={setDraft}
        account={null}
        offerSameAsAccount={false}
        showBirthPlace={false}
        errors={errors}
      />
      <FieldError message={serverError} />
      <Button
        label={loading ? 'Enregistrement…' : 'Enregistrer mes coordonnées'}
        onPress={() => void onSave()}
        loading={loading}
        icon="save-outline"
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: palette.warningBorder,
    backgroundColor: palette.warningBg,
    borderRadius: radius.lg,
  },
  title: { ...typography.bodyStrong, color: palette.ink },
  desc: { ...typography.small, color: palette.warningText },
});
