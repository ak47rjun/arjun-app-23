import type { Role } from '@prisma/client';

/** Role hierarchy — higher rank includes all lower permissions. */
export const ROLE_RANK: Record<Role, number> = {
  GUEST: 0,
  MEMBER: 1,
  VERIFIED_TRADER: 2,
  MODERATOR: 3,
  ADMIN: 4,
};

export function hasRole(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export function canModerate(role: Role): boolean {
  return hasRole(role, 'MODERATOR');
}

export function isAdmin(role: Role): boolean {
  return role === 'ADMIN';
}
