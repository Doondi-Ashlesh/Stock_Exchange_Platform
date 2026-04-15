import { useEffect, useMemo, useState } from "react";
import { Box, Button, Divider, Heading, HStack, Input, Pressable, SimpleGrid, Stack, Text, TextArea, VStack } from "native-base";

import {
    AtlasAssetResearch,
    AtlasOrderType,
    AtlasSnapshot,
    AtlasTimeInForce,
    ThesisDraft,
    TradeDirection
} from "../types/atlasmarket";
import { displayCurrency, displaySignedCurrency, displaySignedPercent } from "../utils/formatters";
import { AtlasLiveFeedState, getAtlasMarketDataAccessModeLabel } from "../utils/atlasLiveData";
import {
    AtlasStripeStatus,
    getAtlasStripeLocalStatus,
    getAtlasStripeStatus,
    openAtlasStripeCheckout,
    openAtlasStripeCustomerPortal,
    openAtlasStripeFundingSession
} from "../utils/atlasPayments";
import { AtlasOrderRequest, AtlasTransferRequest, AtlasWorkspaceView } from "../utils/atlasWorkspace";
import { styles } from "../utils/styles";

interface AtlasAccountCenterProps {
    snapshot: AtlasSnapshot;
    liveFeed: AtlasLiveFeedState;
    workspaceView: AtlasWorkspaceView;
    draft: ThesisDraft;
    selectedCountryCode: string;
    selectedAsset?: AtlasAssetResearch;
    onSubmitTransfer: (request: AtlasTransferRequest) => void;
    onSettleTransfer: (transferId: string) => void;
    onSubmitOrder: (request: AtlasOrderRequest) => void;
    onCancelOrder: (orderId: string) => void;
    onSelectAsset: (asset: AtlasAssetResearch) => void;
}

export function AtlasAccountCenter({
    snapshot,
    liveFeed,
    workspaceView,
    draft,
    selectedCountryCode,
    selectedAsset,
    onSubmitTransfer,
    onSettleTransfer,
    onSubmitOrder,
    onCancelOrder,
    onSelectAsset
}: AtlasAccountCenterProps) {
    const [transferDirection, setTransferDirection] = useState<AtlasTransferRequest["direction"]>("Deposit");
    const [transferSourceId, setTransferSourceId] = useState(workspaceView.fundingSources[0]?.id ?? "");
    const [transferAmount, setTransferAmount] = useState("5000");
    const [transferNote, setTransferNote] = useState("Top up paper buying power");

    const [orderDirection, setOrderDirection] = useState<TradeDirection>(draft.direction);
    const [orderType, setOrderType] = useState<AtlasOrderType>("Market");
    const [timeInForce, setTimeInForce] = useState<AtlasTimeInForce>("DAY");
    const [orderQuantity, setOrderQuantity] = useState(draft.plannedQuantity.toString());
    const [limitPrice, setLimitPrice] = useState(draft.entryPrice.toFixed(2));
    const [stopPrice, setStopPrice] = useState(draft.entryPrice.toFixed(2));
    const [orderNotes, setOrderNotes] = useState(draft.riskNotes);
    const [stripeStatus, setStripeStatus] = useState<AtlasStripeStatus>(() => getAtlasStripeLocalStatus());
    const [stripeAction, setStripeAction] = useState<"checkout" | "portal" | "funding" | null>(null);
    const [stripeMessage, setStripeMessage] = useState("");

    const referencePrice = selectedAsset?.price ?? draft.entryPrice;
    const selectedSource = workspaceView.fundingSources.find((item) => item.id === transferSourceId) ?? workspaceView.fundingSources[0];
    const parsedQuantity = Math.max(1, Math.floor(Number(orderQuantity) || 1));
    const marketAccessModeLabel = getAtlasMarketDataAccessModeLabel();
    const marketTone = liveFeed.status === "live"
        ? styles.atlas.positive
        : liveFeed.status === "error"
            ? styles.atlas.negative
            : styles.atlas.warning;
    const stripeTone = stripeStatus.ready
        ? styles.atlas.positive
        : stripeStatus.enabled
            ? styles.atlas.warning
            : styles.atlas.muted;
    const stripeHeading = stripeStatus.mode === "billing"
        ? "Hosted billing"
        : stripeStatus.mode === "funding"
            ? "Funding sessions"
            : "Disabled";

    useEffect(() => {
        if (!selectedSource && workspaceView.fundingSources[0]) {
            setTransferSourceId(workspaceView.fundingSources[0].id);
        }
    }, [selectedSource, workspaceView.fundingSources]);

    useEffect(() => {
        const basePrice = selectedAsset?.price ?? draft.entryPrice;

        setOrderDirection(draft.direction);
        setOrderQuantity(draft.plannedQuantity.toString());
        setLimitPrice(basePrice.toFixed(2));
        setStopPrice(basePrice.toFixed(2));
        setOrderNotes(draft.riskNotes);
    }, [draft.direction, draft.entryPrice, draft.plannedQuantity, draft.riskNotes, selectedAsset?.price, selectedAsset?.symbol]);

    useEffect(() => {
        let active = true;

        async function loadStripeStatus() {
            const nextStatus = await getAtlasStripeStatus();

            if (active) {
                setStripeStatus(nextStatus);
            }
        }

        loadStripeStatus();

        return () => {
            active = false;
        };
    }, []);

    const estimatedFillPrice = useMemo(() => {
        if (orderType === "Limit") {
            return Number(limitPrice) || referencePrice;
        }

        if (orderType === "Stop") {
            return Number(stopPrice) || referencePrice;
        }

        return roundPrice(referencePrice * (orderDirection === "Long" ? 1.0012 : 0.9988));
    }, [limitPrice, orderDirection, orderType, referencePrice, stopPrice]);

    const estimatedNotional = roundPrice(parsedQuantity * estimatedFillPrice);
    const estimatedReserve = roundPrice(orderDirection === "Short" ? estimatedNotional * 0.55 : estimatedNotional);
    const estimatedFee = roundPrice(Math.max(1, estimatedNotional * 0.0006));

    function handleSubmitTransfer() {
        onSubmitTransfer({
            direction: transferDirection,
            sourceId: transferSourceId,
            amount: Number(transferAmount),
            note: transferNote.trim() || undefined
        });
    }

    function handleSubmitOrder() {
        onSubmitOrder({
            symbol: selectedAsset?.symbol ?? draft.symbol,
            company: selectedAsset?.name ?? draft.company,
            countryCode: selectedAsset?.countryCode ?? selectedCountryCode,
            direction: orderDirection,
            orderType,
            quantity: parsedQuantity,
            referencePrice,
            timeInForce,
            limitPrice: orderType === "Limit" ? Number(limitPrice) : undefined,
            stopPrice: orderType === "Stop" ? Number(stopPrice) : undefined,
            catalyst: selectedAsset?.catalyst ?? draft.catalyst,
            notes: orderNotes.trim() || undefined
        });
    }

    async function handleStripeAction(action: "checkout" | "portal" | "funding") {
        setStripeAction(action);

        const result = action === "checkout"
            ? await openAtlasStripeCheckout()
            : action === "portal"
                ? await openAtlasStripeCustomerPortal()
                : await openAtlasStripeFundingSession();

        setStripeMessage(result.message);
        setStripeStatus(await getAtlasStripeStatus());
        setStripeAction(null);
    }

    return (
        <VStack space={5}>
            <Surface bg={styles.atlas.hero} borderColor={styles.atlas.borderStrong}>
                <VStack space={4}>
                    <Text color={styles.atlas.glow} fontSize="xs" fontWeight="700" letterSpacing="xl">LIVE PLATFORM RAILS</Text>
                    <Stack direction={{ base: "column", xl: "row" }} space={4}>
                        <Box flex={1} px={1}>
                            <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">MARKET DATA ACCESS</Text>
                            <Heading color={styles.atlas.text} size="lg" mt={1}>{marketAccessModeLabel}</Heading>
                            <Text color={styles.atlas.muted} fontSize="sm" mt={2}>{liveFeed.message}</Text>
                            <HStack flexWrap="wrap" mt={3}>
                                <Pill label={liveFeed.status.toUpperCase()} tone={marketTone} />
                                <Pill label={marketAccessModeLabel.toUpperCase()} tone={styles.atlas.focusSecondary} />
                                {liveFeed.updatedAt ? <Pill label={`UPDATED ${formatLiveTimestamp(liveFeed.updatedAt)}`} tone={styles.atlas.muted} /> : null}
                            </HStack>
                        </Box>

                        <Box flex={1} px={1}>
                            <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">STRIPE PLATFORM FLOW</Text>
                            <Heading color={styles.atlas.text} size="lg" mt={1}>{stripeHeading}</Heading>
                            <Text color={styles.atlas.muted} fontSize="sm" mt={2}>{stripeMessage || stripeStatus.message}</Text>
                            <HStack flexWrap="wrap" mt={3}>
                                <Pill label={stripeStatus.ready ? "READY" : stripeStatus.enabled ? "SETUP NEEDED" : "DISABLED"} tone={stripeTone} />
                                {stripeStatus.checkoutReady ? <Pill label="CHECKOUT" tone={styles.atlas.focusPrimary} /> : null}
                                {stripeStatus.customerPortalReady ? <Pill label="PORTAL" tone={styles.atlas.focusSecondary} /> : null}
                                {stripeStatus.fundingSessionReady ? <Pill label="FUNDING" tone={styles.atlas.focusPrimary} /> : null}
                            </HStack>
                            <HStack flexWrap="wrap" mt={3}>
                                {stripeStatus.checkoutReady ? (
                                    <Button mr={2} mb={2} bg={styles.atlas.focusPrimary} _text={{ color: styles.atlas.ink, fontWeight: "700" }} isDisabled={stripeAction !== null} onPress={() => { void handleStripeAction("checkout"); }}>
                                        {stripeAction === "checkout" ? "Opening..." : "Start Checkout"}
                                    </Button>
                                ) : null}
                                {stripeStatus.fundingSessionReady ? (
                                    <Button mr={2} mb={2} bg={styles.atlas.focusPrimary} _text={{ color: styles.atlas.ink, fontWeight: "700" }} isDisabled={stripeAction !== null} onPress={() => { void handleStripeAction("funding"); }}>
                                        {stripeAction === "funding" ? "Opening..." : "Launch Funding"}
                                    </Button>
                                ) : null}
                                {stripeStatus.customerPortalReady ? (
                                    <Button mr={2} mb={2} variant="outline" borderColor={styles.atlas.focusPrimary} _text={{ color: styles.atlas.focusPrimary }} isDisabled={stripeAction !== null} onPress={() => { void handleStripeAction("portal"); }}>
                                        {stripeAction === "portal" ? "Opening..." : "Billing Portal"}
                                    </Button>
                                ) : null}
                            </HStack>
                        </Box>
                    </Stack>
                    <Text color={styles.atlas.muted} fontSize="xs">
                        Production note: keep market-data provider credentials and Stripe secret operations on the server. The Expo client should only launch hosted sessions and consume signed platform API responses.
                    </Text>
                </VStack>
            </Surface>

            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Surface flex={{ xl: 1.2 }} bg={styles.atlas.hero} borderColor={styles.atlas.borderStrong}>
                    <VStack space={4}>
                        <Text color={styles.atlas.glow} fontSize="xs" fontWeight="700" letterSpacing="xl">PAPER BROKERAGE CENTER</Text>
                        <Heading color={styles.atlas.text} size="2xl" fontFamily="serif">
                            Funding, routing, and order workflow in one paper-money console.
                        </Heading>
                        <Text color={styles.atlas.muted} fontSize="sm">
                            Move simulated cash, stage market or conditional orders, and monitor working exposure against the active {snapshot.mode.toLowerCase()} state.
                        </Text>
                        <HStack flexWrap="wrap">
                            <Pill label={workspaceView.account.paperMoneyOnly ? "Paper Only" : "Live"} tone={styles.atlas.focusPrimary} />
                            <Pill label={workspaceView.account.kycStatus} tone={workspaceView.account.kycStatus === "Approved" ? styles.atlas.positive : styles.atlas.warning} />
                            <Pill label={workspaceView.account.accountType} tone={styles.atlas.focusSecondary} />
                            <Pill label={`${workspaceView.workingOrders.length} working orders`} tone={styles.atlas.warning} />
                        </HStack>
                        <SimpleGrid minChildWidth={140} space={3}>
                            <StatTile label="Cash" value={displayCurrency(workspaceView.cashBalance)} tone={styles.atlas.text} />
                            <StatTile label="Available BP" value={displayCurrency(workspaceView.availableBuyingPower)} tone={styles.atlas.focusPrimary} />
                            <StatTile label="Reserved" value={displayCurrency(workspaceView.reservedBuyingPower)} tone={styles.atlas.warning} />
                            <StatTile label="Pending Transfers" value={displaySignedCurrency(workspaceView.pendingTransferAmount, 2, 2)} tone={workspaceView.pendingTransferAmount >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                        </SimpleGrid>
                    </VStack>
                </Surface>

                <Surface flex={{ xl: 0.8 }}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">FOCUS ASSET</Text>
                        <Heading color={styles.atlas.text} size="lg">{selectedAsset?.symbol ?? draft.symbol}</Heading>
                        <Text color={styles.atlas.text}>{selectedAsset?.name ?? draft.company}</Text>
                        <Text color={styles.atlas.muted} fontSize="sm">{selectedAsset?.summary ?? draft.rationale}</Text>
                        <SimpleGrid columns={2} space={3}>
                            <StatTile label="Price" value={displayCurrency(referencePrice, 2, 2)} tone={styles.atlas.text} />
                            <StatTile label="Daily Move" value={selectedAsset ? displaySignedPercent(selectedAsset.change, 1, 1) : "--"} tone={selectedAsset && selectedAsset.change >= 0 ? styles.atlas.positive : styles.atlas.negative} />
                            <StatTile label="Draft Qty" value={draft.plannedQuantity.toString()} tone={styles.atlas.focusSecondary} />
                            <StatTile label="Risk / Reward" value={`${getRiskReward(draft).toFixed(2)}x`} tone={styles.atlas.warning} />
                        </SimpleGrid>
                    </VStack>
                </Surface>
            </Stack>

            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Surface flex={1}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">FUNDING RAILS</Text>
                        <Field label="Direction">
                            <HStack flexWrap="wrap">
                                {(["Deposit", "Withdrawal"] as const).map((value) => (
                                    <ToggleButton
                                        key={value}
                                        label={value}
                                        active={transferDirection === value}
                                        onPress={() => setTransferDirection(value)}
                                    />
                                ))}
                            </HStack>
                        </Field>
                        <Field label="Source">
                            <HStack flexWrap="wrap">
                                {workspaceView.fundingSources.map((source) => (
                                    <ToggleButton
                                        key={source.id}
                                        label={`${source.label} | ${source.transferSpeed}`}
                                        active={transferSourceId === source.id}
                                        onPress={() => setTransferSourceId(source.id)}
                                    />
                                ))}
                            </HStack>
                        </Field>
                        <Stack direction={{ base: "column", md: "row" }} space={3}>
                            <Field label="Amount"><Input value={transferAmount} onChangeText={setTransferAmount} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                            <Field label="Note"><Input value={transferNote} onChangeText={setTransferNote} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                        </Stack>
                        <Text color={styles.atlas.muted} fontSize="xs">
                            {selectedSource ? `${selectedSource.label} settles ${selectedSource.transferSpeed.toLowerCase()} with a ${displayCurrency(selectedSource.dailyLimit)} daily cap.` : "Select a funding source."}
                        </Text>
                        <Button bg={styles.atlas.focusPrimary} _text={{ color: styles.atlas.ink, fontWeight: "700" }} onPress={handleSubmitTransfer}>
                            Submit {transferDirection}
                        </Button>

                        <Divider bg={styles.atlas.border} />

                        <Text color={styles.atlas.text} fontWeight="700">Transfer Ledger</Text>
                        {workspaceView.transfers.slice(0, 5).map((transfer) => (
                            <Box key={transfer.id} px={4} py={4} rounded="2xl" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                <HStack justifyContent="space-between" alignItems="flex-start" mb={2}>
                                    <VStack flex={1} mr={3}>
                                        <Text color={styles.atlas.text} fontWeight="700">{transfer.sourceLabel}</Text>
                                        <Text color={styles.atlas.muted} fontSize="xs">{transfer.requestedAt}</Text>
                                    </VStack>
                                    <Text color={transfer.direction === "Deposit" ? styles.atlas.positive : styles.atlas.warning} fontWeight="700">
                                        {transfer.direction === "Deposit" ? "+" : "-"}{displayCurrency(transfer.amount, 2, 2)}
                                    </Text>
                                </HStack>
                                <HStack justifyContent="space-between" alignItems="center">
                                    <Text color={styles.atlas.muted} fontSize="xs">{transfer.status}{transfer.note ? ` | ${transfer.note}` : ""}</Text>
                                    {transfer.status === "Scheduled" ? (
                                        <Button size="xs" variant="outline" borderColor={styles.atlas.focusPrimary} _text={{ color: styles.atlas.focusPrimary }} onPress={() => onSettleTransfer(transfer.id)}>
                                            Settle Now
                                        </Button>
                                    ) : null}
                                </HStack>
                            </Box>
                        ))}
                    </VStack>
                </Surface>

                <Surface flex={1}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">ORDER TICKET</Text>
                        <Stack direction={{ base: "column", md: "row" }} space={3}>
                            <Field label="Symbol"><Input value={selectedAsset?.symbol ?? draft.symbol} isReadOnly bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                            <Field label="Reference"><Input value={referencePrice.toFixed(2)} isReadOnly bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                            <Field label="Quantity"><Input value={orderQuantity} onChangeText={setOrderQuantity} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                        </Stack>
                        <Field label="Side">
                            <HStack flexWrap="wrap">
                                {(["Long", "Short"] as TradeDirection[]).map((value) => (
                                    <ToggleButton key={value} label={value} active={orderDirection === value} onPress={() => setOrderDirection(value)} />
                                ))}
                            </HStack>
                        </Field>
                        <Field label="Order Type">
                            <HStack flexWrap="wrap">
                                {(["Market", "Limit", "Stop"] as AtlasOrderType[]).map((value) => (
                                    <ToggleButton key={value} label={value} active={orderType === value} onPress={() => setOrderType(value)} />
                                ))}
                            </HStack>
                        </Field>
                        <Field label="Time In Force">
                            <HStack flexWrap="wrap">
                                {(["DAY", "GTC"] as AtlasTimeInForce[]).map((value) => (
                                    <ToggleButton key={value} label={value} active={timeInForce === value} onPress={() => setTimeInForce(value)} />
                                ))}
                            </HStack>
                        </Field>
                        {orderType === "Limit" ? (
                            <Field label="Limit Price"><Input value={limitPrice} onChangeText={setLimitPrice} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                        ) : null}
                        {orderType === "Stop" ? (
                            <Field label="Stop Price"><Input value={stopPrice} onChangeText={setStopPrice} keyboardType="numeric" bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} /></Field>
                        ) : null}
                        <Field label="Desk Notes">
                            <TextArea value={orderNotes} onChangeText={setOrderNotes} bg={styles.atlas.backgroundAlt} borderColor={styles.atlas.border} color={styles.atlas.text} autoCompleteType={undefined as any} />
                        </Field>
                        <SimpleGrid columns={3} space={3}>
                            <StatTile label="Est. Fill" value={displayCurrency(estimatedFillPrice, 2, 2)} tone={styles.atlas.text} />
                            <StatTile label="Reserve" value={displayCurrency(estimatedReserve, 2, 2)} tone={styles.atlas.warning} />
                            <StatTile label="Fee" value={displayCurrency(estimatedFee, 2, 2)} tone={styles.atlas.muted} />
                        </SimpleGrid>
                        <Button bg={styles.atlas.focusPrimary} _text={{ color: styles.atlas.ink, fontWeight: "700" }} onPress={handleSubmitOrder}>
                            Submit Paper Order
                        </Button>
                    </VStack>
                </Surface>
            </Stack>

            <Stack direction={{ base: "column", xl: "row" }} space={4}>
                <Surface flex={1}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">WORKING BLOTTER</Text>
                        {workspaceView.workingOrders.length > 0 ? workspaceView.workingOrders.map((order) => (
                            <Box key={order.id} px={4} py={4} rounded="2xl" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                <HStack justifyContent="space-between" alignItems="flex-start" mb={2}>
                                    <VStack flex={1} mr={3}>
                                        <Text color={styles.atlas.text} fontWeight="700">{order.symbol} | {order.orderType}</Text>
                                        <Text color={styles.atlas.muted} fontSize="xs">{order.direction} | {order.quantity} shares | {order.timeInForce}</Text>
                                    </VStack>
                                    <Text color={styles.atlas.warning} fontWeight="700">{displayCurrency(order.reservedBuyingPower, 2, 2)}</Text>
                                </HStack>
                                <Text color={styles.atlas.muted} fontSize="xs">
                                    Ref {displayCurrency(order.referencePrice, 2, 2)}
                                    {order.limitPrice ? ` | Limit ${displayCurrency(order.limitPrice, 2, 2)}` : ""}
                                    {order.stopPrice ? ` | Stop ${displayCurrency(order.stopPrice, 2, 2)}` : ""}
                                </Text>
                                <HStack mt={3}>
                                    <Button mr={2} size="xs" variant="outline" borderColor={styles.atlas.focusPrimary} _text={{ color: styles.atlas.focusPrimary }} onPress={() => {
                                        const asset = workspaceView.assetCatalog.find((item) => item.symbol === order.symbol);
                                        if (asset) {
                                            onSelectAsset(asset);
                                        }
                                    }}>
                                        Focus
                                    </Button>
                                    <Button size="xs" variant="outline" borderColor={styles.atlas.negative} _text={{ color: styles.atlas.negative }} onPress={() => onCancelOrder(order.id)}>
                                        Cancel
                                    </Button>
                                </HStack>
                            </Box>
                        )) : <Empty label="Working orders will appear here after you route a limit or stop ticket." />}
                    </VStack>
                </Surface>

                <Surface flex={1}>
                    <VStack space={4}>
                        <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">ACCOUNT ACTIVITY</Text>
                        {workspaceView.activity.slice(0, 8).map((activity) => (
                            <Box key={activity.id} px={4} py={4} rounded="2xl" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                <HStack justifyContent="space-between" alignItems="flex-start" mb={2}>
                                    <VStack flex={1} mr={3}>
                                        <Text color={styles.atlas.text} fontWeight="700">{activity.title}</Text>
                                        <Text color={styles.atlas.muted} fontSize="xs">{activity.createdAt}{activity.symbol ? ` | ${activity.symbol}` : ""}</Text>
                                    </VStack>
                                    <Text color={toneColor(activity.amount)} fontWeight="700">
                                        {typeof activity.amount === "number" ? displaySignedCurrency(activity.amount, 2, 2) : activity.type.toUpperCase()}
                                    </Text>
                                </HStack>
                                <Text color={styles.atlas.muted} fontSize="sm">{activity.detail}</Text>
                            </Box>
                        ))}
                    </VStack>
                </Surface>
            </Stack>

            <Surface>
                <VStack space={4}>
                    <Text color={styles.atlas.focusPrimary} fontSize="xs" fontWeight="700">ORDER HISTORY</Text>
                    {workspaceView.orderHistory.length > 0 ? (
                        <SimpleGrid minChildWidth={250} space={3}>
                            {workspaceView.orderHistory.slice(0, 8).map((order) => (
                                <Pressable key={order.id} onPress={() => {
                                    const asset = workspaceView.assetCatalog.find((item) => item.symbol === order.symbol);
                                    if (asset) {
                                        onSelectAsset(asset);
                                    }
                                }}>
                                    {({ isHovered }: { isHovered: boolean }) => (
                                        <Box px={4} py={4} rounded="2xl" bg={isHovered ? styles.atlas.panelRaised : styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
                                            <Text color={styles.atlas.text} fontWeight="700">{order.symbol} | {order.status}</Text>
                                            <Text color={styles.atlas.muted} fontSize="xs">{order.orderType} | {order.direction} | {order.submittedAt}</Text>
                                            <Text color={styles.atlas.muted} mt={2} fontSize="xs">
                                                {order.filledPrice ? `Filled ${displayCurrency(order.filledPrice, 2, 2)}` : order.rejectionReason ?? "No fill yet"}
                                            </Text>
                                        </Box>
                                    )}
                                </Pressable>
                            ))}
                        </SimpleGrid>
                    ) : <Empty label="Filled, cancelled, and rejected orders will be archived here." />}
                </VStack>
            </Surface>
        </VStack>
    );
}

function Surface({ children, bg, borderColor, ...props }: { children: React.ReactNode; bg?: string; borderColor?: string; [key: string]: any }) {
    return (
        <Box bg={bg ?? styles.atlas.glass} borderWidth={1} borderColor={borderColor ?? styles.atlas.border} rounded="3xl" p={4} overflow="hidden" {...props}>
            {children}
        </Box>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <VStack flex={1}>
            <Text color={styles.atlas.muted} fontSize="xs" mb={1}>{label}</Text>
            {children}
        </VStack>
    );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: string }) {
    return (
        <Box px={3} py={3} rounded="2xl" bg={styles.atlas.panel} borderWidth={1} borderColor={styles.atlas.glassEdge}>
            <Text color={styles.atlas.muted} fontSize="xs">{label}</Text>
            <Text color={tone} fontWeight="700">{value}</Text>
        </Box>
    );
}

function Pill({ label, tone }: { label: string; tone: string }) {
    return (
        <Box mr={2} mb={2} px={3} py={1.5} rounded="full" bg={styles.atlas.panel} borderWidth={1} borderColor={styles.atlas.glassEdge}>
            <Text color={tone} fontSize="xs" fontWeight="700">{label}</Text>
        </Box>
    );
}

function ToggleButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
    return (
        <Button
            mr={2}
            mb={2}
            size="sm"
            variant={active ? "solid" : "outline"}
            bg={active ? styles.atlas.focusPrimary : "transparent"}
            borderColor={active ? styles.atlas.focusPrimary : styles.atlas.border}
            _text={{ color: active ? styles.atlas.ink : styles.atlas.text }}
            onPress={onPress}
        >
            {label}
        </Button>
    );
}

function Empty({ label }: { label: string }) {
    return (
        <Box px={4} py={6} rounded="2xl" bg={styles.atlas.backgroundAlt} borderWidth={1} borderColor={styles.atlas.border}>
            <Text color={styles.atlas.muted} fontSize="sm">{label}</Text>
        </Box>
    );
}

function toneColor(value?: number): string {
    if (typeof value !== "number") {
        return styles.atlas.muted;
    }

    return value >= 0 ? styles.atlas.positive : styles.atlas.negative;
}

function getRiskReward(draft: ThesisDraft): number {
    const reward = Math.abs(draft.targetPrice - draft.entryPrice);
    const risk = Math.abs(draft.entryPrice - draft.stopLoss);
    return risk === 0 ? 0 : reward / risk;
}

function roundPrice(value: number): number {
    return Math.round(value * 100) / 100;
}

function formatLiveTimestamp(value: string): string {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return parsed.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit"
    });
}
