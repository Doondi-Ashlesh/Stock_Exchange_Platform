import { expect, jest, test } from "@jest/globals";

jest.mock("@env", () => ({
    ATLASMARKET_API_BASE: "",
    ATLASMARKET_MARKET_DATA_MODE: "direct",
    MARKET_DATA_PROVIDER: "finnhub",
    MARKET_DATA_API_BASE: "https://finnhub.io/api/v1",
    MARKET_DATA_API_KEY: "demo-key",
    NEWS_DATA_API_BASE: "https://finnhub.io/api/v1",
    MARKET_DATA_REFRESH_INTERVAL_MS: "300000"
}), { virtual: true });

jest.mock("./storage", () => ({
    getStorageValue: jest.fn(async () => null),
    saveToStorage: jest.fn(async () => undefined)
}));

import { defaultSnapshot } from "./atlasMarketData";
import { applyLiveDataToSnapshot, applyLiveDetailToAsset, AtlasLiveFeedState } from "./atlasLiveData";
import { buildAssetCatalog } from "./atlasMarketData";

test("live feed merges quote updates into the base snapshot", () => {
    const liveFeed: AtlasLiveFeedState = {
        status: "live",
        message: "Live data connected.",
        updatedAt: "2026-03-15T10:15:00.000Z",
        assetQuotes: {
            NVDA: {
                atlasSymbol: "NVDA",
                providerSymbol: "NVDA",
                price: 975.44,
                change: 2.8,
                previousClose: 948.32,
                updatedAt: "2026-03-15T10:15:00.000Z"
            }
        },
        benchmarkQuotes: {
            US: {
                atlasSymbol: "BENCH-US",
                providerSymbol: "SPY",
                countryCode: "US",
                price: 534.12,
                change: 1.1,
                weeklyChange: 2.4,
                previousClose: 528.32,
                updatedAt: "2026-03-15T10:15:00.000Z",
                series: [523.2, 525.6, 528.1, 531.4, 534.12]
            }
        }
    };

    const merged = applyLiveDataToSnapshot(defaultSnapshot, liveFeed);
    const us = merged.countries.find((country) => country.code === "US");

    expect(us?.metrics.dailyReturn).toBe(1.1);
    expect(us?.metrics.weeklyReturn).toBe(2.4);
    expect(us?.movers.find((mover) => mover.symbol === "NVDA")?.price).toBe(975.44);
    expect(merged.watchlist.find((item) => item.symbol === "NVDA")?.lastPrice).toBe(975.44);
});

test("live asset detail upgrades the research asset chart and summary", () => {
    const asset = buildAssetCatalog(defaultSnapshot).find((item) => item.symbol === "NVDA");

    expect(asset).toBeDefined();

    const updated = applyLiveDetailToAsset(asset!, {
        atlasSymbol: "NVDA",
        providerSymbol: "NVDA",
        price: 980.22,
        change: 3.4,
        previousClose: 948.32,
        updatedAt: "2026-03-15T10:15:00.000Z",
        priceSeries: [930.1, 941.5, 952.4, 968.8, 980.22],
        headlines: [
            {
                time: "10:14 AM",
                headline: "Chip demand remains strong into the open.",
                catalyst: "Demand update",
                tone: "neutral"
            }
        ]
    });

    expect(updated.price).toBe(980.22);
    expect(updated.priceSeries[updated.priceSeries.length - 1]).toBe(980.22);
    expect(updated.catalyst).toBe("Demand update");
});
