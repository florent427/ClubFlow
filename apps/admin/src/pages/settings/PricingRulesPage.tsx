import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import {
  CLUB_PRICING_RULES,
  UPSERT_CLUB_PRICING_RULE,
} from '../../lib/documents';
import type {
  ClubPaymentMethodStr,
  ClubPricingRulesQueryData,
  PricingAdjustmentTypeStr,
  UpsertClubPricingRuleMutationData,
} from '../../lib/types';
import { useClubModules } from '../../lib/club-modules-context';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';

type MethodMeta = {
  code: ClubPaymentMethodStr;
  label: string;
  hint: string;
};

const METHODS: MethodMeta[] = [
  {
    code: 'STRIPE_CARD',
    label: 'Carte bancaire (Stripe)',
    hint: 'Majoration pour absorber les frais Stripe (typiquement 1,4 % + 0,25 €).',
  },
  {
    code: 'MANUAL_CASH',
    label: 'Espèces',
    hint: 'Aucun frais côté club — laisser 0.',
  },
  {
    code: 'MANUAL_CHECK',
    label: 'Chèque',
    hint: 'Remise éventuelle pour inciter au chèque (ex. −2 %).',
  },
  {
    code: 'MANUAL_TRANSFER',
    label: 'Virement',
    hint: 'Remise éventuelle pour inciter au virement.',
  },
];

type EditedRow = {
  adjustmentType: PricingAdjustmentTypeStr;
  displayValue: string; // user text (%, in percent if PERCENT_BP; euros if FIXED_CENTS)
};

function percentBpFromInput(input: string): number {
  const n = Number(input.replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function centsFromEurosInput(input: string): number {
  const n = Number(input.replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function formatAdjustmentDisplay(
  type: PricingAdjustmentTypeStr,
  value: number,
): string {
  if (type === 'PERCENT_BP') return (value / 100).toString();
  return (value / 100).toFixed(2);
}

function summarize(
  type: PricingAdjustmentTypeStr,
  value: number,
): { text: string; tone: 'ok' | 'warn' | 'neutral' } {
  if (value === 0) return { text: 'Aucun ajustement', tone: 'neutral' };
  const isDiscount = value < 0;
  const abs = Math.abs(value);
  if (type === 'PERCENT_BP') {
    return {
      text: `${isDiscount ? '−' : '+'}${(abs / 100).toFixed(2).replace(/\.?0+$/, '')} %`,
      tone: isDiscount ? 'ok' : 'warn',
    };
  }
  return {
    text: `${isDiscount ? '−' : '+'}${(abs / 100).toFixed(2).replace(/\.?0+$/, '')} €`,
    tone: isDiscount ? 'ok' : 'warn',
  };
}

export function PricingRulesPage() {
  const { isEnabled, loading: modulesLoading } = useClubModules();
  const paymentOn = isEnabled('PAYMENT');

  const { data, loading, error, refetch } =
    useQuery<ClubPricingRulesQueryData>(CLUB_PRICING_RULES, {
      skip: !paymentOn,
      fetchPolicy: 'cache-and-network',
    });

  const [upsert, upsertState] =
    useMutation<UpsertClubPricingRuleMutationData>(UPSERT_CLUB_PRICING_RULE);

  const existing = useMemo(() => {
    const map = new Map<
      ClubPaymentMethodStr,
      { id: string; adjustmentType: PricingAdjustmentTypeStr; adjustmentValue: number }
    >();
    for (const r of data?.clubPricingRules ?? []) {
      map.set(r.method, {
        id: r.id,
        adjustmentType: r.adjustmentType,
        adjustmentValue: r.adjustmentValue,
      });
    }
    return map;
  }, [data]);

  const [edits, setEdits] = useState<Record<ClubPaymentMethodStr, EditedRow>>({
    STRIPE_CARD: { adjustmentType: 'PERCENT_BP', displayValue: '0' },
    MANUAL_CASH: { adjustmentType: 'PERCENT_BP', displayValue: '0' },
    MANUAL_CHECK: { adjustmentType: 'PERCENT_BP', displayValue: '0' },
    MANUAL_TRANSFER: { adjustmentType: 'PERCENT_BP', displayValue: '0' },
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<ClubPaymentMethodStr | null>(
    null,
  );

  useEffect(() => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const m of METHODS) {
        const row = existing.get(m.code);
        if (row) {
          next[m.code] = {
            adjustmentType: row.adjustmentType,
            displayValue: formatAdjustmentDisplay(
              row.adjustmentType,
              row.adjustmentValue,
            ),
          };
        }
      }
      return next;
    });
  }, [existing]);

  async function handleSave(method: ClubPaymentMethodStr) {
    const row = edits[method];
    const adjustmentValue =
      row.adjustmentType === 'PERCENT_BP'
        ? percentBpFromInput(row.displayValue)
        : centsFromEurosInput(row.displayValue);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      await upsert({
        variables: {
          input: {
            method,
            adjustmentType: row.adjustmentType,
            adjustmentValue,
          },
        },
      });
      await refetch();
      setSaveSuccess(method);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (modulesLoading) {
    return <LoadingState label="Chargement…" />;
  }

  if (!paymentOn) {
    return (
      <div className="cf-page">
        <div className="cf-page__header">
          <div>
            <h1 className="cf-page__title">Tarification par moyen de paiement</h1>
            <p className="cf-page__subtitle">
              Activez le module Paiement pour configurer les remises / majorations.
            </p>
          </div>
        </div>
        <EmptyState
          icon="lock"
          title="Module Paiement désactivé"
          message="Rendez-vous dans Modules du club pour l'activer."
        />
      </div>
    );
  }

  return (
    <div className="cf-page">
      <div className="cf-page__header">
        <div>
          <h1 className="cf-page__title">Tarification par moyen de paiement</h1>
          <p className="cf-page__subtitle">
            Appliquez une remise (valeur négative) ou une majoration (valeur
            positive) automatique selon le mode de paiement choisi par le payeur.
          </p>
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Impossible de charger les règles"
          message={error.message}
          action={
            <button
              type="button"
              className="btn-primary"
              onClick={() => void refetch()}
            >
              Réessayer
            </button>
          }
        />
      ) : loading && !data ? (
        <LoadingState label="Chargement des règles…" />
      ) : (
        <ul className="cf-pricing-rules">
          {METHODS.map((m) => {
            const row = edits[m.code];
            const current = existing.get(m.code);
            const summary = current
              ? summarize(current.adjustmentType, current.adjustmentValue)
              : { text: 'Non configuré', tone: 'neutral' as const };
            const isSuccess = saveSuccess === m.code;
            return (
              <li key={m.code} className="cf-pricing-rule">
                <div className="cf-pricing-rule__head">
                  <div>
                    <div className="cf-pricing-rule__title">{m.label}</div>
                    <div className="cf-pricing-rule__hint">{m.hint}</div>
                  </div>
                  <span
                    className={`cf-pill ${
                      summary.tone === 'ok'
                        ? 'cf-pill--ok'
                        : summary.tone === 'warn'
                          ? 'cf-pill--warn'
                          : 'cf-pill--draft'
                    }`}
                  >
                    {summary.text}
                  </span>
                </div>
                <div className="cf-pricing-rule__controls">
                  <label className="cf-field">
                    <span className="cf-field__label">Type</span>
                    <select
                      className="cf-field__input"
                      value={row.adjustmentType}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [m.code]: {
                            ...prev[m.code],
                            adjustmentType: e.target
                              .value as PricingAdjustmentTypeStr,
                          },
                        }))
                      }
                    >
                      <option value="PERCENT_BP">Pourcentage (%)</option>
                      <option value="FIXED_CENTS">Montant fixe (€)</option>
                    </select>
                  </label>
                  <label className="cf-field">
                    <span className="cf-field__label">
                      Valeur{' '}
                      {row.adjustmentType === 'PERCENT_BP' ? '(%)' : '(€)'}
                    </span>
                    <input
                      className="cf-field__input"
                      type="text"
                      inputMode="decimal"
                      value={row.displayValue}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [m.code]: {
                            ...prev[m.code],
                            displayValue: e.target.value,
                          },
                        }))
                      }
                      placeholder={
                        row.adjustmentType === 'PERCENT_BP' ? '1.40' : '0.25'
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSave(m.code)}
                    disabled={upsertState.loading}
                  >
                    {upsertState.loading ? '…' : 'Enregistrer'}
                  </button>
                </div>
                {isSuccess ? (
                  <p className="cf-pricing-rule__success">
                    Règle enregistrée.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {saveError ? (
        <p className="cf-form-error" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
