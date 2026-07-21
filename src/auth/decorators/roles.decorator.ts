import { SetMetadata } from '@nestjs/common';
import { Role } from '../../users/user.entity';

export const ROLES_KEY = 'roles';

/**
 * @Roles(Role.DOCTOR, Role.PATIENT) – metadata decorator that marks
 * a route handler with the required roles. Used by RolesGuard.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
