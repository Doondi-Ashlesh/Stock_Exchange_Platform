import { ATLASMARKET_API_BASE, ATLASMARKET_PUBLIC_APP_URL, ATLASMARKET_STRIPE_MODE } from "@env";
import * as WebBrowser from "expo-web-browser";

export type AtlasStripeMode = "disabled" | "billing" | "funding";

export interface AtlasStripeStatus {
    enabled: boolean;
    mode: AtlasStripeMode;
    ready: boolean;
    checkoutReady: boolean;
    customerPortalReady: boolean;
    fundingSessionReady: boolean;
    message: string;
}

interface AtlasStripeStatusResponse extends Partial<AtlasStripeStatus> {
    stripe?: Partial<AtlasStripeStatus>;
}

interface AtlasHostedSessionResponse {
    url?: string;
}

interface AtlasHostedSessionRequest {
    returnUrl?: string;
}

export function getAtlasPlatformApiBase(): string | undefined {
    return ATLASMARKET_API_BASE && !ATLASMARKET_API_BASE.includes("example.com")
        ? ATLASMARKET_API_BASE
        : undefined;
}

export function getAtlasStripeMode(): AtlasStripeMode {
    const mode = ATLASMARKET_STRIPE_MODE?.trim().toLowerCase();

    if (mode === "billing" || mode === "funding") {
        return mode;
    }

    return "disabled";
}

export function getAtlasStripeLocalStatus(): AtlasStripeStatus {
    const mode = getAtlasStripeMode();
    const hasPlatformApi = Boolean(getAtlasPlatformApiBase());

    if (mode === "disabled") {
        return {
            enabled: false,
            mode,
            ready: false,
            checkoutReady: false,
            customerPortalReady: false,
            fundingSessionReady: false,
            message: "Stripe is disabled in this AtlasMarket client configuration."
        };
    }

    const ready = hasPlatformApi;

    return {
        enabled: true,
        mode,
        ready,
        checkoutReady: ready && mode === "billing",
        customerPortalReady: ready,
        fundingSessionReady: ready && mode === "funding",
        message: ready
            ? `AtlasMarket can request hosted Stripe ${mode === "billing" ? "billing" : "funding"} sessions from its platform API.`
            : "Add ATLASMARKET_API_BASE and expose server-side Stripe session endpoints to enable hosted Stripe flows."
    };
}

export async function getAtlasStripeStatus(): Promise<AtlasStripeStatus> {
    const localStatus = getAtlasStripeLocalStatus();
    const apiBase = getAtlasPlatformApiBase();

    if (!apiBase || !localStatus.enabled) {
        return localStatus;
    }

    try {
        const response = await fetch(new URL("/v1/payments/stripe/status", ensureTrailingSlash(apiBase)).toString());

        if (!response.ok) {
            return {
                ...localStatus,
                message: `Stripe status could not be loaded from the platform API (${response.status}). ${localStatus.message}`
            };
        }

        const payload = await response.json() as AtlasStripeStatusResponse;
        const stripe = payload.stripe && typeof payload.stripe === "object" ? payload.stripe : payload;
        const mode = normalizeStripeMode(stripe.mode, localStatus.mode);

        return {
            enabled: typeof stripe.enabled === "boolean" ? stripe.enabled : localStatus.enabled,
            mode,
            ready: typeof stripe.ready === "boolean" ? stripe.ready : localStatus.ready,
            checkoutReady: typeof stripe.checkoutReady === "boolean" ? stripe.checkoutReady : (mode === "billing" && localStatus.checkoutReady),
            customerPortalReady: typeof stripe.customerPortalReady === "boolean" ? stripe.customerPortalReady : localStatus.customerPortalReady,
            fundingSessionReady: typeof stripe.fundingSessionReady === "boolean" ? stripe.fundingSessionReady : (mode === "funding" && localStatus.fundingSessionReady),
            message: typeof stripe.message === "string" && stripe.message.trim()
                ? stripe.message
                : localStatus.message
        };
    } catch {
        return {
            ...localStatus,
            message: `Stripe status could not be loaded from the platform API. ${localStatus.message}`
        };
    }
}

export async function openAtlasStripeCheckout(returnUrl?: string): Promise<{ ok: boolean; message: string; }> {
    const session = await createHostedSession("/v1/payments/stripe/checkout-session", { returnUrl: resolveReturnUrl(returnUrl) });

    if (!session?.url) {
        return {
            ok: false,
            message: "Stripe Checkout could not be started. Expose POST /v1/payments/stripe/checkout-session on the AtlasMarket platform API."
        };
    }

    await WebBrowser.openBrowserAsync(session.url);
    return {
        ok: true,
        message: "Stripe Checkout opened in the browser."
    };
}

export async function openAtlasStripeCustomerPortal(returnUrl?: string): Promise<{ ok: boolean; message: string; }> {
    const session = await createHostedSession("/v1/payments/stripe/customer-portal-session", { returnUrl: resolveReturnUrl(returnUrl) });

    if (!session?.url) {
        return {
            ok: false,
            message: "The Stripe billing portal could not be opened. Expose POST /v1/payments/stripe/customer-portal-session on the AtlasMarket platform API."
        };
    }

    await WebBrowser.openBrowserAsync(session.url);
    return {
        ok: true,
        message: "Stripe billing portal opened in the browser."
    };
}

export async function openAtlasStripeFundingSession(returnUrl?: string): Promise<{ ok: boolean; message: string; }> {
    const session = await createHostedSession("/v1/payments/stripe/funding-session", { returnUrl: resolveReturnUrl(returnUrl) });

    if (!session?.url) {
        return {
            ok: false,
            message: "The Stripe funding flow could not be started. Expose POST /v1/payments/stripe/funding-session on the AtlasMarket platform API."
        };
    }

    await WebBrowser.openBrowserAsync(session.url);
    return {
        ok: true,
        message: "Stripe funding flow opened in the browser."
    };
}

async function createHostedSession(path: string, body: AtlasHostedSessionRequest): Promise<AtlasHostedSessionResponse | undefined> {
    const apiBase = getAtlasPlatformApiBase();

    if (!apiBase) {
        return undefined;
    }

    try {
        const response = await fetch(new URL(path, ensureTrailingSlash(apiBase)).toString(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            return undefined;
        }

        return response.json() as Promise<AtlasHostedSessionResponse>;
    } catch {
        return undefined;
    }
}

function resolveReturnUrl(override?: string): string | undefined {
    if (override && override.trim()) {
        return override.trim();
    }

    if (ATLASMARKET_PUBLIC_APP_URL && !ATLASMARKET_PUBLIC_APP_URL.includes("example.com")) {
        return ATLASMARKET_PUBLIC_APP_URL;
    }

    return undefined;
}

function ensureTrailingSlash(value: string): string {
    return value.endsWith("/") ? value : `${value}/`;
}

function normalizeStripeMode(value: unknown, fallback: AtlasStripeMode): AtlasStripeMode {
    return value === "billing" || value === "funding" || value === "disabled"
        ? value
        : fallback;
}
