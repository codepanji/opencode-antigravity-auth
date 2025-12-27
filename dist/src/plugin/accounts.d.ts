import { type AccountStorageV3, type RateLimitStateV3, type ModelFamily, type HeaderStyle } from "./storage";
import type { OAuthAuthDetails, RefreshParts } from "./types";
export type { ModelFamily, HeaderStyle } from "./storage";
export type QuotaKey = "claude" | "gemini-antigravity" | "gemini-cli";
export interface ManagedAccount {
    index: number;
    email?: string;
    addedAt: number;
    lastUsed: number;
    parts: RefreshParts;
    access?: string;
    expires?: number;
    rateLimitResetTimes: RateLimitStateV3;
    lastSwitchReason?: "rate-limit" | "initial" | "rotation";
}
/**
 * In-memory multi-account manager with sticky account selection.
 *
 * Uses the same account until it hits a rate limit (429), then switches.
 * Rate limits are tracked per-model-family (claude/gemini) so an account
 * rate-limited for Claude can still be used for Gemini.
 *
 * Source of truth for the pool is `antigravity-accounts.json`.
 */
export declare class AccountManager {
    private accounts;
    private cursor;
    private currentAccountIndexByFamily;
    private lastToastAccountIndex;
    private lastToastTime;
    static loadFromDisk(authFallback?: OAuthAuthDetails): Promise<AccountManager>;
    constructor(authFallback?: OAuthAuthDetails, stored?: AccountStorageV3 | null);
    getAccountCount(): number;
    getAccountsSnapshot(): ManagedAccount[];
    getCurrentAccountForFamily(family: ModelFamily): ManagedAccount | null;
    markSwitched(account: ManagedAccount, reason: "rate-limit" | "initial" | "rotation", family: ModelFamily): void;
    shouldShowAccountToast(accountIndex: number, debounceMs?: number): boolean;
    markToastShown(accountIndex: number): void;
    getCurrentOrNextForFamily(family: ModelFamily): ManagedAccount | null;
    getNextForFamily(family: ModelFamily): ManagedAccount | null;
    markRateLimited(account: ManagedAccount, retryAfterMs: number, family: ModelFamily, headerStyle?: HeaderStyle): void;
    isRateLimitedForHeaderStyle(account: ManagedAccount, family: ModelFamily, headerStyle: HeaderStyle): boolean;
    getAvailableHeaderStyle(account: ManagedAccount, family: ModelFamily): HeaderStyle | null;
    removeAccount(account: ManagedAccount): boolean;
    updateFromAuth(account: ManagedAccount, auth: OAuthAuthDetails): void;
    toAuthDetails(account: ManagedAccount): OAuthAuthDetails;
    getMinWaitTimeForFamily(family: ModelFamily): number;
    getAccounts(): ManagedAccount[];
    saveToDisk(): Promise<void>;
}
//# sourceMappingURL=accounts.d.ts.map