/** Role hierarchy tests. */
import { describe, expect, it } from 'vitest';
import { hasRole, canModerate, isAdmin, ROLE_RANK } from '@/lib/rbac';

describe('RBAC role hierarchy', () => {
  it('ranks roles GUEST < MEMBER < VERIFIED_TRADER < MODERATOR < ADMIN', () => {
    expect(ROLE_RANK.GUEST).toBeLessThan(ROLE_RANK.MEMBER);
    expect(ROLE_RANK.MEMBER).toBeLessThan(ROLE_RANK.VERIFIED_TRADER);
    expect(ROLE_RANK.VERIFIED_TRADER).toBeLessThan(ROLE_RANK.MODERATOR);
    expect(ROLE_RANK.MODERATOR).toBeLessThan(ROLE_RANK.ADMIN);
  });

  it('higher roles include lower permissions', () => {
    expect(hasRole('ADMIN', 'MEMBER')).toBe(true);
    expect(hasRole('MODERATOR', 'VERIFIED_TRADER')).toBe(true);
    expect(hasRole('VERIFIED_TRADER', 'MEMBER')).toBe(true);
  });

  it('lower roles do not include higher permissions', () => {
    expect(hasRole('MEMBER', 'MODERATOR')).toBe(false);
    expect(hasRole('GUEST', 'MEMBER')).toBe(false);
    expect(hasRole('VERIFIED_TRADER', 'ADMIN')).toBe(false);
  });

  it('moderators can moderate, members cannot', () => {
    expect(canModerate('MODERATOR')).toBe(true);
    expect(canModerate('ADMIN')).toBe(true);
    expect(canModerate('MEMBER')).toBe(false);
  });

  it('only ADMIN is admin', () => {
    expect(isAdmin('ADMIN')).toBe(true);
    expect(isAdmin('MODERATOR')).toBe(false);
  });
});
