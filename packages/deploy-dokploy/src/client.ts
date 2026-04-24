import type { RenderedDokployProject, RenderedDokployResource } from './render.js';

export type DokployProjectRef = RenderedDokployProject;

export type DokployApplication = {
  readonly id: string;
  readonly name: string;
};

export type DokployClient = {
  ensureProject(ref: DokployProjectRef): Promise<{ projectId: string }>;
  findApplicationByName(projectId: string, name: string): Promise<DokployApplication | null>;
  createApplication(
    projectId: string,
    resource: RenderedDokployResource,
  ): Promise<DokployApplication>;
  updateApplication(
    applicationId: string,
    resource: RenderedDokployResource,
  ): Promise<DokployApplication>;
};
