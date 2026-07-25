import { describe, expect, it } from 'vitest';
import { FREQUENCY_BEARING_TASKS, PROGRESS_HEALTH_VALUES, MAX_SIZE_CM, NOTE_MAX_LEN } from './care-operations-constants.js';

describe('care operations constants', () => {
  it('lists the frequency-bearing tasks, excluding PROGRESS', () => {
    expect(FREQUENCY_BEARING_TASKS).toEqual(['WATER', 'FERTILIZE', 'REPOT', 'ROTATE', 'CLEAN_LEAVES', 'MIST']);
    expect(FREQUENCY_BEARING_TASKS).not.toContain('PROGRESS');
  });
  it('lists the progress health values least→most', () => {
    expect(PROGRESS_HEALTH_VALUES).toEqual(['SICK', 'POOR', 'GOOD', 'EXCELLENT']);
  });
  it('exposes the MariaDB signed-INT ceiling', () => {
    expect(MAX_SIZE_CM).toBe(2_147_483_647);
  });
});

describe('NOTE_MAX_LEN', () => {
  it('is the pinned 2000-character free-text note bound', () => {
    expect(NOTE_MAX_LEN).toBe(2000);
  });
});
