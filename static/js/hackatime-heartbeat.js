
// Define the HackatimeTracker object first so it's available globally
const HackatimeTracker = {
    lastActivity: 0,
    isActive: false,
    activityThreshold: 60000, // 1 minute
    heartbeatInterval: 120000, // 2 minutes
    currentEntity: 'index.html', // Default filename
    currentLanguage: 'HTML', // Default language
    intervalId: null,

    // Check if API connection is valid
    async checkApiConnection() {
        try {
            console.log('🕒 Checking Hackatime API connection...');
            const response = await fetch('/hackatime/check-connection');
            const data = await response.json();
            
            if (!data.success) {
                console.log('🕒 Hackatime connection issue:', 'API error:', data.message);
                this.updateBadge('Disconnected', false);
                return false;
            }
            
            console.log('🕒 Hackatime API connection successful');
            this.updateBadge('Connected', true);
            return true;
        } catch (error) {
            console.log('🕒 Hackatime connection error:', error);
            this.updateBadge('Error', false);
            return false;
        }
    },

    // Initialize the tracker
    init() {
        console.log('🕒 Initializing Hackatime tracker...');
        
        // Check API connection
        this.checkApiConnection();
        
        // Initialize the badge
        this.initBadge();
        
        // Get the current entity if available
        this.detectCurrentFile();
        
        // Start the heartbeat interval
        this.startHeartbeatInterval();
        
        // Send an initial heartbeat after 5 seconds
        setTimeout(() => {
            this.sendHeartbeat();
        }, 5000);
    },
    
    // Create or update the badge element
    initBadge() {
        let badge = document.getElementById('hackatime-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'hackatime-badge';
            badge.className = 'hackatime-badge';
            badge.innerHTML = '<i class="fas fa-clock"></i> Initializing...';
            document.body.appendChild(badge);
            
            // Add click handler to open Hackatime settings
            badge.addEventListener('click', () => {
                window.open('/hackatime', '_blank');
            });
        }
    },
    
    // Update the badge text and state
    updateBadge(status, isActive) {
        const badge = document.getElementById('hackatime-badge');
        if (badge) {
            badge.innerHTML = `<i class="fas fa-clock"></i> ${status}`;
            if (isActive) {
                badge.classList.add('active');
            } else {
                badge.classList.remove('active');
            }
        }
    },
    
    // Detect the current file being edited
    detectCurrentFile() {
        // Try to find the active file tab
        const activeTab = document.querySelector('.file-tab.active');
        if (activeTab) {
            const fileName = activeTab.textContent.trim();
            if (fileName) {
                this.currentEntity = fileName;
                this.currentLanguage = this.detectLanguage(fileName);
                console.log('🕒 Current file detected:', fileName);
            }
        }
        
        // If no file is found, try to detect from the editor
        if (document.querySelector('.CodeMirror')) {
            const cm = document.querySelector('.CodeMirror').CodeMirror;
            const mode = cm.getMode().name;
            if (mode) {
                this.currentLanguage = this.mapCodeMirrorModeToLanguage(mode);
            }
        }
    },
    
    // Map CodeMirror mode to Hackatime language
    mapCodeMirrorModeToLanguage(mode) {
        const modeMap = {
            'python': 'Python',
            'javascript': 'JavaScript',
            'htmlmixed': 'HTML',
            'css': 'CSS',
            'jsx': 'JSX',
            'markdown': 'Markdown'
        };
        return modeMap[mode] || mode.charAt(0).toUpperCase() + mode.slice(1);
    },
    
    // Detect language from file extension
    detectLanguage(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const extMap = {
            'py': 'Python',
            'js': 'JavaScript',
            'html': 'HTML',
            'css': 'CSS',
            'jsx': 'JSX',
            'tsx': 'TypeScript',
            'ts': 'TypeScript',
            'md': 'Markdown',
            'json': 'JSON'
        };
        return extMap[ext] || 'Text';
    },
    
    // Start the heartbeat interval
    startHeartbeatInterval() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        this.intervalId = setInterval(() => {
            if (this.isActive) {
                this.sendHeartbeat();
                this.isActive = false; // Reset activity flag
            }
        }, this.heartbeatInterval);
        
        console.log('🕒 Heartbeat interval started');
    },
    
    // Record user activity
    recordActivity() {
        this.lastActivity = Date.now();
        this.isActive = true;
        
        // Update badge to show active status
        this.updateBadge('Active', true);
    },
    
    // Send heartbeat to the server
    sendHeartbeat() {
        // Detect current file and language again in case it changed
        this.detectCurrentFile();
        
        const heartbeatData = {
            type: 'file',
            language: this.currentLanguage,
            entity: this.currentEntity,
            time: Date.now() / 1000, // Convert to Unix timestamp (seconds)
            is_write: true,
            category: 'coding',
            project: document.title || 'Hack Club Spaces Project'
        };
        
        console.log('🕒 Sending heartbeat:', heartbeatData);
        
        fetch('/hackatime/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(heartbeatData)
        })
        .then(response => response.json())
        .then(data => {
            console.log('🕒 Heartbeat response:', data);
            
            if (data.success) {
                this.updateBadge('Tracking', true);
            } else {
                this.updateBadge('Error', false);
                console.log('🕒 Heartbeat failed:', data.message);
            }
        })
        .catch(error => {
            this.updateBadge('Error', false);
            console.log('🕒 Heartbeat failed:', 'API error:', error);
        });
    }
};

console.log('Hackatime tracker loaded successfully');
