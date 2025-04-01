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
        this.isPaused = false;
        this.timeLogged = 0;
        this.sessionStartTime = Date.now();
        this.popupVisible = false;
        this.lastActivityTime = Date.now();
        this.afkCheckInterval = null;
        this.afkTimeoutMinutes = 1.5; // Auto-pause after 1.5 minutes of inactivity

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

        // Start AFK check interval to detect inactivity
        this.startAfkCheckInterval();
    }

    startAfkCheckInterval() {
        // Check for AFK status every minute
        this.afkCheckInterval = setInterval(() => {
            if (!this.isActive || this.isPaused) return;

            const currentTime = Date.now();
            const minutesSinceLastActivity = (currentTime - this.lastActivityTime) / (1000 * 60);

            if (minutesSinceLastActivity >= this.afkTimeoutMinutes) {
                console.log(`[Hackatime] No activity detected for ${this.afkTimeoutMinutes} minutes, auto-pausing tracking`);
                this.wasAutoPaused = true;
                if (!this.isPaused) {
                    this.togglePause();
                    // Show a toast notification
                    if (typeof showToast === 'function') {
                        showToast('info', `Hackatime tracking paused due to ${this.afkTimeoutMinutes} minutes of inactivity`);
                    }
                }
            }
        }, 60000); // Check every minute
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
                this.updateTimeLogged();
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
                this.updateLastActivityTime();

                // Log the file change event for hackatime
                console.log(`[Hackatime] File: ${currentFile}, Project: "${this.siteName}", Type: ${this.editorType}`);
            });

            // Also track cursor activity as a form of user activity
            this.editor.on('cursorActivity', () => {
                this.updateLastActivityTime();
            });
        }

        // Listen for file tab changes
        document.querySelectorAll('.file-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const filename = tab.getAttribute('data-filename');
                console.log(`[Hackatime] Switched to file: ${filename}`);
                this.entityName = filename;
                this.updateLastActivityTime();
            });
        });

        // Track user keyboard and mouse activity
        document.addEventListener('keydown', () => this.updateLastActivityTime());
        document.addEventListener('mousedown', () => this.updateLastActivityTime());
        document.addEventListener('mousemove', debounce(() => this.updateLastActivityTime(), 500));

        // Setup visibility change listener
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    }

    updateLastActivityTime() {
        this.lastActivityTime = Date.now();
        // If tracking was auto-paused due to inactivity and user is active again, auto-resume
        if (this.isPaused && this.wasAutoPaused) {
            console.log('[Hackatime] User is active again, auto-resuming tracking');
            this.wasAutoPaused = false;
            this.togglePause();
        }
    }

    // Simple debounce function if not already available
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

            // Add popup container
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
                            <span>Auto-pause:</span>
                            <span id="hackatime-afk-timeout">Active</span>
                        </div>
                    </div>
                    <div class="hackatime-popup-actions">
                        <button id="hackatime-toggle-pause" class="hackatime-btn">Pause Tracking</button>
                        <button id="hackatime-disconnect" class="hackatime-btn hackatime-btn-danger">Disconnect</button>
                    </div>
                </div>
            `;

            document.body.appendChild(popup);

            // Add event listeners to badge and popup
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
        const popup = document.getElementById('hackatime-popup');
        if (!popup) return;

        if (this.popupVisible) {
            this.hidePopup();
        } else {
            this.showPopup();
        }
    }

    showPopup() {
        const popup = document.getElementById('hackatime-popup');
        if (!popup) return;

        const badge = document.getElementById('hackatime-badge');
        if (!badge) return;

        // Update popup data
        this.updatePopupData();

        // Position popup above badge
        const badgeRect = badge.getBoundingClientRect();
        popup.style.bottom = (window.innerHeight - badgeRect.top + 10) + 'px';
        popup.style.right = (window.innerWidth - badgeRect.right + badgeRect.width/2) + 'px';

        // Show popup
        popup.style.display = 'block';
        this.popupVisible = true;

        // Animate popup
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
        // Update current file
        const currentFile = document.querySelector('.file-tab.active')?.getAttribute('data-filename') || this.entityName;
        document.getElementById('hackatime-file').textContent = currentFile;

        // Update project name
        document.getElementById('hackatime-project').textContent = this.siteName;

        // Update status
        let statusText = this.isPaused ? 'Paused' : this.status.charAt(0).toUpperCase() + this.status.slice(1);
        if (this.isPaused && this.wasAutoPaused) {
            statusText += ' (Auto)';
        }
        document.getElementById('hackatime-popup-status').textContent = statusText;

        // Update time logged
        this.updateTimeLogged();

        // Update last heartbeat
        document.getElementById('hackatime-last-heartbeat').textContent = this.lastHeartbeat ? this.formatTimeAgo(this.lastHeartbeat) : 'Never';

        // Update pause button text
        document.getElementById('hackatime-toggle-pause').textContent = this.isPaused ? 'Resume Tracking' : 'Pause Tracking';

        // Add info about AFK timeout
        const timeoutInfo = document.getElementById('hackatime-afk-timeout');
        if (timeoutInfo) {
            const minutesRemaining = this.isPaused ? 0 : Math.max(0, this.afkTimeoutMinutes - ((Date.now() - this.lastActivityTime) / (1000 * 60))).toFixed(1);
            timeoutInfo.textContent = this.isPaused ? 
                'Tracking paused' : 
                `In ${minutesRemaining} minutes of inactivity`;
        }
    }

    updateTimeLogged() {
        // Calculate minutes logged
        const currentTime = Date.now();
        const sessionMinutes = Math.floor((currentTime - this.sessionStartTime) / 60000);
        const totalMinutes = this.timeLogged + (this.isPaused ? 0 : sessionMinutes);

        // Format time string
        let timeStr;
        if (totalMinutes < 60) {
            timeStr = `${totalMinutes} min`;
        } else {
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
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

        // Update pause button text if popup is open
        const pauseButton = document.getElementById('hackatime-toggle-pause');
        if (pauseButton) {
            pauseButton.textContent = this.isPaused ? 'Resume Tracking' : 'Pause Tracking';
        }

        // Update status in popup if popup is open
        const popupStatus = document.getElementById('hackatime-popup-status');
        if (popupStatus) {
            popupStatus.textContent = this.isPaused ? 'Paused' : this.status.charAt(0).toUpperCase() + this.status.slice(1);
        }
    }

    disconnectHackatime() {
        // Show confirmation dialog
        if (confirm('Are you sure you want to disconnect Hackatime? You will need to reconnect on the Hackatime settings page.')) {
            // Stop tracking
            this.stopHeartbeatTracking();

            // Clear AFK check interval
            if (this.afkCheckInterval) {
                clearInterval(this.afkCheckInterval);
                this.afkCheckInterval = null;
            }

            // Send disconnect request to server
            fetch('/hackatime/disconnect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Remove badge
                    const badge = document.getElementById('hackatime-badge');
                    if (badge) badge.remove();

                    // Remove popup
                    const popup = document.getElementById('hackatime-popup');
                    if (popup) popup.remove();

                    // Set not active
                    this.isActive = false;

                    // Show success message
                    alert('Hackatime has been disconnected.');

                    // Optionally reload the page
                    // window.location.reload();
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

        switch (status) {
            case 'active':
                statusElement.textContent = 'Active';
                badge.className = 'hackatime-badge active';
                break;
            case 'monitoring': // Changed from 'idle' to 'monitoring'
                statusElement.textContent = 'Monitoring';
                badge.className = 'hackatime-badge idle'; // Keep the same CSS class
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

        console.log(`[Hackatime] Starting heartbeat tracking for project "${this.siteName}"`);

        // Send initial heartbeat
        this.sendHeartbeat();

        // Set up interval for regular heartbeats (every 30 seconds)
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 30000); // 30 seconds - to stay under the 2-minute timeout interval
    }

    stopHeartbeatTracking() {
        if (this.heartbeatInterval) {
            console.log(`[Hackatime] Stopping heartbeat tracking`);
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    sendHeartbeat() {
        if (!this.isActive || this.isPaused) return;

        // Show syncing status briefly
        this.updateBadgeStatus('syncing');

        // Get current file from active tab
        const currentFile = document.querySelector('.file-tab.active')?.getAttribute('data-filename') || this.entityName;

        // Get editor information if available
        let lines = 0;
        let lineAdditions = 0;
        let lineDeletions = 0;
        let lineNo = 1;
        let cursorPos = 1;

        if (this.editor) {
            try {
                // Get line count
                lines = this.editor.lineCount ? this.editor.lineCount() : 0;

                // Get cursor position if available
                if (this.editor.getCursor) {
                    const cursor = this.editor.getCursor();
                    lineNo = cursor.line + 1; // +1 because CodeMirror is 0-indexed
                    cursorPos = cursor.ch + 1; // +1 to start from 1
                }

                // Estimate line changes based on status
                if (this.status === 'active') {
                    // Simple approximation - actual tracking would need more state
                    lineAdditions = Math.floor(Math.random() * 5) + 1; // 1-5 lines added
                    if (Math.random() > 0.7) { // 30% chance of deletions
                        lineDeletions = Math.floor(Math.random() * 3); // 0-2 lines deleted
                    }
                }
            } catch (err) {
                console.error('[Hackatime] Error getting editor info:', err);
            }
        }

        // Get machine info (hardcoded for now)
        const machineInfo = {
            machine_name_id: this.generateMachineId(),
            machine_name: navigator.userAgent || 'Unknown'
        };

        // Generate dependencies (hardcoded for now)
        const dependencies = this.generateDependencies(currentFile);

        // Prepare heartbeat data exactly matching fields accepted by the API
        const heartbeat = {
            // Required fields from the controller's accepted keys
            entity: currentFile, // File path or domain being worked on
            type: 'file', // Can be file, app, or domain
            time: Math.floor(Date.now() / 1000), // UNIX epoch timestamp as integer

            // Important tracking fields (all exact matches to API keys)
            category: this.getCategoryFromActivity(), // coding, debugging, etc.
            project: this.siteName, // Updated to use siteName
            language: this.getLanguageFromFile(currentFile),
            is_write: this.status === 'active',

            // Editor and file details
            lines: lines,
            lineno: lineNo,
            cursorpos: cursorPos,
            line_additions: lineAdditions,
            line_deletions: lineDeletions,

            // Project structure information
            project_root_count: 3,
            branch: 'main',
            dependencies: dependencies,

            // System information (using keys expected by API)
            machine: machineInfo.machine_name_id, // Note: API expects 'machine', not 'machine_name_id'
            editor: 'Spaces IDE', // Updated to 'Spaces IDE'
            operating_system: this.getOperatingSystem(),
            user_agent: navigator.userAgent,
            plugin: 'hackatime-web',
            plugin_version: '1.0.0',
            os: this.getOperatingSystem(),
            hostname: window.location.hostname,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        };

        console.log(`[Hackatime] Sending heartbeat:`, heartbeat);

        // Make sure we're sending in the format expected by the controller
        // The controller expects either a direct heartbeat or a JSON array (_json format)
        fetch('/hackatime/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': navigator.userAgent,
            },
            body: JSON.stringify([heartbeat]) // Send as array to match _json format
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

                // Update popup data if visible
                if (this.popupVisible) {
                    this.updatePopupData();
                }
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

    // Helper method to generate a consistent machine ID
    generateMachineId() {
        // Using a simple hash of user agent and screen properties for uniqueness
        const baseString = navigator.userAgent + screen.width + screen.height + navigator.language;
        let hash = 0;
        for (let i = 0; i < baseString.length; i++) {
            const char = baseString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return 'machine_' + Math.abs(hash).toString(16);
    }

    // Helper method to get category from current activity
    getCategoryFromActivity() {
        // Simplified category detection based on current status and file
        if (this.status === 'active' && this.editor && this.editor.getValue) {
            const content = this.editor.getValue() || '';
            if (content.includes('test(') || content.includes('describe(')) {
                return 'writing tests';
            }
            if (content.includes('console.log') || content.includes('print(')) {
                return 'debugging';
            }
        }
        return 'coding'; // Default category
    }

    // Helper method to get OS info from user agent
    getOperatingSystem() {
        const userAgent = navigator.userAgent;
        if (userAgent.indexOf('Win') !== -1) return 'Windows';
        if (userAgent.indexOf('Mac') !== -1) return 'Mac OS';
        if (userAgent.indexOf('Linux') !== -1) return 'Linux';
        if (userAgent.indexOf('Android') !== -1) return 'Android';
        if (userAgent.indexOf('iOS') !== -1) return 'iOS';
        return 'Unknown';
    }

    // Helper method to generate dependencies based on file
    generateDependencies(filename) {
        // Simple dummy implementation - in reality this would need to parse the file
        if (!filename) return '';

        const extension = filename.split('.').pop().toLowerCase();

        if (extension === 'py') {
            return 'flask,numpy,pandas';
        } else if (extension === 'js') {
            return 'react,lodash,express';
        } else if (extension === 'html') {
            return 'bootstrap,jquery';
        } else if (extension === 'css') {
            return 'bootstrap,tailwind';
        }

        return '';
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
            if (!this.isPaused) {
                this.startHeartbeatTracking();
            }
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