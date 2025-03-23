/**
 * Library loaders and resource management
 */
import { libraries } from './config.js';
import { UI } from './utils.js';

// Manages library loading and resource acquisition
export class ResourceManager {
    constructor() {
        this.loadedLibraries = new Map();
        this.resourceCache = new Map();
        this.abortControllers = new Map();
        this.totalResourcesLoaded = 0;
        this.totalResourcesQueued = 0;
    }

    // Load a JavaScript library from URL
    async loadLibrary(name, url) {
        if (this.loadedLibraries.has(name)) {
            return this.loadedLibraries.get(name);
        }
        
        UI.showLoading(`Loading library: ${name}`);
        
        // Handle array of URLs (fallbacks)
        const urls = Array.isArray(url) ? url : [url];
        
        for (let i = 0; i < urls.length; i++) {
            try {
                const currentUrl = urls[i];
                
                // Check if this is a module that should be imported directly
                if (currentUrl.endsWith('.module.js') || currentUrl.endsWith('index.module.js')) {
                    try {
                        // Use dynamic import for ES modules
                        await import(currentUrl);
                        console.log(`Library loaded successfully: ${name} from ${currentUrl}`);
                        this.loadedLibraries.set(name, true);
                        return true;
                    } catch (importError) {
                        console.warn(`Failed to import module from: ${currentUrl}`, importError);
                        throw importError;
                    }
                }
                
                const result = await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = currentUrl;
                    script.async = true;
                    
                    script.onload = () => {
                        console.log(`Library loaded successfully: ${name} from ${currentUrl}`);
                        this.loadedLibraries.set(name, true);
                        resolve(true);
                    };
                    
                    script.onerror = (error) => {
                        console.warn(`Failed to load library from: ${currentUrl}`, error);
                        reject(new Error(`Failed to load from ${currentUrl}`));
                    };
                    
                    document.body.appendChild(script);
                });
                
                // If we got here, the library loaded successfully
                return result;
            } catch (error) {
                console.warn(`Attempt ${i+1}/${urls.length} failed for ${name}`);
                
                // If this was the last attempt, throw the error
                if (i === urls.length - 1) {
                    console.error(`All ${urls.length} attempts failed for library: ${name}`);
                    throw new Error(`Failed to load library: ${name}`);
                }
                // Otherwise continue to the next URL
            }
        }
    }
    
    // Load all required libraries based on the config
    async loadRequiredLibraries(renderingEngine, physicsEngine) {
        const librariesToLoad = [];
        
        // Add rendering engine library
        if (renderingEngine === 'three.js') {
            librariesToLoad.push({
                name: 'three.js',
                url: libraries['three.js']
            });
            
            // Also add three-mesh-bvh for optimized collision
            librariesToLoad.push({
                name: 'three-mesh-bvh',
                url: libraries['three-mesh-bvh']
            });
        } else if (renderingEngine === 'babylon.js') {
            librariesToLoad.push({
                name: 'babylon-core',
                url: libraries['babylon.js'].core
            });
        }
        
        // Add physics engine library
        if (physicsEngine === 'cannon-es') {
            librariesToLoad.push({
                name: 'cannon-es',
                url: libraries['cannon-es']
            });
        } else if (physicsEngine === 'ammo.js') {
            librariesToLoad.push({
                name: 'ammo.js',
                url: libraries['ammo.js']
            });
        } else if (physicsEngine === 'physx') {
            librariesToLoad.push({
                name: 'physx',
                url: libraries['physx']
            });
        } else if (physicsEngine === 'rapier') {
            librariesToLoad.push({
                name: 'rapier',
                url: libraries['rapier']
            });
        }
        
        // Add babylon physics if using babylon
        if (renderingEngine === 'babylon.js' && physicsEngine !== 'none') {
            librariesToLoad.push({
                name: 'babylon-physics',
                url: libraries['babylon.js'].physics
            });
        }
        
        // Add debugging tools
        librariesToLoad.push({
            name: 'tweakpane',
            url: libraries['tweakpane']
        });
        
        // Calculate total libraries to load for progress tracking
        const totalLibraries = librariesToLoad.length;
        let loadedCount = 0;
        
        // Load all libraries in parallel
        try {
            const promises = librariesToLoad.map(lib => {
                return this.loadLibrary(lib.name, lib.url).then(() => {
                    loadedCount++;
                    UI.updateProgress((loadedCount / totalLibraries) * 100);
                });
            });
            
            await Promise.all(promises);
            console.log('All libraries loaded successfully');
            return true;
        } catch (error) {
            console.error('Failed to load all required libraries', error);
            throw error;
        }
    }
    
    // Load a texture, model, or other asset with caching
    async loadResource(url, type = 'blob', useCache = true) {
        // Return from cache if available
        if (useCache && this.resourceCache.has(url)) {
            return this.resourceCache.get(url);
        }
        
        this.totalResourcesQueued++;
        const resourceIndex = this.totalResourcesQueued;
        
        // Create abort controller for cancellation
        const controller = new AbortController();
        this.abortControllers.set(url, controller);
        
        try {
            const response = await fetch(url, { 
                signal: controller.signal 
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load resource: ${url} (${response.status})`);
            }
            
            let data;
            
            // Process based on requested return type
            switch (type) {
                case 'json':
                    data = await response.json();
                    break;
                case 'text':
                    data = await response.text();
                    break;
                case 'arraybuffer':
                    data = await response.arrayBuffer();
                    break;
                case 'blob':
                default:
                    data = await response.blob();
                    break;
            }
            
            // Store in cache if requested
            if (useCache) {
                this.resourceCache.set(url, data);
            }
            
            this.totalResourcesLoaded++;
            this.updateLoadingProgress();
            
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log(`Resource load cancelled: ${url}`);
            } else {
                console.error(`Error loading resource: ${url}`, error);
            }
            throw error;
        } finally {
            this.abortControllers.delete(url);
        }
    }
    
    // Update loading progress indicator
    updateLoadingProgress() {
        if (this.totalResourcesQueued > 0) {
            const progress = (this.totalResourcesLoaded / this.totalResourcesQueued) * 100;
            UI.updateProgress(progress);
        }
    }
    
    // Cancel loading of a specific resource
    cancelResourceLoad(url) {
        if (this.abortControllers.has(url)) {
            this.abortControllers.get(url).abort();
            this.abortControllers.delete(url);
            return true;
        }
        return false;
    }
    
    // Cancel all pending resource loads
    cancelAllResourceLoads() {
        for (const controller of this.abortControllers.values()) {
            controller.abort();
        }
        this.abortControllers.clear();
    }
    
    // Clear resource cache to free memory
    clearCache() {
        this.resourceCache.clear();
    }
    
    // Remove specific item from cache
    removeFromCache(url) {
        return this.resourceCache.delete(url);
    }
}