import { config } from './config.js';

export class Character {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.model = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.targetPosition = null;
        this.isMoving = false;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        
        this.raycaster = new THREE.Raycaster();
        this.initialize();
    }
    
    async initialize() {
        try {
            await this.loadModel();
            this.setupClickToMove();
        } catch (error) {
            console.error('Failed to initialize character:', error);
        }
    }
    
    async loadModel() {
        // Load the character model
        const loader = new THREE.GLTFLoader();
        
        return new Promise((resolve, reject) => {
            loader.load(config.character.model, (gltf) => {
                this.model = gltf.scene;
                
                // Scale the model
                this.model.scale.set(
                    config.character.scale,
                    config.character.scale,
                    config.character.scale
                );
                
                // Position the model
                this.model.position.set(0, 0, 0);
                
                // Make sure model casts and receives shadows
                this.model.traverse((node) => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                    }
                });
                
                // Add to scene
                if (this.scene.threeScene) {
                    this.scene.threeScene.add(this.model);
                }
                
                // Set up animations
                if (gltf.animations && gltf.animations.length) {
                    this.mixer = new THREE.AnimationMixer(this.model);
                    
                    // Create animation actions
                    gltf.animations.forEach((clip) => {
                        const action = this.mixer.clipAction(clip);
                        this.animations[clip.name] = action;
                        
                        // Pre-load animation for smoother playback
                        action.play();
                        action.weight = 0;
                    });
                    
                    // Set idle animation as default
                    if (this.animations['idle']) {
                        this.playAnimation('idle');
                    } else if (gltf.animations.length > 0) {
                        // If no idle animation found, play the first one
                        const firstAnimName = gltf.animations[0].name;
                        this.playAnimation(firstAnimName);
                    }
                }
                
                resolve(gltf);
            }, undefined, reject);
        });
    }
    
    setupClickToMove() {
        const canvas = this.renderer.canvas;
        
        // Add click listener
        canvas.addEventListener('click', (event) => {
            // Convert mouse position to normalized device coordinates
            const rect = canvas.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
            const y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;
            
            // Raycast from camera
            const camera = this.renderer.getCamera();
            this.raycaster.setFromCamera({ x, y }, camera);
            
            // Find intersection with the ground
            const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const target = new THREE.Vector3();
            
            if (this.raycaster.ray.intersectPlane(groundPlane, target)) {
                // Set target position for movement
                this.targetPosition = target;
                
                // Look at target
                const lookAt = new THREE.Vector3(target.x, this.model.position.y, target.z);
                this.model.lookAt(lookAt);
                
                // Start walking animation
                this.playAnimation('walk');
                this.isMoving = true;
            }
        });
    }
    
    playAnimation(name) {
        // Find closest matching animation
        let animationName = name;
        if (!this.animations[name]) {
            // Find animation that contains the name
            const keys = Object.keys(this.animations);
            for (const key of keys) {
                if (key.toLowerCase().includes(name.toLowerCase())) {
                    animationName = key;
                    break;
                }
            }
            
            // If still not found, use the first animation
            if (!this.animations[animationName] && keys.length > 0) {
                animationName = keys[0];
            }
        }
        
        // No animations, exit
        if (!this.animations[animationName]) return;
        
        // Stop previous animation
        if (this.currentAction) {
            const prevAction = this.currentAction;
            const nextAction = this.animations[animationName];
            
            // Cross-fade to new animation
            nextAction.reset();
            nextAction.setEffectiveTimeScale(1);
            nextAction.setEffectiveWeight(1);
            nextAction.time = 0;
            
            prevAction.crossFadeTo(nextAction, 0.5, true);
            nextAction.play();
        } else {
            // Just play new animation
            this.animations[animationName].play();
        }
        
        this.currentAction = this.animations[animationName];
    }
    
    update(deltaTime) {
        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
        
        // Update movement
        if (this.isMoving && this.targetPosition) {
            // Calculate direction and distance
            this.direction.subVectors(this.targetPosition, this.model.position);
            const distance = this.direction.length();
            
            // If close enough to target, stop moving
            if (distance < 0.2) {
                this.isMoving = false;
                this.playAnimation('idle');
                return;
            }
            
            // Normalize direction and scale by speed and delta time
            this.direction.normalize();
            const moveStep = config.character.moveSpeed * deltaTime;
            
            // Don't overshoot target
            const step = Math.min(moveStep, distance);
            
            // Move model
            this.model.position.addScaledVector(this.direction, step);
        }
    }
    
    // Set character position directly
    setPosition(x, y, z) {
        if (this.model) {
            this.model.position.set(x, y, z);
        }
    }
    
    // Get character position
    getPosition() {
        if (this.model) {
            return this.model.position.clone();
        }
        return new THREE.Vector3();
    }
}