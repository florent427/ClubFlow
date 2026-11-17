import { useApolloClient, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  VIEWER_COORDINATES_STATUS,
  type CoordinatesStatus,
} from '../lib/coordinates';
import {
  VIEWER_DOCUMENTS_TO_SIGN,
  type ViewerDocumentToSign,
} from '../lib/documents-signature';
import {
  actionsLabel,
  countActions,
  documentsSection,
  infosSection,
  paymentsSection,
  type StatusItem,
  type StatusSection,
  type StatusTone,
  type SummaryCart,
} from '../lib/status-summary';
import { VIEWER_INVOICE_PAYMENT_SCHEDULE } from '../lib/viewer-documents';
import type {
  EditableProfileFieldKey,
  ViewerBillingData,
  ViewerInvoicePaymentScheduleData,
  ViewerMeData,
  ViewerPaymentSchedule,
} from '../lib/viewer-types';

type Me = ViewerMeData['viewerMe'];
type Billing = ViewerBillingData['viewerFamilyBillingSummary'];

const TONE_ICON: Record<StatusTone, string> = {
  ok: 'check_circle',
  todo: 'pending',
  alert: 'error',
  info: 'info',
};

const TONE_LABEL: Record<StatusTone, string> = {
  ok: 'En ordre',
  todo: 'À faire',
  alert: 'Attention',
  info: 'Information',
};

/**
 * Échéanciers des factures couvertes. L'API les sert un par un : on les
 * demande en parallèle, et une erreur laisse simplement la ligne sans détail.
 */
function useInvoiceSchedules(
  invoiceIds: string[],
): Record<string, ViewerPaymentSchedule | null> {
  const client = useApolloClient();
  const key = invoiceIds.join(',');
  const [schedules, setSchedules] = useState<
    Record<string, ViewerPaymentSchedule | null>
  >({});

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const ids = key.split(',');
    void Promise.all(
      ids.map(async (invoiceId) => {
        try {
          const res = await client.query<ViewerInvoicePaymentScheduleData>({
            query: VIEWER_INVOICE_PAYMENT_SCHEDULE,
            variables: { invoiceId },
            fetchPolicy: 'network-only',
          });
          return [invoiceId, res.data?.viewerInvoicePaymentSchedule ?? null] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (!alive) return;
      setSchedules(
        Object.fromEntries(entries.filter((e) => e !== null)),
      );
    });
    return () => {
      alive = false;
    };
  }, [client, key]);

  return schedules;
}

function profileFieldValue(me: Me, key: EditableProfileFieldKey): string | null {
  switch (key) {
    case 'PHONE':
      return me.phone;
    case 'ADDRESS_LINE':
      return me.addressLine;
    case 'POSTAL_CODE':
      return me.postalCode;
    case 'CITY':
      return me.city;
    case 'BIRTH_DATE':
      return me.birthDate;
  }
}

function ItemRow({ item }: { item: StatusItem }) {
  const body = (
    <>
      <span
        className="material-symbols-outlined mp-status-item__ico"
        aria-hidden="true"
      >
        {TONE_ICON[item.tone]}
      </span>
      <span className="mp-status-item__body">
        <span className="mp-status-item__head">
          <span className="mp-status-item__title">
            <span className="mp-sr-only">{TONE_LABEL[item.tone]} : </span>
            {item.title}
          </span>
          {item.amount ? (
            <span className="mp-status-item__amount">{item.amount}</span>
          ) : null}
        </span>
        {item.detail ? (
          <span className="mp-status-item__detail">{item.detail}</span>
        ) : null}
        {item.to && item.cta ? (
          <span className="mp-status-item__cta">
            {item.cta}
            <span className="material-symbols-outlined" aria-hidden="true">
              chevron_right
            </span>
          </span>
        ) : null}
      </span>
    </>
  );
  const className = `mp-status-item mp-status-item--${item.tone}`;
  return (
    <li>
      {item.to ? (
        <Link to={item.to} className={`${className} mp-status-item--link`}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

function SectionCard({
  section,
  loading,
}: {
  section: StatusSection;
  loading: boolean;
}) {
  const actions = countActions([section]);
  return (
    <article className="mp-status-section">
      <header className="mp-status-section__head">
        <span
          className="material-symbols-outlined mp-status-section__ico"
          aria-hidden="true"
        >
          {section.icon}
        </span>
        <h3 className="mp-status-section__title">{section.title}</h3>
        {section.items.length > 0 ? (
          <span
            className={`mp-status-chip mp-status-chip--${actions > 0 ? 'todo' : 'ok'}`}
          >
            {actions > 0 ? `${actions} à faire` : 'En ordre'}
          </span>
        ) : null}
      </header>
      {section.figures.length > 0 ? (
        <dl className="mp-status-figures">
          {section.figures.map((f) => (
            <div key={f.label} className="mp-status-figure">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {section.items.length > 0 ? (
        <ul className="mp-status-list">
          {section.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="mp-hint">
          {loading ? 'Chargement…' : 'Rien à signaler pour le moment.'}
        </p>
      )}
    </article>
  );
}

/**
 * Carte « Où j'en suis » de l'accueil : ce qui est réglé, ce qui reste à
 * faire, côté paiements, documents et informations personnelles.
 */
export function StatusSummary({
  me,
  billing,
  billingLoading,
  cart,
  cartId,
  requiresMedicalCertificate,
}: {
  me: Me | undefined;
  billing: Billing | undefined;
  billingLoading: boolean;
  cart: SummaryCart | null;
  /** Panier ouvert : ajoute les coordonnées manquantes des personnes inscrites. */
  cartId: string | null;
  requiresMedicalCertificate: boolean;
}) {
  const docsQ = useQuery<{ viewerDocumentsToSign: ViewerDocumentToSign[] }>(
    VIEWER_DOCUMENTS_TO_SIGN,
    { errorPolicy: 'all', fetchPolicy: 'cache-and-network' },
  );
  const coordsQ = useQuery<{ viewerCoordinatesStatus: CoordinatesStatus }>(
    VIEWER_COORDINATES_STATUS,
    {
      variables: { cartId },
      errorPolicy: 'all',
      fetchPolicy: 'cache-and-network',
    },
  );

  const isPayer = billing?.isPayerView === true;
  const scheduleInvoiceIds = useMemo(
    () =>
      isPayer
        ? (billing?.invoices ?? [])
            .filter(
              (i) =>
                i.balanceCents > 0 && i.coveredBySchedule && !i.awaitingCardSetup,
            )
            .map((i) => i.id)
        : [],
    [billing, isPayer],
  );
  const schedules = useInvoiceSchedules(scheduleInvoiceIds);

  const sections = useMemo(() => {
    const today = new Date();
    const showMemberData =
      !!me && !me.isContactProfile && !me.hideMemberModules;
    return [
      paymentsSection({
        billing: billing ?? null,
        schedules,
        cart,
        today,
      }),
      documentsSection({
        documentsToSign: docsQ.data?.viewerDocumentsToSign ?? null,
        medicalCert: showMemberData
          ? {
              expiresAt: me.medicalCertExpiresAt,
              required: requiresMedicalCertificate,
            }
          : null,
        today,
      }),
      infosSection({
        coordinateGaps: coordsQ.data?.viewerCoordinatesStatus?.gaps ?? null,
        missingRequiredFields: me
          ? me.editableProfileFields
              .filter(
                (f) => f.required && !profileFieldValue(me, f.key)?.trim(),
              )
              .map((f) => ({ key: f.key, label: f.label }))
          : null,
      }),
    ];
  }, [
    me,
    billing,
    schedules,
    cart,
    docsQ.data,
    coordsQ.data,
    requiresMedicalCertificate,
  ]);

  const loadingByKey = {
    payments: billingLoading,
    documents: docsQ.loading || !me,
    infos: coordsQ.loading || !me,
  };
  const anyLoading =
    loadingByKey.payments || loadingByKey.documents || loadingByKey.infos;
  const actions = countActions(sections);

  return (
    <section className="mp-status" aria-labelledby="mp-status-title">
      <header className="mp-status__head">
        <div>
          <h2 id="mp-status-title" className="mp-status__title">
            Où j’en suis
          </h2>
          <p className="mp-status__sub">
            Vos paiements, vos documents et vos informations, en un coup d’œil.
          </p>
        </div>
        {/* Pas de « tout est en ordre » tant qu'une source charge encore. */}
        {actions > 0 || !anyLoading ? (
          <span
            className={`mp-status__badge mp-status__badge--${actions > 0 ? 'todo' : 'ok'}`}
            role="status"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {actions > 0 ? 'pending_actions' : 'task_alt'}
            </span>
            {actionsLabel(actions)}
          </span>
        ) : null}
      </header>
      <div className="mp-status__grid">
        {sections.map((section) => (
          <SectionCard
            key={section.key}
            section={section}
            loading={loadingByKey[section.key]}
          />
        ))}
      </div>
    </section>
  );
}
