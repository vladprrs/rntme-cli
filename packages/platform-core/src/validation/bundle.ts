import { ok, err, isOk, type Result, type PlatformError } from '../types/result.js';
import type { ValidatedPublishBundle } from '../types/brands.js';
import type { BundleInput } from '../schemas/requests.js';

import { parsePdm, validatePdm, createPdmResolver, deriveEventTypes, type ValidatedPdm } from '@rntme/pdm';
import { parseQsm, validateQsm } from '@rntme/qsm';
import { parseBindingArtifact, validateBindings, type BindingResolvers, type GraphSignature, type ResolvedShape, type ScalarPrimitive } from '@rntme/bindings';
import { parseSeed, validateSeed } from '@rntme/seed';
import { expand, validate as validateUi } from '@rntme/ui';
import type { ResolvedSource } from '@rntme/ui';
import {
  parseAuthoringSpec,
  validateStructural as validateGraphStructural,
  validateSemantic as validateGraphSemantic,
  normalize,
  isOk as isOkGir,
  type GraphIrError,
} from '@rntme/graph-ir-compiler';

type GraphJson = {
  id: string;
  signature: {
    inputs: Record<string, { type: string; mode: GraphSignature['inputs'][string]['mode']; default?: unknown }>;
    output: { type: string; from: string };
  };
  nodes: unknown[];
};

function parseInputType(raw: string): GraphSignature['inputs'][string]['type'] {
  if (
    raw === 'integer' ||
    raw === 'decimal' ||
    raw === 'string' ||
    raw === 'boolean' ||
    raw === 'date' ||
    raw === 'datetime'
  ) {
    return { kind: 'scalar', primitive: raw };
  }
  throw new Error(`unsupported input type: "${raw}"`);
}

function parseOutputType(raw: string): GraphSignature['output']['type'] {
  const m = /^(rowset|row)<([A-Za-z_][A-Za-z0-9_]*)>$/.exec(raw);
  if (!m) throw new Error(`unsupported output type: "${raw}"`);
  return { kind: m[1] as 'rowset' | 'row', shape: m[2] as string };
}

function toGraphSignature(g: GraphJson): GraphSignature {
  const inputs: GraphSignature['inputs'] = {};
  for (const [name, decl] of Object.entries(g.signature.inputs)) {
    const base = { type: parseInputType(decl.type), mode: decl.mode };
    inputs[name] = decl.default !== undefined ? { ...base, default: decl.default } : base;
  }
  const hasEmit =
    Array.isArray(g.nodes) &&
    g.nodes.some(
      (n) => typeof n === 'object' && n !== null && (n as { type?: string }).type === 'emit',
    );
  return {
    id: g.id,
    ...(hasEmit ? { role: 'command' as const } : {}),
    inputs,
    output: { type: parseOutputType(g.signature.output.type), from: g.signature.output.from },
  };
}

function createBindingResolvers(
  graphs: Record<string, GraphJson>,
  shapes: Record<string, { fields: Record<string, { type: string; nullable: boolean }> }>,
  validatedPdm: ValidatedPdm,
): BindingResolvers {
  const pdmResolver = createPdmResolver(validatedPdm);
  return {
    resolveGraphSignature: (id) => {
      const g = graphs[id];
      return g !== undefined ? toGraphSignature(g) : null;
    },
    resolveShape: (name) => {
      const custom = shapes[name];
      if (custom !== undefined) {
        const fields: ResolvedShape['fields'] = {};
        for (const [fn, f] of Object.entries(custom.fields)) {
          fields[fn] = {
            type: { kind: 'scalar', primitive: f.type as ScalarPrimitive },
            nullable: f.nullable,
          };
        }
        return { name, origin: 'custom', fields };
      }
      const e = pdmResolver.resolveEntity(name);
      if (e === null || e === undefined) return null;
      const fields: ResolvedShape['fields'] = {};
      for (const f of e.fields) {
        fields[f.name] = {
          type: { kind: 'scalar', primitive: f.type as ScalarPrimitive },
          nullable: f.nullable,
        };
      }
      return { name, origin: 'pdm', fields };
    },
  };
}

function bubble(
  pkg: string,
  stage: 'parse' | 'structural' | 'references' | 'consistency' | 'semantic',
  errors: readonly { code?: string; message: string; path?: string }[],
): PlatformError {
  return {
    code: 'PLATFORM_VALIDATION_BUNDLE_FAILED',
    stage: 'validation',
    pkg,
    message: errors[0]?.message ?? `${pkg} ${stage} failed`,
    cause: { stage, errors },
  };
}

function bubbleGraphIr(errors: readonly GraphIrError[]): PlatformError {
  return {
    code: 'PLATFORM_VALIDATION_BUNDLE_FAILED',
    stage: 'validation',
    pkg: 'graph-ir',
    message: errors[0]?.message ?? 'graph-ir validation failed',
    cause: { stage: 'structural', errors },
  };
}

export async function validateBundle(input: BundleInput): Promise<Result<ValidatedPublishBundle, PlatformError>> {
  const pdmParsed = parsePdm(input.pdm);
  if (!isOk(pdmParsed)) return err([bubble('pdm', 'parse', pdmParsed.errors)]);
  const pdmValidated = validatePdm(pdmParsed.value);
  if (!isOk(pdmValidated)) return err([bubble('pdm', 'structural', pdmValidated.errors)]);

  const qsmParsed = parseQsm(input.qsm);
  if (!isOk(qsmParsed)) return err([bubble('qsm', 'parse', qsmParsed.errors)]);
  const qsmValidated = validateQsm(qsmParsed.value, createPdmResolver(pdmValidated.value));
  if (!isOk(qsmValidated)) return err([bubble('qsm', 'structural', qsmValidated.errors)]);

  const graphParsed = parseAuthoringSpec(input.graphIr);
  if (!isOkGir(graphParsed)) return err([bubbleGraphIr(graphParsed.errors)]);
  const graphStruct = validateGraphStructural(graphParsed.value, pdmValidated.value, qsmValidated.value);
  if (!isOkGir(graphStruct)) return err([bubbleGraphIr(graphStruct.errors)]);

  const normalized = normalize(graphStruct.value);
  for (const graph of Object.values(normalized.graphs)) {
    const graphSemantic = validateGraphSemantic(
      graph,
      pdmValidated.value,
      qsmValidated.value,
      graphStruct.value.shapes,
    );
    if (!isOkGir(graphSemantic)) return err([bubbleGraphIr(graphSemantic.errors)]);
  }

  const graphs = graphStruct.value.graphs as Record<string, GraphJson>;
  const shapes = graphStruct.value.shapes as Record<string, { fields: Record<string, { type: string; nullable: boolean }> }>;
  const bindingResolvers = createBindingResolvers(graphs, shapes, pdmValidated.value);

  const bindingsParsed = parseBindingArtifact(input.bindings);
  if (!isOk(bindingsParsed)) return err([bubble('bindings', 'parse', bindingsParsed.errors)]);
  const bindingsValidated = validateBindings(bindingsParsed.value, bindingResolvers);
  if (!isOk(bindingsValidated)) return err([bubble('bindings', 'consistency', bindingsValidated.errors)]);

  const uiResolved = input.ui as unknown as ResolvedSource;
  const uiExpanded = expand(uiResolved);
  if (!isOk(uiExpanded)) return err([bubble('ui', 'references', uiExpanded.errors)]);
  const uiValidated = validateUi(uiExpanded.value, {
    resolveBinding: (id) => bindingsValidated.value.resolved[id] ?? undefined,
    resolveComponent: () => ({ childrenModel: 'list' as const }),
    resolveRoute: () => true,
  });
  if (!isOk(uiValidated)) return err([bubble('ui', 'consistency', uiValidated.errors)]);

  const seedParsed = parseSeed(input.seed);
  if (!isOk(seedParsed)) return err([bubble('seed', 'parse', seedParsed.errors)]);

  const manifestSvc =
    typeof input.manifest === 'object' && input.manifest !== null && 'service' in input.manifest
      ? (input.manifest as { service?: { name?: string } }).service?.name
      : undefined;
  const serviceName = manifestSvc ?? 'service';

  const seedValidated = validateSeed(seedParsed.value, {
    pdm: createPdmResolver(pdmValidated.value),
    events: deriveEventTypes(pdmValidated.value),
    serviceName,
  });
  if (!isOk(seedValidated)) return err([bubble('seed', 'structural', seedValidated.errors)]);

  return ok(input as unknown as ValidatedPublishBundle);
}
