
// Hackatime Tracker Module - Simplified
class HackatimeTracker {
    constructor() {
        // Core tracker state
        this.isActive = false;
        this.apiKey = null;
        this.heartbeatInterval = null;
        this.lastHeartbeat = null;
        this.status = 'monitoring';
        this.isPaused = false;
        this.timeLogged = 0;
        this.heartbeatCount = 0;
        this.lastHeartbeatTime = null;
        this.popupVisible = false;
        
        // Service endpoint (can be changed based on environment)
        this.serviceUrl = '/hackatime';
        
        // Activity tracking
        this.lastActivityTime = Date.now();
        this.afkCheckInterval = null;
        this.afkTimeoutMinutes = 1.5;
        this.wasAutoPaused = false;
        this.hiddenPause = false;
        
        // Editor information
        this.editorType = document.getElementById('site-type')?.value || 'unknown';
        this.siteId = document.getElementById('site-id')?.value || 'unknown';
        this.entityName = this.editorType === 'python' ? 'main.py' : 'index.html';
        this.language = this.editorType === 'python' ? 'Python' : 'HTML';
        this.siteName = document.querySelector('.topbar-left h1')?.textContent || 'Unknown Project';
        
        // Get editor reference
        this.editor = null;
        if (window.pythonEditor) {
            this.editor = window.pythonEditor;
        } else if (window.editor && typeof window.editor.on === 'function') {
            this.editor = window.editor;
        }
        
        // Get API key from localStorage if available
        this.apiKey = localStorage.getItem('hackatime_api_key');
    }

    init() {
        console.log('[Hackatime] Initializing tracker');
        this.timeLogged = 0;
        this.lastHeartbeatTime = null;
        this.heartbeatCount = 0;
        
        // Check connection status
        this.checkHackatimeStatus();
        
        // Start AFK monitoring
        this.startAfkCheckInterval();
        
        // Add badge CSS if not already present
        this.ensureStyles();
    }
    
    ensureStyles() {
        // Check if hackatime styles are loaded
        if (!document.getElementById('hackatime-styles')) {
            const style = document.createElement('link');
            style.id = 'hackatime-styles';
            style.rel = 'stylesheet';
            style.href = '/static/css/hackatime-badge.css';
            document.head.appendChild(style);
        }
    }

    checkHackatimeStatus() {
        console.log('[Hackatime] Checking connection status...');
        
        // Check if we have a stored API key first
        if (this.apiKey) {
            console.log('[Hackatime] Using stored API key');
            this.isActive = true;
            this.createBadge();
            this.setupEditorListeners();
            this.startHeartbeatTracking();
            return;
        }
        
        // Otherwise check with server
        fetch(`${this.serviceUrl}/status`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Hackatime-Key': this.apiKey || ''
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Status check failed: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            this.isActive = data.connected;
            console.log(`[Hackatime] Connected: ${this.isActive}`);
            
            if (this.isActive) {
                this.createBadge();
                this.setupEditorListeners();
                this.startHeartbeatTracking();
                this.updateTimeLogged();
            }
        })
        .catch(error => {
            console.error('[Hackatime] Error checking status:', error);
            this.isActive = false;
            
            // If we previously had a badge, update it to show error
            const statusEl = document.getElementById('hackatime-status');
            if (statusEl) {
                this.updateBadgeStatus('error');
            }
        });
    }

    startAfkCheckInterval() {
        // Clear previous interval if exists
        if (this.afkCheckInterval) {
            clearInterval(this.afkCheckInterval);
        }
        
        // Set new interval for checking inactivity
        this.afkCheckInterval = setInterval(() => {
            if (!this.isActive || this.isPaused) return;

            const currentTime = Date.now();
            const minutesSinceLastActivity = (currentTime - this.lastActivityTime) / (1000 * 60);

            if (minutesSinceLastActivity >= this.afkTimeoutMinutes) {
                console.log(`[Hackatime] No activity detected for ${this.afkTimeoutMinutes} minutes, auto-pausing tracking`);
                this.wasAutoPaused = true;
                
                if (!this.isPaused) {
                    this.togglePause();
                    
                    // Show toast notification if available
                    if (typeof showToast === 'function') {
                        showToast('info', `Hackatime tracking paused due to ${this.afkTimeoutMinutes} minutes of inactivity`);
                    }
                }
            }
        }, 60000); // Check every minute
    }

    setupEditorListeners() {
        // Listen for editor changes to track activity
        if (this.editor && typeof this.editor.on === 'function') {
            this.editor.on('changes', () => {
                const currentFile = document.querySelector('.file-tab.active')?.getAttribute('data-filename') || this.entityName;
                this.status = 'active';
                this.entityName = currentFile;
                this.updateBadgeStatus('active');
                this.updateLastActivityTime();
                
                console.log(`[Hackatime] File changed: ${currentFile} in "${this.siteName}"`);
            });

            // Track cursor activity
            this.editor.on('cursorActivity', () => {
                this.updateLastActivityTime();
            });
        }

        // Listen for file tab changes
        document.querySelectorAll('.file-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const filename = tab.getAttribute('data-filename');
                if (filename) {
                    this.entityName = filename;
                    this.updateLastActivityTime();
                }
            });
        });

        // Track general user activity
        document.addEventListener('keydown', () => this.updateLastActivityTime());
        document.addEventListener('mousedown', () => this.updateLastActivityTime());
        document.addEventListener('mousemove', this.debounce(() => this.updateLastActivityTime(), 500));

        // Handle visibility changes (tab switching)
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    }

    updateLastActivityTime() {
        this.lastActivityTime = Date.now();
        
        // If tracking was auto-paused and user is active again, auto-resume
        if (this.isPaused && this.wasAutoPaused) {
            console.log('[Hackatime] User is active again, auto-resuming tracking');
            this.wasAutoPaused = false;
            this.togglePause();
        }
    }

    debounce(func, delay) {
        let timeout;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    createBadge() {
        if (!this.isActive) return;

        // Create badge if it doesn't exist
        if (!document.getElementById('hackatime-badge')) {
            const badge = document.createElement('div');
            badge.id = 'hackatime-badge';
            badge.className = 'hackatime-badge';
            badge.innerHTML = `
                <div class="hackatime-badge-icon">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="hackatime-badge-status">
                    <span id="hackatime-status">Connected</span>
                </div>
            `;

            // Add tooltip
            badge.title = 'Hackatime is tracking your coding activity';
            document.body.appendChild(badge);
            
            // Set initial status
            this.updateBadgeStatus('connecting');

            // Add popup for detailed info
            const popup = document.createElement('div');
            popup.id = 'hackatime-popup';
            popup.className = 'hackatime-popup';
            popup.style.display = 'none';
            popup.innerHTML = `
                <div class="hackatime-popup-header">
                    <h3>Hackatime Integration</h3>
                    <button id="hackatime-close-popup" class="hackatime-close-btn">×</button>
                </div>
                <div class="hackatime-popup-content">
                    <div class="hackatime-popup-info">
                        <div class="hackatime-info-row">
                            <span>Project:</span>
                            <span id="hackatime-project">${this.siteName}</span>
                        </div>
                        <div class="hackatime-info-row">
                            <span>Current file:</span>
                            <span id="hackatime-file">${this.entityName}</span>
                        </div>
                        <div class="hackatime-info-row">
                            <span>Status:</span>
                            <span id="hackatime-popup-status">Connecting...</span>
                        </div>
                        <div class="hackatime-info-row">
                            <span>Time logged:</span>
                            <span id="hackatime-time-logged">0 min</span>
                        </div>
                        <div class="hackatime-info-row">
                            <span>Last heartbeat:</span>
                            <span id="hackatime-last-heartbeat">Never</span>
                        </div>
                        <div class="hackatime-info-row">
                            <span>Heartbeats sent:</span>
                            <span id="hackatime-heartbeat-count">0</span>
                        </div>
                    </div>
                    <div class="hackatime-popup-actions">
                        <button id="hackatime-toggle-pause" class="hackatime-btn">Pause Tracking</button>
                        <button id="hackatime-disconnect" class="hackatime-btn hackatime-btn-danger">Disconnect</button>
                    </div>
                </div>
            `;

            document.body.appendChild(popup);

            // Set up event listeners
            badge.addEventListener('click', () => this.togglePopup());
            document.getElementById('hackatime-close-popup').addEventListener('click', (e) => {
                e.stopPropagation();
                this.hidePopup();
            });
            document.getElementById('hackatime-toggle-pause').addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePause();
            });
            document.getElementById('hackatime-disconnect').addEventListener('click', (e) => {
                e.stopPropagation();
                this.disconnectHackatime();
            });

            // Close popup when clicking outside
            document.addEventListener('click', (e) => {
                if (this.popupVisible && !badge.contains(e.target) && !popup.contains(e.target)) {
                    this.hidePopup();
                }
            });
        }
    }

    togglePopup() {
        if (this.popupVisible) {
            this.hidePopup();
        } else {
            this.showPopup();
        }
    }

    showPopup() {
        const popup = document.getElementById('hackatime-popup');
        const badge = document.getElementById('hackatime-badge');
        if (!popup || !badge) return;

        // Update popup data
        this.updatePopupData();

        // Position popup above badge
        const badgeRect = badge.getBoundingClientRect();
        popup.style.bottom = (window.innerHeight - badgeRect.top + 10) + 'px';
        popup.style.right = (window.innerWidth - badgeRect.right + badgeRect.width/2) + 'px';

        // Show and animate popup
        popup.style.display = 'block';
        this.popupVisible = true;

        setTimeout(() => {
            popup.style.opacity = '1';
            popup.style.transform = 'translateY(0)';
        }, 50);
    }

    hidePopup() {
        const popup = document.getElementById('hackatime-popup');
        if (!popup) return;

        popup.style.opacity = '0';
        popup.style.transform = 'translateY(10px)';

        setTimeout(() => {
            popup.style.display = 'none';
            this.popupVisible = false;
        }, 300);
    }

    updatePopupData() {
        // Current file
        const currentFile = document.querySelector('.file-tab.active')?.getAttribute('data-filename') || this.entityName;
        const fileElement = document.getElementById('hackatime-file');
        if (fileElement) fileElement.textContent = currentFile;

        // Project name
        const projectElement = document.getElementById('hackatime-project');
        if (projectElement) projectElement.textContent = this.siteName;

        // Status
        const statusText = this.isPaused ? 'Paused' : this.status.charAt(0).toUpperCase() + this.status.slice(1);
        const statusElement = document.getElementById('hackatime-popup-status');
        if (statusElement) statusElement.textContent = statusText;

        // Time logged
        this.updateTimeLogged();

        // Last heartbeat time
        const heartbeatElement = document.getElementById('hackatime-last-heartbeat');
        if (heartbeatElement) {
            heartbeatElement.textContent = this.lastHeartbeat ? this.formatTimeAgo(this.lastHeartbeat) : 'Never';
        }

        // Heartbeat count
        const countElement = document.getElementById('hackatime-heartbeat-count');
        if (countElement) countElement.textContent = this.heartbeatCount.toString();

        // Toggle button text
        const pauseButton = document.getElementById('hackatime-toggle-pause');
        if (pauseButton) {
            pauseButton.textContent = this.isPaused ? 'Resume Tracking' : 'Pause Tracking';
        }
    }

    updateTimeLogged(addHeartbeatTime = false) {
        // Add time for successful heartbeat
        if (addHeartbeatTime && this.lastHeartbeatTime !== null) {
            // Add 1.5 minutes (90 seconds) for each successful heartbeat
            this.timeLogged += 1.5;
        }

        // Format time string
        let timeStr;
        if (this.timeLogged < 60) {
            timeStr = `${Math.floor(this.timeLogged)} min`;
        } else {
            const hours = Math.floor(this.timeLogged / 60);
            const mins = Math.floor(this.timeLogged % 60);
            timeStr = `${hours}h ${mins}m`;
        }

        // Update UI if popup is open
        const timeElement = document.getElementById('hackatime-time-logged');
        if (timeElement) {
            timeElement.textContent = timeStr;
        }

        return timeStr;
    }

    formatTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);

        if (seconds < 60) return 'Just now';
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        
        const days = Math.floor(hours / 24);
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }

    togglePause() {
        this.isPaused = !this.isPaused;

        if (this.isPaused) {
            this.stopHeartbeatTracking();
            this.updateBadgeStatus('paused');
        } else {
            this.startHeartbeatTracking();
            this.updateBadgeStatus(this.status);
            // Reset activity time when manually resuming
            this.updateLastActivityTime();
        }

        // Update UI if popup is open
        if (this.popupVisible) {
            this.updatePopupData();
        }
    }

    disconnectHackatime() {
        if (confirm('Are you sure you want to disconnect Hackatime? You will need to reconnect on the Hackatime settings page.')) {
            // Stop tracking
            this.stopHeartbeatTracking();
            
            // Clear intervals
            if (this.afkCheckInterval) {
                clearInterval(this.afkCheckInterval);
                this.afkCheckInterval = null;
            }
            
            // Remove API key from storage
            localStorage.removeItem('hackatime_api_key');
            this.apiKey = null;

            // Send disconnect request
            fetch(`${this.serviceUrl}/disconnect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Hackatime-Key': this.apiKey || ''
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Clean up UI
                    const badge = document.getElementById('hackatime-badge');
                    if (badge) badge.remove();

                    const popup = document.getElementById('hackatime-popup');
                    if (popup) popup.remove();

                    this.isActive = false;
                    alert('Hackatime has been disconnected successfully.');
                } else {
                    console.error('[Hackatime] Failed to disconnect:', data.message);
                    alert('Failed to disconnect Hackatime: ' + data.message);
                }
            })
            .catch(error => {
                console.error('[Hackatime] Error disconnecting:', error);
                alert('Error disconnecting Hackatime. Please try again.');
            });
        }
    }

    updateBadgeStatus(status) {
        const statusElement = document.getElementById('hackatime-status');
        if (!statusElement) return;

        const badge = document.getElementById('hackatime-badge');
        if (!badge) return;

        switch (status) {
            case 'active':
                statusElement.textContent = 'Active';
                badge.className = 'hackatime-badge active';
                break;
            case 'monitoring':
                statusElement.textContent = 'Monitoring';
                badge.className = 'hackatime-badge idle';
                break;
            case 'paused':
                statusElement.textContent = 'Paused';
                badge.className = 'hackatime-badge paused';
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

        // Update popup status if open
        if (this.popupVisible) {
            const popupStatus = document.getElementById('hackatime-popup-status');
            if (popupStatus) {
                popupStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
            }
        }
    }

    startHeartbeatTracking() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        console.log(`[Hackatime] Starting heartbeat tracking for "${this.siteName}"`);

        // Send initial heartbeat immediately
        this.sendHeartbeat();

        // Set interval for regular heartbeats (every 90 seconds)
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 90000);
    }

    stopHeartbeatTracking() {
        if (this.heartbeatInterval) {
            console.log(`[Hackatime] Stopping heartbeat tracking`);
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    sendHeartbeat() {
        // Don't send if inactive, paused, or page hidden
        if (!this.isActive || this.isPaused || document.hidden || this.hiddenPause) {
            console.log('[Hackatime] Skipping heartbeat - inactive or paused');
            return;
        }

        // Show syncing status
        this.updateBadgeStatus('syncing');

        // Get current file
        const currentFile = document.querySelector('.file-tab.active')?.getAttribute('data-filename') || this.entityName;
        
        // Validate filename
        if (!currentFile || currentFile === 'null' || currentFile === 'undefined') {
            console.warn('[Hackatime] Invalid file name, using default');
            this.entityName = 'test.txt';
        } else {
            this.entityName = currentFile;
        }

        // Get editor data
        let lines = 0;
        let lineNo = 1;
        let cursorPos = 1;
        let lineAdditions = 0;
        let lineDeletions = 0;

        if (this.editor) {
            try {
                // Get line count
                lines = this.editor.lineCount ? this.editor.lineCount() : 0;

                // Get cursor position
                if (this.editor.getCursor) {
                    const cursor = this.editor.getCursor();
                    lineNo = cursor.line + 1;
                    cursorPos = cursor.ch + 1;
                }

                // Estimate line changes
                if (this.status === 'active') {
                    lineAdditions = Math.floor(Math.random() * 5) + 1;
                    if (Math.random() > 0.7) {
                        lineDeletions = Math.floor(Math.random() * 3);
                    }
                }
            } catch (err) {
                console.error('[Hackatime] Error getting editor info:', err);
            }
        }

        // Prepare heartbeat data
        const heartbeat = {
            entity: this.entityName,
            type: 'file',
            time: Math.floor(Date.now() / 1000),
            category: this.getActivityCategory(),
            project: this.siteName,
            branch: 'main',
            language: this.getLanguageFromFile(this.entityName),
            is_write: this.status === 'active',
            lines: lines,
            lineno: lineNo,
            cursorpos: cursorPos,
            line_additions: lineAdditions,
            line_deletions: lineDeletions,
            project_root_count: 1,
            dependencies: this.getDependenciesForFile(this.entityName),
            machine: this.generateMachineId(),
            editor: 'Spaces IDE',
            operating_system: this.getOperatingSystem(),
            user_agent: navigator.userAgent
        };

        console.log(`[Hackatime] Sending heartbeat for ${this.entityName}`);

        // Log heartbeat data to console
        console.log('[Hackatime] Heartbeat payload:', heartbeat);
        
        // Send heartbeat to service
        fetch(`${this.serviceUrl}/heartbeat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Hackatime-Key': this.apiKey || '',
                'User-Agent': navigator.userAgent
            },
            body: JSON.stringify(heartbeat)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            // Log response headers to console
            const headers = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });
            console.log('[Hackatime] Response headers:', headers);
            
            return response.json();
        })
        .then(data => {
            if (data.success) {
                this.lastHeartbeat = new Date();
                this.lastHeartbeatTime = Date.now();
                this.heartbeatCount++;
                this.updateBadgeStatus(this.status);
                console.log(`[Hackatime] Heartbeat success for ${this.entityName}`);
                console.log('[Hackatime] Response data:', data);
                
                // Update time logged and UI
                this.updateTimeLogged(true);
                if (this.popupVisible) {
                    this.updatePopupData();
                }
            } else {
                this.updateBadgeStatus('error');
                console.error(`[Hackatime] Heartbeat failed:`, data.message || 'Unknown error');
            }
        })
        .catch(error => {
            console.error('[Hackatime] Error sending heartbeat:', error);
            console.error('[Hackatime] Error details:', {
                endpoint: `${this.serviceUrl}/heartbeat`,
                payload: heartbeat,
                timestamp: new Date().toISOString()
            });
            this.updateBadgeStatus('error');
        });

        // Reset status to monitoring after activity
        if (this.status === 'active') {
            setTimeout(() => {
                this.status = 'monitoring';
                this.updateBadgeStatus('monitoring');
            }, 2000);
        }
    }

    // Helper: Generate machine ID
    generateMachineId() {
        const baseString = navigator.userAgent + screen.width + screen.height + navigator.language;
        let hash = 0;
        for (let i = 0; i < baseString.length; i++) {
            const char = baseString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return 'machine_' + Math.abs(hash).toString(16);
    }

    // Helper: Detect activity category
    getActivityCategory() {
        if (this.status === 'active' && this.editor && this.editor.getValue) {
            const content = this.editor.getValue() || '';
            if (content.includes('test(') || content.includes('describe(')) {
                return 'writing tests';
            }
            if (content.includes('console.log') || content.includes('print(')) {
                return 'debugging';
            }
        }
        return 'coding';
    }

    // Helper: Get OS info
    getOperatingSystem() {
        const userAgent = navigator.userAgent;
        if (userAgent.indexOf('Win') !== -1) return 'Windows';
        if (userAgent.indexOf('Mac') !== -1) return 'Mac OS';
        if (userAgent.indexOf('Linux') !== -1) return 'Linux';
        if (userAgent.indexOf('Android') !== -1) return 'Android';
        if (userAgent.indexOf('iOS') !== -1) return 'iOS';
        return 'Unknown';
    }

    // Helper: Generate dependencies
    getDependenciesForFile(filename) {
        if (!filename) return '';

        const extension = filename.split('.').pop().toLowerCase();

        // Return PostgreSQL array format with curly braces
        if (extension === 'py') {
            return '{flask,numpy,pandas}';
        } else if (extension === 'js') {
            return '{react,lodash,express}';
        } else if (extension === 'html') {
            return '{bootstrap,jquery}';
        } else if (extension === 'css') {
            return '{bootstrap,tailwind}';
        }

        return '{}';
    }

    // Helper: Get language from file
    getLanguageFromFile(filename) {
        if (!filename) return this.language;

        const extension = filename.split('.').pop().toLowerCase();

        switch (extension) {
            case 'py': return 'Python';
            case 'js': return 'JavaScript';
            case 'html': return 'HTML';
            case 'css': return 'CSS';
            case 'json': return 'JSON';
            case 'md': return 'Markdown';
            default: return this.language;
        }
    }

    // Handle visibility changes (tab switching)
    handleVisibilityChange() {
        if (document.hidden) {
            // Page hidden - pause tracking
            console.log(`[Hackatime] Page hidden, pausing tracking`);
            this.stopHeartbeatTracking();
            this.hiddenPause = true;
        } else {
            // Page visible again - resume if not manually paused
            console.log(`[Hackatime] Page visible, resuming tracking`);
            if (!this.isPaused) {
                this.startHeartbeatTracking();
                this.hiddenPause = false;
                this.updateLastActivityTime();
            }
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const hackatimeTracker = new HackatimeTracker();
    hackatimeTracker.init();
    
    // Make available for debugging
    window.hackatimeTracker = hackatimeTracker;
});

// Helper function to connect with API key
function connectHackatime(apiKey) {
    if (!apiKey) {
        console.error('[Hackatime] No API key provided');
        return Promise.reject('No API key provided');
    }
    
    return fetch('/hackatime/connect', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ api_key: apiKey })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Store API key
            localStorage.setItem('hackatime_api_key', apiKey);
            
            // Initialize tracker if needed
            if (window.hackatimeTracker) {
                window.hackatimeTracker.apiKey = apiKey;
                window.hackatimeTracker.isActive = true;
                window.hackatimeTracker.createBadge();
                window.hackatimeTracker.setupEditorListeners();
                window.hackatimeTracker.startHeartbeatTracking();
            } else {
                const tracker = new HackatimeTracker();
                tracker.apiKey = apiKey;
                tracker.init();
                window.hackatimeTracker = tracker;
            }
            
            return { success: true, message: 'Connected successfully' };
        } else {
            return { success: false, message: data.message || 'Connection failed' };
        }
    });
}

// Make connect function globally available
window.connectHackatime = connectHackatime;
