import {
    AtlasActivityItem,
    AtlasAssetResearch,
    AtlasCashTransfer,
    AtlasFundingSource,
    AtlasIdeaCard,
    AtlasJournalEntry,
    AtlasOrderStatus,
    AtlasOrderType,
    AtlasPaperAccount,
    AtlasPaperOrder,
    AtlasPaperTrade,
    AtlasPosition,
    AtlasSavedThesis,
    AtlasSnapshot,
    AtlasTimeInForce,
    AtlasTransferDirection,
    AtlasTransferStatus,
    AtlasWatchlistItem,
    AtlasWorkspaceState,
    TradeDirection,
    ThesisDraft
} from "../types/atlasmarket";
import { buildAssetCatalog, getAssetBySymbol, getCountryByCode } from "./atlasMarketData";

export const ATLAS_WORKSPACE_STORAGE_KEY = "ATLASMARKET_WORKSPACE_V2";
const WORKSPACE_VERSION = 2;

export interface AtlasTransferRequest {
    direction: AtlasTransferDirection;
    sourceId: string;
    amount: number;
    note?: string;
}

export interface AtlasOrderRequest {
    symbol: string;
    company: string;
    countryCode: string;
    direction: TradeDirection;
    orderType: AtlasOrderType;
    quantity: number;
    referencePrice: number;
    timeInForce: AtlasTimeInForce;
    limitPrice?: number;
    stopPrice?: number;
    thesisId?: string;
    catalyst?: string;
    notes?: string;
}

export interface AtlasWorkspaceView {
    account: AtlasPaperAccount;
    fundingSources: AtlasFundingSource[];
    transfers: AtlasCashTransfer[];
    activity: AtlasActivityItem[];
    assetCatalog: AtlasAssetResearch[];
    positions: AtlasPosition[];
    watchlist: AtlasWatchlistItem[];
    recentIdeas: AtlasIdeaCard[];
    journalEntries: AtlasJournalEntry[];
    openTrades: AtlasPaperTrade[];
    closedTrades: AtlasPaperTrade[];
    workingOrders: AtlasPaperOrder[];
    orderHistory: AtlasPaperOrder[];
    cashBalance: number;
    realizedPnl: number;
    unrealizedPnl: number;
    grossExposure: number;
    netLiq: number;
    totalClosedTrades: number;
    winRate: number;
    reservedBuyingPower: number;
    availableBuyingPower: number;
    pendingTransferAmount: number;
}

export interface AtlasTradeResult {
    workspace: AtlasWorkspaceState;
    trade?: AtlasPaperTrade;
    message: string;
}

export interface AtlasOrderResult {
    workspace: AtlasWorkspaceState;
    order?: AtlasPaperOrder;
    trade?: AtlasPaperTrade;
    message: string;
}

export interface AtlasTransferResult {
    workspace: AtlasWorkspaceState;
    transfer?: AtlasCashTransfer;
    message: string;
}

export interface AtlasWorkspaceSyncResult {
    workspace: AtlasWorkspaceState;
    changes: string[];
}

export function createInitialWorkspace(snapshot: AtlasSnapshot): AtlasWorkspaceState {
    const seededTransfer: AtlasCashTransfer = {
        id: "transfer-seed-paper-cash",
        direction: "Deposit",
        sourceId: "bank-atlas-primary",
        sourceLabel: "Atlas Treasury x1844",
        amount: snapshot.portfolio.startingCash,
        status: "Completed",
        requestedAt: snapshot.label,
        completedAt: snapshot.label,
        note: "Initial paper buying power"
    };

    return {
        version: WORKSPACE_VERSION,
        startingCash: snapshot.portfolio.startingCash,
        cashBalance: snapshot.portfolio.cashBalance,
        realizedPnl: snapshot.portfolio.realizedPnl,
        historicalClosedTrades: snapshot.portfolio.closedTrades,
        historicalWins: Math.round(snapshot.portfolio.closedTrades * (snapshot.portfolio.winRate / 100)),
        watchlistSymbols: snapshot.watchlist.map((item) => item.symbol),
        theses: snapshot.recentIdeas.map((idea) => {
            const asset = getAssetBySymbol(snapshot, idea.symbol);
            const country = getCountryByCode(snapshot, idea.countryCode);
            const entryPrice = asset?.price ?? country.thesis.entryPrice;

            return {
                id: idea.id,
                countryCode: idea.countryCode,
                symbol: idea.symbol,
                company: asset?.name ?? idea.symbol,
                direction: idea.direction,
                entryPrice,
                stopLoss: roundPrice(entryPrice * (idea.direction === "Long" ? 0.96 : 1.04)),
                targetPrice: roundPrice(entryPrice * (idea.direction === "Long" ? 1.08 : 0.92)),
                conviction: idea.conviction,
                timeHorizon: idea.timeHorizon,
                catalyst: asset?.catalyst ?? idea.thesis,
                rationale: idea.thesis,
                riskNotes: `${country.name} breadth confirmation matters more than the first headline reaction.`,
                plannedQuantity: getSuggestedQuantity(entryPrice, idea.conviction),
                createdAt: snapshot.label,
                updatedAt: snapshot.label
            };
        }),
        openTrades: snapshot.positions.map((position) => {
            const country = getCountryByCode(snapshot, position.countryCode);
            const matchingThesis = snapshot.recentIdeas.find((idea) => idea.symbol === position.symbol);

            return {
                id: position.id,
                thesisId: matchingThesis?.id,
                symbol: position.symbol,
                name: position.name,
                countryCode: position.countryCode,
                direction: position.direction,
                quantity: position.quantity,
                entryPrice: position.entryPrice,
                stopLoss: roundPrice(position.entryPrice * (position.direction === "Long" ? 0.96 : 1.04)),
                targetPrice: roundPrice(position.entryPrice * (position.direction === "Long" ? 1.08 : 0.92)),
                conviction: matchingThesis?.conviction ?? Math.round(country.metrics.sectorStrength),
                catalyst: position.thesisTag,
                timeHorizon: matchingThesis?.timeHorizon ?? "1-4 weeks",
                notes: country.summary,
                openedAt: position.openedAt,
                openedSnapshotDate: snapshot.date,
                capitalReserved: getCapitalRequirement(position.direction, position.quantity, position.entryPrice),
                feesPaid: 0
            };
        }),
        closedTrades: [],
        journalEntries: snapshot.journalEntries.map((entry) => ({ ...entry })),
        account: {
            id: "acct-atlas-paper",
            owner: "AtlasMarket Paper Desk",
            accountType: "Margin",
            baseCurrency: "USD",
            paperMoneyOnly: true,
            kycStatus: "Approved",
            riskProfile: "Balanced",
            settlementModel: "T+0 simulated cash ledger",
            marketAccess: snapshot.countries.map((country) => country.name),
            createdAt: snapshot.label
        },
        fundingSources: [
            {
                id: "bank-atlas-primary",
                label: "Atlas Treasury x1844",
                kind: "Bank",
                mask: "1844",
                currency: "USD",
                transferSpeed: "Same day",
                status: "Active",
                dailyLimit: 500000
            },
            {
                id: "bank-atlas-instant",
                label: "Paper Instant Rail x9021",
                kind: "Bank",
                mask: "9021",
                currency: "USD",
                transferSpeed: "Instant",
                status: "Active",
                dailyLimit: 100000
            },
            {
                id: "rewards-research",
                label: "Research Rebate Wallet",
                kind: "Rewards",
                mask: "RWD",
                currency: "USD",
                transferSpeed: "Instant",
                status: "Active",
                dailyLimit: 25000
            }
        ],
        transfers: [seededTransfer],
        orders: [],
        activity: [
            buildActivity({
                id: "activity-paper-ready",
                type: "system",
                title: "Paper account approved",
                detail: "Global equities, replay routing, and funding rails are active.",
                createdAt: snapshot.label,
                tone: "positive"
            }),
            buildActivity({
                id: "activity-transfer-seed-paper-cash",
                type: "transfer",
                title: "Paper wallet funded",
                detail: `${displayDirectionLabel("Deposit")} ${formatMoney(seededTransfer.amount)} from ${seededTransfer.sourceLabel}.`,
                createdAt: snapshot.label,
                tone: "positive",
                amount: seededTransfer.amount,
                relatedId: seededTransfer.id
            })
        ]
    };
}

export function hydrateWorkspaceState(rawValue: string | null, snapshot: AtlasSnapshot): AtlasWorkspaceState {
    if (!rawValue) {
        return createInitialWorkspace(snapshot);
    }

    try {
        const parsed = JSON.parse(rawValue) as Partial<AtlasWorkspaceState>;
        const initial = createInitialWorkspace(snapshot);

        return {
            version: WORKSPACE_VERSION,
            startingCash: coerceNumber(parsed.startingCash, initial.startingCash),
            cashBalance: coerceNumber(parsed.cashBalance, initial.cashBalance),
            realizedPnl: coerceNumber(parsed.realizedPnl, initial.realizedPnl),
            historicalClosedTrades: coerceNumber(parsed.historicalClosedTrades, initial.historicalClosedTrades),
            historicalWins: coerceNumber(parsed.historicalWins, initial.historicalWins),
            watchlistSymbols: sanitizeStringArray(parsed.watchlistSymbols, initial.watchlistSymbols),
            theses: Array.isArray(parsed.theses) ? parsed.theses.map(sanitizeThesis) : initial.theses,
            openTrades: Array.isArray(parsed.openTrades) ? parsed.openTrades.map(sanitizeTrade) : initial.openTrades,
            closedTrades: Array.isArray(parsed.closedTrades) ? parsed.closedTrades.map(sanitizeTrade) : initial.closedTrades,
            journalEntries: Array.isArray(parsed.journalEntries) ? parsed.journalEntries.map(sanitizeJournalEntry) : initial.journalEntries,
            account: sanitizeAccount(parsed.account, initial.account),
            fundingSources: Array.isArray(parsed.fundingSources) && parsed.fundingSources.length > 0
                ? parsed.fundingSources.map((source) => sanitizeFundingSource(source))
                : initial.fundingSources,
            transfers: Array.isArray(parsed.transfers) ? parsed.transfers.map(sanitizeTransfer) : initial.transfers,
            orders: Array.isArray(parsed.orders) ? parsed.orders.map(sanitizeOrder) : initial.orders,
            activity: Array.isArray(parsed.activity) && parsed.activity.length > 0
                ? parsed.activity.map(sanitizeActivity)
                : initial.activity
        };
    } catch {
        return createInitialWorkspace(snapshot);
    }
}

export function serializeWorkspaceState(workspace: AtlasWorkspaceState): string {
    return JSON.stringify(workspace);
}

export function deriveWorkspaceView(snapshot: AtlasSnapshot, workspace: AtlasWorkspaceState): AtlasWorkspaceView {
    return deriveWorkspaceViewFromAssetCatalog(workspace, buildAssetCatalog(snapshot));
}

export function deriveWorkspaceViewWithCountries(
    snapshot: AtlasSnapshot,
    workspace: AtlasWorkspaceState,
    countries: AtlasSnapshot["countries"]
): AtlasWorkspaceView {
    return deriveWorkspaceViewFromAssetCatalog(workspace, buildAssetCatalog(snapshot, countries));
}

export function toggleWatchlistSymbol(workspace: AtlasWorkspaceState, symbol: string): AtlasWorkspaceState {
    const currentSet = new Set(workspace.watchlistSymbols);

    if (currentSet.has(symbol)) {
        currentSet.delete(symbol);
    } else {
        currentSet.add(symbol);
    }

    return {
        ...workspace,
        watchlistSymbols: [...currentSet]
    };
}

export function upsertWorkspaceThesis(
    workspace: AtlasWorkspaceState,
    draft: ThesisDraft,
    countryCode: string,
    timestamp: string
): { workspace: AtlasWorkspaceState; thesisId: string; } {
    const existing = workspace.theses.find((thesis) => thesis.symbol === draft.symbol && thesis.countryCode === countryCode);
    const thesisId = existing?.id ?? `thesis-${Date.now()}`;
    const createdAt = existing?.createdAt ?? timestamp;
    const thesis = {
        ...draft,
        id: thesisId,
        countryCode,
        createdAt,
        updatedAt: timestamp
    };

    return {
        thesisId,
        workspace: {
            ...workspace,
            theses: [thesis, ...workspace.theses.filter((item) => item.id !== thesisId)]
        }
    };
}

export function submitWorkspaceTransfer(
    workspace: AtlasWorkspaceState,
    request: AtlasTransferRequest,
    timestamp: string
): AtlasTransferResult {
    const source = workspace.fundingSources.find((item) => item.id === request.sourceId && item.status === "Active");
    const amount = roundMoney(request.amount);

    if (!source) {
        return {
            workspace,
            message: "Choose an active paper funding rail before moving cash."
        };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        return {
            workspace,
            message: "Enter a paper cash amount greater than zero."
        };
    }

    if (amount > source.dailyLimit) {
        return {
            workspace,
            message: `That amount exceeds the ${formatMoney(source.dailyLimit)} daily limit on ${source.label}.`
        };
    }

    const availableCash = getAvailableBuyingPower(workspace);

    if (request.direction === "Withdrawal" && amount > availableCash) {
        return {
            workspace,
            message: "Not enough settled paper cash after reserving active orders."
        };
    }

    const transfer: AtlasCashTransfer = {
        id: `transfer-${Date.now()}`,
        direction: request.direction,
        sourceId: source.id,
        sourceLabel: source.label,
        amount,
        status: source.transferSpeed === "Instant" ? "Completed" : "Scheduled",
        requestedAt: timestamp,
        completedAt: source.transferSpeed === "Instant" ? timestamp : undefined,
        note: request.note?.trim()
    };

    const cashDelta = transfer.status === "Completed"
        ? (transfer.direction === "Deposit" ? amount : -amount)
        : 0;
    const detail = transfer.status === "Completed"
        ? `${displayDirectionLabel(transfer.direction)} ${formatMoney(amount)} ${transfer.direction === "Deposit" ? "to" : "from"} the paper wallet.`
        : `${displayDirectionLabel(transfer.direction)} ${formatMoney(amount)} queued on ${source.label}.`;

    return {
        transfer,
        workspace: prependActivity({
            ...workspace,
            cashBalance: roundMoney(workspace.cashBalance + cashDelta),
            transfers: [transfer, ...workspace.transfers]
        }, buildActivity({
            id: `activity-${transfer.id}`,
            type: "transfer",
            title: transfer.status === "Completed" ? "Paper cash moved" : "Transfer queued",
            detail,
            createdAt: timestamp,
            tone: transfer.direction === "Deposit" ? "positive" : "neutral",
            amount: transfer.direction === "Deposit" ? amount : -amount,
            relatedId: transfer.id
        })),
        message: transfer.status === "Completed"
            ? `${displayDirectionLabel(transfer.direction)} completed in paper cash.`
            : `${displayDirectionLabel(transfer.direction)} queued and ready to settle.`
    };
}

export function settleWorkspaceTransfer(
    workspace: AtlasWorkspaceState,
    transferId: string,
    timestamp: string
): AtlasTransferResult {
    const transfer = workspace.transfers.find((item) => item.id === transferId);

    if (!transfer || transfer.status !== "Scheduled") {
        return {
            workspace,
            message: "That transfer is not waiting to settle."
        };
    }

    const availableCash = getAvailableBuyingPower(workspace);

    if (transfer.direction === "Withdrawal" && transfer.amount > availableCash) {
        return {
            workspace,
            message: "Buying power is tied up in working orders, so that withdrawal cannot settle yet."
        };
    }

    const completedTransfer: AtlasCashTransfer = {
        ...transfer,
        status: "Completed",
        completedAt: timestamp
    };
    const cashDelta = transfer.direction === "Deposit" ? transfer.amount : -transfer.amount;

    return {
        transfer: completedTransfer,
        workspace: prependActivity({
            ...workspace,
            cashBalance: roundMoney(workspace.cashBalance + cashDelta),
            transfers: workspace.transfers.map((item) => item.id === transferId ? completedTransfer : item)
        }, buildActivity({
            id: `activity-settle-${transfer.id}`,
            type: "transfer",
            title: "Transfer settled",
            detail: `${displayDirectionLabel(transfer.direction)} ${formatMoney(transfer.amount)} completed on the paper ledger.`,
            createdAt: timestamp,
            tone: transfer.direction === "Deposit" ? "positive" : "neutral",
            amount: cashDelta,
            relatedId: transfer.id
        })),
        message: `${displayDirectionLabel(transfer.direction)} settled successfully.`
    };
}

export function submitWorkspaceOrder(
    workspace: AtlasWorkspaceState,
    snapshot: AtlasSnapshot,
    request: AtlasOrderRequest,
    timestamp: string
): AtlasOrderResult {
    const quantity = Math.max(1, Math.floor(request.quantity));
    const referencePrice = roundPrice(request.referencePrice);

    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        return {
            workspace,
            message: "The order needs a valid market reference price."
        };
    }

    if ((request.orderType === "Limit" && (!request.limitPrice || request.limitPrice <= 0))
        || (request.orderType === "Stop" && (!request.stopPrice || request.stopPrice <= 0))) {
        return {
            workspace,
            message: `Set a valid ${request.orderType.toLowerCase()} price before submitting.`
        };
    }

    const estimatedFillPrice = getEstimatedOrderFillPrice(
        request.orderType,
        request.direction,
        referencePrice,
        request.limitPrice,
        request.stopPrice
    );
    const estimatedCost = getTotalDebit(request.direction, quantity, estimatedFillPrice).totalDebit;
    const availableBuyingPower = getAvailableBuyingPower(workspace);
    const orderBase: AtlasPaperOrder = {
        id: `order-${Date.now()}`,
        thesisId: request.thesisId,
        symbol: request.symbol,
        company: request.company,
        countryCode: request.countryCode,
        direction: request.direction,
        orderType: request.orderType,
        status: "Working",
        quantity,
        submittedAt: timestamp,
        submittedSnapshotDate: snapshot.date,
        timeInForce: request.timeInForce,
        referencePrice,
        estimatedFillPrice,
        reservedBuyingPower: estimatedCost,
        limitPrice: request.limitPrice ? roundPrice(request.limitPrice) : undefined,
        stopPrice: request.stopPrice ? roundPrice(request.stopPrice) : undefined,
        catalyst: request.catalyst,
        notes: request.notes
    };

    if (estimatedCost > availableBuyingPower) {
        const rejectedOrder: AtlasPaperOrder = {
            ...orderBase,
            status: "Rejected",
            rejectionReason: "Insufficient paper buying power"
        };

        return {
            order: rejectedOrder,
            workspace: prependActivity({
                ...workspace,
                orders: [rejectedOrder, ...workspace.orders]
            }, buildActivity({
                id: `activity-${rejectedOrder.id}`,
                type: "order",
                title: "Order rejected",
                detail: `${request.symbol} ${request.orderType.toLowerCase()} order exceeded available paper buying power.`,
                createdAt: timestamp,
                tone: "negative",
                symbol: request.symbol,
                relatedId: rejectedOrder.id
            })),
            message: "Not enough paper buying power for that order."
        };
    }

    if (!shouldOrderTrigger(orderBase, referencePrice)) {
        const workingOrder: AtlasPaperOrder = {
            ...orderBase,
            status: "Working"
        };

        return {
            order: workingOrder,
            workspace: prependActivity({
                ...workspace,
                watchlistSymbols: dedupeStrings([request.symbol, ...workspace.watchlistSymbols]),
                orders: [workingOrder, ...workspace.orders]
            }, buildActivity({
                id: `activity-${workingOrder.id}`,
                type: "order",
                title: "Order submitted",
                detail: `${request.orderType} ${request.direction.toLowerCase()} order working for ${request.symbol}.`,
                createdAt: timestamp,
                tone: "neutral",
                symbol: request.symbol,
                relatedId: workingOrder.id
            })),
            message: `${request.orderType} order is now working in the paper blotter.`
        };
    }

    return fillOrder({
        workspace,
        snapshot,
        order: orderBase,
        timestamp,
        marketPrice: referencePrice
    });
}

export function cancelWorkspaceOrder(
    workspace: AtlasWorkspaceState,
    orderId: string,
    timestamp: string
): AtlasOrderResult {
    const order = workspace.orders.find((item) => item.id === orderId);

    if (!order || order.status !== "Working") {
        return {
            workspace,
            message: "That order is no longer working."
        };
    }

    const cancelledOrder: AtlasPaperOrder = {
        ...order,
        status: "Cancelled",
        cancelledAt: timestamp
    };

    return {
        order: cancelledOrder,
        workspace: prependActivity({
            ...workspace,
            orders: workspace.orders.map((item) => item.id === orderId ? cancelledOrder : item)
        }, buildActivity({
            id: `activity-cancel-${orderId}`,
            type: "order",
            title: "Order cancelled",
            detail: `${order.symbol} ${order.orderType.toLowerCase()} order cancelled from the paper blotter.`,
            createdAt: timestamp,
            tone: "neutral",
            symbol: order.symbol,
            relatedId: orderId
        })),
        message: `${order.symbol} order cancelled.`
    };
}

export function syncWorkspaceWithMarket(
    workspace: AtlasWorkspaceState,
    snapshot: AtlasSnapshot,
    timestamp: string
): AtlasWorkspaceSyncResult {
    let nextWorkspace = workspace;
    const changes: string[] = [];

    for (const order of workspace.orders.filter((item) => item.status === "Working")) {
        const latestOrder = nextWorkspace.orders.find((item) => item.id === order.id);

        if (!latestOrder || latestOrder.status !== "Working") {
            continue;
        }

        if (latestOrder.timeInForce === "DAY" && latestOrder.submittedSnapshotDate !== snapshot.date) {
            const cancelled = cancelWorkspaceOrder(nextWorkspace, latestOrder.id, timestamp);
            nextWorkspace = cancelled.workspace;
            changes.push(`${latestOrder.symbol} day order expired.`);
            continue;
        }

        const asset = getAssetBySymbol(snapshot, latestOrder.symbol);

        if (!asset || !shouldOrderTrigger(latestOrder, asset.price)) {
            continue;
        }

        const filled = fillOrder({
            workspace: nextWorkspace,
            snapshot,
            order: latestOrder,
            timestamp,
            marketPrice: asset.price
        });

        nextWorkspace = filled.workspace;

        if (filled.trade) {
            changes.push(filled.message);
        }
    }

    return {
        workspace: nextWorkspace,
        changes
    };
}

export function openWorkspaceTrade(
    workspace: AtlasWorkspaceState,
    snapshot: AtlasSnapshot,
    draft: ThesisDraft,
    countryCode: string,
    timestamp: string,
    thesisId?: string
): AtlasTradeResult {
    const result = submitWorkspaceOrder(workspace, snapshot, {
        symbol: draft.symbol,
        company: draft.company,
        countryCode,
        direction: draft.direction,
        orderType: "Market",
        quantity: draft.plannedQuantity,
        referencePrice: draft.entryPrice,
        timeInForce: "DAY",
        thesisId,
        catalyst: draft.catalyst,
        notes: draft.riskNotes
    }, timestamp);

    return {
        workspace: result.workspace,
        trade: result.trade,
        message: result.message
    };
}

export function closeWorkspaceTrade(
    workspace: AtlasWorkspaceState,
    snapshot: AtlasSnapshot,
    tradeId: string,
    timestamp: string,
    exitReason = "Manual close"
): AtlasTradeResult {
    const trade = workspace.openTrades.find((item) => item.id === tradeId);

    if (!trade) {
        return {
            workspace,
            message: "Trade not found in the open book."
        };
    }

    const asset = getAssetBySymbol(snapshot, trade.symbol);
    const markPrice = getTradeMarkPrice(trade, asset);
    const exitFill = roundPrice(markPrice * (trade.direction === "Long" ? 0.999 : 1.001));
    const exitNotional = roundMoney(exitFill * trade.quantity);
    const exitFee = getFee(exitNotional);
    const grossPnl = roundMoney(
        trade.direction === "Long"
            ? (exitFill - trade.entryPrice) * trade.quantity
            : (trade.entryPrice - exitFill) * trade.quantity
    );
    const realizedPnl = roundMoney(grossPnl - trade.feesPaid - exitFee);
    const closedTrade: AtlasPaperTrade = {
        ...trade,
        exitPrice: exitFill,
        closedAt: timestamp,
        closedSnapshotDate: snapshot.date,
        realizedPnl,
        exitReason,
        feesPaid: roundMoney(trade.feesPaid + exitFee)
    };

    return {
        trade: closedTrade,
        workspace: prependActivity({
            ...workspace,
            cashBalance: roundMoney(workspace.cashBalance + trade.capitalReserved + grossPnl - exitFee),
            realizedPnl: roundMoney(workspace.realizedPnl + realizedPnl),
            openTrades: workspace.openTrades.filter((item) => item.id !== tradeId),
            closedTrades: [closedTrade, ...workspace.closedTrades]
        }, buildActivity({
            id: `activity-close-${tradeId}`,
            type: "trade",
            title: "Trade closed",
            detail: `${trade.symbol} closed at ${formatMoney(exitFill)} for ${formatMoney(realizedPnl)} realized PnL.`,
            createdAt: timestamp,
            tone: realizedPnl >= 0 ? "positive" : "negative",
            symbol: trade.symbol,
            amount: realizedPnl,
            relatedId: tradeId
        })),
        message: `Closed ${trade.symbol} at ${exitReason.toLowerCase()}.`
    };
}

export function appendWorkspaceJournalEntry(
    workspace: AtlasWorkspaceState,
    entry: Pick<AtlasJournalEntry, "title" | "outcome" | "lesson"> & Partial<AtlasJournalEntry>
): AtlasWorkspaceState {
    const journalEntry: AtlasJournalEntry = {
        id: entry.id ?? `journal-${Date.now()}`,
        title: entry.title,
        outcome: entry.outcome,
        lesson: entry.lesson,
        createdAt: entry.createdAt ?? new Date().toISOString(),
        symbol: entry.symbol,
        tradeId: entry.tradeId,
        countryCode: entry.countryCode,
        tags: entry.tags ?? []
    };

    return prependActivity({
        ...workspace,
        journalEntries: [journalEntry, ...workspace.journalEntries]
    }, buildActivity({
        id: `activity-${journalEntry.id}`,
        type: "journal",
        title: journalEntry.title,
        detail: journalEntry.lesson,
        createdAt: journalEntry.createdAt,
        tone: "neutral",
        symbol: journalEntry.symbol,
        relatedId: journalEntry.id
    }));
}

export function resetWorkspace(snapshot: AtlasSnapshot): AtlasWorkspaceState {
    return createInitialWorkspace(snapshot);
}

function deriveWorkspaceViewFromAssetCatalog(
    workspace: AtlasWorkspaceState,
    assetCatalog: AtlasAssetResearch[]
): AtlasWorkspaceView {
    const assetLookup = new Map(assetCatalog.map((asset) => [asset.symbol, asset]));

    const positions = workspace.openTrades.map((trade) => {
        const asset = assetLookup.get(trade.symbol);
        const currentPrice = getTradeMarkPrice(trade, asset);

        return {
            id: trade.id,
            symbol: trade.symbol,
            name: trade.name,
            countryCode: trade.countryCode,
            direction: trade.direction,
            quantity: trade.quantity,
            entryPrice: trade.entryPrice,
            lastPrice: currentPrice,
            openedAt: trade.openedAt,
            thesisTag: trade.catalyst,
            feesPaid: trade.feesPaid,
            capitalReserved: trade.capitalReserved
        };
    });

    const workingOrders = workspace.orders
        .filter((order) => order.status === "Working")
        .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
    const orderHistory = workspace.orders
        .filter((order) => order.status !== "Working")
        .sort((left, right) => getOrderSortDate(right).localeCompare(getOrderSortDate(left)));
    const reservedBuyingPower = roundMoney(workingOrders.reduce((sum, order) => sum + order.reservedBuyingPower, 0));
    const pendingTransferAmount = roundMoney(workspace.transfers.reduce((sum, transfer) => {
        if (transfer.status !== "Scheduled") {
            return sum;
        }

        return sum + (transfer.direction === "Deposit" ? transfer.amount : -transfer.amount);
    }, 0));

    const watchlist = workspace.watchlistSymbols
        .map((symbol) => assetLookup.get(symbol))
        .filter((asset): asset is AtlasAssetResearch => Boolean(asset))
        .map((asset) => ({
            symbol: asset.symbol,
            name: asset.name,
            countryCode: asset.countryCode,
            lastPrice: asset.price,
            change: asset.change,
            note: asset.note
        }));

    const recentIdeas = [...workspace.theses]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 8)
        .map((thesis) => ({
            id: thesis.id,
            symbol: thesis.symbol,
            title: thesis.rationale.slice(0, 68),
            direction: thesis.direction,
            conviction: thesis.conviction,
            timeHorizon: thesis.timeHorizon,
            thesis: thesis.catalyst,
            countryCode: thesis.countryCode
        }));

    const unrealizedPnl = roundMoney(positions.reduce((sum, position) => {
        const gross = getPositionGrossPnl(position);
        return sum + (gross - (position.feesPaid ?? 0));
    }, 0));
    const grossExposure = roundMoney(workspace.openTrades.reduce((sum, trade) => sum + trade.capitalReserved, 0));
    const netLiq = roundMoney(workspace.cashBalance + workspace.openTrades.reduce((sum, trade) => {
        const asset = assetLookup.get(trade.symbol);
        return sum + getOpenTradeMarketValue(trade, getTradeMarkPrice(trade, asset));
    }, 0));
    const additionalWins = workspace.closedTrades.filter((trade) => (trade.realizedPnl ?? 0) > 0).length;
    const totalClosedTrades = workspace.historicalClosedTrades + workspace.closedTrades.length;
    const winRate = totalClosedTrades > 0
        ? Math.round(((workspace.historicalWins + additionalWins) / totalClosedTrades) * 100)
        : 0;

    return {
        account: workspace.account,
        fundingSources: workspace.fundingSources,
        transfers: [...workspace.transfers].sort((left, right) => getTransferSortDate(right).localeCompare(getTransferSortDate(left))),
        activity: [...workspace.activity].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        assetCatalog,
        positions,
        watchlist,
        recentIdeas,
        journalEntries: [...workspace.journalEntries].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        openTrades: workspace.openTrades,
        closedTrades: [...workspace.closedTrades].sort((left, right) => (right.closedAt ?? "").localeCompare(left.closedAt ?? "")),
        workingOrders,
        orderHistory,
        cashBalance: workspace.cashBalance,
        realizedPnl: workspace.realizedPnl,
        unrealizedPnl,
        grossExposure,
        netLiq,
        totalClosedTrades,
        winRate,
        reservedBuyingPower,
        availableBuyingPower: roundMoney(Math.max(0, workspace.cashBalance - reservedBuyingPower)),
        pendingTransferAmount
    };
}

function fillOrder({
    workspace,
    snapshot,
    order,
    timestamp,
    marketPrice
}: {
    workspace: AtlasWorkspaceState;
    snapshot: AtlasSnapshot;
    order: AtlasPaperOrder;
    timestamp: string;
    marketPrice: number;
}): AtlasOrderResult {
    const fillPrice = getActualOrderFillPrice(order, marketPrice);
    const debit = getTotalDebit(order.direction, order.quantity, fillPrice);
    const availableBuyingPower = getAvailableBuyingPower(workspace, order.id);

    if (debit.totalDebit > availableBuyingPower) {
        const rejectedOrder: AtlasPaperOrder = {
            ...order,
            status: "Rejected",
            rejectionReason: "Buying power changed before fill"
        };

        return {
            order: rejectedOrder,
            workspace: prependActivity({
                ...workspace,
                orders: replaceOrInsertOrder(workspace.orders, rejectedOrder)
            }, buildActivity({
                id: `activity-fill-reject-${order.id}`,
                type: "order",
                title: "Order rejected at trigger",
                detail: `${order.symbol} triggered but could not fill because buying power changed.`,
                createdAt: timestamp,
                tone: "negative",
                symbol: order.symbol,
                relatedId: order.id
            })),
            message: `${order.symbol} triggered but could not fill because buying power changed.`
        };
    }

    const trade: AtlasPaperTrade = {
        id: order.fillTradeId ?? `trade-${Date.now()}`,
        thesisId: order.thesisId,
        symbol: order.symbol,
        name: order.company,
        countryCode: order.countryCode,
        direction: order.direction,
        quantity: order.quantity,
        entryPrice: fillPrice,
        stopLoss: roundPrice(fillPrice * (order.direction === "Long" ? 0.96 : 1.04)),
        targetPrice: roundPrice(fillPrice * (order.direction === "Long" ? 1.08 : 0.92)),
        conviction: 68,
        catalyst: order.catalyst ?? `${order.orderType} order`,
        timeHorizon: order.orderType === "Market" ? "days to 4 weeks" : "1-3 weeks",
        notes: order.notes ?? "Paper order filled from AtlasMarket ticket.",
        openedAt: timestamp,
        openedSnapshotDate: snapshot.date,
        capitalReserved: debit.capitalReserved,
        feesPaid: debit.fee
    };

    const filledOrder: AtlasPaperOrder = {
        ...order,
        status: "Filled",
        filledPrice: fillPrice,
        filledAt: timestamp,
        fillTradeId: trade.id,
        estimatedFillPrice: fillPrice,
        reservedBuyingPower: debit.totalDebit
    };

    return {
        order: filledOrder,
        trade,
        workspace: prependActivity({
            ...workspace,
            cashBalance: roundMoney(workspace.cashBalance - debit.totalDebit),
            watchlistSymbols: dedupeStrings([order.symbol, ...workspace.watchlistSymbols]),
            openTrades: [trade, ...workspace.openTrades],
            orders: replaceOrInsertOrder(workspace.orders, filledOrder)
        }, buildActivity({
            id: `activity-fill-${order.id}`,
            type: "trade",
            title: "Order filled",
            detail: `${order.symbol} ${order.direction.toLowerCase()} ${order.quantity} shares at ${formatMoney(fillPrice)}.`,
            createdAt: timestamp,
            tone: "positive",
            symbol: order.symbol,
            amount: -debit.totalDebit,
            relatedId: trade.id
        })),
        message: `Opened ${order.quantity} ${order.direction.toLowerCase()} ${order.symbol} on paper.`
    };
}

function replaceOrInsertOrder(orders: AtlasPaperOrder[], nextOrder: AtlasPaperOrder): AtlasPaperOrder[] {
    const remaining = orders.filter((item) => item.id !== nextOrder.id);
    return [nextOrder, ...remaining];
}

function prependActivity(workspace: AtlasWorkspaceState, entry: AtlasActivityItem): AtlasWorkspaceState {
    return {
        ...workspace,
        activity: [entry, ...workspace.activity.filter((item) => item.id !== entry.id)].slice(0, 120)
    };
}

function buildActivity(entry: AtlasActivityItem): AtlasActivityItem {
    return entry;
}

function sanitizeTrade(trade: Partial<AtlasPaperTrade>): AtlasPaperTrade {
    return {
        id: trade.id ?? `trade-${Date.now()}`,
        thesisId: trade.thesisId,
        symbol: trade.symbol ?? "UNKNOWN",
        name: trade.name ?? trade.symbol ?? "Unknown",
        countryCode: trade.countryCode ?? "US",
        direction: trade.direction === "Short" ? "Short" : "Long",
        quantity: coerceNumber(trade.quantity, 1),
        entryPrice: coerceNumber(trade.entryPrice, 0),
        stopLoss: coerceNumber(trade.stopLoss, 0),
        targetPrice: coerceNumber(trade.targetPrice, 0),
        conviction: coerceNumber(trade.conviction, 50),
        catalyst: trade.catalyst ?? "Research rotation",
        timeHorizon: trade.timeHorizon ?? "1-4 weeks",
        notes: trade.notes ?? "",
        openedAt: trade.openedAt ?? new Date().toISOString(),
        openedSnapshotDate: trade.openedSnapshotDate ?? "",
        capitalReserved: coerceNumber(trade.capitalReserved, 0),
        feesPaid: coerceNumber(trade.feesPaid, 0),
        exitPrice: trade.exitPrice,
        closedAt: trade.closedAt,
        closedSnapshotDate: trade.closedSnapshotDate,
        realizedPnl: trade.realizedPnl,
        exitReason: trade.exitReason
    };
}

function sanitizeThesis(thesis: any): AtlasSavedThesis {
    const direction: TradeDirection = thesis.direction === "Short" ? "Short" : "Long";

    return {
        id: thesis.id ?? `thesis-${Date.now()}`,
        countryCode: thesis.countryCode ?? "US",
        symbol: thesis.symbol ?? "UNKNOWN",
        company: thesis.company ?? thesis.symbol ?? "Unknown",
        direction,
        entryPrice: coerceNumber(thesis.entryPrice, 0),
        stopLoss: coerceNumber(thesis.stopLoss, 0),
        targetPrice: coerceNumber(thesis.targetPrice, 0),
        conviction: coerceNumber(thesis.conviction, 50),
        timeHorizon: thesis.timeHorizon ?? "1-4 weeks",
        catalyst: thesis.catalyst ?? "Research rotation",
        rationale: thesis.rationale ?? "AtlasMarket thesis draft.",
        riskNotes: thesis.riskNotes ?? "Respect the stop and journal the outcome.",
        plannedQuantity: coerceNumber(thesis.plannedQuantity, 1),
        createdAt: thesis.createdAt ?? new Date().toISOString(),
        updatedAt: thesis.updatedAt ?? thesis.createdAt ?? new Date().toISOString()
    };
}

function sanitizeJournalEntry(entry: Partial<AtlasJournalEntry>): AtlasJournalEntry {
    return {
        id: entry.id ?? `journal-${Date.now()}`,
        title: entry.title ?? "AtlasMarket journal note",
        outcome: entry.outcome ?? "",
        lesson: entry.lesson ?? "",
        createdAt: entry.createdAt ?? new Date().toISOString(),
        symbol: entry.symbol,
        tradeId: entry.tradeId,
        countryCode: entry.countryCode,
        tags: Array.isArray(entry.tags) ? entry.tags : []
    };
}

function sanitizeAccount(account: Partial<AtlasPaperAccount> | undefined, fallback: AtlasPaperAccount): AtlasPaperAccount {
    const marketAccess = Array.isArray(account?.marketAccess)
        ? (account?.marketAccess ?? []).filter((item): item is string => typeof item === "string")
        : fallback.marketAccess;

    return {
        id: account?.id ?? fallback.id,
        owner: account?.owner ?? fallback.owner,
        accountType: account?.accountType === "Cash" ? "Cash" : "Margin",
        baseCurrency: account?.baseCurrency ?? fallback.baseCurrency,
        paperMoneyOnly: account?.paperMoneyOnly ?? fallback.paperMoneyOnly,
        kycStatus: account?.kycStatus === "Pending" || account?.kycStatus === "Restricted" ? account.kycStatus : "Approved",
        riskProfile: account?.riskProfile === "Conservative" || account?.riskProfile === "Aggressive" ? account.riskProfile : "Balanced",
        settlementModel: account?.settlementModel ?? fallback.settlementModel,
        marketAccess,
        createdAt: account?.createdAt ?? fallback.createdAt
    };
}

function sanitizeFundingSource(source: Partial<AtlasFundingSource>): AtlasFundingSource {
    return {
        id: source.id ?? `source-${Date.now()}`,
        label: source.label ?? "Paper Funding Source",
        kind: source.kind === "Broker Cash" || source.kind === "Rewards" ? source.kind : "Bank",
        mask: source.mask ?? "0000",
        currency: source.currency ?? "USD",
        transferSpeed: source.transferSpeed === "Instant" ? "Instant" : "Same day",
        status: source.status === "Paused" ? "Paused" : "Active",
        dailyLimit: coerceNumber(source.dailyLimit, 100000)
    };
}

function sanitizeTransfer(transfer: Partial<AtlasCashTransfer>): AtlasCashTransfer {
    return {
        id: transfer.id ?? `transfer-${Date.now()}`,
        direction: transfer.direction === "Withdrawal" ? "Withdrawal" : "Deposit",
        sourceId: transfer.sourceId ?? "unknown-source",
        sourceLabel: transfer.sourceLabel ?? "Paper cash rail",
        amount: coerceNumber(transfer.amount, 0),
        status: sanitizeTransferStatus(transfer.status),
        requestedAt: transfer.requestedAt ?? new Date().toISOString(),
        completedAt: transfer.completedAt,
        note: transfer.note
    };
}

function sanitizeOrder(order: Partial<AtlasPaperOrder>): AtlasPaperOrder {
    return {
        id: order.id ?? `order-${Date.now()}`,
        thesisId: order.thesisId,
        symbol: order.symbol ?? "UNKNOWN",
        company: order.company ?? order.symbol ?? "Unknown",
        countryCode: order.countryCode ?? "US",
        direction: order.direction === "Short" ? "Short" : "Long",
        orderType: order.orderType === "Limit" || order.orderType === "Stop" ? order.orderType : "Market",
        status: sanitizeOrderStatus(order.status),
        quantity: coerceNumber(order.quantity, 1),
        submittedAt: order.submittedAt ?? new Date().toISOString(),
        submittedSnapshotDate: order.submittedSnapshotDate ?? "",
        timeInForce: order.timeInForce === "GTC" ? "GTC" : "DAY",
        referencePrice: coerceNumber(order.referencePrice, 0),
        estimatedFillPrice: coerceNumber(order.estimatedFillPrice, 0),
        reservedBuyingPower: coerceNumber(order.reservedBuyingPower, 0),
        limitPrice: order.limitPrice,
        stopPrice: order.stopPrice,
        catalyst: order.catalyst,
        notes: order.notes,
        filledPrice: order.filledPrice,
        filledAt: order.filledAt,
        fillTradeId: order.fillTradeId,
        cancelledAt: order.cancelledAt,
        rejectionReason: order.rejectionReason
    };
}

function sanitizeActivity(entry: Partial<AtlasActivityItem>): AtlasActivityItem {
    return {
        id: entry.id ?? `activity-${Date.now()}`,
        type: entry.type === "order" || entry.type === "trade" || entry.type === "transfer" || entry.type === "journal" ? entry.type : "system",
        title: entry.title ?? "AtlasMarket activity",
        detail: entry.detail ?? "",
        createdAt: entry.createdAt ?? new Date().toISOString(),
        tone: entry.tone === "positive" || entry.tone === "negative" ? entry.tone : "neutral",
        symbol: entry.symbol,
        amount: typeof entry.amount === "number" ? entry.amount : undefined,
        relatedId: entry.relatedId
    };
}

function sanitizeOrderStatus(status: AtlasPaperOrder["status"] | undefined): AtlasOrderStatus {
    if (status === "Filled" || status === "Cancelled" || status === "Rejected") {
        return status;
    }

    return "Working";
}

function sanitizeTransferStatus(status: AtlasCashTransfer["status"] | undefined): AtlasTransferStatus {
    if (status === "Scheduled" || status === "Cancelled" || status === "Rejected") {
        return status;
    }

    return "Completed";
}

function getTradeMarkPrice(trade: AtlasPaperTrade, asset?: AtlasAssetResearch): number {
    if (asset) {
        return asset.price;
    }

    return trade.entryPrice;
}

function getOpenTradeMarketValue(trade: AtlasPaperTrade, markPrice: number): number {
    const grossPnl = trade.direction === "Long"
        ? (markPrice - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - markPrice) * trade.quantity;

    return roundMoney(trade.capitalReserved + grossPnl);
}

function getPositionGrossPnl(position: AtlasPosition): number {
    const perShare = position.direction === "Long"
        ? position.lastPrice - position.entryPrice
        : position.entryPrice - position.lastPrice;

    return roundMoney(perShare * position.quantity);
}

function getSuggestedQuantity(entryPrice: number, conviction: number): number {
    const notional = 9000 + (conviction * 55);
    return Math.max(1, Math.floor(notional / Math.max(entryPrice, 1)));
}

function shouldOrderTrigger(order: AtlasPaperOrder, marketPrice: number): boolean {
    if (order.orderType === "Market") {
        return true;
    }

    if (order.orderType === "Limit") {
        if (!order.limitPrice) {
            return false;
        }

        return order.direction === "Long"
            ? marketPrice <= order.limitPrice
            : marketPrice >= order.limitPrice;
    }

    if (!order.stopPrice) {
        return false;
    }

    return order.direction === "Long"
        ? marketPrice >= order.stopPrice
        : marketPrice <= order.stopPrice;
}

function getEstimatedOrderFillPrice(
    orderType: AtlasOrderType,
    direction: TradeDirection,
    marketPrice: number,
    limitPrice?: number,
    stopPrice?: number
): number {
    if (orderType === "Limit" && limitPrice) {
        return roundPrice(limitPrice);
    }

    if (orderType === "Stop" && stopPrice) {
        return roundPrice(stopPrice);
    }

    return roundPrice(marketPrice * getSlippageFactor(direction));
}

function getActualOrderFillPrice(order: AtlasPaperOrder, marketPrice: number): number {
    if (order.orderType === "Limit" && order.limitPrice) {
        return roundPrice(order.direction === "Long"
            ? Math.min(order.limitPrice, marketPrice)
            : Math.max(order.limitPrice, marketPrice));
    }

    return roundPrice(marketPrice * getSlippageFactor(order.direction));
}

function getTotalDebit(direction: TradeDirection, quantity: number, fillPrice: number): { capitalReserved: number; fee: number; totalDebit: number; } {
    const capitalReserved = getCapitalRequirement(direction, quantity, fillPrice);
    const fee = getFee(quantity * fillPrice);

    return {
        capitalReserved,
        fee,
        totalDebit: roundMoney(capitalReserved + fee)
    };
}

function getCapitalRequirement(direction: TradeDirection, quantity: number, fillPrice: number): number {
    const notional = quantity * fillPrice;

    if (direction === "Short") {
        return roundMoney(notional * 0.55);
    }

    return roundMoney(notional);
}

function getFee(notional: number): number {
    return roundMoney(Math.max(1, notional * 0.0006));
}

function getSlippageFactor(direction: TradeDirection): number {
    return direction === "Long" ? 1.0012 : 0.9988;
}

function getAvailableBuyingPower(workspace: AtlasWorkspaceState, ignoreOrderId?: string): number {
    const reserved = workspace.orders.reduce((sum, order) => {
        if (order.status !== "Working" || order.id === ignoreOrderId) {
            return sum;
        }

        return sum + order.reservedBuyingPower;
    }, 0);

    return roundMoney(Math.max(0, workspace.cashBalance - reserved));
}

function sanitizeStringArray(value: unknown, fallback: string[]): string[] {
    return Array.isArray(value) ? dedupeStrings(value.filter((item): item is string => typeof item === "string")) : fallback;
}

function getOrderSortDate(order: AtlasPaperOrder): string {
    return order.filledAt ?? order.cancelledAt ?? order.submittedAt;
}

function getTransferSortDate(transfer: AtlasCashTransfer): string {
    return transfer.completedAt ?? transfer.requestedAt;
}

function dedupeStrings(values: string[]): string[] {
    return [...new Set(values)];
}

function coerceNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function displayDirectionLabel(direction: AtlasTransferDirection): string {
    return direction === "Withdrawal" ? "Withdrawal" : "Deposit";
}

function formatMoney(value: number): string {
    return `$${Math.abs(value).toFixed(2)}`;
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

function roundPrice(value: number): number {
    return Math.round(value * 100) / 100;
}
