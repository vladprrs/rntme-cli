import { describe, it, expect } from 'vitest';
import { RandomIds, SeededIds } from '../../src/ids.js';

describe('Ids', () => {
  it('RandomIds produces UUIDs', () => {
    const ids = new RandomIds();
    expect(ids.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
  it('SeededIds is deterministic', () => {
    const a = new SeededIds(['u1', 'u2']);
    const b = new SeededIds(['u1', 'u2']);
    expect(a.uuid()).toBe(b.uuid());
    expect(a.uuid()).toBe(b.uuid());
  });
  it('SeededIds produces plaintext API tokens of the expected shape', () => {
    const ids = new SeededIds([], { tokenBody: 'abcdefghijklmnopqrstuv' });
    expect(ids.apiTokenPlaintext()).toBe('rntme_pat_abcdefghijklmnopqrstuv');
  });
});
