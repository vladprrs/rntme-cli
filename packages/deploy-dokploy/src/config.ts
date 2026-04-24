export type DokployTargetConfig = {
  readonly endpoint: string;
  readonly projectId?: string;
  readonly projectName?: string;
  readonly allowCreateProject?: boolean;
  readonly publicBaseUrl: string;
};

export type DokploySecretInput = {
  readonly apiToken: string;
  readonly secrets?: Readonly<Record<string, string>>;
};
