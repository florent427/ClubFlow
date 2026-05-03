import { useMutation } from '@apollo/client/react';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  CREATE_FAMILY_INVITE,
  SEND_FAMILY_INVITE_BY_EMAIL,
} from '../lib/viewer-documents';

type InviteRole = 'COPAYER' | 'VIEWER';

type InviteResult = {
  code: string;
  rawToken: string;
  expiresAt: string;
  familyId: string;
};

/**
 * CTA « Inviter un membre dans le foyer ».
 * Étape 1 : choix du rôle (Co-payeur / Observateur) + génération du code
 * Étape 2 : affichage du code + lien + option d'envoi par email
 */
export function InviteFamilyMemberCta() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<InviteRole>('COPAYER');
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createInvite, { loading: creating }] = useMutation(
    CREATE_FAMILY_INVITE,
  );
  const [sendByEmail, { loading: sending }] = useMutation(
    SEND_FAMILY_INVITE_BY_EMAIL,
  );

  function reset() {
    setOpen(false);
    setRole('COPAYER');
    setInvite(null);
    setEmailDraft('');
    setEmailSentTo(null);
    setError(null);
  }

  async function onGenerate() {
    setError(null);
    try {
      const { data } = await createInvite({
        variables: { input: { role } },
      });
      const res = (data as { createFamilyInvite?: InviteResult })
        ?.createFamilyInvite;
      if (!res?.code) {
        setError("L'invitation n'a pas pu être générée.");
        return;
      }
      setInvite(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue.');
    }
  }

  async function onSendEmail() {
    if (!invite) return;
    const trimmed = emailDraft.trim();
    if (!trimmed) {
      setError("Saisissez l'email du destinataire.");
      return;
    }
    setError(null);
    try {
      await sendByEmail({
        variables: { input: { code: invite.code, email: trimmed } },
      });
      setEmailSentTo(trimmed);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Échec de l'envoi de l'invitation.",
      );
    }
  }

  async function copyCode() {
    if (!invite) return;
    await Clipboard.setStringAsync(invite.code);
    Alert.alert('Code copié', 'Le code a été copié dans le presse-papiers.');
  }

  async function copyLink() {
    if (!invite) return;
    // L'URL est construite côté client (le backend ne connaît pas le
    // domaine du portail). On reproduit le format du portail web.
    const baseOrigin =
      process.env.EXPO_PUBLIC_PORTAL_ORIGIN ?? 'http://localhost:5173';
    const url = `${baseOrigin}/rejoindre?token=${invite.rawToken}`;
    await Clipboard.setStringAsync(url);
    Alert.alert('Lien copié', 'Le lien d\'invitation est dans le presse-papiers.');
  }

  return (
    <>
      <Pressable style={styles.cta} onPress={() => setOpen(true)}>
        <Ionicons name="person-add-outline" size={20} color="#1565c0" />
        <View style={styles.flex}>
          <Text style={styles.ctaTitle}>Inviter dans mon foyer</Text>
          <Text style={styles.ctaDesc}>
            Partager l'accès à un autre adulte de la famille (co-payeur ou
            observateur).
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={reset}
        presentationStyle="pageSheet"
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Inviter dans le foyer</Text>
          <Pressable onPress={reset}>
            <Ionicons name="close" size={24} color="#1565c0" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          {!invite ? (
            <>
              <Text style={styles.label}>Rôle de l'invité</Text>
              <View style={styles.roleCol}>
                <Pressable
                  style={[
                    styles.roleCard,
                    role === 'COPAYER' && styles.roleCardActive,
                  ]}
                  onPress={() => setRole('COPAYER')}
                >
                  <Text style={styles.roleCardTitle}>Co-payeur</Text>
                  <Text style={styles.roleCardDesc}>
                    Peut voir et payer les factures, gérer les profils du
                    foyer.
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.roleCard,
                    role === 'VIEWER' && styles.roleCardActive,
                  ]}
                  onPress={() => setRole('VIEWER')}
                >
                  <Text style={styles.roleCardTitle}>Observateur</Text>
                  <Text style={styles.roleCardDesc}>
                    Voit les profils et le planning, sans accès aux
                    factures.
                  </Text>
                </Pressable>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[styles.btnPrimary, creating && styles.btnDisabled]}
                disabled={creating}
                onPress={() => void onGenerate()}
              >
                <Text style={styles.btnPrimaryText}>
                  {creating ? 'Génération…' : 'Générer un code d\'invitation'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Code d'invitation</Text>
                <Text style={styles.codeValue}>{invite.code}</Text>
                <Text style={styles.expires}>
                  Expire le{' '}
                  {new Date(invite.expiresAt).toLocaleString('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </Text>
                <View style={styles.row}>
                  <Pressable
                    style={[styles.btnSecondary, styles.flex]}
                    onPress={() => void copyCode()}
                  >
                    <Ionicons name="copy-outline" size={16} color="#1e293b" />
                    <Text style={styles.btnSecondaryText}>Copier le code</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btnSecondary, styles.flex]}
                    onPress={() => void copyLink()}
                  >
                    <Ionicons name="link-outline" size={16} color="#1e293b" />
                    <Text style={styles.btnSecondaryText}>Copier le lien</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.label}>Envoyer par email (optionnel)</Text>
              <TextInput
                style={styles.input}
                value={emailDraft}
                onChangeText={setEmailDraft}
                placeholder="email@exemple.fr"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {emailSentTo ? (
                <Text style={styles.success}>
                  ✓ Invitation envoyée à {emailSentTo}.
                </Text>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                style={[
                  styles.btnPrimary,
                  (sending || !emailDraft.trim()) && styles.btnDisabled,
                ]}
                disabled={sending || !emailDraft.trim()}
                onPress={() => void onSendEmail()}
              >
                <Text style={styles.btnPrimaryText}>
                  {sending ? 'Envoi…' : 'Envoyer par email'}
                </Text>
              </Pressable>
              <Pressable style={styles.btnGhost} onPress={reset}>
                <Text style={styles.btnGhostText}>Fermer</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 12,
    padding: 14,
  },
  ctaTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  ctaDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  modalBody: { padding: 16, gap: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569' },
  hint: { fontSize: 12, color: '#64748b' },
  error: { color: '#dc2626', fontSize: 13 },
  success: { color: '#16a34a', fontSize: 13 },
  row: { flexDirection: 'row', gap: 8 },
  roleCol: { gap: 8 },
  roleCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: 'white',
  },
  roleCardActive: { backgroundColor: '#dbeafe', borderColor: '#1565c0' },
  roleCardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  roleCardDesc: { fontSize: 12, color: '#64748b', marginTop: 4 },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  btnPrimary: {
    backgroundColor: '#1565c0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  btnPrimaryText: { color: 'white', fontWeight: '700', fontSize: 15 },
  btnSecondary: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnSecondaryText: { color: '#1e293b', fontWeight: '600', fontSize: 14 },
  btnGhost: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  btnGhostText: { color: '#475569', fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  codeBox: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    alignItems: 'center',
  },
  codeLabel: { fontSize: 12, color: '#475569', fontWeight: '600' },
  codeValue: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
    color: '#1565c0',
  },
  expires: { fontSize: 11, color: '#64748b' },
});
