import { config } from './config.js';
import { MathUtils } from './utils.js';

export class CharacterController {
    constructor(engine, scene) {
        this.engine = engine;
        this.scene = scene;
        this.mesh = null;
        this.mixer = null;
        this.animations = {};
        this.currentAnimation = null;
        this.position = { x: 0, y: 0, z: 0 };
        this.targetPosition = { x: 0, y: 0, z: 0 };
        this.isMoving = false;
        this.moveSpeed = config.character.moveSpeed;
        this.rotationSpeed = config.character.rotationSpeed;
        this.currentRotation = 0;
        this.targetRotation = 0;
        this.cameraPivot = null;
        this.cameraOffset = config.character.cameraOffset;
        this.initialized = false;
        this.raycaster = null;
        this.plane = null;
        
        // Physics properties
        this.physicsBody = null;
        this.isGrounded = false;
        this.jumpForce = 10;
        this.gravity = -20;
        this.velocity = { x: 0, y: 0, z: 0 };
        this.collisionMargin = 0.5;
        
        // Initialize based on current engine
        if (this.engine.currentRenderingEngine === 'three.js') {
            this.initThreeCharacter();
        } else if (this.engine.currentRenderingEngine === 'babylon.js') {
            this.initBabylonCharacter();
        }
    }
    
    async initThreeCharacter() {
        try {
            // Create a raycaster for click detection and ground checks
            this.raycaster = new THREE.Raycaster();
            
            // Add click event listener
            window.addEventListener('click', this.handleClick.bind(this));
            
            // Create an invisible plane for raycasting
            const planeGeometry = new THREE.PlaneGeometry(10000, 10000);
            const planeMaterial = new THREE.MeshBasicMaterial({ 
                visible: false,
                side: THREE.DoubleSide
            });
            this.plane = new THREE.Mesh(planeGeometry, planeMaterial);
            this.plane.rotation.x = -Math.PI / 2;
            this.plane.position.y = 0;
            this.plane.userData.isPlane = true;
            this.scene.threeScene.add(this.plane);
            
            // Create a character model
            await this.loadCharacterModel();
            
            // Create camera pivot
            this.cameraPivot = new THREE.Object3D();
            this.cameraPivot.position.set(0, 0, 0);
            this.scene.threeScene.add(this.cameraPivot);
            
            // Setup physics
            this.setupPhysics();
            
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize character:', error);
        }
    }
    
    setupPhysics() {
        if (!this.engine.activeEngines.physics || !this.mesh) return;
        
        try {
            // Create a physics body for the character
            const physicsEngine = this.engine.activeEngines.physics;
            const characterRadius = 2; // approximate radius of character
            const characterHeight = 10; // approximate height of character
            
            // Create a capsule shape for better character physics
            const shape = new CANNON.Cylinder(
                characterRadius, // top radius
                characterRadius, // bottom radius
                characterHeight, // height
                8 // number of segments
            );
            
            // Create the physics body
            this.physicsBody = physicsEngine.createBody({
                mass: 70, // Character mass in kg
                position: new CANNON.Vec3(this.position.x, this.position.y + characterHeight/2, this.position.z),
                shape: shape,
                material: new CANNON.Material({
                    friction: 0.3,
                    restitution: 0.0 // No bouncing
                })
            });
            
            // Add damping to prevent sliding
            this.physicsBody.linearDamping = 0.9;
            this.physicsBody.angularDamping = 0.9;
            
            // Prevent character from tipping over
            this.physicsBody.fixedRotation = true;
            this.physicsBody.updateMassProperties();
            
            // Store reference to character controller in the body
            this.physicsBody.characterController = this;
            
            // Set initial position
            this.updatePhysicsBody();
            
            console.log('Character physics initialized');
        } catch (error) {
            console.error('Failed to setup character physics:', error);
        }
    }
    
    async loadCharacterModel() {
        // Create a simple character
        const loader = new THREE.GLTFLoader();
        
        try {
            const result = await new Promise((resolve, reject) => {
                loader.load(
                    'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/Soldier.glb',
                    resolve,
                    undefined,
                    reject
                );
            });
            
            this.mesh = result.scene;
            this.mesh.scale.set(5, 5, 5);
            this.mesh.position.y = 0;
            this.mesh.userData.isCharacter = true;  // Mark as character for raycasting
            this.mesh.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.userData.isCharacter = true;  // Mark all child meshes
                }
            });
            
            // Setup animations
            this.mixer = new THREE.AnimationMixer(this.mesh);
            result.animations.forEach((clip) => {
                const name = clip.name.toLowerCase();
                this.animations[name] = this.mixer.clipAction(clip);
            });
            
            // Set initial animation
            this.playAnimation('idle');
            
            // Add to scene
            this.scene.threeScene.add(this.mesh);
            
            // Set initial position with proper ground height
            this.position = { 
                x: 0, 
                y: this.getGroundHeight(0, 0), 
                z: 0 
            };
            this.targetPosition = { ...this.position };
            this.updatePosition();
        } catch (error) {
            console.error('Error loading character model:', error);
        }
    }
    
    playAnimation(name, fadeTime = 0.5) {
        const anim = this.animations[name];
        if (!anim) return;
        
        if (this.currentAnimation) {
            this.currentAnimation.fadeOut(fadeTime);
        }
        
        anim.reset().fadeIn(fadeTime).play();
        this.currentAnimation = anim;
    }
    
    handleClick(event) {
        if (!this.initialized || !this.mesh || !this.raycaster) return;
        
        // Calculate mouse position in normalized device coordinates (-1 to +1)
        const mouse = new THREE.Vector2();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Update raycaster
        const camera = this.engine.activeEngines.renderer.getCamera();
        this.raycaster.setFromCamera(mouse, camera);
        
        // First check for intersections with terrain chunks
        let intersects = this.raycaster.intersectObjects(this.scene.threeScene.children, true);
        
        // Filter out non-terrain objects (like our character)
        intersects = intersects.filter(hit => hit.object !== this.mesh && 
                                       hit.object !== this.plane && 
                                       !hit.object.userData.isCharacter);
        
        if (intersects.length > 0) {
            // Get point of intersection
            const point = intersects[0].point;
            
            // Set new target position
            this.targetPosition = { 
                x: point.x, 
                y: point.y, // Use the actual hit point y value
                z: point.z 
            };
            
            // Calculate rotation to face the target
            const dx = this.targetPosition.x - this.position.x;
            const dz = this.targetPosition.z - this.position.z;
            this.targetRotation = Math.atan2(dx, dz);
            
            // Start moving
            this.isMoving = true;
            this.playAnimation('run');
            
            console.log('Moving to:', this.targetPosition);
        }
    }
    
    getGroundHeight(x, z) {
        // Use the scene's terrain height function if available
        if (this.scene && this.scene.getTerrainHeight) {
            return this.scene.getTerrainHeight(x, z) + 0.5; // Add small offset to prevent sinking
        }
        return 0;
    }
    
    checkGround() {
        if (!this.mesh || !this.raycaster) return false;
        
        // Create a ray from character position downward
        const rayStart = new THREE.Vector3(
            this.mesh.position.x,
            this.mesh.position.y + 1, // Start slightly above character base
            this.mesh.position.z
        );
        const rayDir = new THREE.Vector3(0, -1, 0);
        this.raycaster.set(rayStart, rayDir);
        
        // Check for intersection with terrain
        const intersects = this.raycaster.intersectObjects(this.scene.threeScene.children, true);
        
        // Filter out our own mesh and the click plane
        const validHits = intersects.filter(hit => hit.object !== this.mesh && 
                                                hit.object !== this.plane);
        
        if (validHits.length > 0) {
            // Found ground, get distance
            const groundDistance = validHits[0].distance;
            return groundDistance <= 2; // Consider grounded if less than 2 units away
        }
        
        return false;
    }
    
    updatePosition() {
        if (!this.mesh) return;
        
        this.mesh.position.set(this.position.x, this.position.y, this.position.z);
        this.mesh.rotation.y = this.currentRotation;
        
        // Update camera pivot position
        if (this.cameraPivot) {
            this.cameraPivot.position.set(
                this.position.x,
                this.position.y + this.cameraOffset.y,
                this.position.z
            );
        }
        
        // Update physics body position if it exists
        this.updatePhysicsBody();
    }
    
    updatePhysicsBody() {
        if (!this.physicsBody) return;
        
        // Update physics body position to match character
        this.physicsBody.position.x = this.position.x;
        this.physicsBody.position.y = this.position.y + 5; // Add half height offset
        this.physicsBody.position.z = this.position.z;
    }
    
    update(deltaTime) {
        if (!this.initialized || !this.mesh) return;
        
        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
        
        // Check if character is on the ground
        this.isGrounded = this.checkGround();
        
        // Handle movement from physics
        if (this.physicsBody) {
            // Get position from physics
            this.position.x = this.physicsBody.position.x;
            this.position.y = this.physicsBody.position.y - 5; // Subtract half height offset
            this.position.z = this.physicsBody.position.z;
            
            // Move towards target position
            if (this.isMoving && this.isGrounded) {
                // Calculate distance to target
                const dx = this.targetPosition.x - this.position.x;
                const dz = this.targetPosition.z - this.position.z;
                const distanceToTarget = Math.sqrt(dx * dx + dz * dz);
                
                // Smoothly rotate towards target direction
                const rotationDifference = this.targetRotation - this.currentRotation;
                let rotationDelta = rotationDifference;
                
                // Normalize rotation difference to be between -PI and PI
                if (rotationDelta > Math.PI) rotationDelta -= Math.PI * 2;
                if (rotationDelta < -Math.PI) rotationDelta += Math.PI * 2;
                
                // Apply rotation
                this.currentRotation += rotationDelta * this.rotationSpeed * deltaTime;
                
                // If close enough to target or rotation not yet aligned, don't move yet
                if (distanceToTarget > 0.5) {
                    // Calculate movement direction
                    const moveDir = new CANNON.Vec3(
                        Math.sin(this.currentRotation) * this.moveSpeed,
                        0,
                        Math.cos(this.currentRotation) * this.moveSpeed
                    );
                    
                    // Apply velocity to move character
                    this.physicsBody.velocity.x = moveDir.x;
                    this.physicsBody.velocity.z = moveDir.z;
                } else {
                    // Reached target
                    this.isMoving = false;
                    this.playAnimation('idle');
                    
                    // Stop movement
                    this.physicsBody.velocity.x = 0;
                    this.physicsBody.velocity.z = 0;
                }
            } else if (!this.isMoving) {
                // Gradually slow down if not moving
                this.physicsBody.velocity.x *= 0.9;
                this.physicsBody.velocity.z *= 0.9;
            }
        } else {
            // Fallback movement without physics
            if (this.isMoving) {
                // Calculate distance to target
                const dx = this.targetPosition.x - this.position.x;
                const dz = this.targetPosition.z - this.position.z;
                const distanceToTarget = Math.sqrt(dx * dx + dz * dz);
                
                // Smoothly rotate towards target direction
                const rotationDifference = this.targetRotation - this.currentRotation;
                let rotationDelta = rotationDifference;
                
                // Normalize rotation difference to be between -PI and PI
                if (rotationDelta > Math.PI) rotationDelta -= Math.PI * 2;
                if (rotationDelta < -Math.PI) rotationDelta += Math.PI * 2;
                
                // Apply rotation
                this.currentRotation += rotationDelta * this.rotationSpeed * deltaTime;
                
                // If close enough to target or rotation not yet aligned, don't move yet
                if (distanceToTarget > 0.5) {
                    // Move towards target
                    const moveStepX = this.moveSpeed * deltaTime * Math.sin(this.currentRotation);
                    const moveStepZ = this.moveSpeed * deltaTime * Math.cos(this.currentRotation);
                    
                    this.position.x += moveStepX;
                    this.position.z += moveStepZ;
                    
                    // Sample terrain height at current position
                    this.position.y = this.getGroundHeight(this.position.x, this.position.z);
                } else {
                    // Reached target
                    this.isMoving = false;
                    this.playAnimation('idle');
                }
            }
        }
        
        // Update position
        this.updatePosition();
        
        // Update camera to follow character
        this.updateCamera(deltaTime);
    }
    
    updateCamera(deltaTime) {
        if (!this.cameraPivot) return;
        
        const camera = this.engine.activeEngines.renderer.getCamera();
        if (!camera) return;
        
        // Position camera relative to character
        camera.position.x = this.position.x + this.cameraOffset.x;
        camera.position.y = this.position.y + this.cameraOffset.y;
        camera.position.z = this.position.z + this.cameraOffset.z;
        
        // Look at character
        camera.lookAt(
            this.position.x, 
            this.position.y + 10, // Look slightly above character
            this.position.z
        );
    }
    
    dispose() {
        // Clean up resources
        if (this.mixer) {
            this.mixer.stopAllAction();
        }
        
        window.removeEventListener('click', this.handleClick.bind(this));
        
        // Clean up physics body
        if (this.physicsBody && this.engine.activeEngines.physics) {
            this.engine.activeEngines.physics.removeBody(this.physicsBody);
            this.physicsBody = null;
        }
        
        if (this.scene.threeScene && this.mesh) {
            this.scene.threeScene.remove(this.mesh);
        }
        
        if (this.scene.threeScene && this.cameraPivot) {
            this.scene.threeScene.remove(this.cameraPivot);
        }
        
        if (this.scene.threeScene && this.plane) {
            this.scene.threeScene.remove(this.plane);
        }
    }
    
    initBabylonCharacter() {
        // Not implemented for Babylon yet
        console.warn('Babylon character controller not implemented');
    }
}