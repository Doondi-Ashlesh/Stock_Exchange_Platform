import { Pressable, Box, HStack, SimpleGrid, Text, VStack } from "native-base";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

import { AtlasCountry, AtlasHeadline, AtlasJournalEntry, AtlasPosition, AtlasSectorHeatmapCell, AtlasWatchlistItem, MarketMetricKey } from "../types/atlasmarket";
import { displayCurrency, displaySignedCurrency, displaySignedPercent } from "../utils/formatters";
import { styles } from "../utils/styles";

interface BenchmarkCandlestickChartProps {
    country: AtlasCountry;
    activeMetric: MarketMetricKey;
}

interface MarketBreadthBarsProps {
    countries: AtlasCountry[];
    activeMetric: MarketMetricKey;
    selectedCountryCode: string;
    onSelectCountry: (countryCode: string) => void;
}

interface SectorHeatmapVisualProps {
    cells: AtlasSectorHeatmapCell[];
}

interface ScannerTapeVisualProps {
    items: AtlasWatchlistItem[];
    onSelectItem?: (symbol: string) => void;
}

interface PortfolioAnalyticsVisualProps {
    positions: AtlasPosition[];
    cashBalance: number;
    netLiq: number;
    unrealizedPnl: number;
    grossExposure: number;
}

interface CatalystTimelineVisualProps {
    headlines: AtlasHeadline[];
    journalEntries: AtlasJournalEntry[];
}

interface GlobalPulseVisualProps {
    countries: AtlasCountry[];
    activeMetric: MarketMetricKey;
    selectedCountryCode: string;
    onSelectCountry?: (countryCode: string) => void;
}

interface CandlePoint {
    label: string;
    open: number;
    high: number;
    low: number;
    close: number;
}

export function GlobalPulseVisual({
    countries,
    activeMetric,
    selectedCountryCode,
    onSelectCountry
}: GlobalPulseVisualProps) {
    // Chart geometry — standard margin convention so axes get real room.
    const width = 1280;
    const height = 320;
    const margin = { top: 28, right: 28, bottom: 56, left: 64 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const selectedCountry = countries.find((country) => country.code === selectedCountryCode) ?? countries[0];
    const rankedCountries = [...countries]
        .sort((left, right) => rankMetric(right.metrics[activeMetric], activeMetric) - rankMetric(left.metrics[activeMetric], activeMetric));
    const leaderCodes = new Set(rankedCountries.slice(0, 6).map((country) => country.code));

    // Build the data domain: metric value vs. longitude.
    // X = longitude (-180..180) mapped across the plot width.
    // Y = metric value clamped to a symmetric scale for readability.
    const rawValues = countries.map((country) => country.metrics[activeMetric]);
    const maxAbs = Math.max(...rawValues.map((value) => Math.abs(value)), 1);
    const yDomain = Math.ceil(maxAbs * 1.1 * 10) / 10; // round to 1dp

    const xFromLongitude = (longitude: number) => margin.left + (((longitude + 180) / 360) * plotWidth);
    const yFromValue = (value: number) => {
        if (activeMetric === "sectorStrength" || activeMetric === "macroSentiment") {
            // 0..100 score — put midline at 50.
            return margin.top + plotHeight - ((value / 100) * plotHeight);
        }
        return margin.top + (plotHeight / 2) - ((value / yDomain) * (plotHeight / 2));
    };

    const zeroLineY = activeMetric === "sectorStrength" || activeMetric === "macroSentiment"
        ? margin.top + (plotHeight / 2)
        : margin.top + (plotHeight / 2);

    const yTicks = activeMetric === "sectorStrength" || activeMetric === "macroSentiment"
        ? [0, 25, 50, 75, 100]
        : [-yDomain, -yDomain / 2, 0, yDomain / 2, yDomain];

    const xTicks = [
        { longitude: -150, label: "150°W" },
        { longitude: -90, label: "Americas" },
        { longitude: -30, label: "30°W" },
        { longitude: 15, label: "EMEA" },
        { longitude: 90, label: "APAC" },
        { longitude: 150, label: "150°E" }
    ];

    const metricLabel = activeMetricLabel(activeMetric);
    const axisColor = "rgba(148, 163, 184, 0.18)";
    const axisTextColor = "#94A3B8";

    return (
        <VStack space={3}>
            {/* Header */}
            <VStack space={1}>
                <HStack justifyContent="space-between" alignItems="center" flexWrap="wrap">
                    <VStack>
                        <Text color={styles.atlas.accentStrong} fontSize="2xs" fontWeight="700" letterSpacing={2}>GLOBAL PULSE</Text>
                        <Text color={styles.atlas.textStrong} fontSize="md" fontWeight="700">{metricLabel} by market — scatter vs. longitude</Text>
                        <Text color={styles.atlas.muted} fontSize="xs" mt={0.5}>
                            Each dot is one country placed by its geographic longitude (X) and current {metricLabel.toLowerCase()} reading (Y). Color encodes risk tone, size encodes impact rank.
                        </Text>
                    </VStack>
                    <HStack flexWrap="wrap">
                        <SignalChip label="Focus" value={selectedCountry.code} tone={styles.atlas.accentStrong} />
                        <SignalChip label="Leaders" value={`${leaderCodes.size}`} tone={styles.atlas.positive} />
                        <SignalChip label="World" value={`${countries.length}`} tone={styles.atlas.text} />
                    </HStack>
                </HStack>
            </VStack>

            {/* Chart */}
            <Box rounded="2xl" overflow="hidden" borderWidth={1} borderColor={styles.atlas.border} bg={styles.atlas.panelMuted}>
                <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
                    <Defs>
                        <LinearGradient id="atlas-pulse-bg" x1="0" x2="1" y1="0" y2="1">
                            <Stop offset="0%" stopColor="#0D1220" />
                            <Stop offset="100%" stopColor="#070B16" />
                        </LinearGradient>
                    </Defs>

                    <Rect x="0" y="0" width={width} height={height} fill="url(#atlas-pulse-bg)" />

                    {/* Y gridlines + tick labels */}
                    {yTicks.map((tickValue) => {
                        const y = yFromValue(tickValue);
                        const isZero = tickValue === 0 || (activeMetric === "sectorStrength" || activeMetric === "macroSentiment") && tickValue === 50;
                        return (
                            <G key={`y-${tickValue}`}>
                                <Line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} stroke={isZero ? "rgba(148,163,184,0.32)" : axisColor} strokeDasharray={isZero ? undefined : "4 6"} />
                                <SvgText x={margin.left - 10} y={y + 4} fill={axisTextColor} fontSize="11" textAnchor="end">{formatTickValue(tickValue, activeMetric)}</SvgText>
                            </G>
                        );
                    })}

                    {/* X axis ticks + labels */}
                    {xTicks.map((tick) => {
                        const x = xFromLongitude(tick.longitude);
                        return (
                            <G key={`x-${tick.longitude}`}>
                                <Line x1={x} y1={margin.top} x2={x} y2={margin.top + plotHeight} stroke={axisColor} strokeDasharray="3 8" />
                                <SvgText x={x} y={margin.top + plotHeight + 20} fill={axisTextColor} fontSize="11" textAnchor="middle" fontWeight="600">{tick.label}</SvgText>
                            </G>
                        );
                    })}

                    {/* Axis frames */}
                    <Line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} stroke="rgba(148,163,184,0.25)" />
                    <Line x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} stroke="rgba(148,163,184,0.25)" />

                    {/* Axis titles */}
                    <SvgText x={margin.left + (plotWidth / 2)} y={height - 8} fill={axisTextColor} fontSize="11" textAnchor="middle" fontWeight="600">Longitude (geographic region)</SvgText>
                    <SvgText x={16} y={margin.top + (plotHeight / 2)} fill={axisTextColor} fontSize="11" textAnchor="middle" fontWeight="600" transform={`rotate(-90 16 ${margin.top + (plotHeight / 2)})`}>{metricLabel}</SvgText>

                    {/* Data points */}
                    {countries.map((country) => {
                        const cx = xFromLongitude(country.position.longitude);
                        const cy = yFromValue(country.metrics[activeMetric]);
                        const selected = country.code === selectedCountry.code;
                        const isLeader = leaderCodes.has(country.code);
                        const tone = getMetricTone(country.metrics[activeMetric], activeMetric);
                        const r = selected ? 7 : isLeader ? 5 : 3;

                        return (
                            <G key={country.code}>
                                {selected ? (
                                    <>
                                        <Circle cx={cx} cy={cy} r={r + 10} fill={tone} opacity="0.12" />
                                        <Circle cx={cx} cy={cy} r={r + 5} stroke="#F8FAFC" strokeOpacity="0.6" strokeWidth="1.5" fill="none" />
                                    </>
                                ) : null}
                                <Circle
                                    cx={cx}
                                    cy={cy}
                                    r={r}
                                    fill={tone}
                                    stroke={selected ? "#FFFFFF" : "none"}
                                    strokeWidth={selected ? 1.5 : 0}
                                    onPress={onSelectCountry ? () => onSelectCountry(country.code) : undefined}
                                />
                                {(selected || isLeader) ? (
                                    <SvgText x={cx + (r + 4)} y={cy + 3} fill={selected ? "#F8FAFC" : tone} fontSize="10" fontWeight={selected ? "700" : "600"}>
                                        {country.code}
                                    </SvgText>
                                ) : null}
                            </G>
                        );
                    })}
                </Svg>

                {/* Legend strip */}
                <HStack px={4} py={3} justifyContent="space-between" alignItems="center" borderTopWidth={1} borderColor={styles.atlas.border} flexWrap="wrap">
                    <HStack space={4} alignItems="center" flexWrap="wrap">
                        <HStack space={2} alignItems="center">
                            <Box w="3" h="3" rounded="full" bg={styles.atlas.positive} />
                            <Text color={styles.atlas.muted} fontSize="xs">Risk-on</Text>
                        </HStack>
                        <HStack space={2} alignItems="center">
                            <Box w="3" h="3" rounded="full" bg={styles.atlas.neutral} />
                            <Text color={styles.atlas.muted} fontSize="xs">Neutral</Text>
                        </HStack>
                        <HStack space={2} alignItems="center">
                            <Box w="3" h="3" rounded="full" bg={styles.atlas.negative} />
                            <Text color={styles.atlas.muted} fontSize="xs">Risk-off</Text>
                        </HStack>
                        <HStack space={2} alignItems="center" ml={2}>
                            <Box w="2" h="2" rounded="full" bg={styles.atlas.muted} />
                            <Box w="3" h="3" rounded="full" bg={styles.atlas.muted} />
                            <Box w="4" h="4" rounded="full" bg={styles.atlas.muted} />
                            <Text color={styles.atlas.muted} fontSize="xs" ml={1}>Rank: all · top-6 · focus</Text>
                        </HStack>
                    </HStack>
                    <Text color={styles.atlas.muted} fontSize="xs">Hover or tap a dot to drill in.</Text>
                </HStack>
            </Box>
        </VStack>
    );
}

export function BenchmarkCandlestickChart({ country, activeMetric }: BenchmarkCandlestickChartProps) {
    const candles = buildCandles(country.benchmarkSeries, country.metrics.dailyReturn);
    const pattern = detectPattern(candles);
    const latestClose = candles[candles.length - 1]?.close ?? 0;
    const firstClose = candles[0]?.close ?? latestClose;
    const sessionDelta = latestClose - firstClose;
    const sessionPct = firstClose ? (sessionDelta / firstClose) * 100 : 0;
    const dominantTone = sessionDelta >= 0 ? styles.atlas.positive : styles.atlas.negative;

    // Chart geometry with real margins for axes.
    const chartWidth = 760;
    const chartHeight = 300;
    const margin = { top: 12, right: 64, bottom: 36, left: 16 };
    const plotWidth = chartWidth - margin.left - margin.right;
    const plotHeight = chartHeight - margin.top - margin.bottom;

    // Price domain with 3% headroom so wicks don't touch the frame.
    const rawMin = Math.min(...candles.map((candle) => candle.low));
    const rawMax = Math.max(...candles.map((candle) => candle.high));
    const headroom = (rawMax - rawMin) * 0.08;
    const minPrice = rawMin - headroom;
    const maxPrice = rawMax + headroom;
    const priceRange = Math.max(maxPrice - minPrice, 1);

    const xFor = (index: number) => margin.left + ((index + 0.5) * (plotWidth / candles.length));
    const yForPrice = (price: number) => margin.top + plotHeight - (((price - minPrice) / priceRange) * plotHeight);

    const candleWidth = Math.max(6, (plotWidth / candles.length) * 0.6);
    const priceTicks = 5;
    const yTickValues = Array.from({ length: priceTicks }, (_, i) => minPrice + ((priceRange / (priceTicks - 1)) * i));

    const metricValue = country.metrics[activeMetric];
    const axisText = "#94A3B8";

    return (
        <VStack space={3} w="100%">
            {/* Title row */}
            <HStack justifyContent="space-between" alignItems="flex-end" flexWrap="wrap">
                <VStack>
                    <Text color={styles.atlas.accentStrong} fontSize="2xs" fontWeight="700" letterSpacing={2}>BENCHMARK · CANDLES</Text>
                    <Text color={styles.atlas.textStrong} fontSize="md" fontWeight="700">{country.benchmark} · {country.name}</Text>
                    <Text color={styles.atlas.muted} fontSize="xs" mt={0.5}>
                        OHLC candles by trading session. Green = close above open, red = close below open. Wicks show session high / low.
                    </Text>
                </VStack>
                <VStack alignItems="flex-end">
                    <Text color={styles.atlas.textStrong} fontWeight="700" fontSize="xl" letterSpacing={-0.4} style={{ fontVariantNumeric: "tabular-nums" } as any}>
                        {compactPrice(latestClose)}
                    </Text>
                    <Text color={dominantTone} fontSize="xs" fontWeight="700">
                        {`${sessionPct >= 0 ? "+" : ""}${sessionPct.toFixed(2)}%`} · Pattern: {pattern.label}
                    </Text>
                    <Text color={styles.atlas.muted} fontSize="2xs" mt={0.5}>
                        {activeMetricLabel(activeMetric)}: {formatMetric(metricValue, activeMetric)}
                    </Text>
                </VStack>
            </HStack>

            {/* Chart */}
            <Box rounded="2xl" overflow="hidden" borderWidth={1} borderColor={styles.atlas.border} bg={styles.atlas.panelMuted}>
                <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                    <Defs>
                        <LinearGradient id="atlas-candle-bg" x1="0" x2="0" y1="0" y2="1">
                            <Stop offset="0%" stopColor="#0D1220" />
                            <Stop offset="100%" stopColor="#070B16" />
                        </LinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width={chartWidth} height={chartHeight} fill="url(#atlas-candle-bg)" />

                    {/* Horizontal price gridlines + right-side tick labels */}
                    {yTickValues.map((tick, i) => {
                        const y = yForPrice(tick);
                        return (
                            <G key={`y-${i}`}>
                                <Line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} stroke="rgba(148,163,184,0.14)" strokeDasharray="3 6" />
                                <SvgText x={chartWidth - margin.right + 8} y={y + 4} fill={axisText} fontSize="10" textAnchor="start">{compactPrice(tick)}</SvgText>
                            </G>
                        );
                    })}

                    {/* Candles */}
                    {candles.map((candle, index) => {
                        const x = xFor(index);
                        const isUp = candle.close >= candle.open;
                        const tone = isUp ? styles.atlas.positive : styles.atlas.negative;
                        const bodyTop = yForPrice(Math.max(candle.open, candle.close));
                        const bodyBottom = yForPrice(Math.min(candle.open, candle.close));
                        const bodyHeight = Math.max(bodyBottom - bodyTop, 2);

                        return (
                            <G key={`candle-${index}`}>
                                {/* Wick */}
                                <Line x1={x} y1={yForPrice(candle.high)} x2={x} y2={yForPrice(candle.low)} stroke={tone} strokeWidth="1.4" />
                                {/* Body */}
                                <Rect
                                    x={x - candleWidth / 2}
                                    y={bodyTop}
                                    width={candleWidth}
                                    height={bodyHeight}
                                    fill={tone}
                                    rx="1.5"
                                    opacity={isUp ? 1 : 0.92}
                                />
                            </G>
                        );
                    })}

                    {/* X axis session labels */}
                    {candles.map((candle, index) => {
                        if (candles.length > 10 && index % 2 !== 0) return null;
                        const x = xFor(index);
                        return (
                            <SvgText key={`x-${index}`} x={x} y={margin.top + plotHeight + 18} fill={axisText} fontSize="10" textAnchor="middle">{candle.label}</SvgText>
                        );
                    })}

                    {/* Axis frames */}
                    <Line x1={margin.left + plotWidth} y1={margin.top} x2={margin.left + plotWidth} y2={margin.top + plotHeight} stroke="rgba(148,163,184,0.25)" />
                    <Line x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} stroke="rgba(148,163,184,0.25)" />

                    {/* Latest-close marker */}
                    {(() => {
                        const y = yForPrice(latestClose);
                        return (
                            <G>
                                <Line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} stroke={dominantTone} strokeOpacity="0.4" strokeDasharray="4 4" />
                                <Rect x={margin.left + plotWidth + 4} y={y - 9} width="56" height="18" rx="4" fill={dominantTone} />
                                <SvgText x={margin.left + plotWidth + 32} y={y + 4} fill="#06110A" fontSize="10" fontWeight="700" textAnchor="middle">{compactPrice(latestClose)}</SvgText>
                            </G>
                        );
                    })()}
                </Svg>

                {/* Legend */}
                <HStack px={4} py={2.5} justifyContent="space-between" alignItems="center" borderTopWidth={1} borderColor={styles.atlas.border} flexWrap="wrap">
                    <HStack space={4} alignItems="center" flexWrap="wrap">
                        <HStack space={2} alignItems="center">
                            <Box w="3" h="3" rounded="sm" bg={styles.atlas.positive} />
                            <Text color={styles.atlas.muted} fontSize="xs">Up session (close &gt; open)</Text>
                        </HStack>
                        <HStack space={2} alignItems="center">
                            <Box w="3" h="3" rounded="sm" bg={styles.atlas.negative} />
                            <Text color={styles.atlas.muted} fontSize="xs">Down session</Text>
                        </HStack>
                        <HStack space={2} alignItems="center">
                            <Box w="3" h="0.5" bg={styles.atlas.muted} />
                            <Text color={styles.atlas.muted} fontSize="xs">Wick = high / low</Text>
                        </HStack>
                    </HStack>
                    <Text color={styles.atlas.muted} fontSize="2xs">Price axis → · X: session index</Text>
                </HStack>
            </Box>
        </VStack>
    );
}

export function MarketBreadthBars({ countries, activeMetric, selectedCountryCode, onSelectCountry }: MarketBreadthBarsProps) {
    const rankedCountries = [...countries]
        .sort((left, right) => rankMetric(right.metrics[activeMetric], activeMetric) - rankMetric(left.metrics[activeMetric], activeMetric))
        .slice(0, 6);
    const values = rankedCountries.map((country) => Math.abs(country.metrics[activeMetric]));
    const maxValue = Math.max(...values, 1);

    return (
        <VStack space={3}>
            <VStack space={1} mb={1}>
                <Text color={styles.atlas.accentStrong} fontSize="2xs" fontWeight="700" letterSpacing={2}>MARKET BREADTH</Text>
                <Text color={styles.atlas.textStrong} fontSize="md" fontWeight="700">Top 6 {activeMetricLabel(activeMetric).toLowerCase()} leaders</Text>
                <Text color={styles.atlas.muted} fontSize="xs">
                    Bar length is normalized to the strongest reading in the window. Right-side value shows the actual metric (scale: 0 → {formatMetric(maxValue, activeMetric)}).
                </Text>
            </VStack>
            {rankedCountries.map((country) => {
                const value = country.metrics[activeMetric];
                const width = `${Math.max((Math.abs(value) / maxValue) * 100, 18)}%`;
                const tone = getMetricTone(value, activeMetric);
                const selected = country.code === selectedCountryCode;

                return (
                    <Pressable key={country.code} onPress={() => onSelectCountry(country.code)}>
                        {({ isHovered }: { isHovered: boolean }) => (
                            <Box
                                rounded="2xl"
                                px={3}
                                py={3}
                                borderWidth={1}
                                borderColor={selected ? styles.atlas.focusPrimary : isHovered ? styles.atlas.borderStrong : styles.atlas.border}
                                bg={selected ? styles.atlas.panelRaised : styles.atlas.panel}
                            >
                                <HStack justifyContent="space-between" alignItems="center" mb={2}>
                                    <Text color={styles.atlas.text} fontWeight="700">{country.name}</Text>
                                    <Text color={tone} fontSize="xs">{formatMetric(value, activeMetric)}</Text>
                                </HStack>
                                <Box h="2" rounded="full" bg="rgba(255, 255, 255, 0.07)" overflow="hidden">
                                    <Box h="2" rounded="full" bg={tone} w={width} />
                                </Box>
                                <Text color={styles.atlas.muted} fontSize="xs" mt={2}>{country.benchmark}</Text>
                            </Box>
                        )}
                    </Pressable>
                );
            })}
        </VStack>
    );
}

export function SectorHeatmapVisual({ cells }: SectorHeatmapVisualProps) {
    return (
        <VStack space={4}>
            <VStack space={1}>
                <Text color={styles.atlas.accentStrong} fontSize="2xs" fontWeight="700" letterSpacing={2}>SECTOR HEATMAP</Text>
                <Text color={styles.atlas.textStrong} fontSize="md" fontWeight="700">Sector-by-region breadth · session change</Text>
                <Text color={styles.atlas.muted} fontSize="xs">
                    Each tile is a region × sector intersection. Background intensity tracks the session change; green = risk-on (&ge; +2.4%), amber = mixed, red = risk-off.
                </Text>
            </VStack>
            <SimpleGrid columns={cells.length >= 6 ? 3 : 2} space={3}>
                {cells.map((cell) => {
                    const tone = cell.change >= 2.4
                        ? "rgba(16, 185, 129, 0.26)"
                        : cell.change >= 0
                            ? "rgba(245, 158, 11, 0.22)"
                            : "rgba(239, 68, 68, 0.22)";
                    const borderTone = cell.change >= 0 ? styles.atlas.positive : styles.atlas.negative;

                    return (
                        <Box
                            key={`${cell.region}-${cell.sector}`}
                            minH="28"
                            rounded="3xl"
                            px={4}
                            py={4}
                            borderWidth={1}
                            borderColor={styles.atlas.glassEdge}
                            bg={tone}
                        >
                            <Text color={styles.atlas.muted} fontSize="xs">{cell.region}</Text>
                            <Text color={styles.atlas.text} fontWeight="700" mt={1}>{cell.sector}</Text>
                            <Text color={borderTone} fontSize="lg" fontWeight="800" mt={3}>{displaySignedPercent(cell.change, 1, 1)}</Text>
                            <Text color={styles.atlas.muted} fontSize="xs" mt={1}>{cell.leadership}</Text>
                        </Box>
                    );
                })}
            </SimpleGrid>

            <HStack justifyContent="space-between" alignItems="center" flexWrap="wrap" px={1}>
                <Text color={styles.atlas.muted} fontSize="xs" fontWeight="600">&lt; 0%</Text>
                <HStack space={0} alignItems="center" flex={1} mx={3}>
                    <Box h="2" flex={1} bg="rgba(239, 68, 68, 0.82)" roundedLeft="full" />
                    <Box h="2" flex={1} bg="rgba(245, 158, 11, 0.82)" />
                    <Box h="2" flex={1} bg="rgba(34, 197, 94, 0.82)" roundedRight="full" />
                </HStack>
                <Text color={styles.atlas.muted} fontSize="xs" fontWeight="600">&ge; +2.4%</Text>
            </HStack>
        </VStack>
    );
}

export function ScannerTapeVisual({ items, onSelectItem }: ScannerTapeVisualProps) {
    return (
        <VStack space={3}>
            {items.map((item, index) => {
                const points = buildScannerSeries(item.lastPrice, item.change, index);
                const tone = item.change >= 0 ? styles.atlas.positive : styles.atlas.negative;

                return (
                    <Pressable key={item.symbol} onPress={onSelectItem ? () => onSelectItem(item.symbol) : undefined}>
                        {({ isHovered }: { isHovered: boolean }) => (
                            <Box rounded="2xl" px={3} py={3} bg={isHovered ? styles.atlas.panelRaised : styles.atlas.panel} borderWidth={1} borderColor={styles.atlas.glassEdge}>
                                <HStack justifyContent="space-between" alignItems="center">
                                    <VStack flex={1} mr={3}>
                                        <Text color={styles.atlas.text} fontWeight="700">{item.symbol}</Text>
                                        <Text color={styles.atlas.muted} fontSize="xs">{item.note}</Text>
                                    </VStack>
                                    <Svg width="116" height="38" viewBox="0 0 116 38">
                                        <Path d={buildLinePath(points, 116, 38, 4)} fill="none" stroke={tone} strokeWidth="2.4" />
                                    </Svg>
                                    <VStack alignItems="flex-end" ml={3}>
                                        <Text color={styles.atlas.text} fontWeight="700">{displayCurrency(item.lastPrice, 2, 2)}</Text>
                                        <Text color={tone} fontSize="xs">{displaySignedPercent(item.change, 1, 1)}</Text>
                                    </VStack>
                                </HStack>
                            </Box>
                        )}
                    </Pressable>
                );
            })}
        </VStack>
    );
}

export function PortfolioAnalyticsVisual({
    positions,
    cashBalance,
    netLiq,
    unrealizedPnl,
    grossExposure
}: PortfolioAnalyticsVisualProps) {
    const equitySeries = buildEquitySeries(positions, netLiq, unrealizedPnl);
    const exposureSeries = [
        { label: "Cash", value: cashBalance, tone: styles.atlas.warning },
        { label: "Gross", value: grossExposure, tone: styles.atlas.warning },
        { label: "Open PnL", value: Math.abs(unrealizedPnl), tone: unrealizedPnl >= 0 ? styles.atlas.positive : styles.atlas.negative }
    ];
    const totalExposure = Math.max(exposureSeries.reduce((sum, item) => sum + item.value, 0), 1);

    const minEquity = Math.min(...equitySeries);
    const maxEquity = Math.max(...equitySeries);
    const equityRange = Math.max(maxEquity - minEquity, 1);
    const equityTicks = Array.from({ length: 4 }, (_, i) => minEquity + ((equityRange / 3) * i));
    const sessionLabels = ["D-6", "D-5", "D-4", "D-3", "D-2", "D-1", "Today"];

    return (
        <VStack space={4}>
            <VStack space={1}>
                <Text color={styles.atlas.accentStrong} fontSize="2xs" fontWeight="700" letterSpacing={2}>PORTFOLIO · NET LIQ CURVE</Text>
                <Text color={styles.atlas.textStrong} fontSize="md" fontWeight="700">7-day equity trajectory</Text>
                <Text color={styles.atlas.muted} fontSize="xs">
                    Line shows estimated account equity by trading day. Bars below split capital allocation across Cash, Gross Exposure, and unrealized PnL.
                </Text>
            </VStack>
            <Box rounded="2xl" overflow="hidden" borderWidth={1} borderColor={styles.atlas.border} bg={styles.atlas.panelMuted}>
                <Svg width="100%" height="220" viewBox="0 0 680 220">
                    <Defs>
                        <LinearGradient id="atlas-equity-fill" x1="0" x2="0" y1="0" y2="1">
                            <Stop offset="0%" stopColor={styles.atlas.accent} stopOpacity="0.34" />
                            <Stop offset="100%" stopColor={styles.atlas.accent} stopOpacity="0.02" />
                        </LinearGradient>
                    </Defs>
                    {equityTicks.map((tick, index) => {
                        const y = 20 + ((3 - index) * 52);
                        return (
                            <G key={`equity-grid-${index}`}>
                                <Line x1="44" y1={y} x2="620" y2={y} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 6" />
                                <SvgText x="40" y={y + 4} fill="#94A3B8" fontSize="10" textAnchor="end">{displayCurrency(tick, 0, 0)}</SvgText>
                            </G>
                        );
                    })}
                    <Path d={`${buildLinePath(equitySeries, 620, 200, 44)} L 620 180 L 44 180 Z`} fill="url(#atlas-equity-fill)" transform="translate(0,0)" />
                    <Path d={buildLinePath(equitySeries, 620, 200, 44)} fill="none" stroke={styles.atlas.accent} strokeWidth="3" />
                    {equitySeries.map((point, index) => {
                        const { x, y } = scalePoint(point, index, equitySeries, 620, 200, 44);
                        return (
                            <G key={`equity-${index}`}>
                                <Circle cx={x} cy={y} r="4" fill={styles.atlas.accent} />
                                <SvgText x={x} y="204" fill="#94A3B8" fontSize="10" textAnchor="middle">{sessionLabels[index] ?? ""}</SvgText>
                            </G>
                        );
                    })}
                </Svg>
            </Box>

            <SimpleGrid columns={3} space={3}>
                {exposureSeries.map((item) => (
                    <Box key={item.label} bg={styles.atlas.panelMuted} borderWidth={1} borderColor={styles.atlas.border} rounded="xl" p={3}>
                        <HStack justifyContent="space-between" mb={1.5}>
                            <Text color={styles.atlas.muted} fontSize="2xs" fontWeight="700" letterSpacing={1} textTransform="uppercase">{item.label}</Text>
                            <Text color={item.tone} fontSize="xs" fontWeight="700" style={{ fontVariantNumeric: "tabular-nums" } as any}>
                                {item.label === "Open PnL" ? displaySignedCurrency(unrealizedPnl) : displayCurrency(item.value)}
                            </Text>
                        </HStack>
                        <Box h="2.5" rounded="full" bg="rgba(255, 255, 255, 0.07)" overflow="hidden">
                            <Box h="2.5" rounded="full" bg={item.tone} w={`${Math.max((item.value / totalExposure) * 100, 10)}%`} />
                        </Box>
                        <Text color={styles.atlas.subtle} fontSize="2xs" mt={1.5}>{Math.round((item.value / totalExposure) * 100)}% of total</Text>
                    </Box>
                ))}
            </SimpleGrid>
        </VStack>
    );
}

export function CatalystTimelineVisual({ headlines, journalEntries }: CatalystTimelineVisualProps) {
    const events = [
        ...headlines.map((headline) => ({
            id: `headline-${headline.time}-${headline.headline}`,
            time: headline.time,
            title: headline.headline,
            subtitle: headline.catalyst,
            tone: headline.tone,
            impact: getToneImpact(headline.tone)
        })),
        ...journalEntries.map((entry) => ({
            id: `journal-${entry.id}`,
            time: entry.createdAt,
            title: entry.title,
            subtitle: entry.lesson,
            tone: "neutral" as const,
            impact: 0.52
        }))
    ].slice(0, 5);

    return (
        <VStack space={3}>
            {events.map((event, index) => {
                const tone = toneColor(event.tone);

                return (
                    <HStack key={event.id} alignItems="stretch">
                        <VStack alignItems="center" mr={3}>
                            <CircleBadge tone={tone} />
                            {index !== events.length - 1 ? <Box w="0.5" flex={1} bg="rgba(255, 255, 255, 0.08)" /> : null}
                        </VStack>
                        <Box flex={1} rounded="2xl" px={3} py={3} bg={styles.atlas.panel} borderWidth={1} borderColor={styles.atlas.glassEdge}>
                            <HStack justifyContent="space-between" alignItems="flex-start" mb={2}>
                                <Text color={styles.atlas.text} flex={1} fontWeight="700">{event.title}</Text>
                                <Text color={styles.atlas.muted} fontSize="xs" ml={3}>{event.time}</Text>
                            </HStack>
                            <Text color={styles.atlas.muted} fontSize="xs">{event.subtitle}</Text>
                            <Box h="1.5" mt={3} rounded="full" bg="rgba(255, 255, 255, 0.07)" overflow="hidden">
                                <Box h="1.5" rounded="full" bg={tone} w={`${Math.max(event.impact * 100, 24)}%`} />
                            </Box>
                        </Box>
                    </HStack>
                );
            })}
        </VStack>
    );
}

function SignalChip({ label, value, tone }: { label: string; value: string; tone: string }) {
    return (
        <Box mr={2} mb={2} px={3} py={2} rounded="full" bg={styles.atlas.panel} borderWidth={1} borderColor={styles.atlas.glassEdge}>
            <HStack space={2} alignItems="center">
                <Text color={styles.atlas.muted} fontSize="xs">{label}</Text>
                <Text color={tone} fontSize="xs" fontWeight="700">{value}</Text>
            </HStack>
        </Box>
    );
}

function CircleBadge({ tone }: { tone: string }) {
    return (
        <Svg width="14" height="14" viewBox="0 0 14 14">
            <Circle cx="7" cy="7" r="5.5" fill={tone} />
            <Circle cx="7" cy="7" r="2.2" fill={styles.atlas.overlay} />
        </Svg>
    );
}

function buildCandles(series: number[], dailyReturn: number): CandlePoint[] {
    return series.map((close, index) => {
        const previousClose = series[Math.max(index - 1, 0)] ?? close;
        const baseMove = Math.max(close * 0.012, 1);
        const open = roundPrice(index === 0 ? close - (baseMove * Math.sign(dailyReturn || 1)) : previousClose + ((close - previousClose) * 0.34));
        const high = roundPrice(Math.max(open, close) + (baseMove * (0.7 + ((index % 3) * 0.18))));
        const low = roundPrice(Math.min(open, close) - (baseMove * (0.58 + ((index % 4) * 0.12))));

        return {
            label: `S${index + 1}`,
            open,
            high,
            low,
            close
        };
    });
}

function detectPattern(candles: CandlePoint[]) {
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];

    if (!last || !prev) {
        return { label: "Neutral", tone: styles.atlas.neutral };
    }

    const lastBody = Math.abs(last.close - last.open);
    const lastRange = Math.max(last.high - last.low, 1);
    const upperWick = last.high - Math.max(last.open, last.close);
    const lowerWick = Math.min(last.open, last.close) - last.low;

    if (last.close > last.open && prev.close < prev.open && last.close >= prev.open && last.open <= prev.close) {
        return { label: "Bullish Engulf", tone: styles.atlas.positive };
    }

    if (last.close < last.open && prev.close > prev.open && last.open >= prev.close && last.close <= prev.open) {
        return { label: "Bearish Engulf", tone: styles.atlas.negative };
    }

    if ((lastBody / lastRange) < 0.28 && lowerWick > (lastBody * 1.8)) {
        return { label: "Hammer", tone: styles.atlas.positive };
    }

    if ((lastBody / lastRange) < 0.28 && upperWick > (lastBody * 1.8)) {
        return { label: "Shooting Star", tone: styles.atlas.negative };
    }

    return {
        label: last.close >= prev.close ? "Trend Continuation" : "Pullback Rotation",
        tone: last.close >= prev.close ? styles.atlas.positive : styles.atlas.neutral
    };
}

function buildScannerSeries(lastPrice: number, change: number, index: number): number[] {
    const base = lastPrice * 0.94;
    const drift = change >= 0 ? 1 : -1;

    return Array.from({ length: 8 }, (_, step) => {
        const bias = step * (change * 0.12);
        const pulse = Math.sin((step + 1) * 0.8 + index) * Math.max(lastPrice * 0.007, 0.45);
        return roundPrice(base + (lastPrice * 0.02 * step) + bias + (pulse * drift));
    });
}

function buildEquitySeries(positions: AtlasPosition[], netLiq: number, unrealizedPnl: number): number[] {
    const base = Math.max(netLiq - Math.abs(unrealizedPnl * 1.8), netLiq * 0.92);

    return Array.from({ length: 7 }, (_, index) => {
        const positionPulse = positions.reduce((sum, position, positionIndex) => {
            const weight = (positionIndex + 1) / Math.max(positions.length, 1);
            return sum + ((position.lastPrice - position.entryPrice) * position.quantity * 0.18 * weight);
        }, 0);

        return roundPrice(base + (index * (unrealizedPnl * 0.24 + positionPulse * 0.08)) + (Math.sin(index * 0.8) * Math.max(netLiq * 0.0025, 120)));
    });
}

function buildLinePath(values: number[], width: number, height: number, padding: number): string {
    return values.map((value, index) => {
        const point = scalePoint(value, index, values, width, height, padding);
        return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
    }).join(" ");
}

function buildProjectedPath(points: Array<{ x: number; y: number }>): string {
    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function projectCountryPoint(country: AtlasCountry, width: number, height: number, padding: number) {
    const usableWidth = width - (padding * 2);
    const usableHeight = height - (padding * 2) - 32;

    return {
        x: padding + (((country.position.longitude + 180) / 360) * usableWidth),
        y: padding + (((90 - country.position.latitude) / 180) * usableHeight)
    };
}

function scalePoint(value: number, index: number, values: number[], width: number, height: number, padding: number) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    const step = values.length > 1 ? (width - (padding * 2)) / (values.length - 1) : 0;

    return {
        x: padding + (step * index),
        y: height - padding - (((value - min) / range) * (height - (padding * 2)))
    };
}

function priceToY(value: number, minPrice: number, range: number, chartHeight: number, padding: number): number {
    return chartHeight - padding - (((value - minPrice) / range) * (chartHeight - (padding * 2)));
}

function rankMetric(value: number, metric: MarketMetricKey): number {
    return metric === "volatility" ? -value : value;
}

function getMetricTone(value: number, metric: MarketMetricKey): string {
    if (metric === "volatility") {
        return value >= 24 ? styles.atlas.negative : value >= 18 ? styles.atlas.neutral : styles.atlas.positive;
    }

    if (metric === "sectorStrength" || metric === "macroSentiment") {
        return value >= 70 ? styles.atlas.positive : value >= 45 ? styles.atlas.neutral : styles.atlas.negative;
    }

    if (value > 0.8) {
        return styles.atlas.positive;
    }

    if (value < -0.8) {
        return styles.atlas.negative;
    }

    return styles.atlas.neutral;
}

function toneColor(tone: "positive" | "negative" | "neutral"): string {
    if (tone === "positive") {
        return styles.atlas.positive;
    }

    if (tone === "negative") {
        return styles.atlas.negative;
    }

    return styles.atlas.neutral;
}

function getToneImpact(tone: "positive" | "negative" | "neutral") {
    if (tone === "positive") {
        return 0.88;
    }

    if (tone === "negative") {
        return 0.76;
    }

    return 0.58;
}

function formatTickValue(value: number, metric: MarketMetricKey): string {
    if (metric === "sectorStrength" || metric === "macroSentiment") {
        return `${Math.round(value)}`;
    }
    if (metric === "volatility") {
        return `${value.toFixed(1)}%`;
    }
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
}

function formatMetric(value: number, metric: MarketMetricKey): string {
    if (metric === "sectorStrength" || metric === "macroSentiment") {
        return `${Math.round(value)} / 100`;
    }

    if (metric === "volatility") {
        return `${value.toFixed(1)}%`;
    }

    return displaySignedPercent(value, 1, 1);
}

function activeMetricLabel(metric: MarketMetricKey) {
    switch (metric) {
        case "weeklyReturn":
            return "1W";
        case "volatility":
            return "Vol";
        case "sectorStrength":
            return "Breadth";
        case "macroSentiment":
            return "Macro";
        case "currencyMovement":
            return "FX";
        case "relativePerformance":
            return "Relative";
        default:
            return "1D";
    }
}

function compactPrice(value: number): string {
    if (value >= 10000) {
        return `${Math.round(value).toLocaleString("en-US")}`;
    }

    if (value >= 1000) {
        return `${value.toFixed(0)}`;
    }

    return value.toFixed(2);
}

function roundPrice(value: number): number {
    return Math.round(value * 100) / 100;
}
