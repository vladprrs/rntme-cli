import type {
  RenderedDokployProject,
  RenderedDokployResource,
  RenderedEnvVar,
} from './render.js';

export type DokployProjectRef = RenderedDokployProject;

export type DokployApplication = {
  readonly id: string;
  readonly name: string;
  readonly image?: string;
  readonly build?: RenderedDokployResource['build'];
  readonly ports?: RenderedDokployResource['ports'];
  readonly ingress?: RenderedDokployResource['ingress'];
  readonly env?: readonly RenderedEnvVar[];
  readonly labels?: Readonly<Record<string, string>>;
  readonly files?: Readonly<Record<string, string>>;
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
