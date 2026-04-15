import { AtlasCountry, MarketMetricKey } from "../types/atlasmarket";

export interface AtlasMarketGlobeProps {
    countries: AtlasCountry[];
    activeMetric: MarketMetricKey;
    selectedCountryCode: string;
    onSelectCountry: (countryCode: string) => void;
    highlightCountryCodes?: string[];
    showLabels?: boolean;
    showFlows?: boolean;
    showPulses?: boolean;
    showGraticules?: boolean;
    lowerLabel: string;
    upperLabel: string;
    variant?: "compact" | "immersive";
    showCountryStrip?: boolean;
}
