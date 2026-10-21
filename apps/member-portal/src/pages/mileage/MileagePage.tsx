import { useQuery } from '@apollo/client/react';
import { useSearchParams } from 'react-router-dom';
import {
  VIEWER_MILEAGE_DONATION_AVAILABLE,
  VIEWER_MILEAGE_VEHICLES,
  type ViewerMileageDonationAvailableData,
  type ViewerMileageVehiclesData,
} from '../../lib/mileage-documents';
import { errorMessage } from '../../lib/mileage-format';
import { MileageClaimEditor, MileageClaimsList } from './MileageClaims';
import { MileageReceipts } from './MileageReceipts';
import { MileageRecurring } from './MileageRecurring';
import { MileageVehicles } from './MileageVehicles';
import './mileage.css';

type Tab = 'notes' | 'vehicules' | 'trajets' | 'recus';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'notes', label: 'Mes notes' },
  { id: 'vehicules', label: 'Mes véhicules' },
  { id: 'trajets', label: 'Trajets récurrents' },
  { id: 'recus', label: 'Reçus fiscaux' },
];

/**
 * « Mes frais kilométriques » : le bénévole déclare ses déplacements pour le
 * club, se les fait rembourser ou y renonce contre un reçu fiscal. L'onglet
 * et la note ouverte vivent dans l'URL (`?onglet=…&note=…`) : le bouton
 * retour du téléphone revient à la liste au lieu de quitter la page.
 */
export function MileagePage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('onglet') as Tab | null;
  const openClaimId = params.get('note');

  const { data: donationData } = useQuery<ViewerMileageDonationAvailableData>(
    VIEWER_MILEAGE_DONATION_AVAILABLE,
  );
  const {
    data: vehiclesData,
    loading: vehiclesLoading,
    error: vehiclesError,
  } = useQuery<ViewerMileageVehiclesData>(VIEWER_MILEAGE_VEHICLES, {
    variables: { includeArchived: true },
    fetchPolicy: 'cache-and-network',
  });

  const donationAvailable = donationData?.viewerMileageDonationAvailable === true;
  const vehicles = vehiclesData?.viewerMileageVehicles ?? [];
  const hasVehicle = vehiclesLoading || vehicles.some((v) => !v.archived);

  // Les reçus ne concernent que les clubs qui en délivrent ; on garde
  // l'onglet si le lien y mène directement (reçus d'une année passée).
  const tabs = TABS.filter((t) => t.id !== 'recus' || donationAvailable || requested === 'recus');
  const tab: Tab = tabs.some((t) => t.id === requested) ? requested! : 'notes';

  function goTo(next: Tab) {
    setParams(next === 'notes' ? {} : { onglet: next });
  }
  function openClaim(id: string) {
    setParams({ note: id });
  }

  return (
    <section className="mp-page mp-mileage">
      <header className="mp-page__header">
        <h1 className="mp-page__title">Mes frais kilométriques</h1>
        <p className="mp-page__subtitle">
          Déclarez les déplacements faits pour le club avec votre véhicule
          personnel, au barème fiscal.
        </p>
      </header>

      <div className="mp-tabs mp-mileage-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`mp-tab${tab === t.id ? ' mp-tab--active' : ''}`}
            onClick={() => goTo(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {vehiclesError ? (
        <p className="mp-error">{errorMessage(vehiclesError)}</p>
      ) : null}

      {tab === 'notes' ? (
        openClaimId ? (
          <MileageClaimEditor
            key={openClaimId}
            claimId={openClaimId}
            donationAvailable={donationAvailable}
            vehicles={vehicles}
            onBack={() => setParams({})}
            onGoToVehicles={() => goTo('vehicules')}
          />
        ) : (
          <MileageClaimsList
            donationAvailable={donationAvailable}
            hasVehicle={hasVehicle}
            onOpen={openClaim}
            onGoToVehicles={() => goTo('vehicules')}
          />
        )
      ) : null}
      {tab === 'vehicules' ? (
        <MileageVehicles vehicles={vehicles} loading={vehiclesLoading} />
      ) : null}
      {tab === 'trajets' ? (
        <MileageRecurring vehicles={vehicles} onGoToVehicles={() => goTo('vehicules')} />
      ) : null}
      {tab === 'recus' ? <MileageReceipts /> : null}
    </section>
  );
}
