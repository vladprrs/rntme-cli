#!/usr/bin/env node
/* eslint-env node */
const { cpSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const sources = join(root, 'src', 'skills', 'sources');
const starters = join(root, 'src', 'skills', 'starters');
const outSources = join(root, 'dist', 'skills', 'sources');
const outStarters = join(root, 'dist', 'skills', 'starters');

if (existsSync(sources)) {
  cpSync(sources, outSources, { recursive: true });
  console.log(`copied ${sources} → ${outSources}`);
}
if (existsSync(starters)) {
  cpSync(starters, outStarters, { recursive: true });
  console.log(`copied ${starters} → ${outStarters}`);
}
