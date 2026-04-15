import { AtlasAssetResearch, AtlasCountry, AtlasMetricDescriptor, AtlasSnapshot, MarketMetricKey, ThesisDraft } from "../types/atlasmarket";

type CountryBase = Omit<AtlasCountry, "metrics" | "benchmarkSeries">;
type CountryOverlay = Pick<AtlasCountry, "metrics" | "benchmarkSeries"> & Partial<Pick<AtlasCountry, "summary">>;

export const metricDescriptors: AtlasMetricDescriptor[] = [
    { key: "dailyReturn", label: "Daily Market Return", shortLabel: "1D", description: "Track where risk is flowing right now.", lowerLabel: "Lagging", upperLabel: "Leading", format: "percent" },
    { key: "weeklyReturn", label: "Weekly Market Return", shortLabel: "1W", description: "See which countries have follow-through over the week.", lowerLabel: "Weak week", upperLabel: "Strong week", format: "percent" },
    { key: "volatility", label: "Volatility / Risk", shortLabel: "Vol", description: "Highlight where price movement is expanding.", lowerLabel: "Calm", upperLabel: "Unstable", format: "risk" },
    { key: "sectorStrength", label: "Sector Strength", shortLabel: "Sectors", description: "Compare the breadth of leadership under each market.", lowerLabel: "Narrow", upperLabel: "Broad", format: "score" },
    { key: "macroSentiment", label: "Macro Sentiment", shortLabel: "Macro", description: "Capture policy, growth, and positioning tone.", lowerLabel: "Defensive", upperLabel: "Constructive", format: "score" },
    { key: "currencyMovement", label: "Currency Movement", shortLabel: "FX", description: "Spot whether FX is helping or hurting flows.", lowerLabel: "Weaker FX", upperLabel: "Stronger FX", format: "percent" },
    { key: "relativePerformance", label: "Relative Performance", shortLabel: "Rel", description: "Measure country performance against the global tape.", lowerLabel: "Underperforming", upperLabel: "Outperforming", format: "percent" }
];

const baseCountries: CountryBase[] = [
    {
        code: "US",
        name: "United States",
        region: "North America",
        benchmark: "S&P 500",
        currency: "USD",
        summary: "AI infrastructure and software continue to dominate the tape while falling yields support growth multiples.",
        position: { x: 80, y: 84, labelOffsetX: -16, labelOffsetY: -14, longitude: -98, latitude: 38 },
        topSectors: [{ name: "Semiconductors", change: 3.8 }, { name: "Software", change: 2.4 }, { name: "Financials", change: 1.6 }],
        movers: [
            { symbol: "NVDA", name: "NVIDIA", countryCode: "US", sector: "Semiconductors", price: 948.32, change: 4.8 },
            { symbol: "MSFT", name: "Microsoft", countryCode: "US", sector: "Software", price: 428.55, change: 2.1 }
        ],
        headlines: [
            { time: "09:20 ET", headline: "Megacap earnings guidance keeps risk appetite firm.", catalyst: "Earnings", tone: "positive" },
            { time: "11:05 ET", headline: "Treasury yields cool and improve duration sentiment.", catalyst: "Rates", tone: "positive" }
        ],
        macroStats: [{ label: "Yield Spread", value: "-34 bps" }, { label: "Dollar Index", value: "102.4" }, { label: "Breadth", value: "61% advancers" }],
        thesis: {
            symbol: "NVDA",
            company: "NVIDIA",
            direction: "Long",
            entryPrice: 948.32,
            stopLoss: 905,
            targetPrice: 1028,
            conviction: 84,
            timeHorizon: "2-6 weeks",
            catalyst: "Supply checks and hyperscaler capex continue to improve.",
            rationale: "US semiconductor leadership is still driving index-level strength and the setup remains momentum-supported.",
            riskNotes: "Crowded positioning and a hawkish rates surprise could compress multiples quickly."
        }
    },
    {
        code: "BR",
        name: "Brazil",
        region: "Latin America",
        benchmark: "Bovespa",
        currency: "BRL",
        summary: "Iron ore, banks, and domestic cyclicals are responding well to a softer dollar and improved commodity sentiment.",
        position: { x: 122, y: 160, labelOffsetX: -10, labelOffsetY: 20, longitude: -51, latitude: -14 },
        topSectors: [{ name: "Materials", change: 2.7 }, { name: "Banks", change: 1.9 }, { name: "Utilities", change: 0.8 }],
        movers: [
            { symbol: "VALE3", name: "Vale", countryCode: "BR", sector: "Materials", price: 14.6, change: 3.4 },
            { symbol: "ITUB4", name: "Itau Unibanco", countryCode: "BR", sector: "Banks", price: 6.22, change: 1.8 }
        ],
        headlines: [
            { time: "10:40 BRT", headline: "Iron ore futures stabilize and improve miners' tone.", catalyst: "Commodities", tone: "positive" },
            { time: "13:00 BRT", headline: "Rate-cut odds lift domestic cyclicals and banks.", catalyst: "Policy", tone: "positive" }
        ],
        macroStats: [{ label: "Selic", value: "10.50%" }, { label: "BRL", value: "5.01 / USD" }, { label: "Terms of Trade", value: "Improving" }],
        thesis: {
            symbol: "VALE3",
            company: "Vale",
            direction: "Long",
            entryPrice: 14.6,
            stopLoss: 13.9,
            targetPrice: 15.9,
            conviction: 72,
            timeHorizon: "1-3 weeks",
            catalyst: "Commodity stabilization and renewed China stimulus expectations.",
            rationale: "Brazilian materials are regaining leadership as macro pressure eases and miners reclaim short-term trend support.",
            riskNotes: "China demand disappointment would reverse the commodity beta quickly."
        }
    },
    {
        code: "DE",
        name: "Germany",
        region: "Europe",
        benchmark: "DAX",
        currency: "EUR",
        summary: "Germany is a clean read on cyclicals, exporters, and rate sensitivity.",
        position: { x: 208, y: 78, labelOffsetX: 14, labelOffsetY: -10, longitude: 10, latitude: 51 },
        topSectors: [{ name: "Industrials", change: 1.8 }, { name: "Autos", change: 1.2 }, { name: "Software", change: 0.9 }],
        movers: [
            { symbol: "SAP", name: "SAP", countryCode: "DE", sector: "Software", price: 207.44, change: 2.6 },
            { symbol: "SIE", name: "Siemens", countryCode: "DE", sector: "Industrials", price: 183.1, change: 1.4 }
        ],
        headlines: [
            { time: "09:30 CET", headline: "Factory order expectations improve, but autos remain cautious.", catalyst: "Growth", tone: "neutral" },
            { time: "13:00 CET", headline: "Bund yields ease and support duration-sensitive equities.", catalyst: "Rates", tone: "positive" }
        ],
        macroStats: [{ label: "10Y Bund", value: "2.36%" }, { label: "EUR", value: "1.09 / USD" }, { label: "IFO Mood", value: "Recovering" }],
        thesis: {
            symbol: "SAP",
            company: "SAP",
            direction: "Long",
            entryPrice: 207.44,
            stopLoss: 198.6,
            targetPrice: 222,
            conviction: 67,
            timeHorizon: "3-8 weeks",
            catalyst: "Enterprise software resilience and improving European breadth.",
            rationale: "SAP offers growth exposure without leaning fully on industrial cyclicals.",
            riskNotes: "If European PMIs stall, the region's multiple expansion can reverse."
        }
    },
    {
        code: "IN",
        name: "India",
        region: "Asia",
        benchmark: "Nifty 50",
        currency: "INR",
        summary: "India pairs domestic growth leadership with strong local participation.",
        position: { x: 300, y: 112, labelOffsetX: 14, labelOffsetY: -14, longitude: 78, latitude: 22 },
        topSectors: [{ name: "Financials", change: 2.4 }, { name: "IT Services", change: 1.8 }, { name: "Capital Goods", change: 1.6 }],
        movers: [
            { symbol: "HDFCBANK", name: "HDFC Bank", countryCode: "IN", sector: "Financials", price: 19.48, change: 1.9 },
            { symbol: "INFY", name: "Infosys", countryCode: "IN", sector: "IT Services", price: 18.54, change: 1.5 }
        ],
        headlines: [
            { time: "12:20 IST", headline: "Domestic SIP flows keep pullbacks shallow.", catalyst: "Local flows", tone: "positive" },
            { time: "14:00 IST", headline: "Capital goods orders reinforce infrastructure spend narrative.", catalyst: "Capex", tone: "positive" }
        ],
        macroStats: [{ label: "CPI", value: "5.1%" }, { label: "INR", value: "82.7 / USD" }, { label: "Retail Flows", value: "Strong" }],
        thesis: {
            symbol: "HDFCBANK",
            company: "HDFC Bank",
            direction: "Long",
            entryPrice: 19.48,
            stopLoss: 18.72,
            targetPrice: 21.02,
            conviction: 79,
            timeHorizon: "3-6 weeks",
            catalyst: "Domestic flow support and improving bank breadth.",
            rationale: "Indian financials remain one of the cleanest expressions of durable local participation.",
            riskNotes: "Positioning is rich and a global risk-off move could still hit valuation multiples."
        }
    },
    {
        code: "JP",
        name: "Japan",
        region: "Asia",
        benchmark: "Nikkei 225",
        currency: "JPY",
        summary: "Japan blends exporter sensitivity, yen volatility, and corporate reform.",
        position: { x: 364, y: 88, labelOffsetX: 12, labelOffsetY: -16, longitude: 138, latitude: 36 },
        topSectors: [{ name: "Automation", change: 2.5 }, { name: "Semicap", change: 2.2 }, { name: "Financials", change: 1.1 }],
        movers: [
            { symbol: "6857", name: "Advantest", countryCode: "JP", sector: "Semicap", price: 48.36, change: 3.1 },
            { symbol: "8035", name: "Tokyo Electron", countryCode: "JP", sector: "Semicap", price: 139.4, change: 2.4 }
        ],
        headlines: [
            { time: "11:00 JST", headline: "Yen weakness improves exporter sentiment again.", catalyst: "FX", tone: "positive" },
            { time: "14:30 JST", headline: "Corporate reforms keep buyback activity elevated.", catalyst: "Reforms", tone: "positive" }
        ],
        macroStats: [{ label: "USDJPY", value: "149.3" }, { label: "10Y JGB", value: "1.05%" }, { label: "Buyback Activity", value: "Elevated" }],
        thesis: {
            symbol: "6857",
            company: "Advantest",
            direction: "Long",
            entryPrice: 48.36,
            stopLoss: 45.8,
            targetPrice: 53.4,
            conviction: 74,
            timeHorizon: "2-5 weeks",
            catalyst: "Yen support and AI-linked semiconductor capex.",
            rationale: "Japan's semicap leaders remain leveraged to global AI infrastructure demand.",
            riskNotes: "A sharp yen squeeze would likely hit exporters and cyclicals at once."
        }
    }
];

const snapshotOverlays: Record<string, Record<string, CountryOverlay>> = {
    "2026-03-14": {
        US: { metrics: { dailyReturn: 1.4, weeklyReturn: 3.1, volatility: 18.2, sectorStrength: 84, macroSentiment: 78, currencyMovement: -0.6, relativePerformance: 1.2 }, benchmarkSeries: [5112, 5164, 5190, 5238, 5216, 5288, 5310] },
        BR: { metrics: { dailyReturn: 1.8, weeklyReturn: 2.7, volatility: 21.4, sectorStrength: 69, macroSentiment: 63, currencyMovement: 0.9, relativePerformance: 1.5 }, benchmarkSeries: [125400, 126020, 127180, 127940, 128100, 129040, 129620] },
        DE: { metrics: { dailyReturn: -0.6, weeklyReturn: 0.3, volatility: 19.5, sectorStrength: 56, macroSentiment: 49, currencyMovement: 0.2, relativePerformance: -0.8 }, benchmarkSeries: [18412, 18380, 18310, 18282, 18344, 18266, 18220] },
        IN: { metrics: { dailyReturn: 1.6, weeklyReturn: 2.8, volatility: 17.2, sectorStrength: 82, macroSentiment: 81, currencyMovement: 0.1, relativePerformance: 1.4 }, benchmarkSeries: [22080, 22190, 22340, 22420, 22488, 22610, 22680] },
        JP: { metrics: { dailyReturn: 1.9, weeklyReturn: 3.4, volatility: 20.6, sectorStrength: 77, macroSentiment: 73, currencyMovement: -0.8, relativePerformance: 1.7 }, benchmarkSeries: [38640, 38920, 39244, 39530, 39488, 39860, 40020] }
    },
    "2025-11-06": {
        US: { metrics: { dailyReturn: 2.2, weeklyReturn: 4.5, volatility: 15.4, sectorStrength: 86, macroSentiment: 82, currencyMovement: -1.1, relativePerformance: 0.9 }, benchmarkSeries: [4920, 4972, 5030, 5078, 5116, 5170, 5212] },
        BR: { metrics: { dailyReturn: 2.4, weeklyReturn: 5.1, volatility: 18.8, sectorStrength: 74, macroSentiment: 71, currencyMovement: 1.3, relativePerformance: 1.4 }, benchmarkSeries: [118240, 119600, 121180, 122840, 123560, 124940, 126100] },
        DE: { metrics: { dailyReturn: 2.8, weeklyReturn: 5.7, volatility: 16.7, sectorStrength: 81, macroSentiment: 76, currencyMovement: 0.9, relativePerformance: 1.9 }, benchmarkSeries: [17840, 18020, 18244, 18488, 18620, 18784, 18940], summary: "Germany becomes the cleanest expression of the European rebound as cyclicals, software, and autos all catch a bid together." },
        IN: { metrics: { dailyReturn: 1.9, weeklyReturn: 3.7, volatility: 15.8, sectorStrength: 80, macroSentiment: 79, currencyMovement: 0.6, relativePerformance: 0.7 }, benchmarkSeries: [21440, 21620, 21768, 21924, 22012, 22148, 22226] },
        JP: { metrics: { dailyReturn: 1.7, weeklyReturn: 3.8, volatility: 18.0, sectorStrength: 74, macroSentiment: 70, currencyMovement: -0.6, relativePerformance: 0.4 }, benchmarkSeries: [37220, 37684, 38020, 38310, 38590, 38840, 39088] }
    },
    "2025-08-05": {
        US: { metrics: { dailyReturn: -2.6, weeklyReturn: -6.8, volatility: 31.2, sectorStrength: 28, macroSentiment: 24, currencyMovement: 0.9, relativePerformance: -1.2 }, benchmarkSeries: [5480, 5410, 5338, 5264, 5208, 5140, 5076] },
        BR: { metrics: { dailyReturn: -3.8, weeklyReturn: -8.1, volatility: 35.4, sectorStrength: 22, macroSentiment: 18, currencyMovement: -1.6, relativePerformance: -2.3 }, benchmarkSeries: [131200, 128900, 126800, 124620, 123140, 121980, 120440] },
        DE: { metrics: { dailyReturn: -2.2, weeklyReturn: -5.6, volatility: 28.8, sectorStrength: 30, macroSentiment: 27, currencyMovement: 0.1, relativePerformance: -0.5 }, benchmarkSeries: [19044, 18710, 18422, 18130, 17920, 17780, 17614] },
        IN: { metrics: { dailyReturn: -2.9, weeklyReturn: -5.9, volatility: 29.4, sectorStrength: 33, macroSentiment: 34, currencyMovement: -0.3, relativePerformance: -0.8 }, benchmarkSeries: [24840, 24420, 24100, 23880, 23670, 23510, 23360] },
        JP: { metrics: { dailyReturn: 0.6, weeklyReturn: -1.1, volatility: 26.5, sectorStrength: 44, macroSentiment: 47, currencyMovement: 1.8, relativePerformance: 1.6 }, benchmarkSeries: [39440, 39220, 38990, 38840, 38920, 39070, 39218], summary: "Japan behaves as a relative safe haven in the selloff, with a stronger yen and reform bid cushioning the downside." }
    }
};

function buildCountries(snapshotDate: string): AtlasCountry[] {
    const overlays = snapshotOverlays[snapshotDate];
    return baseCountries.map((country) => ({ ...country, summary: overlays[country.code].summary ?? country.summary, metrics: overlays[country.code].metrics, benchmarkSeries: overlays[country.code].benchmarkSeries }));
}

export const atlasSnapshots: AtlasSnapshot[] = [
    {
        date: "2026-03-14",
        label: "March 14, 2026",
        mode: "Live",
        narrative: "North America and Asia are carrying the tape while Europe remains choppy. Leadership is still concentrated in semis, Indian financials, and Japanese automation.",
        featuredCountryCode: "US",
        globalStats: [
            { label: "Open Markets", value: "18 / 24", tone: "neutral" },
            { label: "Risk-On Score", value: "68 / 100", tone: "positive" },
            { label: "Leading Region", value: "Asia + North America", tone: "positive" },
            { label: "FX Pulse", value: "USD softer, JPY weak", tone: "neutral" }
        ],
        countries: buildCountries("2026-03-14"),
        globalMovers: [{ symbol: "6857", name: "Advantest", countryCode: "JP", sector: "Semicap", price: 48.36, change: 3.1 }, { symbol: "VALE3", name: "Vale", countryCode: "BR", sector: "Materials", price: 14.6, change: 3.4 }, { symbol: "NVDA", name: "NVIDIA", countryCode: "US", sector: "Semiconductors", price: 948.32, change: 4.8 }, { symbol: "SAP", name: "SAP", countryCode: "DE", sector: "Software", price: 207.44, change: 2.6 }, { symbol: "HDFCBANK", name: "HDFC Bank", countryCode: "IN", sector: "Financials", price: 19.48, change: 1.9 }],
        watchlist: [{ symbol: "NVDA", name: "NVIDIA", countryCode: "US", lastPrice: 948.32, change: 4.8, note: "AI leadership still intact" }, { symbol: "SAP", name: "SAP", countryCode: "DE", lastPrice: 207.44, change: 2.6, note: "Europe's clean growth leader" }, { symbol: "HDFCBANK", name: "HDFC Bank", countryCode: "IN", lastPrice: 19.48, change: 1.9, note: "Domestic flow support" }, { symbol: "VALE3", name: "Vale", countryCode: "BR", lastPrice: 14.6, change: 3.4, note: "Commodity beta is improving" }, { symbol: "6857", name: "Advantest", countryCode: "JP", lastPrice: 48.36, change: 3.1, note: "Semicap trend remains clean" }],
        sectorHeatmap: [{ sector: "Semiconductors", region: "North America", change: 3.4, leadership: "NVIDIA / AMD" }, { sector: "Financials", region: "India", change: 2.2, leadership: "HDFC / ICICI" }, { sector: "Materials", region: "Latin America", change: 2.5, leadership: "Vale / miners" }, { sector: "Automation", region: "Japan", change: 2.1, leadership: "Advantest / TSE" }, { sector: "Software", region: "Europe", change: 1.1, leadership: "SAP / ERP" }],
        portfolio: { startingCash: 150000, cashBalance: 84120, realizedPnl: 18240, closedTrades: 21, winRate: 61 },
        positions: [{ id: "p-us-nvda", symbol: "NVDA", name: "NVIDIA", countryCode: "US", direction: "Long", quantity: 35, entryPrice: 912.4, lastPrice: 948.32, openedAt: "Mar 10", thesisTag: "AI strength continuation" }, { id: "p-in-hdfc", symbol: "HDFCBANK", name: "HDFC Bank", countryCode: "IN", direction: "Long", quantity: 800, entryPrice: 18.9, lastPrice: 19.48, openedAt: "Mar 7", thesisTag: "Domestic breadth follow-through" }],
        recentIdeas: [{ id: "i1", symbol: "NVDA", title: "AI capex stays firm above breakout support", direction: "Long", conviction: 84, timeHorizon: "2-6 weeks", thesis: "US semis continue to lead global breadth while rates cool.", countryCode: "US" }, { id: "i2", symbol: "HDFCBANK", title: "India financials remain the cleanest local flow expression", direction: "Long", conviction: 79, timeHorizon: "3-6 weeks", thesis: "Domestic participation is keeping pullbacks shallow.", countryCode: "IN" }, { id: "i3", symbol: "SAP", title: "Europe still needs clean quality exposure", direction: "Long", conviction: 67, timeHorizon: "3-8 weeks", thesis: "SAP is a better way to play Europe than pure cyclicals right now.", countryCode: "DE" }],
        journalEntries: [{ id: "j1", title: "Japan semicap add-on", outcome: "+6.4% unrealized", lesson: "The best entries came after FX stabilized rather than at the initial headline spike.", createdAt: "Mar 12" }, { id: "j2", title: "Germany cyclical probe", outcome: "Stopped out", lesson: "Breadth never confirmed the rebound and the DAX lagged global peers all week.", createdAt: "Mar 8" }],
        newsFeed: [{ id: "n1", region: "US", headline: "Cooling yields improve growth equity tone.", catalyst: "Rates", time: "11:05 ET", tone: "positive" }, { id: "n2", region: "India", headline: "Domestic flow data remains supportive for large banks.", catalyst: "Local flows", time: "14:00 IST", tone: "positive" }, { id: "n3", region: "Germany", headline: "European cyclicals lag despite softer bund yields.", catalyst: "Growth risk", time: "13:00 CET", tone: "negative" }]
    },
    {
        date: "2025-11-06",
        label: "November 6, 2025",
        mode: "Replay",
        narrative: "A broad relief rally after policy easing. European cyclicals, Japan semicap, and Brazil materials all respond as yields fall and breadth expands.",
        featuredCountryCode: "DE",
        globalStats: [{ label: "Open Markets", value: "24 / 24", tone: "positive" }, { label: "Risk-On Score", value: "81 / 100", tone: "positive" }, { label: "Leading Region", value: "Europe", tone: "positive" }, { label: "FX Pulse", value: "USD weaker, EMFX bid", tone: "positive" }],
        countries: buildCountries("2025-11-06"),
        globalMovers: [{ symbol: "SAP", name: "SAP", countryCode: "DE", sector: "Software", price: 195.8, change: 5.1 }, { symbol: "VALE3", name: "Vale", countryCode: "BR", sector: "Materials", price: 13.88, change: 4.0 }, { symbol: "HDFCBANK", name: "HDFC Bank", countryCode: "IN", sector: "Financials", price: 18.74, change: 3.2 }, { symbol: "NVDA", name: "NVIDIA", countryCode: "US", sector: "Semiconductors", price: 901.2, change: 3.1 }, { symbol: "6857", name: "Advantest", countryCode: "JP", sector: "Semicap", price: 46.9, change: 2.7 }],
        watchlist: [{ symbol: "SAP", name: "SAP", countryCode: "DE", lastPrice: 195.8, change: 5.1, note: "Europe rally leader" }, { symbol: "VALE3", name: "Vale", countryCode: "BR", lastPrice: 13.88, change: 4.0, note: "Commodity catch-up" }, { symbol: "NVDA", name: "NVIDIA", countryCode: "US", lastPrice: 901.2, change: 3.1, note: "Breadth broadens beyond megacaps" }, { symbol: "HDFCBANK", name: "HDFC Bank", countryCode: "IN", lastPrice: 18.74, change: 3.2, note: "Domestic participation stays firm" }, { symbol: "6857", name: "Advantest", countryCode: "JP", lastPrice: 46.9, change: 2.7, note: "Soft yen tailwind" }],
        sectorHeatmap: [{ sector: "Software", region: "Europe", change: 4.2, leadership: "SAP / ERP" }, { sector: "Materials", region: "Brazil", change: 3.5, leadership: "Vale / iron ore" }, { sector: "Banks", region: "India", change: 2.6, leadership: "HDFC / ICICI" }, { sector: "Semicap", region: "Japan", change: 2.5, leadership: "Advantest / Tokyo Electron" }, { sector: "Semiconductors", region: "North America", change: 2.8, leadership: "NVIDIA / AMD" }],
        portfolio: { startingCash: 150000, cashBalance: 92140, realizedPnl: 14380, closedTrades: 17, winRate: 58 },
        positions: [{ id: "p-de-sap", symbol: "SAP", name: "SAP", countryCode: "DE", direction: "Long", quantity: 140, entryPrice: 186.2, lastPrice: 195.8, openedAt: "Nov 3", thesisTag: "European breadth expansion" }, { id: "p-br-vale", symbol: "VALE3", name: "Vale", countryCode: "BR", direction: "Long", quantity: 950, entryPrice: 13.22, lastPrice: 13.88, openedAt: "Nov 4", thesisTag: "Commodity relief bid" }],
        recentIdeas: [{ id: "i4", symbol: "SAP", title: "Europe breadth finally confirms the macro bounce", direction: "Long", conviction: 76, timeHorizon: "2-5 weeks", thesis: "Lower yields allow quality cyclicals to rerate quickly.", countryCode: "DE" }, { id: "i5", symbol: "VALE3", title: "Brazil catches up when dollar breaks lower", direction: "Long", conviction: 69, timeHorizon: "1-3 weeks", thesis: "Commodity beta and EMFX both help the setup.", countryCode: "BR" }, { id: "i6", symbol: "HDFCBANK", title: "India stays constructive even when the whole tape rallies", direction: "Long", conviction: 70, timeHorizon: "2-4 weeks", thesis: "Local participation keeps financials among the cleanest trends.", countryCode: "IN" }],
        journalEntries: [{ id: "j3", title: "European cyclicals replay", outcome: "+4.8% closed", lesson: "The cleanest entries appeared after bund yields confirmed the move.", createdAt: "Nov 6" }, { id: "j4", title: "Commodity beta restart", outcome: "+3.2% unrealized", lesson: "Materials responded faster than banks once the dollar actually broke.", createdAt: "Nov 5" }],
        newsFeed: [{ id: "n5", region: "Europe", headline: "Bund yields fall again and push cyclicals higher.", catalyst: "Policy easing", time: "09:10 CET", tone: "positive" }, { id: "n6", region: "Brazil", headline: "EMFX strength improves commodity beta sentiment.", catalyst: "Dollar weakness", time: "12:25 BRT", tone: "positive" }, { id: "n7", region: "US", headline: "Participation broadens beyond AI leaders in the relief rally.", catalyst: "Breadth", time: "11:15 ET", tone: "neutral" }]
    },
    {
        date: "2025-08-05",
        label: "August 5, 2025",
        mode: "Replay",
        narrative: "A sharp risk-off regime. Dollar strength and deleveraging hit commodity and cyclical markets hardest while Japan holds up on relative terms.",
        featuredCountryCode: "JP",
        globalStats: [{ label: "Open Markets", value: "24 / 24", tone: "negative" }, { label: "Risk-On Score", value: "24 / 100", tone: "negative" }, { label: "Leading Region", value: "Japan (relative)", tone: "neutral" }, { label: "FX Pulse", value: "USD firm, JPY stronger", tone: "negative" }],
        countries: buildCountries("2025-08-05"),
        globalMovers: [{ symbol: "6857", name: "Advantest", countryCode: "JP", sector: "Semicap", price: 44.12, change: 1.1 }, { symbol: "SAP", name: "SAP", countryCode: "DE", sector: "Software", price: 188.1, change: -2.1 }, { symbol: "NVDA", name: "NVIDIA", countryCode: "US", sector: "Semiconductors", price: 818.6, change: -4.9 }, { symbol: "VALE3", name: "Vale", countryCode: "BR", sector: "Materials", price: 12.4, change: -5.2 }, { symbol: "HDFCBANK", name: "HDFC Bank", countryCode: "IN", sector: "Financials", price: 17.86, change: -3.3 }],
        watchlist: [{ symbol: "6857", name: "Advantest", countryCode: "JP", lastPrice: 44.12, change: 1.1, note: "Relative strength in risk-off" }, { symbol: "SAP", name: "SAP", countryCode: "DE", lastPrice: 188.1, change: -2.1, note: "Holding up better than autos" }, { symbol: "NVDA", name: "NVIDIA", countryCode: "US", lastPrice: 818.6, change: -4.9, note: "Leadership unwind" }, { symbol: "VALE3", name: "Vale", countryCode: "BR", lastPrice: 12.4, change: -5.2, note: "Commodity beta under pressure" }, { symbol: "HDFCBANK", name: "HDFC Bank", countryCode: "IN", lastPrice: 17.86, change: -3.3, note: "Domestic flows finally fade" }],
        sectorHeatmap: [{ sector: "Financials", region: "Japan", change: 0.8, leadership: "Relative strength" }, { sector: "Software", region: "Europe", change: -2.0, leadership: "Quality hold-up" }, { sector: "Semiconductors", region: "North America", change: -4.8, leadership: "Momentum unwind" }, { sector: "Materials", region: "India", change: -3.7, leadership: "Global growth scare" }, { sector: "Materials", region: "Brazil", change: -5.0, leadership: "Iron ore pressure" }],
        portfolio: { startingCash: 150000, cashBalance: 112300, realizedPnl: 9280, closedTrades: 15, winRate: 53 },
        positions: [{ id: "p-jp-6857", symbol: "6857", name: "Advantest", countryCode: "JP", direction: "Long", quantity: 180, entryPrice: 43.1, lastPrice: 44.12, openedAt: "Aug 3", thesisTag: "Relative strength in Japan" }],
        recentIdeas: [{ id: "i7", symbol: "6857", title: "Japan as the least bad market", direction: "Long", conviction: 62, timeHorizon: "days to 2 weeks", thesis: "Relative strength plus a stronger yen can cushion the downside.", countryCode: "JP" }, { id: "i8", symbol: "SAP", title: "Quality software holds up better than cyclicals", direction: "Long", conviction: 55, timeHorizon: "1-2 weeks", thesis: "If you must own Europe in a drawdown, stay in quality.", countryCode: "DE" }, { id: "i9", symbol: "VALE3", title: "Avoid fresh commodity longs into panic", direction: "Short", conviction: 74, timeHorizon: "days to 2 weeks", thesis: "Commodity beta is still being repriced lower as growth fear rises.", countryCode: "BR" }],
        journalEntries: [{ id: "j5", title: "Protected cash in replay drawdown", outcome: "+0.6% net liq", lesson: "Preserving optionality mattered more than forcing bottoms during the first volatility expansion.", createdAt: "Aug 5" }, { id: "j6", title: "Semis were not the safe dip buy", outcome: "-2.9% stopped", lesson: "Leadership unwind regimes need breadth stabilization before momentum names become actionable again.", createdAt: "Aug 4" }],
        newsFeed: [{ id: "n9", region: "US", headline: "Volatility expansion forces deleveraging across former leaders.", catalyst: "Positioning unwind", time: "10:25 ET", tone: "negative" }, { id: "n10", region: "Japan", headline: "Stronger yen and buyback support cushion the Nikkei.", catalyst: "Relative safety", time: "11:00 JST", tone: "neutral" }, { id: "n11", region: "Brazil", headline: "Commodity-sensitive markets lead the downside as dollar strength returns.", catalyst: "Growth scare", time: "12:10 BRT", tone: "negative" }]
    }
];

export const defaultSnapshot = atlasSnapshots[0] as AtlasSnapshot;

export function buildDraftFromCountry(country: AtlasCountry): ThesisDraft {
    return {
        symbol: country.thesis.symbol,
        company: country.thesis.company,
        direction: country.thesis.direction,
        entryPrice: country.thesis.entryPrice,
        stopLoss: country.thesis.stopLoss,
        targetPrice: country.thesis.targetPrice,
        conviction: country.thesis.conviction,
        timeHorizon: country.thesis.timeHorizon,
        catalyst: country.thesis.catalyst,
        rationale: country.thesis.rationale,
        riskNotes: country.thesis.riskNotes,
        plannedQuantity: getSuggestedQuantity(country.thesis.entryPrice, country.thesis.conviction)
    };
}

export function getSnapshotByDate(date: string): AtlasSnapshot {
    return atlasSnapshots.find((snapshot) => snapshot.date === date) ?? defaultSnapshot;
}

export function getCountryByCode(snapshot: AtlasSnapshot, countryCode: string): AtlasCountry {
    return snapshot.countries.find((country) => country.code === countryCode) ?? snapshot.countries[0];
}

export function getMetricDescriptor(metric: MarketMetricKey): AtlasMetricDescriptor {
    return metricDescriptors.find((descriptor) => descriptor.key === metric) ?? metricDescriptors[0];
}

export function buildAssetCatalog(snapshot: AtlasSnapshot, countries: AtlasCountry[] = snapshot.countries): AtlasAssetResearch[] {
    const assetMap = new Map<string, AtlasAssetResearch>();

    countries.forEach((country) => {
        const movers = [...country.movers];

        if (!movers.find((mover) => mover.symbol === country.thesis.symbol)) {
            movers.unshift({
                symbol: country.thesis.symbol,
                name: country.thesis.company,
                countryCode: country.code,
                sector: country.topSectors[0]?.name ?? "Equities",
                price: country.thesis.entryPrice,
                change: country.metrics.dailyReturn
            });
        }

        movers.forEach((mover, moverIndex) => {
            if (!assetMap.has(mover.symbol)) {
                assetMap.set(mover.symbol, buildAssetResearch(snapshot, country, mover.symbol, mover.name, mover.sector, mover.price, mover.change, moverIndex));
            }
        });
    });

    snapshot.watchlist.forEach((item, index) => {
        if (!assetMap.has(item.symbol)) {
            const country = countries.find((candidate) => candidate.code === item.countryCode) ?? getCountryByCode(snapshot, item.countryCode);
            assetMap.set(item.symbol, buildAssetResearch(snapshot, country, item.symbol, item.name, country.topSectors[0]?.name ?? "Equities", item.lastPrice, item.change, index + 3, item.note));
        }
    });

    return [...assetMap.values()].sort((left, right) => right.change - left.change);
}

export function getAssetBySymbol(snapshot: AtlasSnapshot, symbol: string, countries?: AtlasCountry[]): AtlasAssetResearch | undefined {
    return buildAssetCatalog(snapshot, countries).find((asset) => asset.symbol === symbol);
}

export function buildDraftFromAsset(snapshot: AtlasSnapshot, asset: AtlasAssetResearch): ThesisDraft {
    const country = getCountryByCode(snapshot, asset.countryCode);
    const direction = asset.change >= 0 ? "Long" : "Short";
    const entryPrice = roundPrice(asset.price);
    const stopLoss = roundPrice(entryPrice * (direction === "Long" ? 0.96 : 1.04));
    const targetPrice = roundPrice(entryPrice * (direction === "Long" ? 1.08 : 0.92));

    return {
        symbol: asset.symbol,
        company: asset.name,
        direction,
        entryPrice,
        stopLoss,
        targetPrice,
        conviction: clamp(Math.round((country.metrics.sectorStrength * 0.55) + (asset.sentiment * 0.35)), 35, 93),
        timeHorizon: direction === "Long" ? "days to 4 weeks" : "days to 3 weeks",
        catalyst: asset.catalyst,
        rationale: `${asset.name} is the clearest ${country.name} ${asset.sector.toLowerCase()} expression right now, with ${asset.change >= 0 ? "constructive" : "fragile"} tape confirmation.`,
        riskNotes: `${country.name} remains sensitive to ${country.headlines[0]?.catalyst.toLowerCase() ?? "macro headlines"}, so respect the stop if breadth fades.`,
        plannedQuantity: getSuggestedQuantity(entryPrice, country.metrics.sectorStrength)
    };
}

function buildAssetResearch(
    snapshot: AtlasSnapshot,
    country: AtlasCountry,
    symbol: string,
    name: string,
    sector: string,
    price: number,
    change: number,
    variantSeed = 0,
    noteOverride?: string
): AtlasAssetResearch {
    const seed = hashValue(`${snapshot.date}-${symbol}-${variantSeed}`);
    const priceSeries = buildAssetSeries(price, change, seed);
    const volumeSeries = buildVolumeSeries(price, seed, country.metrics.volatility);
    const support = roundPrice(Math.min(...priceSeries) * 0.992);
    const resistance = roundPrice(Math.max(...priceSeries) * 1.008);

    return {
        symbol,
        name,
        countryCode: country.code,
        countryName: country.name,
        sector,
        benchmark: country.benchmark,
        price,
        change,
        note: noteOverride ?? country.summary,
        catalyst: country.headlines[0]?.catalyst ?? `${sector} rotation`,
        summary: `${name} is one of ${country.name}'s clearest ${sector.toLowerCase()} leaders, trading with ${change >= 0 ? "upside continuation" : "defensive pressure"} against the current world tape.`,
        priceSeries,
        volumeSeries,
        relativeStrength: roundMetric(country.metrics.relativePerformance + centeredSeed(seed, 1.2)),
        volatility: clamp(country.metrics.volatility + centeredSeed(seed + 7, 4.2), 8.5, 42),
        support,
        resistance,
        sentiment: clamp(Math.round(country.metrics.macroSentiment + centeredSeed(seed + 13, 12)), 12, 96)
    };
}

function buildAssetSeries(price: number, change: number, seed: number): number[] {
    const base = Math.max(price * 0.91, 4);
    const drift = change / 8;
    const points = Array.from({ length: 12 }, (_, index) => {
        const trend = drift * index;
        const pulse = centeredSeed(seed + index, Math.max(price * 0.018, 0.8));
        return roundPrice(base + ((price - base) * ((index + 1) / 12)) + trend + pulse);
    });

    points[points.length - 1] = roundPrice(price);
    return points;
}

function buildVolumeSeries(price: number, seed: number, volatility: number): number[] {
    return Array.from({ length: 12 }, (_, index) => {
        const base = 600000 + Math.round(price * 3200) + Math.round(volatility * 18000);
        return Math.max(120000, Math.round(base + centeredSeed(seed + (index * 2), base * 0.18)));
    });
}

function getSuggestedQuantity(entryPrice: number, conviction: number): number {
    const riskBudget = 9000 + (conviction * 55);
    return Math.max(1, Math.floor(riskBudget / Math.max(entryPrice, 1)));
}

function hashValue(value: string): number {
    return value.split("").reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 17);
}

function centeredSeed(seed: number, amplitude: number): number {
    const value = Math.sin(seed * 12.9898) * 43758.5453123;
    return ((value - Math.floor(value)) - 0.5) * amplitude * 2;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}

function roundMetric(value: number): number {
    return Math.round(value * 10) / 10;
}

function roundPrice(value: number): number {
    return Math.round(value * 100) / 100;
}
