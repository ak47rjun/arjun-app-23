'use client';

/**
 * Client-side feature flags. Only non-secret configuration lives here.
 * Google sign-in visibility is decided by the server; this flag defaults to
 * showing the button and the server redirects with an error if unconfigured.
 */
export const googleAuthConfiguredClient = true;
