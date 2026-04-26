import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadComposedBlueprint, type ComposedBlueprint } from '@rntme/blueprint';
import {
  err,
  ok,
  type CanonicalBundle,
  type PlatformError,
  type ProjectVersionSummary,
  type Result,
} from '@rntme-cli/platform-core';

export type MaterializeResult = {
  readonly composed: ComposedBlueprint;
  readonly summary: ProjectVersionSummary;
  readonly tmpDir: string;
};

export async function materializeAndCompose(
  bundle: CanonicalBundle,
): Promise<Result<MaterializeResult, PlatformError>> {
  const dir = await mkdtemp(join(tmpdir(), 'rntme-bundle-'));
  try {
    for (const [relPath, value] of Object.entries(bundle.files)) {
      const abs = join(dir, relPath);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, JSON.stringify(value));
    }

    const composed = loadComposedBlueprint(dir);
    if (!composed.ok) {
      return err([
        {
          code: 'PROJECT_VERSION_BLUEPRINT_INVALID',
          message: composed.errors.map((e) => `${e.code}: ${e.message}`).join('; '),
          stage: 'validation',
        },
      ]);
    }

    const project = composed.value.project;
    const summary: ProjectVersionSummary = {
      projectName: project.name,
      services: [...project.services],
      routes: {
        ui: { ...(project.routes?.ui ?? {}) },
        http: { ...(project.routes?.http ?? {}) },
      },
      middleware: { ...(project.middleware ?? {}) },
      mounts: [...(project.mounts ?? [])],
    };

    return ok({ composed: composed.value, summary, tmpDir: dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
