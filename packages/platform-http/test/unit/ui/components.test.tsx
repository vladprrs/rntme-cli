import { describe, it, expect } from 'vitest';
import { DataTable } from '../../../src/ui/components/table.js';
import { EmptyState } from '../../../src/ui/components/empty-state.js';
import { RelativeTime } from '../../../src/ui/components/relative-time.js';

describe('DataTable', () => {
  it('renders a header row and body rows', () => {
    const html = String(
      <DataTable
        headers={['Slug', 'Name']}
        rows={[
          { key: 'a', cells: ['acme', 'Acme'] },
          { key: 'b', cells: ['beta', 'Beta'] },
        ]}
      />,
    );
    expect(html).toContain('<table');
    expect(html).toContain('Slug');
    expect(html).toContain('Name');
    expect(html).toContain('acme');
    expect(html).toContain('Beta');
  });
});

describe('EmptyState', () => {
  it('renders title and hint', () => {
    const html = String(<EmptyState title="No projects yet" hint="Run rntme project create." />);
    expect(html).toContain('No projects yet');
    expect(html).toContain('rntme project create');
  });
});

describe('RelativeTime', () => {
  it('renders ISO datetime attribute and relative text', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    const html = String(<RelativeTime value={past} />);
    expect(html).toContain(`datetime="${past.toISOString()}"`);
    expect(html).toMatch(/ago|hour/i);
  });

  it('handles null', () => {
    const html = String(<RelativeTime value={null} />);
    expect(html).toContain('—');
  });
});
