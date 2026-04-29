export type DeploymentMode = 'preview' | 'production';

export type DeploymentEnvironment = 'default';

export type ExternalEventBusSecurity =
  | { readonly protocol: 'plaintext' }
  | {
      readonly protocol: 'sasl_ssl';
      readonly mechanism: 'scram-sha-256' | 'scram-sha-512';
      readonly secretRefs: {
        readonly username: string;
        readonly password: string;
      };
    };

export type ExternalEventBusConfig = {
  readonly kind: 'kafka';
  readonly mode: 'external';
  readonly brokers: readonly string[];
  readonly topicPrefix?: string;
  readonly security?: ExternalEventBusSecurity;
};

export type IntegrationModuleDeploymentConfig = {
  readonly image: string;
  readonly expose?: boolean;
  readonly env?: Readonly<Record<string, string>>;
  readonly secretRefs?: Readonly<Record<string, string>>;
};

export type RateLimitPolicyConfig = {
  readonly requestsPerMinute: number;
  readonly burst: number;
};

export type BodyLimitPolicyConfig = {
  readonly maxBodySize: string;
};

export type TimeoutPolicyConfig = {
  readonly upstreamTimeoutMs: number;
};

export type RequestContextPolicyConfig = {
  readonly requestIdHeader?: string;
  readonly correlationIdHeader?: string;
};

export type DeploymentPolicyConfig = {
  readonly rateLimit?: Readonly<Record<string, RateLimitPolicyConfig>>;
  readonly bodyLimit?: Readonly<Record<string, BodyLimitPolicyConfig>>;
  readonly timeout?: Readonly<Record<string, TimeoutPolicyConfig>>;
  readonly requestContext?: Readonly<Record<string, RequestContextPolicyConfig>>;
};

export type ProjectAuthConfig = {
  readonly auth0?: {
    readonly clientId: string;
  };
};

export type ProjectDeploymentConfig = {
  readonly orgSlug: string;
  readonly environment: DeploymentEnvironment;
  readonly mode: DeploymentMode;
  readonly eventBus?: ExternalEventBusConfig;
  readonly modules?: Readonly<Record<string, IntegrationModuleDeploymentConfig>>;
  readonly policies?: DeploymentPolicyConfig;
  readonly auth?: ProjectAuthConfig;
  readonly runtimeImage?: string;
};
