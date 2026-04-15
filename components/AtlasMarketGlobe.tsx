import { Platform } from "react-native";

import { AtlasMarketGlobeProps } from "./AtlasMarketGlobe.types";
import { AtlasMarketGlobeProjected } from "./AtlasMarketGlobeProjected";

export function AtlasMarketGlobe(props: AtlasMarketGlobeProps) {
    if (Platform.OS === "web") {
        try {
            const { AtlasMarketGlobeWeb } = require("./AtlasMarketGlobeWeb");
            return <AtlasMarketGlobeWeb {...props} />;
        } catch (error) {
            return <AtlasMarketGlobeProjected {...props} />;
        }
    }

    return <AtlasMarketGlobeProjected {...props} />;
}
