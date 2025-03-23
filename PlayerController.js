/**
 * Player movement and controls
 */
export class PlayerController {
    constructor(scene) {
        this.scene = scene;
        this.playerBody = null;
        this.playerSphere = null;
        this.canvas = document.getElementById('renderCanvas');
        
        // Input state
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };
        
        // Mouse/touch drag controls
        this.dragControls = {
            isDragging: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            forceMultiplier: 15   // Increased force multiplier
        };
        
        this.setupControls();
    }
    
    setPlayerObjects(playerSphere, playerBody) {
        this.playerSphere = playerSphere;
        this.playerBody = playerBody;
    }
    
    setupControls() {
        // Set up keyboard controls
        window.addEventListener('keydown', (e) => {
            switch(e.key.toLowerCase()) {
                case 'w':
                case 'arrowup':
                    this.keys.forward = true;
                    break;
                case 's':
                case 'arrowdown':
                    this.keys.backward = true;
                    break;
                case 'a':
                case 'arrowleft':
                    this.keys.left = true;
                    break;
                case 'd':
                case 'arrowright':
                    this.keys.right = true;
                    break;
                case ' ':
                    this.keys.jump = true;
                    break;
            }
        });
        
        window.addEventListener('keyup', (e) => {
            switch(e.key.toLowerCase()) {
                case 'w':
                case 'arrowup':
                    this.keys.forward = false;
                    break;
                case 's':
                case 'arrowdown':
                    this.keys.backward = false;
                    break;
                case 'a':
                case 'arrowleft':
                    this.keys.left = false;
                    break;
                case 'd':
                case 'arrowright':
                    this.keys.right = false;
                    break;
                case ' ':
                    this.keys.jump = false;
                    break;
            }
        });
        
        // Set up mouse/touch drag controls
        this.canvas.addEventListener('mousedown', this.onDragStart.bind(this));
        window.addEventListener('mousemove', this.onDragMove.bind(this));
        window.addEventListener('mouseup', this.onDragEnd.bind(this));
        
        // Touch events
        this.canvas.addEventListener('touchstart', this.onDragStart.bind(this));
        window.addEventListener('touchmove', this.onDragMove.bind(this));
        window.addEventListener('touchend', this.onDragEnd.bind(this));
    }
    
    // Handle drag start
    onDragStart(e) {
        e.preventDefault();
        this.dragControls.isDragging = true;
        
        // Get client position for mouse or touch
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        this.dragControls.startX = clientX;
        this.dragControls.startY = clientY;
        this.dragControls.currentX = clientX;
        this.dragControls.currentY = clientY;
    }
    
    // Handle drag move
    onDragMove(e) {
        if (!this.dragControls.isDragging) return;
        
        // Get client position for mouse or touch
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        this.dragControls.currentX = clientX;
        this.dragControls.currentY = clientY;
    }
    
    // Handle drag end
    onDragEnd(e) {
        this.dragControls.isDragging = false;
    }
    
    update(deltaTime, camera) {
        if (!this.playerBody) return;
        
        // Calculate force based on inputs
        const forceVector = new CANNON.Vec3(0, 0, 0);
        
        // Get camera direction for relative movement
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Keep movement on ground plane
        cameraDirection.normalize();
        
        // Calculate forward and right vectors
        const forward = cameraDirection.clone();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
        
        // Force strength based on mass
        const forceStrength = 120 * (this.playerBody.mass / 5);
        
        // Apply forces based on keyboard input
        if (this.keys.forward) {
            forceVector.x += forward.x * forceStrength;
            forceVector.z += forward.z * forceStrength;
        }
        if (this.keys.backward) {
            forceVector.x -= forward.x * forceStrength;
            forceVector.z -= forward.z * forceStrength;
        }
        if (this.keys.right) {
            forceVector.x += right.x * forceStrength;
            forceVector.z += right.z * forceStrength;
        }
        if (this.keys.left) {
            forceVector.x -= right.x * forceStrength;
            forceVector.z -= right.z * forceStrength;
        }
        
        // Process drag input if active
        if (this.dragControls && this.dragControls.isDragging) {
            // Calculate drag direction and distance
            const dragX = this.dragControls.currentX - this.dragControls.startX;
            const dragY = this.dragControls.currentY - this.dragControls.startY;
            
            // Only apply if drag amount is significant
            if (Math.abs(dragX) > 5 || Math.abs(dragY) > 5) {
                // Convert screen drag to world direction
                forceVector.x += (forward.x * -dragY + right.x * dragX) * this.dragControls.forceMultiplier;
                forceVector.z += (forward.z * -dragY + right.z * dragX) * this.dragControls.forceMultiplier;
                
                // Reset start position so we don't get continuous acceleration
                this.dragControls.startX = this.dragControls.currentX;
                this.dragControls.startY = this.dragControls.currentY;
            }
        }
        
        // Apply jump if space is pressed and player is near ground
        if (this.keys.jump) {
            // Check if player is on or near ground (within 0.5 units)
            const ray = new CANNON.Ray();
            ray.from.copy(this.playerBody.position);
            ray.to.copy(this.playerBody.position);
            ray.to.y -= this.playerBody.shapes[0].radius + 0.5;
            
            const result = new CANNON.RaycastResult();
            ray.intersectWorld(this.scene.engine.activeEngines.physics.world, { result });
            
            if (result.hasHit) {
                // Player is on ground, apply jump force (proportional to mass)
                forceVector.y = forceStrength * 15;
            }
        }
        
        // Apply the force
        if (forceVector.length() > 0) {
            this.playerBody.applyForce(forceVector, this.playerBody.position);
        }
    }
    
    dispose() {
        // Remove event listeners
        if (this.canvas) {
            this.canvas.removeEventListener('mousedown', this.onDragStart);
            this.canvas.removeEventListener('touchstart', this.onDragStart);
        }
        
        window.removeEventListener('mousemove', this.onDragMove);
        window.removeEventListener('mouseup', this.onDragEnd);
        window.removeEventListener('touchmove', this.onDragMove);
        window.removeEventListener('touchend', this.onDragEnd);
    }
}
