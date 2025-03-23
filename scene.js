/**
 * Infinite procedural chunk-based scene
 */
import { config } from './config.js';
import { MathUtils } from './utils.js';
import { CharacterController } from './character.js';

export class ChunkedScene {
    constructor(engine) {
        this.engine = engine;
        this.chunks = new Map(); // Map of loaded chunks
        this.activeChunks = new Set(); // Currently visible chunks
        this.chunkSize = config.performance.chunkSize;
        this.loadDistance = config.performance.chunkLoadDistance;
        this.seed = config.world.seed;
        this.terrainHeight = config.world.terrainHeight;
        this.terrainScale = config.world.terrainScale;
        
        // Keep track of camera position for chunk loading
        this.lastCameraChunkX = null;
        this.lastCameraChunkZ = null;
        
        // Track stats
        this.totalChunks = 0;
        
        // Three.js specific objects
        this.threeScene = null;
        
        // Babylon.js specific objects
        this.babylonScene = null;
        
        this.character = null;
        
        this.initialize();
    }
    
    initialize() {
        // Detect which rendering engine is in use
        if (this.engine.activeEngines.renderer) {
            if (this.engine.currentRenderingEngine === 'three.js') {
                this.initializeThreeScene();
            } else if (this.engine.currentRenderingEngine === 'babylon.js') {
                this.initializeBabylonScene();
            }
        }
        
        // Update chunk settings
        this.updateChunkSettings();
        
        // Initialize character
        if (this.engine.activeEngines.renderer && this.engine.currentRenderingEngine === 'three.js') {
            setTimeout(() => {
                this.initializeCharacter();
            }, 1000); // Slight delay to ensure scene is ready
        }
    }
    
    async initializeCharacter() {
        try {
            this.character = new CharacterController(this.engine, this);
        } catch (error) {
            console.error('Failed to initialize character:', error);
        }
    }
    
    // Initialize for Three.js renderer
    initializeThreeScene() {
        this.threeScene = new THREE.Scene();
        
        // Add a ground plane that extends far
        const groundGeometry = new THREE.PlaneGeometry(10000, 10000);
        
        // Load grass texture
        const textureLoader = new THREE.TextureLoader();
        const grassTexture = textureLoader.load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/textures/terrain/grasslight-big.jpg');
        grassTexture.wrapS = THREE.RepeatWrapping;
        grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(1000, 1000);
        
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            map: grassTexture,
            roughness: 0.8,
            metalness: 0.2
        });
        
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -5;
        ground.receiveShadow = true;
        
        this.threeScene.add(ground);
        
        // Set background
        this.threeScene.background = new THREE.Color(0x87ceeb); // Sky blue
        
        // Add fog
        this.threeScene.fog = new THREE.FogExp2(0xcccccc, 0.002);
        
        // Set up sunlight for day/night cycle
        this.setupDayNightCycle();
    }
    
    // Setup day/night cycle lighting
    setupDayNightCycle() {
        // Create hemisphere light (sky and ground)
        this.hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x3a3a3a, 0.6);
        this.threeScene.add(this.hemisphereLight);
        
        // Create directional light (sun)
        this.sunLight = new THREE.DirectionalLight(0xffffee, 1.5);
        this.sunLight.position.set(100, 100, 50);
        this.sunLight.castShadow = config.rendering.shadows;
        
        // Improve shadow quality
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 500;
        this.sunLight.shadow.camera.left = -100;
        this.sunLight.shadow.camera.right = 100;
        this.sunLight.shadow.camera.top = 100;
        this.sunLight.shadow.camera.bottom = -100;
        
        this.threeScene.add(this.sunLight);
        
        // Add ambient moonlight for night
        this.moonLight = new THREE.AmbientLight(0x223344, 0.2);
        this.threeScene.add(this.moonLight);
        
        // Add test objects to show shadows
        this.addTestObjects();
        
        // Initialize time of day
        this.timeOfDay = config.world.timeOfDay;
        this.dayLength = config.world.dayLength;
        this.lastUpdate = Date.now();
        
        // Update lighting based on current time
        this.updateDayNightCycle(0);
    }
    
    // Add test objects to demonstrate shadows
    addTestObjects() {
        // Add some cubes and spheres to cast shadows
        const geometry = new THREE.BoxGeometry(10, 10, 10);
        const material = new THREE.MeshStandardMaterial({
            color: 0x8844aa,
            roughness: 0.7,
            metalness: 0.2
        });
        
        // Create a few test cubes
        for (let i = 0; i < 5; i++) {
            const cube = new THREE.Mesh(geometry, material);
            cube.position.set(
                (i * 20) - 40,
                15,
                -20
            );
            cube.castShadow = true;
            cube.receiveShadow = true;
            this.threeScene.add(cube);
        }
        
        // Add a few spheres
        const sphereGeometry = new THREE.SphereGeometry(7, 32, 32);
        const sphereMaterial = new THREE.MeshStandardMaterial({
            color: 0x44aa88,
            roughness: 0.5,
            metalness: 0.3
        });
        
        for (let i = 0; i < 3; i++) {
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.set(
                (i * 25) - 25,
                10,
                20
            );
            sphere.castShadow = true;
            sphere.receiveShadow = true;
            this.threeScene.add(sphere);
        }
    }
    
    // Initialize for Babylon.js renderer
    initializeBabylonScene() {
        if (!this.engine.activeEngines.renderer || !this.engine.activeEngines.renderer.scene) {
            console.error('Cannot initialize Babylon scene - no renderer scene available');
            return;
        }
        
        this.babylonScene = this.engine.activeEngines.renderer.scene;
        
        // Add a ground plane that extends far
        const ground = BABYLON.MeshBuilder.CreateGround(
            'ground', 
            { width: 10000, height: 10000 }, 
            this.babylonScene
        );
        
        const groundMaterial = new BABYLON.StandardMaterial('groundMaterial', this.babylonScene);
        groundMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        groundMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        ground.material = groundMaterial;
        ground.position.y = -5;
        ground.receiveShadows = true;
        
        // Set skybox
        const skybox = BABYLON.MeshBuilder.CreateBox('skyBox', { size: 1000 }, this.babylonScene);
        const skyboxMaterial = new BABYLON.StandardMaterial('skyBoxMaterial', this.babylonScene);
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.diffuseColor = new BABYLON.Color3(0.53, 0.81, 0.92); // Sky blue
        skyboxMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        skybox.material = skyboxMaterial;
    }
    
    // Update based on current configuration
    updateChunkSettings() {
        this.loadDistance = config.performance.chunkLoadDistance;
        this.chunkSize = config.performance.chunkSize;
        
        // Force update of chunks
        this.lastCameraChunkX = null;
        this.lastCameraChunkZ = null;
    }
    
    // Main update method called each frame
    update(deltaTime) {
        // Update day/night cycle
        if (config.world.dayNightCycle && this.threeScene) {
            this.updateDayNightCycle(deltaTime);
        }
        
        // Get current camera position
        const cameraPosition = this.getCameraPosition();
        
        // Calculate which chunk the camera is in
        const chunkX = Math.floor(cameraPosition.x / this.chunkSize);
        const chunkZ = Math.floor(cameraPosition.z / this.chunkSize);
        
        // Only update chunks if we've moved to a new chunk
        if (chunkX !== this.lastCameraChunkX || chunkZ !== this.lastCameraChunkZ) {
            this.updateVisibleChunks(chunkX, chunkZ);
            this.lastCameraChunkX = chunkX;
            this.lastCameraChunkZ = chunkZ;
        }
        
        // Update character
        if (this.character) {
            this.character.update(deltaTime);
        }
    }
    
    // Update day/night cycle lighting
    updateDayNightCycle(deltaTime) {
        if (!this.sunLight || !this.hemisphereLight) return;
        
        // Update time of day
        if (config.world.dayNightCycle) {
            this.timeOfDay += deltaTime / this.dayLength;
            if (this.timeOfDay > 1) this.timeOfDay -= 1;
        }
        
        // Calculate sun position
        const angle = Math.PI * 2 * this.timeOfDay;
        const sunHeight = Math.sin(angle);
        const sunX = Math.cos(angle) * 100;
        const sunY = sunHeight * 100 + 10; // Keep sun slightly above horizon at night
        
        // Position sun
        this.sunLight.position.set(sunX, sunY, 50);
        
        // Adjust light intensity based on time of day
        let sunIntensity, ambientIntensity;
        
        if (sunHeight > 0) {
            // Day time
            sunIntensity = Math.max(0.1, sunHeight * 1.5);
            ambientIntensity = sunHeight * 0.5;
            this.moonLight.intensity = 0;
            
            // Change sky color
            let skyHue = 0.6; // Blue
            let skySaturation = 0.7;
            let skyLightness = 0.7 + (0.3 * sunHeight);
            
            this.threeScene.background = new THREE.Color().setHSL(skyHue, skySaturation, skyLightness);
            this.threeScene.fog.color.setHSL(skyHue, skySaturation, skyLightness);
            
            // Warm up hemisphere light at sunrise/sunset
            if (sunHeight < 0.2) {
                // Sunrise/sunset - orange tint
                const blendFactor = 1 - (sunHeight / 0.2);
                this.hemisphereLight.color.setHSL(0.1, 0.7, 0.5 + (0.5 * sunHeight)); // Orange sky
            } else {
                this.hemisphereLight.color.setHSL(0.6, 0.8, 0.8); // Blue sky
            }
        } else {
            // Night time
            sunIntensity = 0;
            ambientIntensity = 0;
            this.moonLight.intensity = 0.2;
            
            // Dark blue night sky
            this.threeScene.background = new THREE.Color().setHSL(0.7, 0.8, Math.max(0.1, 0.1 + sunHeight));
            this.threeScene.fog.color.setHSL(0.7, 0.8, Math.max(0.1, 0.1 + sunHeight));
            
            // Night hemisphere
            this.hemisphereLight.color.setHSL(0.7, 0.8, 0.1);
        }
        
        this.sunLight.intensity = sunIntensity;
        this.hemisphereLight.intensity = 0.6 + (ambientIntensity * 0.4);
    }
    
    // Get current camera position
    getCameraPosition() {
        if (this.engine.activeEngines.renderer) {
            const renderer = this.engine.activeEngines.renderer;
            
            if (this.engine.currentRenderingEngine === 'three.js') {
                const camera = renderer.getCamera();
                return { x: camera.position.x, y: camera.position.y, z: camera.position.z };
            } else if (this.engine.currentRenderingEngine === 'babylon.js') {
                const camera = renderer.getCamera();
                return { x: camera.position.x, y: camera.position.y, z: camera.position.z };
            }
        }
        
        // Default camera position if none available
        return { x: 0, y: 0, z: 0 };
    }
    
    // Update camera control and positioning
    updateCamera(camera, deltaTime) {
        // Can be overridden by subclasses to control camera
    }
    
    // Update visible chunks based on camera position
    updateVisibleChunks(centerChunkX, centerChunkZ) {
        // Calculate which chunks should be visible
        const newActiveChunks = new Set();
        
        for (let x = -this.loadDistance; x <= this.loadDistance; x++) {
            for (let z = -this.loadDistance; z <= this.loadDistance; z++) {
                const chunkX = centerChunkX + x;
                const chunkZ = centerChunkZ + z;
                const chunkId = `${chunkX},${chunkZ}`;
                
                newActiveChunks.add(chunkId);
                
                // If chunk isn't loaded, load it
                if (!this.chunks.has(chunkId)) {
                    this.loadChunk(chunkX, chunkZ);
                }
            }
        }
        
        // Unload chunks that are no longer visible
        for (const chunkId of this.activeChunks) {
            if (!newActiveChunks.has(chunkId)) {
                this.unloadChunk(chunkId);
            }
        }
        
        this.activeChunks = newActiveChunks;
    }
    
    // Load a chunk at given coordinates
    loadChunk(chunkX, chunkZ) {
        const chunkId = `${chunkX},${chunkZ}`;
        
        // Calculate world position
        const worldX = chunkX * this.chunkSize;
        const worldZ = chunkZ * this.chunkSize;
        
        let chunk;
        
        // Create appropriate chunk based on rendering engine
        if (this.engine.currentRenderingEngine === 'three.js') {
            chunk = this.createThreeChunk(chunkX, chunkZ, worldX, worldZ);
        } else if (this.engine.currentRenderingEngine === 'babylon.js') {
            chunk = this.createBabylonChunk(chunkX, chunkZ, worldX, worldZ);
        } else {
            console.error('Unknown rendering engine');
            return;
        }
        
        if (chunk) {
            this.chunks.set(chunkId, chunk);
            this.totalChunks++;
        }
    }
    
    // Unload a chunk by ID
    unloadChunk(chunkId) {
        const chunk = this.chunks.get(chunkId);
        
        if (chunk) {
            if (this.engine.currentRenderingEngine === 'three.js') {
                // Remove from Three.js scene
                if (this.threeScene && chunk.mesh) {
                    this.threeScene.remove(chunk.mesh);
                    
                    // Properly dispose of Three.js resources
                    if (chunk.mesh.geometry) chunk.mesh.geometry.dispose();
                    if (chunk.mesh.material) {
                        if (Array.isArray(chunk.mesh.material)) {
                            chunk.mesh.material.forEach(m => m.dispose());
                        } else {
                            chunk.mesh.material.dispose();
                        }
                    }
                }
            } else if (this.engine.currentRenderingEngine === 'babylon.js') {
                // Dispose of Babylon resources
                if (chunk.mesh) chunk.mesh.dispose(true, true);
            }
            
            // Remove from chunk map
            this.chunks.delete(chunkId);
            this.totalChunks--;
        }
    }
    
    // Create a Three.js chunk
    createThreeChunk(chunkX, chunkZ, worldX, worldZ) {
        try {
            // Simple terrain heightmap
            const resolution = Math.max(16, this.chunkSize / 4); // Points per side
            const geometry = new THREE.PlaneGeometry(
                this.chunkSize, 
                this.chunkSize, 
                resolution - 1, 
                resolution - 1
            );
            
            // Apply height
            const vertices = geometry.attributes.position.array;
            for (let i = 0; i < vertices.length; i += 3) {
                // Calculate world position
                const x = vertices[i] + worldX + this.chunkSize/2;
                const z = vertices[i+2] + worldZ + this.chunkSize/2;
                
                // Get height from noise
                const noiseValue = this.getTerrainHeight(x, z);
                vertices[i+1] = noiseValue;
            }
            
            // Update normals
            geometry.computeVertexNormals();
            
            // Create material with color based on height
            const material = new THREE.MeshStandardMaterial({ 
                vertexColors: false,
                roughness: 0.8,
                metalness: 0.2
            });
            
            // Apply color based on height
            this.applyColorToThreeGeometry(geometry);
            
            // Create mesh
            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(worldX + this.chunkSize/2, 0, worldZ + this.chunkSize/2);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Add to scene
            if (this.threeScene) {
                this.threeScene.add(mesh);
            }
            
            return { mesh, chunkX, chunkZ };
        } catch (error) {
            console.error('Error creating Three.js chunk:', error);
            return null;
        }
    }
    
    // Apply vertex colors to Three.js geometry based on height
    applyColorToThreeGeometry(geometry) {
        const vertices = geometry.attributes.position.array;
        const colors = new Float32Array(vertices.length);
        
        for (let i = 0; i < vertices.length; i += 3) {
            const height = vertices[i+1];
            
            // Generate color based on height
            let color;
            if (height < 0) {
                // Water - blue
                color = new THREE.Color(0x0077be);
            } else if (height < 3) {
                // Sand - tan
                color = new THREE.Color(0xc2b280);
            } else if (height < 12) {
                // Grass - green
                color = new THREE.Color(0x567d46);
            } else if (height < 35) {
                // Forest - dark green
                color = new THREE.Color(0x2d4c1e);
            } else if (height < 60) {
                // Mountain - gray brown
                color = new THREE.Color(0x7d6b5d);
            } else {
                // Snow peaks - white
                color = new THREE.Color(0xeeeeee);
            }
            
            // Set RGB values
            colors[i] = color.r;
            colors[i+1] = color.g;
            colors[i+2] = color.b;
        }
        
        // Add colors to geometry
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    
    // Create a Babylon.js chunk
    createBabylonChunk(chunkX, chunkZ, worldX, worldZ) {
        if (!this.babylonScene) return null;
        
        try {
            // Simple terrain heightmap
            const resolution = Math.max(16, this.chunkSize / 4); // Points per side
            
            // Create heightmap data
            const heightData = new Float32Array(resolution * resolution);
            
            // Generate heights
            for (let z = 0; z < resolution; z++) {
                for (let x = 0; x < resolution; x++) {
                    const worldPosX = worldX + (x / (resolution - 1)) * this.chunkSize;
                    const worldPosZ = worldZ + (z / (resolution - 1)) * this.chunkSize;
                    
                    // Get height from noise
                    heightData[z * resolution + x] = this.getTerrainHeight(worldPosX, worldPosZ);
                }
            }
            
            // Create the ground mesh
            const ground = BABYLON.MeshBuilder.CreateGroundFromHeightMap(
                `chunk_${chunkX}_${chunkZ}`,
                'heightMap', // Babylon will generate from the heightData
                {
                    width: this.chunkSize,
                    height: this.chunkSize,
                    subdivisions: resolution - 1,
                    minHeight: -20,
                    maxHeight: this.terrainHeight,
                    updatable: false,
                    heightmapData: heightData
                },
                this.babylonScene
            );
            
            // Position the chunk
            ground.position.x = worldX + this.chunkSize/2;
            ground.position.z = worldZ + this.chunkSize/2;
            
            // Apply material
            const material = new BABYLON.StandardMaterial(`chunkMaterial_${chunkX}_${chunkZ}`, this.babylonScene);
            material.diffuseColor = new BABYLON.Color3(0.4, 0.6, 0.3); // Green for grass
            material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            ground.material = material;
            
            // Set shadows
            ground.receiveShadows = true;
            
            return { mesh: ground, chunkX, chunkZ };
        } catch (error) {
            console.error('Error creating Babylon.js chunk:', error);
            return null;
        }
    }
    
    // Get terrain height at world position
    getTerrainHeight(x, z) {
        if (config.world.terrainType === 'flat') {
            return 0;
        }
        
        if (config.world.terrainType === 'perlin') {
            // Use multiple octaves of noise for more interesting terrain
            const scale1 = this.terrainScale;
            const scale2 = this.terrainScale * 4;
            const scale3 = this.terrainScale * 16;
            
            const seedOffsetX = this.seed % 1000;
            const seedOffsetZ = this.seed / 1000;
            
            // Three octaves of noise
            const noise1 = MathUtils.noise2D((x + seedOffsetX) * scale1, (z + seedOffsetZ) * scale1);
            const noise2 = MathUtils.noise2D((x + seedOffsetX) * scale2, (z + seedOffsetZ) * scale2) * 0.5;
            const noise3 = MathUtils.noise2D((x + seedOffsetX) * scale3, (z + seedOffsetZ) * scale3) * 0.25;
            
            // Combine noise values
            const combinedNoise = (noise1 + noise2 + noise3) / 1.75;
            
            // Scale to terrain height
            return combinedNoise * this.terrainHeight;
        }
        
        return 0;
    }
    
    // Get the Three.js scene object
    getThreeScene() {
        return this.threeScene;
    }
    
    // Get the Babylon.js scene object
    getBabylonScene() {
        return this.babylonScene;
    }
    
    // Clean up resources
    dispose() {
        // Unload all chunks
        for (const chunkId of this.chunks.keys()) {
            this.unloadChunk(chunkId);
        }
        
        this.chunks.clear();
        this.activeChunks.clear();
        
        // Dispose character
        if (this.character) {
            this.character.dispose();
            this.character = null;
        }
        
        // Clean up renderer-specific resources
        if (this.engine.currentRenderingEngine === 'three.js') {
            if (this.threeScene) {
                // Dispose all objects in scene
                this.threeScene.traverse((object) => {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(m => m.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                });
                
                this.threeScene = null;
            }
        } else if (this.engine.currentRenderingEngine === 'babylon.js') {
            // Babylon.js scene disposal is handled by the renderer
            this.babylonScene = null;
        }
    }
}