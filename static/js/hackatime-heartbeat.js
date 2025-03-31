// Hackatime Tracker for Hack Club Spaces
// This script tracks coding activity and sends heartbeats to the Hackatime API

// Prevent redeclaration
if (typeof HackatimeTracker === 'undefined') {
    const HackatimeTracker = {
        lastActivity: 0,
        isActive: false,
        activityThreshold: 60000, // 1 minute
        heartbeatInterval: 300000, // Increased to 5 minutes
        heartbeatCooldown: 30000, // 30 seconds minimum between heartbeats
        lastHeartbeatTime: 0,
        currentEntity: 'index.html', // Default filename
        currentLanguage: 'HTML', // Default language
        intervalId: null,
        timerIntervalId: null,
        apiKeyExists: false,
        userId: null,
        connectionStatus: 'initializing', // 'initializing', 'connected', 'disconnected', 'error'
        lastHeartbeatSuccess: null, // true, false, or null if none sent yet
        nextHeartbeatTime: 0,
        timerDisplay: '', // For countdown display

        // Check if API connection is valid
        async checkApiConnection() {
            try {
                console.log('🕒 Checking Hackatime API connection...');
                this.connectionStatus = 'initializing';
                this.updateBadge('Connecting...', 'initializing');

                const response = await fetch('/hackatime/check-connection');

                if (response.status !== 200) {
                    console.log('🕒 Hackatime connection issue:', 'API error:', response.status);
                    this.connectionStatus = 'error';
                    this.updateBadge('Connection Error', 'error');
                    return false;
                }

                const data = await response.json();

                if (!data.success) {
                    console.log('🕒 Hackatime connection issue:', 'API error:', data.message);
                    this.connectionStatus = 'disconnected';
                    this.updateBadge('Disconnected', 'disconnected');
                    return false;
                }

                console.log('🕒 Hackatime API connection successful');
                this.connectionStatus = 'connected';
                this.updateBadge('Connected', 'connected');
                this.apiKeyExists = true;
                return true;
            } catch (error) {
                console.log('🕒 Hackatime connection error:', error);
                this.connectionStatus = 'error';
                this.updateBadge('API Error', 'error');
                return false;
            }
        },

        // Initialize the tracker
        async init() {
            try {
                // Try to get userId if available in the page
                const userIdElement = document.getElementById('user-id');
                if (userIdElement) {
                    this.userId = userIdElement.value;
                }

                // Check if API connection is valid
                if (await this.checkApiConnection()) {
                    this.detectLanguageFromURL();
                    this.detectCurrentFile();
                    this.startListening();
                    this.startTimer();

                    console.log('🕒 Hackatime integration active:', {
                        apiKeyExists: this.apiKeyExists, 
                        userId: this.userId
                    });

                    // Send initial heartbeat with a small delay
                    setTimeout(() => this.sendHeartbeat(), 5000);
                } else {
                    console.log('🕒 Hackatime integration inactive: API connection failed');
                }
            } catch (error) {
                console.error('🕒 Failed to initialize Hackatime:', error);
                this.connectionStatus = 'error';
                this.updateBadge('Init Error', 'error');
            }
        },

        // Update the badge in the UI with status and timer
        updateBadge(status, state) {
            const badge = document.getElementById('hackatime-badge');
            if (!badge) return;

            // Add timer to the status if we have an active timer
            let displayText = status;
            if (this.timerDisplay && state !== 'error' && state !== 'disconnected') {
                displayText = `${status} (${this.timerDisplay})`;
            }

            badge.innerHTML = `<i class="fas fa-clock"></i> ${displayText}`;

            // Update badge class based on state
            badge.className = 'hackatime-badge';

            // Add state-specific classes
            switch (state) {
                case 'active':
                    badge.classList.add('badge-active');
                    break;
                case 'idle':
                    badge.classList.add('badge-idle');
                    break;
                case 'initializing':
                    badge.classList.add('badge-initializing');
                    break;
                case 'connected':
                    badge.classList.add('badge-connected');
                    break;
                case 'disconnected':
                    badge.classList.add('badge-disconnected');
                    break;
                case 'error':
                    badge.classList.add('badge-error');
                    break;
                default:
                    badge.classList.add('badge-idle');
            }
        },

        // Start the heartbeat interval
        startListening() {
            if (!this.intervalId) {
                // Set next heartbeat time
                this.nextHeartbeatTime = Date.now() + this.heartbeatInterval;

                this.intervalId = setInterval(() => {
                    const now = Date.now();

                    // Check if we should send a heartbeat
                    if (this.isActive && now >= this.nextHeartbeatTime) {
                        // Only send if it's been long enough since the last one
                        if (now - this.lastHeartbeatTime >= this.heartbeatCooldown) {
                            this.sendHeartbeat();
                            this.nextHeartbeatTime = now + this.heartbeatInterval;
                        }
                    }
                }, 10000); // Check every 10 seconds

                console.log('🕒 Heartbeat interval started');
            }
        },

        // Start timer for countdown display
        startTimer() {
            if (!this.timerIntervalId) {
                this.timerIntervalId = setInterval(() => {
                    const now = Date.now();

                    // Update timing information
                    if (this.isActive && this.nextHeartbeatTime > now) {
                        const secondsRemaining = Math.round((this.nextHeartbeatTime - now) / 1000);
                        const minutes = Math.floor(secondsRemaining / 60);
                        const seconds = secondsRemaining % 60;
                        this.timerDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                        // Determine current state for badge
                        let currentState = this.isActive ? 'active' : 'idle';

                        // If there was an error on the last heartbeat, show that status
                        if (this.lastHeartbeatSuccess === false) {
                            currentState = 'error';
                        }

                        // Update badge with current status and timer
                        this.updateBadge(
                            this.isActive ? 'Active' : 'Idle', 
                            currentState
                        );
                    }
                }, 1000); // Update timer every second
            }
        },

        // Detect current file from tab or URL
        detectCurrentFile() {
            try {
                // First check active file tab
                const activeTab = document.querySelector('.file-tab.active');
                if (activeTab) {
                    const filename = activeTab.getAttribute('data-filename');
                    if (filename) {
                        this.currentEntity = filename;
                        console.log('🕒 Detected current file from tab:', filename);
                        return;
                    }
                }

                // Check site ID (for Python projects)
                const siteIdElement = document.getElementById('site-id');
                if (siteIdElement) {
                    const siteId = siteIdElement.value;
                    if (siteId) {
                        const siteTypeElement = document.getElementById('site-type');
                        if (siteTypeElement && siteTypeElement.value === 'python') {
                            this.currentEntity = 'main.py';
                            console.log('🕒 Python project detected, using main.py');
                            return;
                        }
                    }
                }

                // Fallback to default
                this.currentEntity = 'index.html';
                console.log('🕒 Using default file:', this.currentEntity);
            } catch (error) {
                console.error('🕒 Error detecting current file:', error);
                this.currentEntity = 'index.html'; // Fallback
            }
        },

        // Detect language from file or URL
        detectLanguageFromURL() {
            try {
                // Check site type
                const siteTypeElement = document.getElementById('site-type');
                if (siteTypeElement) {
                    const siteType = siteTypeElement.value;
                    if (siteType === 'python') {
                        this.currentLanguage = 'Python';
                        console.log('🕒 Language detected from site type:', this.currentLanguage);
                        return;
                    }
                }

                // Default to HTML for web projects
                this.currentLanguage = 'HTML';
                console.log('🕒 Using default language:', this.currentLanguage);
            } catch (error) {
                console.error('🕒 Error detecting language:', error);
                this.currentLanguage = 'HTML'; // Fallback
            }
        },

        // Record user activity
        recordActivity() {
            this.lastActivity = Date.now();

            // If wasn't active before, update UI
            if (!this.isActive) {
                this.isActive = true;
                this.updateBadge('Active', 'active');
            }
        },

        // Send heartbeat to backend
        async sendHeartbeat() {
            try {
                this.lastHeartbeatTime = Date.now();
                console.log('🕒 sendHeartbeat called'); // Added logging

                if (!this.apiKeyExists) {
                    console.log('🕒 Heartbeat skipped: No API key exists');
                    this.lastHeartbeatSuccess = false;
                    this.updateBadge('No API Key', 'error');
                    return false;
                }

                // Get editor content length for file size estimation
                let fileSize = 0;
                try {
                    if (window.editor && window.editor.getValue) {
                        fileSize = window.editor.getValue().length;
                    } else if (window.codeMirror && window.codeMirror.getValue) {
                        fileSize = window.codeMirror.getValue().length;
                    } else {
                        // Try to find CodeMirror instance
                        const cmInstance = document.querySelector('.CodeMirror');
                        if (cmInstance && cmInstance.CodeMirror) {
                            fileSize = cmInstance.CodeMirror.getValue().length;
                        }
                    }
                } catch (e) {
                    console.log('🕒 Could not get file size:', e);
                }

                // Are we currently active?
                const now = Date.now();
                const timeSinceLastActivity = now - this.lastActivity;
                const isCurrentlyActive = timeSinceLastActivity < this.activityThreshold;

                // Only update isActive if we've been inactive for longer than the threshold
                if (!isCurrentlyActive) {
                    this.isActive = false;
                }

                // Show 'Sending...' status briefly during the API call
                this.updateBadge('Sending...', this.isActive ? 'active' : 'idle');

                // Prepare heartbeat data in array format as expected by the API
                const heartbeatData = [{
                    entity: this.currentEntity,
                    type: 'file',
                    time: Math.floor(now / 1000), // Convert to seconds as integer
                    language: this.currentLanguage,
                    is_write: true,
                    lines: Math.max(1, Math.floor(fileSize / 80)), // Estimate lines based on file size
                    project: window.location.pathname
                }];

                console.log('🕒 Sending heartbeat:', {
                    entity: heartbeatData[0].entity,
                    language: heartbeatData[0].language,
                    time: heartbeatData[0].time
                });

                // Send the heartbeat - Added logging of the URL
                const heartbeatUrl = '/hackatime/heartbeat'; // Assumed endpoint
                console.log('🕒 Sending heartbeat to:', heartbeatUrl);
                const response = await fetch(heartbeatUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(heartbeatData[0]) // Still send as object for backend compatibility
                });

                if (response.status !== 200) {
                    console.log('🕒 Heartbeat failed: API error:', response.status);
                    this.lastHeartbeatSuccess = false;
                    this.updateBadge('API Error', 'error');
                    return false;
                }

                const responseData = await response.json();
                if (!responseData.success) {
                    console.log('🕒 Heartbeat failed:', responseData.message);
                    this.lastHeartbeatSuccess = false;
                    this.updateBadge('Heartbeat Failed', 'error');
                    return false;
                }

                console.log('🕒 Heartbeat sent successfully', responseData);
                this.lastHeartbeatSuccess = true;
                // Reset the timer for next heartbeat
                this.nextHeartbeatTime = now + this.heartbeatInterval;

                // Update the badge to reflect success
                this.updateBadge(
                    this.isActive ? 'Active' : 'Idle',
                    this.isActive ? 'active' : 'idle'
                );

                return true;
            } catch (error) {
                console.log('🕒 Heartbeat failed: API error:', error);
                this.lastHeartbeatSuccess = false;
                this.updateBadge('Error', 'error');
                return false;
            }
        }
    };

    // Make HackatimeTracker globally accessible
    window.HackatimeTracker = HackatimeTracker;
} // Close the if (typeof HackatimeTracker === 'undefined') block

// Add event listener to track tab changes - this helps detect file changes
document.addEventListener('click', function(event) {
    const target = event.target;

    // If clicking on a file tab
    if (target.classList && (
        target.classList.contains('file-tab') || 
        target.closest('.file-tab')
    )) {
        // Wait a bit for the tab to actually change
        setTimeout(() => {
            if (window.HackatimeTracker) {
                window.HackatimeTracker.detectCurrentFile();
                window.HackatimeTracker.recordActivity();
            }
        }, 100);
    }
});

// Track page visibility changes to detect when user comes back
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && window.HackatimeTracker) {
        // User is back, record activity and send a heartbeat
        window.HackatimeTracker.recordActivity();
        window.HackatimeTracker.sendHeartbeat();
    }
});

// Record general activity
document.addEventListener('mousemove', function() {
    if (window.HackatimeTracker) {
        window.HackatimeTracker.recordActivity();
    }
});

document.addEventListener('keydown', function() {
    if (window.HackatimeTracker) {
        window.HackatimeTracker.recordActivity();
    }
});

// Initialize tracker when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    if (window.HackatimeTracker) {
        window.HackatimeTracker.init();
    }
});