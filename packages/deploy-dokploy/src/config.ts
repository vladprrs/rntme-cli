export type DokployTargetConfig = {
  readonly endpoint: string;
  readonly projectId?: string;
  readonly projectName?: string;
  readonly allowCreateProject?: boolean;
  readonly publicBaseUrl: string;
};
