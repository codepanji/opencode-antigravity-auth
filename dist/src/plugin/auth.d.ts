import type { AuthDetails, OAuthAuthDetails, RefreshParts } from "./types";
export declare function isOAuthAuth(auth: AuthDetails): auth is OAuthAuthDetails;
/**
 * Splits a packed refresh string into its constituent refresh token and project IDs.
 */
export declare function parseRefreshParts(refresh: string): RefreshParts;
/**
 * Serializes refresh token parts into the stored string format.
 */
export declare function formatRefreshParts(parts: RefreshParts): string;
/**
 * Determines whether an access token is expired or missing, with buffer for clock skew.
 */
export declare function accessTokenExpired(auth: OAuthAuthDetails): boolean;
//# sourceMappingURL=auth.d.ts.map