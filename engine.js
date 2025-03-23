/**
 * Core engine implementation with fallback support
 */
import { config, fallbacks } from './config.js';
import { UI, PerformanceMonitor, DeviceCapabilities } from './utils.js';
import { ResourceManager } from './loaders.js';

export class Engine {
    constructor() {
        this.canvas = document.getElementById('renderCanvas');
        this.initialized = false;
        this.running = false;
        this.currentRenderingEngine = null;
        this.currentPhysicsEngine = null;
        this.activeEngines = {
            renderer: null,
            physics: null
        };
        this.resourceManager = new ResourceManager();
        this.performanceMonitor = new PerformanceMonitor(config.performance.targetFPS);
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.setupPromise = null;
        this.scene = null;

        // Set up event handlers
        this.setupEventHandlers();
        
        // Apply device-specific recommendations
        this.applyDeviceRecommendations();
    }

    // Apply settings based on device capabilities
    applyDeviceRecommendations() {
        const recommendations = DeviceCapabilities.getRecommendedSettings();
        
        // Only apply if adaptive quality is enabled
        if (config.performance.adaptiveQuality) {
            // Apply rendering recommendations
            config.rendering.shadows = recommendations.rendering.shadows;
            config.rendering.antialias = recommendations.rendering.antialias;
            config.rendering.pixelRatio = Math.min(
                config.rendering.pixelRatio,
                recommendations.rendering.pixelRatio
            );
            
            // Apply performance recommendations
            config.performance.chunkLoadDistance = recommendations.performance.chunkLoadDistance;
            config.performance.chunkDetailLevels = recommendations.performance.chunkDetailLevels;
            
            console.log('Applied device-specific settings:', recommendations);
        }
    }

    // Set up event listeners
    setupEventHandlers() {
        // Handle window resize
        window.addEventListener('resize', this.onResize.bind(this));
        
        // Handle fallback button
        const fallbackButton = document.getElementById('try-fallback');
        if (fallbackButton) {
            fallbackButton.addEventListener('click', this.tryFallback.bind(this));
        }
        
        // Handle visibility change for performance
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });
    }

    // Handle resize events
    onResize() {
        if (!this.initialized) return;
        
        if (this.activeEngines.renderer) {
            try {
                this.activeEngines.renderer.resize(window.innerWidth, window.innerHeight);
            } catch (error) {
                console.error('Error during resize:', error);
            }
        }
    }

    // Initialize the engine
    async initialize() {
        if (this.initialized) return true;
        
        UI.showLoading('Initializing Engine...');
        
        try {
            // Check WebGL support
            if (!DeviceCapabilities.checkWebGL()) {
                throw new Error('WebGL is not supported in your browser. Please try using a different browser.');
            }
            
            // Set initial rendering engine
            this.currentRenderingEngine = config.rendering.renderer;
            this.currentPhysicsEngine = config.physics.engine;
            
            // Load required libraries
            await this.resourceManager.loadRequiredLibraries(
                this.currentRenderingEngine, 
                this.currentPhysicsEngine
            );
            
            // Initialize rendering engine
            await this.initializeRenderingEngine();
            
            // Initialize physics engine
            await this.initializePhysicsEngine();
            
            this.initialized = true;
            UI.hideLoading();
            return true;
        } catch (error) {
            console.error('Engine initialization failed:', error);
            const canTryFallback = this.canTryFallback();
            UI.showError(`Engine initialization failed: ${error.message}`, canTryFallback);
            return false;
        }
    }

    // Initialize the rendering engine
    async initializeRenderingEngine() {
        UI.showLoading(`Initializing ${this.currentRenderingEngine}...`);
        
        try {
            let renderer;
            
            // Create the appropriate renderer
            if (this.currentRenderingEngine === 'three.js') {
                renderer = new ThreeRenderer(this.canvas, config);
            } else if (this.currentRenderingEngine === 'babylon.js') {
                renderer = new BabylonRenderer(this.canvas, config);
            } else {
                throw new Error(`Unsupported rendering engine: ${this.currentRenderingEngine}`);
            }
            
            // Initialize the renderer
            await renderer.initialize();
            
            this.activeEngines.renderer = renderer;
            console.log(`${this.currentRenderingEngine} initialized successfully`);
            return true;
        } catch (error) {
            console.error(`Failed to initialize ${this.currentRenderingEngine}:`, error);
            
            // Try fallback if enabled
            if (config.rendering.useFallbackIfFailed) {
                const nextEngine = this.getNextFallbackEngine('rendering');
                if (nextEngine) {
                    console.log(`Trying fallback rendering engine: ${nextEngine}`);
                    this.currentRenderingEngine = nextEngine;
                    return this.initializeRenderingEngine();
                }
            }
            
            throw error;
        }
    }

    // Initialize the physics engine
    async initializePhysicsEngine() {
        if (this.currentPhysicsEngine === 'none') {
            console.log('Physics disabled');
            this.activeEngines.physics = null;
            return true;
        }
        
        UI.showLoading(`Initializing ${this.currentPhysicsEngine}...`);
        
        try {
            let physics;
            
            // Create the appropriate physics engine
            if (this.currentPhysicsEngine === 'cannon-es') {
                physics = new CannonPhysics(config.physics);
            } else if (this.currentPhysicsEngine === 'ammo.js') {
                physics = new AmmoPhysics(config.physics);
            } else if (this.currentPhysicsEngine === 'rapier') {
                physics = new RapierPhysics(config.physics);
            } else if (this.currentPhysicsEngine === 'physx') {
                physics = new PhysXPhysics(config.physics);
            } else {
                throw new Error(`Unsupported physics engine: ${this.currentPhysicsEngine}`);
            }
            
            // Initialize the physics engine
            await physics.initialize();
            
            this.activeEngines.physics = physics;
            console.log(`${this.currentPhysicsEngine} initialized successfully`);
            return true;
        } catch (error) {
            console.error(`Failed to initialize ${this.currentPhysicsEngine}:`, error);
            
            // Try fallback if enabled
            if (config.physics.useFallbackIfFailed) {
                const nextEngine = this.getNextFallbackEngine('physics');
                if (nextEngine) {
                    console.log(`Trying fallback physics engine: ${nextEngine}`);
                    this.currentPhysicsEngine = nextEngine;
                    return this.initializePhysicsEngine();
                }
            }
            
            // Still continue if physics fails but with a warning
            console.warn('Continuing without physics');
            this.activeEngines.physics = null;
            return true;
        }
    }

    // Start the main loop
    start() {
        if (!this.initialized) {
            console.error('Cannot start engine before initialization');
            return false;
        }
        
        if (this.running) return true;
        
        this.running = true;
        this.lastFrameTime = performance.now();
        requestAnimationFrame(this.mainLoop.bind(this));
        
        return true;
    }

    // Pause the engine
    pause() {
        this.running = false;
    }

    // Resume the engine
    resume() {
        if (!this.running && this.initialized) {
            this.running = true;
            this.lastFrameTime = performance.now();
            requestAnimationFrame(this.mainLoop.bind(this));
        }
    }

    // Main loop
    mainLoop(timestamp) {
        if (!this.running) return;
        
        this.performanceMonitor.startFrame();
        
        // Calculate delta time
        const deltaTime = (timestamp - this.lastFrameTime) / 1000;
        this.lastFrameTime = timestamp;
        
        // Update physics
        if (this.activeEngines.physics) {
            try {
                this.activeEngines.physics.update(deltaTime);
            } catch (error) {
                console.error('Physics update error:', error);
            }
        }
        
        // Update scene
        if (this.scene) {
            try {
                this.scene.update(deltaTime);
            } catch (error) {
                console.error('Scene update error:', error);
            }
        }
        
        // Render frame
        if (this.activeEngines.renderer) {
            try {
                this.activeEngines.renderer.render(deltaTime);
            } catch (error) {
                console.error('Render error:', error);
                // Try to recover from render errors
                this.handleRenderError(error);
            }
        }
        
        // Performance monitoring
        this.performanceMonitor.endFrame();
        this.frameCount++;
        
        // Adaptive quality if enabled
        if (config.performance.adaptiveQuality && this.frameCount % 60 === 0) {
            this.adjustQualityForPerformance();
        }
        
        // Continue loop if still running
        if (this.running) {
            requestAnimationFrame(this.mainLoop.bind(this));
        }
    }

    // Handle render errors with recovery attempts
    handleRenderError(error) {
        console.warn('Attempting to recover from render error');
        
        // Try resetting the renderer first
        try {
            if (this.activeEngines.renderer) {
                this.activeEngines.renderer.reset();
            }
        } catch (resetError) {
            console.error('Failed to reset renderer:', resetError);
            
            // If reset fails, try fallback
            if (config.rendering.useFallbackIfFailed) {
                this.tryFallback();
            } else {
                // Stop engine if no fallback available
                this.running = false;
                UI.showError('Rendering error: ' + error.message, this.canTryFallback());
            }
        }
    }

    // Adjust quality settings based on performance
    adjustQualityForPerformance() {
        const avgFPS = this.performanceMonitor.getAverageFPS();
        const targetFPS = config.performance.targetFPS;
        
        // If FPS is too low, reduce quality
        if (avgFPS < targetFPS * 0.8) {
            if (config.rendering.shadows) {
                console.log('Reducing quality: Disabling shadows');
                config.rendering.shadows = false;
                if (this.activeEngines.renderer) {
                    this.activeEngines.renderer.updateSettings({ shadows: false });
                }
                return;
            }
            
            if (config.performance.chunkLoadDistance > 1) {
                console.log('Reducing quality: Decreasing chunk load distance');
                config.performance.chunkLoadDistance--;
                if (this.scene) {
                    this.scene.updateChunkSettings();
                }
                return;
            }
            
            if (config.rendering.pixelRatio > 1) {
                console.log('Reducing quality: Lowering pixel ratio');
                config.rendering.pixelRatio = 1;
                if (this.activeEngines.renderer) {
                    this.activeEngines.renderer.updateSettings({ pixelRatio: 1 });
                }
                return;
            }
        }
        
        // If FPS is very high, we can increase quality
        if (avgFPS > targetFPS * 1.5) {
            if (!config.rendering.shadows && this.performanceMonitor.getAverageFPS() > targetFPS * 1.8) {
                console.log('Increasing quality: Enabling shadows');
                config.rendering.shadows = true;
                if (this.activeEngines.renderer) {
                    this.activeEngines.renderer.updateSettings({ shadows: true });
                }
                return;
            }
            
            if (config.performance.chunkLoadDistance < 3 && this.performanceMonitor.getAverageFPS() > targetFPS * 1.8) {
                console.log('Increasing quality: Increasing chunk load distance');
                config.performance.chunkLoadDistance++;
                if (this.scene) {
                    this.scene.updateChunkSettings();
                }
                return;
            }
        }
    }

    // Get the next fallback engine option
    getNextFallbackEngine(type) {
        const currentEngine = type === 'rendering' ? this.currentRenderingEngine : this.currentPhysicsEngine;
        const fallbackOptions = fallbacks[type];
        
        const currentIndex = fallbackOptions.indexOf(currentEngine);
        if (currentIndex >= 0 && currentIndex < fallbackOptions.length - 1) {
            return fallbackOptions[currentIndex + 1];
        }
        
        return null;
    }

    // Check if fallback is available
    canTryFallback() {
        return this.getNextFallbackEngine('rendering') !== null || 
               this.getNextFallbackEngine('physics') !== null;
    }

    // Try fallback engines
    async tryFallback() {
        UI.hideError();
        
        // Try renderer fallback first
        const nextRendererEngine = this.getNextFallbackEngine('rendering');
        if (nextRendererEngine) {
            console.log(`Trying fallback rendering engine: ${nextRendererEngine}`);
            this.currentRenderingEngine = nextRendererEngine;
            
            // Clean up current renderer if exists
            if (this.activeEngines.renderer) {
                try {
                    this.activeEngines.renderer.dispose();
                } catch (error) {
                    console.warn('Error disposing renderer:', error);
                }
                this.activeEngines.renderer = null;
            }
            
            this.initialized = false;
            this.running = false;
            
            // Reinitialize
            this.setupPromise = this.initialize();
            await this.setupPromise;
            
            if (this.initialized) {
                this.start();
            }
            return;
        }
        
        // If renderer fallback not available, try physics fallback
        const nextPhysicsEngine = this.getNextFallbackEngine('physics');
        if (nextPhysicsEngine) {
            console.log(`Trying fallback physics engine: ${nextPhysicsEngine}`);
            this.currentPhysicsEngine = nextPhysicsEngine;
            
            // Clean up current physics if exists
            if (this.activeEngines.physics) {
                try {
                    this.activeEngines.physics.dispose();
                } catch (error) {
                    console.warn('Error disposing physics:', error);
                }
                this.activeEngines.physics = null;
            }
            
            // Reinitialize physics only
            try {
                await this.initializePhysicsEngine();
                if (this.initialized && !this.running) {
                    this.start();
                }
            } catch (error) {
                console.error('Failed to initialize fallback physics:', error);
                UI.showError('Failed to initialize fallback physics: ' + error.message, false);
            }
        }
    }

    // Clean up all resources
    dispose() {
        this.running = false;
        
        // Dispose renderer
        if (this.activeEngines.renderer) {
            try {
                this.activeEngines.renderer.dispose();
            } catch (error) {
                console.warn('Error disposing renderer:', error);
            }
            this.activeEngines.renderer = null;
        }
        
        // Dispose physics
        if (this.activeEngines.physics) {
            try {
                this.activeEngines.physics.dispose();
            } catch (error) {
                console.warn('Error disposing physics:', error);
            }
            this.activeEngines.physics = null;
        }
        
        // Clean up scene
        if (this.scene) {
            try {
                this.scene.dispose();
            } catch (error) {
                console.warn('Error disposing scene:', error);
            }
            this.scene = null;
        }
        
        // Cancel any loading resources
        this.resourceManager.cancelAllResourceLoads();
        
        // Remove event listeners
        window.removeEventListener('resize', this.onResize);
        
        this.initialized = false;
    }

    // Set the active scene
    setScene(scene) {
        if (this.scene) {
            try {
                this.scene.dispose();
            } catch (error) {
                console.warn('Error disposing previous scene:', error);
            }
        }
        
        this.scene = scene;
        
        if (this.activeEngines.renderer) {
            this.activeEngines.renderer.setActiveScene(scene);
        }
        
        return true;
    }
}

// Three.js renderer implementation
class ThreeRenderer {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.config = config;
        this.renderer = null;
        this.camera = null;
        this.scene = null;
        this.activeScene = null;
        this.clock = null;
    }
    
    async initialize() {
        // Import Three.js modules
        try {
            // Create THREE scene
            this.scene = new THREE.Scene();
            
            // Create renderer
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: this.config.rendering.antialias,
                alpha: false
            });
            
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setPixelRatio(Math.min(
                this.config.rendering.pixelRatio,
                this.config.rendering.maxPixelRatio
            ));
            
            // Enable shadows if configured
            if (this.config.rendering.shadows) {
                this.renderer.shadowMap.enabled = true;
                this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            }
            
            // Setup camera
            this.camera = new THREE.PerspectiveCamera(
                this.config.camera.fov,
                window.innerWidth / window.innerHeight,
                this.config.camera.near,
                this.config.camera.far
            );
            
            this.camera.position.set(
                this.config.camera.position.x,
                this.config.camera.position.y,
                this.config.camera.position.z
            );
            
            this.camera.lookAt(
                this.config.camera.lookAt.x,
                this.config.camera.lookAt.y,
                this.config.camera.lookAt.z
            );
            
            // Add ambient light
            const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
            this.scene.add(ambientLight);
            
            // Add directional light (sun)
            const dirLight = new THREE.DirectionalLight(0xffffff, 1);
            dirLight.position.set(100, 100, 50);
            
            if (this.config.rendering.shadows) {
                dirLight.castShadow = true;
                dirLight.shadow.mapSize.width = 2048;
                dirLight.shadow.mapSize.height = 2048;
                dirLight.shadow.camera.near = 0.5;
                dirLight.shadow.camera.far = 500;
                dirLight.shadow.camera.left = -100;
                dirLight.shadow.camera.right = 100;
                dirLight.shadow.camera.top = 100;
                dirLight.shadow.camera.bottom = -100;
            }
            
            this.scene.add(dirLight);
            
            // Create clock for timing
            this.clock = new THREE.Clock();
            
            // Add fog for distance culling
            this.scene.fog = new THREE.FogExp2(0xcccccc, 0.002);
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Three.js renderer:', error);
            throw error;
        }
    }
    
    resize(width, height) {
        if (!this.renderer || !this.camera) return;
        
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
    
    render(deltaTime) {
        if (!this.renderer || !this.scene || !this.camera) return;
        
        // Update camera from active scene
        if (this.activeScene && this.activeScene.updateCamera) {
            this.activeScene.updateCamera(this.camera, deltaTime);
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    reset() {
        if (this.renderer) {
            this.renderer.resetState();
        }
    }
    
    setActiveScene(scene) {
        this.activeScene = scene;
        
        if (scene && scene.getThreeScene) {
            // If scene provides a Three scene, use it
            this.scene = scene.getThreeScene();
        }
    }
    
    updateSettings(settings) {
        if (settings.shadows !== undefined && this.renderer) {
            this.renderer.shadowMap.enabled = settings.shadows;
            
            // Update all lights
            if (this.scene) {
                this.scene.traverse(obj => {
                    if (obj.isLight) {
                        obj.castShadow = settings.shadows;
                    }
                });
            }
        }
        
        if (settings.pixelRatio !== undefined && this.renderer) {
            this.renderer.setPixelRatio(Math.min(
                settings.pixelRatio,
                this.config.rendering.maxPixelRatio
            ));
        }
    }
    
    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        
        this.scene = null;
        this.camera = null;
        this.activeScene = null;
        this.clock = null;
    }
    
    // Get the Three.js camera for use by scenes
    getCamera() {
        return this.camera;
    }
    
    // Add an object to the scene
    addToScene(object) {
        if (this.scene) {
            this.scene.add(object);
        }
    }
    
    // Remove an object from the scene
    removeFromScene(object) {
        if (this.scene) {
            this.scene.remove(object);
        }
    }
}

// Babylon.js renderer implementation
class BabylonRenderer {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.config = config;
        this.engine = null;
        this.scene = null;
        this.camera = null;
        this.activeScene = null;
    }
    
    async initialize() {
        // Wait until Babylon.js is loaded
        if (typeof BABYLON === 'undefined') {
            throw new Error('Babylon.js not loaded');
        }
        
        try {
            // Create Babylon engine
            this.engine = new BABYLON.Engine(this.canvas, this.config.rendering.antialias, {
                preserveDrawingBuffer: true,
                stencil: true
            });
            
            // Set pixel ratio
            const pixelRatio = Math.min(
                this.config.rendering.pixelRatio,
                this.config.rendering.maxPixelRatio
            );
            this.engine.setHardwareScalingLevel(1 / pixelRatio);
            
            // Create scene
            this.scene = new BABYLON.Scene(this.engine);
            
            // Set fog
            this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
            this.scene.fogDensity = 0.002;
            this.scene.fogColor = new BABYLON.Color3(0.8, 0.8, 0.8);
            
            // Create camera
            this.camera = new BABYLON.FreeCamera(
                'camera', 
                new BABYLON.Vector3(
                    this.config.camera.position.x,
                    this.config.camera.position.y,
                    this.config.camera.position.z
                ),
                this.scene
            );
            
            this.camera.setTarget(new BABYLON.Vector3(
                this.config.camera.lookAt.x,
                this.config.camera.lookAt.y,
                this.config.camera.lookAt.z
            ));
            
            this.camera.attachControl(this.canvas, true);
            
            // Add ambient light
            const ambientLight = new BABYLON.HemisphericLight(
                'ambientLight',
                new BABYLON.Vector3(0, 1, 0),
                this.scene
            );
            ambientLight.intensity = 0.5;
            
            // Add directional light (sun)
            const dirLight = new BABYLON.DirectionalLight(
                'dirLight',
                new BABYLON.Vector3(-1, -1, -0.5),
                this.scene
            );
            dirLight.position = new BABYLON.Vector3(100, 100, 50);
            dirLight.intensity = 1.0;
            
            // Enable shadows if configured
            if (this.config.rendering.shadows) {
                const shadowGenerator = new BABYLON.ShadowGenerator(2048, dirLight);
                shadowGenerator.useBlurExponentialShadowMap = true;
                shadowGenerator.blurKernel = 32;
                this.shadowGenerator = shadowGenerator;
            }
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Babylon.js renderer:', error);
            throw error;
        }
    }
    
    resize(width, height) {
        if (this.engine) {
            this.engine.resize();
        }
    }
    
    render(deltaTime) {
        if (!this.engine || !this.scene) return;
        
        // Update camera from active scene
        if (this.activeScene && this.activeScene.updateCamera) {
            this.activeScene.updateCamera(this.camera, deltaTime);
        }
        
        this.scene.render();
    }
    
    reset() {
        if (this.engine) {
            this.engine.restoreState();
        }
    }
    
    setActiveScene(scene) {
        this.activeScene = scene;
        
        if (scene && scene.getBabylonScene) {
            // If scene provides a Babylon scene, use it
            this.scene = scene.getBabylonScene();
        }
    }
    
    updateSettings(settings) {
        if (settings.shadows !== undefined && this.scene) {
            if (settings.shadows && !this.shadowGenerator && this.scene.lights[1]) {
                // Create shadow generator if needed
                this.shadowGenerator = new BABYLON.ShadowGenerator(2048, this.scene.lights[1]);
                this.shadowGenerator.useBlurExponentialShadowMap = true;
                this.shadowGenerator.blurKernel = 32;
            } else if (!settings.shadows && this.shadowGenerator) {
                // Disable shadows
                this.shadowGenerator.dispose();
                this.shadowGenerator = null;
            }
        }
        
        if (settings.pixelRatio !== undefined && this.engine) {
            const pixelRatio = Math.min(
                settings.pixelRatio,
                this.config.rendering.maxPixelRatio
            );
            this.engine.setHardwareScalingLevel(1 / pixelRatio);
        }
    }
    
    dispose() {
        if (this.shadowGenerator) {
            this.shadowGenerator.dispose();
            this.shadowGenerator = null;
        }
        
        if (this.scene) {
            this.scene.dispose();
            this.scene = null;
        }
        
        if (this.engine) {
            this.engine.dispose();
            this.engine = null;
        }
        
        this.camera = null;
        this.activeScene = null;
    }
    
    // Get the Babylon camera for use by scenes
    getCamera() {
        return this.camera;
    }
    
    // Add an object to the scene
    addToScene(object) {
        // Objects are automatically added to the scene in Babylon
    }
    
    // Remove an object from the scene
    removeFromScene(object) {
        if (object && object.dispose) {
            object.dispose();
        }
    }
}

// Cannon.js physics implementation
class CannonPhysics {
    constructor(config) {
        this.config = config;
        this.world = null;
        this.bodies = [];
        this.debugRenderer = null;
    }
    
    async initialize() {
        try {
            // Check if CANNON is defined
            if (typeof CANNON === 'undefined') {
                console.warn('CANNON not found in global scope, checking for window.CANNON');
                // Try alternative global variable
                if (typeof window.CANNON !== 'undefined') {
                    window.CANNON = window.CANNON;
                } else {
                    // Try to load it if not available
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.min.js";
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                    
                    // If still undefined after loading, throw error
                    if (typeof CANNON === 'undefined' && typeof window.CANNON === 'undefined') {
                        throw new Error('Cannot load Cannon.js');
                    } else if (typeof window.CANNON !== 'undefined') {
                        window.CANNON = window.CANNON;
                    }
                }
            }
            
            // Initialize Cannon world
            this.world = new CANNON.World();
            this.world.gravity.set(
                this.config.gravity.x,
                this.config.gravity.y,
                this.config.gravity.z
            );
            
            // Set solver iterations
            this.world.solver.iterations = 10;
            
            // Enable broadphase optimization
            this.world.broadphase = new CANNON.SAPBroadphase(this.world);
            
            // Enable sleeping for better performance
            this.world.allowSleep = true;
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Cannon.js physics:', error);
            throw error;
        }
    }
    
    update(deltaTime) {
        if (!this.world) return;
        
        // Limit max step to prevent tunneling at low framerates
        const maxSubSteps = 3;
        const fixedTimeStep = 1/60;
        
        this.world.step(fixedTimeStep, deltaTime, maxSubSteps);
    }
    
    createBody(options) {
        if (!this.world) return null;
        
        try {
            const body = new CANNON.Body({
                mass: options.mass,
                position: new CANNON.Vec3(
                    options.position.x,
                    options.position.y,
                    options.position.z
                ),
                shape: options.shape,
                material: options.material
            });
            
            this.world.addBody(body);
            this.bodies.push(body);
            
            return body;
        } catch (error) {
            console.error('Error creating physics body:', error);
            return null;
        }
    }
    
    removeBody(body) {
        if (!this.world || !body) return;
        
        try {
            this.world.removeBody(body);
            const index = this.bodies.indexOf(body);
            if (index >= 0) {
                this.bodies.splice(index, 1);
            }
        } catch (error) {
            console.error('Error removing physics body:', error);
        }
    }
    
    enableDebug(scene, renderer) {
        if (this.config.debug && scene && renderer && !this.debugRenderer) {
            try {
                // Simple debug visualization
                this.debugMeshes = [];
                
                // We'll implement a simple debug renderer here
                // This will be improved in a real implementation
            } catch (error) {
                console.error('Error enabling physics debug:', error);
            }
        }
    }
    
    dispose() {
        if (this.debugRenderer) {
            // Clean up debug renderer
            this.debugRenderer = null;
        }
        
        // Clear all bodies
        if (this.world) {
            this.bodies.forEach(body => {
                this.world.removeBody(body);
            });
            this.bodies = [];
            this.world = null;
        }
    }
}

// Ammo.js physics implementation
class AmmoPhysics {
    constructor(config) {
        this.config = config;
        this.world = null;
        this.bodies = [];
    }
    
    async initialize() {
        if (typeof Ammo === 'undefined') {
            console.warn('Ammo not found in global scope');
            // Try to load Ammo.js
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = "https://cdnjs.cloudflare.com/ajax/libs/ammo.js/2.0.0/ammo.js";
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
                
                // Check again after attempted load
                if (typeof Ammo === 'undefined') {
                    throw new Error('Ammo.js not loaded');
                }
            } catch (error) {
                throw new Error('Ammo.js not loaded');
            }
        }
        
        try {
            // Wait for Ammo to initialize (it's asynchronous)
            if (typeof Ammo === 'function') {
                await new Promise(resolve => {
                    Ammo().then(resolve);
                });
            }
            
            // Set up physics world
            const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
            const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
            const broadphase = new Ammo.btDbvtBroadphase();
            const solver = new Ammo.btSequentialImpulseConstraintSolver();
            
            this.world = new Ammo.btDiscreteDynamicsWorld(
                dispatcher, 
                broadphase, 
                solver, 
                collisionConfiguration
            );
            
            // Set gravity
            this.world.setGravity(new Ammo.btVector3(
                this.config.gravity.x,
                this.config.gravity.y,
                this.config.gravity.z
            ));
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Ammo.js physics:', error);
            throw error;
        }
    }
    
    update(deltaTime) {
        if (!this.world) return;
        
        // Simulate physics with fixed timestep
        this.world.stepSimulation(deltaTime, 10);
    }
    
    dispose() {
        // Clean up Ammo.js resources
        // This is just a stub - proper Ammo cleanup would be needed
        this.world = null;
        this.bodies = [];
    }
}

// RapierPhysics implementation
class RapierPhysics {
    constructor(config) {
        this.config = config;
        this.world = null;
        this.bodies = [];
    }
    
    async initialize() {
        if (typeof RAPIER === 'undefined') {
            console.warn('RAPIER not found in global scope');
            // Try to load Rapier
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d@0.11.2/rapier.min.js";
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
                
                // Check again after attempted load
                if (typeof RAPIER === 'undefined') {
                    throw new Error('Rapier not loaded');
                }
            } catch (error) {
                throw new Error('Rapier not loaded');
            }
        }
        
        try {
            // Initialize Rapier world
            this.world = new RAPIER.World(new RAPIER.Vector3(
                this.config.gravity.x,
                this.config.gravity.y,
                this.config.gravity.z
            ));
            
            return true;
        } catch (error) {
            console.error('Failed to initialize Rapier physics:', error);
            throw error;
        }
    }
    
    update(deltaTime) {
        if (!this.world) return;
        
        // Simulate physics step
        this.world.step();
    }
    
    dispose() {
        // Clean up Rapier resources
        this.world = null;
        this.bodies = [];
    }
}

// PhysXPhysics implementation
class PhysXPhysics {
    constructor(config) {
        this.config = config;
        this.world = null;
    }
    
    async initialize() {
        if (typeof PhysX === 'undefined') {
            console.warn('PhysX not found in global scope');
            // Try to load PhysX
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = "https://cdn.jsdelivr.net/npm/@dimforge/physx@0.2.2/physx.js";
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
                
                // Check again after attempted load
                if (typeof PhysX === 'undefined') {
                    throw new Error('PhysX not loaded');
                }
            } catch (error) {
                throw new Error('PhysX not loaded');
            }
        }
        
        try {
            // Initialize PhysX (this is a stub)
            // In reality, PhysX initialization is more complex
            
            return true;
        } catch (error) {
            console.error('Failed to initialize PhysX physics:', error);
            throw error;
        }
    }
    
    update(deltaTime) {
        // This is a stub. Real PhysX implementation would go here.
    }
    
    dispose() {
        // Clean up PhysX resources
        this.world = null;
    }
}