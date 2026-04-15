import { buildGlobalCoverageCountries } from "./atlasWorldCoverage";
import { defaultSnapshot } from "./atlasMarketData";

describe("atlas world coverage", () => {
    test("expands the globe data beyond the detailed dashboard markets", () => {
        const coverage = buildGlobalCoverageCountries(defaultSnapshot);

        expect(coverage.length).toBeGreaterThan(150);
        expect(coverage.some((country) => country.code === "US")).toBe(true);
        expect(coverage.some((country) => country.code === "FR")).toBe(true);
    });
});
