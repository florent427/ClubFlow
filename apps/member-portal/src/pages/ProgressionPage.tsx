import { useQuery } from '@apollo/client/react';
import { Navigate } from 'react-router-dom';
import { VIEWER_ME } from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';

export function ProgressionPage() {
  const { data, loading } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });

  const me = data?.viewerMe;

  if (loading) {
    return (
      <div className="mp-page">
        <h1 className="mp-page-title">Ma progression</h1>
        <p className="mp-hint">Chargement…</p>
      </div>
    );
  }
  if (me?.hideMemberModules === true) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mp-page">
      <h1 className="mp-page-title">Ma progression</h1>
      <p className="mp-lead">
        Parcours et objectifs par grade seront enrichis dans une prochaine
        version.
      </p>

      <div className="mp-timeline">
        <div className="mp-timeline-item mp-timeline-item-active">
          <div className="mp-timeline-dot" />
          <div>
            <h2 className="mp-timeline-title">
              {me?.gradeLevelLabel ?? 'Niveau à confirmer'}
            </h2>
            <p className="mp-hint">
              Votre grade actuel tel que renseigné par le club. Les jalons
              et ressources pédagogiques arrivent ensuite.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
