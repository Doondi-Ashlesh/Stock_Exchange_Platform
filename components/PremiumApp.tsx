import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";

import Globe, { GlobeMethods } from "react-globe.gl";
import { Color, MeshPhongMaterial } from "three";

import { defaultSnapshot, metricDescriptors } from "../utils/atlasMarketData";
import { buildGlobalCoverageCountries } from "../utils/atlasWorldCoverage";
import { buildAtlasCountryPolygons } from "../utils/atlasGlobeCountryPolygons";

// ============================================================================
// Design tokens — single source of truth for the new premium look.
// Palette inspired by the reference: deep indigo canvas, electric violet
// accents, mint for gains, coral for losses, glass cards with soft glows.
// ============================================================================

const T = {
    // Surfaces — true black canvas with whisper-warm raised surfaces.
    canvas: "#050505",
    surface: "#0E0E0E",
    surfaceAlt: "#161616",
    surfaceRaised: "#1F1E1C",
    glass: "rgba(14, 14, 14, 0.72)",
    // Borders
    border: "rgba(255, 255, 255, 0.06)",
    borderStrong: "rgba(255, 255, 255, 0.10)",
    borderGlow: "rgba(249, 115, 22, 0.50)",
    // Text
    text: "#FAFAFA",
    textMuted: "#A3A3A3",
    textSubtle: "#6B6B6B",
    // Brand — volt orange, the signature color.
    accent: "#F97316", // orange-500
    accentStrong: "#FB923C", // orange-400
    accentSoft: "rgba(249, 115, 22, 0.14)",
    accentGlow: "rgba(249, 115, 22, 0.45)",
    focus: "#EA580C", // orange-600, gradient partner
    // Semantic — keep green for gains / red for losses; amber repurposed
    // as a hotter variant of the brand.
    positive: "#22C55E",
    positiveSoft: "rgba(34, 197, 94, 0.16)",
    negative: "#EF4444",
    negativeSoft: "rgba(239, 68, 68, 0.16)",
    warning: "#FBBF24",
    info: "#60A5FA",
    // Font
    font: `Inter, "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`,
    mono: `"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace`
} as const;

// ============================================================================
// Utility functions
// ============================================================================

const fmtMoney = (v: number, digits = 2) =>
    `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

const fmtSignedMoney = (v: number) => `${v >= 0 ? "+" : "-"}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPct = (v: number, digits = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;

const fmtCompact = (v: number) => {
    if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
};

// Generate a realistic-looking price walk seeded by a symbol string.
function seedRandom(seed: string) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return () => {
        h += 0x9e3779b9;
        let t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function priceWalk(seed: string, start: number, n: number, vol = 0.012, drift = 0.0008) {
    const rand = seedRandom(seed);
    const out: number[] = [start];
    for (let i = 1; i < n; i++) {
        const r = (rand() - 0.5) * 2;
        const last = out[i - 1];
        out.push(+(last * (1 + drift + r * vol)).toFixed(2));
    }
    return out;
}

// ============================================================================
// Live feed hook — talks to the platform-api /v1/market/feed endpoint.
// Falls back to demo data silently if the backend is unreachable.
// ============================================================================

// Tailwind-style breakpoints.
function useViewport() {
    const get = () => (typeof window === "undefined" ? 1440 : window.innerWidth);
    const [w, setW] = useState(get);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const on = () => setW(window.innerWidth);
        window.addEventListener("resize", on);
        return () => window.removeEventListener("resize", on);
    }, []);
    return { w, isNarrow: w < 1100, isTiny: w < 760 };
}

const API_BASE = "http://localhost:8787";
const SESSION_KEY = "atlas_session_token";

// ============================================================================
// Auth — talks to /v1/auth/* and persists a bearer token in localStorage.
// ============================================================================

interface AuthUser {
    id: string;
    email: string;
    displayName: string;
    roles: string[];
    stripeCustomerId: string | null;
    stripeSubscriptionStatus?: string;
}

interface AuthState {
    user: AuthUser | null;
    token: string | null;
    loading: boolean;
    error: string | null;
}

function useAuth() {
    const [state, setState] = useState<AuthState>({ user: null, token: null, loading: true, error: null });

    useEffect(() => {
        const token = typeof window !== "undefined" ? window.localStorage.getItem(SESSION_KEY) : null;
        if (!token) { setState(s => ({ ...s, loading: false })); return; }
        (async () => {
            try {
                const r = await fetch(`${API_BASE}/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
                if (!r.ok) throw new Error("invalid session");
                const data = await r.json();
                setState({ user: data.user, token, loading: false, error: null });
            } catch {
                window.localStorage.removeItem(SESSION_KEY);
                setState({ user: null, token: null, loading: false, error: null });
            }
        })();
    }, []);

    const submit = async (path: "login" | "register", body: any) => {
        setState(s => ({ ...s, loading: true, error: null }));
        try {
            const r = await fetch(`${API_BASE}/v1/auth/${path}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.message || data.error?.message || `Request failed (${r.status})`);
            window.localStorage.setItem(SESSION_KEY, data.token);
            setState({ user: data.user, token: data.token, loading: false, error: null });
            return true;
        } catch (e: any) {
            setState(s => ({ ...s, loading: false, error: e.message }));
            return false;
        }
    };

    const logout = async () => {
        try {
            if (state.token) await fetch(`${API_BASE}/v1/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${state.token}` } });
        } catch { /* best-effort */ }
        window.localStorage.removeItem(SESSION_KEY);
        setState({ user: null, token: null, loading: false, error: null });
    };

    return {
        ...state,
        login: (email: string, password: string) => submit("login", { email, password }),
        register: (email: string, password: string, name: string) => submit("register", { email, password, name }),
        logout
    };
}

// Authed-fetch helper: adds Authorization header automatically.
async function authedFetch(token: string | null, path: string, init: RequestInit = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as Record<string, string> || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}${path}`, { ...init, headers });
}

// Kick off a Stripe Checkout session and redirect. Uses inline price_data so
// we don't need a pre-created STRIPE_PRICE_ID — the price is defined per call.
// We encode the intent (action=deposit&amount=…) in the return URL so the
// client can credit the paper book when Stripe bounces us back.
async function startStripeCheckout(token: string | null, opts: {
    name: string; amountCents: number; currency?: string; recurring?: "month" | "year"; mode?: "payment" | "subscription"; returnUrl?: string; action?: "deposit" | "upgrade";
}) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const baseReturn = opts.returnUrl || origin;
    const qp = new URLSearchParams();
    qp.set("stripe", "return");
    if (opts.action) qp.set("action", opts.action);
    qp.set("amount", String(opts.amountCents));
    const sep = baseReturn.includes("?") ? "&" : "?";
    const returnUrl = `${baseReturn}${sep}${qp.toString()}`;
    const body = {
        priceData: { name: opts.name, unitAmount: opts.amountCents, currency: opts.currency || "usd", recurring: opts.recurring },
        mode: opts.mode || (opts.recurring ? "subscription" : "payment"),
        returnUrl
    };
    const r = await authedFetch(token, "/v1/payments/stripe/checkout-session", { method: "POST", body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok || !data.url) throw new Error(data.message || data.error?.message || "Could not create Stripe Checkout session.");
    window.location.href = data.url;
}

// On first mount (after signing in), inspect the URL for a Stripe return.
// If the user came back from a successful deposit Checkout, credit their
// paper cash and strip the query string so a hard-refresh doesn't re-credit.
function useStripeReturn(token: string | null, workspace: Workspace, onChange: () => void) {
    const applied = useRef(false);
    useEffect(() => {
        if (applied.current || !token || typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const stripe = params.get("stripe");
        if (stripe !== "return") return;
        applied.current = true;
        // Stripe Checkout's default success_url lands with a session id; we use
        // a simpler contract: if the user returned to ?stripe=return&action=…
        // (and it wasn't ?cancel=1) we treat it as a confirmed deposit.
        const cancelled = params.get("status") === "cancel" || params.get("cancel") === "1";
        const action = params.get("action");
        const amountCents = Number(params.get("amount") || 0);
        const dollars = amountCents / 100;
        (async () => {
            if (cancelled) {
                pushToast("info", "Stripe Checkout cancelled — no charge was made.");
            } else if (action === "deposit" && dollars > 0) {
                const newCash = (workspace.cashBalance || 0) + dollars;
                const draft: Workspace = {
                    cashBalance: newCash,
                    positions: workspace.positions || [],
                    orders: workspace.orders || [],
                    fills: workspace.fills || [],
                    equitySnapshots: [...(workspace.equitySnapshots || []), { t: new Date().toISOString(), v: +(newCash).toFixed(2) + (workspace.positions || []).reduce((s, p) => s + p.averagePrice * p.quantity, 0) }].slice(-365)
                };
                try {
                    const r = await authedFetch(token, "/v1/workspaces/paper", { method: "PUT", body: JSON.stringify({ workspace: draft }) });
                    if (!r.ok) throw new Error("Could not credit deposit.");
                    pushToast("ok", `Deposit of $${dollars.toFixed(2)} credited to paper cash.`);
                    onChange();
                } catch (e: any) {
                    pushToast("err", e.message || "Stripe return error");
                }
            } else if (action === "upgrade") {
                pushToast("ok", "Subscription active — welcome to Atlas Pro.");
            } else {
                pushToast("ok", "Stripe Checkout complete.");
            }
            // Strip the query so reloading can't re-apply the credit.
            const clean = window.location.pathname;
            window.history.replaceState({}, "", clean);
        })();
    }, [token]);
}

// ============================================================================
// News — /v1/market/assets/:symbol returns provider news (Finnhub). We wrap
// it in a hook that polls every minute for a given symbol.
// ============================================================================

interface NewsHeadline { headline: string; source: string; summary?: string; url?: string; time: string; category?: string; }

// Full asset detail (quote + priceSeries + headlines) from the gateway.
// Polled every 15 s — the backend talks to Finnhub and caches.
interface AssetDetail {
    price: number;
    change: number;
    previousClose: number;
    open: number;
    high: number;
    low: number;
    updatedAt: string;
    priceSeries: number[];
    headlines: NewsHeadline[];
}

function useAssetDetail(symbol: string | null) {
    const [detail, setDetail] = useState<AssetDetail | null>(null);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!symbol) return;
        let cancelled = false;
        const pull = async () => {
            setLoading(true);
            try {
                const r = await fetch(`${API_BASE}/v1/market/assets/${encodeURIComponent(symbol)}`);
                const data = await r.json();
                if (cancelled) return;
                if (data?.detail) {
                    const d = data.detail;
                    setDetail({
                        price: d.price, change: d.change, previousClose: d.previousClose,
                        open: d.open, high: d.high, low: d.low, updatedAt: d.updatedAt,
                        priceSeries: Array.isArray(d.priceSeries) ? d.priceSeries : [],
                        headlines: Array.isArray(d.headlines) ? d.headlines : []
                    });
                } else {
                    setDetail(null);
                }
            } catch { /* ignore */ }
            if (!cancelled) setLoading(false);
        };
        pull();
        const id = window.setInterval(pull, 15000);
        return () => { cancelled = true; window.clearInterval(id); };
    }, [symbol]);
    return { detail, loading };
}

function useNews(symbol: string | null) {
    const [headlines, setHeadlines] = useState<NewsHeadline[]>([]);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!symbol) return;
        let cancelled = false;
        const pull = async () => {
            setLoading(true);
            try {
                const r = await fetch(`${API_BASE}/v1/market/assets/${encodeURIComponent(symbol)}`);
                const data = await r.json();
                if (cancelled) return;
                const list: any[] = data?.detail?.headlines || [];
                setHeadlines(list.slice(0, 20).map((h: any): NewsHeadline => ({
                    headline: h.headline || h.title || "",
                    source: h.source || "Wire",
                    summary: h.summary,
                    url: h.url,
                    time: h.time || h.datetime || new Date().toISOString(),
                    category: h.category
                })));
            } catch { /* ignore */ }
            if (!cancelled) setLoading(false);
        };
        pull();
        const id = window.setInterval(pull, 60000);
        return () => { cancelled = true; window.clearInterval(id); };
    }, [symbol]);
    return { headlines, loading };
}

// ============================================================================
// Workspace — the user's paper-trading book, persisted server-side.
// ============================================================================

interface Position { symbol: string; quantity: number; averagePrice: number; openedAt: string; }
interface Order { id: string; symbol: string; side: "Buy" | "Sell"; type: "Market" | "Limit" | "Stop"; quantity: number; limitPrice: number | null; stopPrice: number | null; status: "Working" | "Filled" | "Cancelled"; placedAt: string; updatedAt: string; averageFillPrice: number | null; filledQuantity: number; }
interface Fill { id: string; orderId: string; symbol: string; side: "Buy" | "Sell"; quantity: number; price: number; filledAt: string; }
interface EquitySnapshot { t: string; v: number; }
interface Workspace { cashBalance: number; positions: Position[]; orders: Order[]; fills: Fill[]; equitySnapshots: EquitySnapshot[]; }

const EMPTY_WORKSPACE: Workspace = { cashBalance: 50000, positions: [], orders: [], fills: [], equitySnapshots: [] };

function useWorkspace(token: string | null) {
    const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE);
    const [loading, setLoading] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const r = await authedFetch(token, "/v1/workspaces/paper");
                const data = await r.json();
                if (cancelled) return;
                const raw = data.workspace;
                if (raw && typeof raw === "object" && !Array.isArray(raw)) {
                    setWorkspace({
                        cashBalance: typeof raw.cashBalance === "number" ? raw.cashBalance : 50000,
                        positions: Array.isArray(raw.positions) ? raw.positions : [],
                        orders: Array.isArray(raw.orders) ? raw.orders : [],
                        fills: Array.isArray(raw.fills) ? raw.fills : [],
                        equitySnapshots: Array.isArray(raw.equitySnapshots) ? raw.equitySnapshots : []
                    });
                }
            } catch { /* keep empty fallback */ }
            if (!cancelled) setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [token, tick]);

    const refresh = () => setTick(t => t + 1);
    return { workspace, setWorkspace, loading, refresh };
}

// ============================================================================
// Toast — tiny stackable notifier.
// ============================================================================

interface Toast { id: number; kind: "ok" | "err" | "info"; message: string; }
const toastBus: { subs: ((t: Toast) => void)[]; next: number } = { subs: [], next: 1 };
function pushToast(kind: Toast["kind"], message: string) {
    const t: Toast = { id: toastBus.next++, kind, message };
    toastBus.subs.forEach(fn => fn(t));
    // Also record it in the persistent notification feed.
    if (typeof pushNotif === "function") pushNotif(kind, message);
}
// Notifications — persistent feed of events. Shares toast kinds so pushing a
// toast also adds it to the bell.
interface NotifItem { id: number; kind: Toast["kind"]; message: string; at: string; }
const notifBus: { items: NotifItem[]; subs: ((list: NotifItem[]) => void)[]; next: number } = { items: [], subs: [], next: 1 };
function pushNotif(kind: Toast["kind"], message: string) {
    const n: NotifItem = { id: notifBus.next++, kind, message, at: new Date().toISOString() };
    notifBus.items = [n, ...notifBus.items].slice(0, 40);
    notifBus.subs.forEach(fn => fn(notifBus.items));
}

function NotificationBell({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
    const [items, setItems] = useState<NotifItem[]>(notifBus.items);
    const [unread, setUnread] = useState(0);
    useEffect(() => {
        const fn = (list: NotifItem[]) => { setItems(list); setUnread(u => u + 1); };
        notifBus.subs.push(fn);
        return () => { notifBus.subs = notifBus.subs.filter(x => x !== fn); };
    }, []);
    const color = (k: Toast["kind"]) => k === "ok" ? T.positive : k === "err" ? T.negative : T.accent;
    return (
        <div style={{ position: "relative" }}>
            <button style={topBtn} onClick={() => { setOpen(!open); setUnread(0); }}>
                🔔
                {unread > 0 ? <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 999, background: T.accent, boxShadow: `0 0 8px ${T.accent}` }} /> : null}
            </button>
            {open ? (
                <div style={{
                    position: "absolute", top: "100%", right: 0, marginTop: 8,
                    width: 340, maxHeight: 420, overflowY: "auto",
                    background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
                    boxShadow: "0 16px 40px rgba(0,0,0,0.5)", zIndex: 40, padding: 12
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Notifications</div>
                        <button onClick={() => { notifBus.items = []; notifBus.subs.forEach(fn => fn([])); }} style={{ background: "transparent", border: 0, color: T.textMuted, fontSize: 11, cursor: "pointer", fontFamily: T.font }}>Clear</button>
                    </div>
                    {items.length === 0 ? (
                        <div style={{ padding: 24, textAlign: "center", color: T.textSubtle, fontSize: 12.5 }}>
                            <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.3 }}>∅</div>
                            You're all caught up.
                        </div>
                    ) : items.map(n => (
                        <div key={n.id} style={{ display: "flex", gap: 10, padding: "10px 2px", borderTop: n.id !== items[0].id ? `1px solid ${T.border}` : "none" }}>
                            <span style={{ width: 8, minWidth: 8, height: 8, borderRadius: 999, background: color(n.kind), marginTop: 6, boxShadow: `0 0 6px ${color(n.kind)}` }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ color: T.text, fontSize: 13, lineHeight: 1.4 }}>{n.message}</div>
                                <div style={{ color: T.textSubtle, fontSize: 11, marginTop: 2 }}>{new Date(n.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function ToastRack() {
    const [items, setItems] = useState<Toast[]>([]);
    useEffect(() => {
        const fn = (t: Toast) => {
            setItems(list => [...list, t]);
            window.setTimeout(() => setItems(list => list.filter(x => x.id !== t.id)), 4200);
        };
        toastBus.subs.push(fn);
        return () => { toastBus.subs = toastBus.subs.filter(x => x !== fn); };
    }, []);
    const color = (k: Toast["kind"]) => k === "ok" ? T.positive : k === "err" ? T.negative : T.accent;
    return (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1000, display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(t => (
                <div key={t.id} style={{
                    minWidth: 260, maxWidth: 380,
                    background: T.surface, border: `1px solid ${color(t.kind)}`,
                    color: T.text, padding: "10px 14px", borderRadius: 10, fontSize: 13,
                    boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px ${color(t.kind)}33`,
                    display: "flex", alignItems: "center", gap: 10
                }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: color(t.kind), boxShadow: `0 0 8px ${color(t.kind)}` }} />
                    {t.message}
                </div>
            ))}
        </div>
    );
}
const LIVE_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "META", "AMZN", "AMD", "NFLX", "SPY", "QQQ", "DIS"];

interface LiveQuote {
    price: number;
    change: number;
    previousClose: number;
    open: number;
    high: number;
    low: number;
}

function useLiveFeed(symbols: string[]) {
    const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
    const [status, setStatus] = useState<"loading" | "live" | "demo" | "error">("loading");
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const url = `${API_BASE}/v1/market/feed?mode=live&symbols=${symbols.join(",")}&benchmarks=US:SPY`;
        const pull = async () => {
            try {
                const r = await fetch(url);
                if (!r.ok) throw new Error(String(r.status));
                const payload = await r.json();
                if (cancelled) return;
                setStatus(payload.status === "live" ? "live" : payload.status || "demo");
                setUpdatedAt(payload.updatedAt || new Date().toISOString());
                if (payload.assetQuotes) setQuotes(payload.assetQuotes);
            } catch {
                if (cancelled) return;
                setStatus("error");
            }
        };
        pull();
        const id = window.setInterval(pull, 15000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [symbols.join(",")]);

    return { quotes, status, updatedAt };
}

// ============================================================================
// Atoms
// ============================================================================

function Card({ style, children, accent }: { style?: CSSProperties; children: ReactNode; accent?: boolean }) {
    return (
        <div style={{
            background: accent ? `linear-gradient(135deg, ${T.accent} 0%, #9A3412 100%)` : T.surface,
            border: `1px solid ${accent ? "transparent" : T.border}`,
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px rgba(0,0,0,0.25)",
            ...style
        }}>{children}</div>
    );
}

function Eyebrow({ children }: { children: ReactNode }) {
    return <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 2, color: T.textMuted, textTransform: "uppercase" }}>{children}</div>;
}

function Delta({ value, unit = "%" }: { value: number; unit?: string }) {
    const up = value >= 0;
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 12, fontWeight: 700,
            color: up ? T.positive : T.negative,
            background: up ? T.positiveSoft : T.negativeSoft,
            padding: "3px 8px", borderRadius: 999,
            fontVariantNumeric: "tabular-nums"
        }}>
            <span style={{ fontSize: 9 }}>{up ? "▲" : "▼"}</span>
            {Math.abs(value).toFixed(2)}{unit}
        </span>
    );
}

function Pill({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
    return (
        <button onClick={onClick} style={{
            background: active ? T.accentSoft : "transparent",
            border: `1px solid ${active ? T.accent : T.border}`,
            color: active ? T.accentStrong : T.textMuted,
            padding: "6px 12px", borderRadius: 8,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            fontFamily: T.font
        }}>{children}</button>
    );
}

// ============================================================================
// Sidebar
// ============================================================================

type PageId = "dashboard" | "markets" | "trade" | "portfolio" | "globe" | "account";

const NAV: { id: PageId; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "▦" },
    { id: "markets", label: "Markets", icon: "◈" },
    { id: "trade", label: "Trade", icon: "⇄" },
    { id: "portfolio", label: "Portfolio", icon: "◉" },
    { id: "globe", label: "Globe", icon: "◎" },
    { id: "account", label: "Account", icon: "◐" }
];

function Sidebar({ page, setPage, user, onLogout }: { page: PageId; setPage: (p: PageId) => void; user?: AuthUser | null; onLogout?: () => void }) {
    return (
        <aside style={{
            width: 240, padding: "20px 16px", borderRight: `1px solid ${T.border}`,
            background: T.canvas,
            display: "flex", flexDirection: "column", gap: 16,
            position: "sticky", top: 0, height: "100vh",
            overflowY: "auto", overflowX: "hidden",
            boxSizing: "border-box"
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px" }}>
                <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: `linear-gradient(135deg, ${T.accent}, ${T.focus})`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, color: "#fff", fontSize: 16, boxShadow: `0 6px 20px ${T.accentGlow}`
                }}>A</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: T.text, letterSpacing: -0.3 }}>Atlas<span style={{ color: T.accent }}>Market</span></div>
            </div>

            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ ...nav.section, marginTop: 4 }}>Main</div>
                {NAV.slice(0, 3).map((n) => <NavItem key={n.id} item={n} active={page === n.id} onClick={() => setPage(n.id)} />)}
                <div style={nav.section}>Workspace</div>
                {NAV.slice(3).map((n) => <NavItem key={n.id} item={n} active={page === n.id} onClick={() => setPage(n.id)} />)}
            </nav>

            <div style={{ flex: 1 }} />

            <div style={{
                background: `linear-gradient(135deg, ${T.accent} 0%, ${T.focus} 100%)`,
                borderRadius: 14, padding: 16, color: "#fff",
                boxShadow: `0 12px 32px ${T.accentGlow}`
            }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9, letterSpacing: 1.5 }}>UPGRADE</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6, lineHeight: 1.3 }}>Unlock Atlas Pro</div>
                <div style={{ fontSize: 11.5, marginTop: 4, opacity: 0.85, lineHeight: 1.4 }}>Real-time L2 data, AI signals, options chains.</div>
                <button onClick={() => setPage("account")} style={{
                    marginTop: 12, width: "100%", padding: "8px 12px",
                    background: "#fff", color: "#1F0A00", border: 0, borderRadius: 8,
                    fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: T.font
                }}>Go Pro</button>
            </div>

            {user ? (
                <div style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 8px",
                    borderTop: `1px solid ${T.border}`
                }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: 999,
                        background: `linear-gradient(135deg, ${T.accent}, ${T.focus})`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, color: "#fff", fontSize: 13
                    }}>{user.displayName.charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: T.text, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.displayName}</span>
                            {user.stripeSubscriptionStatus === "active" || user.stripeSubscriptionStatus === "trialing" ? (
                                <span style={{
                                    padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
                                    background: `linear-gradient(135deg, ${T.accent}, ${T.focus})`, color: "#fff"
                                }}>PRO</span>
                            ) : null}
                        </div>
                        <div style={{ color: T.textSubtle, fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
                    </div>
                    <button onClick={onLogout} title="Sign out" style={{
                        background: "transparent", border: `1px solid ${T.border}`,
                        color: T.textMuted, borderRadius: 8, padding: "6px 8px",
                        cursor: "pointer", fontFamily: T.font, fontSize: 11
                    }}>⎋</button>
                </div>
            ) : null}
        </aside>
    );
}

const nav = {
    section: { fontSize: 10, letterSpacing: 2, color: T.textSubtle, fontWeight: 700, padding: "16px 10px 6px" } as CSSProperties
};

function NavItem({ item, active, onClick }: { item: typeof NAV[number]; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 12px", borderRadius: 10, border: 0, cursor: "pointer",
            background: active ? T.accentSoft : "transparent",
            color: active ? T.text : T.textMuted,
            fontWeight: active ? 600 : 500, fontSize: 13.5, fontFamily: T.font,
            textAlign: "left",
            transition: "background .15s"
        }}>
            <span style={{
                width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center",
                color: active ? T.accentStrong : T.textSubtle, fontSize: 14
            }}>{item.icon}</span>
            {item.label}
            {active ? <span style={{ marginLeft: "auto", width: 4, height: 4, background: T.accent, borderRadius: 999, boxShadow: `0 0 8px ${T.accent}` }} /> : null}
        </button>
    );
}

// ============================================================================
// Top bar
// ============================================================================

function TopBar({ balance, status, updatedAt, user, onGotoTrade }: { balance: number; status: string; updatedAt: string | null; user?: AuthUser | null; onGotoTrade: (sym: string) => void }) {
    const statusColor = status === "live" ? T.positive : status === "demo" ? T.warning : T.negative;
    const statusLabel = status === "live" ? "LIVE" : status === "demo" ? "DEMO" : status === "loading" ? "…" : "OFFLINE";
    const [q, setQ] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement | null>(null);

    // Global ⌘K / Ctrl+K focus shortcut.
    useEffect(() => {
        const on = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                searchRef.current?.focus();
                setSearchOpen(true);
            }
            if (e.key === "Escape") { setSearchOpen(false); setNotifOpen(false); }
        };
        window.addEventListener("keydown", on);
        return () => window.removeEventListener("keydown", on);
    }, []);

    const universe = ["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "META", "AMZN", "AMD", "NFLX", "SPY", "QQQ", "DIS", "JPM", "V", "MA", "XOM", "WMT", "KO", "PEP", "ORCL", "CRM", "ADBE", "INTC", "BAC", "GS"];
    const nameMap: Record<string, string> = { AAPL: "Apple", MSFT: "Microsoft", NVDA: "NVIDIA", TSLA: "Tesla", GOOGL: "Alphabet", META: "Meta", AMZN: "Amazon", AMD: "AMD", NFLX: "Netflix", SPY: "S&P 500 ETF", QQQ: "Nasdaq 100 ETF", DIS: "Disney", JPM: "JPMorgan", V: "Visa", MA: "Mastercard", XOM: "ExxonMobil", WMT: "Walmart", KO: "Coca-Cola", PEP: "PepsiCo", ORCL: "Oracle", CRM: "Salesforce", ADBE: "Adobe", INTC: "Intel", BAC: "Bank of America", GS: "Goldman Sachs" };
    const matches = q.trim() === "" ? [] : universe
        .filter(s => s.toLowerCase().startsWith(q.toLowerCase()) || (nameMap[s] || "").toLowerCase().includes(q.toLowerCase()))
        .slice(0, 7);

    return (
        <header style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "14px 28px",
            borderBottom: `1px solid ${T.border}`,
            background: T.canvas,
            position: "sticky", top: 0, zIndex: 20,
            backdropFilter: "blur(10px)"
        }}>
            <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 12px",
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 999, fontSize: 12
            }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: statusColor, boxShadow: `0 0 10px ${statusColor}` }} />
                <span style={{ color: T.textMuted, fontWeight: 700, letterSpacing: 1 }}>{statusLabel}</span>
                {updatedAt ? <span style={{ color: T.textSubtle, fontFamily: T.mono, fontSize: 11 }}>{new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> : null}
            </div>

            <div style={{ position: "relative", flex: 1, minWidth: 320, maxWidth: 520 }}>
                <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: T.surface, border: `1px solid ${searchOpen ? T.accent : T.border}`,
                    borderRadius: 10, padding: "8px 14px"
                }}>
                    <span style={{ color: T.textSubtle }}>⌕</span>
                    <input
                        ref={searchRef}
                        value={q}
                        onChange={e => { setQ(e.target.value); setSearchOpen(true); }}
                        onFocus={() => setSearchOpen(true)}
                        onBlur={() => window.setTimeout(() => setSearchOpen(false), 180)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && matches[0]) { onGotoTrade(matches[0]); setQ(""); setSearchOpen(false); }
                        }}
                        placeholder="Search symbols, companies…"
                        style={{ background: "transparent", border: 0, outline: 0, color: T.text, fontSize: 13, flex: 1, fontFamily: T.font }}
                    />
                    <span style={{ color: T.textSubtle, fontSize: 11, fontFamily: T.mono, padding: "2px 6px", border: `1px solid ${T.border}`, borderRadius: 4 }}>⌘K</span>
                </div>
                {searchOpen && matches.length > 0 ? (
                    <div style={{
                        position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6,
                        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10,
                        padding: 6, boxShadow: "0 16px 40px rgba(0,0,0,0.5)", zIndex: 40
                    }}>
                        {matches.map((s, i) => (
                            <button
                                key={s}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => { onGotoTrade(s); setQ(""); setSearchOpen(false); }}
                                style={{
                                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                                    padding: "8px 10px", background: i === 0 ? T.surfaceAlt : "transparent",
                                    border: 0, borderRadius: 8, color: T.text, cursor: "pointer",
                                    fontFamily: T.font, textAlign: "left"
                                }}
                            >
                                <SymbolBadge sym={s} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 13 }}>{s}</div>
                                    <div style={{ color: T.textSubtle, fontSize: 11 }}>{nameMap[s] || s}</div>
                                </div>
                                {i === 0 ? <span style={{ color: T.textSubtle, fontSize: 10, fontFamily: T.mono }}>↵</span> : null}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>

            <div style={{ flex: 1 }} />

            <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 14px",
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 10
            }}>
                <div>
                    <div style={{ fontSize: 10, color: T.textSubtle, fontWeight: 700, letterSpacing: 1 }}>BALANCE</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(balance)}</div>
                </div>
                <button style={{
                    padding: "7px 14px",
                    background: `linear-gradient(135deg, ${T.accent}, ${T.focus})`,
                    color: "#fff", border: 0, borderRadius: 8,
                    fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: T.font,
                    boxShadow: `0 4px 14px ${T.accentGlow}`
                }}>+ Deposit</button>
            </div>

            <NotificationBell open={notifOpen} setOpen={setNotifOpen} />
            <div title={user?.email} style={{
                width: 36, height: 36, borderRadius: 999,
                background: `linear-gradient(135deg, #FBBF24, ${T.accent})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, color: "#fff", fontSize: 14
            }}>{(user?.displayName || "U").charAt(0).toUpperCase()}</div>
        </header>
    );
}

const topBtn: CSSProperties = {
    width: 38, height: 38, borderRadius: 10,
    background: T.surface, border: `1px solid ${T.border}`, color: T.textMuted,
    cursor: "pointer", fontSize: 15
};

// ============================================================================
// Mini sparkline + area chart primitives
// ============================================================================

function Sparkline({ values, color, width = 92, height = 30 }: { values: number[]; color: string; width?: number; height?: number }) {
    if (values.length < 2) return null;
    const min = Math.min(...values), max = Math.max(...values), range = Math.max(max - min, 1e-9);
    const step = width / (values.length - 1);
    const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(" ");
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" />
        </svg>
    );
}

function AreaChart({
    values, labels, height = 280, accent = T.accent, showAxes = true
}: { values: number[]; labels: string[]; height?: number; accent?: string; showAxes?: boolean }) {
    const width = 900;
    const m = { top: 16, right: 48, bottom: showAxes ? 28 : 8, left: 8 };
    const pw = width - m.left - m.right;
    const ph = height - m.top - m.bottom;
    const min = Math.min(...values), max = Math.max(...values), range = Math.max(max - min, 1e-9);
    const xOf = (i: number) => m.left + (i * (pw / (values.length - 1)));
    const yOf = (v: number) => m.top + ph - ((v - min) / range) * ph;
    const line = values.map((v, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(" ");
    const area = `${line} L ${xOf(values.length - 1)} ${m.top + ph} L ${xOf(0)} ${m.top + ph} Z`;
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * range);
    const xTickEvery = Math.max(1, Math.floor(values.length / 6));
    const id = `grad-${accent.replace(/[^a-z0-9]/gi, "")}`;
    const latest = values[values.length - 1];
    const latestY = yOf(latest);
    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
                    <stop offset="100%" stopColor={accent} stopOpacity="0" />
                </linearGradient>
            </defs>
            {/* Y gridlines */}
            {showAxes && yTicks.map((t, i) => (
                <g key={i}>
                    <line x1={m.left} y1={yOf(t)} x2={m.left + pw} y2={yOf(t)} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 6" />
                    <text x={m.left + pw + 6} y={yOf(t) + 4} fill={T.textSubtle} fontSize="10" fontFamily={T.mono}>{fmtCompact(t)}</text>
                </g>
            ))}
            <path d={area} fill={`url(#${id})`} />
            <path d={line} fill="none" stroke={accent} strokeWidth="2.2" />
            {/* Latest close marker */}
            <circle cx={xOf(values.length - 1)} cy={latestY} r="4" fill={accent} />
            <circle cx={xOf(values.length - 1)} cy={latestY} r="9" fill={accent} opacity="0.2" />
            {/* X axis labels */}
            {showAxes && labels.map((l, i) => i % xTickEvery === 0 ? (
                <text key={i} x={xOf(i)} y={m.top + ph + 18} fill={T.textSubtle} fontSize="10" textAnchor="middle" fontFamily={T.mono}>{l}</text>
            ) : null)}
        </svg>
    );
}

function Donut({ segments, size = 160 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
    const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
    const r = size / 2 - 10;
    const c = 2 * Math.PI * r;
    let offset = 0;
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.surfaceRaised} strokeWidth="14" />
            {segments.map((seg, i) => {
                const len = (seg.value / total) * c;
                const dash = `${len} ${c - len}`;
                const dashOffset = -offset;
                offset += len;
                return (
                    <circle key={i}
                        cx={size / 2} cy={size / 2} r={r} fill="none"
                        stroke={seg.color} strokeWidth="14"
                        strokeDasharray={dash} strokeDashoffset={dashOffset}
                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                        strokeLinecap="round"
                    />
                );
            })}
        </svg>
    );
}

// Candlestick chart with real axes — used on the Trade page.
function CandleChart({
    candles, height = 360
}: { candles: { open: number; high: number; low: number; close: number; label: string }[]; height?: number }) {
    const width = 900;
    const m = { top: 12, right: 64, bottom: 32, left: 8 };
    const pw = width - m.left - m.right;
    const ph = height - m.top - m.bottom;
    const lows = candles.map(c => c.low), highs = candles.map(c => c.high);
    const rawMin = Math.min(...lows), rawMax = Math.max(...highs);
    const pad = (rawMax - rawMin) * 0.05;
    const min = rawMin - pad, max = rawMax + pad, range = Math.max(max - min, 1e-9);
    const xOf = (i: number) => m.left + ((i + 0.5) * (pw / candles.length));
    const yOf = (v: number) => m.top + ph - ((v - min) / range) * ph;
    const bodyW = Math.max(3, (pw / candles.length) * 0.65);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => min + f * range);
    const last = candles[candles.length - 1];
    const up = last.close >= last.open;
    const trend = up ? T.positive : T.negative;
    return (
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            {ticks.map((t, i) => (
                <g key={i}>
                    <line x1={m.left} y1={yOf(t)} x2={m.left + pw} y2={yOf(t)} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 6" />
                    <text x={m.left + pw + 6} y={yOf(t) + 4} fill={T.textSubtle} fontSize="10" fontFamily={T.mono}>{t.toFixed(2)}</text>
                </g>
            ))}
            {candles.map((c, i) => {
                const x = xOf(i);
                const cUp = c.close >= c.open;
                const color = cUp ? T.positive : T.negative;
                const bodyTop = yOf(Math.max(c.open, c.close));
                const bodyBot = yOf(Math.min(c.open, c.close));
                return (
                    <g key={i}>
                        <line x1={x} y1={yOf(c.high)} x2={x} y2={yOf(c.low)} stroke={color} strokeWidth="1" />
                        <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={Math.max(1, bodyBot - bodyTop)} fill={color} rx="1" />
                    </g>
                );
            })}
            {/* Last close pill */}
            <line x1={m.left} y1={yOf(last.close)} x2={m.left + pw} y2={yOf(last.close)} stroke={trend} strokeDasharray="4 4" strokeOpacity="0.6" />
            <rect x={m.left + pw + 2} y={yOf(last.close) - 10} width="58" height="20" rx="4" fill={trend} />
            <text x={m.left + pw + 31} y={yOf(last.close) + 4} fill="#1F0A00" fontSize="11" fontWeight="700" textAnchor="middle" fontFamily={T.mono}>{last.close.toFixed(2)}</text>
            {candles.map((c, i) => i % Math.ceil(candles.length / 8) === 0 ? (
                <text key={`l-${i}`} x={xOf(i)} y={m.top + ph + 18} fill={T.textSubtle} fontSize="10" textAnchor="middle" fontFamily={T.mono}>{c.label}</text>
            ) : null)}
        </svg>
    );
}

// ============================================================================
// Dashboard page
// ============================================================================

interface DashboardProps {
    quotes: Record<string, LiveQuote>;
    workspace: Workspace;
}

const TIMEFRAMES = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const;

function DashboardPage({ quotes, workspace }: DashboardProps) {
    const [timeframe, setTimeframe] = useState<typeof TIMEFRAMES[number]>("1M");
    const { isNarrow } = useViewport();
    const twoCol = isNarrow ? "1fr" : "1.7fr 1fr";
    const kpiCol = isNarrow ? "repeat(auto-fit, minmax(180px, 1fr))" : "repeat(auto-fit, minmax(220px, 1fr))";

    const hasBook = workspace.positions.length > 0;
    const positionMtm = workspace.positions.reduce((s, p) => s + (quotes[p.symbol]?.price ?? p.averagePrice) * p.quantity, 0);
    const realNetLiq = workspace.cashBalance + positionMtm;
    const realDayPnl = workspace.positions.reduce((s, p) => {
        const q = quotes[p.symbol];
        if (!q) return s;
        // change is %; compute today's dollar move on the position.
        return s + (q.price * p.quantity) * (q.change / 100);
    }, 0);

    // Build equity curve length per timeframe.
    const equityLen = { "1D": 24, "1W": 35, "1M": 30, "3M": 60, "1Y": 52, "ALL": 84 }[timeframe];

    // Slice the workspace's real equity history by the active timeframe.
    const snapshots = workspace.equitySnapshots || [];
    const windowMs = { "1D": 86400000, "1W": 7 * 86400000, "1M": 30 * 86400000, "3M": 90 * 86400000, "1Y": 365 * 86400000, "ALL": Number.POSITIVE_INFINITY }[timeframe];
    const cutoff = Date.now() - windowMs;
    const realWindow = snapshots.filter(s => Date.parse(s.t) >= cutoff);
    const hasRealHistory = realWindow.length >= 2;

    const equity = useMemo(
        () => hasRealHistory ? realWindow.map(s => s.v) : priceWalk(`equity-${timeframe}`, 280000, equityLen, 0.008, 0.0022),
        [timeframe, hasRealHistory, realWindow.length, realWindow[realWindow.length - 1]?.v]
    );
    const equityLabels = useMemo(() => {
        if (hasRealHistory) {
            return realWindow.map(s => {
                const d = new Date(s.t);
                return timeframe === "1D" ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
                    : `${d.getMonth() + 1}/${d.getDate()}`;
            });
        }
        if (timeframe === "1D") return Array.from({ length: equityLen }, (_, i) => `${String(9 + Math.floor(i / 3)).padStart(2, "0")}:${["00", "20", "40"][i % 3]}`);
        if (timeframe === "1W") return Array.from({ length: equityLen }, (_, i) => ["Mon", "Tue", "Wed", "Thu", "Fri"][Math.floor(i / 7) % 5]);
        return Array.from({ length: equityLen }, (_, i) => `D${i + 1}`);
    }, [timeframe, hasRealHistory, realWindow.length]);

    // If the user has real positions, show their real net-liq; otherwise use the
    // seeded demo curve so the chart never looks empty.
    const totalEquity = hasBook ? realNetLiq : equity[equity.length - 1];
    const prevEquity = equity[0];
    const dayPnl = hasBook ? realDayPnl : (totalEquity - equity[equity.length - 2]);
    const allTimePct = ((totalEquity - prevEquity) / prevEquity) * 100;
    const buyingPower = workspace.cashBalance;

    // Allocation: derive from workspace when we have a book.
    const allocation = hasBook ? (() => {
        const byCat: Record<string, number> = { Stocks: 0, ETFs: 0, Cash: 0 };
        workspace.positions.forEach(p => {
            const value = Math.abs(p.quantity * (quotes[p.symbol]?.price ?? p.averagePrice));
            const isEtf = ["SPY", "QQQ", "DIA", "IWM", "VOO", "VTI"].includes(p.symbol);
            if (isEtf) byCat.ETFs += value; else byCat.Stocks += value;
        });
        byCat.Cash = Math.max(0, workspace.cashBalance);
        const total = Object.values(byCat).reduce((a, b) => a + b, 0) || 1;
        return [
            { label: "Stocks", value: Math.round((byCat.Stocks / total) * 100), color: T.accent },
            { label: "ETFs", value: Math.round((byCat.ETFs / total) * 100), color: T.focus },
            { label: "Cash", value: Math.round((byCat.Cash / total) * 100), color: T.positive }
        ];
    })() : [
        { label: "Stocks", value: 62, color: T.accent },
        { label: "ETFs", value: 18, color: T.focus },
        { label: "Crypto", value: 12, color: T.info },
        { label: "Cash", value: 8, color: T.positive }
    ];

    const nameMap: Record<string, string> = { AAPL: "Apple Inc.", MSFT: "Microsoft", NVDA: "NVIDIA", TSLA: "Tesla", GOOGL: "Alphabet", AMZN: "Amazon", META: "Meta Platforms", AMD: "Adv Micro Devices", NFLX: "Netflix", SPY: "SPDR S&P 500", QQQ: "Invesco QQQ", DIS: "Walt Disney" };
    const holdingSource = hasBook
        ? workspace.positions.slice(0, 6).map(p => ({ symbol: p.symbol, qty: p.quantity, avg: p.averagePrice }))
        : ["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN"].map(sym => ({ symbol: sym, qty: +(10 + (sym.charCodeAt(0) % 20)).toFixed(0), avg: 0 }));

    const topHoldings = holdingSource.map(h => {
        const q = quotes[h.symbol];
        const series = priceWalk(`hold-${h.symbol}`, q?.price ?? 200, 24, 0.018);
        return {
            symbol: h.symbol,
            name: nameMap[h.symbol] ?? h.symbol,
            price: q?.price ?? series[series.length - 1],
            change: q?.change ?? (series[series.length - 1] / series[0] - 1) * 100,
            qty: h.qty,
            series
        };
    });

    const movers = Object.entries(quotes).map(([sym, q]) => ({ sym, ...q })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    const gainers = movers.filter(m => m.change > 0).slice(0, 4);
    const losers = movers.filter(m => m.change < 0).slice(0, 4);

    const { headlines: liveNews } = useNews("AAPL");
    const news = liveNews.length > 0 ? liveNews.slice(0, 6).map(h => {
        const ageMs = Date.now() - (typeof h.time === "string" ? Date.parse(h.time) || Date.now() : h.time);
        const mins = Math.max(1, Math.round(ageMs / 60000));
        const when = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
        const lower = (h.headline || "").toLowerCase();
        const tone: "positive" | "negative" | "neutral" = /(beat|rise|surge|gain|upgrade|record|strong|growth)/.test(lower) ? "positive"
            : /(miss|fall|drop|cut|downgrade|concern|weak|risk|loss|plunge)/.test(lower) ? "negative" : "neutral";
        return { time: when, title: h.headline, source: h.source, tone };
    }) : [
        { time: "—", title: "Connecting to live newswire…", source: "Finnhub", tone: "neutral" as const }
    ];

    return (
        <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: T.text, margin: 0, letterSpacing: -0.5 }}>Dashboard</h1>
                    <div style={{ color: T.textMuted, fontSize: 13, marginTop: 4 }}>Welcome back. Here's how your book is tracking today.</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <Pill>+ Add Widget</Pill>
                    <Pill>Export</Pill>
                    <button style={{
                        padding: "9px 18px",
                        background: `linear-gradient(135deg, ${T.accent}, ${T.focus})`,
                        color: "#fff", border: 0, borderRadius: 10,
                        fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: T.font,
                        boxShadow: `0 6px 20px ${T.accentGlow}`
                    }}>Buy Asset</button>
                </div>
            </div>

            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: kpiCol, gap: 16 }}>
                <KpiCard label="Total equity" value={fmtMoney(totalEquity, 2)} delta={allTimePct} sub="All-time" />
                <KpiCard label="Today's P&L" value={fmtSignedMoney(dayPnl)} delta={(dayPnl / totalEquity) * 100} sub="vs. yesterday" accent={dayPnl >= 0} />
                <KpiCard label="Buying power" value={fmtMoney(buyingPower, 2)} sub="Available to trade" />
                <KpiCard label="Open positions" value="12" sub="3 new this week" trail="+3" />
            </div>

            {/* Main chart + allocation */}
            <div style={{ display: "grid", gridTemplateColumns: twoCol, gap: 16 }}>
                <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                        <div>
                            <Eyebrow>Total Investments</Eyebrow>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6 }}>
                                <div style={{ fontSize: 28, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums", letterSpacing: -0.6 }}>{fmtMoney(totalEquity)}</div>
                                <Delta value={allTimePct} />
                            </div>
                            <div style={{ color: T.textSubtle, fontSize: 12, marginTop: 4 }}>Net liquidation curve · {timeframe}</div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                            {TIMEFRAMES.map(t => <Pill key={t} active={timeframe === t} onClick={() => setTimeframe(t)}>{t}</Pill>)}
                        </div>
                    </div>
                    <AreaChart values={equity} labels={equityLabels} accent={T.accent} height={260} />
                </Card>

                <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <Eyebrow>Allocation</Eyebrow>
                            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginTop: 6 }}>Asset mix</div>
                        </div>
                        <Pill>Rebalance</Pill>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 12 }}>
                        <div style={{ position: "relative" }}>
                            <Donut segments={allocation} size={150} />
                            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                <div style={{ color: T.textSubtle, fontSize: 10, letterSpacing: 1 }}>TOTAL</div>
                                <div style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{fmtCompact(totalEquity)}</div>
                            </div>
                        </div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                            {allocation.map(a => (
                                <div key={a.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color }} />
                                    <span style={{ color: T.text, fontSize: 12.5, flex: 1 }}>{a.label}</span>
                                    <span style={{ color: T.textMuted, fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{a.value}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Holdings + watchlist */}
            <div style={{ display: "grid", gridTemplateColumns: twoCol, gap: 16 }}>
                <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <div>
                            <Eyebrow>Top holdings</Eyebrow>
                            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginTop: 4 }}>Your biggest bets</div>
                        </div>
                        <Pill>View all</Pill>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ color: T.textSubtle, fontSize: 10, letterSpacing: 1.5 }}>
                                <th style={th}>SYMBOL</th><th style={th}>QTY</th><th style={thR}>PRICE</th><th style={thR}>CHANGE</th><th style={thR}>TREND</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topHoldings.map(h => (
                                <tr key={h.symbol} style={{ borderTop: `1px solid ${T.border}` }}>
                                    <td style={td}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <SymbolBadge sym={h.symbol} />
                                            <div>
                                                <div style={{ fontWeight: 700, color: T.text }}>{h.symbol}</div>
                                                <div style={{ color: T.textSubtle, fontSize: 11 }}>{h.name}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ ...td, color: T.textMuted, fontVariantNumeric: "tabular-nums" }}>{h.qty}</td>
                                    <td style={{ ...tdR, color: T.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(h.price)}</td>
                                    <td style={tdR}><Delta value={h.change} /></td>
                                    <td style={tdR}><Sparkline values={h.series} color={h.change >= 0 ? T.positive : T.negative} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>

                <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                        <Eyebrow>Market movers</Eyebrow>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginTop: 4 }}>Live from Finnhub</div>
                    </div>
                    <div>
                        <div style={{ color: T.positive, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 6 }}>▲ GAINERS</div>
                        {gainers.map(m => <MoverRow key={m.sym} sym={m.sym} price={m.price} change={m.change} />)}
                    </div>
                    <div>
                        <div style={{ color: T.negative, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 6 }}>▼ LOSERS</div>
                        {losers.length > 0 ? losers.map(m => <MoverRow key={m.sym} sym={m.sym} price={m.price} change={m.change} />) : <div style={{ color: T.textSubtle, fontSize: 12 }}>No losers in watchlist right now.</div>}
                    </div>
                </Card>
            </div>

            {/* News + AI */}
            <div style={{ display: "grid", gridTemplateColumns: twoCol, gap: 16 }}>
                <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <div>
                            <Eyebrow>Newswire</Eyebrow>
                            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginTop: 4 }}>What's moving the tape</div>
                        </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {news.map((n, i) => (
                            <div key={i} style={{
                                display: "flex", gap: 14, padding: "12px 0",
                                borderTop: i === 0 ? "none" : `1px solid ${T.border}`
                            }}>
                                <div style={{
                                    width: 4, minWidth: 4, borderRadius: 999,
                                    background: n.tone === "positive" ? T.positive : n.tone === "negative" ? T.negative : T.textSubtle
                                }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ color: T.text, fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{n.title}</div>
                                    <div style={{ color: T.textSubtle, fontSize: 11.5, marginTop: 4 }}>{n.source} · {n.time}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card accent>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, opacity: 0.85 }}>AI ADVISOR</div>
                    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10, lineHeight: 1.3 }}>Invest smarter with your Atlas AI assistant</div>
                    <div style={{ fontSize: 13, opacity: 0.9, marginTop: 8, lineHeight: 1.5 }}>Get automated risk sizing, rebalancing signals, and narrative briefs delivered every morning.</div>
                    <button style={{
                        marginTop: 18, padding: "10px 18px",
                        background: "#fff", color: "#1F0A00", border: 0, borderRadius: 10,
                        fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: T.font
                    }}>Try it free</button>
                </Card>
            </div>
        </div>
    );
}

function KpiCard({ label, value, delta, sub, trail, accent }: { label: string; value: string; delta?: number; sub?: string; trail?: string; accent?: boolean }) {
    return (
        <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Eyebrow>{label}</Eyebrow>
                {delta !== undefined ? <Delta value={delta} /> : trail ? <span style={{ color: T.textMuted, fontSize: 11, fontWeight: 700 }}>{trail}</span> : null}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: accent === false ? T.negative : accent === true ? T.positive : T.text, marginTop: 10, letterSpacing: -0.6, fontVariantNumeric: "tabular-nums" }}>{value}</div>
            {sub ? <div style={{ color: T.textSubtle, fontSize: 11.5, marginTop: 4 }}>{sub}</div> : null}
        </Card>
    );
}

function SymbolBadge({ sym }: { sym: string }) {
    const hues: Record<string, [string, string]> = {
        AAPL: ["#A3A3A3", "#525252"], MSFT: ["#0EA5E9", "#0369A1"], NVDA: ["#22C55E", "#166534"],
        TSLA: ["#F43F5E", "#9F1239"], GOOGL: ["#F59E0B", "#B45309"], META: ["#3B82F6", "#1E40AF"],
        AMZN: ["#F59E0B", "#78350F"], AMD: ["#EF4444", "#7F1D1D"], NFLX: ["#DC2626", "#7F1D1D"],
        SPY: ["#F97316", "#9A3412"], QQQ: ["#06B6D4", "#155E75"], DIS: ["#6366F1", "#3730A3"]
    };
    const [from, to] = hues[sym] ?? [T.accent, T.focus];
    return (
        <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `linear-gradient(135deg, ${from}, ${to})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, color: "#fff", fontSize: 11, letterSpacing: 0.5
        }}>{sym.slice(0, 2)}</div>
    );
}

const th: CSSProperties = { textAlign: "left", padding: "0 10px 10px", fontWeight: 700, color: T.textSubtle, letterSpacing: 1.5 };
const thR: CSSProperties = { ...th, textAlign: "right" };
const td: CSSProperties = { padding: "12px 10px", verticalAlign: "middle" };
const tdR: CSSProperties = { ...td, textAlign: "right" };

function MoverRow({ sym, price, change }: { sym: string; price: number; change: number }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${T.border}` }}>
            <SymbolBadge sym={sym} />
            <div style={{ flex: 1 }}>
                <div style={{ color: T.text, fontWeight: 700, fontSize: 13 }}>{sym}</div>
                <div style={{ color: T.textSubtle, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(price)}</div>
            </div>
            <Delta value={change} />
        </div>
    );
}

// ============================================================================
// Markets page
// ============================================================================

const INDICES = [
    { sym: "SPX", name: "S&P 500", price: 5487.03, change: 0.42 },
    { sym: "DJI", name: "Dow Jones", price: 39127.80, change: 0.18 },
    { sym: "IXIC", name: "Nasdaq", price: 17805.16, change: 0.81 },
    { sym: "RUT", name: "Russell 2000", price: 2021.44, change: -0.23 },
    { sym: "VIX", name: "Volatility", price: 13.24, change: -2.10 },
    { sym: "DXY", name: "USD Index", price: 104.62, change: 0.11 }
];

function MarketsPage({ quotes, onPickSymbol }: { quotes: Record<string, LiveQuote>; onPickSymbol: (s: string) => void }) {
    const { isNarrow, isTiny } = useViewport();
    const rows = LIVE_SYMBOLS.map(sym => {
        const q = quotes[sym];
        const series = priceWalk(`mk-${sym}`, q?.price ?? 200, 20, 0.015);
        return { sym, q, series, name: { AAPL: "Apple Inc.", MSFT: "Microsoft", NVDA: "NVIDIA", TSLA: "Tesla", GOOGL: "Alphabet", META: "Meta Platforms", AMZN: "Amazon", AMD: "Adv Micro Devices", NFLX: "Netflix", SPY: "SPDR S&P 500", QQQ: "Invesco QQQ", DIS: "Walt Disney" }[sym] || sym };
    });
    const sectors = [
        { name: "Tech", change: 1.42, leader: "NVDA +3.8%" },
        { name: "Finance", change: 0.36, leader: "JPM +1.1%" },
        { name: "Energy", change: -0.82, leader: "XOM -1.9%" },
        { name: "Healthcare", change: 0.14, leader: "UNH +0.6%" },
        { name: "Consumer", change: -0.25, leader: "AMZN -0.4%" },
        { name: "Industrials", change: 0.51, leader: "CAT +0.9%" },
        { name: "Materials", change: 1.02, leader: "FCX +2.2%" },
        { name: "Utilities", change: -0.18, leader: "NEE -0.3%" },
        { name: "Real Estate", change: -0.43, leader: "SPG -0.8%" }
    ];
    return (
        <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: T.text, margin: 0, letterSpacing: -0.5 }}>Markets</h1>

            <Card>
                <Eyebrow>Global indices</Eyebrow>
                <div style={{ display: "grid", gridTemplateColumns: isTiny ? "repeat(2, 1fr)" : isNarrow ? "repeat(3, 1fr)" : "repeat(6, 1fr)", gap: 16, marginTop: 12 }}>
                    {INDICES.map(ix => (
                        <div key={ix.sym} style={{ paddingRight: 12, borderRight: `1px solid ${T.border}` }}>
                            <div style={{ color: T.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{ix.sym}</div>
                            <div style={{ color: T.textSubtle, fontSize: 11, marginTop: 2 }}>{ix.name}</div>
                            <div style={{ color: T.text, fontSize: 18, fontWeight: 700, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{ix.price.toLocaleString("en-US")}</div>
                            <div style={{ marginTop: 6 }}><Delta value={ix.change} /></div>
                        </div>
                    ))}
                </div>
            </Card>

            <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div>
                        <Eyebrow>Watchlist · Live</Eyebrow>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginTop: 4 }}>Top US equities</div>
                    </div>
                    <Pill>+ Add symbol</Pill>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                        <tr style={{ color: T.textSubtle, fontSize: 10, letterSpacing: 1.5 }}>
                            <th style={th}>SYMBOL</th><th style={thR}>LAST</th><th style={thR}>CHANGE</th><th style={thR}>OPEN</th><th style={thR}>HIGH</th><th style={thR}>LOW</th><th style={thR}>TREND</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.sym} onClick={() => onPickSymbol(r.sym)} style={{ borderTop: `1px solid ${T.border}`, cursor: "pointer" }}>
                                <td style={td}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <SymbolBadge sym={r.sym} />
                                        <div>
                                            <div style={{ fontWeight: 700, color: T.text }}>{r.sym}</div>
                                            <div style={{ color: T.textSubtle, fontSize: 11 }}>{r.name}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ ...tdR, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>{r.q ? fmtMoney(r.q.price) : "—"}</td>
                                <td style={tdR}>{r.q ? <Delta value={r.q.change} /> : <span style={{ color: T.textSubtle }}>—</span>}</td>
                                <td style={{ ...tdR, color: T.textMuted, fontVariantNumeric: "tabular-nums" }}>{r.q ? fmtMoney(r.q.open) : "—"}</td>
                                <td style={{ ...tdR, color: T.textMuted, fontVariantNumeric: "tabular-nums" }}>{r.q ? fmtMoney(r.q.high) : "—"}</td>
                                <td style={{ ...tdR, color: T.textMuted, fontVariantNumeric: "tabular-nums" }}>{r.q ? fmtMoney(r.q.low) : "—"}</td>
                                <td style={tdR}><Sparkline values={r.series} color={(r.q?.change ?? 0) >= 0 ? T.positive : T.negative} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            <Card>
                <Eyebrow>Sector heatmap</Eyebrow>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginTop: 4, marginBottom: 12 }}>Session performance by sector</div>
                <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 10 }}>
                    {sectors.map(s => {
                        const intensity = Math.min(Math.abs(s.change) / 2, 1);
                        const bg = s.change >= 0
                            ? `rgba(16, 185, 129, ${0.08 + intensity * 0.22})`
                            : `rgba(244, 63, 94, ${0.08 + intensity * 0.22})`;
                        const border = s.change >= 0 ? "rgba(16,185,129,0.35)" : "rgba(244,63,94,0.35)";
                        return (
                            <div key={s.name} style={{
                                background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: 16
                            }}>
                                <div style={{ color: T.text, fontSize: 14, fontWeight: 700 }}>{s.name}</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: s.change >= 0 ? T.positive : T.negative, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{fmtPct(s.change)}</div>
                                <div style={{ color: T.textMuted, fontSize: 11.5, marginTop: 6 }}>Leader: {s.leader}</div>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
                    <span style={{ color: T.textSubtle, fontSize: 11 }}>Intensity = |change|. Capped at ±2% for visual clarity.</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: T.textSubtle }}>
                        -2% <div style={{ width: 120, height: 8, borderRadius: 999, background: `linear-gradient(90deg, ${T.negative}, rgba(255,255,255,0.1), ${T.positive})` }} /> +2%
                    </div>
                </div>
            </Card>
        </div>
    );
}

// ============================================================================
// Trade page
// ============================================================================

function TradePage({ quotes, auth, symbol, setSymbol, onOrderPlaced, workspace }: {
    quotes: Record<string, LiveQuote>;
    auth: ReturnType<typeof useAuth>;
    symbol: string;
    setSymbol: (s: string) => void;
    onOrderPlaced: () => void;
    workspace: Workspace;
}) {
    const { isNarrow } = useViewport();
    const outerCol = isNarrow ? "1fr" : "1.8fr 1fr";
    const innerCol = isNarrow ? "1fr" : "1fr 1fr";
    const [side, setSide] = useState<"Buy" | "Sell">("Buy");
    const [orderType, setOrderType] = useState<"Market" | "Limit" | "Stop">("Market");
    const [qty, setQty] = useState("10");
    const [limit, setLimit] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function submitOrder() {
        if (!auth.token) { pushToast("err", "Sign in required to place orders."); return; }
        const quantity = Number(qty);
        if (!quantity || quantity <= 0) { pushToast("err", "Enter a valid quantity."); return; }
        setSubmitting(true);
        try {
            // Hydrate current workspace, append new order, persist back.
            const wsRes = await authedFetch(auth.token, "/v1/workspaces/paper");
            const wsData = await wsRes.json();
            const workspace = wsData.workspace || { positions: [], orders: [], fills: [], cashBalance: 50000, equitySnapshots: [] };
            workspace.equitySnapshots = Array.isArray(workspace.equitySnapshots) ? workspace.equitySnapshots : [];
            const now = new Date().toISOString();
            const order = {
                id: `O-${Date.now().toString(36).toUpperCase()}`,
                symbol, side, type: orderType, quantity,
                limitPrice: orderType === "Limit" ? Number(limit) || null : null,
                stopPrice: orderType === "Stop" ? Number(limit) || null : null,
                status: orderType === "Market" ? "Filled" : "Working",
                placedAt: now, updatedAt: now,
                averageFillPrice: orderType === "Market" ? price : null,
                filledQuantity: orderType === "Market" ? quantity : 0,
                notes: null
            };
            workspace.orders = [order, ...(workspace.orders || [])].slice(0, 200);
            if (orderType === "Market") {
                const fill = { id: `F-${Date.now().toString(36).toUpperCase()}`, orderId: order.id, symbol, side, quantity, price, filledAt: now };
                workspace.fills = [fill, ...(workspace.fills || [])].slice(0, 500);
                const positions = workspace.positions || [];
                const existing = positions.find((p: any) => p.symbol === symbol);
                const signedQty = side === "Buy" ? quantity : -quantity;
                if (existing) {
                    const newQty = existing.quantity + signedQty;
                    existing.quantity = newQty;
                    existing.averagePrice = newQty !== 0 ? ((existing.averagePrice * existing.quantity + price * signedQty) / newQty) : existing.averagePrice;
                } else if (signedQty !== 0) {
                    positions.push({ symbol, quantity: signedQty, averagePrice: price, openedAt: now });
                }
                workspace.positions = positions.filter((p: any) => p.quantity !== 0);
                workspace.cashBalance = (workspace.cashBalance || 0) - (signedQty * price);
            }
            // Snapshot equity right after the (possibly) filled order so the
            // Dashboard net-liq curve reflects real trading history.
            const netLiq = (workspace.cashBalance || 0) + (workspace.positions || []).reduce((s: number, p: any) => {
                const mark = quotes[p.symbol]?.price ?? p.averagePrice;
                return s + mark * p.quantity;
            }, 0);
            workspace.equitySnapshots = [...workspace.equitySnapshots, { t: now, v: +netLiq.toFixed(2) }].slice(-365);
            const putRes = await authedFetch(auth.token, "/v1/workspaces/paper", { method: "PUT", body: JSON.stringify({ workspace }) });
            if (!putRes.ok) throw new Error("Failed to save order.");
            pushToast("ok", `${side} ${quantity} ${symbol} · ${orderType} ${orderType === "Market" ? "filled" : "working"}.`);
            onOrderPlaced();
        } catch (e: any) {
            pushToast("err", e.message || "Order error");
        } finally {
            setSubmitting(false);
        }
    }

    // Pull the live asset detail (quote + provider priceSeries + news).
    const { detail } = useAssetDetail(symbol);
    const q = quotes[symbol];
    const price = detail?.price ?? q?.price ?? 200;

    // Candle series strategy:
    // - If the provider returned enough priceSeries points (≥ 5), use them as
    //   real close anchors; derive OHLC around each close with a small seeded
    //   walk so wicks look natural.
    // - The LAST candle is always the current real-day OHLC (open/high/low/close).
    // - If we only have a couple of points (free-tier fallback), synthesize a
    //   48-bar walk anchored on previousClose → current price so the trend is
    //   still faithful to the real price move.
    const candles = useMemo(() => {
        const tail = detail ? { open: detail.open, high: detail.high, low: detail.low, close: detail.price } : null;
        const prev = detail?.previousClose ?? q?.previousClose ?? price;
        const series = detail?.priceSeries ?? [];
        const hasReal = series.length >= 5;

        const closes = hasReal ? series.slice(-48) : priceWalk(`trade-${symbol}`, prev, 47, 0.012, 0).concat([price]);
        const rand = seedRandom(`candle-${symbol}`);
        const out = closes.map((close, i) => {
            const open = i === 0 ? close : closes[i - 1];
            const body = Math.abs(close - open);
            const upTail = body * (0.4 + rand() * 0.8) + Math.max(close, open) * 0.001;
            const lowTail = body * (0.35 + rand() * 0.7) + Math.max(close, open) * 0.001;
            return {
                open: +open.toFixed(2),
                close: +close.toFixed(2),
                high: +(Math.max(open, close) + upTail).toFixed(2),
                low: +(Math.min(open, close) - lowTail).toFixed(2),
                label: `D-${closes.length - i - 1}`
            };
        });
        // Force the last candle to the real live OHLC.
        if (out.length > 0 && tail) {
            out[out.length - 1] = { ...tail, label: "Today" };
        } else if (out.length > 0) {
            out[out.length - 1].label = "Today";
        }
        return out;
    }, [symbol, price, detail?.priceSeries, detail?.open, detail?.high, detail?.low, detail?.previousClose, q?.previousClose]);

    const estCost = +qty * (orderType === "Limit" && limit ? +limit : price);
    const orderBookBids = Array.from({ length: 8 }, (_, i) => ({ price: +(price - (i + 1) * 0.12).toFixed(2), size: Math.round(120 + Math.random() * 500) }));
    const orderBookAsks = Array.from({ length: 8 }, (_, i) => ({ price: +(price + (i + 1) * 0.12).toFixed(2), size: Math.round(120 + Math.random() * 500) }));
    const recent = Array.from({ length: 10 }, (_, i) => ({ time: `${14 + Math.floor(i / 5)}:${String(30 - i * 2).padStart(2, "0")}:12`, price: +(price + (Math.random() - 0.5) * 0.8).toFixed(2), size: Math.round(10 + Math.random() * 300), side: Math.random() > 0.5 ? "B" : "S" }));

    return (
        <div style={{ padding: "24px 28px 48px", display: "grid", gridTemplateColumns: outerCol, gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <SymbolBadge sym={symbol} />
                            <div>
                                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                                    <select value={symbol} onChange={e => setSymbol(e.target.value)} style={{
                                        background: "transparent", color: T.text, fontSize: 22, fontWeight: 700,
                                        border: 0, outline: 0, fontFamily: T.font, cursor: "pointer"
                                    }}>
                                        {LIVE_SYMBOLS.map(s => <option key={s} value={s} style={{ background: T.surface }}>{s}</option>)}
                                    </select>
                                </div>
                                <div style={{ color: T.textMuted, fontSize: 12 }}>NASDAQ · Live</div>
                            </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 26, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>{fmtMoney(price)}</div>
                            {(detail || q) ? <div style={{ marginTop: 4 }}><Delta value={(detail?.change ?? q?.change ?? 0)} /></div> : null}
                            {detail?.updatedAt ? <div style={{ color: T.textSubtle, fontSize: 11, marginTop: 4, fontFamily: T.mono }}>Updated {new Date(detail.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div> : null}
                        </div>
                    </div>
                    <CandleChart candles={candles} height={340} />
                    {/* Live OHLC stats strip — everything sourced from Finnhub via the gateway. */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 14 }}>
                        {[
                            { k: "Open", v: detail?.open ?? q?.open },
                            { k: "Day high", v: detail?.high ?? q?.high },
                            { k: "Day low", v: detail?.low ?? q?.low },
                            { k: "Prev close", v: detail?.previousClose ?? q?.previousClose }
                        ].map(s => (
                            <div key={s.k} style={{ padding: "8px 10px", background: T.surfaceAlt, borderRadius: 8, border: `1px solid ${T.border}` }}>
                                <div style={{ color: T.textSubtle, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{s.k}</div>
                                <div style={{ color: T.text, fontSize: 14, fontWeight: 700, marginTop: 2, fontFamily: T.mono }}>{s.v ? fmtMoney(s.v) : "—"}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 10, color: T.textSubtle, fontSize: 11 }}>
                        Candle history is built from Finnhub daily closes. The rightmost "Today" candle reflects live O/H/L/C.
                    </div>
                </Card>

                <div style={{ display: "grid", gridTemplateColumns: innerCol, gap: 16 }}>
                    <Card>
                        <Eyebrow>Order book</Eyebrow>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginTop: 4, marginBottom: 8 }}>L1 simulated depth</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                            <div>
                                <div style={{ color: T.positive, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>BIDS</div>
                                {orderBookBids.map((b, i) => (
                                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 8px", background: i < 3 ? T.positiveSoft : "transparent", borderRadius: 4, fontFamily: T.mono }}>
                                        <span style={{ color: T.positive }}>{b.price}</span>
                                        <span style={{ color: T.textMuted }}>{b.size}</span>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <div style={{ color: T.negative, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>ASKS</div>
                                {orderBookAsks.map((a, i) => (
                                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 8px", background: i < 3 ? T.negativeSoft : "transparent", borderRadius: 4, fontFamily: T.mono }}>
                                        <span style={{ color: T.negative }}>{a.price}</span>
                                        <span style={{ color: T.textMuted }}>{a.size}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <Eyebrow>Recent trades</Eyebrow>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginTop: 4, marginBottom: 8 }}>Time &amp; sales</div>
                        <div style={{ fontFamily: T.mono, fontSize: 12 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", color: T.textSubtle, fontSize: 10, padding: "4px 8px", letterSpacing: 1 }}>
                                <span>TIME</span><span style={{ textAlign: "right" }}>PRICE</span><span style={{ textAlign: "right" }}>SIZE</span>
                            </div>
                            {recent.map((r, i) => (
                                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "4px 8px", borderTop: `1px solid ${T.border}` }}>
                                    <span style={{ color: T.textMuted }}>{r.time}</span>
                                    <span style={{ textAlign: "right", color: r.side === "B" ? T.positive : T.negative }}>{r.price}</span>
                                    <span style={{ textAlign: "right", color: T.textMuted }}>{r.size}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                <Card>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div>
                            <Eyebrow>News · {symbol}</Eyebrow>
                            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginTop: 4 }}>Live wire for this symbol</div>
                        </div>
                        {detail && detail.headlines.length > 0 ? <span style={{ color: T.textSubtle, fontSize: 11 }}>{detail.headlines.length} stories</span> : null}
                    </div>
                    {!detail || detail.headlines.length === 0 ? (
                        <div style={{ padding: "18px 8px", color: T.textSubtle, fontSize: 12.5 }}>No recent news for {symbol}.</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            {detail.headlines.slice(0, 6).map((h, i) => {
                                const lower = (h.headline || "").toLowerCase();
                                const tone = /(beat|rise|surge|gain|upgrade|record|strong|growth)/.test(lower) ? T.positive : /(miss|fall|drop|cut|downgrade|concern|weak|risk|loss|plunge)/.test(lower) ? T.negative : T.textSubtle;
                                const ageMs = Date.now() - (typeof h.time === "string" ? Date.parse(h.time) || Date.now() : h.time);
                                const mins = Math.max(1, Math.round(ageMs / 60000));
                                const when = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
                                return (
                                    <a key={i} href={h.url || "#"} target="_blank" rel="noreferrer" style={{
                                        display: "flex", gap: 12, padding: "12px 0",
                                        borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                                        textDecoration: "none", color: "inherit"
                                    }}>
                                        <span style={{ width: 4, minWidth: 4, borderRadius: 999, background: tone }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: T.text, fontWeight: 600, fontSize: 13.5, lineHeight: 1.35 }}>{h.headline}</div>
                                            {h.summary ? <div style={{ color: T.textMuted, fontSize: 12, marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>{h.summary}</div> : null}
                                            <div style={{ color: T.textSubtle, fontSize: 11, marginTop: 4 }}>{h.source} · {when}</div>
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </div>

            <Card style={{ position: "sticky", top: 90, alignSelf: "flex-start" }}>
                <Eyebrow>Order ticket</Eyebrow>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginTop: 4 }}>{symbol}</div>

                <div style={{ display: "flex", gap: 0, marginTop: 14, background: T.surfaceAlt, padding: 4, borderRadius: 10 }}>
                    {(["Buy", "Sell"] as const).map(s => (
                        <button key={s} onClick={() => setSide(s)} style={{
                            flex: 1, padding: "10px 12px", borderRadius: 8, border: 0, cursor: "pointer",
                            background: side === s ? (s === "Buy" ? T.positive : T.negative) : "transparent",
                            color: side === s ? "#fff" : T.textMuted, fontWeight: 700, fontSize: 13, fontFamily: T.font
                        }}>{s}</button>
                    ))}
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    {(["Market", "Limit", "Stop"] as const).map(t => (
                        <button key={t} onClick={() => setOrderType(t)} style={{
                            flex: 1, padding: "8px 10px", borderRadius: 8,
                            border: `1px solid ${orderType === t ? T.accent : T.border}`,
                            background: orderType === t ? T.accentSoft : "transparent",
                            color: orderType === t ? T.accentStrong : T.textMuted,
                            fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: T.font
                        }}>{t}</button>
                    ))}
                </div>

                <label style={fieldLabel}>Quantity</label>
                <input value={qty} onChange={e => setQty(e.target.value)} style={field} />

                {orderType !== "Market" ? (
                    <>
                        <label style={fieldLabel}>{orderType === "Limit" ? "Limit price" : "Stop price"}</label>
                        <input value={limit} onChange={e => setLimit(e.target.value)} placeholder={price.toFixed(2)} style={field} />
                    </>
                ) : null}

                {(() => {
                    const qtyN = Number(qty) || 0;
                    const execPrice = orderType === "Limit" && limit ? Number(limit) : price;
                    const cost = qtyN * execPrice;
                    const buyingPower = Math.max(0, workspace.cashBalance || 0);
                    const heldQty = workspace.positions.find(p => p.symbol === symbol)?.quantity ?? 0;
                    const insufficientCash = side === "Buy" && orderType === "Market" && cost > buyingPower;
                    const insufficientShares = side === "Sell" && qtyN > heldQty;
                    const blocked = qtyN <= 0 || insufficientCash || insufficientShares;
                    const reason = qtyN <= 0 ? "Enter a quantity" : insufficientCash ? `Need ${fmtMoney(cost - buyingPower)} more cash` : insufficientShares ? `You only hold ${heldQty} shares` : null;
                    return <>
                        <div style={{ marginTop: 14, padding: 12, background: T.surfaceAlt, borderRadius: 10, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                            <Row k="Est. cost" v={fmtMoney(cost)} />
                            <Row k="Est. fee" v="$0.00 · Free" />
                            <Row k="Buying power" v={fmtMoney(buyingPower)} />
                            {heldQty !== 0 ? <Row k={`You hold`} v={`${heldQty} ${symbol}`} /> : null}
                        </div>

                        {reason ? (
                            <div style={{ marginTop: 10, padding: "8px 12px", background: T.negativeSoft, border: `1px solid ${T.negative}`, borderRadius: 8, color: T.negative, fontSize: 12 }}>
                                {reason}
                            </div>
                        ) : null}

                        <button onClick={submitOrder} disabled={submitting || blocked} style={{
                            marginTop: 14, width: "100%", padding: "12px 16px",
                            background: blocked ? T.surfaceRaised : side === "Buy" ? `linear-gradient(135deg, ${T.positive}, #059669)` : `linear-gradient(135deg, ${T.negative}, #BE123C)`,
                            color: blocked ? T.textSubtle : "#fff", border: 0, borderRadius: 10,
                            fontWeight: 700, fontSize: 14, cursor: (submitting || blocked) ? "not-allowed" : "pointer", fontFamily: T.font, opacity: submitting ? 0.7 : 1,
                            boxShadow: blocked ? "none" : `0 6px 20px ${side === "Buy" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`
                        }}>{submitting ? "Submitting…" : `${side} ${qtyN || qty} ${symbol} · ${orderType}`}</button>
                    </>;
                })()}

                <div style={{ color: T.textSubtle, fontSize: 11, marginTop: 10, textAlign: "center" }}>Paper trading — no real capital at risk.</div>
            </Card>
        </div>
    );
}

const fieldLabel: CSSProperties = { display: "block", marginTop: 12, marginBottom: 6, color: T.textMuted, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.5 };
const field: CSSProperties = { width: "100%", padding: "10px 12px", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 14, fontFamily: T.font, outline: "none", boxSizing: "border-box" as any };

function Row({ k, v }: { k: string; v: string }) {
    return <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.textMuted }}>{k}</span><span style={{ color: T.text, fontWeight: 600, fontFamily: T.mono }}>{v}</span></div>;
}

// ============================================================================
// Portfolio page
// ============================================================================

function PortfolioPage({ quotes, workspace, onPickSymbol, auth, onWorkspaceChange }: { quotes: Record<string, LiveQuote>; workspace: Workspace; onPickSymbol: (sym: string) => void; auth: ReturnType<typeof useAuth>; onWorkspaceChange: () => void }) {
    const { isNarrow } = useViewport();
    const kpiCol = isNarrow ? "repeat(auto-fit, minmax(180px, 1fr))" : "repeat(auto-fit, minmax(220px, 1fr))";
    const innerCol = isNarrow ? "1fr" : "1fr 1fr";

    // Real positions from workspace + mark-to-market against live quotes.
    const positions = workspace.positions.map(p => {
        const price = quotes[p.symbol]?.price ?? p.averagePrice;
        const qty = p.quantity;
        const avg = p.averagePrice;
        const value = qty * price;
        const pnl = (price - avg) * qty;
        const pnlPct = avg ? ((price - avg) / avg) * 100 * (qty >= 0 ? 1 : -1) : 0;
        return { sym: p.symbol, price, avg, qty, value, pnl, pnlPct, series: priceWalk(`pos-${p.symbol}`, price, 20, 0.018) };
    });
    const totalValue = positions.reduce((s, p) => s + p.value, 0) + workspace.cashBalance;
    const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
    const openOrders = workspace.orders.filter(o => o.status === "Working").slice(0, 12);
    const recentFills = workspace.fills.slice(0, 12);
    const [cancelling, setCancelling] = useState<string | null>(null);

    async function cancelOrder(id: string) {
        if (!auth.token) return;
        setCancelling(id);
        try {
            const draft: Workspace = JSON.parse(JSON.stringify(workspace));
            draft.orders = draft.orders.map(o => o.id === id ? { ...o, status: "Cancelled", updatedAt: new Date().toISOString() } : o);
            const r = await authedFetch(auth.token, "/v1/workspaces/paper", { method: "PUT", body: JSON.stringify({ workspace: draft }) });
            if (!r.ok) throw new Error("Failed to cancel order.");
            pushToast("ok", `Order ${id} cancelled.`);
            onWorkspaceChange();
        } catch (e: any) {
            pushToast("err", e.message || "Cancel error");
        } finally {
            setCancelling(null);
        }
    }

    return (
        <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: T.text, margin: 0, letterSpacing: -0.5 }}>Portfolio</h1>

            <div style={{ display: "grid", gridTemplateColumns: kpiCol, gap: 16 }}>
                <KpiCard label="Net liq" value={fmtMoney(totalValue)} sub="Total portfolio value" />
                <KpiCard label="Unrealized P&L" value={fmtSignedMoney(totalPnl)} delta={(totalPnl / (totalValue - totalPnl)) * 100} accent={totalPnl >= 0} />
                <KpiCard label="Positions" value={String(positions.length)} sub="Active holdings" />
                <KpiCard label="Open orders" value={String(openOrders.length)} sub="Working" />
            </div>

            {positions.length === 0 ? (
                <Card>
                    <div style={{ padding: "24px 12px", textAlign: "center", color: T.textMuted }}>
                        <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.35 }}>◉</div>
                        <div style={{ color: T.text, fontWeight: 700, fontSize: 15 }}>No positions yet</div>
                        <div style={{ fontSize: 12.5, marginTop: 4 }}>Head to the Trade page and buy your first paper position.</div>
                    </div>
                </Card>
            ) : null}

            <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div>
                        <Eyebrow>Positions</Eyebrow>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginTop: 4 }}>Open holdings</div>
                    </div>
                    <Pill>Export CSV</Pill>
                </div>
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ color: T.textSubtle, fontSize: 10, letterSpacing: 1.5 }}>
                                <th style={th}>SYMBOL</th><th style={thR}>QTY</th><th style={thR}>AVG</th><th style={thR}>LAST</th><th style={thR}>VALUE</th><th style={thR}>P&amp;L</th><th style={thR}>%</th><th style={thR}>TREND</th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map(p => (
                                <tr key={p.sym} onClick={() => onPickSymbol(p.sym)} style={{ borderTop: `1px solid ${T.border}`, cursor: "pointer" }}>
                                    <td style={td}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><SymbolBadge sym={p.sym} /><span style={{ fontWeight: 700, color: T.text }}>{p.sym}</span></div></td>
                                    <td style={{ ...tdR, color: T.textMuted, fontFamily: T.mono }}>{p.qty}</td>
                                    <td style={{ ...tdR, color: T.textMuted, fontFamily: T.mono }}>{fmtMoney(p.avg)}</td>
                                    <td style={{ ...tdR, color: T.text, fontWeight: 600, fontFamily: T.mono }}>{fmtMoney(p.price)}</td>
                                    <td style={{ ...tdR, color: T.text, fontFamily: T.mono }}>{fmtMoney(p.value)}</td>
                                    <td style={{ ...tdR, color: p.pnl >= 0 ? T.positive : T.negative, fontWeight: 700, fontFamily: T.mono }}>{fmtSignedMoney(p.pnl)}</td>
                                    <td style={tdR}><Delta value={p.pnlPct} /></td>
                                    <td style={tdR}><Sparkline values={p.series} color={p.pnl >= 0 ? T.positive : T.negative} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: innerCol, gap: 16 }}>
                <Card>
                    <Eyebrow>Open orders</Eyebrow>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 10 }}>
                        <thead>
                            <tr style={{ color: T.textSubtle, fontSize: 10, letterSpacing: 1.5 }}><th style={th}>ID</th><th style={th}>SYM</th><th style={th}>SIDE</th><th style={thR}>QTY</th><th style={thR}>PRICE</th><th style={thR}>STATUS</th><th style={thR}></th></tr>
                        </thead>
                        <tbody>
                            {openOrders.length === 0 ? (
                                <tr><td colSpan={7} style={{ padding: "16px 10px", color: T.textSubtle, fontSize: 12 }}>No working orders.</td></tr>
                            ) : openOrders.map(o => (
                                <tr key={o.id} style={{ borderTop: `1px solid ${T.border}` }}>
                                    <td style={{ ...td, color: T.textMuted, fontFamily: T.mono }}>{o.id}</td>
                                    <td style={{ ...td, fontWeight: 700, color: T.text, cursor: "pointer" }} onClick={() => onPickSymbol(o.symbol)}>{o.symbol}</td>
                                    <td style={td}><span style={{ color: o.side === "Buy" ? T.positive : T.negative, fontWeight: 700 }}>{o.side}</span><span style={{ color: T.textSubtle, marginLeft: 6 }}>{o.type}</span></td>
                                    <td style={{ ...tdR, fontFamily: T.mono, color: T.textMuted }}>{o.quantity}</td>
                                    <td style={{ ...tdR, fontFamily: T.mono, color: T.text }}>{o.limitPrice ? fmtMoney(o.limitPrice) : o.stopPrice ? fmtMoney(o.stopPrice) : "—"}</td>
                                    <td style={tdR}><span style={{ color: T.warning, background: "rgba(251,191,36,0.14)", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{o.status}</span></td>
                                    <td style={tdR}>
                                        <button disabled={cancelling === o.id} onClick={() => cancelOrder(o.id)} style={{
                                            background: "transparent", border: `1px solid ${T.border}`, color: T.negative,
                                            padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                            cursor: cancelling === o.id ? "wait" : "pointer", fontFamily: T.font, opacity: cancelling === o.id ? 0.6 : 1
                                        }}>{cancelling === o.id ? "…" : "Cancel"}</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
                <Card>
                    <Eyebrow>Recent fills</Eyebrow>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 10 }}>
                        <thead><tr style={{ color: T.textSubtle, fontSize: 10, letterSpacing: 1.5 }}><th style={th}>FILL</th><th style={th}>SYM</th><th style={th}>SIDE</th><th style={thR}>QTY</th><th style={thR}>PRICE</th><th style={thR}>TIME</th></tr></thead>
                        <tbody>
                            {recentFills.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: "16px 10px", color: T.textSubtle, fontSize: 12 }}>No fills yet.</td></tr>
                            ) : recentFills.map(f => (
                                <tr key={f.id} style={{ borderTop: `1px solid ${T.border}` }}>
                                    <td style={{ ...td, color: T.textMuted, fontFamily: T.mono }}>{f.id}</td>
                                    <td style={{ ...td, fontWeight: 700, color: T.text }}>{f.symbol}</td>
                                    <td style={{ ...td, color: f.side === "Buy" ? T.positive : T.negative, fontWeight: 700 }}>{f.side}</td>
                                    <td style={{ ...tdR, fontFamily: T.mono, color: T.textMuted }}>{f.quantity}</td>
                                    <td style={{ ...tdR, fontFamily: T.mono, color: T.text }}>{fmtMoney(f.price)}</td>
                                    <td style={{ ...tdR, color: T.textSubtle, fontSize: 11 }}>{new Date(f.filledAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            </div>
        </div>
    );
}

// ============================================================================
// Globe page
// ============================================================================

function GlobePage() {
    const { isNarrow, w } = useViewport();
    const countries = useMemo(() => buildGlobalCoverageCountries(defaultSnapshot), []);
    const [selected, setSelected] = useState("US");
    const [metric, setMetric] = useState(metricDescriptors[0].key);
    const [autoSpin, setAutoSpin] = useState(true);
    const globeRef = useRef<GlobeMethods>();

    const active = countries.find(c => c.code === selected) ?? countries[0];
    const descriptor = metricDescriptors.find(d => d.key === metric) ?? metricDescriptors[0];

    const polygons = useMemo(
        () => buildAtlasCountryPolygons(countries, selected, metric),
        [countries, selected, metric]
    );

    // Only the selected country gets a label. Everything else is clean.
    const labels = useMemo(() => [{
        lat: active.position.latitude,
        lng: active.position.longitude,
        name: active.name,
        code: active.code
    }], [active]);

    // Size the globe canvas to the card, capped for premium look.
    const globeSize = useMemo(() => {
        const maxW = Math.min(w - (isNarrow ? 120 : 420), 820);
        return Math.max(360, maxW);
    }, [w, isNarrow]);
    const globeHeight = Math.min(globeSize, 560);

    // Matte black sphere material so orange highlights pop.
    const globeMaterial = useMemo(() => {
        const m = new MeshPhongMaterial({
            color: new Color("#0A0A0A"),
            emissive: new Color("#050505"),
            shininess: 0
        });
        return m;
    }, []);

    // Camera transition whenever selection changes.
    useEffect(() => {
        if (!globeRef.current) return;
        globeRef.current.pointOfView(
            { lat: active.position.latitude, lng: active.position.longitude, altitude: 1.8 },
            900
        );
        const controls = globeRef.current.controls();
        controls.autoRotate = autoSpin;
        controls.autoRotateSpeed = 0.35;
        controls.enablePan = false;
        controls.enableDamping = true;
        controls.minDistance = 180;
        controls.maxDistance = 420;
    }, [selected, autoSpin]);

    return (
        <div style={{ padding: "24px 28px 48px", display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "minmax(0, 1fr) 360px", gap: 16 }}>
            <Card style={{ padding: 0, overflow: "hidden" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: 20, gap: 12, flexWrap: "wrap", borderBottom: `1px solid ${T.border}` }}>
                    <div>
                        <Eyebrow>Global map</Eyebrow>
                        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginTop: 4 }}>{descriptor.label}</div>
                        <div style={{ color: T.textMuted, fontSize: 12.5, marginTop: 2 }}>Click any country to focus. The selected country rises and is colored by its current {descriptor.shortLabel.toLowerCase()} reading.</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {metricDescriptors.map(m => <Pill key={m.key} active={metric === m.key} onClick={() => setMetric(m.key)}>{m.shortLabel}</Pill>)}
                    </div>
                </div>

                {/* Globe canvas — matte black backdrop, centered */}
                <div style={{
                    position: "relative",
                    background: "radial-gradient(circle at 50% 55%, #0C0C0C 0%, #050505 70%)",
                    display: "flex", justifyContent: "center", alignItems: "center",
                    padding: 20
                }}>
                    <Globe
                        ref={globeRef as any}
                        width={globeSize}
                        height={globeHeight}
                        backgroundColor="rgba(0,0,0,0)"
                        globeMaterial={globeMaterial}
                        showAtmosphere
                        atmosphereColor={T.accent}
                        atmosphereAltitude={0.14}
                        showGraticules
                        polygonsData={polygons}
                        polygonGeoJsonGeometry="geometry"
                        polygonCapColor={(p: object) => (p as any).capColor}
                        polygonSideColor={(p: object) => (p as any).sideColor}
                        polygonStrokeColor={(p: object) => (p as any).strokeColor}
                        polygonAltitude={(p: object) => (p as any).altitude}
                        polygonLabel={(p: object) => {
                            const d = p as any;
                            return `<div style="font-family: Inter, sans-serif; padding: 6px 10px; background: #0E0E0E; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: #FAFAFA; font-size: 12px"><strong>${d.name}</strong> · ${d.metricLabel}</div>`;
                        }}
                        polygonsTransitionDuration={600}
                        onPolygonClick={(p: object) => { setAutoSpin(false); setSelected((p as any).code); }}
                        labelsData={labels}
                        labelLat="lat"
                        labelLng="lng"
                        labelText={(m: object) => (m as any).name}
                        labelSize={1.3}
                        labelColor={() => "#FAFAFA"}
                        labelDotRadius={0.55}
                        labelDotOrientation={() => "bottom"}
                        labelIncludeDot
                        labelResolution={2}
                        labelAltitude={0.014}
                    />
                    {/* Controls overlay */}
                    <div style={{ position: "absolute", bottom: 20, left: 20, display: "flex", gap: 8, zIndex: 5 }}>
                        <button onClick={() => setAutoSpin(s => !s)} style={globeCtrlBtn(autoSpin)}>
                            {autoSpin ? "⏸ Pause orbit" : "▶ Auto-orbit"}
                        </button>
                        <button onClick={() => { if (globeRef.current) globeRef.current.pointOfView({ lat: active.position.latitude, lng: active.position.longitude, altitude: 1.8 }, 800); }} style={globeCtrlBtn(false)}>
                            ⊕ Recenter
                        </button>
                    </div>
                    {/* Scale legend */}
                    <div style={{ position: "absolute", bottom: 20, right: 20, display: "flex", alignItems: "center", gap: 8, zIndex: 5, background: T.glass, border: `1px solid ${T.border}`, padding: "6px 10px", borderRadius: 999, backdropFilter: "blur(8px)" }}>
                        <span style={{ color: T.textSubtle, fontSize: 10.5, fontWeight: 600 }}>{descriptor.lowerLabel}</span>
                        <div style={{ width: 100, height: 6, borderRadius: 999, background: `linear-gradient(90deg, ${T.negative}, #525252, ${T.positive})` }} />
                        <span style={{ color: T.textSubtle, fontSize: 10.5, fontWeight: 600 }}>{descriptor.upperLabel}</span>
                    </div>
                </div>
            </Card>

            {/* Info panel — only country facts, no chart clutter. */}
            <Card>
                <Eyebrow>Focus country</Eyebrow>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    <span style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `linear-gradient(135deg, ${T.accent}, ${T.focus})`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, color: "#fff", fontSize: 14, letterSpacing: 0.5,
                        boxShadow: `0 6px 18px ${T.accentGlow}`
                    }}>{active.code}</span>
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>{active.name}</div>
                        <div style={{ color: T.textMuted, fontSize: 12 }}>{active.region} · {active.benchmark}</div>
                    </div>
                </div>

                {/* Primary metric value card */}
                <div style={{
                    marginTop: 16, padding: 14, borderRadius: 12,
                    background: T.surfaceAlt, border: `1px solid ${T.border}`
                }}>
                    <div style={{ color: T.textSubtle, fontSize: 10.5, letterSpacing: 1.5, fontWeight: 700 }}>{descriptor.label.toUpperCase()}</div>
                    <div style={{
                        fontSize: 30, fontWeight: 700, marginTop: 4,
                        color: active.metrics[metric] >= 0 ? T.positive : T.negative,
                        fontFamily: T.mono, letterSpacing: -0.5
                    }}>
                        {formatCountryMetric(active.metrics[metric], metric)}
                    </div>
                    <div style={{ color: T.textSubtle, fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>{descriptor.description}</div>
                </div>

                {/* Summary */}
                <div style={{ marginTop: 14, color: T.text, fontSize: 13, lineHeight: 1.55 }}>{active.summary}</div>

                {/* Macro stats grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
                    {active.macroStats.slice(0, 4).map(s => (
                        <div key={s.label} style={{ padding: 10, background: T.surfaceAlt, borderRadius: 10, border: `1px solid ${T.border}` }}>
                            <div style={{ color: T.textSubtle, fontSize: 10, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase" }}>{s.label}</div>
                            <div style={{ color: T.text, fontSize: 13.5, fontWeight: 700, marginTop: 4, fontFamily: T.mono }}>{s.value}</div>
                        </div>
                    ))}
                </div>

                {/* Top sectors */}
                <div style={{ marginTop: 16 }}>
                    <Eyebrow>Top sectors</Eyebrow>
                    <div style={{ marginTop: 6 }}>
                        {active.topSectors.map(s => (
                            <div key={s.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
                                <span style={{ color: T.text }}>{s.name}</span>
                                <Delta value={s.change} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top movers */}
                {active.movers && active.movers.length > 0 ? (
                    <div style={{ marginTop: 16 }}>
                        <Eyebrow>Top movers</Eyebrow>
                        <div style={{ marginTop: 6 }}>
                            {active.movers.slice(0, 3).map(m => (
                                <div key={m.symbol} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${T.border}` }}>
                                    <SymbolBadge sym={m.symbol} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ color: T.text, fontSize: 13, fontWeight: 700 }}>{m.symbol}</div>
                                        <div style={{ color: T.textSubtle, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                                    </div>
                                    <Delta value={m.change} />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </Card>
        </div>
    );
}

const globeCtrlBtn = (active: boolean): CSSProperties => ({
    padding: "7px 12px",
    background: active ? T.accentSoft : T.glass,
    border: `1px solid ${active ? T.accent : T.border}`,
    color: active ? T.accentStrong : T.text,
    borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
    fontFamily: T.font, backdropFilter: "blur(8px)"
});

function formatCountryMetric(v: number, metric: typeof metricDescriptors[number]["key"]): string {
    if (metric === "volatility") return `${v.toFixed(1)}%`;
    if (metric === "sectorStrength" || metric === "macroSentiment") return `${Math.round(v)} / 100`;
    const s = v > 0 ? "+" : "";
    return `${s}${v.toFixed(2)}%`;
}

// ============================================================================
// Account page
// ============================================================================

function AccountPage({ auth }: { auth: ReturnType<typeof useAuth> }) {
    const { isNarrow } = useViewport();
    const innerCol = isNarrow ? "1fr" : "1fr 1fr";
    const [busy, setBusy] = useState<string | null>(null);

    const go = async (tag: string, opts: Parameters<typeof startStripeCheckout>[1]) => {
        setBusy(tag);
        try { await startStripeCheckout(auth.token, opts); }
        catch (e: any) { pushToast("err", e.message || "Stripe error"); setBusy(null); }
    };

    return (
        <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: T.text, margin: 0, letterSpacing: -0.5 }}>Account</h1>
            <div style={{ display: "grid", gridTemplateColumns: innerCol, gap: 16 }}>
                <Card>
                    <Eyebrow>Profile</Eyebrow>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginTop: 4 }}>{auth.user?.displayName ?? "—"}</div>
                    <div style={{ color: T.textMuted, fontSize: 13, marginTop: 2 }}>{auth.user?.email ?? ""}</div>
                    <div style={{ marginTop: 14, padding: 12, background: T.surfaceAlt, borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 12.5, color: T.textMuted, display: "flex", flexDirection: "column", gap: 6 }}>
                        <Row k="User ID" v={auth.user?.id ?? "—"} />
                        <Row k="Role" v={(auth.user?.roles || []).join(", ") || "customer"} />
                        <Row k="Stripe status" v={auth.user?.stripeSubscriptionStatus ?? "inactive"} />
                    </div>
                    <button onClick={auth.logout} style={{ marginTop: 14, width: "100%", padding: "10px 14px", background: "transparent", border: `1px solid ${T.border}`, color: T.text, borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: T.font }}>Sign out</button>
                </Card>
                <Card>
                    <Eyebrow>Subscription</Eyebrow>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginTop: 4 }}>Atlas Free</div>
                    <div style={{ color: T.textMuted, fontSize: 13, marginTop: 6 }}>Delayed data, paper trading, 3 watchlists. Upgrade for real-time Level 1/2, AI signals, unlimited workspaces.</div>
                    <button disabled={busy === "upgrade"} onClick={() => go("upgrade", { name: "Atlas Pro — Monthly", amountCents: 1900, currency: "usd", recurring: "month", mode: "subscription", action: "upgrade" })} style={{ marginTop: 14, padding: "10px 16px", background: `linear-gradient(135deg, ${T.accent}, ${T.focus})`, color: "#fff", border: 0, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: busy === "upgrade" ? "wait" : "pointer", fontFamily: T.font, opacity: busy === "upgrade" ? 0.7 : 1 }}>
                        {busy === "upgrade" ? "Opening Stripe…" : "Upgrade to Pro — $19/mo"}
                    </button>
                </Card>
                <Card>
                    <Eyebrow>Funding</Eyebrow>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginTop: 4 }}>Paper cash</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: T.text, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>$48,234.12</div>
                    <div style={{ color: T.textSubtle, fontSize: 11.5, marginTop: 4 }}>Top up your paper balance via Stripe test card <code style={{ fontFamily: T.mono, background: T.surfaceAlt, padding: "1px 6px", borderRadius: 4 }}>4242 4242 4242 4242</code></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                        {[100, 500, 2500].map(amt => (
                            <button key={amt} disabled={busy === `dep-${amt}`} onClick={() => go(`dep-${amt}`, { name: `AtlasMarket deposit $${amt}`, amountCents: amt * 100, currency: "usd", mode: "payment", action: "deposit" })} style={actionBtn(T.positive, busy === `dep-${amt}`)}>
                                {busy === `dep-${amt}` ? "…" : `+ $${amt}`}
                            </button>
                        ))}
                    </div>
                </Card>
                <Card>
                    <Eyebrow>Security</Eyebrow>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                        <SecRow label="Two-factor auth" value="Enabled" on />
                        <SecRow label="Login alerts" value="Email" on />
                        <SecRow label="API access" value="Disabled" />
                        <SecRow label="Session timeout" value="30 days" />
                    </div>
                </Card>
                <Card>
                    <Eyebrow>Devices</Eyebrow>
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.text }}>Chrome · Windows</span><span style={{ color: T.positive, fontSize: 11, fontWeight: 700 }}>ACTIVE</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.textMuted }}>Safari · iPhone</span><span style={{ color: T.textSubtle, fontSize: 11 }}>2h ago</span></div>
                    </div>
                </Card>
            </div>
        </div>
    );
}

const actionBtn = (c: string, busy?: boolean): CSSProperties => ({
    flex: 1, padding: "10px 12px", background: c, color: "#fff", border: 0, borderRadius: 8,
    fontWeight: 700, fontSize: 13, cursor: busy ? "wait" : "pointer", fontFamily: T.font, opacity: busy ? 0.7 : 1
});

function SecRow({ label, value, on }: { label: string; value: string; on?: boolean }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
            <span style={{ color: T.text }}>{label}</span>
            <span style={{ color: on ? T.positive : T.textMuted, fontSize: 12, fontWeight: 700 }}>{value}</span>
        </div>
    );
}

// ============================================================================
// Login / Register screen
// ============================================================================

function AuthScreen({ auth }: { auth: ReturnType<typeof useAuth> }) {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        const ok = mode === "login" ? await auth.login(email, password) : await auth.register(email, password, name || email.split("@")[0]);
        setSubmitting(false);
        if (ok) pushToast("ok", mode === "login" ? "Welcome back." : "Account created. You're in.");
    }

    return (
        <div style={{
            minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
            background: `radial-gradient(1000px 600px at 20% 0%, ${T.accentSoft}, transparent 50%), radial-gradient(800px 500px at 100% 100%, rgba(234, 88, 12, 0.12), transparent 60%), ${T.canvas}`,
            padding: 24, fontFamily: T.font
        }}>
            <div style={{
                width: "100%", maxWidth: 420, background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 16, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02) inset"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: `linear-gradient(135deg, ${T.accent}, ${T.focus})`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, color: "#fff", fontSize: 18, boxShadow: `0 10px 30px ${T.accentGlow}`
                    }}>A</div>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: -0.3 }}>AtlasMarket</div>
                        <div style={{ color: T.textSubtle, fontSize: 12 }}>Global markets · paper trading</div>
                    </div>
                </div>

                <div style={{ display: "flex", background: T.surfaceAlt, padding: 4, borderRadius: 10, marginBottom: 20 }}>
                    {(["login", "register"] as const).map(m => (
                        <button key={m} type="button" onClick={() => setMode(m)} style={{
                            flex: 1, padding: "8px 10px", borderRadius: 8, border: 0, cursor: "pointer",
                            background: mode === m ? T.accent : "transparent",
                            color: mode === m ? "#fff" : T.textMuted, fontWeight: 700, fontSize: 13, fontFamily: T.font
                        }}>{m === "login" ? "Sign in" : "Create account"}</button>
                    ))}
                </div>

                <form onSubmit={submit}>
                    {mode === "register" ? (
                        <>
                            <label style={fieldLabel}>Display name</label>
                            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Jane Trader" style={field} />
                        </>
                    ) : null}
                    <label style={fieldLabel}>Email</label>
                    <input autoFocus={mode === "login"} value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="you@example.com" style={field} />
                    <label style={fieldLabel}>Password</label>
                    <input value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={8} placeholder="At least 8 characters" style={field} />

                    {auth.error ? (
                        <div style={{ marginTop: 14, padding: "8px 12px", background: T.negativeSoft, border: `1px solid ${T.negative}`, borderRadius: 8, color: T.negative, fontSize: 12.5 }}>
                            {auth.error}
                        </div>
                    ) : null}

                    <button type="submit" disabled={submitting} style={{
                        marginTop: 16, width: "100%", padding: "12px 14px",
                        background: `linear-gradient(135deg, ${T.accent}, ${T.focus})`,
                        color: "#fff", border: 0, borderRadius: 10,
                        fontWeight: 700, fontSize: 14, cursor: submitting ? "wait" : "pointer",
                        fontFamily: T.font, opacity: submitting ? 0.7 : 1,
                        boxShadow: `0 8px 24px ${T.accentGlow}`
                    }}>{submitting ? "…" : mode === "login" ? "Sign in" : "Create account"}</button>

                    <div style={{ marginTop: 14, color: T.textSubtle, fontSize: 11.5, textAlign: "center", lineHeight: 1.5 }}>
                        Paper trading — no real capital at risk. By continuing you accept the terms of service.
                    </div>
                </form>
            </div>
        </div>
    );
}

// ============================================================================
// Shell
// ============================================================================

export function PremiumApp() {
    const auth = useAuth();
    const [page, setPage] = useState<PageId>("dashboard");
    const { quotes, status, updatedAt } = useLiveFeed(LIVE_SYMBOLS);
    const { workspace, refresh: refreshWorkspace } = useWorkspace(auth.token);
    const [tradeSymbol, setTradeSymbol] = useState("AAPL");
    useStripeReturn(auth.token, workspace, refreshWorkspace);

    // Inject Google Fonts (Inter + JetBrains Mono) once.
    useEffect(() => {
        if (typeof document === "undefined") return;
        if (document.getElementById("atlas-fonts")) return;
        const link = document.createElement("link");
        link.id = "atlas-fonts";
        link.rel = "stylesheet";
        link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap";
        document.head.appendChild(link);
        document.body.style.margin = "0";
        document.body.style.background = T.canvas;
        document.body.style.color = T.text;
        document.body.style.fontFamily = T.font;
        document.body.style.fontFeatureSettings = "'ss01','cv11'";
    }, []);

    // Derive live net liq = cash + sum(positions · last price).
    const positionMtm = workspace.positions.reduce((s, p) => {
        const last = quotes[p.symbol]?.price ?? p.averagePrice;
        return s + p.quantity * last;
    }, 0);
    const totalBalance = workspace.cashBalance + positionMtm;

    // While we check for a persisted session.
    if (auth.loading) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.canvas, color: T.textMuted, fontFamily: T.font }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: T.accent, boxShadow: `0 0 12px ${T.accent}`, animation: "pulse 1.4s ease-in-out infinite" }} />
                    Connecting…
                </div>
            </div>
        );
    }

    if (!auth.user) {
        return <>
            <ToastRack />
            <AuthScreen auth={auth} />
        </>;
    }

    return (
        <div style={{
            display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", minHeight: "100vh",
            background: T.canvas, color: T.text, fontFamily: T.font
        }}>
            <ToastRack />
            <Sidebar page={page} setPage={setPage} user={auth.user} onLogout={auth.logout} />
            <main style={{ minWidth: 0, overflow: "hidden", background: `radial-gradient(1200px 600px at 0% 0%, ${T.accentSoft}, transparent 60%), ${T.canvas}` }}>
                <TopBar balance={totalBalance} status={status} updatedAt={updatedAt} user={auth.user} onGotoTrade={(sym) => { setTradeSymbol(sym); setPage("trade"); }} />
                {page === "dashboard" ? <DashboardPage quotes={quotes} workspace={workspace} /> : null}
                {page === "markets" ? <MarketsPage quotes={quotes} onPickSymbol={(s) => { setTradeSymbol(s); setPage("trade"); }} /> : null}
                {page === "trade" ? <TradePage quotes={quotes} auth={auth} symbol={tradeSymbol} setSymbol={setTradeSymbol} onOrderPlaced={refreshWorkspace} workspace={workspace} /> : null}
                {page === "portfolio" ? <PortfolioPage quotes={quotes} workspace={workspace} auth={auth} onWorkspaceChange={refreshWorkspace} onPickSymbol={(s) => { setTradeSymbol(s); setPage("trade"); }} /> : null}
                {page === "globe" ? <GlobePage /> : null}
                {page === "account" ? <AccountPage auth={auth} /> : null}
            </main>
        </div>
    );
}
