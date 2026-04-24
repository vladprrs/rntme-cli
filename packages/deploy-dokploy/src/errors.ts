export const DEPLOY_DOKPLOY_ERROR_CODES = {
  DEPLOY_RENDER_DOKPLOY_MISSING_PROJECT: 'DEPLOY_RENDER_DOKPLOY_MISSING_PROJECT',
  DEPLOY_RENDER_DOKPLOY_SECRET_LEAK: 'DEPLOY_RENDER_DOKPLOY_SECRET_LEAK',
  DEPLOY_APPLY_DOKPLOY_API_ERROR: 'DEPLOY_APPLY_DOKPLOY_API_ERROR',
  DEPLOY_APPLY_DOKPLOY_PARTIAL_FAILURE: 'DEPLOY_APPLY_DOKPLOY_PARTIAL_FAILURE',
  DEPLOY_RENDER_DOKPLOY_INVALID_NGINX_CONFIG: 'DEPLOY_RENDER_DOKPLOY_INVALID_NGINX_CONFIG',
} as const;

export type DokployDeploymentErrorCode = keyof typeof DEPLOY_DOKPLOY_ERROR_CODES;

export type DokployPartialFailureResource = {
  readonly logicalId: string;
  readonly workloadSlug: string;
  readonly kind: 'domain-service' | 'integration-module' | 'edge-gateway';
  readonly targetResourceId: string;
  readonly targetResourceName: string;
  readonly action: 'created' | 'updated';
};

export type DokployPartialFailureStep = {
  readonly action: 'find' | 'create' | 'update';
  readonly resourceName: string;
  readonly workloadSlug: string;
};

export type DokployPartialFailure = {
  readonly createdResources: readonly DokployPartialFailureResource[];
  readonly updatedResources: readonly DokployPartialFailureResource[];
  readonly failedStep: DokployPartialFailureStep;
  readonly retrySafe: true;
};

export type DokployDeploymentError = {
  readonly code: DokployDeploymentErrorCode;
  readonly message: string;
  readonly resource?: string;
  readonly cause?: unknown;
  readonly partialFailure?: DokployPartialFailure;
};
