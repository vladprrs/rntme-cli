import { describe, it, expect } from 'vitest';
import { renderTable } from '../../../src/output/tables.js';

describe('renderTable', () => {
  it('renders a simple table', () => {
    const out = renderTable(
      ['SLUG', 'LATEST'],
      [['api', '42'], ['worker', '17']],
    );
    expect(out.split('\n')).toHaveLength(3);
    expect(out).toContain('SLUG');
    expect(out).toContain('42');
  });

  it('truncates long cells with ellipsis', () => {
    const out = renderTable(['X'], [['abcdefghij']], { maxWidths: [2] });
    expect(out).toContain('a…');
  });

  it('handles zero rows', () => {
    const out = renderTable(['X'], []);
    expect(out).toContain('X');
  });
});
