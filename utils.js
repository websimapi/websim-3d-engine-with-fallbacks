/**
 * Utility functions for the engine
 */

// Performance monitoring
export class PerformanceMonitor {
    constructor(targetFPS = 60) {
        this.targetFPS = targetFPS;
        this.frames = 0;
        this.fps = 0;
        this.lastTime = performance.now();
        this.frameStartTime = 0;
        this.frameTimes = Array(30).fill(0);
        this.frameTimeIndex = 0;
        this.memoryUsage = 0;
        this.memoryLimit = window.performance?.memory?.jsHeapSizeLimit || 0;
        this.statsElement = document.getElementById('performance-stats');
        this.enabled = config.performance.showStats;
        
        // Initialize stats element visibility
        if (this.statsElement) {
            this.statsElement.style.display = this.enabled ? 'block' : 'none';
        }
    }

    startFrame() {
        this.frameStartTime = performance.now();
    }

    endFrame() {
        const now = performance.now();
        const frameTime = now - this.frameStartTime;
        
        this.frameTimes[this.frameTimeIndex] = frameTime;
        this.frameTimeIndex = (this.frameTimeIndex + 1) % this.frameTimes.length;
        
        this.frames++;
        
        if (now - this.lastTime >= 1000) {
            this.fps = this.frames;
            this.frames = 0;
            this.lastTime = now;
            
            if (window.performance && window.performance.memory) {
                this.memoryUsage = window.performance.memory.usedJSHeapSize;
            }
            
            if (this.enabled && this.statsElement) {
                this.updateStatsDisplay();
            }
        }
        
        return frameTime;
    }
    
    getAverageFrameTime() {
        return this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    }
    
    getAverageFPS() {
        const avgFrameTime = this.getAverageFrameTime();
        return avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
    }
    
    updateStatsDisplay() {
        const avgFPS = Math.round(this.getAverageFPS());
        const memoryInMB = Math.round(this.memoryUsage / (1024 * 1024));
        const memoryLimitMB = Math.round(this.memoryLimit / (1024 * 1024));
        
        this.statsElement.innerHTML = `
            FPS: ${this.fps} (Avg: ${avgFPS})<br>
            Frame Time: ${Math.round(this.getAverageFrameTime())}ms<br>
            Memory: ${memoryInMB}MB / ${memoryLimitMB}MB
        `;
    }
}

// UI helpers
export const UI = {
    showLoading(message = "Loading...") {
        const loadingScreen = document.getElementById('loading-screen');
        const loadingStatus = document.getElementById('loading-status');
        
        loadingScreen.classList.remove('hidden');
        if (loadingStatus) {
            loadingStatus.textContent = message;
        }
    },
    
    updateProgress(percent) {
        const progressFill = document.getElementById('progress-fill');
        if (progressFill) {
            progressFill.style.width = `${percent}%`;
        }
    },
    
    hideLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.classList.add('hidden');
    },
    
    showError(message, canTryFallback = false) {
        const errorScreen = document.getElementById('error-screen');
        const errorMessage = document.getElementById('error-message');
        const fallbackButton = document.getElementById('try-fallback');
        
        errorMessage.textContent = message;
        errorScreen.classList.remove('hidden');
        
        if (canTryFallback) {
            fallbackButton.style.display = 'block';
        } else {
            fallbackButton.style.display = 'none';
        }
    },
    
    hideError() {
        const errorScreen = document.getElementById('error-screen');
        errorScreen.classList.add('hidden');
    }
};

// Math utilities
export const MathUtils = {
    degToRad: (degrees) => degrees * Math.PI / 180,
    radToDeg: (radians) => radians * 180 / Math.PI,
    
    lerp: (a, b, t) => a + (b - a) * t,
    
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    
    randomRange: (min, max) => min + Math.random() * (max - min),
    
    randomInt: (min, max) => Math.floor(min + Math.random() * (max - min + 1)),
    
    // Fast 2D noise function (simplified Perlin noise)
    noise2D: (function() {
        const permutation = [];
        for (let i = 0; i < 256; i++) {
            permutation.push(Math.floor(Math.random() * 256));
        }
        
        // Double the permutation to avoid index overflow
        const p = permutation.concat(permutation);
        
        // Linear interpolation
        function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
        
        // Gradient function
        function grad(hash, x, y) {
            const h = hash & 15;
            const gradX = 1 + (h & 7); // Gradient value is either 1 or -1
            const gradY = gradX & 1 ? gradX : -gradX; // Randomly pick gradient
            return (gradX * x + gradY * y);
        }
        
        return function(x, y) {
            // Find unit square
            const X = Math.floor(x) & 255;
            const Y = Math.floor(y) & 255;
            
            // Find relative x,y of point in square
            x -= Math.floor(x);
            y -= Math.floor(y);
            
            // Compute fade curves
            const u = fade(x);
            const v = fade(y);
            
            // Hash coordinates
            const a = p[X] + Y;
            const b = p[X + 1] + Y;
            
            // And add blended results from corners
            return MathUtils.lerp(
                MathUtils.lerp(grad(p[a], x, y), grad(p[b], x-1, y), u),
                MathUtils.lerp(grad(p[a+1], x, y-1), grad(p[b+1], x-1, y-1), u),
                v
            ) * 0.5 + 0.5; // Scale to 0.0-1.0
        };
    })()
};

// Device capability detection
export const DeviceCapabilities = {
    // Check if WebGL is available
    checkWebGL() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            return gl instanceof WebGLRenderingContext;
        } catch (e) {
            return false;
        }
    },
    
    // Check if WebGL2 is available
    checkWebGL2() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2');
            return gl instanceof WebGL2RenderingContext;
        } catch (e) {
            return false;
        }
    },
    
    // Estimate device performance tier (0-3, where 3 is high-end)
    estimatePerformanceTier() {
        const hasWebGL2 = this.checkWebGL2();
        let performanceScore = 0;
        
        // Check GPU capabilities via WebGL extensions and parameters
        if (hasWebGL2) {
            performanceScore += 2;
            
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl2');
                
                // Check max texture size as a simple proxy for GPU capability
                const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
                if (maxTextureSize >= 16384) performanceScore += 1;
                else if (maxTextureSize >= 8192) performanceScore += 0.5;
                
                // Check max render buffer size
                const maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
                if (maxRenderBufferSize >= 16384) performanceScore += 1;
                else if (maxRenderBufferSize >= 8192) performanceScore += 0.5;
            } catch (e) {
                // Failed to query WebGL parameters
            }
        } else if (this.checkWebGL()) {
            performanceScore += 1;
        }
        
        // Check device memory if available
        if (navigator.deviceMemory) {
            if (navigator.deviceMemory >= 8) performanceScore += 1;
            else if (navigator.deviceMemory >= 4) performanceScore += 0.5;
        }
        
        // Check hardware concurrency (CPU cores)
        if (navigator.hardwareConcurrency) {
            if (navigator.hardwareConcurrency >= 8) performanceScore += 1;
            else if (navigator.hardwareConcurrency >= 4) performanceScore += 0.5;
        }
        
        // Map score to tier
        if (performanceScore >= 4) return 3; // High-end
        if (performanceScore >= 2.5) return 2; // Mid-range
        if (performanceScore >= 1) return 1; // Low-end
        return 0; // Minimal
    },
    
    // Check if device is mobile
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },
    
    // Get recommendations based on device capabilities
    getRecommendedSettings() {
        const tier = this.estimatePerformanceTier();
        const isMobile = this.isMobile();
        
        return {
            rendering: {
                shadows: tier >= 2,
                antialias: tier >= 1,
                pixelRatio: Math.min(window.devicePixelRatio, tier >= 2 ? 2 : 1),
            },
            performance: {
                chunkLoadDistance: tier >= 2 ? 3 : (tier >= 1 ? 2 : 1),
                chunkDetailLevels: tier >= 2 ? 3 : 2,
            }
        };
    }
};