declare module "three" {
    export class Color {
        constructor(value?: string | number);
    }

    export class MeshPhongMaterial {
        color: Color;
        emissive: Color;
        emissiveIntensity: number;
        shininess: number;
        transparent: boolean;
        opacity: number;
        constructor(parameters?: Record<string, unknown>);
    }

    export class AmbientLight {
        constructor(color?: string | number, intensity?: number);
    }

    export class DirectionalLight {
        position: {
            set: (x: number, y: number, z: number) => void;
        };
        constructor(color?: string | number, intensity?: number);
    }

    export class Fog {
        constructor(color: string | number, near: number, far: number);
    }

    export type Material = any;
    export type Texture = any;
    export type Object3D = any;
    export type Light = any;
    export type Scene = any;
    export type Camera = any;
    export type WebGLRenderer = any;
}

declare module "three/examples/jsm/controls/OrbitControls.js" {
    export class OrbitControls {
        enablePan: boolean;
        enableDamping: boolean;
        dampingFactor: number;
        autoRotate: boolean;
        autoRotateSpeed: number;
        minDistance: number;
        maxDistance: number;
    }
}

declare module "three/examples/jsm/postprocessing/EffectComposer.js" {
    export class EffectComposer {}
}
