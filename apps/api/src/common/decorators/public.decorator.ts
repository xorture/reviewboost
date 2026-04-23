import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() decorator — marks a route as public (no JWT required).
 * Used for: feedback page, webhooks, health checks.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
