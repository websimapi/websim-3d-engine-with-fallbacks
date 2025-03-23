import { config } from './config.js';

export class CharacterController {
    constructor(scene) {
        this.scene = scene;
        this.mixer = null;
        this.character = null;
        this.animations = {};
        this.currentAction = null;
        this.targetPosition = null;
        this.isMoving = false;
        this.navMarker = null;
        this.rotationSpeed = config.world.playerTurnSpeed;
        this.moveSpeed = config.world.playerSpeed;
        
        // Load character model
        this.loadCharacterModel();
        
        // Create a navigation marker
        this.createNavMarker();
    }
    
    createNavMarker() {
        const markerGeometry = new THREE.CylinderGeometry(0.5, 0, 2, 12);
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.navMarker = new THREE.Mesh(markerGeometry, markerMaterial);
        this.navMarker.visible = false;
        this.scene.add(this.navMarker);
    }
    
    async loadCharacterModel() {
        try {
            // Load the GLTF loader
            if (!THREE.GLTFLoader) {
                // If GLTFLoader is not available, load it
                await this.loadGLTFLoader();
            }
            
            const loader = new THREE.GLTFLoader();
            
            // Use a free rigged character model
            const modelUrl = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/Xbot.glb';
            
            loader.load(modelUrl, (gltf) => {
                this.character = gltf.scene;
                
                // Set up character in scene
                this.character.scale.set(1, 1, 1);
                this.character.position.set(0, 0, 0);
                this.character.castShadow = true;
                this.character.receiveShadow = true;
                
                // Traverse and set shadows for all meshes
                this.character.traverse((object) => {
                    if (object.isMesh) {
                        object.castShadow = true;
                        object.receiveShadow = true;
                    }
                });
                
                this.scene.add(this.character);
                
                // Set up animation mixer
                this.mixer = new THREE.AnimationMixer(this.character);
                
                // Store all animations
                if (gltf.animations && gltf.animations.length) {
                    gltf.animations.forEach((clip) => {
                        this.animations[clip.name] = this.mixer.clipAction(clip);
                    });
                    
                    // Set default animation
                    this.currentAction = this.animations["idle"] || this.animations[Object.keys(this.animations)[0]];
                    if (this.currentAction) {
                        this.currentAction.play();
                    }
                }
                
                console.log('Character loaded with animations:', Object.keys(this.animations));
                
                // If model doesn't have animations, load a separate animation file
                if (Object.keys(this.animations).length === 0) {
                    this.loadAdditionalAnimations();
                }
            }, 
            // Progress callback
            (xhr) => {
                console.log(`Character ${Math.round(xhr.loaded / xhr.total * 100)}% loaded`);
            },
            // Error callback
            (error) => {
                console.error('Error loading character model:', error);
                // Try fallback model if primary fails
                this.loadFallbackModel();
            });
        } catch (error) {
            console.error('Failed to load character model:', error);
        }
    }
    
    async loadGLTFLoader() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
            script.onload = () => {
                THREE.GLTFLoader = THREE.GLTFLoader || GLTFLoader;
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    loadFallbackModel() {
        // Try a simpler model as fallback
        const loader = new THREE.GLTFLoader();
        const fallbackUrl = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/SimplifiedRobot.glb';
        
        loader.load(fallbackUrl, (gltf) => {
            this.character = gltf.scene;
            this.character.scale.set(1, 1, 1);
            this.character.position.set(0, 0, 0);
            this.character.castShadow = true;
            
            this.character.traverse((object) => {
                if (object.isMesh) {
                    object.castShadow = true;
                    object.receiveShadow = true;
                }
            });
            
            this.scene.add(this.character);
            
            // Set up animation mixer
            this.mixer = new THREE.AnimationMixer(this.character);
            
            // Store all animations
            if (gltf.animations && gltf.animations.length) {
                gltf.animations.forEach((clip) => {
                    this.animations[clip.name] = this.mixer.clipAction(clip);
                });
                
                this.currentAction = this.animations[Object.keys(this.animations)[0]];
                if (this.currentAction) {
                    this.currentAction.play();
                }
            }
            
            console.log('Fallback character loaded with animations:', Object.keys(this.animations));
        });
    }
    
    loadAdditionalAnimations() {
        const loader = new THREE.GLTFLoader();
        const animationsUrl = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/Soldier.glb';
        
        loader.load(animationsUrl, (gltf) => {
            // Add animations from this model to our character
            if (gltf.animations && gltf.animations.length && this.mixer) {
                gltf.animations.forEach((clip) => {
                    // Retarget animation if needed
                    const action = this.mixer.clipAction(clip);
                    this.animations[clip.name] = action;
                });
                
                // Set default animation
                if (!this.currentAction) {
                    this.currentAction = this.animations["idle"] || this.animations[Object.keys(this.animations)[0]];
                    if (this.currentAction) {
                        this.currentAction.play();
                    }
                }
                
                console.log('Additional animations loaded:', Object.keys(this.animations));
            }
        });
    }
    
    // Play a specific animation
    playAnimation(name, fadeTime = 0.5) {
        if (!this.mixer || !this.animations[name]) return;
        
        // Don't restart the same animation
        if (this.currentAction === this.animations[name]) return;
        
        // Fade from current animation to new one
        const previousAction = this.currentAction;
        this.currentAction = this.animations[name];
        
        if (previousAction) {
            previousAction.fadeOut(fadeTime);
        }
        
        this.currentAction.reset()
            .setEffectiveTimeScale(1)
            .setEffectiveWeight(1)
            .fadeIn(fadeTime)
            .play();
    }
    
    // Move character to target position
    moveTo(position) {
        this.targetPosition = new THREE.Vector3(position.x, 0, position.z);
        this.isMoving = true;
        
        // Show navigation marker at target position
        if (this.navMarker) {
            this.navMarker.position.copy(position);
            // Raise slightly above ground to avoid z-fighting
            this.navMarker.position.y = 0.1;
            this.navMarker.visible = true;
        }
        
        // Play walking animation
        this.playAnimation("walk") || this.playAnimation("Walking");
    }
    
    // Update character position, rotation and animations
    update(deltaTime) {
        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
        
        // Update movement
        if (this.isMoving && this.character && this.targetPosition) {
            // Calculate direction vector
            const directionVector = new THREE.Vector3().subVectors(
                this.targetPosition, 
                this.character.position
            );
            
            // Normalize for distance calculation
            const distance = directionVector.length();
            
            // If we're close enough to the target, stop moving
            if (distance < 0.2) {
                this.isMoving = false;
                
                // Hide navigation marker
                if (this.navMarker) {
                    this.navMarker.visible = false;
                }
                
                // Play idle animation
                this.playAnimation("idle") || this.playAnimation("Idle");
                
                return;
            }
            
            // Normalize for movement
            directionVector.normalize();
            
            // Move character based on direction and speed
            this.character.position.x += directionVector.x * this.moveSpeed * deltaTime;
            this.character.position.z += directionVector.z * this.moveSpeed * deltaTime;
            
            // Smooth rotation towards movement direction
            const targetRotation = Math.atan2(directionVector.x, directionVector.z);
            
            // Get current rotation
            let currentRotation = this.character.rotation.y;
            
            // Find the shortest angle to rotate
            const angleDiff = (targetRotation - currentRotation) % (Math.PI * 2);
            const shortestAngle = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
            
            // Apply smooth rotation
            this.character.rotation.y += shortestAngle * this.rotationSpeed * deltaTime;
        }
    }
    
    // Clean up resources
    dispose() {
        if (this.mixer) {
            this.mixer.stopAllAction();
        }
        
        if (this.character) {
            this.scene.remove(this.character);
            this.character.traverse((object) => {
                if (object.isMesh) {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(material => material.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                }
            });
        }
        
        if (this.navMarker) {
            this.scene.remove(this.navMarker);
            if (this.navMarker.geometry) this.navMarker.geometry.dispose();
            if (this.navMarker.material) this.navMarker.material.dispose();
        }
        
        this.animations = {};
        this.currentAction = null;
        this.character = null;
        this.mixer = null;
    }
}
