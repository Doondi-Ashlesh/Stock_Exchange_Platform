import { useEffect, useMemo, useState } from "react";
import { Box, Button, HStack, Pressable, Text, VStack } from "native-base";
import { useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, Ellipse, Line, Path, RadialGradient, Stop, Text as SvgText } from "react-native-svg";

import { AtlasCountry, MarketMetricKey } from "../types/atlasmarket";
import { AtlasMarketGlobeProps } from "./AtlasMarketGlobe.types";
import { displayPercent, displaySignedPercent } from "../utils/formatters";
import { projectCountryPosition, normalizeLongitude } from "../utils/atlasGlobeMath";
import { styles } from "../utils/styles";

const VIEWBOX_WIDTH = 520;
const VIEWBOX_HEIGHT = 340;
const GLOBE_CENTER_X = 260;
const GLOBE_CENTER_Y = 154;
const GLOBE_RADIUS_X = 122;
const GLOBE_RADIUS_Y = 122;

export function AtlasMarketGlobeProjected({
    countries,
    activeMetric,
    selectedCountryCode,
    onSelectCountry,
    showLabels = true,
    showFlows = true,
    showPulses = true,
    showGraticules = true,
    lowerLabel,
    upperLabel,
    variant = "compact",
    showCountryStrip = true
}: AtlasMarketGlobeProps) {
    const { width } = useWindowDimensions();
    const [hoveredCountryCode, setHoveredCountryCode] = useState<string | null>(null);
    const [rotationLongitude, setRotationLongitude] = useState<number>(0);
    const [autoSpin, setAutoSpin] = useState(false);

    const isImmersive = variant === "immersive";
    const globeWidth = isImmersive
        ? Math.min(Math.max(width - 72, 360), 980)
        : Math.min(Math.max(width - 56, 280), 520);
    const globeHeight = globeWidth * (isImmersive ? 0.7 : 0.64);

    const selectedCountry = countries.find((country) => country.code === selectedCountryCode) ?? countries[0];
    const focusCountry = countries.find((country) => country.code === (hoveredCountryCode ?? selectedCountryCode)) ?? selectedCountry;

    useEffect(() => {
        setRotationLongitude(selectedCountry.position.longitude);
    }, [selectedCountry.position.longitude]);

    useEffect(() => {
        if (!autoSpin) {
            return;
        }

        const timer = setInterval(() => {
            setRotationLongitude((current) => normalizeLongitude(current + 14));
        }, 900);

        return () => clearInterval(timer);
    }, [autoSpin]);

    const projectedCountries = useMemo(() => {
        return countries
            .map((country) => {
                const projection = projectCountryPosition(country.position, rotationLongitude);
                const metricValue = country.metrics[activeMetric];
                const color = getMetricColor(metricValue, activeMetric);
                const cx = GLOBE_CENTER_X + (projection.x * GLOBE_RADIUS_X);
                const cy = GLOBE_CENTER_Y + (projection.y * GLOBE_RADIUS_Y * 0.84);
                const isSelected = country.code === selectedCountryCode;
                const isHovered = country.code === hoveredCountryCode;
                const radius = (isSelected ? 8.5 : 6) * projection.scale;
                const labelOffset = isSelected ? 18 : 11;

                return {
                    country,
                    projection,
                    metricValue,
                    color,
                    cx,
                    cy,
                    radius,
                    labelX: cx + (country.position.labelOffsetX * projection.scale) + labelOffset,
                    labelY: cy + (country.position.labelOffsetY * projection.scale),
                    opacity: projection.visible ? 0.95 : 0.18,
                    isSelected,
                    isHovered
                };
            })
            .sort((left, right) => left.projection.depth - right.projection.depth);
    }, [activeMetric, countries, hoveredCountryCode, rotationLongitude, selectedCountryCode]);

    const selectedProjection = projectedCountries.find((entry) => entry.country.code === selectedCountryCode) ?? projectedCountries[0];

    function handleSelectCountry(countryCode: string) {
        const nextCountry = countries.find((country) => country.code === countryCode);
        setAutoSpin(false);
        setHoveredCountryCode(null);
        if (nextCountry) {
            setRotationLongitude(nextCountry.position.longitude);
        }
        onSelectCountry(countryCode);
    }

    function cycleFocusedCountry(step: number) {
        const currentIndex = countries.findIndex((country) => country.code === selectedCountryCode);
        const nextIndex = (currentIndex + step + countries.length) % countries.length;
        handleSelectCountry(countries[nextIndex].code);
    }

    return (
        <VStack space={4}>
            <Box
                rounded="lg"
                px={{ base: 3, md: 4 }}
                py={{ base: 4, md: 5 }}
                bg={styles.atlas.panel}
                borderWidth={1}
                borderColor={styles.atlas.borderStrong}
                overflow="hidden"
            >
                <VStack space={4}>
                    <HStack justifyContent="space-between" alignItems="center" flexWrap="wrap">
                        <VStack maxW="72%">
                            <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700" letterSpacing="xl">
                                GLOBE MODE
                            </Text>
                            <Text color={styles.atlas.text} fontSize={isImmersive ? "md" : "sm"} fontWeight="700">
                                {focusCountry.name} in focus
                            </Text>
                            <Text color={styles.atlas.muted} fontSize="xs">
                                Tap markers, rotate across the planet, or use the focus rail to inspect countries around the whole world.
                            </Text>
                        </VStack>
                        <Box px={3} py={1.5} rounded="md" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.borderStrong}>
                            <Text color={styles.atlas.muted} fontSize="xs">
                                {formatMetric(focusCountry.metrics[activeMetric], activeMetric)} {activeMetricLabel(activeMetric)}
                            </Text>
                        </Box>
                    </HStack>

                    <HStack flexWrap="wrap">
                        <Button
                            mr={2}
                            mb={2}
                            size="sm"
                            variant="outline"
                            borderColor={styles.atlas.borderStrong}
                            _text={{ color: styles.atlas.text }}
                            onPress={() => setRotationLongitude((current) => normalizeLongitude(current - 22))}
                        >
                            Rotate West
                        </Button>
                        <Button
                            mr={2}
                            mb={2}
                            size="sm"
                            variant="outline"
                            borderColor={styles.atlas.borderStrong}
                            _text={{ color: styles.atlas.text }}
                            onPress={() => setRotationLongitude(selectedCountry.position.longitude)}
                        >
                            Center Focus
                        </Button>
                        <Button
                            mr={2}
                            mb={2}
                            size="sm"
                            bg={autoSpin ? styles.atlas.panelRaised : styles.atlas.backgroundAlt}
                            borderColor={autoSpin ? styles.atlas.focusPrimary : styles.atlas.border}
                            _text={{ color: styles.atlas.text, fontWeight: "700" }}
                            onPress={() => setAutoSpin((current) => !current)}
                        >
                            {autoSpin ? "Pause Orbit" : "Auto Orbit"}
                        </Button>
                        <Button
                            mr={2}
                            mb={2}
                            size="sm"
                            variant="outline"
                            borderColor={styles.atlas.borderStrong}
                            _text={{ color: styles.atlas.text }}
                            onPress={() => setRotationLongitude((current) => normalizeLongitude(current + 22))}
                        >
                            Rotate East
                        </Button>
                    </HStack>

                    <Box alignItems="center">
                        <Box style={{ width: globeWidth, height: globeHeight, position: "relative" }}>
                            <Svg width={globeWidth} height={globeHeight} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
                                <Defs>
                                    <RadialGradient id="atlasGlobeCore" cx="42%" cy="34%" r="72%">
                                        <Stop offset="0%" stopColor="#1B2430" />
                                        <Stop offset="48%" stopColor="#10161E" />
                                        <Stop offset="100%" stopColor="#0A0F14" />
                                    </RadialGradient>
                                    <RadialGradient id="atlasGlobeAura" cx="50%" cy="50%" r="64%">
                                        <Stop offset="0%" stopColor={styles.atlas.neutral} stopOpacity="0.08" />
                                        <Stop offset="100%" stopColor={styles.atlas.neutral} stopOpacity="0" />
                                    </RadialGradient>
                                </Defs>

                                <Ellipse cx="260" cy="204" rx="214" ry="112" fill="#020202" opacity={0.45} />
                                <Circle cx={GLOBE_CENTER_X} cy={GLOBE_CENTER_Y + 6} r="132" fill="url(#atlasGlobeAura)" />
                                <Circle cx={GLOBE_CENTER_X} cy={GLOBE_CENTER_Y} r="124" fill="url(#atlasGlobeCore)" stroke={styles.atlas.borderStrong} strokeWidth="1.5" />

                                {showGraticules ? [0, 1, 2, 3].map((ring) => (
                                    <Ellipse
                                        key={`latitude-${ring}`}
                                        cx={GLOBE_CENTER_X}
                                        cy={GLOBE_CENTER_Y}
                                        rx="124"
                                        ry={ring === 0 ? 34 : ring * 24 + 12}
                                        fill="none"
                                        stroke="#334155"
                                        strokeWidth="1"
                                        opacity={0.24}
                                    />
                                )) : null}
                                {showGraticules ? [60, 90, 118].map((rx) => (
                                    <Ellipse
                                        key={`longitude-${rx}`}
                                        cx={GLOBE_CENTER_X}
                                        cy={GLOBE_CENTER_Y}
                                        rx={rx}
                                        ry="124"
                                        fill="none"
                                        stroke="#334155"
                                        strokeWidth="1"
                                        opacity={0.18}
                                    />
                                )) : null}

                                <Path d="M120 134C154 102 184 95 222 108C206 126 176 142 136 150C122 149 116 142 120 134Z" fill="#0E1415" opacity={0.62} />
                                <Path d="M220 98C260 76 314 82 352 110C336 132 304 142 270 143C246 134 228 120 220 98Z" fill="#0A1012" opacity={0.55} />
                                <Path d="M242 154C276 148 322 162 356 192C330 212 286 220 254 208C242 196 238 174 242 154Z" fill="#0A1012" opacity={0.55} />
                                <Path d="M360 202C392 194 424 202 440 224C412 238 386 244 360 238C352 226 352 212 360 202Z" fill="#0A1012" opacity={0.45} />

                                {showFlows && selectedProjection.projection.visible ? projectedCountries
                                    .filter((entry) => entry.country.code !== selectedCountryCode && entry.projection.visible)
                                    .map((entry) => {
                                        const controlX = (selectedProjection.cx + entry.cx) / 2;
                                        const controlY = Math.min(selectedProjection.cy, entry.cy) - (26 + Math.abs(selectedProjection.cx - entry.cx) * 0.08);
                                        return (
                                            <Path
                                                key={`arc-${entry.country.code}`}
                                                d={`M ${selectedProjection.cx} ${selectedProjection.cy} Q ${controlX} ${controlY} ${entry.cx} ${entry.cy}`}
                                                stroke={entry.color}
                                                strokeOpacity={0.22}
                                                strokeWidth="1.5"
                                                fill="none"
                                            />
                                        );
                                    }) : null}

                                {projectedCountries.map((entry) => (
                                    <BoxMarker key={entry.country.code} entry={entry} activeMetric={activeMetric} showLabel={showLabels} showPulse={showPulses} />
                                ))}

                                {showGraticules ? <Line x1="96" y1="44" x2="424" y2="44" stroke="#334155" strokeDasharray="6 10" opacity={0.18} /> : null}
                                {showGraticules ? <Line x1="88" y1="286" x2="432" y2="286" stroke="#334155" strokeDasharray="6 10" opacity={0.16} /> : null}
                            </Svg>

                            <Box position="absolute" left={0} top={0} right={0} bottom={0}>
                                {projectedCountries
                                    .filter((entry) => entry.projection.visible)
                                    .map((entry) => (
                                        <Pressable
                                            key={`hotspot-${entry.country.code}`}
                                            position="absolute"
                                            left={`${(entry.cx / VIEWBOX_WIDTH) * globeWidth - 22}px`}
                                            top={`${(entry.cy / VIEWBOX_HEIGHT) * globeHeight - 22}px`}
                                            onPress={() => handleSelectCountry(entry.country.code)}
                                            onHoverIn={() => setHoveredCountryCode(entry.country.code)}
                                            onHoverOut={() => setHoveredCountryCode((current) => current === entry.country.code ? null : current)}
                                        >
                                            <Box h="11" w="11" rounded="full" opacity={0.02} bg={styles.atlas.text} />
                                        </Pressable>
                                    ))}
                            </Box>
                        </Box>
                    </Box>

                    {isImmersive ? (
                        <HStack flexWrap="wrap">
                            <Box flex={1} minW="240px" mr={{ base: 0, xl: 3 }} mb={{ base: 3, xl: 0 }} px={4} py={4} rounded="lg" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">FOCUS SUMMARY</Text>
                                <Text color={styles.atlas.text} fontWeight="700">{focusCountry.summary}</Text>
                                <Text color={styles.atlas.muted} fontSize="xs">{focusCountry.benchmark} | {focusCountry.currency} | {focusCountry.region}</Text>
                            </Box>
                            <Box flex={1} minW="240px" px={4} py={4} rounded="lg" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">QUICK ACTIONS</Text>
                                <HStack flexWrap="wrap" mt={2}>
                                    <Button mr={2} mb={2} size="sm" variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={() => cycleFocusedCountry(-1)}>Prev Country</Button>
                                    <Button mr={2} mb={2} size="sm" variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={() => cycleFocusedCountry(1)}>Next Country</Button>
                                    <Button mr={2} mb={2} size="sm" bg={styles.atlas.panelRaised} _text={{ color: styles.atlas.text }} onPress={() => handleSelectCountry(focusCountry.code)}>Pin Focus</Button>
                                </HStack>
                            </Box>
                        </HStack>
                    ) : null}
                </VStack>
            </Box>

            <HStack justifyContent="space-between" alignItems="center">
                <Text color={styles.atlas.muted} fontSize="xs">
                    {lowerLabel}
                </Text>
                <HStack space={2} alignItems="center">
                    {[styles.atlas.negative, styles.atlas.neutral, styles.atlas.positive].map((tone) => (
                        <Box key={tone} h="2" w="14" rounded="full" bg={tone} />
                    ))}
                </HStack>
                <Text color={styles.atlas.muted} fontSize="xs">
                    {upperLabel}
                </Text>
            </HStack>

            {showCountryStrip ? (
                <HStack flexWrap="wrap" justifyContent={isImmersive ? "flex-start" : "center"}>
                    {countries.map((country) => {
                        const selected = country.code === selectedCountryCode;
                        const hovered = country.code === hoveredCountryCode;
                        return (
                            <Pressable
                                key={country.code}
                                onPress={() => handleSelectCountry(country.code)}
                                onHoverIn={() => setHoveredCountryCode(country.code)}
                                onHoverOut={() => setHoveredCountryCode((current) => current === country.code ? null : current)}
                            >
                                <Box
                                    mr={2}
                                    mb={2}
                                    px={3}
                                    py={2}
                                    rounded="md"
                                    borderWidth={1}
                                    borderColor={selected ? styles.atlas.focusPrimary : hovered ? styles.atlas.borderStrong : styles.atlas.border}
                                    bg={selected ? styles.atlas.panelRaised : styles.atlas.backgroundAlt}
                                >
                                    <Text color={selected ? styles.atlas.text : styles.atlas.muted} fontSize="xs" fontWeight="700">
                                        {country.name}
                                    </Text>
                                    <Text color={getMetricColor(country.metrics[activeMetric], activeMetric)} fontSize="xs">
                                        {formatMetric(country.metrics[activeMetric], activeMetric)}
                                    </Text>
                                </Box>
                            </Pressable>
                        );
                    })}
                </HStack>
            ) : null}
        </VStack>
    );
}

function BoxMarker({
    entry,
    activeMetric,
    showLabel,
    showPulse
}: {
    entry: {
        country: AtlasCountry;
        projection: ReturnType<typeof projectCountryPosition>;
        color: string;
        cx: number;
        cy: number;
        radius: number;
        labelX: number;
        labelY: number;
        opacity: number;
        isSelected: boolean;
        isHovered: boolean;
    };
    activeMetric: MarketMetricKey;
    showLabel: boolean;
    showPulse: boolean;
}) {
    return (
        <>
            <Circle
                cx={entry.cx}
                cy={entry.cy}
                r={entry.radius}
                fill={entry.color}
                fillOpacity={entry.opacity}
                stroke={entry.isSelected ? styles.atlas.neutral : "#060606"}
                strokeWidth={entry.isSelected ? 2.2 : 1.4}
            />

            {showPulse && (entry.isSelected || entry.isHovered) ? (
                <>
                    <Circle
                        cx={entry.cx}
                        cy={entry.cy}
                        r={entry.radius + 6}
                        stroke={entry.isSelected ? styles.atlas.neutral : entry.color}
                        strokeOpacity={entry.isSelected ? 0.34 : 0.22}
                        strokeWidth="2.2"
                        fill="none"
                    />
                    <Circle
                        cx={entry.cx}
                        cy={entry.cy}
                        r={entry.radius + 12}
                        stroke={entry.isSelected ? styles.atlas.neutral : entry.color}
                        strokeOpacity={entry.isSelected ? 0.18 : 0.12}
                        strokeWidth="1.8"
                        fill="none"
                    />
                </>
            ) : null}

            {showLabel && entry.projection.visible ? (
                <>
                    <SvgText
                        x={entry.labelX}
                        y={entry.labelY}
                        fill={entry.isSelected ? styles.atlas.text : "#B7B1A0"}
                        fontSize={entry.isSelected ? "12" : "11"}
                        fontWeight="700"
                    >
                        {entry.isSelected ? entry.country.name : entry.country.code}
                    </SvgText>
                    {(entry.isSelected || entry.isHovered) ? (
                        <SvgText x={entry.labelX} y={entry.labelY + 16} fill={entry.isSelected ? styles.atlas.neutral : entry.color} fontSize="11">
                            {formatMetric(entry.country.metrics[activeMetric], activeMetric)}
                        </SvgText>
                    ) : null}
                </>
            ) : null}
        </>
    );
}

function activeMetricLabel(metric: MarketMetricKey): string {
    switch (metric) {
        case "dailyReturn":
            return "today";
        case "weeklyReturn":
            return "this week";
        case "volatility":
            return "risk";
        case "sectorStrength":
            return "breadth";
        case "macroSentiment":
            return "macro";
        case "currencyMovement":
            return "fx";
        case "relativePerformance":
            return "relative";
        default:
            return "";
    }
}

function formatMetric(value: number, metric: MarketMetricKey): string {
    if (metric === "volatility") {
        return displayPercent(value, 1, 1);
    }

    if (metric === "sectorStrength" || metric === "macroSentiment") {
        return `${Math.round(value)} / 100`;
    }

    return displaySignedPercent(value, 1, 1);
}

function getMetricColor(value: number, metric: MarketMetricKey): string {
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
