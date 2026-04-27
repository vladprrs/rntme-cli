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
  ensureEnvironment(ref: DokployProjectRef, environmentName: string): Promise<{ environmentId: string }>;
  findApplicationByName(environmentId: string, name: string): Promise<DokployApplication | null>;
  createApplication(
    environmentId: string,
    resource: RenderedDokployResource,
  ): Promise<DokployApplication>;
  updateApplication(
    applicationId: string,
    resource: RenderedDokployResource,
  ): Promise<DokployApplication>;
  deployApplication(
    applicationId: string,
    resource: RenderedDokployResource,
  ): Promise<void>;
};
