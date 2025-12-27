import { type HeaderStyle } from "../constants";
import { type AntigravityDebugContext } from "./debug";
/**
 * Gets the stable session ID for this plugin instance.
 */
export declare function getPluginSessionId(): string;
/**
 * Detects requests headed to the Google Generative Language API so we can intercept them.
 */
export declare function isGenerativeLanguageRequest(input: RequestInfo): input is string;
/**
 * Rewrites OpenAI-style requests into Antigravity shape, normalizing model, headers,
 * optional cached_content, and thinking config. Also toggles streaming mode for SSE actions.
 */
export declare function prepareAntigravityRequest(input: RequestInfo, init: RequestInit | undefined, accessToken: string, projectId: string, endpointOverride?: string, headerStyle?: HeaderStyle, forceThinkingRecovery?: boolean): {
    request: RequestInfo;
    init: RequestInit;
    streaming: boolean;
    requestedModel?: string;
    effectiveModel?: string;
    projectId?: string;
    endpoint?: string;
    sessionId?: string;
    toolDebugMissing?: number;
    toolDebugSummary?: string;
    toolDebugPayload?: string;
    needsSignedThinkingWarmup?: boolean;
    headerStyle: HeaderStyle;
    thinkingRecoveryMessage?: string;
};
export declare function buildThinkingWarmupBody(bodyText: string | undefined, isClaudeThinking: boolean): string | null;
/**
 * Normalizes Antigravity responses: applies retry headers, extracts cache usage into headers,
 * rewrites preview errors, flattens streaming payloads, and logs debug metadata.
 *
 * For streaming SSE responses, uses TransformStream for true real-time incremental streaming.
 * Thinking/reasoning tokens are transformed and forwarded immediately as they arrive.
 */
export declare function transformAntigravityResponse(response: Response, streaming: boolean, debugContext?: AntigravityDebugContext | null, requestedModel?: string, projectId?: string, endpoint?: string, effectiveModel?: string, sessionId?: string, toolDebugMissing?: number, toolDebugSummary?: string, toolDebugPayload?: string, debugLines?: string[]): Promise<Response>;
//# sourceMappingURL=request.d.ts.map