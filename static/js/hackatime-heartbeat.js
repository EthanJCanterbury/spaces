// Define HackatimeTracker globally
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

    // Start listening for heartbeat interval
    startListening() {
        // Clear any existing interval
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        // Set up the heartbeat interval
        this.intervalId = setInterval(() => {
            // Check if there's been activity since the last heartbeat
            if (this.isActive) {
                this.sendHeartbeat();
                this.isActive = false;
            }
        }, this.heartbeatInterval);
    },

    // Record user activity
    recordActivity() {
        this.lastActivity = Date.now();
        this.isActive = true;
    },

    // Detect the current programming language from URL
    detectLanguageFromURL() {
        const url = window.location.href;
        if (url.includes('pythoneditor')) {
            this.currentLanguage = 'Python';
        } else if (url.includes('editor')) {
            // Default to HTML for now, but we'll update based on open file
            this.currentLanguage = 'HTML';
        }
    },

    // Detect the current file being edited
    detectCurrentFile() {
        // Find active file tab if it exists
        const activeTab = document.querySelector('.file-tab.active');
        if (activeTab) {
            const filename = activeTab.getAttribute('data-filename');
            if (filename) {
                this.currentEntity = filename;

                // Determine language from file extension
                const ext = filename.split('.').pop().toLowerCase();
                switch (ext) {
                    case 'html':
                        this.currentLanguage = 'HTML';
                        break;
                    case 'css':
                        this.currentLanguage = 'CSS';
                        break;
                    case 'js':
                        this.currentLanguage = 'JavaScript';
                        break;
                    case 'py':
                        this.currentLanguage = 'Python';
                        break;
                    default:
                        // Keep current language if can't determine
                        break;
                }
            }
        } else {
            // No tabs, so look for CodeMirror instance
            const cm = document.querySelector('.CodeMirror');
            if (cm && cm.CodeMirror) {
                const mode = cm.CodeMirror.getMode().name;
                if (mode === 'python') {
                    this.currentLanguage = 'Python';
                    this.currentEntity = 'main.py'; // Default Python file
                }
            }
        }
    },

    // Send a heartbeat to the WakaTime-compatible API
    async sendHeartbeat() {
        try {
            // Only send if we have the necessary info
            if (!this.apiKeyExists) {
                return false;
            }

            // Detect current file/language again to ensure it's up to date
            this.detectCurrentFile();

            const timestamp = Math.floor(Date.now() / 1000);

            // Prepare the payload for the heartbeat
            const heartbeatData = {
                entity: this.currentEntity,
                type: 'file',
                timestamp: timestamp,
                language: this.currentLanguage,
                is_write: true
            };

            console.log('🕒 Sending heartbeat:', heartbeatData);

            // Send the heartbeat to our server, which will forward to WakaTime API
            const response = await fetch('/hackatime/heartbeat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(heartbeatData)
            });

            const responseData = await response.json();

            if (responseData.success) {
                console.log('🕒 Heartbeat sent successfully');
                this.updateBadge(`${this.currentLanguage} - ${this.currentEntity}`, true);
                return true;
            } else {
                console.log('🕒 Heartbeat failed:', responseData.message);

                if (responseData.error === 'api_key_invalid') {
                    this.apiKeyExists = false;
                    this.updateBadge('API Key Invalid', false);
                }

                return false;
            }
        } catch (error) {
            console.log('🕒 Heartbeat failed: API error:', error);
            return false;
        }
    }
};

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
            HackatimeTracker.detectCurrentFile();
            HackatimeTracker.recordActivity();
        }, 100);
    }
});

// Track page visibility changes to detect when user comes back
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        // User is back, record activity and send a heartbeat
        HackatimeTracker.recordActivity();
        HackatimeTracker.sendHeartbeat();
    }
});