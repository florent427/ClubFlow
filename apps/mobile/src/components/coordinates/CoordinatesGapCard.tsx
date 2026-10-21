import { useMutation } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { VIEWER_UPDATE_COORDINATES } from '../../lib/coordinates-documents';
import {
  draftFromGraph,
  gapLabelFr,
  resolvePersonCoordinates,
  type CoordinatesErrors,
  type CoordinatesGap,
  type CoordinatesStatus,
} from '../../lib/coordinates';
import { palette, radius, spacing, typography } from '../../lib/theme';
import { Button } from '../ui';
import { FieldError } from './FieldError';
import { PersonCoordinatesForm } from './PersonCoordinatesForm';

function draftForGap(gap: CoordinatesGap, accountComplete: boolean) {
  // Cases « même … que le compte » cochées d'office pour ce qui manque
  // seulement : un adhérent qui a déjà sa propre adresse la garde.
  const offer = gap.target !== 'ACCOUNT' && accountComplete;
  return draftFromGraph(gap.current, {
    phone: offer && gap.missing.includes('PHONE'),
    address: offer && gap.missing.includes('ADDRESS'),
  });
}

/**
 * Fiche incomplète du panier : « À compléter : Léa Martin — portable,
 * ville de naissance », formulaire pré-rempli, enregistré par
 * `viewerUpdateCoordinates(target, targetId)`. `onSaved` relit le statut
 * du panier (la mutation renvoie celui du compte seul).
 */
export function CoordinatesGapCard({
  gap,
  status,
  onSaved,
}: {
  gap: CoordinatesGap;
  status: CoordinatesStatus;
  onSaved: () => void | Promise<unknown>;
}) {
  const offerSameAsAccount = gap.target !== 'ACCOUNT' && status.accountComplete;
  const [draft, setDraft] = useState(() =>
    draftForGap(gap, status.accountComplete),
  );
  const [errors, setErrors] = useState<CoordinatesErrors | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [save, { loading }] = useMutation(VIEWER_UPDATE_COORDINATES);

  const gapKey = `${gap.target}:${gap.targetId ?? ''}`;
  useEffect(() => {
    setDraft(draftForGap(gap, status.accountComplete));
    // Réinitialisé seulement quand la fiche ou l'état du compte change,
    // pas à chaque relecture du statut (saisie en cours conservée).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gapKey, status.accountComplete]);

  async function onSave() {
    setServerError(null);
    const res = resolvePersonCoordinates(draft, {
      account: status.account,
      offerSameAsAccount,
      requireBirthPlace: gap.requiresBirthPlace,
    });
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors(null);
    try {
      await save({
        variables: {
          input: { target: gap.target, targetId: gap.targetId, ...res.input },
        },
      });
      await onSaved();
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Ionicons name="alert-circle-outline" size={20} color={palette.warningText} />
        <Text style={styles.title}>
          À compléter : {gap.displayName} —{' '}
          {gap.missing.map(gapLabelFr).join(' / ')}
        </Text>
      </View>
      <PersonCoordinatesForm
        draft={draft}
        onChange={setDraft}
        account={status.account}
        offerSameAsAccount={offerSameAsAccount}
        showBirthPlace={gap.requiresBirthPlace}
        errors={errors}
      />
      <FieldError message={serverError} />
      <Button
        label={loading ? 'Enregistrement…' : 'Enregistrer'}
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
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, ...typography.bodyStrong, color: palette.ink },
});
