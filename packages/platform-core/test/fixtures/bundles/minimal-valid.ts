import type { ResolvedSource } from '@rntme/ui';
import type { BundleInput } from '../../../src/schemas/requests.js';
import manifest from './data/manifest.json';
import pdm from './data/pdm.json';
import qsm from './data/qsm.json';
import graphIr from './data/graph.json';
import bindings from './data/bindings.json';
import seed from './data/seed.json';

/** Inlined UI authoring tree (same shape as `resolve()` on `@rntme/ui` test fixture `minimal-app`). */
const uiResolved: ResolvedSource = {
  manifest: {
    version: '2.0',
    pdmRef: 'commerce.domain.v1',
    qsmRef: 'commerce.read.v1',
    graphSpecRef: 'commerce.graphs.v1',
    bindingsRef: 'commerce.bindings.v1',
    metadata: { title: 'Commerce' },
    layouts: { main: 'layouts/main' },
    routes: { '/': { layout: 'main', screen: 'screens/home' } },
  },
  baseDir: 'inline',
  layouts: {
    main: {
      spec: {
        root: 'shell',
        elements: {
          shell: {
            type: 'Stack',
            props: { direction: 'vertical' },
            children: ['header'],
          },
          header: { type: 'Heading', props: { level: 1, text: 'Commerce' } },
        },
      },
      screen: {},
    },
  },
  screens: {
    home: {
      spec: {
        root: 'page',
        elements: {
          page: { type: 'Heading', props: { level: 1, text: 'Home' }, children: [] },
        },
      },
      screen: {},
    },
  },
  fragments: new Map(),
};

export const minimalValidBundle: BundleInput = {
  manifest: manifest as Record<string, unknown>,
  pdm: pdm as Record<string, unknown>,
  qsm: qsm as Record<string, unknown>,
  graphIr: graphIr as Record<string, unknown>,
  bindings: bindings as Record<string, unknown>,
  ui: uiResolved as unknown as Record<string, unknown>,
  seed: seed as Record<string, unknown>,
};
