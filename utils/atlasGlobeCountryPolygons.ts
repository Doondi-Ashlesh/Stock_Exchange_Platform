import worldCountries from "world-countries";

import { AtlasCountry, MarketMetricKey } from "../types/atlasmarket";
import { formatAtlasWebGlobeMetric, getAtlasWebGlobeMetricColor } from "./atlasGlobeWebScene";
import { styles } from "./styles";

const COUNTRY_NUMERIC_IDS = worldCountries.reduce<Record<string, number>>((lookup, country) => {
    const numericId = Number(country.ccn3);

    if (country.cca2 && Number.isFinite(numericId)) {
        lookup[country.cca2] = numericId;
    }

    return lookup;
}, {});

let cachedPolygonLookup: Map<number, any> | null = null;

export function buildAtlasCountryPolygons(
    countries: AtlasCountry[],
    selectedCountryCode: string,
    activeMetric: MarketMetricKey,
    highlightCountryCodes: string[] = []
): any[] {
    if (!cachedPolygonLookup) {
        const atlasTopology = require("world-atlas/countries-110m.json");
        const topojson = require("topojson-client");
        const features = topojson.feature(atlasTopology, atlasTopology.objects.countries).features as any[];
        cachedPolygonLookup = new Map(features.map((feature) => [Number(feature.id), feature]));
    }

    const highlightCodeSet = new Set(highlightCountryCodes);

    return countries.flatMap((country) => {
        const polygonId = COUNTRY_NUMERIC_IDS[country.code];
        const polygon = polygonId ? cachedPolygonLookup?.get(polygonId) : null;

        if (!polygon) {
            return [];
        }

        const metricValue = country.metrics[activeMetric];
        const isSelected = country.code === selectedCountryCode;
        const isHighlighted = !isSelected && highlightCodeSet.has(country.code);

        // HUD aesthetic: every country renders as a uniform cool-cyan plate
        // sitting flush on the sphere. No red/green noise across the globe.
        // Only the SELECTED country rises and lights up; leaders get a faint
        // accent ring but stay flat.
        const altitude = isSelected ? 0.14 : 0.0;

        const capColor = isSelected
            ? "rgba(34, 211, 238, 0.55)"      // bright cyan glow for focus
            : isHighlighted
                ? "rgba(103, 232, 249, 0.14)" // subtle cyan wash for leaders
                : "rgba(103, 232, 249, 0.07)"; // near-transparent landmass

        const sideColor = isSelected
            ? "rgba(8, 145, 178, 0.85)"
            : "rgba(10, 20, 36, 0.9)";

        const strokeColor = isSelected
            ? "rgba(34, 211, 238, 1)"
            : isHighlighted
                ? "rgba(34, 211, 238, 0.4)"
                : "rgba(34, 211, 238, 0.18)";

        return [{
            geometry: polygon.geometry,
            code: country.code,
            name: country.name,
            metricLabel: formatAtlasWebGlobeMetric(metricValue, activeMetric),
            color: capColor,
            capColor,
            sideColor,
            strokeColor,
            altitude,
            isSelected
        }];
    });
}

function blendHex(baseHex: string, overlayHex: string, weight: number): string {
    if (weight <= 0) {
        return baseHex;
    }

    const base = hexToRgb(baseHex);
    const overlay = hexToRgb(overlayHex);

    if (!base || !overlay) {
        return overlayHex;
    }

    const inverse = 1 - weight;

    return `rgb(${Math.round((base.r * inverse) + (overlay.r * weight))}, ${Math.round((base.g * inverse) + (overlay.g * weight))}, ${Math.round((base.b * inverse) + (overlay.b * weight))})`;
}

function hexToRgb(hex: string) {
    const normalized = hex.replace("#", "");

    if (normalized.length !== 6) {
        return null;
    }

    return {
        r: Number.parseInt(normalized.slice(0, 2), 16),
        g: Number.parseInt(normalized.slice(2, 4), 16),
        b: Number.parseInt(normalized.slice(4, 6), 16)
    };
}
