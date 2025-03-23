/**
 * User-configurable settings for the engine
 */
export const config = {
    // Rendering options
    rendering: {
        renderer: "three.js", // Options: "three.js", "babylon.js"
        antialias: true,
        antialiasLevel: 2, // 0: Off, 1: Low, 2: Medium, 3: High
        shadows: true,
        pixelRatio: window.devicePixelRatio || 1,
        maxPixelRatio: 2, // Limit for performance
        useFallbackIfFailed: true,
    },

    // Physics options
    physics: {
        engine: "cannon-es", // Options: "cannon-es", "ammo.js", "rapier", "physx", "none"
        gravity: { x: 0, y: -9.81, z: 0 },
        debug: false, // Render physics debug wireframes
        useFallbackIfFailed: true,
    },

    // Performance options
    performance: {
        targetFPS: 60,
        adaptiveQuality: true, // Automatically adjust quality for performance
        showStats: true,
        chunkLoadDistance: 3, // How many chunks to load around the camera
        chunkSize: 50, // Size of each world chunk
        chunkDetailLevels: 3, // LOD levels
        manualShadowSetting: null, // Track if shadows were manually changed
    },

    // Camera settings
    camera: {
        fov: 75,
        near: 0.1,
        far: 2000,
        position: { x: 0, y: 30, z: 100 },
        lookAt: { x: 0, y: 0, z: 0 },
        moveSpeed: 1,
    },

    // Character settings
    character: {
        moveSpeed: 10,
        rotationSpeed: 10,
        cameraOffset: { x: 0, y: 20, z: 40 },
        animationSpeed: 1.0
    },

    // World generation
    world: {
        seed: Math.random() * 10000 | 0,
        infiniteWorld: true,
        terrainType: "perlin", // Options: "perlin", "flat", "procedural"
        terrainHeight: 70,
        terrainScale: 0.005,
        dayNightCycle: true,    // Enable day/night cycle
        dayLength: 300,         // Day length in seconds
        timeOfDay: 0.3          // Starting time (0-1, where 0=midnight, 0.5=noon)
    },
    
    // Optional features
    features: {
        meshBVH: false  // Disabled to avoid CDN loading issues
    }
};

// Priority order for engine fallbacks
export const fallbacks = {
    rendering: ["three.js", "babylon.js"],
    physics: ["cannon-es", "ammo.js", "rapier", "physx", "none"]
};

// Library CDN paths
export const libraries = {
    "three.js": [
        "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js",
        "https://unpkg.com/three@0.160.0/build/three.min.js", 
        "https://esm.sh/three@0.160.0/build/three.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/three.js/r160/three.min.js"
    ],
    "babylon.js": {
        core: "https://cdn.babylonjs.com/babylon.js",
        physics: "https://cdn.babylonjs.com/babylon.physics.min.js"
    },
    "cannon-es": "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.min.js",
    "ammo.js": "https://cdn.jsdelivr.net/npm/ammo.js@0.0.10/ammo.js",
    "physx": "https://cdn.jsdelivr.net/npm/@dimforge/physx@0.2.2/physx.js",
    "rapier": "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d@0.11.2/rapier.min.js",
    "three-mesh-bvh": [
        "https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.6.6/three-mesh-bvh.umd.js",
        "https://unpkg.com/three-mesh-bvh@0.6.6/three-mesh-bvh.umd.js",
        "https://cdn.skypack.dev/three-mesh-bvh@0.6.6"
    ],
    "tweakpane": "https://cdn.jsdelivr.net/npm/tweakpane@3.1.10/dist/tweakpane.min.js"
};