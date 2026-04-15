import worldCountries, { Country as WorldCountry } from "world-countries";

import { AtlasCountry, AtlasSnapshot, MarketMetricKey } from "../types/atlasmarket";

const REGION_SECTORS: Record<string, string[]> = {
    "North America": ["Semiconductors", "Software", "Financials", "Industrials", "Health Care"],
    "Latin America": ["Materials", "Energy", "Banks", "Utilities", "Consumer"],
    Europe: ["Industrials", "Software", "Autos", "Luxury", "Banks"],
    Asia: ["Financials", "Technology", "Capital Goods", "Internet", "Semicap"],
    Africa: ["Materials", "Banks", "Telecom", "Energy", "Industrials"],
    Oceania: ["Materials", "Energy", "Banks", "Health Care", "Consumer"]
};

const REGION_BENCHMARKS: Record<string, string> = {
    "North America": "Regional Equity Index",
    "Latin America": "Regional Equity Index",
    Europe: "Pan-Europe Index",
    Asia: "Regional Growth Index",
    Africa: "Pan-Africa Index",
    Oceania: "Pacific Equity Index"
};

export function buildGlobalCoverageCountries(snapshot: AtlasSnapshot): AtlasCountry[] {
    const detailedCountries = new Map(snapshot.countries.map((country) => [country.code, country]));

    return worldCountries
        .filter((country) => country.latlng?.length === 2 && country.region !== "Antarctic")
        .map((country) => {
            const detailed = detailedCountries.get(country.cca2);

            if (detailed) {
                return detailed;
            }

            return buildSyntheticCountry(country, snapshot);
        })
        .sort((left, right) => left.name.localeCompare(right.name));
}

function buildSyntheticCountry(country: WorldCountry, snapshot: AtlasSnapshot): AtlasCountry {
    const region = normalizeRegion(country);
    const regionBase = getRegionalBaseMetrics(snapshot, region);
    const seed = hashString(`${country.cca2}-${snapshot.date}`);
    const metrics = buildSyntheticMetrics(regionBase, seed);
    const topSectors = buildSyntheticSectors(region, seed, metrics.dailyReturn);
    const benchmarkSeries = buildSyntheticSeries(seed, metrics.dailyReturn, metrics.weeklyReturn);
    const benchmark = REGION_BENCHMARKS[region] ?? `${country.name.common} Equity Index`;
    const currency = Object.keys(country.currencies ?? {})[0] ?? "USD";
    const localTone = metrics.dailyReturn >= 0 ? "constructive" : "defensive";

    return {
        code: country.cca2,
        name: country.name.common,
        region,
        benchmark,
        currency,
        summary: `${country.name.common} is trading with ${localTone} breadth as ${topSectors[0].name.toLowerCase()} sets the tone across local risk assets.`,
        position: buildLegacyPosition(country),
        metrics,
        benchmarkSeries,
        topSectors,
        movers: topSectors.slice(0, 2).map((sector, index) => ({
            symbol: `${country.cca2}${index === 0 ? "1" : "2"}`,
            name: `${country.name.common} ${sector.name}`,
            countryCode: country.cca2,
            sector: sector.name,
            price: roundPrice(18 + seededRange(seed, index + 1, 0, 220)),
            change: roundMetric(metrics.dailyReturn + seededCentered(seed, index + 3, 1.6))
        })),
        headlines: [
            {
                time: "Local session",
                headline: `${country.name.common} breadth remains ${localTone} into the latest close.`,
                catalyst: `${topSectors[0].name} leadership`,
                tone: metrics.dailyReturn >= 0 ? "positive" : "negative"
            },
            {
                time: "Macro crosscheck",
                headline: `${currency} flows and sector rotation are driving relative performance.`,
                catalyst: "Cross-asset readthrough",
                tone: "neutral"
            }
        ],
        macroStats: [
            { label: "FX", value: `${currency} pulse ${metrics.currencyMovement >= 0 ? "firm" : "soft"}` },
            { label: "Breadth", value: `${Math.round(metrics.sectorStrength)} / 100` },
            { label: "Volatility", value: `${metrics.volatility.toFixed(1)}%` }
        ],
        thesis: {
            symbol: `${country.cca2}1`,
            company: `${country.name.common} ${topSectors[0].name}`,
            direction: metrics.dailyReturn >= 0 ? "Long" : "Short",
            entryPrice: roundPrice(benchmarkSeries[benchmarkSeries.length - 1]),
            stopLoss: roundPrice(benchmarkSeries[benchmarkSeries.length - 1] * (metrics.dailyReturn >= 0 ? 0.97 : 1.03)),
            targetPrice: roundPrice(benchmarkSeries[benchmarkSeries.length - 1] * (metrics.dailyReturn >= 0 ? 1.06 : 0.94)),
            conviction: clamp(Math.round(metrics.sectorStrength), 35, 88),
            timeHorizon: "1-4 weeks",
            catalyst: `${topSectors[0].name} leadership and regional breadth rotation`,
            rationale: `${country.name.common} is trading with a ${localTone} local setup while ${topSectors[0].name.toLowerCase()} leads the move.`,
            riskNotes: "World-coverage estimates are directional and intended for AtlasMarket research and replay workflows."
        }
    };
}

function buildLegacyPosition(country: WorldCountry) {
    const latitude = country.latlng[0];
    const longitude = country.latlng[1];

    return {
        x: Math.round(((longitude + 180) / 360) * 380),
        y: Math.round(((90 - latitude) / 180) * 180),
        labelOffsetX: longitude >= 0 ? 12 : -14,
        labelOffsetY: latitude >= 0 ? -12 : 16,
        longitude,
        latitude
    };
}

function buildSyntheticMetrics(base: Record<MarketMetricKey, number>, seed: number): Record<MarketMetricKey, number> {
    return {
        dailyReturn: clampSigned(base.dailyReturn * 0.72 + seededCentered(seed, 1, 1.4), -4.4, 4.4),
        weeklyReturn: clampSigned(base.weeklyReturn * 0.78 + seededCentered(seed, 2, 3.6), -9.5, 9.5),
        volatility: clamp(base.volatility * 0.92 + seededCentered(seed, 3, 5.8), 9.8, 38.2),
        sectorStrength: clamp(base.sectorStrength * 0.86 + seededCentered(seed, 4, 18), 18, 92),
        macroSentiment: clamp(base.macroSentiment * 0.84 + seededCentered(seed, 5, 20), 15, 90),
        currencyMovement: clampSigned(base.currencyMovement * 0.7 + seededCentered(seed, 6, 1.25), -3.2, 3.2),
        relativePerformance: clampSigned(base.relativePerformance * 0.8 + seededCentered(seed, 7, 1.6), -4.2, 4.2)
    };
}

function buildSyntheticSectors(region: string, seed: number, dailyReturn: number) {
    const sectorDeck = REGION_SECTORS[region] ?? ["Industrials", "Banks", "Technology", "Materials", "Energy"];
    const startingIndex = Math.floor(seededRange(seed, 8, 0, sectorDeck.length));

    return [0, 1, 2].map((offset) => {
        const name = sectorDeck[(startingIndex + offset) % sectorDeck.length];
        const change = clampSigned((dailyReturn * (1.08 - (offset * 0.12))) + seededCentered(seed, 9 + offset, 1.1), -5.8, 5.8);

        return { name, change };
    });
}

function buildSyntheticSeries(seed: number, dailyReturn: number, weeklyReturn: number): number[] {
    const start = 92 + seededRange(seed, 10, 18, 180);
    const step = weeklyReturn / 6;
    const points = [start];

    for (let index = 1; index < 7; index += 1) {
        const drift = step + seededCentered(seed, 11 + index, 1.8) + (dailyReturn * 0.15);
        points.push(roundPrice(Math.max(14, points[index - 1] + drift)));
    }

    return points;
}

function getRegionalBaseMetrics(snapshot: AtlasSnapshot, region: string): Record<MarketMetricKey, number> {
    const all = snapshot.countries;
    const average = averageMetrics(all);

    switch (region) {
        case "North America":
            return findMetrics(snapshot, "US") ?? average;
        case "Latin America":
            return findMetrics(snapshot, "BR") ?? average;
        case "Europe":
            return findMetrics(snapshot, "DE") ?? average;
        case "Asia":
            return blendMetrics([
                findMetrics(snapshot, "IN") ?? average,
                findMetrics(snapshot, "JP") ?? average
            ]);
        case "Africa":
            return blendMetrics([
                findMetrics(snapshot, "BR") ?? average,
                average
            ]);
        case "Oceania":
            return blendMetrics([
                findMetrics(snapshot, "US") ?? average,
                findMetrics(snapshot, "JP") ?? average
            ]);
        default:
            return average;
    }
}

function averageMetrics(countries: AtlasCountry[]): Record<MarketMetricKey, number> {
    const totals = countries.reduce((accumulator, country) => {
        (Object.keys(country.metrics) as MarketMetricKey[]).forEach((metric) => {
            accumulator[metric] += country.metrics[metric];
        });
        return accumulator;
    }, {
        dailyReturn: 0,
        weeklyReturn: 0,
        volatility: 0,
        sectorStrength: 0,
        macroSentiment: 0,
        currencyMovement: 0,
        relativePerformance: 0
    } as Record<MarketMetricKey, number>);

    return {
        dailyReturn: totals.dailyReturn / countries.length,
        weeklyReturn: totals.weeklyReturn / countries.length,
        volatility: totals.volatility / countries.length,
        sectorStrength: totals.sectorStrength / countries.length,
        macroSentiment: totals.macroSentiment / countries.length,
        currencyMovement: totals.currencyMovement / countries.length,
        relativePerformance: totals.relativePerformance / countries.length
    };
}

function blendMetrics(metrics: Record<MarketMetricKey, number>[]): Record<MarketMetricKey, number> {
    return {
        dailyReturn: averageValue(metrics, "dailyReturn"),
        weeklyReturn: averageValue(metrics, "weeklyReturn"),
        volatility: averageValue(metrics, "volatility"),
        sectorStrength: averageValue(metrics, "sectorStrength"),
        macroSentiment: averageValue(metrics, "macroSentiment"),
        currencyMovement: averageValue(metrics, "currencyMovement"),
        relativePerformance: averageValue(metrics, "relativePerformance")
    };
}

function averageValue(metrics: Record<MarketMetricKey, number>[], metric: MarketMetricKey): number {
    return metrics.reduce((sum, current) => sum + current[metric], 0) / metrics.length;
}

function findMetrics(snapshot: AtlasSnapshot, countryCode: string) {
    return snapshot.countries.find((country) => country.code === countryCode)?.metrics;
}

function normalizeRegion(country: WorldCountry): string {
    if (country.region === "Americas") {
        return country.subregion.includes("North") ? "North America" : "Latin America";
    }

    if (country.region === "Asia" || country.region === "Europe" || country.region === "Africa" || country.region === "Oceania") {
        return country.region;
    }

    return "Asia";
}

function hashString(value: string): number {
    return value.split("").reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7);
}

function seededUnit(seed: number, salt: number): number {
    const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453123;
    return value - Math.floor(value);
}

function seededCentered(seed: number, salt: number, amplitude: number): number {
    return (seededUnit(seed, salt) - 0.5) * amplitude * 2;
}

function seededRange(seed: number, salt: number, min: number, max: number): number {
    return min + (seededUnit(seed, salt) * (max - min));
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}

function clampSigned(value: number, minimum: number, maximum: number): number {
    return clamp(roundMetric(value), minimum, maximum);
}

function roundMetric(value: number): number {
    return Math.round(value * 10) / 10;
}

function roundPrice(value: number): number {
    return Math.round(value * 100) / 100;
}
