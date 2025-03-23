/**
 * Main application entry point
 */
import { Engine } from './engine.js';
import { ChunkedScene } from './scene.js';
import { config } from './config.js';
import { UI } from './utils.js';

class Application {
    constructor() {
        this.engine = null;
        this.initialized = false;
        this.setupUI();
    }
    
    async initialize() {
        try {
            UI.showLoading('Starting engine...');
            
            // Create and initialize engine
            this.engine = new Engine();
            const success = await this.engine.initialize();
            
            if (!success) {
                console.error('Failed to initialize engine');
                return false;
            }
            
            // Create scene
            const scene = new ChunkedScene(this.engine);
            this.engine.setScene(scene);
            
            // Start the engine
            this.engine.start();
            
            this.initialized = true;
            UI.hideLoading();
            
            return true;
        } catch (error) {
            console.error('Application initialization failed:', error);
            UI.showError(`Failed to start application: ${error.message}`, true);
            return false;
        }
    }
    
    setupUI() {
        // Set up the debug UI panel using Tweakpane
        const setupDebugPanel = () => {
            if (typeof Tweakpane === 'undefined') return;
            
            try {
                const pane = new Tweakpane.Pane({
                    container: document.getElementById('settings-container')
                });
                
                // Rendering settings
                const renderFolder = pane.addFolder({
                    title: 'Rendering',
                    expanded: false
                });
                
                renderFolder.addInput(config.rendering, 'shadows').on('change', () => {
                    if (this.engine && this.engine.activeEngines.renderer) {
                        this.engine.activeEngines.renderer.updateSettings({ shadows: config.rendering.shadows });
                    }
                });
                
                renderFolder.addInput(config.rendering, 'antialias');
                
                renderFolder.addInput(config.rendering, 'pixelRatio', {
                    min: 0.5,
                    max: 2,
                    step: 0.1
                }).on('change', () => {
                    if (this.engine && this.engine.activeEngines.renderer) {
                        this.engine.activeEngines.renderer.updateSettings({ pixelRatio: config.rendering.pixelRatio });
                    }
                });
                
                // Performance settings
                const perfFolder = pane.addFolder({
                    title: 'Performance',
                    expanded: false
                });
                
                perfFolder.addInput(config.performance, 'targetFPS', {
                    min: 30,
                    max: 144,
                    step: 1
                }).on('change', () => {
                    if (this.engine && this.engine.performanceMonitor) {
                        this.engine.performanceMonitor.targetFPS = config.performance.targetFPS;
                    }
                });
                
                perfFolder.addInput(config.performance, 'chunkLoadDistance', {
                    min: 1,
                    max: 10,
                    step: 1
                }).on('change', () => {
                    if (this.engine && this.engine.scene) {
                        this.engine.scene.updateChunkSettings();
                    }
                });
                
                perfFolder.addInput(config.performance, 'adaptiveQuality').on('change', () => {
                    // No need for immediate action - this controls a behavior
                });
                
                perfFolder.addInput(config.performance, 'showStats').on('change', () => {
                    if (this.engine && this.engine.performanceMonitor) {
                        this.engine.performanceMonitor.enabled = config.performance.showStats;
                        document.getElementById('performance-stats').style.display = 
                            config.performance.showStats ? 'block' : 'none';
                    }
                });
                
                // World settings
                const worldFolder = pane.addFolder({
                    title: 'World',
                    expanded: false
                });
                
                worldFolder.addInput(config.world, 'terrainType', {
                    options: {
                        Flat: 'flat',
                        Perlin: 'perlin'
                    }
                }).on('change', () => {
                    if (this.engine && this.engine.scene) {
                        // Force reload chunks with new terrain type
                        this.engine.scene.lastCameraChunkX = null;
                        this.engine.scene.lastCameraChunkZ = null;
                    }
                });
                
                worldFolder.addInput(config.world, 'terrainHeight', {
                    min: 10,
                    max: 200,
                    step: 1
                }).on('change', () => {
                    if (this.engine && this.engine.scene) {
                        this.engine.scene.terrainHeight = config.world.terrainHeight;
                        // Force reload chunks
                        this.engine.scene.lastCameraChunkX = null;
                        this.engine.scene.lastCameraChunkZ = null;
                    }
                });
                
                worldFolder.addInput(config.world, 'terrainScale', {
                    min: 0.001,
                    max: 0.01,
                    step: 0.001
                }).on('change', () => {
                    if (this.engine && this.engine.scene) {
                        this.engine.scene.terrainScale = config.world.terrainScale;
                        // Force reload chunks
                        this.engine.scene.lastCameraChunkX = null;
                        this.engine.scene.lastCameraChunkZ = null;
                    }
                });
                
                worldFolder.addInput(config.world, 'dayNightCycle').on('change', () => {
                    // Toggle day/night cycle
                });
                
                worldFolder.addInput(config.world, 'dayLength', {
                    min: 60,  // 1 minute
                    max: 600, // 10 minutes
                    step: 30
                });
                
                worldFolder.addInput(config.world, 'timeOfDay', {
                    min: 0, 
                    max: 1,
                    step: 0.01
                }).on('change', () => {
                    if (this.engine && this.engine.scene) {
                        this.engine.scene.timeOfDay = config.world.timeOfDay;
                    }
                });
                
                worldFolder.addButton({
                    title: 'Regenerate World'
                }).on('click', () => {
                    config.world.seed = Math.random() * 10000 | 0;
                    if (this.engine && this.engine.scene) {
                        // Force reload chunks
                        this.engine.scene.lastCameraChunkX = null;
                        this.engine.scene.lastCameraChunkZ = null;
                    }
                });
                
                // Engine info
                const infoFolder = pane.addFolder({
                    title: 'Engine Info',
                    expanded: false
                });
                
                const engines = {
                    renderer: 'Not initialized',
                    physics: 'Not initialized'
                };
                
                infoFolder.addMonitor(engines, 'renderer', {
                    label: 'Rendering'
                });
                
                infoFolder.addMonitor(engines, 'physics', {
                    label: 'Physics'
                });
                
                // Update info periodically
                setInterval(() => {
                    if (this.engine) {
                        engines.renderer = this.engine.currentRenderingEngine || 'None';
                        engines.physics = this.engine.currentPhysicsEngine || 'None';
                    }
                }, 1000);
                
                // Show the settings panel
                document.getElementById('settings-panel').classList.remove('hidden');
            } catch (error) {
                console.error('Error setting up debug panel:', error);
            }
        };
        
        // Set up the panel once the library is loaded
        if (typeof Tweakpane !== 'undefined') {
            setupDebugPanel();
        } else {
            // Wait for tweakpane to load
            window.addEventListener('load', () => {
                if (typeof Tweakpane !== 'undefined') {
                    setupDebugPanel();
                }
            });
        }
    }
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    const app = new Application();
    await app.initialize();
});