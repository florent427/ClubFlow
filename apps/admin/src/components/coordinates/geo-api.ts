/**
 * Référentiels publics interrogés depuis le navigateur pour l'autocomplétion.
 *  - Adresses : IGN Géoplateforme (successeur de api-adresse.data.gouv.fr).
 *  - Communes : geo.api.gouv.fr (code INSEE, DOM inclus).
 */

export type AddressSuggestion = {
  id: string;
  label: string;
  name: string;
  postcode: string;
  city: string;
};

export type CommuneSuggestion = {
  nom: string;
  code: string;
  codeDepartement: string;
  codesPostaux: string[];
};

type GeoplateformeFeature = {
  properties?: {
    id?: string;
    label?: string;
    name?: string;
    postcode?: string;
    city?: string;
  };
};

export async function searchAddresses(
  q: string,
  signal: AbortSignal,
): Promise<AddressSuggestion[]> {
  const url = `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&autocomplete=1&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as { features?: GeoplateformeFeature[] };
  return (json.features ?? [])
    .map((f, i) => {
      const p = f.properties ?? {};
      return {
        id: p.id ?? `${p.label ?? ''}-${i}`,
        label: p.label ?? [p.name, p.postcode, p.city].filter(Boolean).join(' '),
        name: p.name ?? '',
        postcode: p.postcode ?? '',
        city: p.city ?? '',
      };
    })
    .filter((s) => s.name);
}

export async function searchCommunes(
  q: string,
  signal: AbortSignal,
): Promise<CommuneSuggestion[]> {
  const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,code,codesPostaux,codeDepartement&boost=population&limit=8`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as CommuneSuggestion[];
  return Array.isArray(json) ? json : [];
}
