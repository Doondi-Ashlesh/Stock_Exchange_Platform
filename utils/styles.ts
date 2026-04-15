import { theme, extendTheme } from "native-base";

// ---------------------------------------------------------------------------
// AtlasMarket — Design Tokens
// ---------------------------------------------------------------------------
// Premium fintech palette inspired by Public.com, Robinhood, TradingView and
// Stripe's product surfaces. Rich navy canvas, layered panels with subtle
// gradients, polished mint/emerald for positive flows and a refined rose-red
// for risk-off. Typography leans on Inter / SF Pro for the information-dense
// terminal aesthetic that traders expect.
// ---------------------------------------------------------------------------

export const retailTheme = {
    // Canvas — deep teal-black Bloomberg-terminal base
    background: "#040810",        // near-black with a hint of deep teal
    backgroundAlt: "#081220",     // secondary canvas / page gutters
    panel: "#0A1624",             // base card surface
    panelRaised: "#0F2036",       // raised / hover card surface
    panelElevated: "#142A44",     // modal / popover surface
    overlay: "rgba(4, 8, 16, 0.78)",

    // Text
    text: "#E2F1FF",              // cool-white primary copy
    textStrong: "#FFFFFF",        // emphasis copy
    muted: "#7EA3C2",             // cool slate secondary copy
    mutedStrong: "#B5D3EB",
    subtle: "#4A6B87",

    // Lines — thin cyan hairlines
    border: "rgba(34, 211, 238, 0.14)",
    borderStrong: "rgba(34, 211, 238, 0.32)",
    borderSoft: "rgba(34, 211, 238, 0.08)",

    // Brand + semantic — CYAN HUD
    accent: "#22D3EE",            // cyan primary (CTA, focus, glow)
    accentStrong: "#67E8F9",      // brighter cyan for active states
    accentMuted: "rgba(34, 211, 238, 0.16)",

    positive: "#22D3EE",          // gains routed through cyan for HUD look
    positiveSoft: "rgba(34, 211, 238, 0.14)",
    positiveDeep: "#0891B2",
    negative: "#FF3B6B",          // losses — hot pink-red
    negativeSoft: "rgba(255, 59, 107, 0.14)",
    negativeDeep: "#E11D48",
    gold: "#FACC15",              // caution
    goldSoft: "rgba(250, 204, 21, 0.18)",
    warning: "#FB923C",
    neutral: "#B5D3EB",

    // FX
    glow: "#22D3EE",
    ink: "#04080F"
} as const;

// Native typography stack — matches iOS/macOS system, Windows Segoe UI,
// falls back to Inter (loaded via globalStyles.ts) for the web terminal.
export const fontStack = `"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
export const monoStack = `"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace`;

// Shadow recipes — cyan-tinted glows for the HUD aesthetic.
export const shadow = {
    sm: "0 1px 2px rgba(0,0,0,0.45), 0 1px 0 rgba(34,211,238,0.04) inset",
    md: "0 8px 24px -6px rgba(0,0,0,0.55), 0 1px 0 rgba(34,211,238,0.06) inset",
    lg: "0 24px 60px -20px rgba(4,8,16,0.85), 0 1px 0 rgba(34,211,238,0.08) inset",
    focusRing: "0 0 0 3px rgba(34, 211, 238, 0.40)",
    positiveGlow: "0 12px 32px -14px rgba(34, 211, 238, 0.55)",
    negativeGlow: "0 12px 32px -14px rgba(255, 59, 107, 0.5)",
    hologram: "0 0 0 1px rgba(34,211,238,0.25), 0 0 24px -4px rgba(34,211,238,0.35)"
} as const;

// Gradient recipes.
export const gradients = {
    canvas: "radial-gradient(120% 90% at 20% 0%, rgba(34,211,238,0.10) 0%, rgba(4,8,16,0) 55%), radial-gradient(100% 80% at 100% 100%, rgba(34,211,238,0.05) 0%, rgba(4,8,16,0) 60%), linear-gradient(180deg, #040810 0%, #03070E 100%)",
    panel: "linear-gradient(180deg, rgba(34,211,238,0.03) 0%, rgba(34,211,238,0) 100%), linear-gradient(180deg, #0A1624 0%, #070F1C 100%)",
    panelRaised: "linear-gradient(180deg, rgba(34,211,238,0.06) 0%, rgba(34,211,238,0) 100%), linear-gradient(180deg, #0F2036 0%, #0A1624 100%)",
    ctaPositive: "linear-gradient(180deg, #22D3EE 0%, #0891B2 100%)",
    ctaNegative: "linear-gradient(180deg, #FF3B6B 0%, #E11D48 100%)",
    ctaAccent: "linear-gradient(180deg, #22D3EE 0%, #0891B2 100%)",
    tickerPositive: "linear-gradient(90deg, rgba(34,211,238,0.0) 0%, rgba(34,211,238,0.45) 50%, rgba(34,211,238,0.0) 100%)"
} as const;

export const radius = {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    "2xl": 24,
    pill: 9999
} as const;

export const styles = extendTheme({
    // -----------------------------------------------------------------
    // Flat tokens exposed to components as `styles.atlas.*`
    // Keeping the existing key names so all existing usages cascade.
    // -----------------------------------------------------------------
    atlas: {
        background: retailTheme.background,
        backgroundAlt: retailTheme.backgroundAlt,
        canvas: retailTheme.background,
        hero: retailTheme.panel,
        panel: retailTheme.panel,
        panelMuted: retailTheme.backgroundAlt,
        panelRaised: retailTheme.panelRaised,
        panelElevated: retailTheme.panelElevated,
        glass: "rgba(15, 21, 36, 0.72)",
        glassStrong: "rgba(21, 28, 46, 0.88)",
        glassGlow: "rgba(99, 102, 241, 0.14)",
        border: retailTheme.border,
        borderStrong: retailTheme.borderStrong,
        borderSoft: retailTheme.borderSoft,
        text: retailTheme.text,
        textStrong: retailTheme.textStrong,
        muted: retailTheme.muted,
        mutedStrong: retailTheme.mutedStrong,
        subtle: retailTheme.subtle,
        accent: retailTheme.accent,
        accentStrong: retailTheme.accentStrong,
        accentMuted: retailTheme.accentMuted,
        gold: retailTheme.gold,
        goldMuted: retailTheme.goldSoft,
        neutral: retailTheme.neutral,
        positive: retailTheme.positive,
        positiveSoft: retailTheme.positiveSoft,
        positiveDeep: retailTheme.positiveDeep,
        negative: retailTheme.negative,
        negativeSoft: retailTheme.negativeSoft,
        negativeDeep: retailTheme.negativeDeep,
        warning: retailTheme.warning,
        glow: retailTheme.glow,
        overlay: retailTheme.overlay,
        focusPrimary: retailTheme.accent,
        focusSecondary: retailTheme.muted,
        focusTertiary: retailTheme.negative,
        glassEdge: "rgba(255, 255, 255, 0.06)",
        glassShadow: "rgba(0, 0, 0, 0.45)",
        ink: retailTheme.ink,
        font: fontStack,
        mono: monoStack,
        radius,
        shadow,
        gradients
    },

    // -----------------------------------------------------------------
    // NativeBase component overrides — premium defaults
    // -----------------------------------------------------------------
    components: {
        Button: {
            baseStyle: {
                rounded: "xl",
                bg: retailTheme.panelRaised,
                borderWidth: 1,
                borderColor: retailTheme.border,
                _text: {
                    fontWeight: "600",
                    fontSize: "sm",
                    letterSpacing: 0.1,
                    color: retailTheme.text
                },
                _hover: {
                    bg: retailTheme.panelElevated,
                    borderColor: retailTheme.borderStrong
                },
                _pressed: {
                    bg: retailTheme.panelElevated,
                    borderColor: retailTheme.accent
                }
            },
            variants: {
                solid: () => ({
                    bg: retailTheme.accent,
                    borderColor: retailTheme.accent,
                    _text: { color: "#FFFFFF", fontWeight: "700" },
                    _hover: { bg: retailTheme.accentStrong, borderColor: retailTheme.accentStrong },
                    _pressed: { bg: retailTheme.accentStrong }
                }),
                positive: () => ({
                    bg: retailTheme.positive,
                    borderColor: retailTheme.positive,
                    _text: { color: "#06110A", fontWeight: "700" },
                    _hover: { bg: retailTheme.positiveDeep },
                    _pressed: { bg: retailTheme.positiveDeep }
                }),
                negative: () => ({
                    bg: retailTheme.negative,
                    borderColor: retailTheme.negative,
                    _text: { color: "#FFF5F7", fontWeight: "700" },
                    _hover: { bg: retailTheme.negativeDeep },
                    _pressed: { bg: retailTheme.negativeDeep }
                }),
                ghost: () => ({
                    bg: "transparent",
                    borderColor: "transparent",
                    _text: { color: retailTheme.mutedStrong, fontWeight: "600" },
                    _hover: { bg: "rgba(255,255,255,0.04)" },
                    _pressed: { bg: "rgba(255,255,255,0.06)" }
                })
            }
        },
        Input: {
            baseStyle: {
                rounded: "lg",
                borderWidth: 1,
                bg: retailTheme.panel,
                borderColor: retailTheme.border,
                color: retailTheme.text,
                _focus: {
                    borderColor: retailTheme.accent,
                    bg: retailTheme.panelRaised
                },
                _placeholder: { color: retailTheme.subtle }
            }
        },
        TextArea: {
            baseStyle: {
                rounded: "lg",
                borderWidth: 1,
                bg: retailTheme.panel,
                borderColor: retailTheme.border,
                color: retailTheme.text,
                _focus: {
                    borderColor: retailTheme.accent,
                    bg: retailTheme.panelRaised
                },
                _placeholder: { color: retailTheme.subtle }
            }
        },
        Badge: {
            baseStyle: {
                rounded: "md",
                px: 2,
                py: 1,
                _text: { fontWeight: "700", letterSpacing: 0.3 }
            }
        },
        Heading: {
            baseStyle: {
                color: retailTheme.textStrong,
                letterSpacing: -0.2
            }
        }
    },

    revenut: {
        primary: "#E78E3A",
        secondary: "#F8EFED",
        tertiary: "#1871C5",
        paid: theme.colors.tertiary[600],
        trials: theme.colors.tertiary[300],
        open: theme.colors.emerald[100],
        previous: theme.colors.primary[900]
    }
});

export function getChangeColorScheme(changeType: number): string {
    let colorScheme: string = "coolGray";

    switch (changeType) {
        case 1: colorScheme = "success"; break;
        case -1: colorScheme = "error"; break;
    }

    return colorScheme;
}
