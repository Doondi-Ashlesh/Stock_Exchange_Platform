import { AtlasCountry, MarketMetricKey } from "../types/atlasmarket";
import { displayPercent, displaySignedPercent } from "./formatters";
import { styles } from "./styles";

export interface AtlasWebGlobeMarker {
    code: string;
    name: string;
    summary: string;
    region: string;
    benchmark: string;
    lat: number;
    lng: number;
    altitude: number;
    color: string;
    metricLabel: string;
    metricValue: number;
    isSelected: boolean;
}

export interface AtlasWebGlobeArc {
    id: string;
    endCode: string;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    color: [string, string];
    altitude: number;
}

export interface AtlasWebGlobeRing {
    lat: number;
    lng: number;
    color: string;
    maxRadius: number;
    propagationSpeed: number;
    repeatPeriod: number;
}

export interface AtlasWebGlobeScene {
    focus: AtlasWebGlobeMarker;
    markers: AtlasWebGlobeMarker[];
    arcs: AtlasWebGlobeArc[];
    rings: AtlasWebGlobeRing[];
}

export function buildAtlasWebGlobeScene(
    countries: AtlasCountry[],
    selectedCountryCode: string,
    activeMetric: MarketMetricKey
): AtlasWebGlobeScene {
    const focusCountry = countries.find((country) => country.code === selectedCountryCode) ?? countries[0];
    const accentCyan = "#22D3EE";
    const accentCyanBright = "#67E8F9";

    // Markers stay flat on the surface. Only the selected country lights up;
    // everything else uses a dim cyan glyph so the scene reads as a clean
    // HUD instead of a Christmas tree.
    const markers = countries.map((country) => {
        const metricValue = country.metrics[activeMetric];
        const isSelected = country.code === focusCountry.code;

        return {
            code: country.code,
            name: country.name,
            summary: country.summary,
            region: country.region,
            benchmark: country.benchmark,
            lat: country.position.latitude,
            lng: country.position.longitude,
            altitude: isSelected ? 0.02 : 0.005,
            color: isSelected ? accentCyanBright : accentCyan,
            metricLabel: formatAtlasWebGlobeMetric(metricValue, activeMetric),
            metricValue,
            isSelected
        };
    });

    // Arcs: only connect the focus country to its top-6 peers (instead of
    // drawing ~200 crossing lines). All arcs share a single cyan gradient
    // so the globe keeps a tight, sci-fi look.
    const topPeers = [...countries]
        .filter((country) => country.code !== focusCountry.code)
        .sort((left, right) => Math.abs(right.metrics.dailyReturn) - Math.abs(left.metrics.dailyReturn))
        .slice(0, 6);

    const arcs = topPeers.map((country, index) => ({
        id: `${focusCountry.code}-${country.code}`,
        endCode: country.code,
        startLat: focusCountry.position.latitude,
        startLng: focusCountry.position.longitude,
        endLat: country.position.latitude,
        endLng: country.position.longitude,
        color: [accentCyanBright, accentCyan] as [string, string],
        altitude: 0.22 + (index * 0.03)
    }));

    return {
        focus: markers.find((marker) => marker.code === focusCountry.code) ?? markers[0],
        markers,
        arcs,
        rings: [
            {
                lat: focusCountry.position.latitude,
                lng: focusCountry.position.longitude,
                color: accentCyan,
                maxRadius: 6.8,
                propagationSpeed: 1.4,
                repeatPeriod: 1200
            }
        ]
    };
}

export function formatAtlasWebGlobeMetric(value: number, metric: MarketMetricKey): string {
    if (metric === "volatility") {
        return displayPercent(value, 1, 1);
    }

    if (metric === "sectorStrength" || metric === "macroSentiment") {
        return `${Math.round(value)} / 100`;
    }

    return displaySignedPercent(value, 1, 1);
}

export function getAtlasWebGlobeMetricColor(value: number, metric: MarketMetricKey): string {
    if (metric === "volatility") {
        if (value >= 28) {
            return styles.atlas.negative;
        }
        if (value >= 21) {
            return styles.atlas.neutral;
        }
        return styles.atlas.positive;
    }

    if (metric === "sectorStrength" || metric === "macroSentiment") {
        if (value >= 70) {
            return styles.atlas.positive;
        }
        if (value >= 45) {
            return styles.atlas.neutral;
        }
        return styles.atlas.negative;
    }

    if (value > 0.8) {
        return styles.atlas.positive;
    }
    if (value < -0.8) {
        return styles.atlas.negative;
    }
    return styles.atlas.neutral;
}

function getNormalizedMetricStrength(value: number, metric: MarketMetricKey): number {
    if (metric === "volatility") {
        return Math.min(value / 32, 1);
    }

    if (metric === "sectorStrength" || metric === "macroSentiment") {
        return Math.min(Math.max(value / 100, 0), 1);
    }

    return Math.min(Math.abs(value) / 4, 1);
}
