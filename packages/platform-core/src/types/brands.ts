declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ValidatedSlug = Brand<string, 'ValidatedSlug'>;
export type ValidatedTokenName = Brand<string, 'ValidatedTokenName'>;
export type ValidatedPublishBundle = Brand<
  {
    readonly manifest: unknown;
    readonly pdm: unknown;
    readonly qsm: unknown;
    readonly graphIr: unknown;
    readonly bindings: unknown;
    readonly ui: unknown;
    readonly seed: unknown;
  },
  'ValidatedPublishBundle'
>;
