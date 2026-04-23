import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Tenant } from '../../modules/tenants/tenant.entity';

/**
 * @CurrentTenant() decorator
 * Extracts the authenticated tenant from the JWT payload.
 *
 * Usage:
 *   @Get('profile')
 *   getProfile(@CurrentTenant() tenant: Tenant) { ... }
 */
export const CurrentTenant = createParamDecorator(
  (data: keyof Tenant | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const tenant = request.user as Tenant;
    return data ? tenant?.[data] : tenant;
  },
);
