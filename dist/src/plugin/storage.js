import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "./logger";
const log = createLogger("storage");
function getConfigDir() {
    const platform = process.platform;
    if (platform === "win32") {
        return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "opencode");
    }
    const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(xdgConfig, "opencode");
}
export function getStoragePath() {
    return join(getConfigDir(), "antigravity-accounts.json");
}
function migrateV1ToV2(v1) {
    return {
        version: 2,
        accounts: v1.accounts.map((acc) => {
            const rateLimitResetTimes = {};
            if (acc.isRateLimited && acc.rateLimitResetTime && acc.rateLimitResetTime > Date.now()) {
                rateLimitResetTimes.claude = acc.rateLimitResetTime;
                rateLimitResetTimes.gemini = acc.rateLimitResetTime;
            }
            return {
                email: acc.email,
                refreshToken: acc.refreshToken,
                projectId: acc.projectId,
                managedProjectId: acc.managedProjectId,
                addedAt: acc.addedAt,
                lastUsed: acc.lastUsed,
                lastSwitchReason: acc.lastSwitchReason,
                rateLimitResetTimes: Object.keys(rateLimitResetTimes).length > 0 ? rateLimitResetTimes : undefined,
            };
        }),
        activeIndex: v1.activeIndex,
    };
}
export function migrateV2ToV3(v2) {
    return {
        version: 3,
        accounts: v2.accounts.map((acc) => {
            const rateLimitResetTimes = {};
            if (acc.rateLimitResetTimes?.claude && acc.rateLimitResetTimes.claude > Date.now()) {
                rateLimitResetTimes.claude = acc.rateLimitResetTimes.claude;
            }
            if (acc.rateLimitResetTimes?.gemini && acc.rateLimitResetTimes.gemini > Date.now()) {
                rateLimitResetTimes["gemini-antigravity"] = acc.rateLimitResetTimes.gemini;
            }
            return {
                email: acc.email,
                refreshToken: acc.refreshToken,
                projectId: acc.projectId,
                managedProjectId: acc.managedProjectId,
                addedAt: acc.addedAt,
                lastUsed: acc.lastUsed,
                lastSwitchReason: acc.lastSwitchReason,
                rateLimitResetTimes: Object.keys(rateLimitResetTimes).length > 0 ? rateLimitResetTimes : undefined,
            };
        }),
        activeIndex: v2.activeIndex,
    };
}
export async function loadAccounts() {
    try {
        const path = getStoragePath();
        const content = await fs.readFile(path, "utf-8");
        const data = JSON.parse(content);
        if (!Array.isArray(data.accounts)) {
            log.warn("Invalid storage format, ignoring");
            return null;
        }
        let storage;
        if (data.version === 1) {
            log.info("Migrating account storage from v1 to v3");
            const v2 = migrateV1ToV2(data);
            storage = migrateV2ToV3(v2);
            try {
                await saveAccounts(storage);
                log.info("Migration to v3 complete");
            }
            catch (saveError) {
                log.warn("Failed to persist migrated storage", { error: String(saveError) });
            }
        }
        else if (data.version === 2) {
            log.info("Migrating account storage from v2 to v3");
            storage = migrateV2ToV3(data);
            try {
                await saveAccounts(storage);
                log.info("Migration to v3 complete");
            }
            catch (saveError) {
                log.warn("Failed to persist migrated storage", { error: String(saveError) });
            }
        }
        else if (data.version === 3) {
            storage = data;
        }
        else {
            log.warn("Unknown storage version, ignoring", {
                version: data.version,
            });
            return null;
        }
        if (typeof storage.activeIndex !== "number" || !Number.isInteger(storage.activeIndex)) {
            storage.activeIndex = 0;
        }
        if (storage.activeIndex < 0 || storage.activeIndex >= storage.accounts.length) {
            storage.activeIndex = 0;
        }
        return storage;
    }
    catch (error) {
        const code = error.code;
        if (code === "ENOENT") {
            return null;
        }
        log.error("Failed to load account storage", { error: String(error) });
        return null;
    }
}
export async function saveAccounts(storage) {
    const path = getStoragePath();
    await fs.mkdir(dirname(path), { recursive: true });
    const content = JSON.stringify(storage, null, 2);
    await fs.writeFile(path, content, "utf-8");
}
export async function clearAccounts() {
    try {
        const path = getStoragePath();
        await fs.unlink(path);
    }
    catch (error) {
        const code = error.code;
        if (code !== "ENOENT") {
            log.error("Failed to clear account storage", { error: String(error) });
        }
    }
}
//# sourceMappingURL=storage.js.map