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
                
                renderFolder.addInput(config.rendering, 'shadows');
                renderFolder.addInput(config.rendering, 'antialias');
                renderFolder.addInput(config.rendering, 'pixelRatio', {
                    min: 0.5,
                    max: 2,
                    step: 0.1
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
                
                perfFolder.addInput(config.performance, 'adaptiveQuality');
                perfFolder.addInput(config.performance, 'showStats');
                
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
                });
                
                worldFolder.addInput(config.world, 'terrainHeight', {
                    min: 10,
                    max: 200,
                    step: 1
                });
                
                worldFolder.addInput(config.world, 'terrainScale', {
                    min: 0.001,
                    max: 0.01,
                    step: 0.001
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

