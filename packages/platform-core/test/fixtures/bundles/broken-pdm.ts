import { minimalValidBundle } from './minimal-valid.js';

export const brokenPdmBundle = {
  ...minimalValidBundle,
  pdm: { ...minimalValidBundle.pdm, entities: [{ name: '!!invalid-name!!', fields: [] }] },
};
