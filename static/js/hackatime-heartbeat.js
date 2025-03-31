
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
            
            // Check if API connection is valid first
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
            badge.textContent = `Hackatime: ${status}`;
            badge.className = isConnected ? 'badge-success' : 'badge-danger';
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
                this.isActive = false; // Reset activity state
            }
        }, this.heartbeatInterval);
        
        console.log('🕒 Heartbeat listener started');
    },
    
    // Record activity
    recordActivity() {
        const now = Date.now();
        
        // If it's been more than the threshold since the last activity
        if (now - this.lastActivity > this.activityThreshold) {
            this.isActive = true;
        }
        
        this.lastActivity = now;
        
        // If file tab changed, update the entity and language
        this.detectCurrentFile();
    },
    
    // Detect the current file from active tab or editor
    detectCurrentFile() {
        // Check for file tabs
        const activeTabs = document.querySelectorAll('.file-tab.active');
        if (activeTabs.length > 0) {
            const filename = activeTabs[0].getAttribute('data-filename') || 
                             activeTabs[0].textContent.trim();
            
            if (filename && filename !== this.currentEntity) {
                this.currentEntity = filename;
                this.detectLanguageFromFilename(filename);
                console.log('🕒 Current file detected:', filename);
            }
            return;
        }
        
        // Fallback to looking at editor title or URL
        this.detectLanguageFromURL();
    },
    
    // Detect language from URL or other sources
    detectLanguageFromURL() {
        const path = window.location.pathname;
        
        // Check if URL contains a filename
        if (path.includes('/edit/') || path.includes('/python/')) {
            const parts = path.split('/');
            const lastPart = parts[parts.length - 1];
            
            if (lastPart.includes('.')) {
                this.currentEntity = lastPart;
                this.detectLanguageFromFilename(lastPart);
                return;
            }
        }
        
        // If we get here, set defaults based on URL type
        if (path.includes('/python/')) {
            this.currentEntity = 'main.py';
            this.currentLanguage = 'Python';
        } else {
            this.currentEntity = 'index.html';
            this.currentLanguage = 'HTML';
        }
    },
    
    // Detect language from filename
    detectLanguageFromFilename(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        
        const langMap = {
            'py': 'Python',
            'js': 'JavaScript',
            'html': 'HTML',
            'css': 'CSS',
            'json': 'JSON',
            'md': 'Markdown',
            'txt': 'Text',
            'sh': 'Shell',
            'jsx': 'JavaScript React',
            'tsx': 'TypeScript React',
            'ts': 'TypeScript'
        };
        
        if (langMap[ext]) {
            this.currentLanguage = langMap[ext];
        } else if (ext === 'htm') {
            this.currentLanguage = 'HTML';
        } else if (ext === 'xml') {
            this.currentLanguage = 'Xml';
        } else {
            // Default to the extension as language if unknown
            this.currentLanguage = ext.charAt(0).toUpperCase() + ext.slice(1);
        }
    },
    
    // Send a heartbeat to the Hackatime API
    async sendHeartbeat() {
        try {
            const timestamp = Date.now() / 1000; // Convert to seconds
            
            const heartbeatData = {
                type: 'file',
                language: this.currentLanguage,
                entity: this.currentEntity,
                time: timestamp,
                is_write: true,
                category: 'coding',
                user_agent: navigator.userAgent
            };
            
            console.log('🕒 Sending heartbeat:', heartbeatData);
            
            const response = await fetch('/hackatime/heartbeat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(heartbeatData)
            });
            
            const data = await response.json();
            console.log('🕒 Heartbeat response:', data);
            
            if (data.success) {
                // Success!
                return true;
            } else {
                console.log('🕒 Heartbeat failed:', data.message);
                
                // If authentication failed, check connection again
                if (data.error_code === 401) {
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

console.log('🕒 Hackatime tracker loaded');
