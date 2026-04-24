import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CANCEL_CLUB_ACCOUNTING_ENTRY,
  CLUB_ACCOUNTING_ACCOUNTS,
  CLUB_ACCOUNTING_COHORTS,
  CLUB_ACCOUNTING_ENTRIES,
  CLUB_ACCOUNTING_SUMMARY,
  CREATE_CLUB_ACCOUNTING_ENTRY,
  INIT_CLUB_ACCOUNTING_PLAN,
  SUBMIT_RECEIPT_FOR_OCR,
  SUGGEST_ACCOUNTING_CATEGORIZATION,
} from '../../lib/documents';
import { CLUB_PROJECTS } from '../../lib/projects-documents';
import type {
  AccountingEntry,
  AccountingSuggestion,
  ClubAccountingAccountsData,
  ClubAccountingCohortsData,
  ClubAccountingEntriesData,
  ClubAccountingSummaryData,
  ClubProjectsData,
  SubmitReceiptForOcrData,
  SuggestAccountingCategorizationData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';
import { downloadCsv, toCsv } from '../../lib/csv-export';
import { getClubId, getToken } from '../../lib/storage';
import { AccountingReviewDrawer } from './AccountingReviewDrawer';

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
  const [create, { loading: creating }] = useMutation(
    CREATE_CLUB_ACCOUNTING_ENTRY,
  );
  const [suggest] = useMutation<SuggestAccountingCategorizationData>(
    SUGGEST_ACCOUNTING_CATEGORIZATION,
  );
  const [initPlan, { loading: initializingPlan }] = useMutation(
    INIT_CLUB_ACCOUNTING_PLAN,
  );
  const [cancel] = useMutation(CANCEL_CLUB_ACCOUNTING_ENTRY);
  const [submitOcr, { loading: ocrLoading }] =
    useMutation<SubmitReceiptForOcrData>(SUBMIT_RECEIPT_FOR_OCR);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
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
  // Suggestion IA pré-fetchée en arrière-plan pendant la frappe
  const [suggestion, setSuggestion] = useState<AccountingSuggestion | null>(
    null,
  );
  const suggestTimerRef = useRef<number | null>(null);

  // Popup de confirmation du compte comptable : ouverte au submit du drawer
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountModalCode, setAccountModalCode] = useState('');
  const [accountModalFetching, setAccountModalFetching] = useState(false);

  const entries = entriesData?.clubAccountingEntries ?? [];
  const filtered = useMemo(() => {
    let rows = entries;
    if (kindFilter !== 'ALL')
      rows = rows.filter((e) => e.kind === kindFilter);
    if (statusFilter !== 'ALL')
      rows = rows.filter((e) => e.status === statusFilter);
    return rows;
  }, [entries, kindFilter, statusFilter]);
  const summary = summaryData?.clubAccountingSummary;
  const accounts = accountsData?.clubAccountingAccounts ?? [];
  const cohorts = cohortsData?.clubAccountingCohorts ?? [];
  const projects = projectsData?.clubProjects ?? [];

  // Filtre les comptes selon le kind sélectionné
  const availableAccounts = useMemo(() => {
    if (kind === 'INCOME')
      return accounts.filter((a) => a.kind === 'INCOME' && a.isActive);
    if (kind === 'EXPENSE')
      return accounts.filter((a) => a.kind === 'EXPENSE' && a.isActive);
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

  // Pré-fetch IA en arrière-plan pendant la saisie pour que la popup de
  // confirmation au submit apparaisse instantanément (au lieu d'attendre
  // 2-3s). Débouncé à 700ms après la dernière frappe, min 3 caractères.
  useEffect(() => {
    if (!drawerOpen) return;
    const trimmed = label.trim();
    if (trimmed.length < 3) {
      setSuggestion(null);
      return;
    }
    if (suggestTimerRef.current !== null) {
      window.clearTimeout(suggestTimerRef.current);
    }
    suggestTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const amountCents = parseEuros(amountEuros);
          const res = await suggest({
            variables: {
              input: {
                label: trimmed,
                kind,
                ...(amountCents !== null ? { amountCents } : {}),
              },
            },
          });
          setSuggestion(res.data?.suggestAccountingCategorization ?? null);
        } catch {
          setSuggestion(null);
        }
      })();
    }, 700);
    return () => {
      if (suggestTimerRef.current !== null) {
        window.clearTimeout(suggestTimerRef.current);
      }
    };
  }, [label, amountEuros, kind, drawerOpen, suggest]);

  /**
   * Submit du drawer : au lieu de créer directement, on ouvre une popup
   * de confirmation où l'IA suggère un compte comptable que l'utilisateur
   * peut valider ou modifier. Si l'IA n'a pas encore répondu (pré-fetch
   * en cours), on attend la réponse avant d'ouvrir la popup.
   */
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const l = label.trim();
    if (l.length === 0) {
      showToast('Libellé requis', 'error');
      return;
    }
    const amountCents = parseEuros(amountEuros);
    if (amountCents === null) {
      showToast('Montant invalide', 'error');
      return;
    }

    // Force un refetch des comptes + cohortes en parallèle de l'appel IA
    // pour garantir que la popup ait une liste à jour même si le cache
    // Apollo est stale (ex: seed lazy qui vient d'être déclenché).
    setAccountModalFetching(true);
    let effectiveSuggestion = suggestion;
    try {
      const [accountsRes, suggestionRes] = await Promise.all([
        refetchAccounts(),
        effectiveSuggestion
          ? Promise.resolve(null)
          : suggest({
              variables: {
                input: {
                  label: l,
                  kind,
                  ...(amountCents !== null ? { amountCents } : {}),
                },
              },
            }),
      ]);
      // Debug : si toujours 0 comptes après refetch, probablement un
      // mismatch club/auth. On affiche un toast pour aider au diag.
      const freshAccounts =
        accountsRes?.data?.clubAccountingAccounts ?? [];
      if (freshAccounts.length === 0) {
        showToast(
          'Plan comptable vide après refetch — cliquez sur "Initialiser" ou vérifiez la console réseau.',
          'warning',
        );
      }
      if (suggestionRes && 'data' in suggestionRes) {
        effectiveSuggestion =
          suggestionRes.data?.suggestAccountingCategorization ?? null;
        setSuggestion(effectiveSuggestion);
      }
    } catch (err) {
      console.error('[accounting submit] erreur', err);
      effectiveSuggestion = null;
    } finally {
      setAccountModalFetching(false);
    }

    setAccountModalCode(effectiveSuggestion?.accountCode ?? '');
    setAccountModalOpen(true);
  }

  /**
   * Confirmation de la popup : crée réellement l'écriture avec le compte
   * choisi (suggéré par l'IA ou modifié par l'utilisateur).
   */
  async function doCreate() {
    const l = label.trim();
    const amountCents = parseEuros(amountEuros);
    if (l.length === 0 || amountCents === null || !accountModalCode) {
      showToast('Données invalides', 'error');
      return;
    }
    const tags = freeformTagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await create({
        variables: {
          input: {
            kind,
            label: l,
            amountCents,
            accountCode: accountModalCode,
            ...(occurredOn
              ? { occurredAt: new Date(occurredOn).toISOString() }
              : {}),
            ...(projectId ? { projectId } : {}),
            ...(cohortCode ? { cohortCode } : {}),
            ...(disciplineCode ? { disciplineCode } : {}),
            ...(tags.length > 0 ? { freeformTags: tags } : {}),
          },
        },
      });
      showToast('Écriture enregistrée', 'success');
      setAccountModalOpen(false);
      setDrawerOpen(false);
      setLabel('');
      setAmountEuros('');
      setOccurredOn('');
      setKind('EXPENSE');
      setAccountModalCode('');
      setCohortCode('');
      setDisciplineCode('');
      setFreeformTagsStr('');
      setProjectId('');
      setSuggestion(null);
      await Promise.all([refetchEntries(), refetchSummary()]);
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
              const firstLine = e.lines[0];
              const firstAlloc = firstLine?.allocations[0];
              return (
                <tr key={e.id}>
                  <td>{fmtDate(e.occurredAt)}</td>
                  <td>
                    <div>{e.label}</div>
                    {firstAlloc && firstAlloc.cohortCode ? (
                      <small className="cf-muted">
                        {firstAlloc.cohortCode}
                        {firstAlloc.disciplineCode
                          ? ` · ${firstAlloc.disciplineCode}`
                          : ''}
                        {firstAlloc.projectTitle
                          ? ` · ${firstAlloc.projectTitle}`
                          : ''}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    {firstLine ? (
                      <small title={firstLine.accountLabel}>
                        {firstLine.accountCode}
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
                    <small className="cf-muted">{sourceLabel(e.source)}</small>
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {e.kind === 'INCOME' ? '+' : e.kind === 'EXPENSE' ? '−' : '='}{' '}
                    {fmtEuros(e.amountCents)}
                  </td>
                  <td>
                    {e.status === 'CANCELLED' || e.status === 'LOCKED' ? (
                      <span className="cf-muted">—</span>
                    ) : e.status === 'NEEDS_REVIEW' ? (
                      <>
                        <button
                          type="button"
                          className="cf-btn cf-btn--sm cf-btn--primary"
                          onClick={() => setConfirmEntry(e)}
                        >
                          Valider
                        </button>{' '}
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--danger"
                          onClick={() => setConfirmDel(e)}
                        >
                          Rejeter
                        </button>
                      </>
                    ) : e.source === 'MANUAL' || e.source === 'OCR_AI' ? (
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--danger"
                        onClick={() => setConfirmDel(e)}
                      >
                        Annuler
                      </button>
                    ) : (
                      <span className="cf-muted" title="Écriture automatique — crée une contre-passation pour corriger">
                        Auto
                      </span>
                    )}
                  </td>
                </tr>
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
                  Aucun compte disponible pour ce club. Clique pour seeder les
                  34 comptes PCG + 5 cohortes par défaut.
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
              Le compte comptable sera proposé par l'IA et confirmé à la
              création.
            </p>
          )}
          <label className="cf-field">
            <span>Montant (€) *</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountEuros}
              onChange={(e) => setAmountEuros(e.target.value)}
              placeholder="ex : 120,50"
              required
            />
          </label>
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

      {/* Popup de confirmation du compte comptable avec suggestion IA */}
      {accountModalOpen ? (
        <>
          <div
            className="cf-modal-backdrop"
            role="presentation"
            onClick={() => !creating && setAccountModalOpen(false)}
          />
          <div
            className="cf-modal cf-modal--confirm cf-modal--large"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cf-account-modal-title"
          >
            <h2 id="cf-account-modal-title" className="cf-modal-title">
              <span className="material-symbols-outlined" aria-hidden>
                auto_awesome
              </span>
              Confirmer le compte comptable
            </h2>

            <p className="cf-muted" style={{ marginTop: 0, marginBottom: 16 }}>
              <strong>{label}</strong> —{' '}
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtEuros(parseEuros(amountEuros) ?? 0)}
              </span>
            </p>

            {accountModalFetching ? (
              <div className="cf-ia-suggestion cf-ia-suggestion--loading">
                <span className="material-symbols-outlined" aria-hidden>
                  auto_awesome
                </span>
                Analyse IA en cours…
              </div>
            ) : suggestion?.accountCode && suggestion?.accountLabel ? (
              <div className="cf-ia-suggestion">
                <div className="cf-ia-suggestion__head">
                  <span className="material-symbols-outlined" aria-hidden>
                    auto_awesome
                  </span>
                  <strong>Suggestion IA</strong>
                  <span
                    className={`cf-ia-chip__score`}
                    style={{ marginLeft: 'auto' }}
                  >
                    {formatConfidence(suggestion.confidenceAccount)}
                  </span>
                </div>
                {suggestion.reasoning ? (
                  <p className="cf-ia-suggestion__reasoning">
                    {suggestion.reasoning}
                  </p>
                ) : null}
                <div
                  className={`cf-ia-suggested-account cf-ia-suggested-account--${confidenceLevel(suggestion.confidenceAccount)}`}
                >
                  <strong>{suggestion.accountCode}</strong>
                  <span>{suggestion.accountLabel}</span>
                </div>
              </div>
            ) : (
              <div
                className="cf-alert cf-alert--info"
                style={{ marginBottom: 12 }}
              >
                <span className="material-symbols-outlined" aria-hidden>
                  info
                </span>
                <div style={{ flex: 1 }}>
                  <small>
                    L'IA n'a pas pu proposer de compte — choisis manuellement
                    ci-dessous.
                  </small>
                  {suggestion?.errorMessage ? (
                    <>
                      <br />
                      <small
                        style={{
                          color: '#b91c1c',
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                        }}
                      >
                        ⚠ {suggestion.errorMessage}
                      </small>
                    </>
                  ) : null}
                </div>
              </div>
            )}

            <label className="cf-field" style={{ marginTop: 16 }}>
              <span>Compte comptable *</span>
              <select
                value={accountModalCode}
                onChange={(e) => setAccountModalCode(e.target.value)}
                required
                disabled={availableAccounts.length === 0}
              >
                <option value="">
                  {availableAccounts.length === 0
                    ? '— Plan comptable vide —'
                    : '— Choisir un compte —'}
                </option>
                {availableAccounts.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} — {a.label}
                  </option>
                ))}
              </select>
              {availableAccounts.length === 0 ? (
                <div
                  className="cf-alert cf-alert--warning"
                  style={{ marginTop: 8 }}
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    warning
                  </span>
                  <div style={{ flex: 1 }}>
                    <strong>Aucun compte disponible</strong>
                    <br />
                    <small>
                      Le plan comptable n'est pas chargé. Cliquez pour le
                      seeder (34 comptes PCG + 5 cohortes).
                    </small>
                  </div>
                  <button
                    type="button"
                    className="cf-btn cf-btn--sm cf-btn--primary"
                    onClick={async () => {
                      await doInitPlan();
                      await refetchAccounts();
                    }}
                    disabled={initializingPlan}
                  >
                    {initializingPlan ? 'Initialisation…' : 'Initialiser'}
                  </button>
                </div>
              ) : null}
              {suggestion?.accountCode &&
              accountModalCode !== suggestion.accountCode ? (
                <button
                  type="button"
                  className="cf-btn cf-btn--sm cf-btn--ghost"
                  onClick={() =>
                    setAccountModalCode(suggestion.accountCode ?? '')
                  }
                  style={{ marginTop: 6, alignSelf: 'flex-start' }}
                >
                  💡 Revenir à la suggestion IA ({suggestion.accountCode})
                </button>
              ) : null}
            </label>

            <div className="cf-modal-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setAccountModalOpen(false)}
                disabled={creating}
              >
                Retour
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void doCreate()}
                disabled={!accountModalCode || creating}
              >
                {creating ? 'Création…' : 'Confirmer et créer'}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
