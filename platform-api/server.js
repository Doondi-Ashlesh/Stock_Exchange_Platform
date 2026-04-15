const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

loadEnvFile(path.join(__dirname, ".env"));
loadEnvFile(path.join(process.cwd(), ".env.platform"));

const PORT = Number(process.env.PORT || 8787);
const CACHE_TTL_MS = 30000;
const MAX_BODY_BYTES = 1024 * 1024;
const SESSION_TTL_HOURS = Number(process.env.ATLASMARKET_SESSION_TTL_HOURS || 24 * 30);
const DEFAULT_DATA_FILE = process.env.ATLASMARKET_DATA_FILE
    ? path.resolve(process.env.ATLASMARKET_DATA_FILE)
    : path.join(__dirname, "data", "store.json");

const ATLAS_PROVIDER_SYMBOLS = {
    NVDA: "NVDA",
    MSFT: "MSFT",
    SAP: "SAP.DE",
    SIE: "SIE.DE",
    VALE3: "VALE3.SA",
    ITUB4: "ITUB4.SA",
    HDFCBANK: "HDFCBANK.NS",
    INFY: "INFY.NS",
    "6857": "6857.T",
    "8035": "8035.T"
};

const COUNTRY_BENCHMARK_SYMBOLS = {
    US: "SPY",
    BR: "EWZ",
    DE: "EWG",
    IN: "INDA",
    JP: "EWJ"
};

const responseCache = new Map();

function createServer(options = {}) {
    const store = options.store || createStoreAdapter(options.dataFile || DEFAULT_DATA_FILE);

    return http.createServer(async (req, res) => {
        const origin = req.headers.origin || "*";
        const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);
        const authContext = getAuthContext(req, store);

        writeCorsHeaders(res, origin);

        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        try {
            if (req.method === "GET" && url.pathname === "/health") {
                return json(res, 200, {
                    ok: true,
                    service: "atlasmarket-platform-api",
                    timestamp: new Date().toISOString()
                });
            }

            if (req.method === "GET" && url.pathname === "/v1/platform/status") {
                return json(res, 200, {
                    marketData: getMarketDataStatus(),
                    stripe: getStripeStatus(authContext.user),
                    auth: summarizeAuth(authContext),
                    storage: getStorageSummary(store.read()),
                    timestamp: new Date().toISOString()
                });
            }

            if (req.method === "POST" && url.pathname === "/v1/auth/register") {
                const body = await readJsonBody(req);
                return json(res, 201, registerUser(store, body, req));
            }

            if (req.method === "POST" && url.pathname === "/v1/auth/login") {
                const body = await readJsonBody(req);
                return json(res, 200, loginUser(store, body, req));
            }

            if (req.method === "POST" && url.pathname === "/v1/auth/logout") {
                if (!authContext.authenticated) {
                    return json(res, 200, {
                        ok: true,
                        loggedOut: false,
                        message: "No active session was provided."
                    });
                }

                logoutSession(store, authContext, req);
                return json(res, 200, {
                    ok: true,
                    loggedOut: true
                });
            }

            if (req.method === "GET" && url.pathname === "/v1/auth/me") {
                return json(res, 200, {
                    authenticated: authContext.authenticated,
                    user: authContext.user,
                    session: authContext.session ? sanitizeSession(authContext.session) : null
                });
            }

            if (req.method === "PATCH" && url.pathname === "/v1/users/me") {
                const userContext = requireAuth(authContext);
                const body = await readJsonBody(req);
                return json(res, 200, updateCurrentUser(store, userContext, body, req));
            }

            if (req.method === "GET" && url.pathname === "/v1/workspaces/paper") {
                const userContext = requireAuth(authContext);
                return json(res, 200, getPaperWorkspace(store, userContext));
            }

            if (req.method === "PUT" && url.pathname === "/v1/workspaces/paper") {
                const userContext = requireAuth(authContext);
                const body = await readJsonBody(req);
                return json(res, 200, savePaperWorkspace(store, userContext, body, req));
            }

            if (req.method === "GET" && url.pathname === "/v1/market/feed") {
                const payload = await buildLiveFeed(url);
                return json(res, 200, payload);
            }

            if (req.method === "GET" && url.pathname.startsWith("/v1/market/assets/")) {
                const atlasSymbol = decodeURIComponent(url.pathname.replace("/v1/market/assets/", ""));
                const detail = await buildAssetDetail(atlasSymbol);

                if (!detail) {
                    return json(res, 404, {
                        error: "Asset detail is unavailable for the requested symbol."
                    });
                }

                return json(res, 200, { detail });
            }

            if (req.method === "GET" && url.pathname === "/v1/payments/stripe/status") {
                return json(res, 200, getStripeStatus(authContext.user));
            }

            if (req.method === "POST" && url.pathname === "/v1/payments/stripe/checkout-session") {
                const body = await readJsonBody(req);
                return json(res, 200, await createStripeCheckoutSession(body, authContext.user));
            }

            if (req.method === "POST" && url.pathname === "/v1/payments/stripe/customer-portal-session") {
                const body = await readJsonBody(req);
                return json(res, 200, await createStripeCustomerPortalSession(body, authContext.user));
            }

            if (req.method === "POST" && url.pathname === "/v1/payments/stripe/funding-session") {
                const body = await readJsonBody(req);
                return json(res, 200, createStripeFundingSession(body, authContext.user));
            }

            if (req.method === "POST" && url.pathname === "/v1/webhooks/stripe") {
                const rawBody = await readRawBody(req);
                const signature = req.headers["stripe-signature"];

                if (!verifyStripeWebhook(rawBody, signature)) {
                    return json(res, 400, {
                        ok: false,
                        error: "Stripe signature verification failed."
                    });
                }

                const event = rawBody ? JSON.parse(rawBody) : {};
                const summary = handleStripeWebhook(store, event);

                return json(res, 200, {
                    ok: true,
                    received: true,
                    eventType: event.type || "unknown",
                    summary
                });
            }

            return json(res, 404, {
                error: "Route not found."
            });
        } catch (error) {
            if (error && typeof error === "object" && error.statusCode) {
                return json(res, error.statusCode, {
                    error: error.message
                });
            }

            return json(res, 500, {
                error: error instanceof Error ? error.message : "Unexpected server error."
            });
        }
    });
}

if (require.main === module) {
    const server = createServer();
    server.listen(PORT, () => {
        console.log(`AtlasMarket platform API listening on http://localhost:${PORT}`);
    });
}

module.exports = {
    createServer,
    createStoreAdapter,
    getMarketDataStatus,
    getStripeStatus,
    verifyStripeWebhook
};

function createStoreAdapter(filePath) {
    ensureStoreFile(filePath);

    return {
        filePath,
        read() {
            const raw = fs.readFileSync(filePath, "utf8");
            const parsed = raw ? JSON.parse(raw) : getDefaultStoreData();
            const normalized = normalizeStore(parsed);

            if (pruneExpiredSessions(normalized)) {
                writeStore(filePath, normalized);
            }

            return normalized;
        },
        write(nextStore) {
            writeStore(filePath, normalizeStore(nextStore));
        },
        update(mutator) {
            const current = this.read();
            const cloned = deepClone(current);
            const mutated = mutator(cloned) || cloned;
            const response = mutated.__response;
            const nextStore = normalizeStore(mutated);
            nextStore.updatedAt = new Date().toISOString();
            writeStore(filePath, nextStore);
            if (response !== undefined) {
                nextStore.__response = response;
            }
            return nextStore;
        }
    };
}

function getDefaultStoreData() {
    const now = new Date().toISOString();

    return {
        version: 1,
        createdAt: now,
        updatedAt: now,
        users: [],
        sessions: [],
        workspaces: [],
        auditEvents: []
    };
}

function normalizeStore(store) {
    const base = getDefaultStoreData();

    return {
        version: Number(store?.version || base.version),
        createdAt: store?.createdAt || base.createdAt,
        updatedAt: store?.updatedAt || base.updatedAt,
        users: Array.isArray(store?.users) ? store.users : [],
        sessions: Array.isArray(store?.sessions) ? store.sessions : [],
        workspaces: Array.isArray(store?.workspaces) ? store.workspaces : [],
        auditEvents: Array.isArray(store?.auditEvents) ? store.auditEvents : []
    };
}

function ensureStoreFile(filePath) {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });

    if (!fs.existsSync(filePath)) {
        writeStore(filePath, getDefaultStoreData());
    }
}

function writeStore(filePath, store) {
    const tempFilePath = `${filePath}.tmp`;
    fs.writeFileSync(tempFilePath, JSON.stringify(store, null, 2));
    fs.renameSync(tempFilePath, filePath);
}

function registerUser(store, body, req) {
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const displayName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : email.split("@")[0];
    const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "UTC";

    assertEmail(email);
    assertPassword(password);

    const nextStore = store.update((draft) => {
        if (draft.users.some((user) => normalizeEmail(user.email) === email)) {
            throw createHttpError(409, "An account already exists for that email address.");
        }

        const salt = crypto.randomBytes(16).toString("hex");
        const now = new Date().toISOString();
        const user = {
            id: generateId("user"),
            email,
            displayName,
            timezone,
            roles: ["customer"],
            passwordSalt: salt,
            passwordHash: hashPassword(password, salt),
            stripeCustomerId: null,
            stripeSubscriptionStatus: "inactive",
            entitlements: createDefaultEntitlements(),
            createdAt: now,
            updatedAt: now
        };

        const session = createSessionRecord(user.id);

        draft.users.unshift(user);
        draft.sessions.unshift(session.record);
        appendAuditEvent(draft, {
            type: "auth.register",
            userId: user.id,
            ip: getRequestIp(req),
            detail: `Account created for ${email}.`
        });

        draft.__response = buildAuthResponse(user, session.token, session.record);
        return draft;
    });

    return nextStore.__response;
}

function loginUser(store, body, req) {
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";

    assertEmail(email);
    assertPassword(password);

    const nextStore = store.update((draft) => {
        const user = draft.users.find((entry) => normalizeEmail(entry.email) === email);

        if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
            throw createHttpError(401, "Invalid email or password.");
        }

        user.updatedAt = new Date().toISOString();

        const session = createSessionRecord(user.id);
        draft.sessions.unshift(session.record);
        appendAuditEvent(draft, {
            type: "auth.login",
            userId: user.id,
            ip: getRequestIp(req),
            detail: `Session created for ${email}.`
        });

        draft.__response = buildAuthResponse(user, session.token, session.record);
        return draft;
    });

    return nextStore.__response;
}

function logoutSession(store, authContext, req) {
    store.update((draft) => {
        draft.sessions = draft.sessions.filter((session) => session.id !== authContext.session.id);
        appendAuditEvent(draft, {
            type: "auth.logout",
            userId: authContext.user.id,
            ip: getRequestIp(req),
            detail: `Session ${authContext.session.id} revoked.`
        });
        return draft;
    });
}

function updateCurrentUser(store, authContext, body, req) {
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : undefined;
    const timezone = typeof body.timezone === "string" ? body.timezone.trim() : undefined;

    const nextStore = store.update((draft) => {
        const user = draft.users.find((entry) => entry.id === authContext.user.id);

        if (!user) {
            throw createHttpError(404, "User account was not found.");
        }

        if (displayName) {
            user.displayName = displayName;
        }

        if (timezone) {
            user.timezone = timezone;
        }

        user.updatedAt = new Date().toISOString();

        appendAuditEvent(draft, {
            type: "user.profile.updated",
            userId: user.id,
            ip: getRequestIp(req),
            detail: "User profile settings were updated."
        });

        draft.__response = {
            user: sanitizeUser(user)
        };
        return draft;
    });

    return nextStore.__response;
}

function getPaperWorkspace(store, authContext) {
    const currentStore = store.read();
    const workspace = currentStore.workspaces.find((entry) => entry.userId === authContext.user.id && entry.kind === "paper");

    return {
        workspace: workspace?.workspace || null,
        updatedAt: workspace?.updatedAt || null
    };
}

function savePaperWorkspace(store, authContext, body, req) {
    if (!body || typeof body !== "object" || body.workspace === undefined) {
        throw createHttpError(400, "Provide a workspace payload in the request body.");
    }

    const workspacePayload = body.workspace;

    if (!isSerializableWorkspace(workspacePayload)) {
        throw createHttpError(400, "The workspace payload must be a JSON object or array.");
    }

    const nextStore = store.update((draft) => {
        const now = new Date().toISOString();
        const existing = draft.workspaces.find((entry) => entry.userId === authContext.user.id && entry.kind === "paper");

        if (existing) {
            existing.workspace = workspacePayload;
            existing.updatedAt = now;
        } else {
            draft.workspaces.unshift({
                id: generateId("workspace"),
                userId: authContext.user.id,
                kind: "paper",
                workspace: workspacePayload,
                createdAt: now,
                updatedAt: now
            });
        }

        appendAuditEvent(draft, {
            type: "workspace.paper.saved",
            userId: authContext.user.id,
            ip: getRequestIp(req),
            detail: "Paper workspace snapshot was stored on the platform API."
        });

        draft.__response = {
            workspace: workspacePayload,
            updatedAt: now
        };
        return draft;
    });

    return nextStore.__response;
}

function getAuthContext(req, store) {
    const token = readSessionToken(req);

    if (!token) {
        return {
            authenticated: false,
            user: null,
            session: null
        };
    }

    const storeData = store.read();
    const tokenHash = hashToken(token);
    const session = storeData.sessions.find((entry) => entry.tokenHash === tokenHash);

    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
        return {
            authenticated: false,
            user: null,
            session: null
        };
    }

    const user = storeData.users.find((entry) => entry.id === session.userId);

    if (!user) {
        return {
            authenticated: false,
            user: null,
            session: null
        };
    }

    touchSession(store, session.id);

    return {
        authenticated: true,
        user: sanitizeUser(user),
        session
    };
}

function touchSession(store, sessionId) {
    store.update((draft) => {
        const session = draft.sessions.find((entry) => entry.id === sessionId);

        if (session) {
            session.lastSeenAt = new Date().toISOString();
        }

        return draft;
    });
}

function requireAuth(authContext) {
    if (!authContext.authenticated || !authContext.user || !authContext.session) {
        throw createHttpError(401, "Authentication is required for this route.");
    }

    return authContext;
}

function summarizeAuth(authContext) {
    return {
        authenticated: authContext.authenticated,
        userId: authContext.user?.id || null,
        sessionExpiresAt: authContext.session?.expiresAt || null
    };
}

function getStorageSummary(storeData) {
    return {
        users: storeData.users.length,
        sessions: storeData.sessions.length,
        workspaces: storeData.workspaces.length,
        auditEvents: storeData.auditEvents.length
    };
}

async function buildLiveFeed(url) {
    const mode = (url.searchParams.get("mode") || "Live").toLowerCase();
    const snapshotDate = url.searchParams.get("snapshotDate");

    if (mode !== "live") {
        return {
            status: "replay",
            message: snapshotDate
                ? `Replay mode active for ${snapshotDate}.`
                : "Replay mode active.",
            assetQuotes: {},
            benchmarkQuotes: {}
        };
    }

    const marketStatus = getMarketDataStatus();

    if (!marketStatus.ready) {
        return {
            status: "demo",
            message: marketStatus.message,
            assetQuotes: {},
            benchmarkQuotes: {}
        };
    }

    const symbols = parseCsv(url.searchParams.get("symbols"));
    const selectedSymbol = url.searchParams.get("selectedSymbol") || undefined;
    const benchmarkSpecs = parseBenchmarkSpecs(url.searchParams.get("benchmarks"));

    const assetQuotes = Object.fromEntries((await Promise.all(
        symbols.map(async (atlasSymbol) => {
            const providerSymbol = resolveProviderSymbol(atlasSymbol);

            if (!providerSymbol) {
                return null;
            }

            const quote = await fetchProviderQuote(providerSymbol);

            if (!quote) {
                return null;
            }

            return [atlasSymbol, {
                atlasSymbol,
                providerSymbol,
                ...quote
            }];
        })
    )).filter(Boolean));

    const benchmarkQuotes = Object.fromEntries((await Promise.all(
        benchmarkSpecs.map(async ({ countryCode, providerSymbol }) => {
            const quote = await fetchProviderQuote(providerSymbol);
            const series = await fetchProviderCandleSeries(providerSymbol, 14);

            if (!quote) {
                return null;
            }

            return [countryCode, {
                atlasSymbol: `BENCH-${countryCode}`,
                providerSymbol,
                countryCode,
                ...quote,
                weeklyChange: computeWeeklyChange(series, quote.price),
                series: series.length > 1 ? series : [quote.previousClose || quote.price, quote.price]
            }];
        })
    )).filter(Boolean));

    const selectedAssetDetail = selectedSymbol
        ? await buildAssetDetail(selectedSymbol)
        : undefined;

    const liveCount = Object.keys(assetQuotes).length + Object.keys(benchmarkQuotes).length;

    return liveCount > 0
        ? {
            status: "live",
            message: `Platform API refreshed ${Object.keys(assetQuotes).length} assets and ${Object.keys(benchmarkQuotes).length} benchmark proxies.`,
            updatedAt: new Date().toISOString(),
            assetQuotes,
            benchmarkQuotes,
            selectedAssetDetail
        }
        : {
            status: "error",
            message: "Market-data provider calls completed without usable quote data.",
            assetQuotes: {},
            benchmarkQuotes: {},
            selectedAssetDetail
        };
}

async function buildAssetDetail(atlasSymbol) {
    const providerSymbol = resolveProviderSymbol(atlasSymbol);

    if (!providerSymbol || !getMarketDataStatus().ready) {
        return undefined;
    }

    const [quote, series, headlines] = await Promise.all([
        fetchProviderQuote(providerSymbol),
        fetchProviderCandleSeries(providerSymbol, 30),
        fetchProviderNews(providerSymbol)
    ]);

    if (!quote) {
        return undefined;
    }

    return {
        atlasSymbol,
        providerSymbol,
        ...quote,
        priceSeries: series.length > 1 ? series : [quote.previousClose || quote.price, quote.price],
        headlines
    };
}

function getMarketDataStatus() {
    const provider = (process.env.MARKET_DATA_PROVIDER || "disabled").trim().toLowerCase();
    const apiBase = process.env.MARKET_DATA_API_BASE;
    const apiKey = process.env.MARKET_DATA_API_KEY;
    const ready = provider === "finnhub" && Boolean(apiBase && apiKey);

    return {
        enabled: provider !== "disabled",
        provider,
        ready,
        message: ready
            ? "Backend market-data proxy is ready."
            : "Market data is not configured on the platform API. Add MARKET_DATA_PROVIDER=finnhub plus MARKET_DATA_API_BASE and MARKET_DATA_API_KEY."
    };
}

function getStripeStatus(user) {
    const mode = normalizeStripeMode(process.env.ATLASMARKET_STRIPE_MODE);
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PRICE_ID;
    const defaultCustomerId = process.env.STRIPE_DEFAULT_CUSTOMER_ID;
    const fundingUrl = process.env.ATLASMARKET_STRIPE_FUNDING_URL;
    const effectiveCustomerId = user?.stripeCustomerId || defaultCustomerId;
    const checkoutReady = mode === "billing" && Boolean(secretKey && priceId);
    const customerPortalReady = Boolean(secretKey && effectiveCustomerId);
    const fundingSessionReady = mode === "funding" && Boolean(fundingUrl);
    const ready = checkoutReady || customerPortalReady || fundingSessionReady;

    return {
        enabled: mode !== "disabled",
        mode,
        ready,
        checkoutReady,
        customerPortalReady,
        fundingSessionReady,
        authenticated: Boolean(user),
        customerLinked: Boolean(user?.stripeCustomerId),
        message: ready
            ? "Stripe server endpoints are ready."
            : "Configure STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_DEFAULT_CUSTOMER_ID, and ATLASMARKET_STRIPE_FUNDING_URL as needed for your chosen Stripe flow."
    };
}

async function createStripeCheckoutSession(body, user) {
    const inline = body.priceData; // { name, unitAmount (cents), currency, recurring? }
    // Inline priceData wins — inline request should never be mixed with a stored Price ID.
    const priceId = inline ? null : (body.priceId || process.env.STRIPE_PRICE_ID);

    if (!priceId && !inline) {
        throw new Error("Provide priceId, set STRIPE_PRICE_ID, or pass priceData { name, unitAmount, currency, recurring? }.");
    }

    const params = new URLSearchParams();
    const mode = body.mode || (inline?.recurring ? "subscription" : priceId ? "subscription" : "payment");
    const customerId = body.customerId || user?.stripeCustomerId || process.env.STRIPE_DEFAULT_CUSTOMER_ID;

    params.set("mode", mode);
    if (priceId) {
        params.set("line_items[0][price]", priceId);
    } else if (inline) {
        params.set("line_items[0][price_data][currency]", String(inline.currency || "usd"));
        params.set("line_items[0][price_data][product_data][name]", String(inline.name || "AtlasMarket"));
        params.set("line_items[0][price_data][unit_amount]", String(inline.unitAmount));
        if (inline.recurring) {
            params.set("line_items[0][price_data][recurring][interval]", String(inline.recurring));
        }
    }
    params.set("line_items[0][quantity]", String(body.quantity || 1));
    params.set("success_url", buildAppReturnUrl(body.returnUrl, "success"));
    params.set("cancel_url", buildAppReturnUrl(body.returnUrl, "cancel"));

    if (customerId) {
        params.set("customer", customerId);
    } else if (body.customerEmail || user?.email) {
        params.set("customer_email", body.customerEmail || user.email);
    }

    if (user?.id) {
        params.set("client_reference_id", user.id);
        params.set("metadata[user_id]", user.id);
    }

    const session = await stripeRequest("/v1/checkout/sessions", params);

    return {
        id: session.id,
        url: session.url
    };
}

async function createStripeCustomerPortalSession(body, user) {
    const customerId = body.customerId || user?.stripeCustomerId || process.env.STRIPE_DEFAULT_CUSTOMER_ID;

    if (!customerId) {
        throw new Error("A Stripe customer ID is required before creating Customer Portal sessions.");
    }

    const params = new URLSearchParams();
    params.set("customer", customerId);
    params.set("return_url", buildAppReturnUrl(body.returnUrl, "portal"));

    const session = await stripeRequest("/v1/billing_portal/sessions", params);

    return {
        url: session.url
    };
}

function createStripeFundingSession(body, user) {
    const fundingUrl = process.env.ATLASMARKET_STRIPE_FUNDING_URL || body.url;

    if (!fundingUrl) {
        throw new Error("Set ATLASMARKET_STRIPE_FUNDING_URL on the server or provide a hosted funding URL in the request body.");
    }

    const url = new URL(fundingUrl);

    if (user?.id) {
        url.searchParams.set("atlasUserId", user.id);
    }

    return {
        url: url.toString()
    };
}

async function stripeRequest(endpoint, params) {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error("Set STRIPE_SECRET_KEY on the platform API before using Stripe endpoints.");
    }

    const response = await fetch(`https://api.stripe.com${endpoint}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.error?.message || `Stripe request failed with status ${response.status}.`);
    }

    return payload;
}

function handleStripeWebhook(store, event) {
    if (!event || typeof event !== "object" || !event.type) {
        return { handled: false, reason: "Event payload was empty." };
    }

    const nextStore = store.update((draft) => {
        const summary = applyStripeEventToStore(draft, event);
        appendAuditEvent(draft, {
            type: `stripe.${event.type}`,
            userId: summary.userId || null,
            detail: summary.message
        });
        draft.__response = summary;
        return draft;
    });

    return nextStore.__response;
}

function applyStripeEventToStore(storeData, event) {
    const object = event.data?.object || {};
    let user = null;

    if (object.client_reference_id) {
        user = storeData.users.find((entry) => entry.id === object.client_reference_id) || null;
    }

    if (!user && object.customer) {
        user = storeData.users.find((entry) => entry.stripeCustomerId === object.customer) || null;
    }

    if (!user) {
        const email = normalizeOptionalEmail(object.customer_email || object.customer_details?.email);

        if (email) {
            user = storeData.users.find((entry) => normalizeEmail(entry.email) === email) || null;
        }
    }

    if (!user) {
        return {
            handled: false,
            userId: null,
            message: `No AtlasMarket user matched Stripe event ${event.type}.`
        };
    }

    if (object.customer) {
        user.stripeCustomerId = object.customer;
    }

    if (event.type === "checkout.session.completed") {
        if (object.mode === "subscription" || object.payment_status === "paid") {
            user.entitlements.billing = true;
            user.stripeSubscriptionStatus = "active";
        }
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
        user.stripeCustomerId = object.customer || user.stripeCustomerId;
        user.stripeSubscriptionStatus = object.status || user.stripeSubscriptionStatus;
        user.entitlements.billing = object.status === "active" || object.status === "trialing";
    }

    if (event.type === "customer.subscription.deleted") {
        user.stripeCustomerId = object.customer || user.stripeCustomerId;
        user.stripeSubscriptionStatus = "canceled";
        user.entitlements.billing = false;
    }

    if (event.type === "invoice.payment_failed") {
        user.stripeCustomerId = object.customer || user.stripeCustomerId;
        user.stripeSubscriptionStatus = "past_due";
    }

    if (event.type === "invoice.paid" && user.stripeSubscriptionStatus === "past_due") {
        user.stripeSubscriptionStatus = "active";
        user.entitlements.billing = true;
    }

    user.updatedAt = new Date().toISOString();

    return {
        handled: true,
        userId: user.id,
        message: `Stripe event ${event.type} applied to ${user.email}.`
    };
}

async function fetchProviderQuote(providerSymbol) {
    const response = await fetchProviderJson("/quote", { symbol: providerSymbol });

    if (!response || !Number.isFinite(response.c) || response.c <= 0) {
        return undefined;
    }

    return {
        price: roundPrice(response.c),
        change: Number.isFinite(response.dp) ? roundMetric(response.dp) : computePercentChange(response.pc, response.c),
        previousClose: roundPrice(response.pc || response.c),
        open: roundPrice(response.o || response.c),
        high: roundPrice(response.h || response.c),
        low: roundPrice(response.l || response.c),
        updatedAt: response.t ? new Date(response.t * 1000).toISOString() : new Date().toISOString()
    };
}

async function fetchProviderCandleSeries(providerSymbol, lookbackDays) {
    const now = Math.floor(Date.now() / 1000);
    const from = now - (lookbackDays * 86400);
    const response = await fetchProviderJson("/stock/candle", {
        symbol: providerSymbol,
        resolution: "D",
        from: String(from),
        to: String(now)
    });

    if (!response || response.s !== "ok" || !Array.isArray(response.c) || response.c.length === 0) {
        return [];
    }

    return response.c.slice(-12).map((value) => roundPrice(value));
}

async function fetchProviderNews(providerSymbol) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (6 * 86400000));
    const response = await fetchProviderJson("/company-news", {
        symbol: providerSymbol,
        from: formatDate(startDate),
        to: formatDate(endDate)
    }, process.env.NEWS_DATA_API_BASE || process.env.MARKET_DATA_API_BASE);

    if (!Array.isArray(response)) {
        return [];
    }

    return response.slice(0, 3).map((item) => ({
        time: formatTimestamp(new Date(item.datetime * 1000).toISOString()),
        headline: item.headline,
        catalyst: item.summary ? item.summary.slice(0, 92) : "Live company news",
        tone: "neutral"
    }));
}

async function fetchProviderJson(pathname, query, baseOverride) {
    const provider = (process.env.MARKET_DATA_PROVIDER || "").trim().toLowerCase();

    if (provider !== "finnhub") {
        return undefined;
    }

    const apiBase = baseOverride || process.env.MARKET_DATA_API_BASE;
    const apiKey = process.env.MARKET_DATA_API_KEY;

    if (!apiBase || !apiKey) {
        return undefined;
    }

    // IMPORTANT: new URL("/quote", "https://finnhub.io/api/v1/") returns
    // "https://finnhub.io/quote" because a leading-slash pathname is treated
    // as root-absolute. Strip the leading slash so the api-base path segment
    // is preserved.
    const relativePath = pathname.replace(/^\/+/, "");
    const url = new URL(relativePath, ensureTrailingSlash(apiBase));
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, value);
        }
    });
    url.searchParams.set("token", apiKey);

    const cacheKey = url.toString();
    const cached = getCachedValue(cacheKey);

    if (cached) {
        return cached;
    }

    let response;
    try {
        response = await fetch(cacheKey);
    } catch (error) {
        console.warn("[market-proxy] network error for", pathname, error.message);
        return undefined;
    }

    if (!response.ok) {
        console.warn("[market-proxy] non-ok", response.status, "for", pathname);
        return undefined;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        console.warn("[market-proxy] non-json response for", pathname, "content-type:", contentType);
        return undefined;
    }

    try {
        const payload = await response.json();
        setCachedValue(cacheKey, payload);
        return payload;
    } catch (error) {
        console.warn("[market-proxy] JSON parse error for", pathname, error.message);
        return undefined;
    }
}

function verifyStripeWebhook(rawBody, signatureHeader) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret || typeof signatureHeader !== "string" || !rawBody) {
        return false;
    }

    const parsed = signatureHeader.split(",").reduce((accumulator, part) => {
        const [key, value] = part.split("=");

        if (key && value) {
            accumulator[key] = accumulator[key] || [];
            accumulator[key].push(value);
        }

        return accumulator;
    }, {});

    const timestamp = parsed.t?.[0];
    const signatures = parsed.v1 || [];

    if (!timestamp || signatures.length === 0) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(`${timestamp}.${rawBody}`, "utf8")
        .digest("hex");

    return signatures.some((signature) => timingSafeEqual(signature, expectedSignature));
}

function createSessionRecord(userId) {
    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (SESSION_TTL_HOURS * 3600000));

    return {
        token,
        record: {
            id: generateId("session"),
            userId,
            tokenHash: hashToken(token),
            createdAt: now.toISOString(),
            lastSeenAt: now.toISOString(),
            expiresAt: expiresAt.toISOString()
        }
    };
}

function buildAuthResponse(user, token, session) {
    return {
        token,
        user: sanitizeUser(user),
        session: sanitizeSession(session)
    };
}

function sanitizeUser(user) {
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        timezone: user.timezone,
        roles: Array.isArray(user.roles) ? user.roles : [],
        stripeCustomerId: user.stripeCustomerId || null,
        stripeSubscriptionStatus: user.stripeSubscriptionStatus || "inactive",
        entitlements: user.entitlements || createDefaultEntitlements(),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
}

function sanitizeSession(session) {
    return {
        id: session.id,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt
    };
}

function createDefaultEntitlements() {
    return {
        paperTrading: true,
        marketData: false,
        billing: false
    };
}

function appendAuditEvent(storeData, input) {
    storeData.auditEvents.unshift({
        id: generateId("audit"),
        type: input.type,
        userId: input.userId || null,
        ip: input.ip || null,
        detail: input.detail,
        createdAt: new Date().toISOString()
    });

    if (storeData.auditEvents.length > 500) {
        storeData.auditEvents = storeData.auditEvents.slice(0, 500);
    }
}

function pruneExpiredSessions(storeData) {
    const beforeCount = storeData.sessions.length;
    const now = Date.now();
    storeData.sessions = storeData.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
    return beforeCount !== storeData.sessions.length;
}

function readSessionToken(req) {
    const header = req.headers.authorization;

    if (typeof header === "string" && header.startsWith("Bearer ")) {
        return header.slice(7).trim();
    }

    const alternate = req.headers["x-atlas-session"];
    return typeof alternate === "string" && alternate.trim() ? alternate.trim() : null;
}

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
    const actualHash = hashPassword(password, salt);
    return timingSafeEqual(actualHash, expectedHash);
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function parseBenchmarkSpecs(rawValue) {
    const provided = parseCsv(rawValue).map((value) => {
        const [countryCode, providerSymbol] = value.split(":");
        return countryCode && providerSymbol
            ? { countryCode, providerSymbol }
            : null;
    }).filter(Boolean);

    if (provided.length > 0) {
        return provided;
    }

    return Object.entries(COUNTRY_BENCHMARK_SYMBOLS).map(([countryCode, providerSymbol]) => ({
        countryCode,
        providerSymbol
    }));
}

function resolveProviderSymbol(atlasSymbol) {
    if (!atlasSymbol) return undefined;
    const mapped = ATLAS_PROVIDER_SYMBOLS[atlasSymbol];
    if (mapped) return mapped;
    // Accept plain alphanumeric tickers (e.g. AAPL, BRK.B, TSM, TSMC) and pass
    // them straight through to the provider. Length 1-6 plus optional ".X".
    if (/^[A-Z0-9]{1,6}(\.[A-Z]{1,3})?$/.test(atlasSymbol.toUpperCase())) {
        return atlasSymbol.toUpperCase();
    }
    return undefined;
}

function parseCsv(rawValue) {
    if (!rawValue) {
        return [];
    }

    return rawValue.split(",").map((value) => value.trim()).filter(Boolean);
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeOptionalEmail(value) {
    const normalized = normalizeEmail(value);
    return normalized || null;
}

function assertEmail(email) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw createHttpError(400, "Provide a valid email address.");
    }
}

function assertPassword(password) {
    if (typeof password !== "string" || password.length < 8) {
        throw createHttpError(400, "Provide a password with at least 8 characters.");
    }
}

function isSerializableWorkspace(value) {
    return Array.isArray(value) || (value && typeof value === "object");
}

function normalizeStripeMode(mode) {
    return mode === "billing" || mode === "funding"
        ? mode
        : "disabled";
}

function buildAppReturnUrl(returnUrl, state) {
    const baseUrl = returnUrl || process.env.ATLASMARKET_PUBLIC_APP_URL || "http://localhost:19006";
    const url = new URL(baseUrl);
    url.searchParams.set("stripe", state);
    return url.toString();
}

function computeWeeklyChange(series, latestPrice) {
    if (series.length < 2) {
        return 0;
    }

    const comparison = series[Math.max(0, series.length - 6)] || series[0];
    return computePercentChange(comparison, latestPrice);
}

function computePercentChange(previous, current) {
    if (!previous) {
        return 0;
    }

    return roundMetric(((current - previous) / previous) * 100);
}

function roundPrice(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

function roundMetric(value) {
    return Math.round(Number(value || 0) * 10) / 10;
}

function formatDate(value) {
    return value.toISOString().slice(0, 10);
}

function formatTimestamp(value) {
    return new Date(value).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit"
    });
}

function ensureTrailingSlash(value) {
    return value.endsWith("/") ? value : `${value}/`;
}

function getCachedValue(key) {
    const cached = responseCache.get(key);

    if (!cached) {
        return undefined;
    }

    if (cached.expiresAt <= Date.now()) {
        responseCache.delete(key);
        return undefined;
    }

    return cached.value;
}

function setCachedValue(key, value) {
    responseCache.set(key, {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS
    });
}

async function readJsonBody(req) {
    const raw = await readRawBody(req);
    return raw ? JSON.parse(raw) : {};
}

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let totalBytes = 0;

        req.on("data", (chunk) => {
            totalBytes += chunk.length;

            if (totalBytes > MAX_BODY_BYTES) {
                reject(createHttpError(413, "Request body exceeded the 1 MB limit."));
                req.destroy();
                return;
            }

            chunks.push(Buffer.from(chunk));
        });

        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

function json(res, statusCode, payload) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8"
    });
    res.end(JSON.stringify(payload));
}

function writeCorsHeaders(res, origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Stripe-Signature, X-Atlas-Session");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,OPTIONS");
}

function timingSafeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));

    return leftBuffer.length === rightBuffer.length
        && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getRequestIp(req) {
    const forwarded = req.headers["x-forwarded-for"];

    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
    }

    return req.socket.remoteAddress || null;
}

function generateId(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const content = fs.readFileSync(filePath, "utf8");

    content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
            return;
        }

        const separatorIndex = trimmed.indexOf("=");

        if (separatorIndex <= 0) {
            return;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");

        if (!(key in process.env)) {
            process.env[key] = value;
        }
    });
}
