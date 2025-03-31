/**
 * Hackatime Heartbeat Tracker
 * Tracks coding activity and sends heartbeats to the Hackatime API
 * API Endpoint: https://hackatime.hackclub.com/api/hackatime/v1
 */

const HackatimeTracker = {
    lastActivity: null,
    lastHeartbeat: null,
    idleTimeout: 5 * 60 * 1000, // 5 minutes in milliseconds
    heartbeatInterval: 2 * 60 * 1000, // 2 minutes in milliseconds
    totalTime: 0, // Total time in seconds
    heartbeatQueue: [],
    isProcessing: false,
    apiUrl: 'https://hackatime.hackclub.com/api/hackatime/v1',
    projectInfo: {
        name: document.title || 'Unknown Project',
        language: null,
        entity: null,
    },

    /**
     * Initialize the tracker
     */
    init: function() {
        console.log('🕒 Initializing Hackatime tracker');

        // Get site ID and type from hidden inputs
        const siteId = document.getElementById('site-id')?.value;
        const siteType = document.getElementById('site-type')?.value;

        // Set project info
        this.projectInfo.language = siteType === 'web' ? 'HTML' : 'Python';

        // Set entity based on current file being edited
        const activeTab = document.querySelector('.file-tab.active');
        if (activeTab) {
            this.projectInfo.entity = activeTab.dataset.filename;
        } else {
            this.projectInfo.entity = siteType === 'web' ? 'index.html' : 'main.py';
        }

        // Update badge
        this.updateBadge("Initializing...");

        // Start heartbeat timer
        this.startHeartbeatTimer();

        // Record initial activity
        this.recordActivity();

        // Send initial heartbeat
        setTimeout(() => this.sendHeartbeat(), 2000);

        console.log('🕒 Hackatime tracker initialized with:', this.projectInfo);
    },

    /**
     * Start the heartbeat timer
     */
    startHeartbeatTimer: function() {
        console.log('🕒 Starting heartbeat timer');
        setInterval(() => {
            // Only send a heartbeat if there has been activity since the last one
            if (this.lastActivity && (!this.lastHeartbeat || this.lastActivity > this.lastHeartbeat)) {
                this.sendHeartbeat();
            }
        }, this.heartbeatInterval);
    },

    /**
     * Record activity
     */
    recordActivity: function() {
        this.lastActivity = Date.now();
    },

    /**
     * Update the badge with current time
     */
    updateBadge: function(text) {
        const badge = document.getElementById('hackatime-badge');
        if (badge) {
            if (text) {
                badge.innerHTML = `<i class="fas fa-clock"></i> ${text}`;
            } else {
                let timeStr = '0m';
                if (this.totalTime > 0) {
                    const minutes = Math.floor(this.totalTime / 60);
                    if (minutes > 0) {
                        timeStr = `${minutes}m`;
                    } else {
                        timeStr = `${this.totalTime}s`;
                    }
                }
                badge.innerHTML = `<i class="fas fa-clock"></i> ${timeStr}`;
            }
        }
    },

    /**
     * Send a heartbeat to the Hackatime API
     */
    sendHeartbeat: function() {
        // Update last heartbeat timestamp
        this.lastHeartbeat = Date.now();

        // Check if we have anything to report
        if (!this.lastActivity) {
            console.log('🕒 No activity to report');
            return;
        }

        // If we've been idle for too long, don't send a heartbeat
        const now = Date.now();
        if (now - this.lastActivity > this.idleTimeout) {
            console.log('🕒 User has been idle for too long, skipping heartbeat');
            return;
        }

        // Get the current file
        let entity = this.projectInfo.entity;
        const activeTab = document.querySelector('.file-tab.active');
        if (activeTab) {
            entity = activeTab.dataset.filename;
        }

        // Get the current editor content
        let codeSize = 0;
        if (window.editor && window.editor.getValue) {
            const content = window.editor.getValue();
            codeSize = content.length;
        }

        // Prepare heartbeat data
        const heartbeat = {
            type: 'file',
            language: this.projectInfo.language,
            entity: entity,
            time: now / 1000, // Convert to seconds
            is_write: true,
            project: this.projectInfo.name,
            lines: codeSize > 0 ? codeSize.toString() : '0',
        };

        console.log('🕒 Sending heartbeat:', heartbeat);

        // Send to server
        fetch('/hackatime/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(heartbeat)
        })
        .then(response => response.json())
        .then(data => {
            console.log('🕒 Heartbeat response:', data);
            if (data.success) {
                // Update total time if returned
                if (data.total_time) {
                    this.totalTime = data.total_time;
                    this.updateBadge();
                }
            } else {
                console.log('🕒 Heartbeat failed:', data.message);
            }
        })
        .catch(error => {
            console.log('🕒 Heartbeat failed: API error:', error);
        });
    }
};

// Add event listener to update entity when tabs are clicked
document.addEventListener('DOMContentLoaded', function() {
    const fileTabs = document.querySelectorAll('.file-tab');
    if (fileTabs.length > 0) {
        fileTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                HackatimeTracker.projectInfo.entity = this.dataset.filename;
                console.log('🕒 Entity updated to:', HackatimeTracker.projectInfo.entity);
            });
        });
    }
});