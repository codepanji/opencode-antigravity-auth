import { formatRefreshParts, parseRefreshParts } from "./auth";
import { loadAccounts, saveAccounts } from "./storage";
function nowMs() {
    return Date.now();
}
function clampNonNegativeInt(value, fallback) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }
    return value < 0 ? 0 : Math.floor(value);
}
function getQuotaKey(family, headerStyle) {
    if (family === "claude") {
        return "claude";
    }
    return headerStyle === "gemini-cli" ? "gemini-cli" : "gemini-antigravity";
}
function isRateLimitedForQuotaKey(account, key) {
    const resetTime = account.rateLimitResetTimes[key];
    return resetTime !== undefined && nowMs() < resetTime;
}
function isRateLimitedForFamily(account, family) {
    if (family === "claude") {
        return isRateLimitedForQuotaKey(account, "claude");
    }
    return isRateLimitedForQuotaKey(account, "gemini-antigravity") &&
        isRateLimitedForQuotaKey(account, "gemini-cli");
}
function clearExpiredRateLimits(account) {
    const now = nowMs();
    const keys = ["claude", "gemini-antigravity", "gemini-cli"];
    for (const key of keys) {
        if (account.rateLimitResetTimes[key] !== undefined && now >= account.rateLimitResetTimes[key]) {
            delete account.rateLimitResetTimes[key];
        }
    }
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
export class AccountManager {
    accounts = [];
    cursor = 0;
    currentAccountIndexByFamily = {
        claude: -1,
        gemini: -1,
    };
    lastToastAccountIndex = -1;
    lastToastTime = 0;
    static async loadFromDisk(authFallback) {
        const stored = await loadAccounts();
        return new AccountManager(authFallback, stored);
    }
    constructor(authFallback, stored) {
        const authParts = authFallback ? parseRefreshParts(authFallback.refresh) : null;
        if (stored && stored.accounts.length === 0) {
            this.accounts = [];
            this.cursor = 0;
            return;
        }
        if (stored && stored.accounts.length > 0) {
            const baseNow = nowMs();
            this.accounts = stored.accounts
                .map((acc, index) => {
                if (!acc.refreshToken || typeof acc.refreshToken !== "string") {
                    return null;
                }
                const matchesFallback = !!(authFallback &&
                    authParts &&
                    authParts.refreshToken &&
                    acc.refreshToken === authParts.refreshToken);
                return {
                    index,
                    email: acc.email,
                    addedAt: clampNonNegativeInt(acc.addedAt, baseNow),
                    lastUsed: clampNonNegativeInt(acc.lastUsed, 0),
                    parts: {
                        refreshToken: acc.refreshToken,
                        projectId: acc.projectId,
                        managedProjectId: acc.managedProjectId,
                    },
                    access: matchesFallback ? authFallback?.access : undefined,
                    expires: matchesFallback ? authFallback?.expires : undefined,
                    rateLimitResetTimes: acc.rateLimitResetTimes ?? {},
                    lastSwitchReason: acc.lastSwitchReason,
                };
            })
                .filter((a) => a !== null);
            this.cursor = clampNonNegativeInt(stored.activeIndex, 0);
            if (this.accounts.length > 0) {
                this.cursor = this.cursor % this.accounts.length;
                const defaultIndex = this.cursor;
                this.currentAccountIndexByFamily.claude = clampNonNegativeInt(stored.activeIndexByFamily?.claude, defaultIndex) % this.accounts.length;
                this.currentAccountIndexByFamily.gemini = clampNonNegativeInt(stored.activeIndexByFamily?.gemini, defaultIndex) % this.accounts.length;
            }
            return;
        }
        if (authFallback) {
            const parts = parseRefreshParts(authFallback.refresh);
            if (parts.refreshToken) {
                const now = nowMs();
                this.accounts = [
                    {
                        index: 0,
                        email: undefined,
                        addedAt: now,
                        lastUsed: 0,
                        parts,
                        access: authFallback.access,
                        expires: authFallback.expires,
                        rateLimitResetTimes: {},
                    },
                ];
                this.cursor = 0;
                this.currentAccountIndexByFamily.claude = 0;
                this.currentAccountIndexByFamily.gemini = 0;
            }
        }
    }
    getAccountCount() {
        return this.accounts.length;
    }
    getAccountsSnapshot() {
        return this.accounts.map((a) => ({ ...a, parts: { ...a.parts }, rateLimitResetTimes: { ...a.rateLimitResetTimes } }));
    }
    getCurrentAccountForFamily(family) {
        const currentIndex = this.currentAccountIndexByFamily[family];
        if (currentIndex >= 0 && currentIndex < this.accounts.length) {
            return this.accounts[currentIndex] ?? null;
        }
        return null;
    }
    markSwitched(account, reason, family) {
        account.lastSwitchReason = reason;
        this.currentAccountIndexByFamily[family] = account.index;
    }
    shouldShowAccountToast(accountIndex, debounceMs = 30000) {
        const now = nowMs();
        if (accountIndex === this.lastToastAccountIndex && now - this.lastToastTime < debounceMs) {
            return false;
        }
        return true;
    }
    markToastShown(accountIndex) {
        this.lastToastAccountIndex = accountIndex;
        this.lastToastTime = nowMs();
    }
    getCurrentOrNextForFamily(family) {
        const current = this.getCurrentAccountForFamily(family);
        if (current) {
            clearExpiredRateLimits(current);
            if (!isRateLimitedForFamily(current, family)) {
                current.lastUsed = nowMs();
                return current;
            }
        }
        const next = this.getNextForFamily(family);
        if (next) {
            this.currentAccountIndexByFamily[family] = next.index;
        }
        return next;
    }
    getNextForFamily(family) {
        const available = this.accounts.filter((a) => {
            clearExpiredRateLimits(a);
            return !isRateLimitedForFamily(a, family);
        });
        if (available.length === 0) {
            return null;
        }
        const account = available[this.cursor % available.length];
        if (!account) {
            return null;
        }
        this.cursor++;
        account.lastUsed = nowMs();
        return account;
    }
    markRateLimited(account, retryAfterMs, family, headerStyle = "antigravity") {
        const key = getQuotaKey(family, headerStyle);
        account.rateLimitResetTimes[key] = nowMs() + retryAfterMs;
    }
    isRateLimitedForHeaderStyle(account, family, headerStyle) {
        clearExpiredRateLimits(account);
        const key = getQuotaKey(family, headerStyle);
        return isRateLimitedForQuotaKey(account, key);
    }
    getAvailableHeaderStyle(account, family) {
        clearExpiredRateLimits(account);
        if (family === "claude") {
            return isRateLimitedForQuotaKey(account, "claude") ? null : "antigravity";
        }
        if (!isRateLimitedForQuotaKey(account, "gemini-antigravity")) {
            return "antigravity";
        }
        if (!isRateLimitedForQuotaKey(account, "gemini-cli")) {
            return "gemini-cli";
        }
        return null;
    }
    removeAccount(account) {
        const idx = this.accounts.indexOf(account);
        if (idx < 0) {
            return false;
        }
        this.accounts.splice(idx, 1);
        this.accounts.forEach((acc, index) => {
            acc.index = index;
        });
        if (this.accounts.length === 0) {
            this.cursor = 0;
            this.currentAccountIndexByFamily.claude = -1;
            this.currentAccountIndexByFamily.gemini = -1;
            return true;
        }
        if (this.cursor > idx) {
            this.cursor -= 1;
        }
        this.cursor = this.cursor % this.accounts.length;
        for (const family of ["claude", "gemini"]) {
            if (this.currentAccountIndexByFamily[family] > idx) {
                this.currentAccountIndexByFamily[family] -= 1;
            }
            if (this.currentAccountIndexByFamily[family] >= this.accounts.length) {
                this.currentAccountIndexByFamily[family] = -1;
            }
        }
        return true;
    }
    updateFromAuth(account, auth) {
        const parts = parseRefreshParts(auth.refresh);
        account.parts = parts;
        account.access = auth.access;
        account.expires = auth.expires;
    }
    toAuthDetails(account) {
        return {
            type: "oauth",
            refresh: formatRefreshParts(account.parts),
            access: account.access,
            expires: account.expires,
        };
    }
    getMinWaitTimeForFamily(family) {
        const available = this.accounts.filter((a) => {
            clearExpiredRateLimits(a);
            return !isRateLimitedForFamily(a, family);
        });
        if (available.length > 0) {
            return 0;
        }
        const waitTimes = [];
        for (const a of this.accounts) {
            if (family === "claude") {
                const t = a.rateLimitResetTimes.claude;
                if (t !== undefined)
                    waitTimes.push(Math.max(0, t - nowMs()));
            }
            else {
                // For Gemini, account becomes available when EITHER pool expires
                const t1 = a.rateLimitResetTimes["gemini-antigravity"];
                const t2 = a.rateLimitResetTimes["gemini-cli"];
                const accountWait = Math.min(t1 !== undefined ? Math.max(0, t1 - nowMs()) : Infinity, t2 !== undefined ? Math.max(0, t2 - nowMs()) : Infinity);
                if (accountWait !== Infinity)
                    waitTimes.push(accountWait);
            }
        }
        return waitTimes.length > 0 ? Math.min(...waitTimes) : 0;
    }
    getAccounts() {
        return [...this.accounts];
    }
    async saveToDisk() {
        const claudeIndex = Math.max(0, this.currentAccountIndexByFamily.claude);
        const geminiIndex = Math.max(0, this.currentAccountIndexByFamily.gemini);
        const storage = {
            version: 3,
            accounts: this.accounts.map((a) => ({
                email: a.email,
                refreshToken: a.parts.refreshToken,
                projectId: a.parts.projectId,
                managedProjectId: a.parts.managedProjectId,
                addedAt: a.addedAt,
                lastUsed: a.lastUsed,
                lastSwitchReason: a.lastSwitchReason,
                rateLimitResetTimes: Object.keys(a.rateLimitResetTimes).length > 0 ? a.rateLimitResetTimes : undefined,
            })),
            activeIndex: claudeIndex,
            activeIndexByFamily: {
                claude: claudeIndex,
                gemini: geminiIndex,
            },
        };
        await saveAccounts(storage);
    }
}
//# sourceMappingURL=accounts.js.map