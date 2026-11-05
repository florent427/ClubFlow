// Budget validated with Florent on 2026-11-05: meals halved, vehicle costs
// shared 4/6, 10 % margin on estimated lines only (fixed envelopes excluded).
import { VEHICLE_SHARE } from '../public/model.js';

// Minivan: 8.5 l/100 km, diesel at 2.50 €/l → cents per km.
const FUEL_CENTS_PER_KM = 8.5 / 100 * 2.5 * 100;

export const SEED_MARGIN = 0.1;

export const DAYS = [
  ['2027-01-06', 'La Réunion', 'Vol de nuit vers Orly'],
  ['2027-01-07', 'Paris', 'Arrivée à Orly, voiture, ibis Créteil'],
  ['2027-01-08', 'Paris', 'Sommet de la tour Eiffel, visites gratuites'],
  ['2027-01-09', 'Paris', 'Quartier libre, shopping'],
  ['2027-01-10', 'Paris', 'Disneyland Paris'],
  ['2027-01-11', 'Brizon', 'Orly, TGV Paris → Lyon, route vers Brizon'],
  ['2027-01-12', 'Brizon', 'Ski'],
  ['2027-01-13', 'Brizon', 'Ski'],
  ['2027-01-14', 'Brizon', 'Ski'],
  ['2027-01-15', 'Brizon', 'Ski'],
  ['2027-01-16', 'Marseille', 'Route vers Lyon, TGV → Marseille'],
  ['2027-01-17', 'Narbonne', 'Minivan à Saint-Charles, route vers Narbonne'],
  ['2027-01-18', 'Andorre', 'Route vers Escaldes-Engordany'],
  ['2027-01-19', 'Andorre', 'Caldea, Naturlandia, luge'],
  ['2027-01-20', 'Barcelone', 'Route vers Barcelone'],
  ['2027-01-21', 'Barcelone', 'Zoo'],
  ['2027-01-22', 'Barcelone', 'Aquarium'],
  ['2027-01-23', 'Barcelone', 'Visites gratuites'],
  ['2027-01-24', 'Barcelone', 'Visites gratuites'],
  ['2027-01-25', 'Montpellier', 'Route vers Montpellier (Miranove)'],
  ['2027-01-26', 'Marseille', 'Route vers Marseille, vol retour le soir'],
].map(([date, place, title]) => ({ date, place, title }));

const euros = (value) => Math.round(value * 100);

const meal = (label, value) => ({ category: 'repas', label, amount: euros(value) });
const fullDayMeals = () => [
  meal('Petit-déjeuner', 30),
  meal('Déjeuner', 50),
  meal('Goûter', 20),
  meal('Dîner', 50),
];
const fuel = (label, km) => ({
  category: 'carburant',
  label: `${label} (${km} km)`,
  amount: Math.round(km * FUEL_CENTS_PER_KM),
  share: VEHICLE_SHARE,
});
const vehicle = (category, label, value) => ({
  category,
  label,
  amount: euros(value),
  share: VEHICLE_SHARE,
});
const item = (category, label, value, extra = {}) => ({
  category,
  label,
  amount: euros(value),
  ...extra,
});
const envelope = (category, label, value) => item(category, label, value, { estimated: false });

const skiDay = () => [
  meal('Courses chalet (petit-déj + dîner)', 50),
  meal('Déjeuner restaurant', 50),
  meal('Goûter', 20),
  envelope('activites', 'Ski : forfaits, matériel, activités', 250),
  fuel('Trajets station', 25),
];

const barcelonaDay = (...extra) => [
  ...fullDayMeals(),
  ...extra,
  item('transports', 'Métro Barcelone', 12.5),
  vehicle('parking', 'Parking Catalonia La Maquinista', 20),
];

const PLAN = {
  '2027-01-07': [
    ...fullDayMeals(),
    fuel('Orly → Créteil', 15),
    vehicle('parking', 'Parking ibis', 10),
  ],
  '2027-01-08': [
    ...fullDayMeals(),
    item('activites', 'Sommet tour Eiffel (2 adultes + 2 jeunes 12-24 ans)', 115),
    item('transports', 'Métro Créteil ↔ Paris', 20),
    vehicle('parking', 'Parking ibis', 10),
  ],
  '2027-01-09': [
    ...fullDayMeals(),
    envelope('shopping', 'Budget shopping', 1000),
    item('transports', 'Métro Créteil ↔ Paris', 20),
    vehicle('parking', 'Parking ibis', 10),
  ],
  '2027-01-10': [
    meal('Petit-déjeuner', 30),
    envelope('activites', 'Disneyland Paris (entrées + repas)', 600),
    fuel('Créteil ↔ Disney', 60),
    vehicle('parking', 'Parking Disney', 35),
    vehicle('parking', 'Parking ibis', 10),
  ],
  '2027-01-11': [
    meal('Petit-déjeuner', 30),
    meal('Déjeuner', 50),
    meal('Goûter', 20),
    meal('Dîner chalet', 25),
    item('transports', 'M14 Orly → Gare de Lyon (4 billets)', 52),
    fuel('Créteil → Orly', 15),
    fuel('Part-Dieu → Brizon', 175),
    vehicle('peages', 'Lyon → Bonneville', 22),
  ],
  '2027-01-12': skiDay(),
  '2027-01-13': skiDay(),
  '2027-01-14': skiDay(),
  '2027-01-15': skiDay(),
  '2027-01-16': [
    meal('Petit-déjeuner chalet', 25),
    meal('Déjeuner pendant le trajet', 50),
    meal('Goûter', 20),
    meal('Dîner restaurant Marseille', 50),
    fuel('Brizon → Part-Dieu', 175),
    vehicle('peages', 'Bonneville → Lyon', 22),
    item('transports', 'Métro Saint-Charles → Vieux-Port', 8.4),
  ],
  '2027-01-17': [
    meal('Petit-déjeuner Mercure', 30),
    meal('Déjeuner', 50),
    meal('Goûter', 20),
    meal('Dîner', 50),
    item('transports', 'Métro Vieux-Port → Saint-Charles', 8.4),
    fuel('Marseille → Narbonne', 260),
    vehicle('peages', 'Marseille → Narbonne', 28),
    vehicle('parking', 'Parking Narbonne', 10),
  ],
  '2027-01-18': [
    ...fullDayMeals(),
    fuel('Narbonne → Escaldes-Engordany', 230),
    vehicle('peages', 'Narbonne → Perpignan', 8),
    vehicle('parking', 'Parking Andorre', 15),
  ],
  '2027-01-19': [
    ...fullDayMeals(),
    item('activites', 'Caldea + Naturlandia + luge', 330),
    fuel('Escaldes ↔ Naturlandia', 50),
    vehicle('parking', 'Parking Andorre', 15),
  ],
  '2027-01-20': [
    ...fullDayMeals(),
    fuel('Escaldes → Barcelone', 200),
    vehicle('peages', 'Tunnel du Cadí + C-16', 20),
    vehicle('parking', 'Parking Catalonia La Maquinista', 20),
  ],
  '2027-01-21': barcelonaDay(item('activites', 'Zoo de Barcelone (4 entrées)', 92)),
  '2027-01-22': barcelonaDay(item('activites', 'Aquarium de Barcelone (4 entrées)', 120)),
  '2027-01-23': barcelonaDay(),
  '2027-01-24': barcelonaDay(fuel('Trajets en ville', 20)),
  '2027-01-25': [
    ...fullDayMeals(),
    fuel('Barcelone → Montpellier', 340),
    vehicle('peages', 'Le Boulou → Montpellier', 20),
    vehicle('parking', 'Parking Miranove', 12),
  ],
  '2027-01-26': [
    meal('Petit-déjeuner', 30),
    meal('Déjeuner', 50),
    meal('Goûter', 20),
    meal('Dîner avant le vol', 50),
    fuel('Montpellier → Marseille', 170),
    vehicle('peages', 'Montpellier → Marseille', 15),
    item('transports', 'Navette Saint-Charles → aéroport (4 billets)', 44),
  ],
};

export function seedPlans() {
  return Object.entries(PLAN).flatMap(([date, lines]) =>
    lines.map((line, index) => ({
      id: `seed-${date}-${index}`,
      date,
      share: 1,
      estimated: true,
      ...line,
    })),
  );
}
