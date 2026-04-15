import { normalizeLongitude, projectCountryPosition } from "./atlasGlobeMath";

describe("atlas globe math", () => {
    test("normalizes longitudes into the visible range", () => {
        expect(normalizeLongitude(270)).toBe(-90);
        expect(normalizeLongitude(-225)).toBe(135);
        expect(normalizeLongitude(40)).toBe(40);
    });

    test("projects a selected country to the front of the globe", () => {
        const point = projectCountryPosition(
            {
                x: 80,
                y: 84,
                labelOffsetX: -16,
                labelOffsetY: -14,
                longitude: -98,
                latitude: 38
            },
            -98
        );

        expect(point.visible).toBe(true);
        expect(point.depth).toBeGreaterThan(0.7);
        expect(Math.abs(point.x)).toBeLessThan(0.001);
    });

    test("moves countries behind the globe when rotated away", () => {
        const point = projectCountryPosition(
            {
                x: 364,
                y: 88,
                labelOffsetX: 12,
                labelOffsetY: -16,
                longitude: 138,
                latitude: 36
            },
            -42
        );

        expect(point.depth).toBeLessThan(0);
    });
});
