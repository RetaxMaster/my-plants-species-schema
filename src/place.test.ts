import { describe, expect, it } from 'vitest';
import { lightTypeEnum, humidityCharacterEnum } from './place.js';
import { LIGHT_TYPES, HUMIDITY_CHARACTERS } from './place-constants.js';

describe('place zod enums are DERIVED, never re-declared', () => {
  it('mirrors the light-type array exactly', () => {
    expect(lightTypeEnum.options).toEqual([...LIGHT_TYPES]);
  });
  it('mirrors the humidity-character array exactly', () => {
    expect(humidityCharacterEnum.options).toEqual([...HUMIDITY_CHARACTERS]);
  });
});
