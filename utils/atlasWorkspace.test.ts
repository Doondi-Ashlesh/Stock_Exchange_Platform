import { expect, test } from "@jest/globals";

import { buildDraftFromAsset, defaultSnapshot, getAssetBySymbol } from "./atlasMarketData";
import {
    closeWorkspaceTrade,
    createInitialWorkspace,
    deriveWorkspaceViewWithCountries,
    hydrateWorkspaceState,
    openWorkspaceTrade,
    settleWorkspaceTransfer,
    submitWorkspaceOrder,
    submitWorkspaceTransfer,
    syncWorkspaceWithMarket
} from "./atlasWorkspace";
import { buildGlobalCoverageCountries } from "./atlasWorldCoverage";

test("workspace hydration falls back cleanly on invalid storage payloads", () => {
    const workspace = hydrateWorkspaceState("{not-json", defaultSnapshot);

    expect(workspace.openTrades.length).toBe(defaultSnapshot.positions.length);
    expect(workspace.theses.length).toBe(defaultSnapshot.recentIdeas.length);
});

test("paper trade lifecycle opens and closes positions against the workspace", () => {
    const workspace = createInitialWorkspace(defaultSnapshot);
    const asset = getAssetBySymbol(defaultSnapshot, "NVDA");

    expect(asset).toBeDefined();

    const draft = buildDraftFromAsset(defaultSnapshot, asset!);
    draft.plannedQuantity = 3;

    const opened = openWorkspaceTrade(workspace, defaultSnapshot, draft, asset!.countryCode, defaultSnapshot.label);

    expect(opened.trade).toBeDefined();
    expect(opened.workspace.openTrades.length).toBe(workspace.openTrades.length + 1);
    expect(opened.workspace.cashBalance).toBeLessThan(workspace.cashBalance);

    const closed = closeWorkspaceTrade(opened.workspace, defaultSnapshot, opened.trade!.id, defaultSnapshot.label, "Manual close");

    expect(closed.trade).toBeDefined();
    expect(closed.workspace.closedTrades[0].id).toBe(opened.trade!.id);
    expect(closed.workspace.openTrades.find((trade) => trade.id === opened.trade!.id)).toBeUndefined();
});

test("workspace view can derive a full-world research catalog from globe coverage countries", () => {
    const workspace = createInitialWorkspace(defaultSnapshot);
    const globeCountries = buildGlobalCoverageCountries(defaultSnapshot);
    const view = deriveWorkspaceViewWithCountries(defaultSnapshot, workspace, globeCountries);

    expect(view.assetCatalog.length).toBeGreaterThan(150);
    expect(view.watchlist.length).toBeGreaterThan(0);
});

test("paper cash transfers support instant funding and scheduled settlement", () => {
    const workspace = createInitialWorkspace(defaultSnapshot);
    const instantDeposit = submitWorkspaceTransfer(workspace, {
        direction: "Deposit",
        sourceId: "bank-atlas-instant",
        amount: 2500
    }, defaultSnapshot.label);

    expect(instantDeposit.transfer?.status).toBe("Completed");
    expect(instantDeposit.workspace.cashBalance).toBe(workspace.cashBalance + 2500);

    const scheduledDeposit = submitWorkspaceTransfer(workspace, {
        direction: "Deposit",
        sourceId: "bank-atlas-primary",
        amount: 5000
    }, defaultSnapshot.label);

    expect(scheduledDeposit.transfer?.status).toBe("Scheduled");

    const settled = settleWorkspaceTransfer(scheduledDeposit.workspace, scheduledDeposit.transfer!.id, "Later");

    expect(settled.transfer?.status).toBe("Completed");
    expect(settled.workspace.cashBalance).toBe(workspace.cashBalance + 5000);
});

test("working limit orders fill when the snapshot reaches the trigger price", () => {
    const workspace = createInitialWorkspace(defaultSnapshot);
    const asset = getAssetBySymbol(defaultSnapshot, "NVDA");

    expect(asset).toBeDefined();

    const submitted = submitWorkspaceOrder(workspace, defaultSnapshot, {
        symbol: asset!.symbol,
        company: asset!.name,
        countryCode: asset!.countryCode,
        direction: "Long",
        orderType: "Limit",
        quantity: 2,
        referencePrice: asset!.price,
        timeInForce: "GTC",
        limitPrice: asset!.price - 40,
        catalyst: asset!.catalyst
    }, defaultSnapshot.label);

    expect(submitted.order?.status).toBe("Working");

    const triggerPrice = asset!.price - 60;
    const triggeredSnapshot = {
        ...defaultSnapshot,
        countries: defaultSnapshot.countries.map((country) => {
            if (country.code !== asset!.countryCode) {
                return country;
            }

            return {
                ...country,
                movers: country.movers.map((mover) => mover.symbol === asset!.symbol ? { ...mover, price: triggerPrice } : mover),
                thesis: country.thesis.symbol === asset!.symbol ? { ...country.thesis, entryPrice: triggerPrice } : country.thesis
            };
        }),
        watchlist: defaultSnapshot.watchlist.map((item) => item.symbol === asset!.symbol ? { ...item, lastPrice: triggerPrice } : item),
        globalMovers: defaultSnapshot.globalMovers.map((mover) => mover.symbol === asset!.symbol ? { ...mover, price: triggerPrice } : mover)
    };

    const synced = syncWorkspaceWithMarket(submitted.workspace, triggeredSnapshot, "Later");
    const syncedOrder = synced.workspace.orders.find((order) => order.id === submitted.order?.id);

    expect(synced.workspace.openTrades.some((trade) => trade.symbol === asset!.symbol)).toBe(true);
    expect(syncedOrder?.status).toBe("Filled");
});
