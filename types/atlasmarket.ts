export type MarketMetricKey =
    | "dailyReturn"
    | "weeklyReturn"
    | "volatility"
    | "sectorStrength"
    | "macroSentiment"
    | "currencyMovement"
    | "relativePerformance";

export type TradeDirection = "Long" | "Short";
export type SnapshotMode = "Live" | "Replay";
export type NewsTone = "positive" | "negative" | "neutral";
export type AtlasPaperAccountStatus = "Pending" | "Approved" | "Restricted";
export type AtlasOrderType = "Market" | "Limit" | "Stop";
export type AtlasOrderStatus = "Working" | "Filled" | "Cancelled" | "Rejected";
export type AtlasTimeInForce = "DAY" | "GTC";
export type AtlasFundingSourceKind = "Bank" | "Broker Cash" | "Rewards";
export type AtlasFundingSourceStatus = "Active" | "Paused";
export type AtlasTransferDirection = "Deposit" | "Withdrawal";
export type AtlasTransferStatus = "Completed" | "Scheduled" | "Cancelled" | "Rejected";
export type AtlasTransferSpeed = "Instant" | "Same day";
export type AtlasActivityType = "system" | "order" | "trade" | "transfer" | "journal";

export interface AtlasMetricDescriptor {
    key: MarketMetricKey;
    label: string;
    shortLabel: string;
    description: string;
    lowerLabel: string;
    upperLabel: string;
    format: "percent" | "score" | "risk";
}

export interface AtlasCountryPosition {
    x: number;
    y: number;
    labelOffsetX: number;
    labelOffsetY: number;
    longitude: number;
    latitude: number;
}

export interface AtlasSectorPerformance {
    name: string;
    change: number;
}

export interface AtlasMover {
    symbol: string;
    name: string;
    countryCode: string;
    sector: string;
    price: number;
    change: number;
}

export interface AtlasHeadline {
    time: string;
    headline: string;
    catalyst: string;
    tone: NewsTone;
}

export interface AtlasMacroStat {
    label: string;
    value: string;
}

export interface AtlasTradeSetup {
    symbol: string;
    company: string;
    direction: TradeDirection;
    entryPrice: number;
    stopLoss: number;
    targetPrice: number;
    conviction: number;
    timeHorizon: string;
    catalyst: string;
    rationale: string;
    riskNotes: string;
}

export interface AtlasCountry {
    code: string;
    name: string;
    region: string;
    benchmark: string;
    currency: string;
    summary: string;
    position: AtlasCountryPosition;
    metrics: Record<MarketMetricKey, number>;
    benchmarkSeries: number[];
    topSectors: AtlasSectorPerformance[];
    movers: AtlasMover[];
    headlines: AtlasHeadline[];
    macroStats: AtlasMacroStat[];
    thesis: AtlasTradeSetup;
}

export interface AtlasGlobalStat {
    label: string;
    value: string;
    tone?: NewsTone;
}

export interface AtlasWatchlistItem {
    symbol: string;
    name: string;
    countryCode: string;
    lastPrice: number;
    change: number;
    note: string;
}

export interface AtlasAssetResearch {
    symbol: string;
    name: string;
    countryCode: string;
    countryName: string;
    sector: string;
    benchmark: string;
    price: number;
    change: number;
    note: string;
    catalyst: string;
    summary: string;
    priceSeries: number[];
    volumeSeries: number[];
    relativeStrength: number;
    volatility: number;
    support: number;
    resistance: number;
    sentiment: number;
}

export interface AtlasSectorHeatmapCell {
    sector: string;
    region: string;
    change: number;
    leadership: string;
}

export interface AtlasPortfolioSnapshot {
    startingCash: number;
    cashBalance: number;
    realizedPnl: number;
    closedTrades: number;
    winRate: number;
}

export interface AtlasPosition {
    id: string;
    symbol: string;
    name: string;
    countryCode: string;
    direction: TradeDirection;
    quantity: number;
    entryPrice: number;
    lastPrice: number;
    openedAt: string;
    thesisTag: string;
    feesPaid?: number;
    capitalReserved?: number;
}

export interface AtlasIdeaCard {
    id: string;
    symbol: string;
    title: string;
    direction: TradeDirection;
    conviction: number;
    timeHorizon: string;
    thesis: string;
    countryCode: string;
}

export interface AtlasJournalEntry {
    id: string;
    title: string;
    outcome: string;
    lesson: string;
    createdAt: string;
    symbol?: string;
    tradeId?: string;
    countryCode?: string;
    tags?: string[];
}

export interface AtlasNewsFeedItem {
    id: string;
    region: string;
    headline: string;
    catalyst: string;
    time: string;
    tone: NewsTone;
}

export interface AtlasSnapshot {
    date: string;
    label: string;
    mode: SnapshotMode;
    narrative: string;
    featuredCountryCode: string;
    globalStats: AtlasGlobalStat[];
    countries: AtlasCountry[];
    globalMovers: AtlasMover[];
    watchlist: AtlasWatchlistItem[];
    sectorHeatmap: AtlasSectorHeatmapCell[];
    portfolio: AtlasPortfolioSnapshot;
    positions: AtlasPosition[];
    recentIdeas: AtlasIdeaCard[];
    journalEntries: AtlasJournalEntry[];
    newsFeed: AtlasNewsFeedItem[];
}

export interface ThesisDraft {
    symbol: string;
    company: string;
    direction: TradeDirection;
    entryPrice: number;
    stopLoss: number;
    targetPrice: number;
    conviction: number;
    timeHorizon: string;
    catalyst: string;
    rationale: string;
    riskNotes: string;
    plannedQuantity: number;
}

export interface AtlasSavedThesis extends ThesisDraft {
    id: string;
    countryCode: string;
    createdAt: string;
    updatedAt: string;
}

export interface AtlasPaperTrade {
    id: string;
    thesisId?: string;
    symbol: string;
    name: string;
    countryCode: string;
    direction: TradeDirection;
    quantity: number;
    entryPrice: number;
    stopLoss: number;
    targetPrice: number;
    conviction: number;
    catalyst: string;
    timeHorizon: string;
    notes: string;
    openedAt: string;
    openedSnapshotDate: string;
    capitalReserved: number;
    feesPaid: number;
    exitPrice?: number;
    closedAt?: string;
    closedSnapshotDate?: string;
    realizedPnl?: number;
    exitReason?: string;
}

export interface AtlasPaperAccount {
    id: string;
    owner: string;
    accountType: "Margin" | "Cash";
    baseCurrency: string;
    paperMoneyOnly: boolean;
    kycStatus: AtlasPaperAccountStatus;
    riskProfile: "Conservative" | "Balanced" | "Aggressive";
    settlementModel: string;
    marketAccess: string[];
    createdAt: string;
}

export interface AtlasFundingSource {
    id: string;
    label: string;
    kind: AtlasFundingSourceKind;
    mask: string;
    currency: string;
    transferSpeed: AtlasTransferSpeed;
    status: AtlasFundingSourceStatus;
    dailyLimit: number;
}

export interface AtlasCashTransfer {
    id: string;
    direction: AtlasTransferDirection;
    sourceId: string;
    sourceLabel: string;
    amount: number;
    status: AtlasTransferStatus;
    requestedAt: string;
    completedAt?: string;
    note?: string;
}

export interface AtlasPaperOrder {
    id: string;
    thesisId?: string;
    symbol: string;
    company: string;
    countryCode: string;
    direction: TradeDirection;
    orderType: AtlasOrderType;
    status: AtlasOrderStatus;
    quantity: number;
    submittedAt: string;
    submittedSnapshotDate: string;
    timeInForce: AtlasTimeInForce;
    referencePrice: number;
    estimatedFillPrice: number;
    reservedBuyingPower: number;
    limitPrice?: number;
    stopPrice?: number;
    catalyst?: string;
    notes?: string;
    filledPrice?: number;
    filledAt?: string;
    fillTradeId?: string;
    cancelledAt?: string;
    rejectionReason?: string;
}

export interface AtlasActivityItem {
    id: string;
    type: AtlasActivityType;
    title: string;
    detail: string;
    createdAt: string;
    tone?: NewsTone;
    symbol?: string;
    amount?: number;
    relatedId?: string;
}

export interface AtlasWorkspaceState {
    version: number;
    startingCash: number;
    cashBalance: number;
    realizedPnl: number;
    historicalClosedTrades: number;
    historicalWins: number;
    watchlistSymbols: string[];
    theses: AtlasSavedThesis[];
    openTrades: AtlasPaperTrade[];
    closedTrades: AtlasPaperTrade[];
    journalEntries: AtlasJournalEntry[];
    account: AtlasPaperAccount;
    fundingSources: AtlasFundingSource[];
    transfers: AtlasCashTransfer[];
    orders: AtlasPaperOrder[];
    activity: AtlasActivityItem[];
}
