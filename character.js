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
        
        // Initialize based on current engine
        if (this.engine.currentRenderingEngine === 'three.js') {
            this.initThreeCharacter();
        } else if (this.engine.currentRenderingEngine === 'babylon.js') {
            this.initBabylonCharacter();
        }
    }
    
    async initThreeCharacter() {
        try {
            // Create a raycaster for click detection
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
            this.scene.threeScene.add(this.plane);
            
            // Create a character model
            await this.loadCharacterModel();
            
            // Create camera pivot
            this.cameraPivot = new THREE.Object3D();
            this.cameraPivot.position.set(0, 0, 0);
            this.scene.threeScene.add(this.cameraPivot);
            
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize character:', error);
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
            this.mesh.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
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
            
            // Set initial position
            this.position = { x: 0, y: 0, z: 0 };
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
        
        // Check for intersection with the ground plane
        const intersects = this.raycaster.intersectObject(this.plane);
        
        if (intersects.length > 0) {
            // Get point of intersection
            const point = intersects[0].point;
            
            // Set new target position
            this.targetPosition = { x: point.x, y: 0, z: point.z };
            
            // Calculate rotation to face the target
            const dx = this.targetPosition.x - this.position.x;
            const dz = this.targetPosition.z - this.position.z;
            this.targetRotation = Math.atan2(dx, dz);
            
            // Start moving
            this.isMoving = true;
            this.playAnimation('run');
        }
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
    }
    
    update(deltaTime) {
        if (!this.initialized || !this.mesh) return;
        
        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
        
        // Move towards target position
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
                if (this.scene.getTerrainHeight) {
                    const terrainHeight = this.scene.getTerrainHeight(this.position.x, this.position.z);
                    this.position.y = terrainHeight;
                }
            } else {
                // Reached target
                this.isMoving = false;
                this.playAnimation('idle');
            }
            
            // Update position
            this.updatePosition();
        }
        
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