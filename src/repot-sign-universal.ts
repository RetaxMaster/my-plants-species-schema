import { REPOT_SIGN_ID_SEPARATOR, UNIVERSAL_SIGN_NAMESPACE } from './repot-sign-constants.js';
import type { RepotSignRow } from './repot-sign.js';

/**
 * The app-seeded UNIVERSAL sign rows: pot physics, true of every potted plant, so a species that has never
 * been re-cured still gets a usable questionnaire (docs/care-engine.md §7.19, limitation REP-L5 — adding one IS
 * a code change, deliberately: the set is small and stable).
 *
 * This is the SINGLE definition. The API migration seeds exactly these rows and a test pins the DDL seed
 * against this array; the KE writer rejects a species row that merely restates one of them (the double-count
 * trap — a duplicate row would be counted twice in `score`).
 *
 * The evidence classes below are the two canonical worked examples of docs/care-engine.md §7.19 plus a
 * deliberately sparing `definitive`.
 */
export const UNIVERSAL_REPOT_SIGNS: readonly RepotSignRow[] = [
  {
    id: 'universal--water-runs-through',
    speciesSlug: null,
    labelEn: 'Water runs straight through, and the soil is dry 2.5 cm down two days later',
    labelEs: 'El agua se escurre de inmediato y a los dos días la tierra está seca a 2.5 cm',
    helpEn:
      'Water as you normally would. If it drains out almost at once, and two days later your finger finds dry substrate a knuckle deep, there is more root than soil in the pot.',
    helpEs:
      'Riega como siempre. Si el agua sale casi de inmediato y dos días después tu dedo encuentra sustrato seco a un nudillo de profundidad, hay más raíz que tierra en la maceta.',
    evidence: 'strong',
    active: true,
    sortOrder: 10,
  },
  {
    id: 'universal--several-roots-at-drainage-holes',
    speciesSlug: null,
    labelEn: 'Several roots are coming out of the drainage holes at once',
    labelEs: 'Varias raíces salen a la vez por los agujeros de drenaje',
    helpEn: 'Count them. Several at once is different from one — see the next item.',
    helpEs: 'Cuéntalas. Varias a la vez es distinto de una sola — mira el siguiente punto.',
    evidence: 'strong',
    active: true,
    sortOrder: 20,
  },
  {
    id: 'universal--single-root-at-drainage-hole',
    speciesSlug: null,
    labelEn: 'A single root is peeking out of a drainage hole',
    labelEs: 'Una sola raíz asoma por un agujero de drenaje',
    helpEn:
      'One exploratory root is NOT evidence of a full root ball: roots find that hole because it is where the air and moisture gradient is, so an explorer shows up long before the pot is full.',
    helpEs:
      'Una raíz exploradora NO es prueba de un cepellón lleno: las raíces encuentran ese agujero porque ahí está el gradiente de aire y humedad, así que aparece mucho antes de que la maceta se llene.',
    evidence: 'suggestive',
    active: true,
    sortOrder: 30,
  },
  {
    id: 'universal--roots-circling-the-surface',
    speciesSlug: null,
    labelEn: 'Roots are circling on the surface or lifting the plant out of the pot',
    labelEs: 'Las raíces dan vueltas en la superficie o levantan la planta de la maceta',
    helpEn: 'Look at the top of the substrate, and check whether the plant sits higher than it used to.',
    helpEs: 'Mira la superficie del sustrato y fíjate si la planta está más alta que antes.',
    evidence: 'strong',
    active: true,
    sortOrder: 40,
  },
  {
    id: 'universal--pot-split-or-deformed',
    speciesSlug: null,
    labelEn: 'The pot is cracked, split, or visibly deformed by the roots',
    labelEs: 'La maceta está agrietada, partida o visiblemente deformada por las raíces',
    helpEn:
      'A rigid pot broken open by roots has no other plausible explanation. On a flexible pot, look for permanent bulging.',
    helpEs:
      'Una maceta rígida rota por las raíces no tiene otra explicación posible. En una maceta flexible, busca abultamientos permanentes.',
    evidence: 'definitive',
    active: true,
    sortOrder: 50,
  },
  {
    id: 'universal--dries-out-much-faster',
    speciesSlug: null,
    labelEn: 'It needs watering far more often than it used to',
    labelEs: 'Necesita riego mucho más seguido que antes',
    helpEn: 'Compare with a few months ago. Season and a move can explain this too, which is why it counts for less on its own.',
    helpEs: 'Compáralo con hace unos meses. La temporada o un cambio de lugar también lo explican, por eso solo cuenta poco.',
    evidence: 'ambiguous',
    active: true,
    sortOrder: 60,
  },
  {
    id: 'universal--growth-has-stalled',
    speciesSlug: null,
    labelEn: 'Growth has clearly slowed or stopped during the growing season',
    labelEs: 'El crecimiento se frenó o se detuvo claramente en temporada de crecimiento',
    helpEn: 'A real repot sign that also has three other common causes: light, nutrition, and season.',
    helpEs: 'Es una señal real de trasplante que también tiene otras tres causas comunes: luz, nutrición y temporada.',
    evidence: 'ambiguous',
    active: true,
    sortOrder: 70,
  },
];

/** The semantic halves, for the KE writer's duplicate-universal-sign rejection. */
export const UNIVERSAL_REPOT_SIGN_SEMANTIC_SLUGS: readonly string[] = UNIVERSAL_REPOT_SIGNS.map((row) =>
  row.id.slice(`${UNIVERSAL_SIGN_NAMESPACE}${REPOT_SIGN_ID_SEPARATOR}`.length),
);
