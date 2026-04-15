import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import Globe, { GlobeMethods } from "react-globe.gl";
import { AmbientLight, Color, DirectionalLight, Fog, MeshPhongMaterial } from "three";

import { AtlasMarketGlobeProps } from "./AtlasMarketGlobe.types";
import { buildAtlasCountryPolygons } from "../utils/atlasGlobeCountryPolygons";
import { buildAtlasWebGlobeScene } from "../utils/atlasGlobeWebScene";
import { styles } from "../utils/styles";

export function AtlasMarketGlobeWeb({
    countries,
    activeMetric,
    selectedCountryCode,
    onSelectCountry,
    highlightCountryCodes,
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
    const globeRef = useRef<GlobeMethods>();
    const [autoSpin, setAutoSpin] = useState(true);
    const [hoveredCountryCode, setHoveredCountryCode] = useState<string | null>(null);

    const isImmersive = variant === "immersive";
    const globeWidth = isImmersive
        ? Math.min(Math.max(width - 124, 360), 1100)
        : Math.min(Math.max(width - 96, 280), 460);
    const globeHeight = isImmersive ? 720 : 360;

    const scene = useMemo(() => buildAtlasWebGlobeScene(countries, selectedCountryCode, activeMetric), [activeMetric, countries, selectedCountryCode]);
    const highlightCodeSet = useMemo(() => new Set(highlightCountryCodes ?? []), [highlightCountryCodes]);
    const polygons = useMemo(() => buildAtlasCountryPolygons(countries, selectedCountryCode, activeMetric, [...highlightCodeSet]), [activeMetric, countries, highlightCodeSet, selectedCountryCode]);
    // Show only the selected country label by default. Hovering a country
    // reveals its tag. Keeps the globe calm instead of peppered with text.
    const labelMarkers = useMemo(() => scene.markers
        .filter((marker) => marker.isSelected || marker.code === hoveredCountryCode)
        .map((marker) => ({
            ...marker,
            labelColor: marker.isSelected ? "#E6FBFF" : "#67E8F9"
        })), [hoveredCountryCode, scene.markers]);
    const visibleArcs = useMemo(() => scene.arcs, [scene.arcs]);
    const focusMarker = scene.markers.find((marker) => marker.code === (hoveredCountryCode ?? selectedCountryCode)) ?? scene.focus;

    const globeMaterial = useMemo(() => {
        const material = new MeshPhongMaterial({
            color: new Color("#050B18"),
            emissive: new Color("#07131F"),
            emissiveIntensity: 0.35,
            shininess: 6,
            specular: new Color("#0E3344")
        });
        material.transparent = true;
        material.opacity = 1.0;
        return material;
    }, []);

    useEffect(() => {
        if (!globeRef.current) {
            return;
        }

        const controls = globeRef.current.controls();
        controls.enablePan = false;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.autoRotate = autoSpin;
        controls.autoRotateSpeed = 0.5;
        controls.minDistance = isImmersive ? 150 : 180;
        controls.maxDistance = isImmersive ? 430 : 360;

        globeRef.current.pointOfView(
            {
                lat: scene.focus.lat,
                lng: scene.focus.lng,
                altitude: isImmersive ? 1.45 : 1.95
            },
            950
        );
    }, [autoSpin, isImmersive, scene.focus.lat, scene.focus.lng]);

    useEffect(() => {
        if (!globeRef.current) {
            return;
        }

        const renderer = globeRef.current.renderer();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        const sceneGraph = globeRef.current.scene();
        sceneGraph.fog = new Fog("#040810", 280, 820);

        const keyLight = new DirectionalLight("#E6FBFF", 0.95);
        keyLight.position.set(-180, 150, 220);
        const rimLight = new DirectionalLight("#22D3EE", 0.5);
        rimLight.position.set(240, -60, 160);
        const accentLight = new DirectionalLight("#0891B2", 0.25);
        accentLight.position.set(-40, -180, -120);
        const fillLight = new AmbientLight("#0E2436", 0.85);

        globeRef.current.lights([fillLight, keyLight, rimLight, accentLight]);
    }, []);

    function handleSelectCountry(countryCode: string) {
        setAutoSpin(false);
        onSelectCountry(countryCode);
    }

    function cycleCountry(step: number) {
        const currentIndex = countries.findIndex((country) => country.code === selectedCountryCode);
        const nextIndex = (currentIndex + step + countries.length) % countries.length;
        handleSelectCountry(countries[nextIndex].code);
    }

    return (
        <div style={surfaceStyle}>
            <div style={headerRowStyle}>
                <div>
                    <div style={eyebrowStyle}>EARTH CONSOLE</div>
                    <div style={titleStyle}>{focusMarker.name} in focus</div>
                    <div style={subtitleStyle}>Drag the globe, click any country polygon, follow cross-market routes, and refocus the camera around the selected market.</div>
                </div>
                <div style={pillStyle}>{focusMarker.metricLabel}</div>
            </div>

            <div style={controlRowStyle}>
                <button type="button" style={secondaryButtonStyle} onClick={() => cycleCountry(-1)}>Prev Country</button>
                <button type="button" style={secondaryButtonStyle} onClick={() => globeRef.current?.pointOfView({ lat: scene.focus.lat, lng: scene.focus.lng, altitude: isImmersive ? 1.45 : 1.95 }, 650)}>Center Focus</button>
                <button type="button" style={autoSpin ? primaryButtonStyle : secondaryButtonStyle} onClick={() => setAutoSpin((current) => !current)}>
                    {autoSpin ? "Pause Orbit" : "Auto Orbit"}
                </button>
                <button type="button" style={secondaryButtonStyle} onClick={() => cycleCountry(1)}>Next Country</button>
            </div>

            <div style={{ ...globeShellStyle, height: globeHeight }}>
                <div style={hudGridStyle} />
                <div style={cornerTicksStyle}>
                    <span style={cornerLabelTopLeft}>LON / LAT</span>
                    <span style={cornerLabelTopRight}>FEED · LIVE</span>
                    <span style={cornerLabelBottomLeft}>WORLD INDEX</span>
                    <span style={cornerLabelBottomRight}>{focusMarker.benchmark}</span>
                </div>
                <Globe
                    ref={globeRef as any}
                    width={globeWidth}
                    height={globeHeight}
                    backgroundColor="rgba(0,0,0,0)"
                    globeMaterial={globeMaterial}
                    showAtmosphere
                    atmosphereColor="#22D3EE"
                    atmosphereAltitude={0.22}
                    showGraticules={showGraticules}
                    polygonsData={polygons}
                    polygonGeoJsonGeometry="geometry"
                    polygonCapColor={(polygon: object) => (polygon as any).capColor}
                    polygonSideColor={(polygon: object) => (polygon as any).sideColor}
                    polygonStrokeColor={(polygon: object) => (polygon as any).strokeColor}
                    polygonAltitude={(polygon: object) => (polygon as any).altitude}
                    polygonLabel={(polygon: object) => {
                        const item = polygon as any;
                        return `${item.name} | ${item.metricLabel}`;
                    }}
                    polygonsTransitionDuration={500}
                    onPolygonClick={(polygon: object) => handleSelectCountry((polygon as any).code)}
                    labelsData={showLabels ? labelMarkers : []}
                    labelLat="lat"
                    labelLng="lng"
                    labelText={(marker: object) => (marker as any).code}
                    labelSize={(marker: object) => (marker as any).isSelected ? 1.15 : 0.82}
                    labelAltitude={(marker: object) => (marker as any).altitude}
                    labelColor={(marker: object) => (marker as any).labelColor}
                    labelResolution={2}
                    labelDotRadius={0.34}
                    labelIncludeDot={() => true}
                    labelLabel={(marker: object) => {
                        const item = marker as any;
                        return `${item.name} | ${item.metricLabel}`;
                    }}
                    onLabelClick={(marker: object) => handleSelectCountry((marker as any).code)}
                    onLabelHover={(marker: object | null) => setHoveredCountryCode(marker ? (marker as any).code : null)}
                    arcsData={showFlows ? visibleArcs : []}
                    arcStartLat="startLat"
                    arcStartLng="startLng"
                    arcEndLat="endLat"
                    arcEndLng="endLng"
                    arcAltitude="altitude"
                    arcColor="color"
                    arcStroke={0.65}
                    arcDashLength={0.32}
                    arcDashGap={0.8}
                    arcDashAnimateTime={1500}
                    ringsData={showPulses ? scene.rings : []}
                    ringLat="lat"
                    ringLng="lng"
                    ringColor="color"
                    ringMaxRadius="maxRadius"
                    ringPropagationSpeed="propagationSpeed"
                    ringRepeatPeriod="repeatPeriod"
                    enablePointerInteraction
                    showPointerCursor
                />
            </div>

            <div style={legendRowStyle}>
                <span style={legendTextStyle}>{lowerLabel}</span>
                <div style={legendScaleStyle}>
                    <span style={{ ...legendSwatchStyle, background: "rgba(34,211,238,0.18)" }} />
                    <span style={{ ...legendSwatchStyle, background: "rgba(34,211,238,0.4)" }} />
                    <span style={{ ...legendSwatchStyle, background: "rgba(34,211,238,0.85)" }} />
                </div>
                <span style={legendTextStyle}>{upperLabel}</span>
            </div>

            <div style={detailGridStyle}>
                <div style={detailCardStyle}>
                    <div style={detailEyebrowStyle}>FOCUS SUMMARY</div>
                    <div style={detailTitleStyle}>{focusMarker.name}</div>
                    <div style={detailBodyStyle}>{focusMarker.summary}</div>
                    <div style={detailMetaStyle}>{focusMarker.benchmark} | {focusMarker.region}</div>
                </div>
                <div style={detailCardStyle}>
                    <div style={detailEyebrowStyle}>FLOW MAP</div>
                    <div style={detailBodyStyle}>
                        {showFlows
                            ? `${visibleArcs.length} high-signal routes are rendering from the selected country into the rest of the Atlas board. White indicates the selected market while green, red, and white keep the world state readable underneath.`
                            : "Signal routes are hidden so you can inspect the raw country overlay without flow lines."}
                    </div>
                    <div style={detailMetaStyle}>Camera focus animates whenever you switch countries or replay dates.</div>
                </div>
            </div>

            {showCountryStrip ? (
                <div style={countryStripStyle}>
                    {scene.markers.map((marker) => (
                        <button
                            key={marker.code}
                            type="button"
                            style={marker.code === selectedCountryCode ? selectedCountryButtonStyle : countryButtonStyle}
                            onClick={() => handleSelectCountry(marker.code)}
                            onMouseEnter={() => setHoveredCountryCode(marker.code)}
                            onMouseLeave={() => setHoveredCountryCode((current) => current === marker.code ? null : current)}
                        >
                            <span style={countryNameStyle}>{marker.name}</span>
                            <span style={{ ...countryMetricStyle, color: marker.color }}>{marker.metricLabel}</span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

const surfaceStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    padding: "28px",
    borderRadius: 24,
    border: `1px solid ${styles.atlas.border}`,
    background: styles.atlas.gradients.panel,
    boxShadow: styles.atlas.shadow.lg,
    fontFamily: styles.atlas.font
};

const headerRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    position: "relative",
    zIndex: 2
};

const eyebrowStyle: CSSProperties = {
    color: styles.atlas.accentStrong,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2.4,
    textTransform: "uppercase"
};

const titleStyle: CSSProperties = {
    color: styles.atlas.textStrong,
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: -0.4,
    marginTop: 8,
    lineHeight: 1.2
};

const subtitleStyle: CSSProperties = {
    color: styles.atlas.muted,
    fontSize: 13,
    lineHeight: 1.6,
    marginTop: 8,
    maxWidth: 560
};

const pillStyle: CSSProperties = {
    color: styles.atlas.textStrong,
    background: styles.atlas.glass,
    border: `1px solid ${styles.atlas.border}`,
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
    backdropFilter: "blur(8px)"
};

const controlRowStyle: CSSProperties = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 20,
    position: "relative",
    zIndex: 2,
    padding: 6,
    background: "rgba(15, 21, 36, 0.55)",
    border: `1px solid ${styles.atlas.borderSoft}`,
    borderRadius: 14,
    width: "fit-content"
};

const secondaryButtonStyle: CSSProperties = {
    background: "transparent",
    color: styles.atlas.mutedStrong,
    border: "1px solid transparent",
    borderRadius: 10,
    padding: "9px 14px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.2,
    transition: "all 160ms ease"
};

const primaryButtonStyle: CSSProperties = {
    ...secondaryButtonStyle,
    background: styles.atlas.gradients.ctaAccent,
    border: `1px solid ${styles.atlas.accent}`,
    color: "#FFFFFF",
    fontWeight: 700,
    boxShadow: "0 6px 20px -8px rgba(99, 102, 241, 0.6)"
};

const globeShellStyle: CSSProperties = {
    position: "relative",
    marginTop: 22,
    borderRadius: 20,
    overflow: "hidden",
    border: `1px solid ${styles.atlas.borderSoft}`,
    background: "radial-gradient(80% 60% at 50% 40%, rgba(99,102,241,0.08) 0%, rgba(7,9,15,0) 60%), linear-gradient(180deg, #0A0F1E 0%, #060810 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 24px 48px -20px rgba(0,0,0,0.6)"
};

const hudGridStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: "linear-gradient(rgba(34,211,238,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.06) 1px, transparent 1px)",
    backgroundSize: "64px 64px",
    opacity: 0.9,
    pointerEvents: "none",
    maskImage: "radial-gradient(75% 55% at 50% 50%, #000 10%, transparent 100%)",
    WebkitMaskImage: "radial-gradient(75% 55% at 50% 50%, #000 10%, transparent 100%)"
};

const cornerTicksStyle: CSSProperties = {
    position: "absolute",
    inset: 14,
    pointerEvents: "none",
    zIndex: 3
};

const cornerLabelBase: CSSProperties = {
    position: "absolute",
    fontSize: 10,
    letterSpacing: 2,
    color: "rgba(103, 232, 249, 0.62)",
    fontWeight: 700,
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
};
const cornerLabelTopLeft: CSSProperties = { ...cornerLabelBase, top: 0, left: 0 };
const cornerLabelTopRight: CSSProperties = { ...cornerLabelBase, top: 0, right: 0 };
const cornerLabelBottomLeft: CSSProperties = { ...cornerLabelBase, bottom: 0, left: 0 };
const cornerLabelBottomRight: CSSProperties = { ...cornerLabelBase, bottom: 0, right: 0 };

const legendRowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    position: "relative",
    zIndex: 2
};

const legendScaleStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6
};

const legendSwatchStyle: CSSProperties = {
    width: 72,
    height: 6,
    borderRadius: 999,
    boxShadow: "0 0 14px currentColor"
};

const legendTextStyle: CSSProperties = {
    color: styles.atlas.muted,
    fontSize: 11
};

const detailGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
    marginTop: 18,
    position: "relative",
    zIndex: 2
};

const detailCardStyle: CSSProperties = {
    borderRadius: 16,
    padding: 18,
    background: styles.atlas.gradients.panelRaised,
    border: `1px solid ${styles.atlas.border}`,
    boxShadow: styles.atlas.shadow.md
};

const detailEyebrowStyle: CSSProperties = {
    color: styles.atlas.focusPrimary,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1.4
};

const detailTitleStyle: CSSProperties = {
    color: styles.atlas.text,
    fontSize: 16,
    fontWeight: 700,
    marginTop: 8
};

const detailBodyStyle: CSSProperties = {
    color: styles.atlas.text,
    fontSize: 13,
    lineHeight: 1.55,
    marginTop: 8
};

const detailMetaStyle: CSSProperties = {
    color: styles.atlas.muted,
    fontSize: 12,
    marginTop: 8
};

const countryStripStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
    position: "relative",
    zIndex: 2
};

const countryButtonStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    padding: "10px 14px",
    borderRadius: 12,
    background: styles.atlas.gradients.panelRaised,
    border: `1px solid ${styles.atlas.borderSoft}`,
    color: styles.atlas.text,
    cursor: "pointer",
    transition: "all 160ms ease",
    minWidth: 110
};

const selectedCountryButtonStyle: CSSProperties = {
    ...countryButtonStyle,
    background: styles.atlas.gradients.ctaAccent,
    border: `1px solid ${styles.atlas.accent}`,
    boxShadow: "0 10px 24px -12px rgba(99, 102, 241, 0.6)"
};

const countryNameStyle: CSSProperties = {
    color: styles.atlas.text,
    fontSize: 12,
    fontWeight: 700
};

const countryMetricStyle: CSSProperties = {
    fontSize: 11
};
