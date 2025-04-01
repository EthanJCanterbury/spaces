
// Hackatime Tracker Module
class HackatimeTracker {
    constructor() {
        this.isActive = false;
        this.heartbeatInterval = null;
        this.lastHeartbeat = null;
        this.status = 'monitoring'; // Changed from 'idle' to 'monitoring'
        this.editorType = document.getElementById('site-type')?.value || 'unknown';
        this.siteId = document.getElementById('site-id')?.value || 'unknown';
        this.entityName = this.editorType === 'python' ? 'main.py' : 'index.html';
        this.language = this.editorType === 'python' ? 'Python' : 'HTML';
        this.siteName = document.querySelector('.topbar-left h1')?.textContent || 'Unknown Project';
        
        // Safely get editor reference
        this.editor = null;
        if (window.pythonEditor) {
            this.editor = window.pythonEditor;
        } else if (window.editor && typeof window.editor.on === 'function') {
            this.editor = window.editor;
        }
    }

    init() {
        // First check if Hackatime is connected before doing anything else
        this.checkHackatimeStatus();
    }
    
    checkHackatimeStatus() {
        console.log(`[Hackatime] Checking connection status...`);
        fetch('/hackatime/status', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            this.isActive = data.connected;
            console.log(`[Hackatime] Connected: ${this.isActive}`);
            if (this.isActive) {
                this.createBadge();
                this.setupEditorListeners();
                this.startHeartbeatTracking();
            }
        })
        .catch(error => {
            console.error('[Hackatime] Error checking status:', error);
            this.isActive = false;
        });
    }
    
    setupEditorListeners() {
        // Listen for editor changes to track activity
        if (this.editor && typeof this.editor.on === 'function') {
            this.editor.on('changes', () => {
                const currentFile = document.querySelector('.file-tab.active')?.getAttribute('data-filename') || this.entityName;
                console.log(`[Hackatime] File changed: ${currentFile} in project "${this.siteName}"`);
                this.status = 'active';
                this.updateBadgeStatus('active');
            });
        }
        
        // Listen for file tab changes
        document.querySelectorAll('.file-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const filename = tab.getAttribute('data-filename');
                console.log(`[Hackatime] Switched to file: ${filename}`);
                this.entityName = filename;
            });
        });
        
        // Setup visibility change listener
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
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
            case 'monitoring': // Changed from 'idle' to 'monitoring'
                statusElement.textContent = 'Monitoring';
                badge.className = 'hackatime-badge idle'; // Keep the same CSS class
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
        
        console.log(`[Hackatime] Starting heartbeat tracking for project "${this.siteName}"`);
        
        // Send initial heartbeat
        this.sendHeartbeat();
        
        // Set up interval for regular heartbeats (every 30 seconds)
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 30000); // 30 seconds
    }
    
    stopHeartbeatTracking() {
        if (this.heartbeatInterval) {
            console.log(`[Hackatime] Stopping heartbeat tracking`);
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    
    sendHeartbeat() {
        if (!this.isActive) return;
        
        // Show syncing status briefly
        this.updateBadgeStatus('syncing');
        
        // Get current file from active tab
        const currentFile = document.querySelector('.file-tab.active')?.getAttribute('data-filename') || this.entityName;
        
        // Prepare heartbeat data
        const heartbeat = {
            type: 'file',
            time: Math.floor(Date.now() / 1000),
            entity: currentFile,
            language: this.getLanguageFromFile(currentFile),
            is_write: this.status === 'active',
            site_id: this.siteId
        };
        
        console.log(`[Hackatime] Sending heartbeat:`, heartbeat);
        
        fetch('/hackatime/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(heartbeat)
        })
        .then(response => {
            console.log(`[Hackatime] Heartbeat response status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            console.log(`[Hackatime] Heartbeat response:`, data);
            if (data.success) {
                this.lastHeartbeat = new Date();
                this.updateBadgeStatus(this.status);
                console.log(`[Hackatime] Heartbeat successful for ${currentFile}`);
            } else {
                this.updateBadgeStatus('error');
                console.error(`[Hackatime] Heartbeat failed:`, data.message);
            }
        })
        .catch(error => {
            console.error('[Hackatime] Error sending heartbeat:', error);
            this.updateBadgeStatus('error');
        });
        
        // Reset status to monitoring after sending heartbeat if it was active
        if (this.status === 'active') {
            setTimeout(() => {
                this.status = 'monitoring'; // Changed from 'idle' to 'monitoring'
                this.updateBadgeStatus('monitoring');
            }, 2000);
        }
    }
    
    getLanguageFromFile(filename) {
        if (!filename) return this.language;
        
        const extension = filename.split('.').pop().toLowerCase();
        
        switch (extension) {
            case 'py':
                return 'Python';
            case 'js':
                return 'JavaScript';
            case 'html':
                return 'HTML';
            case 'css':
                return 'CSS';
            case 'json':
                return 'JSON';
            case 'md':
                return 'Markdown';
            default:
                return this.language;
        }
    }
    
    handleVisibilityChange() {
        if (document.hidden) {
            // Page is hidden
            console.log(`[Hackatime] Page hidden, pausing tracking`);
            this.stopHeartbeatTracking();
        } else {
            // Page is visible again
            console.log(`[Hackatime] Page visible, resuming tracking`);
            this.startHeartbeatTracking();
        }
    }
}

// Initialize the tracker when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Hackatime] Initializing tracker');
    const hackatimeTracker = new HackatimeTracker();
    hackatimeTracker.init();
    
    // Make it available globally for debugging
    window.hackatimeTracker = hackatimeTracker;
});
