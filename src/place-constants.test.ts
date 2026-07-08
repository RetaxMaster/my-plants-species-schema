import { describe, expect, it } from 'vitest';
import { AIRFLOW } from './place-constants.js';
import { airflowEnum } from './place.js';

describe('place vocabularies', () => {
  it('orders airflow least → most air movement', () => {
    expect(AIRFLOW).toEqual(['still', 'some', 'breezy']);
  });

  it('exposes the array as readonly string-literal tuple values', () => {
    // Every slug is lowercase kebab and unique (single source of truth).
    expect(new Set(AIRFLOW).size).toBe(AIRFLOW.length);
    for (const v of AIRFLOW) expect(v).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe('airflowEnum (Zod layer)', () => {
  it('derives its options from the AIRFLOW array (no fork)', () => {
    expect(airflowEnum.options).toEqual([...AIRFLOW]);
  });

  it('accepts a valid slug and rejects an unknown one', () => {
    expect(airflowEnum.parse('breezy')).toBe('breezy');
    expect(airflowEnum.safeParse('gale').success).toBe(false);
  });
});
