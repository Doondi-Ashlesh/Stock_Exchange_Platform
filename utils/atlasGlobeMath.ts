import { AtlasCountryPosition } from "../types/atlasmarket";

const DEGREES_TO_RADIANS = Math.PI / 180;

export interface GlobeProjectionPoint {
    normalizedLongitude: number;
    x: number;
    y: number;
    depth: number;
    scale: number;
    visible: boolean;
}

export function normalizeLongitude(longitude: number): number {
    const wrapped = (longitude + 180) % 360;
    return wrapped < 0 ? wrapped + 180 : wrapped - 180;
}

export function projectCountryPosition(position: AtlasCountryPosition, rotationLongitude: number): GlobeProjectionPoint {
    const normalizedLongitude = normalizeLongitude(position.longitude - rotationLongitude);
    const longitude = normalizedLongitude * DEGREES_TO_RADIANS;
    const latitude = position.latitude * DEGREES_TO_RADIANS;
    const depth = Math.cos(longitude) * Math.cos(latitude);

    return {
        normalizedLongitude,
        x: Math.sin(longitude) * Math.cos(latitude),
        y: -Math.sin(latitude),
        depth,
        scale: 0.72 + ((depth + 1) / 2) * 0.52,
        visible: depth > -0.28
    };
}
