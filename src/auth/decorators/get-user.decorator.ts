import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @GetUser() – parameter decorator that extracts the authenticated
 * user object from the request. Populated by JwtAuthGuard.
 *
 * Usage:
 *   @Get('/profile')
 *   getProfile(@GetUser() user: AuthenticatedUser) { ... }
 */
export const GetUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
