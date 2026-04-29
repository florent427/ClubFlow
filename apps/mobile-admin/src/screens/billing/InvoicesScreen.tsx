import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BottomActionBar,
  ConfirmSheet,
  DataTable,
  FilterChipBar,
  KpiTile,
  ScreenContainer,
  ScreenHero,
  SearchBar,
  formatDateShort,
  formatEuroCents,
  palette,
  radius,
  spacing,
  typography,
  useDebounced,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CLUB_INVOICES,
  CLUB_OVERDUE_INVOICES,
  INVOICE_STATUS_BADGES,
  SEND_INVOICE_REMINDER,
  VOID_CLUB_INVOICE,
  type InvoiceStatus,
} from '../../lib/documents/billing';

type Invoice = {
  id: string;
  familyId: string;
  familyLabel: string | null;
  householdGroupLabel: string | null;
  label: string;
  amountCents: number;
  status: InvoiceStatus;
  dueAt: string | null;
  totalPaidCents: number;
  balanceCents: number;
  isCreditNote: boolean;
};

type Data = { clubInvoices: Invoice[] };
type OverdueData = {
  clubOverdueInvoices: { invoiceId: string; balanceCents: number }[];
};

type FilterKey = 'OPEN' | 'OVERDUE' | 'PAID' | 'CREDIT' | 'VOID';

const FILTER_CHIPS = [
  { key: 'OPEN' as const, label: 'Ouvertes' },
  { key: 'OVERDUE' as const, label: 'En retard' },
  { key: 'PAID' as const, label: 'Payées' },
  { key: 'CREDIT' as const, label: 'Avoirs' },
  { key: 'VOID' as const, label: 'Annulées' },
];

export function InvoicesScreen() {
  const nav = useNavigation();
  const goTo = (name: string, params?: Record<string, unknown>) => {
    (nav as unknown as { navigate: (n: string, p?: unknown) => void }).navigate(
      name,
      params,
    );
  };
  const [filter, setFilter] = useState<FilterKey | null>('OPEN');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const { data, loading, refetch } = useQuery<Data>(CLUB_INVOICES, {
    errorPolicy: 'all',
  });
  const { data: overdue } = useQuery<OverdueData>(CLUB_OVERDUE_INVOICES, {
    errorPolicy: 'all',
  });
  const [voidInvoice] = useMutation(VOID_CLUB_INVOICE);
  const [sendReminder] = useMutation(SEND_INVOICE_REMINDER);

  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [voidConfirm, setVoidConfirm] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    sent: number;
    failed: number;
    total: number;
  } | null>(null);

  const list = data?.clubInvoices ?? [];
  const overdueIds = useMemo(
    () => new Set((overdue?.clubOverdueInvoices ?? []).map((o) => o.invoiceId)),
    [overdue],
  );

  const kpis = useMemo(() => {
    let openTotal = 0;
    let overdueTotal = 0;
    let paidTotal = 0;
    for (const inv of list) {
      if (inv.isCreditNote) continue;
      if (inv.status === 'OPEN') {
        openTotal += inv.balanceCents;
        if (overdueIds.has(inv.id)) overdueTotal += inv.balanceCents;
      } else if (inv.status === 'PAID') {
        paidTotal += inv.amountCents;
      }
    }
    return { openTotal, overdueTotal, paidTotal };
  }, [list, overdueIds]);

  const rows = useMemo<DataTableRow[]>(() => {
    const filtered = list.filter((inv) => {
      if (filter === 'OPEN') {
        if (inv.status !== 'OPEN' || inv.isCreditNote) return false;
      } else if (filter === 'OVERDUE') {
        if (inv.status !== 'OPEN' || !overdueIds.has(inv.id)) return false;
      } else if (filter === 'PAID') {
        if (inv.status !== 'PAID' || inv.isCreditNote) return false;
      } else if (filter === 'CREDIT') {
        if (!inv.isCreditNote) return false;
      } else if (filter === 'VOID') {
        if (inv.status !== 'VOID') return false;
      }
      if (debounced.trim().length > 0) {
        const q = debounced.toLowerCase();
        const hay = [inv.label, inv.familyLabel, inv.householdGroupLabel]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return filtered.map<DataTableRow>((inv) => {
      const baseBadge = inv.isCreditNote
        ? { label: 'Avoir', color: palette.infoText, bg: palette.infoBg }
        : INVOICE_STATUS_BADGES[inv.status];
      const isOverdue = inv.status === 'OPEN' && overdueIds.has(inv.id);
      const subtitleParts: string[] = [];
      if (inv.familyLabel) subtitleParts.push(inv.familyLabel);
      if (inv.dueAt) {
        subtitleParts.push(
          isOverdue
            ? `⚠ Échue ${formatDateShort(inv.dueAt)}`
            : `Échéance ${formatDateShort(inv.dueAt)}`,
        );
      }
      if (inv.status === 'OPEN' && inv.totalPaidCents > 0) {
        subtitleParts.push(`Acompte ${formatEuroCents(inv.totalPaidCents)}`);
      }
      return {
        key: inv.id,
        title: `${inv.label} · ${formatEuroCents(inv.amountCents)}`,
        subtitle: subtitleParts.join(' · ') || null,
        badge: isOverdue
          ? { label: 'En retard', color: palette.dangerText, bg: palette.dangerBg }
          : baseBadge,
      };
    });
  }, [list, filter, debounced, overdueIds]);

  const target = actionTargetId
    ? list.find((i) => i.id === actionTargetId) ?? null
    : null;

  const onAction = async (key: string) => {
    setActionTargetId(null);
    if (!target) return;
    switch (key) {
      case 'pay':
        goTo('RecordPayment', { invoiceId: target.id });
        break;
      case 'view':
        goTo('InvoiceDetail', { invoiceId: target.id });
        break;
      case 'remind':
        try {
          const res = await sendReminder({ variables: { invoiceId: target.id } });
          const sentTo = (
            res.data as { sendInvoiceReminder?: { sentTo: string } } | null | undefined
          )?.sendInvoiceReminder?.sentTo;
          Alert.alert('Relance envoyée', `Email envoyé à ${sentTo ?? 'destinataire'}.`);
        } catch (err) {
          Alert.alert('Erreur', err instanceof Error ? err.message : 'Envoi impossible.');
        }
        break;
      case 'void':
        setVoidConfirm(target.id);
        break;
    }
  };

  const onVoidConfirm = async () => {
    if (!voidConfirm) return;
    setVoiding(true);
    try {
      await voidInvoice({ variables: { id: voidConfirm, reason: null } });
      setVoidConfirm(null);
      void refetch();
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Annulation impossible.',
      );
    } finally {
      setVoiding(false);
    }
  };

  const overdueList = overdue?.clubOverdueInvoices ?? [];
  const overdueCount = overdueList.length;

  const onBulkRemind = async () => {
    if (overdueCount === 0) return;
    setBulkConfirm(false);
    setBulkProgress({ sent: 0, failed: 0, total: overdueCount });

    let sent = 0;
    let failed = 0;
    // Envoi séquentiel pour respecter les limites SMTP/relais et donner
    // un feedback de progression utilisateur lisible.
    for (const o of overdueList) {
      try {
        await sendReminder({ variables: { invoiceId: o.invoiceId } });
        sent += 1;
      } catch {
        failed += 1;
      }
      setBulkProgress({ sent, failed, total: overdueCount });
    }

    setBulkProgress(null);
    Alert.alert(
      'Relances envoyées',
      `${sent} relance${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''}` +
        (failed > 0 ? ` · ${failed} échec${failed > 1 ? 's' : ''}` : '') +
        '.',
    );
    void refetch();
  };

  return (
    <ScreenContainer scroll={false} padding={0}>
      <ScreenHero
        eyebrow="FACTURATION"
        title="Factures"
        subtitle={
          kpis.overdueTotal > 0
            ? `${formatEuroCents(kpis.overdueTotal)} en retard de paiement`
            : 'Suivi des encaissements'
        }
        compact
      />

      <View style={styles.kpis}>
        <KpiTile
          icon="alert-circle-outline"
          label="En retard"
          value={formatEuroCents(kpis.overdueTotal)}
          tone="warm"
          compact
          onPress={overdueCount > 0 ? () => setFilter('OVERDUE') : undefined}
        />
        <KpiTile
          icon="hourglass-outline"
          label="Impayé"
          value={formatEuroCents(kpis.openTotal)}
          compact
          onPress={() => setFilter('OPEN')}
        />
        <KpiTile
          icon="trending-up-outline"
          label="Payées"
          value={formatEuroCents(kpis.paidTotal)}
          tone="success"
          compact
          onPress={() => setFilter('PAID')}
        />
      </View>

      {/* Bandeau action en masse pour les retards */}
      {overdueCount > 0 ? (
        <View style={styles.bulkBanner}>
          <View style={styles.bulkIcon}>
            <Ionicons
              name="alert-circle"
              size={22}
              color={palette.warningText}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bulkTitle}>
              {overdueCount} facture{overdueCount > 1 ? 's' : ''} en retard
            </Text>
            <Text style={styles.bulkSubtitle} numberOfLines={1}>
              {formatEuroCents(kpis.overdueTotal)} à recouvrer
            </Text>
          </View>
          <Pressable
            onPress={() => setBulkConfirm(true)}
            disabled={bulkProgress !== null}
            style={({ pressed }) => [
              styles.bulkBtn,
              pressed && { opacity: 0.85 },
              bulkProgress !== null && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Relancer les ${overdueCount} factures en retard`}
          >
            {bulkProgress !== null ? (
              <>
                <ActivityIndicator size="small" color={palette.surface} />
                <Text style={styles.bulkBtnText}>
                  {bulkProgress.sent + bulkProgress.failed}/{bulkProgress.total}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="mail" size={16} color={palette.surface} />
                <Text style={styles.bulkBtnText}>Tout relancer</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher facture, famille…"
        />
      </View>
      <FilterChipBar
        chips={FILTER_CHIPS}
        activeKey={filter}
        onSelect={(k) => setFilter(k as FilterKey | null)}
        allLabel="Tout"
      />

      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle={
          filter === 'OPEN' ? 'Aucune facture impayée' : 'Aucune facture'
        }
        emptySubtitle={
          filter === 'OPEN'
            ? 'Tout est à jour. Bravo !'
            : 'Aucune facture ne correspond aux critères.'
        }
        emptyIcon="receipt-outline"
        onPressRow={(id) =>
          goTo('InvoiceDetail', { invoiceId: id })
        }
        onLongPressRow={(id) => setActionTargetId(id)}
      />

      <Pressable
        onPress={() => {
          const firstOpen = list.find(
            (i) => i.status === 'OPEN' && !i.isCreditNote,
          );
          if (firstOpen) {
            goTo('RecordPayment', { invoiceId: firstOpen.id });
          } else {
            Alert.alert(
              'Aucune facture ouverte',
              'Toutes les factures sont à jour.',
            );
          }
        }}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Encaisser un règlement"
      >
        <Ionicons name="cash" size={26} color={palette.surface} />
      </Pressable>

      <BottomActionBar
        visible={target !== null}
        onClose={() => setActionTargetId(null)}
        title={target?.label ?? ''}
        actions={
          target
            ? [
                {
                  key: 'view',
                  label: 'Voir le détail',
                  icon: 'eye-outline',
                },
                ...(target.status === 'OPEN' && !target.isCreditNote
                  ? ([
                      {
                        key: 'pay',
                        label: 'Encaisser un règlement',
                        icon: 'cash-outline',
                        tone: 'primary',
                      },
                      {
                        key: 'remind',
                        label: 'Envoyer une relance',
                        icon: 'mail-outline',
                      },
                      {
                        key: 'void',
                        label: 'Annuler la facture',
                        icon: 'trash-outline',
                        tone: 'danger',
                      },
                    ] as const)
                  : []),
              ]
            : []
        }
        onAction={(k) => void onAction(k)}
      />

      <ConfirmSheet
        visible={voidConfirm !== null}
        title="Annuler la facture ?"
        message="L'opération est définitive. Pour rembourser un paiement déjà reçu, créez plutôt un avoir."
        confirmLabel="Annuler la facture"
        destructive
        loading={voiding}
        onCancel={() => setVoidConfirm(null)}
        onConfirm={() => void onVoidConfirm()}
      />

      <ConfirmSheet
        visible={bulkConfirm}
        title={`Relancer ${overdueCount} facture${overdueCount > 1 ? 's' : ''} ?`}
        message={`Un email de relance sera envoyé pour chaque facture en retard. Total : ${formatEuroCents(kpis.overdueTotal)}.`}
        confirmLabel={`Relancer (${overdueCount})`}
        cancelLabel="Annuler"
        onCancel={() => setBulkConfirm(false)}
        onConfirm={() => void onBulkRemind()}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  kpis: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  bulkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: palette.warningBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.warningBorder,
  },
  bulkIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkTitle: {
    ...typography.bodyStrong,
    color: palette.warningText,
  },
  bulkSubtitle: {
    ...typography.small,
    color: palette.warningText,
    opacity: 0.85,
  },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: palette.warningText,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    minWidth: 120,
    justifyContent: 'center',
  },
  bulkBtnText: {
    ...typography.smallStrong,
    color: palette.surface,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: palette.success,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
