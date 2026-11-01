'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';

export interface AgeGroup {
  name: string;
  /** Âge de début, ex. "6". */
  age: string;
  /** Fin de tranche, ex. "−9" ; "+" pour « et plus ». */
  ageRange?: string;
  ageUnit?: string;
}

interface Props {
  groups: AgeGroup[];
  /** `id` de la grille des cartes, pour mettre en avant la bonne carte. */
  gridId: string;
}

const ADULT_AGE = 18;

/** Bornes [min, max] d'une tranche, ou null si elle n'est pas lisible. */
export function ageBounds(g: AgeGroup): [number, number] | null {
  const min = parseInt(g.age, 10);
  if (Number.isNaN(min)) return null;
  const range = g.ageRange ?? '';
  if (range.includes('+')) return [min, Infinity];
  const max = parseInt(range.replace(/\D+/g, ''), 10);
  return [min, Number.isNaN(max) ? min : max];
}

/**
 * « Mon enfant a X ans » : le parent choisit un âge, la carte du bon
 * groupe est mise en avant et les liens horaires/tarifs s'affichent.
 * Sans JS, le sélecteur n'apparaît pas et les cartes restent lisibles.
 */
export function AgeFinder({ groups, gridId }: Props) {
  const selectId = useId();
  const [age, setAge] = useState<number | null>(null);
  const bounds = groups.map(ageBounds);
  const readable = bounds.filter(Boolean) as Array<[number, number]>;
  const matchIndex =
    age === null
      ? -1
      : bounds.findIndex((b) => b !== null && age >= b[0] && age <= b[1]);

  useEffect(() => {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const cards = grid.querySelectorAll<HTMLElement>('.cours-card');
    cards.forEach((card, i) => {
      card.classList.toggle('is-match', i === matchIndex);
      card.classList.toggle('is-dimmed', matchIndex !== -1 && i !== matchIndex);
    });
  }, [gridId, matchIndex]);

  if (readable.length === 0) return null;
  const minAge = Math.min(...readable.map((b) => b[0]));
  const options: number[] = [];
  for (let a = minAge; a <= ADULT_AGE; a++) options.push(a);
  const match = matchIndex >= 0 ? groups[matchIndex] : null;

  return (
    <div className="age-finder reveal d2">
      <label htmlFor={selectId} className="age-finder__label">
        Mon enfant a
      </label>
      <select
        id={selectId}
        className="age-finder__select"
        value={age ?? ''}
        onChange={(e) =>
          setAge(e.target.value === '' ? null : Number(e.target.value))
        }
      >
        <option value="">—</option>
        {options.map((a) => (
          <option key={a} value={a}>
            {a === ADULT_AGE ? `${a} ans et +` : `${a} ans`}
          </option>
        ))}
      </select>
      <p className="age-finder__result" aria-live="polite">
        {age === null ? (
          'Choisissez un âge pour trouver le bon cours.'
        ) : match ? (
          <>
            <span>
              Groupe <strong>{match.name}</strong>
            </span>
            <Link href="/cours">Voir les horaires</Link>
            <Link href="/tarifs">Voir les tarifs</Link>
          </>
        ) : (
          <>
            <span>Pas de groupe pour cet âge pour l’instant.</span>
            <Link href="/contact">Nous contacter</Link>
          </>
        )}
      </p>
    </div>
  );
}
