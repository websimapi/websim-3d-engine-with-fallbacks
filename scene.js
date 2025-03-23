/**
 * Infinite procedural chunk-based scene
 */
import { config } from './config.js';
import { MathUtils } from './utils.js';
import { MultiplayerManager } from './multiplayer.js';
import { PlayerController } from './PlayerController.js';

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
        
        // Initialize multiplayer if enabled
        if (config.features.multiplayer) {
            this.multiplayerManager = new MultiplayerManager(this);
        }
        
        // Update chunk settings
        this.updateChunkSettings();
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
        
        // Create player sphere and small objects
        this.createKatamariScene();
    }
    
    // Create Katamari-like gameplay elements
    createKatamariScene() {
        // Create player sphere (Katamari)
        const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
        const sphereMaterial = new THREE.MeshStandardMaterial({
            color: 0x44aa88,
            roughness: 0.5,
            metalness: 0.3
        });
        
        this.playerSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        this.playerSphere.position.set(0, 5, 0);
        this.playerSphere.castShadow = true;
        this.playerSphere.receiveShadow = true;
        this.threeScene.add(this.playerSphere);
        
        // Add physics for player sphere
        if (this.engine.activeEngines.physics && this.engine.activeEngines.physics.world) {
            const shape = new CANNON.Sphere(1);
            this.playerBody = new CANNON.Body({
                mass: 2, 
                position: new CANNON.Vec3(this.playerSphere.position.x, this.playerSphere.position.y, this.playerSphere.position.z),
                shape: shape,
                material: new CANNON.Material({
                    friction: 0.01, // Reduced friction significantly
                    restitution: 0.7  // Increased bounciness
                }),
                // Add angular damping to reduce excessive rotation
                angularDamping: 0.1,
                // Add linear damping to prevent it from moving forever
                linearDamping: 0.1
            });
            
            // Store reference to visual object
            this.playerBody.userData = { visual: this.playerSphere };
            
            this.engine.activeEngines.physics.world.addBody(this.playerBody);
            this.engine.activeEngines.physics.bodies.push(this.playerBody);
            
            // Store reference to physics body
            this.playerSphere.userData = { physicsBody: this.playerBody };
        }
        
        // Initialize player controller with references to player objects
        this.playerController = new PlayerController(this);
        this.playerController.setPlayerObjects(this.playerSphere, this.playerBody);
        
        // Create small objects that can be picked up
        this.pickupObjects = [];
        
        // Create initial objects in the spawn chunk
        this.createInitialPickupObjects();
    }
    
    // Create initial pickup objects in the spawn chunk
    createInitialPickupObjects() {
        if (!this.threeScene) return;
        
        const objectShapes = [
            { 
                geometry: new THREE.BoxGeometry(0.5, 0.5, 0.5),
                mass: 0.5,
                count: 5,
                createShape: size => new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2)),
                color: 0xff4444
            },
            { 
                geometry: new THREE.SphereGeometry(0.3, 16, 16),
                mass: 0.3,
                count: 5,
                createShape: radius => new CANNON.Sphere(radius),
                color: 0x44ff44
            },
            { 
                geometry: new THREE.ConeGeometry(0.3, 0.6, 16),
                mass: 0.4,
                count: 3,
                createShape: size => new CANNON.Cylinder(0, size, size*2, 8),
                color: 0x4444ff
            }
        ];
        
        // Spawn area around the player
        const spawnRadius = 20;
        
        objectShapes.forEach(objectType => {
            for (let i = 0; i < objectType.count; i++) {
                const material = new THREE.MeshStandardMaterial({
                    color: objectType.color,
                    roughness: 0.7,
                    metalness: 0.2
                });
                
                const mesh = new THREE.Mesh(objectType.geometry, material);
                
                // Position around the player in a circle
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * spawnRadius;
                const x = Math.cos(angle) * distance;
                const z = Math.sin(angle) * distance;
                
                // Get terrain height at this position for proper placement
                const terrainHeight = this.getTerrainHeight(x, z);
                
                mesh.position.set(
                    x,
                    Math.max(terrainHeight, 0) + 3 + Math.random() * 2, // Place a bit above terrain
                    z
                );
                
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.threeScene.add(mesh);
                
                // Add physics
                if (this.engine.activeEngines.physics && this.engine.activeEngines.physics.world) {
                    let size;
                    let shape;
                    
                    if (objectType.geometry.type.includes('Sphere')) {
                        size = objectType.geometry.parameters.radius;
                        shape = objectType.createShape(size);
                    } else if (objectType.geometry.type.includes('Box')) {
                        size = objectType.geometry.parameters.width;
                        shape = objectType.createShape(size);
                    } else if (objectType.geometry.type.includes('Cone')) {
                        size = objectType.geometry.parameters.radius;
                        shape = objectType.createShape(size);
                    }
                    
                    const body = new CANNON.Body({
                        mass: objectType.mass,
                        position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
                        shape: shape
                    });
                    
                    // Store reference to visual object
                    body.userData = { 
                        visual: mesh,
                        isPickup: true,
                        originalMass: objectType.mass,
                        size: size
                    };
                    
                    this.engine.activeEngines.physics.world.addBody(body);
                    this.engine.activeEngines.physics.bodies.push(body);
                    
                    // Store reference to physics body
                    mesh.userData = { physicsBody: body };
                    
                    // Add to our pickup objects array
                    this.pickupObjects.push({ mesh, body });
                }
            }
        });
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
    
    // Update camera control and positioning
    updateCamera(camera, deltaTime) {
        if (!this.playerSphere) return;
        
        // Follow the player sphere from behind and above
        const offset = new THREE.Vector3(0, 5, 15);
        const targetPosition = new THREE.Vector3().copy(this.playerSphere.position).add(offset);
        
        // Smoothly move camera to follow player
        camera.position.lerp(targetPosition, 0.1);
        camera.lookAt(this.playerSphere.position);
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
        
        // Add directional moonlight
        this.directionalMoonLight = new THREE.DirectionalLight(0x8888ff, 0.5);
        this.directionalMoonLight.position.set(-100, 100, -50); // Opposite to sun
        this.directionalMoonLight.castShadow = config.rendering.shadows;
        this.directionalMoonLight.shadow.mapSize.width = 1024;
        this.directionalMoonLight.shadow.mapSize.height = 1024;
        this.directionalMoonLight.shadow.camera.near = 0.5;
        this.directionalMoonLight.shadow.camera.far = 500;
        this.directionalMoonLight.shadow.camera.left = -100;
        this.directionalMoonLight.shadow.camera.right = 100;
        this.directionalMoonLight.shadow.camera.top = 100;
        this.directionalMoonLight.shadow.camera.bottom = -100;
        this.threeScene.add(this.directionalMoonLight);
        
        // Initialize time of day
        this.timeOfDay = config.world.timeOfDay;
        this.dayLength = config.world.dayLength;
        this.lastUpdate = Date.now();
        
        // Update lighting based on current time
        this.updateDayNightCycle(0);
    }
    
    // Main update method called each frame
    update(deltaTime) {
        // Update day/night cycle
        if (config.world.dayNightCycle && this.threeScene) {
            this.updateDayNightCycle(deltaTime);
        }
        
        // Update player controls if available
        this.updatePlayerControls(deltaTime);
        
        // Check for pickups and object collisions
        this.checkPickups();
        
        // Update multiplayer manager
        if (this.multiplayerManager) {
            this.multiplayerManager.update(deltaTime);
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
        
        // Position moon (opposite to sun)
        this.directionalMoonLight.position.set(-sunX, Math.max(10, -sunY + 20), -50);
        
        // Adjust light intensity based on time of day
        let sunIntensity, moonIntensity, ambientIntensity;
        
        if (sunHeight > 0) {
            // Day time
            sunIntensity = Math.max(0.1, sunHeight * 1.5);
            ambientIntensity = sunHeight * 0.5;
            moonIntensity = 0;
            this.moonLight.intensity = 0;
            this.directionalMoonLight.intensity = 0;
            
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
            
            // Moon light intensity based on negative sun height (stronger when sun is lowest)
            moonIntensity = Math.min(0.5, Math.abs(sunHeight) * 0.6);
            this.moonLight.intensity = 0.3;
            this.directionalMoonLight.intensity = moonIntensity;
            
            // Dark blue night sky with stars
            this.threeScene.background = new THREE.Color().setHSL(0.7, 0.8, Math.max(0.1, 0.15 + sunHeight));
            this.threeScene.fog.color.setHSL(0.7, 0.8, Math.max(0.1, 0.15 + sunHeight));
            
            // Night hemisphere
            this.hemisphereLight.color.setHSL(0.7, 0.8, 0.2);
            this.hemisphereLight.groundColor.setHSL(0.7, 0.5, 0.1);
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
    
    // Update player movement based on input
    updatePlayerControls(deltaTime) {
        if (this.playerController) {
            const camera = this.engine.activeEngines.renderer.getCamera();
            this.playerController.update(deltaTime, camera);
        }
    }
    
    // Check for objects that can be picked up
    checkPickups() {
        if (!this.playerBody || !this.pickupObjects) return;
        
        const playerRadius = this.getPlayerRadius();
        const playerPosition = this.playerBody.position;
        
        // Loop through all pickup objects
        for (let i = this.pickupObjects.length - 1; i >= 0; i--) {
            const object = this.pickupObjects[i];
            if (!object.body || !object.body.userData) continue;
            
            // Skip objects that are already attached
            if (object.body.userData.isAttached) continue;
            
            // Check if object is smaller than player
            if (object.body.userData.originalMass < this.playerBody.mass / 3) {
                // Check distance
                const distance = new CANNON.Vec3().copy(playerPosition).vsub(object.body.position).length();
                
                // If close enough, attach to player
                if (distance < playerRadius + object.body.userData.size + 0.5) {
                    this.attachObjectToPlayer(object);
                }
            }
        }
    }
    
    // Attach an object to the player
    attachObjectToPlayer(object) {
        if (!object || !this.playerBody) return;
        
        // Get chunk ID from object position
        const chunkX = Math.floor(object.body.position.x / this.chunkSize);
        const chunkZ = Math.floor(object.body.position.z / this.chunkSize);
        const chunkId = `${chunkX},${chunkZ}`;
        
        // Notify multiplayer if available
        if (this.multiplayerManager && object.id) {
            this.multiplayerManager.storeObjectPickup(chunkId, object.id);
        }
        
        // Remove from physics world
        if (this.engine.activeEngines.physics && this.engine.activeEngines.physics.world) {
            this.engine.activeEngines.physics.world.removeBody(object.body);
            
            // Remove from bodies array
            const index = this.engine.activeEngines.physics.bodies.indexOf(object.body);
            if (index >= 0) {
                this.engine.activeEngines.physics.bodies.splice(index, 1);
            }
        }
        
        // Mark as attached
        object.body.userData.isAttached = true;
        
        // Increase player mass and size
        this.playerBody.mass += object.body.userData.originalMass;
        
        // Update player size
        this.increasePlayerSize(object.body.userData.originalMass);
        
        // Remove from pickups array
        const pickupIndex = this.pickupObjects.findIndex(p => p.body === object.body);
        if (pickupIndex >= 0) {
            this.pickupObjects.splice(pickupIndex, 1);
        }
        
        // Attach visual object to player
        const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 2 * this.getPlayerRadius(),
            (Math.random() - 0.5) * 2 * this.getPlayerRadius(),
            (Math.random() - 0.5) * 2 * this.getPlayerRadius()
        );
        
        // Normalize to surface
        offset.normalize().multiplyScalar(this.getPlayerRadius());
        
        // Parent to player mesh
        this.playerSphere.add(object.mesh);
        
        // Position on surface
        object.mesh.position.copy(offset);
        
        // Random rotation
        object.mesh.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        
        // Scale down a bit
        const scale = Math.max(0.2, object.body.userData.size / this.getPlayerRadius());
        object.mesh.scale.set(scale, scale, scale);
    }
    
    // Increase the player's size based on picked up mass
    increasePlayerSize(addedMass) {
        // Current radius
        const currentRadius = this.getPlayerRadius();
        
        // Calculate volume increase
        const currentVolume = (4/3) * Math.PI * Math.pow(currentRadius, 3);
        const addedVolume = addedMass; // Simplified - mass as volume
        const newVolume = currentVolume + addedVolume;
        
        // Calculate new radius
        const newRadius = Math.pow((3 * newVolume) / (4 * Math.PI), 1/3);
        
        // Update player shape
        if (this.playerBody.shapes[0] instanceof CANNON.Sphere) {
            this.playerBody.shapes[0].radius = newRadius;
            
            // Update visual
            this.playerSphere.scale.set(newRadius, newRadius, newRadius);
        }
    }
    
    // Get current player radius
    getPlayerRadius() {
        if (this.playerBody && this.playerBody.shapes[0] instanceof CANNON.Sphere) {
            return this.playerBody.shapes[0].radius;
        }
        return 1;
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
            // Create pickup objects in this chunk
            if (this.engine.currentRenderingEngine === 'three.js') {
                this.createPickupObjectsInChunk(chunk, worldX, worldZ);
            }
            
            this.chunks.set(chunkId, chunk);
            this.totalChunks++;
        }
    }

    // Create pickup objects within a specific chunk
    createPickupObjectsInChunk(chunk, worldX, worldZ) {
        if (!this.threeScene) return;
        
        // Generate a deterministic seed for this chunk based on world seed and chunk position
        const chunkSeed = this.seed + (chunk.chunkX * 1000) + chunk.chunkZ;
        const random = new Math.seedrandom(chunkSeed);
        
        const objectShapes = [
            { 
                geometry: new THREE.BoxGeometry(0.5, 0.5, 0.5),
                mass: 0.5,
                count: 3 + Math.floor(random() * 3), // 3-5 per chunk
                createShape: size => new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2)),
                color: 0xff4444
            },
            { 
                geometry: new THREE.SphereGeometry(0.3, 16, 16),
                mass: 0.3,
                count: 2 + Math.floor(random() * 3), // 2-4 per chunk
                createShape: radius => new CANNON.Sphere(radius),
                color: 0x44ff44
            },
            { 
                geometry: new THREE.ConeGeometry(0.3, 0.6, 16),
                mass: 0.4,
                count: 1 + Math.floor(random() * 3), // 1-3 per chunk
                createShape: size => new CANNON.Cylinder(0, size, size*2, 8),
                color: 0x4444ff
            },
            { 
                geometry: new THREE.BoxGeometry(2, 2, 2),
                mass: 5,
                count: 1 + Math.floor(random() * 2), // 1-2 large objects per chunk
                createShape: size => new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2)),
                color: 0xffaa22
            }
        ];
        
        // Check if we have stored objects for this chunk
        const chunkId = `${chunk.chunkX},${chunk.chunkZ}`;
        let storedObjects = null;
        
        if (this.multiplayerManager) {
            storedObjects = this.multiplayerManager.getChunkObjects(chunkId);
        }
        
        // If we have stored objects, use those instead of creating new ones
        if (storedObjects) {
            this.createStoredObjects(storedObjects, chunkId);
            return;
        }
        
        // Skip spawning objects in the origin chunk if already populated
        if (worldX === 0 && worldZ === 0 && this.pickupObjects.length > 0) {
            return;
        }
        
        const chunkObjects = [];
        
        objectShapes.forEach(objectType => {
            for (let i = 0; i < objectType.count; i++) {
                const material = new THREE.MeshStandardMaterial({
                    color: objectType.color,
                    roughness: 0.7,
                    metalness: 0.2
                });
                
                const mesh = new THREE.Mesh(objectType.geometry, material);
                
                // Position within this chunk
                const offsetX = random() * this.chunkSize;
                const offsetZ = random() * this.chunkSize;
                
                // Get terrain height at this position for proper placement
                const terrainHeight = this.getTerrainHeight(worldX + offsetX, worldZ + offsetZ);
                
                // Determine if this should be a floating object (only for light objects)
                const isFloating = config.world.floatingObjects && 
                                   objectType.mass < 1 && 
                                   random() < 0.3; // 30% chance for eligible objects
                
                const y = isFloating ? 
                    Math.max(terrainHeight, 0) + 10 + random() * 15 : // Float 10-25 units above terrain
                    Math.max(terrainHeight, 0) + 3 + random() * 2;    // Regular placement
                
                mesh.position.set(
                    worldX + offsetX,
                    y,
                    worldZ + offsetZ
                );
                
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                this.threeScene.add(mesh);
                
                // Generate a unique ID for this object
                const objectId = `obj_${chunkId}_${i}_${Date.now()}${Math.floor(random() * 1000)}`;
                
                // Add physics
                if (this.engine.activeEngines.physics && this.engine.activeEngines.physics.world) {
                    let size;
                    let shape;
                    
                    if (objectType.geometry.type.includes('Sphere')) {
                        size = objectType.geometry.parameters.radius;
                        shape = objectType.createShape(size);
                    } else if (objectType.geometry.type.includes('Box')) {
                        size = objectType.geometry.parameters.width;
                        shape = objectType.createShape(size);
                    } else if (objectType.geometry.type.includes('Cone')) {
                        size = objectType.geometry.parameters.radius;
                        shape = objectType.createShape(size);
                    }
                    
                    const body = new CANNON.Body({
                        mass: objectType.mass,
                        position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
                        shape: shape
                    });
                    
                    // Store reference to visual object
                    body.userData = { 
                        visual: mesh,
                        isPickup: true,
                        originalMass: objectType.mass,
                        size: size,
                        objectId: objectId
                    };
                    
                    // If floating, make it slightly bouncy and apply upward force
                    if (isFloating) {
                        body.linearDamping = 0.9; // Air resistance
                        body.angularDamping = 0.9; // Slow rotation
                        
                        // Apply small random force to make it move slightly
                        const floatForce = new CANNON.Vec3(
                            (random() - 0.5) * 0.5,
                            2 + random() * 1,  // Upward force
                            (random() - 0.5) * 0.5
                        );
                        body.applyLocalForce(floatForce, new CANNON.Vec3(0, 0, 0));
                    }
                    
                    this.engine.activeEngines.physics.world.addBody(body);
                    this.engine.activeEngines.physics.bodies.push(body);
                    
                    // Store reference to physics body
                    mesh.userData = { 
                        physicsBody: body,
                        objectId: objectId
                    };
                    
                    // Add to our pickup objects array
                    this.pickupObjects.push({ mesh, body, id: objectId });
                    
                    // Store for multiplayer
                    chunkObjects.push({
                        id: objectId,
                        type: objectType.geometry.type,
                        position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                        size: size,
                        color: objectType.color,
                        mass: objectType.mass,
                        isFloating: isFloating
                    });
                }
            }
        });
        
        // Store the objects for this chunk in multiplayer manager
        if (this.multiplayerManager && chunkObjects.length > 0) {
            this.multiplayerManager.saveChunkObjects(chunkId, chunkObjects);
        }
    }
    
    // Create objects from stored data
    createStoredObjects(objects, chunkId) {
        if (!this.threeScene || !objects || objects.length === 0) return;
        
        objects.forEach(objectData => {
            // Create appropriate geometry
            let geometry;
            if (objectData.type.includes('Sphere')) {
                geometry = new THREE.SphereGeometry(objectData.size, 16, 16);
            } else if (objectData.type.includes('Box')) {
                geometry = new THREE.BoxGeometry(objectData.size, objectData.size, objectData.size);
            } else if (objectData.type.includes('Cone')) {
                geometry = new THREE.ConeGeometry(objectData.size, objectData.size * 2, 16);
            } else {
                // Default to cube if unknown
                geometry = new THREE.BoxGeometry(objectData.size, objectData.size, objectData.size);
            }
            
            const material = new THREE.MeshStandardMaterial({
                color: objectData.color,
                roughness: 0.7,
                metalness: 0.2
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(
                objectData.position.x,
                objectData.position.y,
                objectData.position.z
            );
            
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.threeScene.add(mesh);
            
            // Add physics
            if (this.engine.activeEngines.physics && this.engine.activeEngines.physics.world) {
                let shape;
                
                if (objectData.type.includes('Sphere')) {
                    shape = new CANNON.Sphere(objectData.size);
                } else if (objectData.type.includes('Box')) {
                    shape = new CANNON.Box(new CANNON.Vec3(
                        objectData.size/2, 
                        objectData.size/2, 
                        objectData.size/2
                    ));
                } else if (objectData.type.includes('Cone')) {
                    shape = new CANNON.Cylinder(0, objectData.size, objectData.size * 2, 8);
                } else {
                    // Default to box
                    shape = new CANNON.Box(new CANNON.Vec3(
                        objectData.size/2, 
                        objectData.size/2, 
                        objectData.size/2
                    ));
                }
                
                const body = new CANNON.Body({
                    mass: objectData.mass,
                    position: new CANNON.Vec3(
                        objectData.position.x,
                        objectData.position.y,
                        objectData.position.z
                    ),
                    shape: shape
                });
                
                // Store reference to visual object
                body.userData = { 
                    visual: mesh,
                    isPickup: true,
                    originalMass: objectData.mass,
                    size: objectData.size,
                    objectId: objectData.id
                };
                
                // If floating, make it slightly bouncy and apply upward force
                if (objectData.isFloating) {
                    body.linearDamping = 0.9; // Air resistance
                    body.angularDamping = 0.9; // Slow rotation
                    
                    // Apply small random force to make it move slightly
                    const floatForce = new CANNON.Vec3(
                        (Math.random() - 0.5) * 0.5,
                        2 + Math.random() * 1,  // Upward force
                        (Math.random() - 0.5) * 0.5
                    );
                    body.applyLocalForce(floatForce, new CANNON.Vec3(0, 0, 0));
                }
                
                this.engine.activeEngines.physics.world.addBody(body);
                this.engine.activeEngines.physics.bodies.push(body);
                
                // Store reference to physics body
                mesh.userData = { 
                    physicsBody: body,
                    objectId: objectData.id
                };
                
                // Add to our pickup objects array
                this.pickupObjects.push({ mesh, body, id: objectData.id });
            }
        });
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
                    
                    // Also remove and dispose of pickup objects in this chunk
                    this.removePickupObjectsInChunk(chunk);
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
    
    // Remove pickup objects when a chunk is unloaded
    removePickupObjectsInChunk(chunk) {
        if (!this.pickupObjects) return;
        
        // Calculate chunk boundaries
        const minX = chunk.chunkX * this.chunkSize;
        const maxX = minX + this.chunkSize;
        const minZ = chunk.chunkZ * this.chunkSize;
        const maxZ = minZ + this.chunkSize;
        
        // Find objects that are in this chunk
        for (let i = this.pickupObjects.length - 1; i >= 0; i--) {
            const object = this.pickupObjects[i];
            if (!object.body || !object.mesh) continue;
            
            // Skip objects that are attached to the player
            if (object.body.userData && object.body.userData.isAttached) {
                continue;
            }
            
            const posX = object.body.position.x;
            const posZ = object.body.position.z;
            
            // If object is in this chunk's bounds
            if (posX >= minX && posX < maxX && posZ >= minZ && posZ < maxZ) {
                // Remove from scene
                this.threeScene.remove(object.mesh);

                // Dispose geometry and materials
                if (object.mesh.geometry) object.mesh.geometry.dispose();
                if (object.mesh.material) {
                    if (Array.isArray(object.mesh.material)) {
                        object.mesh.material.forEach(m => m.dispose());
                    } else {
                        object.mesh.material.dispose();
                    }
                }
                
                // Remove from physics world
                if (this.engine.activeEngines.physics && this.engine.activeEngines.physics.world) {
                    this.engine.activeEngines.physics.world.removeBody(object.body);
                    
                    // Remove from physics bodies array
                    const bodyIndex = this.engine.activeEngines.physics.bodies.indexOf(object.body);
                    if (bodyIndex >= 0) {
                        this.engine.activeEngines.physics.bodies.splice(bodyIndex, 1);
                    }
                }
                
                // Remove from pickups array
                this.pickupObjects.splice(i, 1);
            }
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
        
        // Clean up multiplayer
        if (this.multiplayerManager) {
            this.multiplayerManager.dispose();
            this.multiplayerManager = null;
        }
        
        // Clean up player controller
        if (this.playerController) {
            this.playerController.dispose();
            this.playerController = null;
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