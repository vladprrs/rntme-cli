import type { Result, PlatformError } from '../types/result.js';

export interface WorkosEventLogRepo {
  hasProcessed(eventId: string): Promise<Result<boolean, PlatformError>>;
  markProcessed(eventId: string, eventType: string): Promise<Result<void, PlatformError>>;
}
