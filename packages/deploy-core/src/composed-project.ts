export type ServiceKind = 'domain' | 'integration';

export type ComposedProjectService = {
  readonly slug: string;
  readonly kind: ServiceKind;
  readonly runtimeFiles?: Readonly<Record<string, string>>;
};

export type ProjectRouteMap = {
  readonly ui?: Readonly<Record<string, string>>;
  readonly http?: Readonly<Record<string, string>>;
};

export type ProjectMiddlewareDecl = {
  readonly kind: string;
  readonly provider?: string;
  readonly audience?: string;
  readonly moduleSlug?: string;
  readonly policy?: string;
  readonly config?: unknown;
};

export type ProjectMountDecl = {
  readonly target: string;
  readonly use: readonly string[];
};

export type ComposedProjectInput = {
  readonly name: string;
  readonly services: Readonly<Record<string, ComposedProjectService>>;
  readonly routes?: ProjectRouteMap;
  readonly middleware?: Readonly<Record<string, ProjectMiddlewareDecl>>;
  readonly mounts?: readonly ProjectMountDecl[];
};
