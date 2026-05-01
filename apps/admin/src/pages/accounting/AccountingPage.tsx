import { useMutation, useQuery } from '@apollo/client/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ACCOUNTING_ENTRY_CONSOLIDATION_PREVIEW,
  CANCEL_CLUB_ACCOUNTING_ENTRY,
  CLUB_ACCOUNTING_ACCOUNTS,
  CLUB_ACCOUNTING_COHORTS,
  CLUB_ACCOUNTING_ENTRIES,
  CLUB_ACCOUNTING_SUMMARY,
  CLUB_FINANCIAL_ACCOUNTS,
  CONSOLIDATE_ACCOUNTING_ENTRY,
  CREATE_CLUB_ACCOUNTING_ENTRY_QUICK,
  DELETE_CLUB_ACCOUNTING_ENTRY_PERMANENT,
  INIT_CLUB_ACCOUNTING_PLAN,
  RERUN_ACCOUNTING_AI_FOR_LINE,
  SUBMIT_RECEIPT_FOR_OCR,
  UNCONSOLIDATE_ACCOUNTING_ENTRY,
  UNVALIDATE_ACCOUNTING_ENTRY_LINE,
  UPDATE_ACCOUNTING_ENTRY_FINANCIAL_ACCOUNT,
  UPDATE_ACCOUNTING_LINE_ALLOCATION,
  VALIDATE_ACCOUNTING_ENTRY_LINE,
} from '../../lib/documents';
import { CLUB_PROJECTS } from '../../lib/projects-documents';
import type {
  AccountingEntry,
  AccountingEntryConsolidationPreviewData,
  ClubAccountingAccountsData,
  ClubAccountingCohortsData,
  ClubAccountingEntriesData,
  ClubAccountingSummaryData,
  ClubFinancialAccountsData,
  ClubProjectsData,
  SubmitReceiptForOcrData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';
import { downloadCsv, toCsv } from '../../lib/csv-export';
import { getClubId, getToken } from '../../lib/storage';
import { AccountingReviewDrawer } from './AccountingReviewDrawer';
import { EntryDetailsDrawer } from './EntryDetailsDrawer';

type Period = 'ALL' | 'MONTH' | 'YEAR' | 'CUSTOM';

function computeRange(
  period: Period,
  customFrom: string,
  customTo: string,
): { from: string | null; to: string | null } {
  const now = new Date();
  if (period === 'MONTH') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (period === 'YEAR') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (period === 'CUSTOM') {
    return {
      from: customFrom ? new Date(customFrom + 'T00:00:00Z').toISOString() : null,
      to: customTo
        ? new Date(
            new Date(customTo + 'T00:00:00Z').getTime() + 24 * 3600 * 1000,
          ).toISOString()
        : null,
    };
  }
  return { from: null, to: null };
}

function fmtEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'MANUAL':
      return 'Saisie';
    case 'OCR_AI':
      return 'OCR IA';
    case 'AUTO_MEMBER_PAYMENT':
      return 'Cotisation';
    case 'AUTO_SUBSIDY':
      return 'Subvention';
    case 'AUTO_SPONSORSHIP':
      return 'Sponsor';
    case 'AUTO_SHOP':
      return 'Boutique';
    case 'AUTO_REFUND':
      return 'Avoir';
    case 'AUTO_STRIPE_FEES':
      return 'Frais Stripe';
    default:
      return source;
  }
}

function formatConfidence(score: number | null | undefined): string {
  if (score === null || score === undefined) return '';
  return `${Math.round(score * 100)}%`;
}

function confidenceLevel(
  score: number | null | undefined,
): 'high' | 'medium' | 'low' {
  if (score === null || score === undefined) return 'medium';
  if (score >= 0.85) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function statusLabel(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Brouillon';
    case 'NEEDS_REVIEW':
      return 'À valider';
    case 'POSTED':
      return 'Validée';
    case 'LOCKED':
      return 'Verrouillée';
    case 'CANCELLED':
      return 'Annulée';
    default:
      return status;
  }
}

export function AccountingPage() {
  const { showToast } = useToast();
  const [period, setPeriod] = useState<Period>('ALL');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = useMemo(
    () => computeRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );
  const { data: entriesData, refetch: refetchEntries, loading } =
    useQuery<ClubAccountingEntriesData>(CLUB_ACCOUNTING_ENTRIES, {
      fetchPolicy: 'cache-and-network',
      variables: { from: range.from, to: range.to },
    });
  const { data: summaryData, refetch: refetchSummary } =
    useQuery<ClubAccountingSummaryData>(CLUB_ACCOUNTING_SUMMARY, {
      fetchPolicy: 'cache-and-network',
      variables: { from: range.from, to: range.to },
    });
  const { data: accountsData, refetch: refetchAccounts } =
    useQuery<ClubAccountingAccountsData>(CLUB_ACCOUNTING_ACCOUNTS, {
      fetchPolicy: 'cache-and-network',
    });
  const { data: cohortsData, refetch: refetchCohorts } =
    useQuery<ClubAccountingCohortsData>(CLUB_ACCOUNTING_COHORTS, {
      fetchPolicy: 'cache-and-network',
    });
  // Query projets tolérante : si le module PROJECTS n'est pas activé
  // pour ce club, la query renvoie une erreur 403. On l'ignore pour
  // que l'UI affiche simplement "Fonctionnement général" comme seule option.
  const { data: projectsData } = useQuery<ClubProjectsData>(CLUB_PROJECTS, {
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'ignore',
  });
  // Comptes financiers (banques, caisses, transit Stripe) du club.
  const { data: finAccountsData } = useQuery<ClubFinancialAccountsData>(
    CLUB_FINANCIAL_ACCOUNTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [createQuick, { loading: creating }] = useMutation(
    CREATE_CLUB_ACCOUNTING_ENTRY_QUICK,
  );
  const [initPlan, { loading: initializingPlan }] = useMutation(
    INIT_CLUB_ACCOUNTING_PLAN,
  );
  const [validateLine] = useMutation(VALIDATE_ACCOUNTING_ENTRY_LINE);
  const [unvalidateLine] = useMutation(UNVALIDATE_ACCOUNTING_ENTRY_LINE);
  const [rerunAiLine] = useMutation(RERUN_ACCOUNTING_AI_FOR_LINE);
  const [updateAllocation] = useMutation(UPDATE_ACCOUNTING_LINE_ALLOCATION);
  const [deletePermanent] = useMutation(DELETE_CLUB_ACCOUNTING_ENTRY_PERMANENT);
  const [consolidateMut] = useMutation(CONSOLIDATE_ACCOUNTING_ENTRY);
  const [unconsolidateMut] = useMutation(UNCONSOLIDATE_ACCOUNTING_ENTRY);
  const [updateEntryFinAccount] = useMutation(
    UPDATE_ACCOUNTING_ENTRY_FINANCIAL_ACCOUNT,
  );
  // Id de la ligne sous-déployée dont le popover "Modifier analytique" est ouvert
  const [allocPopoverLineId, setAllocPopoverLineId] = useState<string | null>(
    null,
  );
  // Lignes en cours de relance IA (pour désactiver le bouton + afficher un spinner)
  const [rerunningLineIds, setRerunningLineIds] = useState<Set<string>>(
    new Set(),
  );

  // Entries expandées (sous-lignes visibles)
  const [expandedEntryIds, setExpandedEntryIds] = useState<Set<string>>(
    new Set(),
  );
  function toggleExpand(id: string) {
    setExpandedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  // Inline edit du compte par ligne dans l'expand
  const [lineAccountEdits, setLineAccountEdits] = useState<
    Record<string, string>
  >({});
  function setLineAccountEdit(lineId: string, code: string) {
    setLineAccountEdits((prev) => ({ ...prev, [lineId]: code }));
  }

  async function doValidateLine(lineId: string, code?: string) {
    try {
      await validateLine({
        variables: {
          lineId,
          accountCode: code ?? null,
        },
      });
      showToast('Ligne validée', 'success');
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doUnvalidateLine(lineId: string) {
    try {
      await unvalidateLine({ variables: { lineId } });
      showToast('Ligne dé-validée', 'success');
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  /**
   * Change le compte financier de contrepartie d'une écriture en cours
   * de revue (NEEDS_REVIEW). Met à jour l'entry ET la ligne contrepartie
   * banque/caisse. Refusé côté backend si POSTED/LOCKED.
   */
  async function doChangeFinancialAccount(
    entryId: string,
    financialAccountId: string,
  ) {
    try {
      await updateEntryFinAccount({
        variables: { entryId, financialAccountId },
      });
      showToast('Compte de contrepartie mis à jour', 'success');
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  /**
   * Consolidation d'une écriture multi-articles : regroupe les lignes
   * ayant le même compte ET les mêmes dimensions analytiques en une
   * seule ligne. Opt-in (l'utilisateur déclenche).
   */
  async function doConsolidate(entryId: string) {
    try {
      await consolidateMut({ variables: { entryId } });
      showToast('Lignes regroupées', 'success');
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  /**
   * Annule la consolidation : restaure les lignes d'origine depuis le
   * snapshot. Utile si l'utilisateur change d'avis avant de valider.
   */
  async function doUnconsolidate(entryId: string) {
    try {
      await unconsolidateMut({ variables: { entryId } });
      showToast('Regroupement annulé', 'success');
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  /**
   * Mise à jour de la ventilation analytique d'une ligne existante.
   * Utilisé depuis le popover "Modifier analytique" dans les sous-lignes.
   */
  async function doUpdateAllocation(
    lineId: string,
    patch: {
      projectId?: string | null;
      cohortCode?: string | null;
      disciplineCode?: string | null;
    },
  ) {
    try {
      await updateAllocation({
        variables: {
          lineId,
          projectId: patch.projectId ?? null,
          cohortCode: patch.cohortCode ?? null,
          disciplineCode: patch.disciplineCode ?? null,
        },
      });
      showToast('Analytique mise à jour', 'success');
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  /**
   * Relance manuelle de la catégorisation IA pour UNE ligne donnée.
   * Utile si :
   *  - L'IA a échoué lors de la création et la ligne est restée sur un
   *    compte provisoire.
   *  - L'entry est ancienne (avant l'ajout des champs IA) et n'a jamais
   *    été catégorisée.
   */
  async function doRerunAi(lineId: string) {
    setRerunningLineIds((prev) => {
      const next = new Set(prev);
      next.add(lineId);
      return next;
    });
    try {
      const res = await rerunAiLine({ variables: { lineId } });
      const data = (res.data as
        | {
            rerunAccountingAiForLine?: {
              accountCode: string | null;
              confidenceAccount: number | null;
              reasoning: string | null;
              errorMessage: string | null;
            };
          }
        | null
        | undefined)?.rerunAccountingAiForLine;
      if (data?.errorMessage) {
        showToast(`IA : ${data.errorMessage}`, 'error');
      } else if (data?.accountCode) {
        const pct = Math.round((data.confidenceAccount ?? 0) * 100);
        showToast(`IA a proposé ${data.accountCode} (${pct}%)`, 'success');
      } else {
        showToast('IA n\u2019a rien proposé', 'info');
      }
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setRerunningLineIds((prev) => {
        const next = new Set(prev);
        next.delete(lineId);
        return next;
      });
    }
  }

  async function doDeletePermanent(entryId: string) {
    if (
      !window.confirm(
        'Suppression définitive ?\n\n' +
          'Cette action est irréversible mais juridiquement autorisée car ' +
          "l'écriture n'a pas encore été comptabilisée.\n\n" +
          'Pour une écriture déjà validée, utilise la contre-passation.',
      )
    ) {
      return;
    }
    try {
      await deletePermanent({ variables: { id: entryId } });
      showToast('Écriture supprimée définitivement', 'success');
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }
  const [cancel] = useMutation(CANCEL_CLUB_ACCOUNTING_ENTRY);
  const [submitOcr, { loading: ocrLoading }] =
    useMutation<SubmitReceiptForOcrData>(SUBMIT_RECEIPT_FOR_OCR);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  // Drawer de visualisation en LECTURE SEULE (POSTED/LOCKED/CANCELLED).
  // Affiche tous les détails : lignes article, ligne contrepartie banque
  // avec son code PCG, allocations analytiques, reasoning IA, documents.
  const [viewingEntry, setViewingEntry] = useState<AccountingEntry | null>(
    null,
  );
  const [confirmEntry, setConfirmEntry] = useState<AccountingEntry | null>(
    null,
  );
  const [confirmDel, setConfirmDel] = useState<AccountingEntry | null>(null);
  const [kindFilter, setKindFilter] = useState<
    'ALL' | 'INCOME' | 'EXPENSE' | 'IN_KIND'
  >('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'NEEDS_REVIEW' | 'POSTED' | 'LOCKED' | 'CANCELLED'
  >('ALL');
  // Filtre par projet analytique — 'ALL' (aucun filtre), '__NONE__' (entries
  // sans projet alloué), ou un id de projet.
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  // Filtre par compte financier (banque/caisse/transit) — 'ALL' ou id.
  const [finAccountFilter, setFinAccountFilter] = useState<string>('ALL');

  const [kind, setKind] = useState<'INCOME' | 'EXPENSE' | 'IN_KIND'>(
    'EXPENSE',
  );
  const [label, setLabel] = useState('');
  const [amountEuros, setAmountEuros] = useState('');
  const [occurredOn, setOccurredOn] = useState('');
  const [cohortCode, setCohortCode] = useState('');
  const [disciplineCode, setDisciplineCode] = useState('');
  const [freeformTagsStr, setFreeformTagsStr] = useState('');
  const [projectId, setProjectId] = useState('');
  // Compte financier de contrepartie sélectionné dans le drawer création.
  // Vide = utilise le default BANK du club côté backend.
  const [financialAccountId, setFinancialAccountId] = useState('');
  // Mode facture multi-articles : quand l'utilisateur ajoute ≥ 1 article,
  // la saisie passe en mode détaillé (1 ligne comptable par article).
  // L'IA catégorisera CHAQUE article indépendamment (ex: ordi 1200€ →
  // immobilisation 218300, souris 30€ → charge 606400).
  const [articles, setArticles] = useState<
    Array<{
      id: string;
      label: string;
      amountEuros: string;
      // Override analytique par article (null = hérite du défaut entry)
      projectId: string | null;
      cohortCode: string | null;
      disciplineCode: string | null;
    }>
  >([]);
  // Id de l'article dont le popover "Analytique" est ouvert (null = fermé)
  const [analyticsPopoverFor, setAnalyticsPopoverFor] =
    useState<string | null>(null);

  function addArticle() {
    setArticles((prev) => [
      ...prev,
      {
        id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: '',
        amountEuros: '',
        projectId: null,
        cohortCode: null,
        disciplineCode: null,
      },
    ]);
  }

  function updateArticle(
    id: string,
    patch: Partial<{
      label: string;
      amountEuros: string;
      projectId: string | null;
      cohortCode: string | null;
      disciplineCode: string | null;
    }>,
  ) {
    setArticles((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }

  function removeArticle(id: string) {
    setArticles((prev) => prev.filter((a) => a.id !== id));
  }

  const entries = entriesData?.clubAccountingEntries ?? [];
  const filtered = useMemo(() => {
    let rows = entries;
    if (kindFilter !== 'ALL')
      rows = rows.filter((e) => e.kind === kindFilter);
    if (statusFilter !== 'ALL')
      rows = rows.filter((e) => e.status === statusFilter);
    if (projectFilter !== 'ALL') {
      if (projectFilter === '__NONE__') {
        // entries sans allocation projet
        rows = rows.filter((e) =>
          e.lines.every((l) =>
            l.allocations.every((a) => !a.projectId),
          ),
        );
      } else {
        rows = rows.filter((e) =>
          e.lines.some((l) =>
            l.allocations.some((a) => a.projectId === projectFilter),
          ),
        );
      }
    }
    if (finAccountFilter !== 'ALL') {
      rows = rows.filter((e) => e.financialAccountId === finAccountFilter);
    }
    return rows;
  }, [entries, kindFilter, statusFilter, projectFilter, finAccountFilter]);
  const summary = summaryData?.clubAccountingSummary;
  const accounts = accountsData?.clubAccountingAccounts ?? [];
  const cohorts = cohortsData?.clubAccountingCohorts ?? [];
  const projects = projectsData?.clubProjects ?? [];

  // Filtre les comptes selon le kind sélectionné.
  // Pour une dépense (EXPENSE), on inclut aussi les immobilisations (ASSET,
  // classe 2) car la règle PCG des 500 € HT peut reclasser une « dépense »
  // perçue par l'utilisateur en immobilisation comptable (ex : tatamis
  // 750 € → compte 215400). Sans ça, le compte proposé par l'IA
  // disparaîtrait de la dropdown.
  const availableAccounts = useMemo(() => {
    if (kind === 'INCOME')
      return accounts.filter((a) => a.kind === 'INCOME' && a.isActive);
    if (kind === 'EXPENSE')
      return accounts.filter(
        (a) =>
          (a.kind === 'EXPENSE' || a.kind === 'ASSET') && a.isActive,
      );
    if (kind === 'IN_KIND')
      return accounts.filter(
        (a) => a.kind === 'NEUTRAL_IN_KIND' && a.isActive,
      );
    return accounts;
  }, [accounts, kind]);

  function parseEuros(s: string): number | null {
    const cleaned = s.trim().replace(/\s/g, '').replace(',', '.');
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  // Note : la suggestion IA tourne en arrière-plan côté backend après
  // création de l'entry (status NEEDS_REVIEW). L'utilisateur n'attend
  // pas dans le drawer.

  /**
   * Submit du drawer : crée l'écriture IMMÉDIATEMENT en status
   * NEEDS_REVIEW avec un compte fallback, puis l'IA la catégorise en
   * arrière-plan (~2-5s). L'utilisateur n'attend pas — l'écriture
   * apparaît dans la review queue avec la suggestion IA prête.
   */
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const l = label.trim();
    if (l.length === 0) {
      showToast('Libellé requis', 'error');
      return;
    }

    // Mode multi-articles : les articles remplissent le tableau.
    // Le montant global est la somme. On ignore le champ amountEuros
    // en mode détaillé.
    let amountCents: number | null = null;
    let articlesPayload:
      | Array<{
          label: string;
          amountCents: number;
          projectId?: string | null;
          cohortCode?: string | null;
          disciplineCode?: string | null;
        }>
      | undefined;
    if (articles.length > 0) {
      const parsedArticles: Array<{
        label: string;
        amountCents: number;
        projectId?: string | null;
        cohortCode?: string | null;
        disciplineCode?: string | null;
      }> = [];
      for (const art of articles) {
        const lab = art.label.trim();
        const amt = parseEuros(art.amountEuros);
        if (lab.length === 0) {
          showToast('Libellé article manquant', 'error');
          return;
        }
        if (amt === null || amt <= 0) {
          showToast(`Montant invalide pour l'article "${lab}"`, 'error');
          return;
        }
        parsedArticles.push({
          label: lab,
          amountCents: amt,
          // N'envoie que si l'utilisateur a cliqué "Modifier analytique"
          // pour CET article. Sinon null → hérite du défaut entry côté
          // service.
          ...(art.projectId ? { projectId: art.projectId } : {}),
          ...(art.cohortCode ? { cohortCode: art.cohortCode } : {}),
          ...(art.disciplineCode
            ? { disciplineCode: art.disciplineCode }
            : {}),
        });
      }
      amountCents = parsedArticles.reduce((s, a) => s + a.amountCents, 0);
      articlesPayload = parsedArticles;
    } else {
      amountCents = parseEuros(amountEuros);
      if (amountCents === null) {
        showToast('Montant invalide', 'error');
        return;
      }
    }

    const tags = freeformTagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await createQuick({
        variables: {
          input: {
            kind,
            label: l,
            amountCents,
            ...(articlesPayload && articlesPayload.length > 0
              ? { articles: articlesPayload }
              : {}),
            ...(occurredOn
              ? { occurredAt: new Date(occurredOn).toISOString() }
              : {}),
            ...(projectId ? { projectId } : {}),
            ...(cohortCode ? { cohortCode } : {}),
            ...(disciplineCode ? { disciplineCode } : {}),
            ...(financialAccountId
              ? { financialAccountId }
              : {}),
            ...(tags.length > 0 ? { freeformTags: tags } : {}),
          },
        },
      });
      const articlesInfo = articlesPayload
        ? ` (${articlesPayload.length} articles, catégorisation par ligne)`
        : '';
      showToast(
        `✨ Écriture créée${articlesInfo} — IA en cours en arrière-plan.`,
        'success',
      );
      setDrawerOpen(false);
      setLabel('');
      setAmountEuros('');
      setOccurredOn('');
      setKind('EXPENSE');
      setCohortCode('');
      setDisciplineCode('');
      setFreeformTagsStr('');
      setProjectId('');
      setFinancialAccountId('');
      setArticles([]);
      setAnalyticsPopoverFor(null);
      setStatusFilter('NEEDS_REVIEW');
      await Promise.all([refetchEntries(), refetchSummary()]);
      setTimeout(() => {
        void refetchEntries();
        void refetchSummary();
      }, 4000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  function apiBase(): string {
    return (
      (import.meta.env as Record<string, string | undefined>)
        .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
    );
  }

  async function onDownloadFec() {
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      showToast('Session invalide', 'error');
      return;
    }
    try {
      const params = new URLSearchParams();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      const res = await fetch(
        `${apiBase()}/accounting/export/fec?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Club-Id': clubId,
          },
        },
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Export échoué (${res.status}) : ${txt.slice(0, 200)}`);
      }
      // Récupère le nom de fichier depuis Content-Disposition
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const fname = match?.[1] ?? `FEC-${Date.now()}.txt`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Fichier FEC téléchargé', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onUploadReceipt(file: File) {
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      showToast('Session invalide', 'error');
      return;
    }
    try {
      // 1. Upload du fichier
      const form = new FormData();
      form.append('file', file);
      const isImage = file.type.startsWith('image/');
      form.append('kind', isImage ? 'IMAGE' : 'DOCUMENT');
      const res = await fetch(`${apiBase()}/media/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
        body: form,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Upload échoué (${res.status}) : ${txt.slice(0, 200)}`);
      }
      const asset = (await res.json()) as { id: string };
      showToast('Fichier reçu, analyse IA en cours…', 'info');

      // 2. Trigger OCR
      const ocrResult = await submitOcr({
        variables: { mediaAssetId: asset.id },
      });
      const data = ocrResult.data?.submitReceiptForOcr;
      if (!data) {
        throw new Error("Réponse OCR vide");
      }
      if (data.duplicateOfEntryId) {
        showToast(
          `Doublon détecté — ce reçu a déjà été saisi (entry ${data.duplicateOfEntryId.slice(0, 8)}).`,
          'warning',
        );
      } else if (data.budgetBlocked) {
        showToast(
          'Budget IA mensuel atteint — écriture créée vide, saisie manuelle requise.',
          'warning',
        );
      } else {
        showToast(
          'Reçu analysé ! Vérifie les champs surlignés puis valide.',
          'success',
        );
      }
      setStatusFilter('NEEDS_REVIEW');
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function doInitPlan() {
    try {
      await initPlan();
      await Promise.all([refetchAccounts(), refetchCohorts()]);
      showToast('Plan comptable initialisé', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doCancel() {
    if (!confirmDel) return;
    try {
      await cancel({
        variables: {
          input: {
            id: confirmDel.id,
            reason: 'Annulation via UI',
          },
        },
      });
      showToast('Écriture annulée', 'success');
      setConfirmDel(null);
      await Promise.all([refetchEntries(), refetchSummary()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <div className="cf-page">
      <header className="cf-page-header">
        <div>
          <h1 className="cf-page-title">Comptabilité analytique</h1>
          <p className="cf-page-subtitle">
            Les cotisations sont ventilées automatiquement par cohorte, sexe
            et discipline. Scannez un reçu → IA lit + pré-remplit, vous validez.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUploadReceipt(f);
            }}
          />
          <button
            type="button"
            className="cf-btn cf-btn--ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={ocrLoading}
            title="Scanner un reçu ou une facture via OCR IA"
          >
            <span className="material-symbols-outlined" aria-hidden>
              document_scanner
            </span>
            {ocrLoading ? 'Analyse IA…' : 'Scanner un reçu'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              setDrawerOpen(true);
              // Force un refetch des comptes pour déclencher le lazy seed
              // backend si le plan n'est pas encore initialisé.
              await refetchAccounts();
            }}
          >
            <span className="material-symbols-outlined" aria-hidden>add</span>
            Nouvelle écriture
          </button>
        </div>
      </header>

      {summary ? (
        <div className="cf-acct-summary">
          <div className="cf-acct-summary__card cf-acct-summary__card--income">
            <span>Recettes</span>
            <strong>{fmtEuros(summary.incomeCents)}</strong>
          </div>
          <div className="cf-acct-summary__card cf-acct-summary__card--expense">
            <span>Dépenses</span>
            <strong>{fmtEuros(summary.expenseCents)}</strong>
          </div>
          <div className="cf-acct-summary__card cf-acct-summary__card--balance">
            <span>Solde</span>
            <strong>{fmtEuros(summary.balanceCents)}</strong>
          </div>
          {summary.inKindCents > 0 ? (
            <div className="cf-acct-summary__card">
              <span>Contributions nature</span>
              <strong>{fmtEuros(summary.inKindCents)}</strong>
            </div>
          ) : null}
          {summary.needsReviewCount > 0 ? (
            <div
              className="cf-acct-summary__card"
              style={{ background: 'rgba(255, 180, 0, 0.08)' }}
            >
              <span>À valider</span>
              <strong>{summary.needsReviewCount}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="cf-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <label className="cf-field cf-field--inline">
          <span>Type</span>
          <select
            value={kindFilter}
            onChange={(e) =>
              setKindFilter(
                e.target.value as 'ALL' | 'INCOME' | 'EXPENSE' | 'IN_KIND',
              )
            }
          >
            <option value="ALL">Tous</option>
            <option value="INCOME">Recettes</option>
            <option value="EXPENSE">Dépenses</option>
            <option value="IN_KIND">Nature (870/871)</option>
          </select>
        </label>
        <label className="cf-field cf-field--inline">
          <span>Statut</span>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as
                  | 'ALL'
                  | 'NEEDS_REVIEW'
                  | 'POSTED'
                  | 'LOCKED'
                  | 'CANCELLED',
              )
            }
          >
            <option value="ALL">Tous</option>
            <option value="POSTED">Validées</option>
            <option value="NEEDS_REVIEW">À valider</option>
            <option value="LOCKED">Verrouillées</option>
            <option value="CANCELLED">Annulées</option>
          </select>
        </label>
        {projects.length > 0 ? (
          <label className="cf-field cf-field--inline">
            <span>Projet</span>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option value="ALL">Tous projets</option>
              <option value="__NONE__">(sans projet)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {(finAccountsData?.clubFinancialAccounts ?? []).length > 0 ? (
          <label className="cf-field cf-field--inline">
            <span>Compte</span>
            <select
              value={finAccountFilter}
              onChange={(e) => setFinAccountFilter(e.target.value)}
            >
              <option value="ALL">Tous comptes</option>
              {(finAccountsData?.clubFinancialAccounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="cf-field cf-field--inline">
          <span>Période</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="ALL">Depuis le début</option>
            <option value="MONTH">Ce mois</option>
            <option value="YEAR">Cette année</option>
            <option value="CUSTOM">Personnalisée…</option>
          </select>
        </label>
        {period === 'CUSTOM' ? (
          <>
            <label className="cf-field cf-field--inline">
              <span>Du</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="cf-field cf-field--inline">
              <span>Au</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </>
        ) : null}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="cf-btn cf-btn--ghost"
            onClick={() => {
              const csv = toCsv(
                ['Date', 'Libellé', 'Type', 'Statut', 'Source', 'Montant (€)', 'Compte'],
                filtered.map((e) => [
                  e.occurredAt.slice(0, 10),
                  e.label,
                  e.kind,
                  statusLabel(e.status),
                  sourceLabel(e.source),
                  ((e.kind === 'INCOME' ? 1 : -1) * (e.amountCents / 100)).toFixed(
                    2,
                  ),
                  e.lines[0]?.accountCode ?? '',
                ]),
              );
              const ts = new Date().toISOString().slice(0, 10);
              downloadCsv(`comptabilite-${ts}.csv`, csv);
            }}
            disabled={!filtered.length}
          >
            <span className="material-symbols-outlined">download</span>
            Export CSV
          </button>
          <button
            type="button"
            className="cf-btn cf-btn--ghost"
            onClick={() => void onDownloadFec()}
            title="Fichier des Écritures Comptables (format officiel contrôle fiscal)"
          >
            <span className="material-symbols-outlined">verified</span>
            Export FEC
          </button>
        </div>
      </div>

      {loading && entries.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="account_balance"
          title="Aucune écriture"
          message="Les cotisations sont ventilées automatiquement. Ajoutez vos dépenses manuellement."
        />
      ) : (
        <table className="cf-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th>Compte</th>
              <th>Statut</th>
              <th>Source</th>
              <th style={{ textAlign: 'right' }}>Montant</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              // Distingue les lignes article (hors banque/caisse = contrepartie)
              const articleLines = e.lines.filter(
                (l) => l.accountCode !== '512000' && l.accountCode !== '530000',
              );
              const firstArticleLine = articleLines[0] ?? e.lines[0];
              const firstAlloc = firstArticleLine?.allocations[0];
              const isMultiArticle = articleLines.length > 1;
              // Calcule si les lignes d'articles ont des projets/cohortes
              // DIFFÉRENTS entre elles (cas facture mixte).
              const uniqueProjectIds = new Set(
                articleLines
                  .map((l) => l.allocations[0]?.projectId ?? null)
                  .map((p) => p ?? '__NONE__'),
              );
              const projectsAreMixed = uniqueProjectIds.size > 1;
              const uniqueCohortCodes = new Set(
                articleLines
                  .map((l) => l.allocations[0]?.cohortCode ?? null)
                  .map((c) => c ?? '__NONE__'),
              );
              const cohortsAreMixed = uniqueCohortCodes.size > 1;
              const isExpanded = expandedEntryIds.has(e.id);
              const hasUnvalidatedLines = articleLines.some(
                (l) => !l.validatedAt,
              );
              const canExpand = e.status === 'NEEDS_REVIEW' || isMultiArticle;
              return (
                <React.Fragment key={e.id}>
                  <tr>
                    <td>
                      {canExpand ? (
                        <button
                          type="button"
                          className="cf-expand-btn"
                          onClick={() => toggleExpand(e.id)}
                          aria-label={isExpanded ? 'Replier' : 'Déplier'}
                        >
                          <span
                            className="material-symbols-outlined"
                            aria-hidden
                          >
                            {isExpanded ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>
                      ) : null}
                      {fmtDate(e.occurredAt)}
                    </td>
                    <td>
                      <div>
                        {e.label}
                        {isMultiArticle ? (
                          <span
                            className="cf-badge cf-badge--info"
                            style={{
                              marginLeft: 6,
                              fontSize: '0.72rem',
                              padding: '2px 6px',
                              background: 'rgba(0, 86, 197, 0.12)',
                              color: '#0056c5',
                              borderRadius: 3,
                            }}
                            title={`${articleLines.length} articles détaillés`}
                          >
                            {articleLines.length} articles
                          </span>
                        ) : null}
                        {hasUnvalidatedLines &&
                        e.status === 'NEEDS_REVIEW' ? (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: '0.72rem',
                              color: '#b45309',
                            }}
                          >
                            ⚠{' '}
                            {
                              articleLines.filter((l) => !l.validatedAt).length
                            }
                            /{articleLines.length} à valider
                          </span>
                        ) : null}
                      </div>
                      {firstAlloc &&
                      (firstAlloc.cohortCode ||
                        firstAlloc.disciplineCode ||
                        firstAlloc.projectTitle ||
                        projectsAreMixed ||
                        cohortsAreMixed) ? (
                        <small
                          className="cf-muted"
                          title={
                            projectsAreMixed
                              ? articleLines
                                  .map(
                                    (l) =>
                                      `${l.label ?? '(sans libellé)'} → ${
                                        l.allocations[0]?.projectTitle ??
                                        '(sans projet)'
                                      }`,
                                  )
                                  .join('\n')
                              : undefined
                          }
                        >
                          {projectsAreMixed ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                marginRight: 6,
                                color: '#ff6b35',
                                fontWeight: 500,
                              }}
                            >
                              <span
                                className="material-symbols-outlined"
                                aria-hidden
                                style={{ fontSize: '0.85rem' }}
                              >
                                folder
                              </span>
                              Mixte ({uniqueProjectIds.size})
                            </span>
                          ) : firstAlloc.projectTitle ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                marginRight: 6,
                              }}
                            >
                              <span
                                className="material-symbols-outlined"
                                aria-hidden
                                style={{ fontSize: '0.85rem' }}
                              >
                                folder
                              </span>
                              {firstAlloc.projectTitle}
                            </span>
                          ) : null}
                          {!cohortsAreMixed && firstAlloc.cohortCode ? (
                            <span style={{ marginRight: 6 }}>
                              {firstAlloc.cohortCode}
                            </span>
                          ) : null}
                          {firstAlloc.disciplineCode ? (
                            <span>{firstAlloc.disciplineCode}</span>
                          ) : null}
                        </small>
                      ) : null}
                      {e.financialAccountLabel ? (
                        <small
                          className="cf-muted"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            marginLeft:
                              firstAlloc &&
                              (firstAlloc.cohortCode ||
                                firstAlloc.disciplineCode ||
                                firstAlloc.projectTitle ||
                                projectsAreMixed)
                                ? 8
                                : 0,
                          }}
                          title={`Compte de contrepartie : ${e.financialAccountCode ?? ''}`}
                        >
                          <span
                            className="material-symbols-outlined"
                            aria-hidden
                            style={{ fontSize: '0.85rem' }}
                          >
                            {e.kind === 'INCOME'
                              ? 'savings'
                              : 'account_balance_wallet'}
                          </span>
                          {e.financialAccountLabel}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      {isMultiArticle ? (
                        <small
                          className="cf-muted"
                          title={articleLines
                            .map((l) => `${l.accountCode} ${l.accountLabel}`)
                            .join('\n')}
                        >
                          {[...new Set(articleLines.map((l) => l.accountCode))]
                            .slice(0, 3)
                            .join(', ')}
                          {articleLines.length > 3 ? '…' : ''}
                        </small>
                      ) : firstArticleLine ? (
                        <small title={firstArticleLine.accountLabel}>
                          {firstArticleLine.accountCode}
                        </small>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span
                        className={`cf-pill cf-pill--${
                          e.status === 'POSTED'
                            ? 'ok'
                            : e.status === 'NEEDS_REVIEW'
                              ? 'warn'
                              : 'muted'
                        }`}
                      >
                        {statusLabel(e.status)}
                      </span>
                    </td>
                    <td>
                      <small className="cf-muted">
                        {sourceLabel(e.source)}
                      </small>
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {e.kind === 'INCOME'
                        ? '+'
                        : e.kind === 'EXPENSE'
                          ? '−'
                          : '='}{' '}
                      {fmtEuros(e.amountCents)}
                    </td>
                    <td>
                      {/* Bouton "Détails" disponible pour TOUS les
                          statuts hors NEEDS_REVIEW (qui a son propre
                          drawer de review). Ouvre un drawer lecture
                          seule avec lignes complètes + contrepartie
                          banque + code PCG. */}
                      {e.status !== 'NEEDS_REVIEW' ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => setViewingEntry(e)}
                          title="Voir tous les détails (lignes, contrepartie, documents)"
                          style={{ marginRight: 6 }}
                        >
                          <span
                            className="material-symbols-outlined"
                            aria-hidden
                            style={{ fontSize: '1rem' }}
                          >
                            visibility
                          </span>
                          {' '}Détails
                        </button>
                      ) : null}
                      {e.status === 'CANCELLED' || e.status === 'LOCKED' ? (
                        <span className="cf-muted">—</span>
                      ) : e.status === 'NEEDS_REVIEW' ? (
                        <>
                          {!hasUnvalidatedLines ? (
                            <span
                              className="cf-muted"
                              title="Toutes les lignes sont validées — statut POSTED imminent"
                            >
                              Prêt
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="cf-btn cf-btn--sm cf-btn--ghost"
                              onClick={() => toggleExpand(e.id)}
                              title="Déplie pour valider ligne par ligne"
                            >
                              Valider les lignes
                            </button>
                          )}{' '}
                          <button
                            type="button"
                            className="btn-ghost btn-ghost--danger"
                            onClick={() => void doDeletePermanent(e.id)}
                            title="Suppression définitive (autorisée car non comptabilisée)"
                          >
                            Supprimer
                          </button>
                        </>
                      ) : e.source === 'MANUAL' || e.source === 'OCR_AI' ? (
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--danger"
                          onClick={() => setConfirmDel(e)}
                          title="Contre-passation (annulation comptable avec trace)"
                        >
                          Contre-passer
                        </button>
                      ) : (
                        <span
                          className="cf-muted"
                          title="Écriture automatique — crée une contre-passation pour corriger"
                        >
                          Auto
                        </span>
                      )}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="cf-expanded-row">
                      <td colSpan={7} style={{ padding: 0 }}>
                        <div className="cf-entry-lines">
                          <ConsolidationBanner
                            entry={e}
                            onConsolidate={() => void doConsolidate(e.id)}
                            onUnconsolidate={() =>
                              void doUnconsolidate(e.id)
                            }
                          />
                          <table className="cf-entry-lines__table">
                            <thead>
                              <tr>
                                <th style={{ width: 24 }}></th>
                                <th>Article</th>
                                <th>Compte proposé</th>
                                <th style={{ width: 160 }}>Analytique</th>
                                <th style={{ width: 100 }}>Confiance IA</th>
                                <th style={{ textAlign: 'right' }}>Montant</th>
                                <th style={{ width: 200 }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {e.lines.map((l) => {
                                const isBank =
                                  l.accountCode === '512000' ||
                                  l.accountCode === '530000';
                                const validated = Boolean(l.validatedAt);
                                const currentEdit =
                                  lineAccountEdits[l.id] ?? l.accountCode;
                                const amt = l.debitCents || l.creditCents;
                                const confLevel = l.iaConfidencePct
                                  ? l.iaConfidencePct >= 85
                                    ? 'high'
                                    : l.iaConfidencePct >= 50
                                      ? 'medium'
                                      : 'low'
                                  : 'medium';
                                // Pour la sous-ligne, on filtre selon le kind de
                                // l'ENTRY (pas du formulaire). Pour une
                                // dépense on inclut EXPENSE + ASSET (règle
                                // PCG 500 € HT : tatamis 750 € → immo 215400).
                                const availablesForSelect = accounts.filter(
                                  (a) => {
                                    if (!a.isActive) return false;
                                    if (e.kind === 'INCOME')
                                      return a.kind === 'INCOME';
                                    if (e.kind === 'EXPENSE')
                                      return (
                                        a.kind === 'EXPENSE' ||
                                        a.kind === 'ASSET'
                                      );
                                    if (e.kind === 'IN_KIND')
                                      return a.kind === 'NEUTRAL_IN_KIND';
                                    return true;
                                  },
                                );
                                return (
                                  <tr
                                    key={l.id}
                                    className={
                                      validated
                                        ? 'cf-line-row cf-line-row--validated'
                                        : 'cf-line-row'
                                    }
                                  >
                                    <td>
                                      {validated ? (
                                        <span
                                          className="material-symbols-outlined"
                                          style={{
                                            color: '#16a34a',
                                            fontSize: '1.15rem',
                                          }}
                                          aria-label="Validé"
                                        >
                                          check_circle
                                        </span>
                                      ) : isBank ? (
                                        <span
                                          className="material-symbols-outlined"
                                          style={{
                                            color: 'var(--cf-text-muted)',
                                            fontSize: '1rem',
                                          }}
                                          aria-label="Contrepartie"
                                          title="Contrepartie banque (auto-validée)"
                                        >
                                          account_balance
                                        </span>
                                      ) : (
                                        <span
                                          className="material-symbols-outlined"
                                          style={{
                                            color: '#ca8a04',
                                            fontSize: '1.15rem',
                                          }}
                                          aria-label="En attente"
                                        >
                                          pending
                                        </span>
                                      )}
                                    </td>
                                    <td>
                                      <div style={{ fontWeight: 500 }}>
                                        {l.label ?? '(sans libellé)'}
                                      </div>
                                      {!isBank && l.iaReasoning ? (
                                        <small
                                          className="cf-muted"
                                          style={{
                                            display: 'block',
                                            marginTop: 2,
                                            fontStyle: 'italic',
                                          }}
                                        >
                                          <span
                                            className="material-symbols-outlined"
                                            aria-hidden
                                            style={{
                                              fontSize: '0.9rem',
                                              verticalAlign: 'middle',
                                              marginRight: 2,
                                              color: '#ff6b35',
                                            }}
                                          >
                                            auto_awesome
                                          </span>
                                          {l.iaReasoning}
                                        </small>
                                      ) : null}
                                    </td>
                                    <td>
                                      {isBank ? (
                                        // Sous-ligne contrepartie : afficher
                                        // le compte financier (ex SOGEXIA)
                                        // plutôt que juste le code PCG.
                                        // Si NEEDS_REVIEW : sélecteur pour
                                        // changer la banque/caisse.
                                        e.status === 'NEEDS_REVIEW' &&
                                        (finAccountsData?.clubFinancialAccounts ?? []).length > 0 ? (
                                          <select
                                            value={e.financialAccountId ?? ''}
                                            onChange={(ev) =>
                                              ev.target.value &&
                                              void doChangeFinancialAccount(
                                                e.id,
                                                ev.target.value,
                                              )
                                            }
                                            style={{
                                              fontSize: '0.82rem',
                                              padding: '3px 5px',
                                              maxWidth: 280,
                                            }}
                                            title="Changer le compte de contrepartie"
                                          >
                                            <option value="" disabled>
                                              {l.accountCode} {l.accountLabel}
                                            </option>
                                            {(
                                              finAccountsData?.clubFinancialAccounts ??
                                              []
                                            )
                                              .filter((a) => a.isActive)
                                              .map((a) => (
                                                <option key={a.id} value={a.id}>
                                                  {a.label} ({a.accountingAccountCode})
                                                </option>
                                              ))}
                                          </select>
                                        ) : (
                                          <div>
                                            <strong>
                                              {e.financialAccountLabel ??
                                                l.accountLabel}
                                            </strong>
                                            <br />
                                            <small className="cf-muted">
                                              {l.accountCode}
                                            </small>
                                          </div>
                                        )
                                      ) : validated ? (
                                        <div>
                                          <strong>{l.accountCode}</strong>
                                          <br />
                                          <small className="cf-muted">
                                            {l.accountLabel}
                                          </small>
                                        </div>
                                      ) : (
                                        <select
                                          value={currentEdit}
                                          onChange={(ev) =>
                                            setLineAccountEdit(
                                              l.id,
                                              ev.target.value,
                                            )
                                          }
                                          style={{
                                            fontSize: '0.82rem',
                                            padding: '3px 5px',
                                            maxWidth: 300,
                                          }}
                                        >
                                          {availablesForSelect.map((a) => (
                                            <option
                                              key={a.id}
                                              value={a.code}
                                            >
                                              {a.code} — {a.label}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                    </td>
                                    <td style={{ position: 'relative' }}>
                                      {isBank ? (
                                        <small className="cf-muted">—</small>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            className="btn-ghost btn-ghost--sm"
                                            disabled={
                                              e.status === 'LOCKED' ||
                                              e.status === 'CANCELLED'
                                            }
                                            onClick={() =>
                                              setAllocPopoverLineId(
                                                allocPopoverLineId === l.id
                                                  ? null
                                                  : l.id,
                                              )
                                            }
                                            title={
                                              e.status === 'LOCKED'
                                                ? 'Écriture verrouillée'
                                                : 'Modifier l\u2019analytique'
                                            }
                                            style={{
                                              padding: '2px 6px',
                                              fontSize: '0.8rem',
                                              textAlign: 'left',
                                              width: '100%',
                                              justifyContent: 'flex-start',
                                            }}
                                          >
                                            <span
                                              className="material-symbols-outlined"
                                              aria-hidden
                                              style={{
                                                fontSize: '0.85rem',
                                                verticalAlign: 'middle',
                                                marginRight: 3,
                                              }}
                                            >
                                              folder
                                            </span>
                                            {l.allocations[0]?.projectTitle ??
                                              '(sans projet)'}
                                          </button>
                                          {l.allocations[0]?.cohortCode ||
                                          l.allocations[0]?.disciplineCode ? (
                                            <small
                                              className="cf-muted"
                                              style={{
                                                display: 'block',
                                                marginTop: 2,
                                                fontSize: '0.72rem',
                                              }}
                                            >
                                              {l.allocations[0]?.cohortCode ??
                                                ''}
                                              {l.allocations[0]?.cohortCode &&
                                              l.allocations[0]?.disciplineCode
                                                ? ' · '
                                                : ''}
                                              {l.allocations[0]
                                                ?.disciplineCode ?? ''}
                                            </small>
                                          ) : null}
                                          {allocPopoverLineId === l.id ? (
                                            <div
                                              style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                zIndex: 10,
                                                marginTop: 4,
                                                padding: 12,
                                                background: 'white',
                                                border:
                                                  '1px solid rgba(15, 23, 42, 0.12)',
                                                borderRadius: 6,
                                                boxShadow:
                                                  '0 4px 14px rgba(15, 23, 42, 0.1)',
                                                minWidth: 300,
                                              }}
                                            >
                                              <div
                                                style={{
                                                  fontSize: '0.85rem',
                                                  fontWeight: 600,
                                                  marginBottom: 8,
                                                }}
                                              >
                                                Analytique de cette ligne
                                              </div>
                                              <label
                                                className="cf-field"
                                                style={{ marginBottom: 6 }}
                                              >
                                                <span
                                                  style={{ fontSize: '0.8rem' }}
                                                >
                                                  Projet
                                                </span>
                                                <select
                                                  defaultValue={
                                                    l.allocations[0]
                                                      ?.projectId ?? ''
                                                  }
                                                  onChange={(ev) =>
                                                    void doUpdateAllocation(
                                                      l.id,
                                                      {
                                                        projectId:
                                                          ev.target.value ||
                                                          null,
                                                      },
                                                    )
                                                  }
                                                >
                                                  <option value="">
                                                    (sans projet)
                                                  </option>
                                                  {projects.map((p) => (
                                                    <option
                                                      key={p.id}
                                                      value={p.id}
                                                    >
                                                      {p.title}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>
                                              <label
                                                className="cf-field"
                                                style={{ marginBottom: 6 }}
                                              >
                                                <span
                                                  style={{ fontSize: '0.8rem' }}
                                                >
                                                  Cohorte
                                                </span>
                                                <select
                                                  defaultValue={
                                                    l.allocations[0]
                                                      ?.cohortCode ?? ''
                                                  }
                                                  onChange={(ev) =>
                                                    void doUpdateAllocation(
                                                      l.id,
                                                      {
                                                        cohortCode:
                                                          ev.target.value ||
                                                          null,
                                                      },
                                                    )
                                                  }
                                                >
                                                  <option value="">
                                                    (aucune)
                                                  </option>
                                                  {cohorts.map((c) => (
                                                    <option
                                                      key={c.id}
                                                      value={c.code}
                                                    >
                                                      {c.label}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>
                                              <div
                                                style={{
                                                  display: 'flex',
                                                  justifyContent: 'flex-end',
                                                }}
                                              >
                                                <button
                                                  type="button"
                                                  className="cf-btn cf-btn--sm cf-btn--primary"
                                                  onClick={() =>
                                                    setAllocPopoverLineId(null)
                                                  }
                                                >
                                                  Fermer
                                                </button>
                                              </div>
                                            </div>
                                          ) : null}
                                        </>
                                      )}
                                    </td>
                                    <td>
                                      {l.iaConfidencePct !== null &&
                                      l.iaConfidencePct !== undefined ? (
                                        <span
                                          className={`cf-ia-chip__score cf-ia-chip__score--${confLevel}`}
                                          title={
                                            l.iaSuggestedAccountCode
                                              ? `IA a proposé ${l.iaSuggestedAccountCode}`
                                              : ''
                                          }
                                        >
                                          {l.iaConfidencePct}%
                                        </span>
                                      ) : isBank ? (
                                        <small className="cf-muted">
                                          (contrepartie)
                                        </small>
                                      ) : (
                                        <small className="cf-muted">
                                          IA en cours…
                                        </small>
                                      )}
                                    </td>
                                    <td
                                      style={{
                                        textAlign: 'right',
                                        fontVariantNumeric: 'tabular-nums',
                                      }}
                                    >
                                      {fmtEuros(amt)}
                                    </td>
                                    <td>
                                      {isBank ? (
                                        <small className="cf-muted">—</small>
                                      ) : validated ? (
                                        <button
                                          type="button"
                                          className="btn-ghost btn-ghost--sm"
                                          onClick={() =>
                                            void doUnvalidateLine(l.id)
                                          }
                                        >
                                          Dé-valider
                                        </button>
                                      ) : (
                                        <div
                                          style={{
                                            display: 'flex',
                                            gap: 4,
                                            alignItems: 'center',
                                            justifyContent: 'flex-end',
                                          }}
                                        >
                                          <button
                                            type="button"
                                            className="btn-ghost btn-ghost--sm"
                                            title="Relancer la catégorisation IA"
                                            disabled={rerunningLineIds.has(
                                              l.id,
                                            )}
                                            onClick={() =>
                                              void doRerunAi(l.id)
                                            }
                                            style={{
                                              padding: '4px 6px',
                                              minWidth: 0,
                                            }}
                                          >
                                            <span
                                              className="material-symbols-outlined"
                                              aria-hidden
                                              style={{
                                                fontSize: '1rem',
                                                verticalAlign: 'middle',
                                                color: '#ff6b35',
                                                animation:
                                                  rerunningLineIds.has(l.id)
                                                    ? 'cf-spin 1s linear infinite'
                                                    : undefined,
                                              }}
                                            >
                                              {rerunningLineIds.has(l.id)
                                                ? 'autorenew'
                                                : 'auto_awesome'}
                                            </span>
                                          </button>
                                          <button
                                            type="button"
                                            className="cf-btn cf-btn--sm cf-btn--primary"
                                            onClick={() =>
                                              void doValidateLine(
                                                l.id,
                                                currentEdit !== l.accountCode
                                                  ? currentEdit
                                                  : undefined,
                                              )
                                            }
                                          >
                                            Valider
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Nouvelle écriture"
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setDrawerOpen(false)}>
              Annuler
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={creating}
              form="cf-acct-form"
            >
              Créer
            </button>
          </div>
        }
      >
        <form id="cf-acct-form" onSubmit={onSubmit} className="cf-form">
          <label className="cf-field">
            <span>Type *</span>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as 'INCOME' | 'EXPENSE' | 'IN_KIND');
                setAccountCode(''); // reset compte quand type change
              }}
            >
              <option value="EXPENSE">Dépense</option>
              <option value="INCOME">Recette</option>
              <option value="IN_KIND">Contribution en nature</option>
            </select>
          </label>
          {kind !== 'IN_KIND' && (finAccountsData?.clubFinancialAccounts ?? []).length > 0 ? (
            <label className="cf-field">
              <span>{kind === 'INCOME' ? 'Encaissé sur' : 'Payé depuis'}</span>
              <select
                value={financialAccountId}
                onChange={(e) => setFinancialAccountId(e.target.value)}
              >
                <option value="">— Banque par défaut —</option>
                {(finAccountsData?.clubFinancialAccounts ?? [])
                  .filter((a) => a.isActive)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} ({a.accountingAccountCode})
                    </option>
                  ))}
              </select>
              <small className="cf-muted">
                Configure tes comptes dans Paramètres → Comptabilité.
              </small>
            </label>
          ) : null}
          <label className="cf-field">
            <span>Libellé *</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={200}
              required
            />
          </label>
          {accounts.length === 0 ? (
            <div className="cf-alert cf-alert--warning" style={{ marginBottom: 12 }}>
              <span className="material-symbols-outlined" aria-hidden>
                warning
              </span>
              <div style={{ flex: 1 }}>
                <strong>Plan comptable non initialisé</strong>
                <br />
                <small>
                  Aucun compte disponible pour ce club. Clique pour seeder
                  les comptes PCG par défaut.
                </small>
              </div>
              <button
                type="button"
                className="cf-btn cf-btn--sm cf-btn--primary"
                onClick={() => void doInitPlan()}
                disabled={initializingPlan}
              >
                {initializingPlan ? 'Initialisation…' : 'Initialiser'}
              </button>
            </div>
          ) : (
            <p
              className="cf-muted"
              style={{ fontSize: '0.82rem', marginBottom: 8 }}
            >
              <span
                className="material-symbols-outlined"
                aria-hidden
                style={{
                  fontSize: '1rem',
                  verticalAlign: 'middle',
                  marginRight: 4,
                }}
              >
                auto_awesome
              </span>
              L'écriture est créée immédiatement — l'IA catégorise le
              compte en arrière-plan (2-5s). Tu retrouveras l'écriture dans
              "À valider" pour corriger la suggestion si besoin.
            </p>
          )}
          {articles.length === 0 ? (
            <label className="cf-field">
              <span>Montant total (€) *</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountEuros}
                onChange={(e) => setAmountEuros(e.target.value)}
                placeholder="ex : 120,50"
                required
              />
            </label>
          ) : (
            <div
              className="cf-field"
              style={{
                padding: '0.5rem 0.75rem',
                background: 'rgba(0, 6, 102, 0.03)',
                borderRadius: 6,
                fontSize: '0.9rem',
              }}
            >
              <strong>Mode facture multi-articles</strong> — total :{' '}
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                  color: 'var(--cf-primary, #000666)',
                }}
              >
                {fmtEuros(
                  articles.reduce(
                    (s, a) => s + (parseEuros(a.amountEuros) ?? 0),
                    0,
                  ),
                )}
              </span>
            </div>
          )}

          {/* Section articles (mode facture multi-lignes) */}
          <fieldset
            className="cf-fieldset"
            style={{ marginTop: articles.length > 0 ? 8 : 16 }}
          >
            <legend>
              Articles{' '}
              {articles.length > 0 ? (
                <span className="cf-muted">
                  ({articles.length} ligne{articles.length > 1 ? 's' : ''})
                </span>
              ) : (
                <span className="cf-muted">
                  (optionnel — pour une facture multi-articles)
                </span>
              )}
            </legend>
            {articles.length === 0 ? (
              <p className="cf-muted" style={{ fontSize: '0.85rem' }}>
                Si la facture contient plusieurs articles de nature différente
                (ex: <em>un ordinateur + une souris</em>), ajoute-les
                individuellement. L'IA catégorisera chaque article séparément
                (charge vs immobilisation selon le montant).
              </p>
            ) : (
              <div className="cf-articles-list">
                {articles.map((art, idx) => {
                  const hasOverride =
                    art.projectId || art.cohortCode || art.disciplineCode;
                  const overrideProject = projects.find(
                    (p) => p.id === art.projectId,
                  );
                  const popoverOpen = analyticsPopoverFor === art.id;
                  return (
                    <div
                      key={art.id}
                      style={{ position: 'relative' }}
                    >
                      <div className="cf-articles-row">
                        <span className="cf-articles-idx">#{idx + 1}</span>
                        <input
                          type="text"
                          value={art.label}
                          onChange={(e) =>
                            updateArticle(art.id, { label: e.target.value })
                          }
                          placeholder="Désignation (ex: Ordinateur portable)"
                          maxLength={200}
                          style={{ flex: 2 }}
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={art.amountEuros}
                          onChange={(e) =>
                            updateArticle(art.id, {
                              amountEuros: e.target.value,
                            })
                          }
                          placeholder="Montant"
                          style={{ flex: 1, maxWidth: 120 }}
                        />
                        <button
                          type="button"
                          className={
                            hasOverride
                              ? 'btn-ghost btn-ghost--sm cf-analytic-btn--active'
                              : 'btn-ghost btn-ghost--sm'
                          }
                          onClick={() =>
                            setAnalyticsPopoverFor(
                              popoverOpen ? null : art.id,
                            )
                          }
                          title={
                            hasOverride
                              ? `Analytique surchargée${
                                  overrideProject
                                    ? ` — ${overrideProject.title}`
                                    : ''
                                }`
                              : 'Analytique (hérite du défaut)'
                          }
                          style={{
                            padding: '4px 6px',
                            minWidth: 0,
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            aria-hidden
                            style={{
                              fontSize: '1rem',
                              verticalAlign: 'middle',
                              color: hasOverride ? '#ff6b35' : undefined,
                            }}
                          >
                            folder
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--danger btn-ghost--sm"
                          onClick={() => removeArticle(art.id)}
                          aria-label="Retirer"
                        >
                          <span
                            className="material-symbols-outlined"
                            aria-hidden
                          >
                            close
                          </span>
                        </button>
                      </div>
                      {hasOverride ? (
                        <small
                          className="cf-muted"
                          style={{
                            display: 'block',
                            marginLeft: 32,
                            marginTop: 2,
                            fontStyle: 'italic',
                          }}
                        >
                          📁{' '}
                          {overrideProject
                            ? overrideProject.title
                            : '(sans projet)'}
                          {art.cohortCode ? ` · ${art.cohortCode}` : ''}
                          {art.disciplineCode
                            ? ` · ${art.disciplineCode}`
                            : ''}
                        </small>
                      ) : null}
                      {popoverOpen ? (
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            zIndex: 10,
                            marginTop: 4,
                            padding: 12,
                            background: 'white',
                            border: '1px solid rgba(15, 23, 42, 0.12)',
                            borderRadius: 6,
                            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.1)',
                            minWidth: 320,
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              marginBottom: 8,
                            }}
                          >
                            Analytique de cet article
                          </div>
                          <small
                            className="cf-muted"
                            style={{ display: 'block', marginBottom: 8 }}
                          >
                            Laisse vide pour hériter du défaut de l'écriture.
                          </small>
                          <label
                            className="cf-field"
                            style={{ marginBottom: 6 }}
                          >
                            <span style={{ fontSize: '0.8rem' }}>
                              Projet
                            </span>
                            <select
                              value={art.projectId ?? ''}
                              onChange={(e) =>
                                updateArticle(art.id, {
                                  projectId: e.target.value || null,
                                })
                              }
                            >
                              <option value="">(hériter)</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label
                            className="cf-field"
                            style={{ marginBottom: 6 }}
                          >
                            <span style={{ fontSize: '0.8rem' }}>
                              Cohorte
                            </span>
                            <select
                              value={art.cohortCode ?? ''}
                              onChange={(e) =>
                                updateArticle(art.id, {
                                  cohortCode: e.target.value || null,
                                })
                              }
                            >
                              <option value="">(hériter)</option>
                              {cohorts.map((c) => (
                                <option key={c.id} value={c.code}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label
                            className="cf-field"
                            style={{ marginBottom: 8 }}
                          >
                            <span style={{ fontSize: '0.8rem' }}>
                              Discipline
                            </span>
                            <input
                              type="text"
                              value={art.disciplineCode ?? ''}
                              placeholder="(hériter)"
                              onChange={(e) =>
                                updateArticle(art.id, {
                                  disciplineCode: e.target.value || null,
                                })
                              }
                            />
                          </label>
                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              justifyContent: 'flex-end',
                            }}
                          >
                            <button
                              type="button"
                              className="btn-ghost btn-ghost--sm"
                              onClick={() =>
                                updateArticle(art.id, {
                                  projectId: null,
                                  cohortCode: null,
                                  disciplineCode: null,
                                })
                              }
                            >
                              Réinitialiser
                            </button>
                            <button
                              type="button"
                              className="cf-btn cf-btn--sm cf-btn--primary"
                              onClick={() => setAnalyticsPopoverFor(null)}
                            >
                              OK
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              className="cf-btn cf-btn--sm cf-btn--ghost"
              onClick={addArticle}
              style={{ marginTop: 6 }}
            >
              <span className="material-symbols-outlined" aria-hidden>
                add
              </span>
              Ajouter un article
            </button>
          </fieldset>

          <label className="cf-field">
            <span>Date</span>
            <input
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </label>
          <fieldset className="cf-fieldset">
            <legend>Analytique (optionnel)</legend>
            <label className="cf-field">
              <span>Projet</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">— Fonctionnement général —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {p.status === 'ACTIVE' ? ' · actif' : ''}
                    {p.status === 'PLANNED' ? ' · prévu' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="cf-field">
              <span>Cohorte</span>
              <select
                value={cohortCode}
                onChange={(e) => setCohortCode(e.target.value)}
              >
                <option value="">— Aucune —</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cf-field">
              <span>Discipline</span>
              <input
                type="text"
                value={disciplineCode}
                onChange={(e) => setDisciplineCode(e.target.value)}
                placeholder="ex: karate, judo"
              />
            </label>
            <label className="cf-field">
              <span>Tags (séparés par virgule)</span>
              <input
                type="text"
                value={freeformTagsStr}
                onChange={(e) => setFreeformTagsStr(e.target.value)}
                placeholder="ex: gala, tournoi"
              />
            </label>
          </fieldset>
          <button type="submit" style={{ display: 'none' }} />
        </form>
      </Drawer>

      <ConfirmModal
        open={confirmDel !== null}
        title="Annuler cette écriture ?"
        message={
          confirmDel
            ? `${confirmDel.label} — L'écriture sera marquée comme annulée (conservée en base pour audit).`
            : undefined
        }
        confirmLabel="Annuler l'écriture"
        danger
        onConfirm={() => void doCancel()}
        onCancel={() => setConfirmDel(null)}
      />

      <AccountingReviewDrawer
        entry={confirmEntry}
        onClose={() => setConfirmEntry(null)}
        onSaved={async () => {
          await Promise.all([refetchEntries(), refetchSummary()]);
        }}
      />

      {/* Drawer LECTURE SEULE pour les écritures déjà validées :
          affiche les lignes complètes, la contrepartie banque + son
          code PCG, les allocations analytiques, le reasoning IA, et
          les documents attachés. */}
      <EntryDetailsDrawer
        entry={viewingEntry}
        onClose={() => setViewingEntry(null)}
      />

    </div>
  );
}

/**
 * Bandeau de consolidation affiché au-dessus des sous-lignes d'une
 * écriture déployée. Affiche :
 *  - Si déjà consolidée → bandeau vert + bouton "Défaire le regroupement"
 *  - Si éligible → bandeau bleu + bouton "Regrouper" (avec preview groupes)
 *  - Sinon (déjà unique compte, validée, etc.) → rien
 *
 * Charge la preview en lazy (au déploiement de l'entry uniquement).
 */
function ConsolidationBanner({
  entry,
  onConsolidate,
  onUnconsolidate,
}: {
  entry: AccountingEntry;
  onConsolidate: () => void;
  onUnconsolidate: () => void;
}) {
  const isConsolidated = Boolean(entry.consolidatedAt);
  const { data } = useQuery<AccountingEntryConsolidationPreviewData>(
    ACCOUNTING_ENTRY_CONSOLIDATION_PREVIEW,
    {
      variables: { entryId: entry.id },
      fetchPolicy: 'cache-and-network',
      skip: isConsolidated, // pas besoin de preview si déjà consolidée
    },
  );
  const preview = data?.accountingEntryConsolidationPreview;

  if (isConsolidated) {
    const consolidatedLines = entry.lines.filter(
      (l) => l.mergedFromArticleLabels.length > 0,
    );
    const totalMerged = consolidatedLines.reduce(
      (s, l) => s + l.mergedFromArticleLabels.length,
      0,
    );
    return (
      <div
        className="cf-alert cf-alert--ok"
        style={{
          margin: 8,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span className="material-symbols-outlined" aria-hidden>
          check_circle
        </span>
        <div style={{ flex: 1 }}>
          <strong>Écriture consolidée</strong>{' '}
          <small>— {totalMerged} articles regroupés</small>
        </div>
        <button
          type="button"
          className="btn-ghost btn-ghost--sm"
          onClick={onUnconsolidate}
          disabled={
            entry.status === 'POSTED' ||
            entry.status === 'LOCKED' ||
            entry.status === 'CANCELLED'
          }
        >
          Défaire le regroupement
        </button>
      </div>
    );
  }

  if (!preview?.eligible || preview.groups.length === 0) return null;

  const consolidableGroups = preview.groups.filter((g) => g.lineCount > 1);
  if (consolidableGroups.length === 0) return null;

  const summary = consolidableGroups
    .map(
      (g) =>
        `${g.lineCount} lignes sur ${g.accountCode} ${g.accountLabel}`,
    )
    .join(' · ');

  return (
    <div
      className="cf-alert cf-alert--info"
      style={{
        margin: 8,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(59, 130, 246, 0.08)',
        borderRadius: 6,
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ color: '#1d4ed8' }}
      >
        lightbulb
      </span>
      <div style={{ flex: 1 }}>
        <strong>Lignes regroupables</strong>
        <br />
        <small className="cf-muted">{summary}</small>
      </div>
      <button
        type="button"
        className="cf-btn cf-btn--sm cf-btn--primary"
        onClick={onConsolidate}
      >
        Regrouper
      </button>
    </div>
  );
}
