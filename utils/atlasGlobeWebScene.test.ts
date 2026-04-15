import { buildAtlasWebGlobeScene, formatAtlasWebGlobeMetric, getAtlasWebGlobeMetricColor } from "./atlasGlobeWebScene";
import { defaultSnapshot } from "./atlasMarketData";
import { styles } from "./styles";

describe("atlas web globe scene", () => {
    test("builds a focus marker and arcs for the remaining countries", () => {
        const scene = buildAtlasWebGlobeScene(defaultSnapshot.countries, "US", "dailyReturn");

        expect(scene.focus.code).toBe("US");
        expect(scene.markers).toHaveLength(defaultSnapshot.countries.length);
        expect(scene.arcs).toHaveLength(defaultSnapshot.countries.length - 1);
        expect(scene.rings[0].lng).toBe(-98);
    });

    test("formats score metrics and colors directional moves", () => {
        expect(formatAtlasWebGlobeMetric(74, "sectorStrength")).toBe("74 / 100");
        expect(getAtlasWebGlobeMetricColor(1.8, "dailyReturn")).toBe(styles.atlas.positive);
        expect(getAtlasWebGlobeMetricColor(-1.4, "dailyReturn")).toBe(styles.atlas.negative);
    });
});
