import { describe, expect, it } from 'vitest';
import { dokployLabels, dokployResourceName } from '../../src/names.js';

describe('Dokploy names', () => {
  it('uses rntme org/project/workload names', () => {
    expect(dokployResourceName('acme', 'commerce', 'catalog')).toBe(
      'rntme-acme-commerce-catalog',
    );
  });

  it('normalizes invalid characters and adds labels', () => {
    expect(dokployResourceName('Acme Org', 'Commerce_App', 'Catalog API')).toBe(
      'rntme-acme-org-commerce-app-catalog-api',
    );
    expect(dokployLabels('acme', 'commerce', 'default', 'catalog')).toEqual({
      'rntme.org': 'acme',
      'rntme.project': 'commerce',
      'rntme.environment': 'default',
      'rntme.workload': 'catalog',
      'rntme.managed-by': 'rntme-deploy-dokploy',
    });
  });
});
