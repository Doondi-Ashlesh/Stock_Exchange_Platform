import {
    ATLASMARKET_API_BASE,
    ATLASMARKET_MARKET_DATA_MODE,
    MARKET_DATA_API_BASE,
    MARKET_DATA_API_KEY,
    MARKET_DATA_PROVIDER,
    MARKET_DATA_REFRESH_INTERVAL_MS,
    NEWS_DATA_API_BASE
} from "@env";

import { AtlasAssetResearch, AtlasCountry, AtlasHeadline, AtlasNewsFeedItem, AtlasSnapshot } from "../types/atlasmarket";
import { getStorageValue, saveToStorage } from "./storage";

export type AtlasLiveStatus = "disabled" | "loading" | "live" | "demo" | "error" | "replay";
export type AtlasMarketDataAccessMode = "disabled" | "direct" | "proxy";

export interface AtlasLiveQuote {
    atlasSymbol: string;
    providerSymbol: string;
    price: number;
    change: number;
    previousClose: number;
    open?: number;
    high?: number;
    low?: number;
    updatedAt: string;
}

export interface AtlasLiveBenchmarkQuote extends AtlasLiveQuote {
    countryCode: string;
    weeklyChange: number;
    series: number[];
}

export interface AtlasLiveAssetDetail extends AtlasLiveQuote {
    priceSeries: number[];
    headlines: AtlasHeadline[];
}

export interface AtlasLiveFeedState {
    status: AtlasLiveStatus;
    message: string;
    updatedAt?: string;
    assetQuotes: Record<string, AtlasLiveQuote>;
    benchmarkQuotes: Record<string, AtlasLiveBenchmarkQuote>;
    selectedAssetDetail?: AtlasLiveAssetDetail;
}

const LIVE_FEED_CACHE_PREFIX = "ATLASMARKET_LIVE_FEED_V1";
const DEFAULT_REFRESH_INTERVAL_MS = 300000;
const FEED_CACHE_TTL_MS = 240000;
const DETAIL_CACHE_TTL_MS = 180000;

const ATLAS_PROVIDER_SYMBOLS: Record<string, string> = {
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

const COUNTRY_BENCHMARK_SYMBOLS: Record<string, string> = {
    US: "SPY",
    BR: "EWZ",
    DE: "EWG",
    IN: "INDA",
    JP: "EWJ"
};

interface CachedLiveFeedState {
    timestamp: number;
    state: AtlasLiveFeedState;
}

interface AtlasMarketProxyFeedResponse {
    status?: AtlasLiveStatus;
    message?: string;
    updatedAt?: string;
    assetQuotes?: Record<string, AtlasLiveQuote>;
    benchmarkQuotes?: Record<string, AtlasLiveBenchmarkQuote>;
    selectedAssetDetail?: AtlasLiveAssetDetail;
}

interface AtlasMarketProxyAssetResponse {
    detail?: AtlasLiveAssetDetail;
}

interface FinnhubQuoteResponse {
    c: number;
    d: number;
    dp: number;
    h: number;
    l: number;
    o: number;
    pc: number;
    t: number;
}

interface FinnhubCandleResponse {
    c?: number[];
    s: string;
}

interface FinnhubNewsItem {
    datetime: number;
    headline: string;
    summary: string;
}

export function getAtlasLiveRefreshIntervalMs(): number {
    const parsed = Number(MARKET_DATA_REFRESH_INTERVAL_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REFRESH_INTERVAL_MS;
}

export function isAtlasDirectMarketDataConfigured(): boolean {
    return Boolean(
        MARKET_DATA_API_KEY
        && MARKET_DATA_API_BASE
        && !MARKET_DATA_API_BASE.includes("example.com")
        && MARKET_DATA_PROVIDER?.toLowerCase() !== "disabled"
    );
}

export function isAtlasPlatformMarketProxyConfigured(): boolean {
    return Boolean(
        ATLASMARKET_API_BASE
        && !ATLASMARKET_API_BASE.includes("example.com")
    );
}

export function getAtlasMarketDataAccessMode(): AtlasMarketDataAccessMode {
    const requestedMode = ATLASMARKET_MARKET_DATA_MODE?.trim().toLowerCase();
    const hasProxy = isAtlasPlatformMarketProxyConfigured();
    const hasDirect = isAtlasDirectMarketDataConfigured();

    if (requestedMode === "disabled") {
        return "disabled";
    }

    if (requestedMode === "proxy") {
        return hasProxy ? "proxy" : (hasDirect ? "direct" : "disabled");
    }

    if (requestedMode === "direct") {
        return hasDirect ? "direct" : (hasProxy ? "proxy" : "disabled");
    }

    if (hasProxy) {
        return "proxy";
    }

    return hasDirect ? "direct" : "disabled";
}

export function getAtlasMarketDataAccessModeLabel(): string {
    switch (getAtlasMarketDataAccessMode()) {
        case "proxy":
            return "Platform API Proxy";
        case "direct":
            return "Direct Provider";
        default:
            return "Demo Dataset";
    }
}

export function isAtlasLiveDataConfigured(): boolean {
    return getAtlasMarketDataAccessMode() !== "disabled";
}

export async function fetchAtlasLiveFeed(
    snapshot: AtlasSnapshot,
    watchlistSymbols: string[],
    selectedAssetSymbol?: string
): Promise<AtlasLiveFeedState> {
    if (snapshot.mode !== "Live") {
        return {
            status: "replay",
            message: `Replay mode active for ${snapshot.label}.`,
            assetQuotes: {},
            benchmarkQuotes: {}
        };
    }

    const accessMode = getAtlasMarketDataAccessMode();

    if (accessMode === "disabled") {
        return {
            status: "demo",
            message: "Configure the AtlasMarket platform API or a direct provider key to enable live quotes. AtlasMarket is using its built-in dataset right now.",
            assetQuotes: {},
            benchmarkQuotes: {}
        };
    }

    const cacheKey = `${LIVE_FEED_CACHE_PREFIX}:${selectedAssetSymbol ?? "none"}`;
    const cachedState = await readCachedState(cacheKey, FEED_CACHE_TTL_MS);

    if (cachedState) {
        return cachedState;
    }

    if (accessMode === "proxy") {
        const proxyFeed = await fetchPlatformLiveFeed(snapshot, watchlistSymbols, selectedAssetSymbol);

        if (proxyFeed) {
            await saveCachedState(cacheKey, proxyFeed);
            return proxyFeed;
        }

        if (!isAtlasDirectMarketDataConfigured()) {
            return {
                status: "error",
                message: "AtlasMarket could not reach its market-data proxy and no direct provider fallback is configured.",
                assetQuotes: {},
                benchmarkQuotes: {}
            };
        }
    }

    const trackedSymbols = resolveTrackedSymbols(snapshot, watchlistSymbols);
    const quoteEntries = await Promise.all(
        trackedSymbols.map(async (atlasSymbol) => {
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
                price: quote.price,
                change: quote.change,
                previousClose: quote.previousClose,
                open: quote.open,
                high: quote.high,
                low: quote.low,
                updatedAt: quote.updatedAt
            }] as const;
        })
    );

    const benchmarkEntries = await Promise.all(
        Object.entries(COUNTRY_BENCHMARK_SYMBOLS).map(async ([countryCode, providerSymbol]) => {
            const quote = await fetchProviderQuote(providerSymbol);
            const series = await fetchProviderCandleSeries(providerSymbol, 14);

            if (!quote) {
                return null;
            }

            const atlasSymbol = `BENCH-${countryCode}`;

            return [countryCode, {
                atlasSymbol,
                providerSymbol,
                countryCode,
                price: quote.price,
                change: quote.change,
                previousClose: quote.previousClose,
                open: quote.open,
                high: quote.high,
                low: quote.low,
                updatedAt: quote.updatedAt,
                weeklyChange: computeWeeklyChange(series, quote.price),
                series: series.length > 1 ? series : [quote.previousClose || quote.price, quote.price]
            }] as const;
        })
    );

    const selectedAssetDetail = selectedAssetSymbol ? await fetchAtlasLiveAssetDetail(selectedAssetSymbol) : undefined;
    const assetQuotes = Object.fromEntries(quoteEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
    const benchmarkQuotes = Object.fromEntries(benchmarkEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
    const liveCount = Object.keys(assetQuotes).length + Object.keys(benchmarkQuotes).length;

    const state: AtlasLiveFeedState = liveCount > 0
        ? {
            status: "live",
            message: `Live data connected for ${Object.keys(assetQuotes).length} mapped assets and ${Object.keys(benchmarkQuotes).length} benchmark proxies.`,
            updatedAt: new Date().toISOString(),
            assetQuotes,
            benchmarkQuotes,
            selectedAssetDetail
        }
        : {
            status: "error",
            message: "AtlasMarket could not refresh the provider feed, so the app stayed on its local dataset.",
            assetQuotes: {},
            benchmarkQuotes: {},
            selectedAssetDetail
        };

    await saveCachedState(cacheKey, state);
    return state;
}

export async function fetchAtlasLiveAssetDetail(atlasSymbol: string): Promise<AtlasLiveAssetDetail | undefined> {
    if (!isAtlasLiveDataConfigured()) {
        return undefined;
    }

    const accessMode = getAtlasMarketDataAccessMode();

    const providerSymbol = resolveProviderSymbol(atlasSymbol);

    const cacheKey = `${LIVE_FEED_CACHE_PREFIX}:detail:${atlasSymbol}`;
    const cachedState = await readCachedState(cacheKey, DETAIL_CACHE_TTL_MS);

    if (cachedState?.selectedAssetDetail?.atlasSymbol === atlasSymbol) {
        return cachedState.selectedAssetDetail;
    }

    if (accessMode === "proxy") {
        const detail = await fetchPlatformLiveAssetDetail(atlasSymbol);

        if (detail) {
            await saveCachedState(cacheKey, {
                status: "live",
                message: "Selected asset detail refreshed from the platform API.",
                updatedAt: detail.updatedAt,
                assetQuotes: {},
                benchmarkQuotes: {},
                selectedAssetDetail: detail
            });
            return detail;
        }

        if (!providerSymbol || !isAtlasDirectMarketDataConfigured()) {
            return undefined;
        }
    }

    if (!providerSymbol) {
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

    const detail: AtlasLiveAssetDetail = {
        atlasSymbol,
        providerSymbol,
        price: quote.price,
        change: quote.change,
        previousClose: quote.previousClose,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        updatedAt: quote.updatedAt,
        priceSeries: series.length > 1 ? series : [quote.previousClose || quote.price, quote.price],
        headlines
    };

    await saveCachedState(cacheKey, {
        status: "live",
        message: "Selected asset detail refreshed.",
        updatedAt: detail.updatedAt,
        assetQuotes: {},
        benchmarkQuotes: {},
        selectedAssetDetail: detail
    });

    return detail;
}

export function applyLiveDataToSnapshot(snapshot: AtlasSnapshot, feed: AtlasLiveFeedState): AtlasSnapshot {
    if (feed.status !== "live" || (Object.keys(feed.assetQuotes).length === 0 && Object.keys(feed.benchmarkQuotes).length === 0)) {
        return snapshot;
    }

    const countries = snapshot.countries.map((country) => {
        const benchmarkQuote = feed.benchmarkQuotes[country.code];
        const movers = country.movers.map((mover) => {
            const quote = feed.assetQuotes[mover.symbol];

            return quote
                ? { ...mover, price: quote.price, change: quote.change }
                : mover;
        });
        const thesisQuote = feed.assetQuotes[country.thesis.symbol];
        const topHeadline = feed.selectedAssetDetail?.atlasSymbol === country.thesis.symbol
            ? feed.selectedAssetDetail.headlines.slice(0, 2)
            : country.headlines;

        return {
            ...country,
            benchmarkSeries: benchmarkQuote?.series ?? country.benchmarkSeries,
            metrics: {
                ...country.metrics,
                dailyReturn: benchmarkQuote?.change ?? country.metrics.dailyReturn,
                weeklyReturn: benchmarkQuote?.weeklyChange ?? country.metrics.weeklyReturn
            },
            movers,
            headlines: topHeadline,
            thesis: thesisQuote
                ? {
                    ...country.thesis,
                    entryPrice: thesisQuote.price
                }
                : country.thesis
        };
    });

    const watchlist = snapshot.watchlist.map((item) => {
        const quote = feed.assetQuotes[item.symbol];

        return quote
            ? {
                ...item,
                lastPrice: quote.price,
                change: quote.change,
                note: `${item.note.split(" | ")[0]} | Live`
            }
            : item;
    });

    const globalMovers = snapshot.globalMovers.map((mover) => {
        const quote = feed.assetQuotes[mover.symbol];

        return quote
            ? { ...mover, price: quote.price, change: quote.change }
            : mover;
    });

    const newsFeed = buildLiveNewsFeed(snapshot, feed);
    const averageDailyMove = countries.reduce((sum, country) => sum + country.metrics.dailyReturn, 0) / countries.length;

    return {
        ...snapshot,
        narrative: `Live market feed connected. ${snapshot.narrative}`,
        countries,
        watchlist,
        globalMovers,
        newsFeed: newsFeed.length > 0 ? newsFeed : snapshot.newsFeed,
        globalStats: snapshot.globalStats.map((stat) => {
            if (stat.label === "Risk-On Score") {
                return { ...stat, value: `${Math.max(0, Math.min(100, Math.round((averageDailyMove + 4) * 12.5)))} / 100`, tone: averageDailyMove >= 0 ? "positive" : "negative" as const };
            }

            if (stat.label === "FX Pulse") {
                return { ...stat, value: feed.updatedAt ? `Feed ${formatTimestamp(feed.updatedAt)}` : stat.value, tone: "neutral" as const };
            }

            return stat;
        })
    };
}

export function applyLiveDetailToAsset(asset: AtlasAssetResearch, detail?: AtlasLiveAssetDetail): AtlasAssetResearch {
    if (!detail || detail.atlasSymbol !== asset.symbol) {
        return asset;
    }

    const firstHeadline = detail.headlines[0];

    return {
        ...asset,
        price: detail.price,
        change: detail.change,
        priceSeries: detail.priceSeries,
        support: roundPrice(Math.min(...detail.priceSeries) * 0.995),
        resistance: roundPrice(Math.max(...detail.priceSeries) * 1.005),
        catalyst: firstHeadline?.catalyst ?? asset.catalyst,
        summary: firstHeadline
            ? `${asset.name} is updating from the live provider feed, with ${firstHeadline.catalyst.toLowerCase()} leading the current read.`
            : asset.summary
    };
}

function resolveTrackedSymbols(snapshot: AtlasSnapshot, watchlistSymbols: string[]): string[] {
    const tracked = new Set<string>();

    snapshot.watchlist.forEach((item) => tracked.add(item.symbol));
    snapshot.positions.forEach((position) => tracked.add(position.symbol));
    snapshot.countries.forEach((country) => {
        tracked.add(country.thesis.symbol);
        country.movers.forEach((mover) => tracked.add(mover.symbol));
    });
    watchlistSymbols.forEach((symbol) => tracked.add(symbol));

    return [...tracked];
}

function resolveProviderSymbol(atlasSymbol: string): string | undefined {
    return ATLAS_PROVIDER_SYMBOLS[atlasSymbol] ?? (atlasSymbol.includes(".") ? atlasSymbol : undefined);
}

async function fetchProviderQuote(providerSymbol: string): Promise<Omit<AtlasLiveQuote, "atlasSymbol" | "providerSymbol"> | undefined> {
    const response = await fetchJson<FinnhubQuoteResponse>("/quote", { symbol: providerSymbol });

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

async function fetchProviderCandleSeries(providerSymbol: string, lookbackDays: number): Promise<number[]> {
    const now = Math.floor(Date.now() / 1000);
    const from = now - (lookbackDays * 86400);
    const response = await fetchJson<FinnhubCandleResponse>("/stock/candle", {
        symbol: providerSymbol,
        resolution: "D",
        from: String(from),
        to: String(now)
    });

    if (!response || response.s !== "ok" || !response.c?.length) {
        return [];
    }

    return response.c.slice(-12).map((value) => roundPrice(value));
}

async function fetchProviderNews(providerSymbol: string): Promise<AtlasHeadline[]> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (6 * 86400000));
    const response = await fetchJson<FinnhubNewsItem[]>("/company-news", {
        symbol: providerSymbol,
        from: formatDate(startDate),
        to: formatDate(endDate)
    }, NEWS_DATA_API_BASE || MARKET_DATA_API_BASE);

    if (!Array.isArray(response)) {
        return [];
    }

    return response.slice(0, 3).map((item) => ({
        time: formatTimestamp(new Date(item.datetime * 1000).toISOString()),
        headline: item.headline,
        catalyst: item.summary ? item.summary.slice(0, 92) : "Live company news",
        tone: "neutral" as const
    }));
}

async function fetchPlatformLiveFeed(
    snapshot: AtlasSnapshot,
    watchlistSymbols: string[],
    selectedAssetSymbol?: string
): Promise<AtlasLiveFeedState | undefined> {
    const apiBase = getPlatformApiBase();

    if (!apiBase) {
        return undefined;
    }

    try {
        const url = new URL("/v1/market/feed", ensureTrailingSlash(apiBase));
        const trackedSymbols = resolveTrackedSymbols(snapshot, watchlistSymbols);
        const benchmarkSymbols = Object.entries(COUNTRY_BENCHMARK_SYMBOLS).map(([countryCode, symbol]) => `${countryCode}:${symbol}`);

        url.searchParams.set("snapshotDate", snapshot.date);
        url.searchParams.set("mode", snapshot.mode);

        if (trackedSymbols.length > 0) {
            url.searchParams.set("symbols", trackedSymbols.join(","));
        }

        if (benchmarkSymbols.length > 0) {
            url.searchParams.set("benchmarks", benchmarkSymbols.join(","));
        }

        if (selectedAssetSymbol) {
            url.searchParams.set("selectedSymbol", selectedAssetSymbol);
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
            return undefined;
        }

        const payload = await response.json() as AtlasMarketProxyFeedResponse;
        return normalizeProxyFeed(payload);
    } catch {
        return undefined;
    }
}

async function fetchPlatformLiveAssetDetail(atlasSymbol: string): Promise<AtlasLiveAssetDetail | undefined> {
    const apiBase = getPlatformApiBase();

    if (!apiBase) {
        return undefined;
    }

    try {
        const url = new URL(`/v1/market/assets/${encodeURIComponent(atlasSymbol)}`, ensureTrailingSlash(apiBase));
        const response = await fetch(url.toString());

        if (!response.ok) {
            return undefined;
        }

        const payload = await response.json() as AtlasMarketProxyAssetResponse | AtlasLiveAssetDetail;

        if ("detail" in payload && payload.detail) {
            return payload.detail;
        }

        if ("atlasSymbol" in payload) {
            return payload;
        }
    } catch {
        return undefined;
    }

    return undefined;
}

async function fetchJson<T>(path: string, query: Record<string, string>, baseOverride?: string): Promise<T | undefined> {
    try {
        const url = new URL(path, ensureTrailingSlash(baseOverride ?? MARKET_DATA_API_BASE));
        Object.entries(query).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
        url.searchParams.set("token", MARKET_DATA_API_KEY);

        const response = await fetch(url.toString());

        if (!response.ok) {
            return undefined;
        }

        return response.json() as Promise<T>;
    } catch {
        return undefined;
    }
}

async function readCachedState(cacheKey: string, ttlMs: number): Promise<AtlasLiveFeedState | undefined> {
    const raw = await getStorageValue(cacheKey);

    if (!raw) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(raw) as CachedLiveFeedState;
        if ((Date.now() - parsed.timestamp) <= ttlMs) {
            return parsed.state;
        }
    } catch {
        return undefined;
    }

    return undefined;
}

async function saveCachedState(cacheKey: string, state: AtlasLiveFeedState): Promise<void> {
    await saveToStorage(cacheKey, JSON.stringify({ timestamp: Date.now(), state } satisfies CachedLiveFeedState));
}

function normalizeProxyFeed(payload: AtlasMarketProxyFeedResponse): AtlasLiveFeedState | undefined {
    if (!payload || typeof payload !== "object") {
        return undefined;
    }

    return {
        status: normalizeLiveStatus(payload.status),
        message: typeof payload.message === "string" && payload.message.trim()
            ? payload.message
            : "AtlasMarket received a live market update from its platform API.",
        updatedAt: payload.updatedAt,
        assetQuotes: payload.assetQuotes ?? {},
        benchmarkQuotes: payload.benchmarkQuotes ?? {},
        selectedAssetDetail: payload.selectedAssetDetail
    };
}

function normalizeLiveStatus(value?: AtlasLiveStatus): AtlasLiveStatus {
    if (value === "disabled" || value === "loading" || value === "live" || value === "demo" || value === "error" || value === "replay") {
        return value;
    }

    return "live";
}

function buildLiveNewsFeed(snapshot: AtlasSnapshot, feed: AtlasLiveFeedState): AtlasNewsFeedItem[] {
    const items: AtlasNewsFeedItem[] = [];

    if (feed.selectedAssetDetail?.headlines?.length) {
        items.push(...feed.selectedAssetDetail.headlines.map((headline, index) => ({
            id: `live-news-${feed.selectedAssetDetail?.atlasSymbol}-${index}`,
            region: snapshot.countries.find((country) => country.thesis.symbol === feed.selectedAssetDetail?.atlasSymbol)?.name ?? "Market",
            headline: headline.headline,
            catalyst: headline.catalyst,
            time: headline.time,
            tone: headline.tone
        })));
    }

    return items.slice(0, 3);
}

function computeWeeklyChange(series: number[], latestPrice: number): number {
    if (series.length < 2) {
        return 0;
    }

    const comparison = series[Math.max(0, series.length - 6)] ?? series[0];
    return computePercentChange(comparison, latestPrice);
}

function computePercentChange(previous: number, current: number): number {
    if (!previous) {
        return 0;
    }

    return roundMetric(((current - previous) / previous) * 100);
}

function ensureTrailingSlash(value: string): string {
    return value.endsWith("/") ? value : `${value}/`;
}

function getPlatformApiBase(): string | undefined {
    return ATLASMARKET_API_BASE && !ATLASMARKET_API_BASE.includes("example.com")
        ? ATLASMARKET_API_BASE
        : undefined;
}

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function formatTimestamp(isoString: string): string {
    return new Date(isoString).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit"
    });
}

function roundPrice(value: number): number {
    return Math.round(value * 100) / 100;
}

function roundMetric(value: number): number {
    return Math.round(value * 10) / 10;
}
