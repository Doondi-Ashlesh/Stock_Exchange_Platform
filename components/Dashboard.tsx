import { ReactNode, useEffect, useMemo, useState } from "react";
import { Badge, Box, Button, Divider, Heading, HStack, Input, Pressable, ScrollView, SimpleGrid, Stack, Text, TextArea, VStack } from "native-base";
import { Platform } from "react-native";

import {
    BenchmarkCandlestickChart,
    CatalystTimelineVisual,
    GlobalPulseVisual,
    MarketBreadthBars,
    PortfolioAnalyticsVisual,
    ScannerTapeVisual,
    SectorHeatmapVisual
} from "./AtlasDashboardVisuals";
import { AtlasAccountCenter } from "./AtlasAccountCenter";
import { AtlasMarketGlobe } from "./AtlasMarketGlobe";
import {
    AtlasAssetResearch,
    AtlasCountry,
    AtlasJournalEntry,
    AtlasPosition,
    AtlasSnapshot,
    MarketMetricKey,
    ThesisDraft
} from "../types/atlasmarket";
import {
    atlasSnapshots,
    buildDraftFromAsset,
    buildDraftFromCountry,
    defaultSnapshot,
    getMetricDescriptor,
    getSnapshotByDate,
    metricDescriptors
} from "../utils/atlasMarketData";
import { buildGlobalCoverageCountries } from "../utils/atlasWorldCoverage";
import { applyLiveDataToSnapshot, applyLiveDetailToAsset, AtlasLiveFeedState, fetchAtlasLiveFeed, getAtlasLiveRefreshIntervalMs } from "../utils/atlasLiveData";
import { displayCurrency, displaySignedCurrency, displaySignedPercent } from "../utils/formatters";
import { getStorageValue, saveToStorage } from "../utils/storage";
import { styles } from "../utils/styles";
import {
    appendWorkspaceJournalEntry,
    ATLAS_WORKSPACE_STORAGE_KEY,
    AtlasOrderRequest,
    AtlasTransferRequest,
    cancelWorkspaceOrder,
    closeWorkspaceTrade,
    createInitialWorkspace,
    deriveWorkspaceViewWithCountries,
    hydrateWorkspaceState,
    openWorkspaceTrade,
    resetWorkspace,
    settleWorkspaceTransfer,
    serializeWorkspaceState,
    submitWorkspaceOrder,
    submitWorkspaceTransfer,
    syncWorkspaceWithMarket,
    toggleWatchlistSymbol,
    upsertWorkspaceThesis
} from "../utils/atlasWorkspace";

type PageMode = "dashboard" | "globe" | "research" | "portfolio" | "journal" | "account";

interface SearchResult {
    id: string;
    type: "country" | "asset";
    title: string;
    subtitle: string;
    countryCode: string;
    symbol?: string;
}

interface JournalDraftState {
    title: string;
    outcome: string;
    lesson: string;
}

const INITIAL_WORKSPACE = createInitialWorkspace(defaultSnapshot);

export function AtlasMarketDashboard() {
    const [pageMode, setPageMode] = useState<PageMode>("dashboard");
    const [activeMetric, setActiveMetric] = useState<MarketMetricKey>("dailyReturn");
    const [activeDate, setActiveDate] = useState(defaultSnapshot.date);
    const baseSnapshot = getSnapshotByDate(activeDate);

    const [workspace, setWorkspace] = useState(INITIAL_WORKSPACE);
    const [workspaceReady, setWorkspaceReady] = useState(false);
    const [selectedCountryCode, setSelectedCountryCode] = useState(baseSnapshot.featuredCountryCode);
    const [selectedAssetSymbol, setSelectedAssetSymbol] = useState(baseSnapshot.countries[0]?.thesis.symbol ?? "NVDA");
    const [draft, setDraft] = useState<ThesisDraft>(buildDraftFromCountry(baseSnapshot.countries[0] ?? defaultSnapshot.countries[0]));
    const [searchQuery, setSearchQuery] = useState("");
    const [activityMessage, setActivityMessage] = useState("AtlasMarket workspace ready.");
    const [journalDraft, setJournalDraft] = useState<JournalDraftState>({ title: "", outcome: "", lesson: "" });
    const [liveFeed, setLiveFeed] = useState<AtlasLiveFeedState>({
        status: "demo",
        message: "AtlasMarket is using its built-in dataset right now.",
        assetQuotes: {},
        benchmarkQuotes: {}
    });

    const snapshot = useMemo(() => applyLiveDataToSnapshot(baseSnapshot, liveFeed), [baseSnapshot, liveFeed]);
    const globeCountries = useMemo(() => buildGlobalCoverageCountries(snapshot), [snapshot]);

    useEffect(() => {
        let active = true;

        async function loadWorkspace() {
            const stored = await getStorageValue(ATLAS_WORKSPACE_STORAGE_KEY);

            if (!active) {
                return;
            }

            setWorkspace(hydrateWorkspaceState(stored, defaultSnapshot));
            setWorkspaceReady(true);
        }

        loadWorkspace();

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!workspaceReady) {
            return;
        }

        saveToStorage(ATLAS_WORKSPACE_STORAGE_KEY, serializeWorkspaceState(workspace));
    }, [workspace, workspaceReady]);

    useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setInterval> | undefined;

        async function loadLiveFeed() {
            const nextFeed = await fetchAtlasLiveFeed(baseSnapshot, workspace.watchlistSymbols, selectedAssetSymbol);

            if (!active) {
                return;
            }

            setLiveFeed(nextFeed);
        }

        loadLiveFeed();

        if (baseSnapshot.mode === "Live") {
            timer = setInterval(loadLiveFeed, getAtlasLiveRefreshIntervalMs());
        }

        return () => {
            active = false;
            if (timer) {
                clearInterval(timer);
            }
        };
    }, [baseSnapshot, selectedAssetSymbol, workspace.watchlistSymbols]);

    useEffect(() => {
        if (!globeCountries.find((country) => country.code === selectedCountryCode)) {
            const fallbackCountry = globeCountries.find((country) => country.code === snapshot.featuredCountryCode) ?? globeCountries[0];

            if (fallbackCountry) {
                setSelectedCountryCode(fallbackCountry.code);
            }
        }
    }, [globeCountries, selectedCountryCode, snapshot.featuredCountryCode]);

    const workspaceView = useMemo(
        () => deriveWorkspaceViewWithCountries(snapshot, workspace, globeCountries),
        [globeCountries, snapshot, workspace]
    );
    const selectedCountry = globeCountries.find((country) => country.code === selectedCountryCode)
        ?? globeCountries.find((country) => country.code === snapshot.featuredCountryCode)
        ?? globeCountries[0];
    const rankedCountries = useMemo(
        () => [...globeCountries].sort((left, right) => rankMetric(right.metrics[activeMetric], activeMetric) - rankMetric(left.metrics[activeMetric], activeMetric)),
        [activeMetric, globeCountries]
    );
    const selectedAsset = workspaceView.assetCatalog.find((asset) => asset.symbol === selectedAssetSymbol)
        ?? workspaceView.assetCatalog.find((asset) => asset.countryCode === selectedCountry.code)
        ?? workspaceView.assetCatalog[0];
    const selectedAssetLive = useMemo(
        () => selectedAsset ? applyLiveDetailToAsset(selectedAsset, liveFeed.selectedAssetDetail) : selectedAsset,
        [liveFeed.selectedAssetDetail, selectedAsset]
    );
    const metricDescriptor = getMetricDescriptor(activeMetric);
    const focusPulseCountries = rankedCountries.slice(0, 12).map((country) => country.code);
    const searchResults = useMemo(
        () => buildSearchResults(searchQuery, globeCountries, workspaceView.assetCatalog),
        [globeCountries, searchQuery, workspaceView.assetCatalog]
    );
    const relatedAssets = useMemo(
        () => workspaceView.assetCatalog.filter((asset) => asset.countryCode === selectedCountry.code).slice(0, 6),
        [selectedCountry.code, workspaceView.assetCatalog]
    );
    const inWatchlist = workspace.watchlistSymbols.includes(selectedAssetLive?.symbol ?? "");

    useEffect(() => {
        if (!selectedCountry || !selectedAssetLive) {
            return;
        }

        if (selectedAssetLive.countryCode !== selectedCountry.code) {
            const countryAsset = workspaceView.assetCatalog.find((asset) => asset.countryCode === selectedCountry.code) ?? selectedAssetLive;
            setSelectedAssetSymbol(countryAsset.symbol);
            setDraft(buildDraftFromAsset(snapshot, countryAsset));
            return;
        }

        if (draft.symbol !== selectedAssetLive.symbol || draft.entryPrice !== selectedAssetLive.price) {
            setDraft(buildDraftFromAsset(snapshot, selectedAssetLive));
        }
    }, [draft.entryPrice, draft.symbol, selectedAssetLive, selectedCountry, snapshot, workspaceView.assetCatalog]);

    useEffect(() => {
        if (!workspaceReady) {
            return;
        }

        const syncResult = syncWorkspaceWithMarket(workspace, snapshot, snapshot.label);

        if (syncResult.changes.length > 0) {
            setWorkspace(syncResult.workspace);
            setActivityMessage(syncResult.changes[0]);
        }
    }, [snapshot, workspace, workspaceReady]);

    function appendTradeJournal(
        workspaceState: typeof workspace,
        symbol: string,
        tradeId: string,
        countryCode: string,
        title: string,
        outcome: string,
        lesson: string
    ) {
        return appendWorkspaceJournalEntry(workspaceState, {
            title,
            outcome,
            lesson,
            createdAt: snapshot.label,
            symbol,
            tradeId,
            countryCode
        });
    }

    function selectCountry(countryCode: string, targetPage?: PageMode) {
        const country = globeCountries.find((item) => item.code === countryCode) ?? globeCountries[0];
        const asset = workspaceView.assetCatalog.find((item) => item.countryCode === country.code)
            ?? workspaceView.assetCatalog[0];

        setSelectedCountryCode(country.code);

        if (asset) {
            setSelectedAssetSymbol(asset.symbol);
            setDraft(buildDraftFromAsset(snapshot, asset));
        } else {
            setDraft(buildDraftFromCountry(country));
        }

        setActivityMessage(`Loaded ${country.name} into the active research deck.`);

        if (targetPage) {
            setPageMode(targetPage);
        }
    }

    function selectAsset(asset: AtlasAssetResearch, targetPage: PageMode = "research") {
        setSelectedCountryCode(asset.countryCode);
        setSelectedAssetSymbol(asset.symbol);
        setDraft(buildDraftFromAsset(snapshot, asset));
        setActivityMessage(`${asset.symbol} research deck ready.`);
        setPageMode(targetPage);
    }

    function handleSearchSelection(result: SearchResult) {
        setSearchQuery("");

        if (result.type === "country") {
            selectCountry(result.countryCode, "globe");
            return;
        }

        const asset = workspaceView.assetCatalog.find((item) => item.symbol === result.symbol);

        if (asset) {
            selectAsset(asset, "research");
        }
    }

    function updateDraftText(field: keyof ThesisDraft, value: string) {
        setDraft((current) => ({ ...current, [field]: value }));
    }

    function updateDraftNumber(field: keyof ThesisDraft, value: string) {
        const parsed = Number(value);

        setDraft((current) => ({
            ...current,
            [field]: Number.isFinite(parsed)
                ? field === "plannedQuantity"
                    ? Math.max(1, Math.floor(parsed))
                    : parsed
                : current[field]
        }));
    }

    function saveThesis() {
        const countryCode = selectedCountry?.code ?? snapshot.featuredCountryCode;
        const result = upsertWorkspaceThesis(workspace, draft, countryCode, snapshot.label);

        setWorkspace(result.workspace);
        setActivityMessage(`Saved ${draft.symbol} thesis to the command queue.`);
    }

    function openPaperTrade() {
        const countryCode = selectedCountry?.code ?? snapshot.featuredCountryCode;
        const thesisState = upsertWorkspaceThesis(workspace, draft, countryCode, snapshot.label);
        const result = openWorkspaceTrade(thesisState.workspace, snapshot, draft, countryCode, snapshot.label, thesisState.thesisId);

        if (!result.trade) {
            setWorkspace(result.workspace);
            setActivityMessage(result.message);
            return;
        }

        const withJournal = appendTradeJournal(
            result.workspace,
            draft.symbol,
            result.trade.id,
            countryCode,
            `${draft.symbol} paper trade opened`,
            `${draft.direction} ${draft.plannedQuantity} shares`,
            `Track ${draft.catalyst.toLowerCase()} follow-through before adding size.`
        );

        setWorkspace(withJournal);
        setActivityMessage(result.message);
        setPageMode("portfolio");
    }

    function closeTrade(tradeId: string, exitReason: string) {
        const result = closeWorkspaceTrade(workspace, snapshot, tradeId, snapshot.label, exitReason);

        if (!result.trade) {
            setActivityMessage(result.message);
            return;
        }

        const withJournal = appendWorkspaceJournalEntry(result.workspace, {
            title: `${result.trade.symbol} trade closed`,
            outcome: displaySignedCurrency(result.trade.realizedPnl ?? 0, 2, 2),
            lesson: result.trade.realizedPnl && result.trade.realizedPnl > 0
                ? "Let clean winners work, then document what kept the thesis valid."
                : "Respecting invalidation preserves paper capital for better regimes.",
            createdAt: snapshot.label,
            symbol: result.trade.symbol,
            tradeId: result.trade.id,
            countryCode: result.trade.countryCode,
            tags: ["trade-close"]
        });

        setWorkspace(withJournal);
        setActivityMessage(result.message);
    }

    function toggleWatchlist() {
        if (!selectedAssetLive) {
            return;
        }

        setWorkspace((current) => toggleWatchlistSymbol(current, selectedAssetLive.symbol));
        setActivityMessage(
            inWatchlist
                ? `${selectedAssetLive.symbol} removed from the Atlas watchlist.`
                : `${selectedAssetLive.symbol} added to the Atlas watchlist.`
        );
    }

    function submitJournalEntry() {
        if (!journalDraft.title.trim() || !journalDraft.lesson.trim()) {
            setActivityMessage("Give the journal entry a title and lesson before saving.");
            return;
        }

        const nextWorkspace = appendWorkspaceJournalEntry(workspace, {
            title: journalDraft.title.trim(),
            outcome: journalDraft.outcome.trim() || "Observation logged",
            lesson: journalDraft.lesson.trim(),
            createdAt: snapshot.label,
            symbol: selectedAssetLive?.symbol,
            countryCode: selectedCountry?.code,
            tags: ["manual-note"]
        });

        setWorkspace(nextWorkspace);
        setJournalDraft({ title: "", outcome: "", lesson: "" });
        setActivityMessage("Journal note added to the replay log.");
    }

    function handleSubmitTransfer(request: AtlasTransferRequest) {
        const result = submitWorkspaceTransfer(workspace, request, snapshot.label);
        setWorkspace(result.workspace);
        setActivityMessage(result.message);
    }

    function handleSettleTransfer(transferId: string) {
        const result = settleWorkspaceTransfer(workspace, transferId, snapshot.label);
        setWorkspace(result.workspace);
        setActivityMessage(result.message);
    }

    function handleSubmitOrder(request: AtlasOrderRequest) {
        const result = submitWorkspaceOrder(workspace, snapshot, request, snapshot.label);

        if (!result.trade) {
            setWorkspace(result.workspace);
            setActivityMessage(result.message);
            return;
        }

        const withJournal = appendTradeJournal(
            result.workspace,
            request.symbol,
            result.trade.id,
            request.countryCode,
            `${request.symbol} order filled`,
            `${request.orderType} ${request.direction} ${request.quantity} shares`,
            `Paper order routed from the account center. Review ${request.catalyst?.toLowerCase() ?? "the active catalyst"} before adding size.`
        );

        setWorkspace(withJournal);
        setActivityMessage(result.message);
    }

    function handleCancelOrder(orderId: string) {
        const result = cancelWorkspaceOrder(workspace, orderId, snapshot.label);
        setWorkspace(result.workspace);
        setActivityMessage(result.message);
    }

    function resetPaperWorkspace() {
        const nextWorkspace = resetWorkspace(snapshot);
        setWorkspace(nextWorkspace);
        setActivityMessage(`Reset the paper workspace to ${snapshot.label}.`);
    }

    return (
        <ScrollView flex={1} bg={styles.atlas.background}>
            <Box minH="100%" position="relative" bg={styles.atlas.background}>
                <AmbientBackdrop />
                <Box safeArea px={pageMode === "globe" ? { base: 3, md: 4, xl: 5 } : { base: 4, md: 6 }} py={pageMode === "globe" ? 4 : 6}>
                    <VStack space={5}>
                        <DashboardHeader
                            snapshot={snapshot}
                            pageMode={pageMode}
                            setPageMode={setPageMode}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            searchResults={searchResults}
                            onSelectResult={handleSearchSelection}
                            activityMessage={activityMessage}
                            workspaceView={workspaceView}
                            selectedAsset={selectedAssetLive}
                            liveFeed={liveFeed}
                        />

                        <ActivityStrip
                            pageMode={pageMode}
                            snapshot={snapshot}
                            workspaceReady={workspaceReady}
                            netLiq={workspaceView.netLiq}
                            realizedPnl={workspaceView.realizedPnl}
                            unrealizedPnl={workspaceView.unrealizedPnl}
                            liveFeed={liveFeed}
                        />

                        {pageMode === "dashboard" ? <DashboardPage
                            snapshot={snapshot}
                            globeCountries={globeCountries}
                            activeMetric={activeMetric}
                            setActiveMetric={setActiveMetric}
                            activeDate={activeDate}
                            setActiveDate={setActiveDate}
                            selectedCountry={selectedCountry}
                            rankedCountries={rankedCountries}
                            selectCountry={selectCountry}
                            onSelectAsset={selectAsset}
                            onOpenGlobe={() => setPageMode("globe")}
                            onOpenResearch={() => setPageMode("research")}
                            onOpenPortfolio={() => setPageMode("portfolio")}
                            onOpenAccount={() => setPageMode("account")}
                            workspaceView={workspaceView}
                            metricDescriptor={metricDescriptor}
                        /> : null}

                        {pageMode === "globe" ? <GlobePage
                            snapshot={snapshot}
                            globeCountries={globeCountries}
                            selectedCountry={selectedCountry}
                            activeMetric={activeMetric}
                            setActiveMetric={setActiveMetric}
                            activeDate={activeDate}
                            setActiveDate={setActiveDate}
                            metricDescriptor={metricDescriptor}
                            selectCountry={selectCountry}
                            draft={draft}
                            updateDraftText={updateDraftText}
                            updateDraftNumber={updateDraftNumber}
                            saveThesis={saveThesis}
                            openPaperTrade={openPaperTrade}
                            focusPulseCountries={focusPulseCountries}
                            onOpenResearch={() => setPageMode("research")}
                            onToggleWatchlist={toggleWatchlist}
                            inWatchlist={inWatchlist}
                            workspaceView={workspaceView}
                        /> : null}

                        {pageMode === "research" && selectedAssetLive ? <ResearchPage
                            snapshot={snapshot}
                            selectedCountry={selectedCountry}
                            selectedAsset={selectedAssetLive}
                            draft={draft}
                            updateDraftText={updateDraftText}
                            updateDraftNumber={updateDraftNumber}
                            onSaveThesis={saveThesis}
                            onOpenPaperTrade={openPaperTrade}
                            onToggleWatchlist={toggleWatchlist}
                            inWatchlist={inWatchlist}
                            relatedAssets={relatedAssets}
                            onSelectAsset={selectAsset}
                            onOpenGlobe={() => setPageMode("globe")}
                        /> : null}

                        {pageMode === "portfolio" ? <PortfolioPage
                            workspaceView={workspaceView}
                            selectedAsset={selectedAssetLive}
                            onCloseTrade={closeTrade}
                            onResetPaperWorkspace={resetPaperWorkspace}
                            onSelectAsset={selectAsset}
                        /> : null}

                        {pageMode === "journal" ? <JournalPage
                            journalDraft={journalDraft}
                            setJournalDraft={setJournalDraft}
                            onSubmitJournalEntry={submitJournalEntry}
                            selectedAsset={selectedAssetLive}
                            journalEntries={workspaceView.journalEntries}
                        /> : null}

                        {pageMode === "account" ? <AtlasAccountCenter
                            snapshot={snapshot}
                            liveFeed={liveFeed}
                            workspaceView={workspaceView}
                            draft={draft}
                            selectedCountryCode={selectedCountry.code}
                            selectedAsset={selectedAssetLive}
                            onSubmitTransfer={handleSubmitTransfer}
                            onSettleTransfer={handleSettleTransfer}
                            onSubmitOrder={handleSubmitOrder}
                            onCancelOrder={handleCancelOrder}
                            onSelectAsset={selectAsset}
                        /> : null}
                    </VStack>
                </Box>
            </Box>
        </ScrollView>
    );
}

export const RevenutDashboard = AtlasMarketDashboard;

function DashboardHeader({
    snapshot,
    pageMode,
    setPageMode,
    searchQuery,
    setSearchQuery,
    searchResults,
    onSelectResult,
    activityMessage,
    workspaceView,
    selectedAsset,
    liveFeed
}: {
    snapshot: AtlasSnapshot;
    pageMode: PageMode;
    setPageMode: (mode: PageMode) => void;
    searchQuery: string;
    setSearchQuery: (value: string) => void;
    searchResults: SearchResult[];
    onSelectResult: (result: SearchResult) => void;
    activityMessage: string;
    workspaceView: ReturnType<typeof deriveWorkspaceViewWithCountries>;
    selectedAsset?: AtlasAssetResearch;
    liveFeed: AtlasLiveFeedState;
}) {
    return (
        <Card bg={styles.atlas.hero} borderColor={styles.atlas.borderStrong}>
            <VStack space={4}>
                <Stack direction={{ base: "column", xl: "row" }} justifyContent="space-between" space={4}>
                    <VStack flex={1} space={3}>
                        <HStack justifyContent="space-between" alignItems="flex-start" flexWrap="wrap">
                            <VStack flex={1} mr={4} space={1}>
                                <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700" letterSpacing="xl">ATLASMARKET // PAPER DESK</Text>
                                <Heading color={styles.atlas.text} size="md">
                                    Global command board
                                </Heading>
                                <Text color={styles.atlas.muted} fontSize="sm">
                                    Research, globe routing, paper execution, journal review, and account workflows in one terminal.
                                </Text>
                            </VStack>
                            <HStack flexWrap="wrap" maxW={{ base: "100%", xl: "56%" }}>
                                <ModeButton label="Dashboard" active={pageMode === "dashboard"} onPress={() => setPageMode("dashboard")} />
                                <ModeButton label="Globe Page" active={pageMode === "globe"} onPress={() => setPageMode("globe")} />
                                <ModeButton label="Research" active={pageMode === "research"} onPress={() => setPageMode("research")} />
                                <ModeButton label="Portfolio" active={pageMode === "portfolio"} onPress={() => setPageMode("portfolio")} />
                                <ModeButton label="Journal" active={pageMode === "journal"} onPress={() => setPageMode("journal")} />
                                <ModeButton label="Account" active={pageMode === "account"} onPress={() => setPageMode("account")} />
                            </HStack>
                        </HStack>

                        <SimpleGrid minChildWidth={160} space={3}>
                            <MiniMetric label="Net Liq" value={displayCurrency(workspaceView.netLiq)} tone={styles.atlas.text} />
                            <MiniMetric label="Open PnL" value={displaySignedCurrency(workspaceView.unrealizedPnl)} tone={workspaceView.unrealizedPnl >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                            <MiniMetric label="Watchlist" value={`${workspaceView.watchlist.length} names`} tone={styles.atlas.focusSecondary} />
                            <MiniMetric label="Replay" value={snapshot.label} tone={styles.atlas.focusPrimary} />
                        </SimpleGrid>
                    </VStack>

                    <VStack w={{ base: "100%", xl: "420px" }} space={3}>
                        <Field label="Command Search">
                            <Input
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                bg={styles.atlas.backgroundAlt}
                                borderColor={styles.atlas.border}
                                color={styles.atlas.text}
                                placeholder="Search country, sector, or ticker"
                                placeholderTextColor={styles.atlas.muted}
                            />
                        </Field>

                        {searchQuery.trim() && searchResults.length > 0 ? (
                            <Box rounded="md" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.borderStrong} overflow="hidden">
                                {searchResults.map((result) => (
                                    <Pressable key={result.id} onPress={() => onSelectResult(result)}>
                                        {({ isHovered }: { isHovered: boolean }) => (
                                            <Box px={4} py={3} bg={isHovered ? styles.atlas.panelRaised : "transparent"}>
                                                <HStack justifyContent="space-between" alignItems="center">
                                                    <VStack flex={1} mr={3}>
                                                        <Text color={styles.atlas.text} fontWeight="700">{result.title}</Text>
                                                        <Text color={styles.atlas.muted} fontSize="xs">{result.subtitle}</Text>
                                                    </VStack>
                                                    <Chip label={result.type === "country" ? "Country" : result.symbol ?? "Asset"} tone={result.type === "country" ? styles.atlas.focusSecondary : styles.atlas.focusPrimary} />
                                                </HStack>
                                            </Box>
                                        )}
                                    </Pressable>
                                ))}
                            </Box>
                        ) : null}

                        <SimpleGrid columns={2} space={3}>
                            <MiniMetric label="Feed" value={liveFeed.status === "live" ? "Live" : liveFeed.status === "replay" ? "Replay" : "Dataset"} tone={liveFeed.status === "live" ? styles.atlas.positive : styles.atlas.focusSecondary} />
                            <MiniMetric label="Focus" value={selectedAsset?.symbol ?? snapshot.featuredCountryCode} tone={styles.atlas.text} />
                        </SimpleGrid>
                    </VStack>
                </Stack>

                <Stack direction={{ base: "column", xl: "row" }} justifyContent="space-between" alignItems={{ base: "flex-start", xl: "center" }} space={3}>
                    <HStack flexWrap="wrap">
                        <Chip label={snapshot.mode} tone={snapshot.mode === "Live" ? styles.atlas.positive : styles.atlas.focusSecondary} />
                        <Chip label={liveFeed.status === "live" ? "Live Feed" : liveFeed.status === "replay" ? "Replay Feed" : "Dataset Feed"} tone={liveFeed.status === "live" ? styles.atlas.positive : styles.atlas.focusSecondary} />
                        <Chip label={`${workspaceView.watchlist.length} watchlist`} tone={styles.atlas.text} />
                        {selectedAsset ? <Chip label={selectedAsset.symbol} tone={styles.atlas.focusPrimary} /> : null}
                    </HStack>
                    <VStack alignItems={{ base: "flex-start", xl: "flex-end" }} space={1}>
                        <Text color={styles.atlas.muted} fontSize="xs">{liveFeed.message}</Text>
                        <Text color={styles.atlas.muted} fontSize="xs">{activityMessage}</Text>
                    </VStack>
                </Stack>
            </VStack>
        </Card>
    );
}

function ActivityStrip({
    pageMode,
    snapshot,
    workspaceReady,
    netLiq,
    realizedPnl,
    unrealizedPnl,
    liveFeed
}: {
    pageMode: PageMode;
    snapshot: AtlasSnapshot;
    workspaceReady: boolean;
    netLiq: number;
    realizedPnl: number;
    unrealizedPnl: number;
    liveFeed: AtlasLiveFeedState;
}) {
    return (
        <Card bg={styles.atlas.panel}>
            <Stack direction={{ base: "column", md: "row" }} justifyContent="space-between" alignItems={{ base: "flex-start", md: "center" }} space={3}>
                <HStack flexWrap="wrap">
                    <Chip label={pageMode.toUpperCase()} tone={styles.atlas.text} />
                    <Chip label={snapshot.label} tone={styles.atlas.focusSecondary} />
                    <Chip label={workspaceReady ? "Workspace Synced" : "Loading Workspace"} tone={workspaceReady ? styles.atlas.positive : styles.atlas.focusSecondary} />
                    <Chip label={liveFeed.updatedAt ? `Updated ${new Date(liveFeed.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : liveFeed.status.toUpperCase()} tone={liveFeed.status === "live" ? styles.atlas.positive : styles.atlas.focusSecondary} />
                </HStack>
                <HStack flexWrap="wrap">
                    <Chip label={`Net ${displayCurrency(netLiq)}`} tone={styles.atlas.text} />
                    <Chip label={`Realized ${displaySignedCurrency(realizedPnl)}`} tone={realizedPnl >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                    <Chip label={`Open ${displaySignedCurrency(unrealizedPnl)}`} tone={unrealizedPnl >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                </HStack>
            </Stack>
        </Card>
    );
}

function DashboardPage({
    snapshot,
    globeCountries,
    activeMetric,
    setActiveMetric,
    activeDate,
    setActiveDate,
    selectedCountry,
    rankedCountries,
    selectCountry,
    onSelectAsset,
    onOpenGlobe,
    onOpenResearch,
    onOpenPortfolio,
    onOpenAccount,
    workspaceView,
    metricDescriptor
}: {
    snapshot: AtlasSnapshot;
    globeCountries: AtlasCountry[];
    activeMetric: MarketMetricKey;
    setActiveMetric: (metric: MarketMetricKey) => void;
    activeDate: string;
    setActiveDate: (date: string) => void;
    selectedCountry: AtlasCountry;
    rankedCountries: AtlasCountry[];
    selectCountry: (countryCode: string, targetPage?: PageMode) => void;
    onSelectAsset: (asset: AtlasAssetResearch) => void;
    onOpenGlobe: () => void;
    onOpenResearch: () => void;
    onOpenPortfolio: () => void;
    onOpenAccount: () => void;
    workspaceView: ReturnType<typeof deriveWorkspaceViewWithCountries>;
    metricDescriptor: ReturnType<typeof getMetricDescriptor>;
}) {
    const selectedCountryAssets = workspaceView.assetCatalog.filter((asset) => asset.countryCode === selectedCountry.code);
    const cashBalance = workspaceView.cashBalance;

    return (
        <VStack space={5}>
            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Card flex={1} bg={styles.atlas.hero} borderColor={styles.atlas.borderStrong}>
                    <VStack space={4}>
                        <HStack justifyContent="space-between" alignItems="flex-start" flexWrap="wrap">
                            <VStack flex={1} mr={4} space={1}>
                                <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700" letterSpacing="xl">COMMAND DECK</Text>
                                <Heading color={styles.atlas.text} size="md">{selectedCountry.name} | {selectedCountry.benchmark}</Heading>
                                <Text color={styles.atlas.muted} fontSize="sm">{selectedCountry.summary}</Text>
                                <HStack flexWrap="wrap">
                                    <Chip label={`${selectedCountry.name} focus`} tone={styles.atlas.focusPrimary} />
                                    <Chip label={selectedCountry.benchmark} tone={styles.atlas.focusSecondary} />
                                    <Chip label={metricDescriptor.shortLabel} tone={styles.atlas.text} />
                                </HStack>
                            </VStack>
                            <VStack alignItems={{ base: "flex-start", xl: "flex-end" }} space={1}>
                                <Text color={styles.atlas.text} fontWeight="700">{displayCurrency(workspaceView.netLiq)}</Text>
                                <Text color={workspaceView.unrealizedPnl >= 0 ? styles.atlas.positive : styles.atlas.negative} fontSize="sm" fontWeight="700">
                                    {displaySignedCurrency(workspaceView.unrealizedPnl)} open paper
                                </Text>
                            </VStack>
                        </HStack>

                        <HStack flexWrap="wrap">
                            <Button mr={2} mb={2} variant="outline" borderColor={styles.atlas.focusPrimary} _text={{ color: styles.atlas.focusPrimary }} onPress={() => selectCountry("US")}>United States focus</Button>
                            <Button mr={2} mb={2} variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={() => { }}>{selectedCountry.benchmark}</Button>
                        </HStack>

                        <HStack flexWrap="wrap">
                            <Button mr={2} mb={2} variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={() => { }}>1D</Button>
                        </HStack>

                        <HStack flexWrap="wrap" mt={4}>
                            <Button mr={2} mb={2} bg={styles.atlas.focusPrimary} borderColor={styles.atlas.focusPrimary} _text={{ color: styles.atlas.ink, fontWeight: "700" }} onPress={onOpenGlobe}>Open Globe Page</Button>
                            <Button mr={2} mb={2} variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={onOpenResearch}>Open Research</Button>
                            <Button mr={2} mb={2} variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={onOpenPortfolio}>Open Portfolio</Button>
                            <Button mr={2} mb={2} variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={onOpenAccount}>Open Account Center</Button>
                        </HStack>

                        <SimpleGrid columns={2} space={3}>
                            <MiniMetric label="Cash" value={displayCurrency(cashBalance)} tone={styles.atlas.text} />
                            <MiniMetric label="Gross" value={displayCurrency(workspaceView.grossExposure)} tone={styles.atlas.focusSecondary} />
                            <MiniMetric label="Realized" value={displaySignedCurrency(workspaceView.realizedPnl)} tone={workspaceView.realizedPnl >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                            <MiniMetric label="Win Rate" value={`${workspaceView.winRate}%`} tone={styles.atlas.focusPrimary} />
                        </SimpleGrid>

                        <Field label="Replay Window">
                            <HStack flexWrap="wrap">
                                {atlasSnapshots.map((marketSnapshot) => (
                                    <Button
                                        key={marketSnapshot.date}
                                        mr={2}
                                        mb={2}
                                        size="sm"
                                        variant={marketSnapshot.date === activeDate ? "solid" : "subtle"}
                                        bg={marketSnapshot.date === activeDate ? styles.atlas.panelRaised : styles.atlas.backgroundAlt}
                                        borderColor={marketSnapshot.date === activeDate ? styles.atlas.focusPrimary : styles.atlas.border}
                                        _text={{ color: styles.atlas.text }}
                                        onPress={() => setActiveDate(marketSnapshot.date)}
                                    >
                                        {marketSnapshot.mode === "Live" ? "Live" : marketSnapshot.label}
                                    </Button>
                                ))}
                            </HStack>
                        </Field>

                        <PortfolioAnalyticsVisual
                            positions={workspaceView.positions}
                            cashBalance={cashBalance}
                            netLiq={workspaceView.netLiq}
                            unrealizedPnl={workspaceView.unrealizedPnl}
                            grossExposure={workspaceView.grossExposure}
                        />
                    </VStack>
                </Card>

                <Card flex={1} bg={styles.atlas.panelMuted}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">WORLD RADAR</Text>
                        <SimpleGrid columns={2} space={3}>
                            {snapshot.globalStats.map((stat) => (
                                <MiniMetric key={stat.label} label={stat.label} value={stat.value} tone={toneColor(stat.tone)} />
                            ))}
                        </SimpleGrid>
                        <Divider bg={styles.atlas.border} />
                        <Text color={styles.atlas.text} fontWeight="700">{selectedCountry.name} focus</Text>
                        <Text color={styles.atlas.muted} fontSize="xs">{selectedCountry.summary}</Text>
                        <Field label="Overlay">
                            <HStack flexWrap="wrap">
                                {metricDescriptors.map((metric) => (
                                    <Button
                                        key={metric.key}
                                        mr={2}
                                        mb={2}
                                        size="sm"
                                        variant={metric.key === activeMetric ? "solid" : "outline"}
                                        bg={metric.key === activeMetric ? styles.atlas.panelRaised : "transparent"}
                                        borderColor={metric.key === activeMetric ? styles.atlas.focusPrimary : styles.atlas.border}
                                        _text={{ color: styles.atlas.text }}
                                        onPress={() => setActiveMetric(metric.key)}
                                    >
                                        {metric.shortLabel}
                                    </Button>
                                ))}
                            </HStack>
                        </Field>
                        <MarketBreadthBars countries={rankedCountries} activeMetric={activeMetric} selectedCountryCode={selectedCountry.code} onSelectCountry={(countryCode) => selectCountry(countryCode)} />
                    </VStack>
                </Card>
            </Stack>

            <Card flex={1}>
                <VStack space={4}>
                    <HStack justifyContent="space-between" alignItems="center" flexWrap="wrap">
                        <VStack space={1}>
                            <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">GLOBAL BOARD</Text>
                            <Text color={styles.atlas.text} fontWeight="700">{metricDescriptor.label}</Text>
                        </VStack>
                        <Text color={styles.atlas.muted} fontSize="xs">{metricDescriptor.description}</Text>
                    </HStack>
                    <GlobalPulseVisual
                        countries={globeCountries}
                        activeMetric={activeMetric}
                        selectedCountryCode={selectedCountry.code}
                        onSelectCountry={(countryCode) => selectCountry(countryCode)}
                    />
                </VStack>
            </Card>

            <Card flex={{ xl: 1.15 }}>
                <VStack space={4}>
                    <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">{selectedCountry.name.toUpperCase()} BENCHMARK</Text>
                    <BenchmarkCandlestickChart country={selectedCountry} activeMetric={activeMetric} />
                    <Text color={styles.atlas.muted} fontSize="xs">{metricDescriptor.description}</Text>
                </VStack>
            </Card>

            <Card flex={1}>
                <VStack space={4}>
                    <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">WATCHLIST SCANNER</Text>
                    <ScannerTapeVisual
                        items={workspaceView.watchlist}
                        onSelectItem={(symbol) => {
                            const asset = workspaceView.assetCatalog.find((item) => item.symbol === symbol);
                            if (asset) {
                                onSelectAsset(asset);
                            }
                        }}
                    />
                </VStack>
            </Card>

            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Card flex={{ xl: 1.1 }}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">SECTOR BREADTH MAP</Text>
                        <SectorHeatmapVisual cells={snapshot.sectorHeatmap} />
                    </VStack>
                </Card>

                <Card flex={1}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">GLOBAL NARRATIVE</Text>
                        <Text color={styles.atlas.text}>{snapshot.narrative}</Text>
                        {snapshot.newsFeed.map((item) => (
                            <Box key={item.id} px={4} py={4} rounded="2xl" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                <HStack justifyContent="space-between" alignItems="flex-start" mb={2}>
                                    <Text color={styles.atlas.text} flex={1} mr={3}>{item.headline}</Text>
                                    <Text color={toneColor(item.tone)} fontSize="xs">{item.time}</Text>
                                </HStack>
                                <Text color={styles.atlas.muted} fontSize="xs">{item.region} | {item.catalyst}</Text>
                            </Box>
                        ))}
                    </VStack>
                </Card>
            </Stack>

            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Card flex={{ xl: 1.1 }}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">CATALYST + REVIEW TIMELINE</Text>
                        <CatalystTimelineVisual headlines={selectedCountry.headlines} journalEntries={workspaceView.journalEntries.slice(0, 4)} />
                    </VStack>
                </Card>

                <Card flex={1}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">LOCAL LEADERS</Text>
                        {selectedCountryAssets.slice(0, 5).map((asset) => (
                            <Pressable key={asset.symbol} onPress={() => onSelectAsset(asset)}>
                                {({ isHovered }: { isHovered: boolean }) => (
                                    <Box px={4} py={4} rounded="2xl" bg={isHovered ? styles.atlas.panelRaised : styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                        <HStack justifyContent="space-between" alignItems="center">
                                            <VStack flex={1} mr={3}>
                                                <Text color={styles.atlas.text} fontWeight="700">{asset.symbol}</Text>
                                                <Text color={styles.atlas.muted} fontSize="xs">{asset.name} | {asset.sector}</Text>
                                            </VStack>
                                            <VStack alignItems="flex-end">
                                                <Text color={styles.atlas.text} fontWeight="700">{displayCurrency(asset.price, 2, 2)}</Text>
                                                <Text color={asset.change >= 0 ? styles.atlas.positive : styles.atlas.negative} fontSize="xs">{displaySignedPercent(asset.change, 1, 1)}</Text>
                                            </VStack>
                                        </HStack>
                                    </Box>
                                )}
                            </Pressable>
                        ))}
                    </VStack>
                </Card>
            </Stack>
        </VStack>
    );
}

function GlobePage({
    snapshot,
    globeCountries,
    selectedCountry,
    activeMetric,
    setActiveMetric,
    activeDate,
    setActiveDate,
    metricDescriptor,
    selectCountry,
    draft,
    updateDraftText,
    updateDraftNumber,
    saveThesis,
    openPaperTrade,
    focusPulseCountries,
    onOpenResearch,
    onToggleWatchlist,
    inWatchlist,
    workspaceView
}: {
    snapshot: AtlasSnapshot;
    globeCountries: AtlasCountry[];
    selectedCountry: AtlasCountry;
    activeMetric: MarketMetricKey;
    setActiveMetric: (metric: MarketMetricKey) => void;
    activeDate: string;
    setActiveDate: (date: string) => void;
    metricDescriptor: ReturnType<typeof getMetricDescriptor>;
    selectCountry: (countryCode: string, targetPage?: PageMode) => void;
    draft: ThesisDraft;
    updateDraftText: (field: keyof ThesisDraft, value: string) => void;
    updateDraftNumber: (field: keyof ThesisDraft, value: string) => void;
    saveThesis: () => void;
    openPaperTrade: () => void;
    focusPulseCountries: string[];
    onOpenResearch: () => void;
    onToggleWatchlist: () => void;
    inWatchlist: boolean;
    workspaceView: ReturnType<typeof deriveWorkspaceViewWithCountries>;
}) {
    const [showLabels, setShowLabels] = useState(false);
    const [showFlows, setShowFlows] = useState(true);
    const [showPulses, setShowPulses] = useState(true);
    const [showGraticules, setShowGraticules] = useState(true);

    const continentBreakdown = useMemo(() => {
        const counts = new Map<string, number>();
        globeCountries.forEach((country) => counts.set(country.region, (counts.get(country.region) ?? 0) + 1));
        return [...counts.entries()].map(([region, count]) => ({ region, count })).sort((left, right) => right.count - left.count);
    }, [globeCountries]);

    return (
        <VStack space={5}>
            <Card bg={styles.atlas.hero} borderColor={styles.atlas.borderStrong}>
                <Stack direction={{ base: "column", xl: "row" }} space={4}>
                    <VStack flex={{ xl: 1.55 }} space={4}>
                        <HStack justifyContent="space-between" alignItems="center" flexWrap="wrap">
                            <VStack space={1} mr={4}>
                                <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700" letterSpacing="xl">EARTH COMMAND</Text>
                                <Text color={styles.atlas.text} fontWeight="700">{selectedCountry.name} in focus</Text>
                                <Text color={styles.atlas.muted} fontSize="xs">{metricDescriptor.description}</Text>
                            </VStack>
                            <Chip label={`${selectedCountry.region} | ${selectedCountry.benchmark}`} tone={styles.atlas.focusPrimary} />
                        </HStack>
                        <HStack flexWrap="wrap">
                            {continentBreakdown.map((continent) => (
                                <Chip key={continent.region} label={`${continent.region} ${continent.count}`} tone={styles.atlas.text} />
                            ))}
                        </HStack>
                        <HStack flexWrap="wrap">
                            <Chip label={`Active focus ${selectedCountry.code}`} tone={styles.atlas.focusPrimary} />
                            <Chip label={`Secondary pulse ${focusPulseCountries.length}`} tone={styles.atlas.focusSecondary} />
                            <Chip label={`${globeCountries.length} world polygons`} tone={styles.atlas.text} />
                        </HStack>

                        <AtlasMarketGlobe
                            countries={globeCountries}
                            activeMetric={activeMetric}
                            selectedCountryCode={selectedCountry.code}
                            onSelectCountry={(countryCode) => selectCountry(countryCode)}
                            highlightCountryCodes={focusPulseCountries}
                            showLabels={showLabels}
                            showFlows={showFlows}
                            showPulses={showPulses}
                            showGraticules={showGraticules}
                            lowerLabel={metricDescriptor.lowerLabel}
                            upperLabel={metricDescriptor.upperLabel}
                            variant="immersive"
                            showCountryStrip={false}
                        />
                    </VStack>

                    <VStack flex={1} space={4}>
                        <Card>
                            <VStack space={4}>
                                <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">CONTROL RAIL</Text>
                                <Field label="Overlay">
                                    <HStack flexWrap="wrap">
                                        {metricDescriptors.map((metric) => (
                                            <Button
                                                key={metric.key}
                                                mr={2}
                                                mb={2}
                                                size="sm"
                                                variant={metric.key === activeMetric ? "solid" : "outline"}
                                                bg={metric.key === activeMetric ? styles.atlas.panelRaised : "transparent"}
                                                borderColor={metric.key === activeMetric ? styles.atlas.focusPrimary : styles.atlas.border}
                                                _text={{ color: metric.key === activeMetric ? styles.atlas.ink : styles.atlas.text }}
                                                onPress={() => setActiveMetric(metric.key)}
                                            >
                                                {metric.shortLabel}
                                            </Button>
                                        ))}
                                    </HStack>
                                </Field>
                                <Field label="Playback">
                                    <HStack flexWrap="wrap">
                                        {atlasSnapshots.map((marketSnapshot) => (
                                            <Button
                                                key={marketSnapshot.date}
                                                mr={2}
                                                mb={2}
                                                size="sm"
                                                variant={marketSnapshot.date === activeDate ? "solid" : "subtle"}
                                                bg={marketSnapshot.date === activeDate ? styles.atlas.panelRaised : styles.atlas.backgroundAlt}
                                                borderColor={marketSnapshot.date === activeDate ? styles.atlas.focusPrimary : styles.atlas.border}
                                                _text={{ color: styles.atlas.text }}
                                                onPress={() => setActiveDate(marketSnapshot.date)}
                                            >
                                                {marketSnapshot.mode === "Live" ? "Live" : marketSnapshot.label}
                                            </Button>
                                        ))}
                                    </HStack>
                                </Field>
                                <Field label="Layers">
                                    <HStack flexWrap="wrap">
                                        <Button mr={2} mb={2} size="sm" variant={showLabels ? "solid" : "outline"} bg={showLabels ? styles.atlas.panelRaised : "transparent"} borderColor={showLabels ? styles.atlas.focusPrimary : styles.atlas.border} _text={{ color: styles.atlas.text }} onPress={() => setShowLabels((current) => !current)}>Labels</Button>
                                        <Button mr={2} mb={2} size="sm" variant={showFlows ? "solid" : "outline"} bg={showFlows ? styles.atlas.panelRaised : "transparent"} borderColor={showFlows ? styles.atlas.focusPrimary : styles.atlas.border} _text={{ color: styles.atlas.text }} onPress={() => setShowFlows((current) => !current)}>Flows</Button>
                                        <Button mr={2} mb={2} size="sm" variant={showPulses ? "solid" : "outline"} bg={showPulses ? styles.atlas.panelRaised : "transparent"} borderColor={showPulses ? styles.atlas.focusPrimary : styles.atlas.border} _text={{ color: styles.atlas.text }} onPress={() => setShowPulses((current) => !current)}>Pulses</Button>
                                        <Button mr={2} mb={2} size="sm" variant={showGraticules ? "solid" : "outline"} bg={showGraticules ? styles.atlas.panelRaised : "transparent"} borderColor={showGraticules ? styles.atlas.focusPrimary : styles.atlas.border} _text={{ color: styles.atlas.text }} onPress={() => setShowGraticules((current) => !current)}>Grid</Button>
                                    </HStack>
                                </Field>
                                <Text color={styles.atlas.muted} fontSize="xs">
                                    Country performance carries standard green, red, and white market tones, while the active market gets a simple focus lift and top ripple.
                                </Text>
                            </VStack>
                        </Card>

                        <Card bg={styles.atlas.glassStrong}>
                            <VStack space={4}>
                                <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">{selectedCountry.region.toUpperCase()} INSPECTOR</Text>
                                <Heading color={styles.atlas.text} size="lg">{selectedCountry.name}</Heading>
                                <Text color={styles.atlas.muted} fontSize="sm">{selectedCountry.summary}</Text>
                                <SimpleGrid columns={2} space={3}>
                                    <MiniMetric label="1D" value={displaySignedPercent(selectedCountry.metrics.dailyReturn, 1, 1)} tone={selectedCountry.metrics.dailyReturn >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                                    <MiniMetric label="1W" value={displaySignedPercent(selectedCountry.metrics.weeklyReturn, 1, 1)} tone={selectedCountry.metrics.weeklyReturn >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                                    <MiniMetric label="Vol" value={`${selectedCountry.metrics.volatility.toFixed(1)}%`} tone={selectedCountry.metrics.volatility >= 24 ? styles.atlas.negative : selectedCountry.metrics.volatility >= 18 ? styles.atlas.neutral : styles.atlas.positive} />
                                    <MiniMetric label="Macro" value={`${Math.round(selectedCountry.metrics.macroSentiment)} / 100`} tone={selectedCountry.metrics.macroSentiment >= 70 ? styles.atlas.positive : selectedCountry.metrics.macroSentiment <= 45 ? styles.atlas.negative : styles.atlas.neutral} />
                                </SimpleGrid>
                                <HStack flexWrap="wrap">
                                    <Button mr={2} mb={2} bg={styles.atlas.focusPrimary} _text={{ color: styles.atlas.ink, fontWeight: "700" }} onPress={onOpenResearch}>Open Research</Button>
                                    <Button mr={2} mb={2} variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={onToggleWatchlist}>{inWatchlist ? "Remove Watchlist" : "Add Watchlist"}</Button>
                                </HStack>
                                <Divider bg={styles.atlas.border} />
                                {selectedCountry.topSectors.map((sector) => (
                                    <MetricRow key={sector.name} label={sector.name} value={displaySignedPercent(sector.change, 1, 1)} tone={sector.change >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                                ))}
                            </VStack>
                        </Card>
                    </VStack>
                </Stack>
            </Card>

            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Card flex={{ xl: 1.1 }}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">THESIS DOCK</Text>
                        <Stack direction={{ base: "column", md: "row" }} space={3}>
                            <Field label="Symbol"><Input value={draft.symbol} onChangeText={(value) => updateDraftText("symbol", value.toUpperCase())} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                            <Field label="Company"><Input value={draft.company} onChangeText={(value) => updateDraftText("company", value)} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                        </Stack>
                        <HStack>
                            {(["Long", "Short"] as Array<"Long" | "Short">).map((direction) => (
                                <Button key={direction} mr={2} size="sm" variant={draft.direction === direction ? "solid" : "outline"} bg={draft.direction === direction ? styles.atlas.focusPrimary : "transparent"} borderColor={draft.direction === direction ? styles.atlas.focusPrimary : styles.atlas.border} _text={{ color: draft.direction === direction ? styles.atlas.ink : styles.atlas.text }} onPress={() => updateDraftText("direction", direction)}>{direction}</Button>
                            ))}
                        </HStack>
                        <Stack direction={{ base: "column", md: "row" }} space={3}>
                            <Field label="Entry"><Input value={draft.entryPrice.toString()} onChangeText={(value) => updateDraftNumber("entryPrice", value)} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                            <Field label="Stop"><Input value={draft.stopLoss.toString()} onChangeText={(value) => updateDraftNumber("stopLoss", value)} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                            <Field label="Target"><Input value={draft.targetPrice.toString()} onChangeText={(value) => updateDraftNumber("targetPrice", value)} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                            <Field label="Qty"><Input value={draft.plannedQuantity.toString()} onChangeText={(value) => updateDraftNumber("plannedQuantity", value)} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                        </Stack>
                        <Field label="Catalyst"><Input value={draft.catalyst} onChangeText={(value) => updateDraftText("catalyst", value)} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                        <Field label="Rationale"><TextArea value={draft.rationale} onChangeText={(value) => updateDraftText("rationale", value)} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} autoCompleteType={undefined as any} /></Field>
                        <Field label="Risk Notes"><TextArea value={draft.riskNotes} onChangeText={(value) => updateDraftText("riskNotes", value)} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} autoCompleteType={undefined as any} /></Field>
                        <Text color={styles.atlas.muted} fontSize="xs">Risk/Reward {getRiskReward(draft).toFixed(2)}x | Conviction {draft.conviction}/100 | {draft.timeHorizon}</Text>
                        <HStack>
                            <Button mr={2} bg={styles.atlas.focusPrimary} _text={{ color: styles.atlas.ink, fontWeight: "700" }} onPress={saveThesis}>Save Thesis</Button>
                            <Button variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={openPaperTrade}>Paper Trade</Button>
                        </HStack>
                    </VStack>
                </Card>

                <Card flex={1}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">ACTIVE QUEUE</Text>
                        {workspaceView.positions.slice(0, 5).map((position) => (
                            <MetricRow key={position.id} label={`${position.symbol} | ${position.quantity} sh`} value={displaySignedCurrency(getPositionPnl(position), 2, 2)} tone={getPositionPnl(position) >= 0 ? styles.atlas.positive : styles.atlas.negative} helper={`${position.direction} @ ${displayCurrency(position.entryPrice, 2, 2)}`} />
                        ))}
                        <Divider bg={styles.atlas.border} />
                        {workspaceView.recentIdeas.slice(0, 4).map((idea) => <IdeaCard key={idea.id} idea={idea} />)}
                    </VStack>
                </Card>
            </Stack>
        </VStack>
    );
}

function ResearchPage({
    snapshot,
    selectedCountry,
    selectedAsset,
    draft,
    updateDraftText,
    updateDraftNumber,
    onSaveThesis,
    onOpenPaperTrade,
    onToggleWatchlist,
    inWatchlist,
    relatedAssets,
    onSelectAsset,
    onOpenGlobe
}: {
    snapshot: AtlasSnapshot;
    selectedCountry: AtlasCountry;
    selectedAsset: AtlasAssetResearch;
    draft: ThesisDraft;
    updateDraftText: (field: keyof ThesisDraft, value: string) => void;
    updateDraftNumber: (field: keyof ThesisDraft, value: string) => void;
    onSaveThesis: () => void;
    onOpenPaperTrade: () => void;
    onToggleWatchlist: () => void;
    inWatchlist: boolean;
    relatedAssets: AtlasAssetResearch[];
    onSelectAsset: (asset: AtlasAssetResearch) => void;
    onOpenGlobe: () => void;
}) {
    const researchChartCountry = buildResearchChartCountry(selectedCountry, selectedAsset);

    return (
        <VStack space={5}>
            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Card flex={{ xl: 1.35 }} bg={styles.atlas.hero} borderColor={styles.atlas.borderStrong}>
                    <VStack space={4}>
                        <HStack justifyContent="space-between" alignItems="flex-start" flexWrap="wrap">
                            <VStack flex={1} mr={4} space={2}>
                                <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700" letterSpacing="xl">RESEARCH DECK</Text>
                                <Heading color={styles.atlas.text} size="2xl" fontFamily="serif">{selectedAsset.symbol}</Heading>
                                <Text color={styles.atlas.text} fontWeight="700">{selectedAsset.name}</Text>
                                <Text color={styles.atlas.muted} fontSize="sm">{selectedAsset.summary}</Text>
                                <HStack flexWrap="wrap">
                                    <Chip label={selectedCountry.name} tone={styles.atlas.focusSecondary} />
                                    <Chip label={selectedAsset.sector} tone={styles.atlas.warning} />
                                    <Chip label={selectedAsset.catalyst} tone={styles.atlas.focusPrimary} />
                                </HStack>
                            </VStack>
                            <VStack alignItems={{ base: "flex-start", xl: "flex-end" }} space={2}>
                                <Heading color={styles.atlas.text} size="xl">{displayCurrency(selectedAsset.price, 2, 2)}</Heading>
                                <Text color={selectedAsset.change >= 0 ? styles.atlas.positive : styles.atlas.negative} fontWeight="700">{displaySignedPercent(selectedAsset.change, 1, 1)}</Text>
                                <HStack flexWrap="wrap" justifyContent={{ base: "flex-start", xl: "flex-end" }}>
                                    <Button mr={2} mb={2} bg={styles.atlas.focusPrimary} _text={{ color: styles.atlas.ink, fontWeight: "700" }} onPress={onOpenPaperTrade}>Paper Trade</Button>
                                    <Button mr={2} mb={2} variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={onSaveThesis}>Save Thesis</Button>
                                    <Button mr={2} mb={2} variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={onToggleWatchlist}>{inWatchlist ? "Remove Watchlist" : "Add Watchlist"}</Button>
                                    <Button mr={2} mb={2} variant="ghost" _text={{ color: styles.atlas.muted }} onPress={onOpenGlobe}>Back to Globe</Button>
                                </HStack>
                            </VStack>
                        </HStack>

                        <SimpleGrid columns={4} space={3}>
                            <MiniMetric label="Relative" value={displaySignedPercent(selectedAsset.relativeStrength, 1, 1)} tone={selectedAsset.relativeStrength >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                            <MiniMetric label="Volatility" value={`${selectedAsset.volatility.toFixed(1)}%`} tone={selectedAsset.volatility >= 24 ? styles.atlas.negative : styles.atlas.warning} />
                            <MiniMetric label="Support" value={displayCurrency(selectedAsset.support, 2, 2)} tone={styles.atlas.focusSecondary} />
                            <MiniMetric label="Resistance" value={displayCurrency(selectedAsset.resistance, 2, 2)} tone={styles.atlas.focusPrimary} />
                        </SimpleGrid>
                    </VStack>
                </Card>

                <Card flex={{ xl: 0.86 }}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">MICRO STRUCTURE</Text>
                        <MetricRow label="Country benchmark" value={selectedCountry.benchmark} tone={styles.atlas.text} />
                        <MetricRow label="Catalyst" value={selectedAsset.catalyst} tone={styles.atlas.focusPrimary} />
                        <MetricRow label="Sentiment" value={`${selectedAsset.sentiment} / 100`} tone={selectedAsset.sentiment >= 65 ? styles.atlas.positive : styles.atlas.warning} />
                        <MetricRow label="Country 1D" value={displaySignedPercent(selectedCountry.metrics.dailyReturn, 1, 1)} tone={selectedCountry.metrics.dailyReturn >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                        <MetricRow label="Country breadth" value={`${Math.round(selectedCountry.metrics.sectorStrength)} / 100`} tone={selectedCountry.metrics.sectorStrength >= 60 ? styles.atlas.positive : styles.atlas.warning} />
                        <Divider bg={styles.atlas.border} />
                        {selectedCountry.headlines.map((headline) => (
                            <Box key={`${headline.time}-${headline.headline}`} px={4} py={4} rounded="2xl" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                <HStack justifyContent="space-between" alignItems="flex-start" mb={2}>
                                    <Text color={styles.atlas.text} flex={1} mr={3}>{headline.headline}</Text>
                                    <Text color={toneColor(headline.tone)} fontSize="xs">{headline.time}</Text>
                                </HStack>
                                <Text color={styles.atlas.muted} fontSize="xs">{headline.catalyst}</Text>
                            </Box>
                        ))}
                    </VStack>
                </Card>
            </Stack>

            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Card flex={{ xl: 1.18 }}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">PRICE ACTION</Text>
                        <BenchmarkCandlestickChart country={researchChartCountry} activeMetric={activeMetricForAsset(selectedAsset)} />
                    </VStack>
                </Card>

                <Card flex={1}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">THESIS BUILDER</Text>
                        <Stack direction={{ base: "column", md: "row" }} space={3}>
                            <Field label="Symbol"><Input value={draft.symbol} onChangeText={(value) => updateDraftText("symbol", value.toUpperCase())} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                            <Field label="Company"><Input value={draft.company} onChangeText={(value) => updateDraftText("company", value)} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                        </Stack>
                        <HStack>
                            {(["Long", "Short"] as Array<"Long" | "Short">).map((direction) => (
                                <Button key={direction} mr={2} size="sm" variant={draft.direction === direction ? "solid" : "outline"} bg={draft.direction === direction ? styles.atlas.focusPrimary : "transparent"} borderColor={draft.direction === direction ? styles.atlas.focusPrimary : styles.atlas.border} _text={{ color: draft.direction === direction ? styles.atlas.ink : styles.atlas.text }} onPress={() => updateDraftText("direction", direction)}>{direction}</Button>
                            ))}
                        </HStack>
                        <Stack direction={{ base: "column", md: "row" }} space={3}>
                            <Field label="Entry"><Input value={draft.entryPrice.toString()} onChangeText={(value) => updateDraftNumber("entryPrice", value)} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                            <Field label="Stop"><Input value={draft.stopLoss.toString()} onChangeText={(value) => updateDraftNumber("stopLoss", value)} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                            <Field label="Target"><Input value={draft.targetPrice.toString()} onChangeText={(value) => updateDraftNumber("targetPrice", value)} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                            <Field label="Qty"><Input value={draft.plannedQuantity.toString()} onChangeText={(value) => updateDraftNumber("plannedQuantity", value)} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                        </Stack>
                        <Field label="Catalyst"><Input value={draft.catalyst} onChangeText={(value) => updateDraftText("catalyst", value)} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                        <Field label="Rationale"><TextArea value={draft.rationale} onChangeText={(value) => updateDraftText("rationale", value)} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} autoCompleteType={undefined as any} /></Field>
                        <Field label="Risk Notes"><TextArea value={draft.riskNotes} onChangeText={(value) => updateDraftText("riskNotes", value)} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} autoCompleteType={undefined as any} /></Field>
                        <Text color={styles.atlas.muted} fontSize="xs">Risk/Reward {getRiskReward(draft).toFixed(2)}x | Conviction {draft.conviction}/100</Text>
                    </VStack>
                </Card>
            </Stack>

            <Card>
                <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">RELATED NAMES</Text>
                    <SimpleGrid minChildWidth={220} space={3}>
                        {relatedAssets.slice(0, 6).map((asset) => (
                            <Pressable key={asset.symbol} onPress={() => onSelectAsset(asset)}>
                                {({ isHovered }: { isHovered: boolean }) => (
                                    <Box px={4} py={4} rounded="2xl" bg={isHovered ? styles.atlas.panelRaised : styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                        <Text color={styles.atlas.text} fontWeight="700">{asset.symbol}</Text>
                                        <Text color={styles.atlas.muted} fontSize="xs">{asset.name}</Text>
                                        <Text color={asset.change >= 0 ? styles.atlas.positive : styles.atlas.negative} mt={2}>{displaySignedPercent(asset.change, 1, 1)}</Text>
                                    </Box>
                                )}
                            </Pressable>
                        ))}
                    </SimpleGrid>
                </VStack>
            </Card>
        </VStack>
    );
}

function PortfolioPage({
    workspaceView,
    selectedAsset,
    onCloseTrade,
    onResetPaperWorkspace,
    onSelectAsset
}: {
    workspaceView: ReturnType<typeof deriveWorkspaceViewWithCountries>;
    selectedAsset?: AtlasAssetResearch;
    onCloseTrade: (tradeId: string, exitReason: string) => void;
    onResetPaperWorkspace: () => void;
    onSelectAsset: (asset: AtlasAssetResearch) => void;
}) {
    const cashBalance = workspaceView.cashBalance;

    return (
        <VStack space={5}>
            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Card flex={{ xl: 1.3 }} bg={styles.atlas.hero} borderColor={styles.atlas.borderStrong}>
                    <VStack space={4}>
                        <HStack justifyContent="space-between" alignItems="flex-start" flexWrap="wrap">
                            <VStack flex={1} mr={4} space={2}>
                                <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700" letterSpacing="xl">PORTFOLIO CONTROL</Text>
                                <Heading color={styles.atlas.text} size="3xl" fontFamily="serif">{displayCurrency(workspaceView.netLiq)}</Heading>
                                <Text color={styles.atlas.muted} fontSize="sm">
                                    Close trades, audit realized PnL, and reset the paper book whenever you want a clean run through the replay tape.
                                </Text>
                            </VStack>
                            <Button bg={styles.atlas.focusPrimary} _text={{ color: styles.atlas.ink, fontWeight: "700" }} onPress={onResetPaperWorkspace}>Reset Paper Book</Button>
                        </HStack>

                        <SimpleGrid columns={5} space={3}>
                            <MiniMetric label="Cash" value={displayCurrency(cashBalance)} tone={styles.atlas.text} />
                            <MiniMetric label="Gross" value={displayCurrency(workspaceView.grossExposure)} tone={styles.atlas.warning} />
                            <MiniMetric label="Realized" value={displaySignedCurrency(workspaceView.realizedPnl)} tone={workspaceView.realizedPnl >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                            <MiniMetric label="Unrealized" value={displaySignedCurrency(workspaceView.unrealizedPnl)} tone={workspaceView.unrealizedPnl >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                            <MiniMetric label="Win Rate" value={`${workspaceView.winRate}%`} tone={styles.atlas.focusSecondary} />
                        </SimpleGrid>

                        <PortfolioAnalyticsVisual
                            positions={workspaceView.positions}
                            cashBalance={cashBalance}
                            netLiq={workspaceView.netLiq}
                            unrealizedPnl={workspaceView.unrealizedPnl}
                            grossExposure={workspaceView.grossExposure}
                        />
                    </VStack>
                </Card>

                <Card flex={{ xl: 0.9 }}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">CURRENT FOCUS</Text>
                        {selectedAsset ? (
                            <>
                                <Heading color={styles.atlas.text} size="lg">{selectedAsset.symbol}</Heading>
                                <Text color={styles.atlas.muted} fontSize="sm">{selectedAsset.summary}</Text>
                                <MetricRow label="Price" value={displayCurrency(selectedAsset.price, 2, 2)} tone={styles.atlas.text} />
                                <MetricRow label="Change" value={displaySignedPercent(selectedAsset.change, 1, 1)} tone={selectedAsset.change >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                            </>
                        ) : (
                            <EmptyState label="Select an asset from the dashboard or globe to focus the portfolio notes." />
                        )}
                    </VStack>
                </Card>
            </Stack>

            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Card flex={{ xl: 1.1 }}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">OPEN POSITIONS</Text>
                        {workspaceView.positions.length > 0 ? workspaceView.positions.map((position) => (
                            <Box key={position.id} px={4} py={4} rounded="3xl" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                <Stack direction={{ base: "column", lg: "row" }} justifyContent="space-between" space={3}>
                                    <VStack flex={1} space={1}>
                                        <Text color={styles.atlas.text} fontWeight="700">{position.symbol} | {position.name}</Text>
                                        <Text color={styles.atlas.muted} fontSize="xs">{position.direction} | {position.quantity} shares | {position.openedAt}</Text>
                                        <Text color={styles.atlas.muted} fontSize="xs">{position.thesisTag}</Text>
                                    </VStack>
                                    <VStack alignItems={{ base: "flex-start", lg: "flex-end" }} space={2}>
                                        <Text color={styles.atlas.text} fontWeight="700">{displaySignedCurrency(getPositionPnl(position), 2, 2)}</Text>
                                        <Text color={styles.atlas.muted} fontSize="xs">{displayCurrency(position.entryPrice, 2, 2)} {"->"} {displayCurrency(position.lastPrice, 2, 2)}</Text>
                                        <HStack flexWrap="wrap">
                                            <Button mr={2} mb={2} size="xs" variant="outline" borderColor={styles.atlas.borderStrong} _text={{ color: styles.atlas.text }} onPress={() => onCloseTrade(position.id, "Manual close")}>Close</Button>
                                            <Button mr={2} mb={2} size="xs" variant="outline" borderColor={styles.atlas.focusPrimary} _text={{ color: styles.atlas.focusPrimary }} onPress={() => onCloseTrade(position.id, "Take profit")}>Take Profit</Button>
                                            <Button mr={2} mb={2} size="xs" variant="outline" borderColor={styles.atlas.negative} _text={{ color: styles.atlas.negative }} onPress={() => onCloseTrade(position.id, "Stop out")}>Stop Out</Button>
                                        </HStack>
                                    </VStack>
                                </Stack>
                            </Box>
                        )) : <EmptyState label="No open paper positions yet. Stage one from the research or globe pages." />}
                    </VStack>
                </Card>

                <Card flex={1}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">CLOSED TRADES</Text>
                        {workspaceView.closedTrades.length > 0 ? workspaceView.closedTrades.map((trade) => (
                            <Pressable key={trade.id} onPress={() => {
                                const asset = workspaceView.assetCatalog.find((item) => item.symbol === trade.symbol);
                                if (asset) {
                                    onSelectAsset(asset);
                                }
                            }}>
                                {({ isHovered }: { isHovered: boolean }) => (
                                    <Box px={4} py={4} rounded="2xl" bg={isHovered ? styles.atlas.panelRaised : styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                        <HStack justifyContent="space-between" alignItems="flex-start" mb={2}>
                                            <VStack flex={1} mr={3}>
                                                <Text color={styles.atlas.text} fontWeight="700">{trade.symbol}</Text>
                                                <Text color={styles.atlas.muted} fontSize="xs">{trade.exitReason} | {trade.closedAt}</Text>
                                            </VStack>
                                            <Text color={(trade.realizedPnl ?? 0) >= 0 ? styles.atlas.positive : styles.atlas.negative} fontWeight="700">{displaySignedCurrency(trade.realizedPnl ?? 0, 2, 2)}</Text>
                                        </HStack>
                                        <Text color={styles.atlas.muted} fontSize="xs">{displayCurrency(trade.entryPrice, 2, 2)} {"->"} {displayCurrency(trade.exitPrice ?? trade.entryPrice, 2, 2)}</Text>
                                    </Box>
                                )}
                            </Pressable>
                        )) : <EmptyState label="Closed trades will appear here as you cycle through replay and paper exits." />}
                    </VStack>
                </Card>
            </Stack>
        </VStack>
    );
}

function JournalPage({
    journalDraft,
    setJournalDraft,
    onSubmitJournalEntry,
    selectedAsset,
    journalEntries
}: {
    journalDraft: JournalDraftState;
    setJournalDraft: (value: JournalDraftState) => void;
    onSubmitJournalEntry: () => void;
    selectedAsset?: AtlasAssetResearch;
    journalEntries: AtlasJournalEntry[];
}) {
    return (
        <VStack space={5}>
            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Card flex={{ xl: 1.05 }} bg={styles.atlas.hero} borderColor={styles.atlas.borderStrong}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700" letterSpacing="xl">TRADE JOURNAL</Text>
                        <Heading color={styles.atlas.text} size="2xl" fontFamily="serif">Capture the lesson while the market context is still fresh.</Heading>
                        <Text color={styles.atlas.muted} fontSize="sm">
                            Attach notes to the current focus, log your paper-trade outcome, and keep the replay history honest.
                        </Text>
                        {selectedAsset ? (
                            <HStack flexWrap="wrap">
                                <Chip label={selectedAsset.symbol} tone={styles.atlas.focusPrimary} />
                                <Chip label={selectedAsset.name} tone={styles.atlas.focusSecondary} />
                            </HStack>
                        ) : null}
                    </VStack>
                </Card>

                <Card flex={{ xl: 0.95 }}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">NEW ENTRY</Text>
                        <Field label="Title"><Input value={journalDraft.title} onChangeText={(value) => setJournalDraft({ ...journalDraft, title: value })} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} placeholder="What setup or decision are you logging?" placeholderTextColor={styles.atlas.muted} /></Field>
                        <Field label="Outcome"><Input value={journalDraft.outcome} onChangeText={(value) => setJournalDraft({ ...journalDraft, outcome: value })} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} placeholder="Win, loss, flat, or insight" placeholderTextColor={styles.atlas.muted} /></Field>
                        <Field label="Lesson"><TextArea value={journalDraft.lesson} onChangeText={(value) => setJournalDraft({ ...journalDraft, lesson: value })} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} autoCompleteType={undefined as any} /></Field>
                        <Button bg={styles.atlas.focusPrimary} _text={{ color: styles.atlas.ink, fontWeight: "700" }} onPress={onSubmitJournalEntry}>Save Journal Note</Button>
                    </VStack>
                </Card>
            </Stack>

            <Card>
                <VStack space={4}>
                    <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">JOURNAL STREAM</Text>
                    {journalEntries.length > 0 ? journalEntries.map((entry) => (
                        <Box key={entry.id} px={4} py={4} rounded="3xl" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                            <HStack justifyContent="space-between" alignItems="flex-start" mb={2}>
                                <VStack flex={1} mr={3}>
                                    <Text color={styles.atlas.text} fontWeight="700">{entry.title}</Text>
                                    <Text color={styles.atlas.muted} fontSize="xs">{entry.symbol ? `${entry.symbol} | ` : ""}{entry.createdAt}</Text>
                                </VStack>
                                <Text color={styles.atlas.focusPrimary} fontSize="xs">{entry.outcome}</Text>
                            </HStack>
                            <Text color={styles.atlas.muted} fontSize="sm">{entry.lesson}</Text>
                        </Box>
                    )) : <EmptyState label="Journal entries will show up here as you review paper trades and replay decisions." />}
                </VStack>
            </Card>
        </VStack>
    );
}

function Card({ children, bg, borderColor, ...props }: { children: ReactNode; bg?: string; borderColor?: string; [key: string]: any }) {
    return (
        <Box
            bg={bg ?? styles.atlas.panel}
            borderWidth={1}
            borderColor={borderColor ?? styles.atlas.border}
            rounded="2xl"
            p={{ base: 4, md: 6 }}
            mb={4}
            shadow={1}
            {...props}
        >
            {children}
        </Box>
    );
}

function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <Button
            mr={1.5}
            mb={2}
            size="sm"
            rounded="lg"
            px={4}
            py={2}
            bg={active ? styles.atlas.panelRaised : "transparent"}
            borderWidth={1}
            borderColor={active ? styles.atlas.accent : "transparent"}
            _text={{ color: active ? styles.atlas.textStrong : styles.atlas.muted, fontWeight: active ? "700" : "600", fontSize: "xs", letterSpacing: 0.4 }}
            _hover={{ bg: styles.atlas.panel, borderColor: styles.atlas.borderStrong }}
            _pressed={{ bg: styles.atlas.panelRaised }}
            shadow={active ? 2 : undefined}
            onPress={onPress}
        >
            {label}
        </Button>
    );
}

function Chip({ label, tone }: { label: string; tone: string }) {
    return (
        <Badge
            mr={2}
            mb={2}
            bg={styles.atlas.panel}
            borderWidth={1}
            borderColor={styles.atlas.borderSoft}
            rounded="full"
            px={3}
            _text={{ color: tone, fontWeight: "700", fontSize: "2xs", letterSpacing: 0.8 }}
        >
            {label}
        </Badge>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return <VStack flex={1}><Text color={styles.atlas.muted} fontSize="xs" mb={2} textTransform="uppercase">{label}</Text>{children}</VStack>;
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone?: string }) {
    return (
        <Box
            py={3}
            px={4}
            bg={styles.atlas.panelMuted}
            borderWidth={1}
            borderColor={styles.atlas.borderSoft}
            rounded="xl"
        >
            <Text color={styles.atlas.muted} fontSize="2xs" fontWeight="600" letterSpacing={1} textTransform="uppercase">{label}</Text>
            <Text color={tone ?? styles.atlas.textStrong} fontWeight="700" fontSize="lg" mt={1} letterSpacing={-0.3}>{value}</Text>
        </Box>
    );
}

function MetricRow({ label, value, tone, helper }: { label: string; value: string; tone?: string; helper?: string }) {
    return <VStack py={2} borderBottomWidth={1} borderColor={styles.atlas.borderStrong}><HStack justifyContent="space-between" alignItems="flex-start"><Text color={styles.atlas.text} flex={1}>{label}</Text><Text color={tone ?? styles.atlas.text} fontWeight="700">{value}</Text></HStack>{helper ? <Text color={styles.atlas.muted} fontSize="xs">{helper}</Text> : null}</VStack>;
}

function IdeaCard({ idea }: { idea: any }) {
    return <Box py={3} borderBottomWidth={1} borderColor={styles.atlas.borderStrong}><HStack justifyContent="space-between" mb={1}><Text color={styles.atlas.text} fontWeight="700">{idea.symbol}</Text><Text color={idea.direction === "Long" ? styles.atlas.positive : styles.atlas.negative} fontSize="xs">{idea.direction}</Text></HStack><Text color={styles.atlas.text}>{idea.title}</Text></Box>;
}

function EmptyState({ label }: { label: string }) {
    return <Box py={6}><Text color={styles.atlas.muted} fontSize="sm" textAlign="center">{label}</Text></Box>;
}

function buildSearchResults(query: string, countries: AtlasCountry[], assets: AtlasAssetResearch[]): SearchResult[] {
    const trimmed = query.trim().toLowerCase();

    if (!trimmed) {
        return [];
    }

    const countryResults = countries
        .filter((country) => [country.code, country.name, country.region, country.benchmark].some((value) => value.toLowerCase().includes(trimmed)))
        .slice(0, 4)
        .map((country) => ({
            id: `country-${country.code}`,
            type: "country" as const,
            title: `${country.name} (${country.code})`,
            subtitle: `${country.region} | ${country.benchmark}`,
            countryCode: country.code
        }));

    const assetResults = assets
        .filter((asset) => [asset.symbol, asset.name, asset.countryName, asset.sector].some((value) => value.toLowerCase().includes(trimmed)))
        .slice(0, 6)
        .map((asset) => ({
            id: `asset-${asset.symbol}`,
            type: "asset" as const,
            title: `${asset.symbol} | ${asset.name}`,
            subtitle: `${asset.countryName} | ${asset.sector}`,
            countryCode: asset.countryCode,
            symbol: asset.symbol
        }));

    return [...countryResults, ...assetResults].slice(0, 7);
}

function buildResearchChartCountry(country: AtlasCountry, asset: AtlasAssetResearch): AtlasCountry {
    return {
        ...country,
        benchmark: asset.symbol,
        summary: asset.summary,
        benchmarkSeries: asset.priceSeries,
        movers: country.movers.map((mover) => mover.symbol === asset.symbol ? { ...mover, price: asset.price, change: asset.change } : mover),
        thesis: {
            symbol: asset.symbol,
            company: asset.name,
            direction: asset.change >= 0 ? "Long" : "Short",
            entryPrice: asset.price,
            stopLoss: asset.support,
            targetPrice: asset.resistance,
            conviction: Math.max(40, Math.round(asset.sentiment)),
            timeHorizon: "days to 4 weeks",
            catalyst: asset.catalyst,
            rationale: asset.summary,
            riskNotes: `${country.name} backdrop should stay supportive while ${asset.sector.toLowerCase()} remains in leadership.`
        }
    };
}

function activeMetricForAsset(asset: AtlasAssetResearch): MarketMetricKey {
    if (asset.volatility >= 24) {
        return "volatility";
    }

    if (Math.abs(asset.relativeStrength) >= 1.2) {
        return "relativePerformance";
    }

    return "dailyReturn";
}

function getPositionPnl(position: AtlasPosition): number {
    const perShare = position.direction === "Long" ? position.lastPrice - position.entryPrice : position.entryPrice - position.lastPrice;
    return roundPrice((perShare * position.quantity) - (position.feesPaid ?? 0));
}

function getRiskReward(draft: ThesisDraft): number {
    const reward = Math.abs(draft.targetPrice - draft.entryPrice);
    const risk = Math.abs(draft.entryPrice - draft.stopLoss);
    return risk === 0 ? 0 : reward / risk;
}

function rankMetric(value: number, metric: MarketMetricKey): number {
    return metric === "volatility" ? -value : value;
}

function toneColor(tone?: string): string {
    if (tone === "positive") return styles.atlas.positive;
    if (tone === "negative") return styles.atlas.negative;
    return styles.atlas.neutral;
}

function roundPrice(value: number): number {
    return Math.round(value * 100) / 100;
}

function AmbientBackdrop() {
    return null;
}
