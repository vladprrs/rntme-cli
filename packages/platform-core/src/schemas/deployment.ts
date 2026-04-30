import { z } from 'zod';
import { UuidSchema } from './primitives.js';

export const DeploymentStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'succeeded_with_warnings',
  'failed',
  'failed_orphaned',
]);
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

export const VerificationCheckSchema = z.object({
  name: z.string(),
  url: z.string(),
  status: z.union([z.number().int(), z.literal('timeout'), z.literal('error')]),
  latencyMs: z.number().int().nonnegative(),
  ok: z.boolean(),
  note: z.string().optional(),
});
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;

export const VerificationReportSchema = z.object({
  checks: z.array(VerificationCheckSchema),
  ok: z.boolean(),
  partialOk: z.boolean(),
});
export type VerificationReport = z.infer<typeof VerificationReportSchema>;

export const StartDeploymentRequestSchema = z.object({
  projectVersionSeq: z.number().int().positive(),
  targetSlug: z.string().min(1).optional(),
  configOverrides: z
    .object({
      integrationModuleImages: z.record(z.string(), z.string()).optional(),
      policyOverrides: z.record(z.string(), z.unknown()).optional(),
      runtimeImage: z.string().min(1).optional(),
    })
    .default({}),
});
export type StartDeploymentRequest = z.infer<typeof StartDeploymentRequestSchema>;

export const DeploymentSchema = z.object({
  id: UuidSchema,
  projectId: UuidSchema,
  orgId: UuidSchema,
  projectVersionId: UuidSchema,
  targetId: UuidSchema,
  status: DeploymentStatusSchema,
  configOverrides: z.record(z.string(), z.unknown()),
  renderedPlanDigest: z.string().nullable(),
  applyResult: z.record(z.string(), z.unknown()).nullable(),
  verificationReport: VerificationReportSchema.nullable(),
  warnings: z.array(z.unknown()),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedByAccountId: UuidSchema,
  queuedAt: z.date(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  lastHeartbeatAt: z.date().nullable(),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export const DeploymentLogLineSchema = z.object({
  id: z.number().int().nonnegative(),
  deploymentId: UuidSchema,
  orgId: UuidSchema,
  ts: z.date(),
  level: z.enum(['info', 'warn', 'error']),
  step: z.string(),
  message: z.string(),
});
export type DeploymentLogLine = z.infer<typeof DeploymentLogLineSchema>;
