/**
 * "Check if Authenticated" (n8n equivalent):
 * A pure boolean gate based solely on the presence of a non-empty access token.
 *
 * Important: do NOT trim, decode or validate the token here. This mirrors the original workflow:
 * presence of a token enables the authenticated branch; absence routes to unauthenticated response.
 */
export function checkIfAuthenticated(accessToken: unknown): boolean {
  return accessToken !== undefined && accessToken !== null && accessToken !== '';
}

