import { buildAtlasCountryPolygons } from "./atlasGlobeCountryPolygons";
import { defaultSnapshot } from "./atlasMarketData";
import { buildGlobalCoverageCountries } from "./atlasWorldCoverage";

describe("atlas globe polygons", () => {
    test("builds shaded polygon data for the full world coverage set", () => {
        const worldCountries = buildGlobalCoverageCountries(defaultSnapshot);
        const polygons = buildAtlasCountryPolygons(worldCountries, "US", "dailyReturn");
        const francePolygon = polygons.find((polygon) => polygon.code === "FR");

        expect(worldCountries.length).toBeGreaterThan(150);
        expect(polygons.length).toBeGreaterThan(150);
        expect(francePolygon?.geometry).toBeDefined();
    });
});
