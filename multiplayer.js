import { config } from './config.js';

export class MultiplayerManager {
    constructor(scene) {
        this.scene = scene;
        this.room = new WebsimSocket();
        this.players = new Map(); // Map of player meshes by client ID
        this.playerBodies = new Map(); // Map of player physics bodies by client ID
        this.clientId = null;
        this.username = null;
        this.initialized = false;
        
        // Initialize connection and setup event handlers
        this.initialize();
    }
    
    async initialize() {
        try {
            // Get our client info
            this.clientId = this.room.party.client.id;
            this.username = this.room.party.client.username;
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Set up presence subscription
            this.setupPresenceSubscription();
            
            // Initialize room state if we're the first player
            this.initializeRoomState();
            
            // Load initial chunk data
            await this.loadChunkData();
            
            this.initialized = true;
            console.log(`Multiplayer initialized. Client ID: ${this.clientId}, Username: ${this.username}`);
        } catch (error) {
            console.error('Failed to initialize multiplayer:', error);
        }
    }
    
    setupEventHandlers() {
        // Handle incoming messages
        this.room.onmessage = (event) => {
            const data = event.data;
            switch (data.type) {
                case "connected":
                    console.log(`Player connected: ${data.username} (${data.clientId})`);
                    break;
                case "disconnected":
                    console.log(`Player disconnected: ${data.username} (${data.clientId})`);
                    this.removePlayer(data.clientId);
                    break;
                case "objectPickedUp":
                    this.handleObjectPickedUp(data);
                    break;
                default:
                    console.log("Received event:", data);
            }
        };
    }
    
    setupPresenceSubscription() {
        // Subscribe to presence updates
        this.room.party.subscribePresence((presence) => {
            for (const clientId in presence) {
                if (clientId === this.clientId) continue; // Skip our own presence
                
                const playerData = presence[clientId];
                if (playerData) {
                    this.updateOrCreatePlayer(clientId, playerData);
                }
            }
        });
    }
    
    initializeRoomState() {
        // Check if we should initialize room state (first player)
        if (Object.keys(this.room.party.peers).length <= 1) {
            this.room.party.updateRoomState({
                chunkObjects: {}  // Map of chunk IDs to objects in that chunk
            });
        }
    }
    
    async loadChunkData() {
        // Get the current room state
        const roomState = this.room.party.roomState;
        
        // If we have chunk data, update our scene
        if (roomState && roomState.chunkObjects) {
            // Apply to the scene
            for (const chunkId in roomState.chunkObjects) {
                const objects = roomState.chunkObjects[chunkId];
                
                // We don't directly update here, as the chunks might not be loaded yet
                // Instead, we'll check this data when creating chunks
            }
        }
    }
    
    updateOrCreatePlayer(clientId, playerData) {
        if (!this.scene.threeScene) return;
        
        // Check if we already have this player
        if (this.players.has(clientId)) {
            // Update existing player
            const playerMesh = this.players.get(clientId);
            const playerBody = this.playerBodies.get(clientId);
            
            // Update position
            if (playerData.position) {
                playerMesh.position.set(
                    playerData.position.x,
                    playerData.position.y,
                    playerData.position.z
                );
                
                if (playerBody) {
                    playerBody.position.set(
                        playerData.position.x,
                        playerData.position.y,
                        playerData.position.z
                    );
                }
            }
            
            // Update size
            if (playerData.size && playerData.size !== playerMesh.scale.x) {
                playerMesh.scale.set(playerData.size, playerData.size, playerData.size);
                
                if (playerBody && playerBody.shapes[0] instanceof CANNON.Sphere) {
                    playerBody.shapes[0].radius = playerData.size;
                }
            }
        } else {
            // Create new player
            this.createPlayerMesh(clientId, playerData);
        }
    }
    
    createPlayerMesh(clientId, playerData) {
        if (!this.scene.threeScene) return;
        
        // Get player name
        const username = this.room.party.peers[clientId]?.username || 'Unknown';
        
        // Create player sphere
        const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
        const sphereMaterial = new THREE.MeshStandardMaterial({
            color: 0x8844ff, // Different color from player
            roughness: 0.5,
            metalness: 0.3
        });
        
        const playerMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        
        // Set initial position and size
        const position = playerData.position || { x: 0, y: 5, z: 0 };
        playerMesh.position.set(position.x, position.y, position.z);
        
        const size = playerData.size || 1;
        playerMesh.scale.set(size, size, size);
        
        playerMesh.castShadow = true;
        playerMesh.receiveShadow = true;
        
        // Add username label
        this.addUsernameLabel(playerMesh, username);
        
        // Add to scene
        this.scene.threeScene.add(playerMesh);
        this.players.set(clientId, playerMesh);
        
        // Add ghost physics body (non-interactive)
        if (this.scene.engine.activeEngines.physics && this.scene.engine.activeEngines.physics.world) {
            const shape = new CANNON.Sphere(size);
            const body = new CANNON.Body({
                mass: 0, // Make it static/non-interactive
                position: new CANNON.Vec3(position.x, position.y, position.z),
                shape: shape,
                collisionResponse: false // No collision response
            });
            
            body.userData = { visual: playerMesh, isOtherPlayer: true };
            
            this.scene.engine.activeEngines.physics.world.addBody(body);
            this.playerBodies.set(clientId, body);
        }
    }
    
    addUsernameLabel(playerMesh, username) {
        // Create a canvas for the username text
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        
        // Draw username on canvas
        context.font = '24px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.fillText(username, 128, 32);
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        
        // Create a sprite material with the texture
        const material = new THREE.SpriteMaterial({ map: texture });
        
        // Create a sprite with the material
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2, 0.5, 1);
        sprite.position.y = 1.5; // Position above the player sphere
        
        // Add the sprite to the player mesh
        playerMesh.add(sprite);
    }
    
    removePlayer(clientId) {
        // Remove player mesh from scene
        if (this.players.has(clientId)) {
            const playerMesh = this.players.get(clientId);
            this.scene.threeScene.remove(playerMesh);
            this.players.delete(clientId);
        }
        
        // Remove player physics body
        if (this.playerBodies.has(clientId)) {
            const playerBody = this.playerBodies.get(clientId);
            if (this.scene.engine.activeEngines.physics && this.scene.engine.activeEngines.physics.world) {
                this.scene.engine.activeEngines.physics.world.removeBody(playerBody);
            }
            this.playerBodies.delete(clientId);
        }
    }
    
    updatePlayerPosition() {
        if (!this.initialized || !this.scene.playerSphere) return;
        
        // Update our presence with current position and size
        this.room.party.updatePresence({
            position: {
                x: this.scene.playerSphere.position.x,
                y: this.scene.playerSphere.position.y,
                z: this.scene.playerSphere.position.z
            },
            size: this.scene.getPlayerRadius()
        });
    }
    
    handleObjectPickedUp(data) {
        // Another player picked up an object
        if (data.clientId === this.clientId) return; // Skip if we picked it up
        
        // Find the object by ID and remove it
        const chunkId = data.chunkId;
        const objectId = data.objectId;
        
        // Update room state
        const roomState = this.room.party.roomState;
        if (roomState && roomState.chunkObjects && roomState.chunkObjects[chunkId]) {
            // Remove the object from the room state
            const objects = roomState.chunkObjects[chunkId];
            const updatedObjects = objects.filter(obj => obj.id !== objectId);
            
            const updatedChunkObjects = {
                ...roomState.chunkObjects,
                [chunkId]: updatedObjects
            };
            
            this.room.party.updateRoomState({
                chunkObjects: updatedChunkObjects
            });
        }
    }
    
    storeObjectPickup(chunkId, objectId) {
        // Send message that we picked up an object
        this.room.send({
            type: "objectPickedUp",
            chunkId: chunkId,
            objectId: objectId,
            clientId: this.clientId
        });
        
        // Update room state
        const roomState = this.room.party.roomState;
        if (roomState && roomState.chunkObjects && roomState.chunkObjects[chunkId]) {
            // Remove the object from the room state
            const objects = roomState.chunkObjects[chunkId];
            const updatedObjects = objects.filter(obj => obj.id !== objectId);
            
            const updatedChunkObjects = {
                ...roomState.chunkObjects,
                [chunkId]: updatedObjects
            };
            
            this.room.party.updateRoomState({
                chunkObjects: updatedChunkObjects
            });
        }
    }
    
    saveChunkObjects(chunkId, objects) {
        // Save objects for a chunk to the room state
        const roomState = this.room.party.roomState;
        if (roomState && roomState.chunkObjects) {
            // Only save if not already present
            if (!roomState.chunkObjects[chunkId]) {
                const updatedChunkObjects = {
                    ...roomState.chunkObjects,
                    [chunkId]: objects
                };
                
                this.room.party.updateRoomState({
                    chunkObjects: updatedChunkObjects
                });
            }
        }
    }
    
    getChunkObjects(chunkId) {
        // Get objects for a chunk from the room state
        const roomState = this.room.party.roomState;
        if (roomState && roomState.chunkObjects && roomState.chunkObjects[chunkId]) {
            return roomState.chunkObjects[chunkId];
        }
        return null;
    }
    
    update(deltaTime) {
        // Update player position at a reasonable rate (10 times per second)
        this.updateCounter = (this.updateCounter || 0) + deltaTime;
        if (this.updateCounter > 0.1) { // Update every 100ms
            this.updatePlayerPosition();
            this.updateCounter = 0;
        }
    }
    
    dispose() {
        // Clean up players
        for (const clientId of this.players.keys()) {
            this.removePlayer(clientId);
        }
        
        this.players.clear();
        this.playerBodies.clear();
    }
}