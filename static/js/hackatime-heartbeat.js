
// Prevent redeclaration
if (typeof HackatimeTracker === 'undefined') {
    const HackatimeTracker = {
        lastActivity: 0,
        isActive: false,
        activityThreshold: 60000, // 1 minute
        heartbeatInterval: 120000, // 2 minutes
        currentEntity: 'index.html', // Default filename
        currentLanguage: 'HTML', // Default language
        intervalId: null,
        apiKeyExists: false,
        userId: null,

        // Check if API connection is valid
        async checkApiConnection() {
            try {
                console.log('🕒 Checking Hackatime API connection...');
                const response = await fetch('/hackatime/check-connection');

                if (response.status !== 200) {
                    console.log('🕒 Hackatime connection issue:', 'API error:', response.status);
                    this.updateBadge('Disconnected', false);
                    return false;
                }

                const data = await response.json();

                if (!data.success) {
                    console.log('🕒 Hackatime connection issue:', 'API error:', data.message);
                    this.updateBadge('Disconnected', false);
                    return false;
                }

                console.log('🕒 Hackatime API connection successful');
                this.updateBadge('Connected', true);
                this.apiKeyExists = true;
                return true;
            } catch (error) {
                console.log('🕒 Hackatime connection error:', error);
                this.updateBadge('Error', false);
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

                    console.log('🕒 Hackatime integration active:', {
                        apiKeyExists: this.apiKeyExists, 
                        userId: this.userId
                    });

                    // Send initial heartbeat
                    setTimeout(() => this.sendHeartbeat(), 5000);
                } else {
                    console.log('🕒 Hackatime integration inactive: API connection failed');
                }
            } catch (error) {
                console.error('🕒 Failed to initialize Hackatime:', error);
            }
        },

        // Update the badge in the UI if it exists
        updateBadge(status, isConnected) {
            const badge = document.getElementById('hackatime-badge');
            if (badge) {
                badge.innerHTML = `<i class="fas fa-clock"></i> ${status}`;
                badge.className = `hackatime-badge ${isConnected ? 'badge-success' : 'badge-danger'}`;
            }
        },

        // Start the heartbeat interval
        startListening() {
            if (!this.intervalId) {
                this.intervalId = setInterval(() => {
                    if (this.isActive) {
                        this.sendHeartbeat();
                    }
                }, this.heartbeatInterval);
                console.log('🕒 Heartbeat interval started');
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
            this.isActive = true;
        },

        // Send heartbeat to backend
        async sendHeartbeat() {
            try {
                if (!this.apiKeyExists) {
                    console.log('🕒 Heartbeat skipped: No API key exists');
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

                // Update badge status based on activity
                this.updateBadge(isCurrentlyActive ? 'Active' : 'Idle', true);

                // Prepare heartbeat data
                const data = {
                    entity: this.currentEntity,
                    type: 'file',
                    time: now / 1000, // Convert to seconds
                    language: this.currentLanguage,
                    is_write: true,
                    lines: 1, // Placeholder
                    file_size: fileSize,
                    project: window.location.pathname
                };

                console.log('🕒 Sending heartbeat:', {
                    entity: data.entity,
                    language: data.language,
                    time: new Date(data.time * 1000).toISOString()
                });

                // Send the heartbeat
                const response = await fetch('/hackatime/heartbeat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (response.status !== 200) {
                    console.log('🕒 Heartbeat failed: API error:', response.status);
                    return false;
                }

                const responseData = await response.json();
                if (!responseData.success) {
                    console.log('🕒 Heartbeat failed:', responseData.message);
                    return false;
                }

                return true;
            } catch (error) {
                console.log('🕒 Heartbeat failed: API error:', error);
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
