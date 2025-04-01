
// Hackatime Tracker Module
class HackatimeTracker {
    constructor() {
        this.isActive = false;
        this.heartbeatInterval = null;
        this.lastHeartbeat = null;
        this.status = 'idle';
        this.editorType = document.getElementById('site-type')?.value || 'unknown';
        this.siteId = document.getElementById('site-id')?.value || 'unknown';
        this.entityName = this.editorType === 'python' ? 'main.py' : 'index.html';
        this.language = this.editorType === 'python' ? 'Python' : 'HTML';
        this.editor = window.pythonEditor || window.editor;
    }

    init() {
        // Check if Hackatime is connected (badge will only appear if it is)
        this.checkHackatimeStatus();
        
        // Create the badge if Hackatime is connected
        this.createBadge();
        
        // Setup event listeners
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
        
        // Listen for editor changes to track activity
        if (this.editor) {
            this.editor.on('changes', () => {
                this.status = 'active';
                this.updateBadgeStatus('active');
            });
        }
    }
    
    checkHackatimeStatus() {
        fetch('/hackatime/status', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            this.isActive = data.connected;
            if (this.isActive) {
                this.createBadge();
                this.startHeartbeatTracking();
            }
        })
        .catch(error => {
            console.error('Error checking Hackatime status:', error);
            this.isActive = false;
        });
    }
    
    createBadge() {
        if (!this.isActive) return;
        
        // Create badge element if it doesn't exist
        if (!document.getElementById('hackatime-badge')) {
            const badge = document.createElement('div');
            badge.id = 'hackatime-badge';
            badge.className = 'hackatime-badge';
            badge.innerHTML = `
                <div class="hackatime-badge-icon">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="hackatime-badge-status">
                    <span id="hackatime-status">Connecting...</span>
                </div>
            `;
            
            // Add tooltip on hover
            badge.title = 'Hackatime is tracking your coding activity';
            
            // Add the badge to the document
            document.body.appendChild(badge);
            
            // Set initial status
            this.updateBadgeStatus('connecting');
        }
    }
    
    updateBadgeStatus(status) {
        const statusElement = document.getElementById('hackatime-status');
        if (!statusElement) return;
        
        const badge = document.getElementById('hackatime-badge');
        
        switch (status) {
            case 'active':
                statusElement.textContent = 'Active';
                badge.className = 'hackatime-badge active';
                break;
            case 'idle':
                statusElement.textContent = 'Idle';
                badge.className = 'hackatime-badge idle';
                break;
            case 'error':
                statusElement.textContent = 'Error';
                badge.className = 'hackatime-badge error';
                break;
            case 'connecting':
                statusElement.textContent = 'Connecting...';
                badge.className = 'hackatime-badge connecting';
                break;
            case 'syncing':
                statusElement.textContent = 'Syncing...';
                badge.className = 'hackatime-badge syncing';
                break;
            default:
                statusElement.textContent = 'Connected';
                badge.className = 'hackatime-badge';
        }
    }
    
    startHeartbeatTracking() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // Send initial heartbeat
        this.sendHeartbeat();
        
        // Set up interval for regular heartbeats (every 30 seconds)
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 30000); // 30 seconds
    }
    
    stopHeartbeatTracking() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    
    sendHeartbeat() {
        if (!this.isActive) return;
        
        // Show syncing status briefly
        this.updateBadgeStatus('syncing');
        
        // Prepare heartbeat data
        const heartbeat = {
            type: 'file',
            time: Math.floor(Date.now() / 1000),
            entity: this.entityName,
            language: this.language,
            is_write: this.status === 'active',
            site_id: this.siteId
        };
        
        fetch('/hackatime/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(heartbeat)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.lastHeartbeat = new Date();
                this.updateBadgeStatus(this.status);
            } else {
                this.updateBadgeStatus('error');
            }
        })
        .catch(error => {
            console.error('Error sending heartbeat:', error);
            this.updateBadgeStatus('error');
        });
        
        // Reset status to idle after sending heartbeat if it was active
        if (this.status === 'active') {
            setTimeout(() => {
                this.status = 'idle';
                this.updateBadgeStatus('idle');
            }, 2000);
        }
    }
    
    handleVisibilityChange() {
        if (document.hidden) {
            // Page is hidden
            this.stopHeartbeatTracking();
        } else {
            // Page is visible again
            this.startHeartbeatTracking();
        }
    }
}

// Initialize the tracker when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const hackatimeTracker = new HackatimeTracker();
    hackatimeTracker.init();
    
    // Make it available globally for debugging
    window.hackatimeTracker = hackatimeTracker;
});
