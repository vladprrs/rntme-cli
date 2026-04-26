import { z } from 'zod';
import { SlugSchema, UuidSchema } from './primitives.js';

const KafkaSecuritySchema = z
  .object({
    protocol: z.enum(['plaintext', 'sasl_ssl']),
    secretRefs: z.record(z.string(), z.string()).optional(),
  })
  .optional();

export const EventBusConfigSchema = z.object({
  kind: z.literal('kafka'),
  mode: z.literal('external').optional(),
  brokers: z.array(z.string().min(1)).min(1),
  topicPrefix: z.string().optional(),
  security: KafkaSecuritySchema,
});
export type EventBusConfig = z.infer<typeof EventBusConfigSchema>;

export const PolicyValuesSchema = z.record(z.string(), z.record(z.string(), z.unknown())).default({});
export type PolicyValues = z.infer<typeof PolicyValuesSchema>;

export const DeployTargetKindSchema = z.enum(['dokploy']);
export type DeployTargetKind = z.infer<typeof DeployTargetKindSchema>;

export const CreateDeployTargetRequestSchema = z
  .object({
    slug: SlugSchema,
    displayName: z.string().min(1).max(120),
    kind: DeployTargetKindSchema,
    dokployUrl: z.string().url(),
    dokployProjectId: z.string().min(1).optional(),
    dokployProjectName: z.string().min(1).optional(),
    allowCreateProject: z.boolean().default(false),
    apiToken: z.string().min(1),
    eventBus: EventBusConfigSchema,
    policyValues: PolicyValuesSchema,
    isDefault: z.boolean().default(false),
  })
  .refine(
    (value) =>
      Boolean(value.dokployProjectId) ||
      (Boolean(value.dokployProjectName) && value.allowCreateProject),
    {
      message: 'either dokployProjectId or (dokployProjectName + allowCreateProject) is required',
    },
  );
export type CreateDeployTargetRequest = z.infer<typeof CreateDeployTargetRequestSchema>;

export const UpdateDeployTargetRequestSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    dokployUrl: z.string().url().optional(),
    dokployProjectId: z.string().min(1).nullable().optional(),
    dokployProjectName: z.string().min(1).nullable().optional(),
    allowCreateProject: z.boolean().optional(),
    eventBus: EventBusConfigSchema.optional(),
    policyValues: PolicyValuesSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();
export type UpdateDeployTargetRequest = z.infer<typeof UpdateDeployTargetRequestSchema>;

export const RotateApiTokenRequestSchema = z.object({ apiToken: z.string().min(1) });
export type RotateApiTokenRequest = z.infer<typeof RotateApiTokenRequestSchema>;

export const DeployTargetSchema = z.object({
  id: UuidSchema,
  orgId: UuidSchema,
  slug: SlugSchema,
  displayName: z.string(),
  kind: DeployTargetKindSchema,
  dokployUrl: z.string(),
  dokployProjectId: z.string().nullable(),
  dokployProjectName: z.string().nullable(),
  allowCreateProject: z.boolean(),
  apiTokenRedacted: z.literal('***'),
  eventBus: EventBusConfigSchema,
  policyValues: PolicyValuesSchema,
  isDefault: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type DeployTarget = z.infer<typeof DeployTargetSchema>;

export type DeployTargetWithSecret = Omit<DeployTarget, 'apiTokenRedacted'> & {
  readonly apiTokenCiphertext: Buffer;
  readonly apiTokenNonce: Buffer;
  readonly apiTokenKeyVersion: number;
};
