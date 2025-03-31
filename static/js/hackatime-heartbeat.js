/**
 * Hackatime Heartbeat Tracker
 * Tracks coding activity and sends heartbeats to the Hackatime API
 */

const HackatimeTracker = {
    lastActivity: null,
    lastHeartbeat: null,
    idleTimeout: 5 * 60 * 1000, // 5 minutes in milliseconds
    heartbeatInterval: 2 * 60 * 1000, // 2 minutes in milliseconds
    totalTime: 0, // Total time in seconds
    heartbeatQueue: [],
    isProcessing: false,
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

        console.log('🕒 Hackatime tracker initialized with:', {
            projectInfo: this.projectInfo,
            siteId: siteId,
            siteType: siteType
        });
    },

    /**
     * Record user activity
     */
    recordActivity: function() {
        this.lastActivity = Date.now();

        // If we've been idle for a while, send a new heartbeat right away
        if (this.lastHeartbeat && (this.lastActivity - this.lastHeartbeat > this.idleTimeout)) {
            console.log('🕒 Returning from idle, sending immediate heartbeat');
            this.sendHeartbeat();
        }
    },

    /**
     * Start the heartbeat timer
     */
    startHeartbeatTimer: function() {
        console.log('🕒 Starting heartbeat timer');

        // Clear any existing timer
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        // Set up new timer
        this.heartbeatTimer = setInterval(() => {
            // Only send heartbeat if there was activity since last heartbeat
            if (this.lastActivity && (!this.lastHeartbeat || this.lastActivity > this.lastHeartbeat)) {
                this.sendHeartbeat();
            }
        }, this.heartbeatInterval);
    },

    /**
     * Send a heartbeat to the Hackatime API
     */
    sendHeartbeat: function() {
        // Check if we have activity to report
        if (!this.lastActivity) {
            console.log('🕒 No activity to report');
            return;
        }

        // If we've been idle for too long, don't send a heartbeat
        const now = Date.now();
        if (now - this.lastActivity > this.idleTimeout) {
            console.log('🕒 User has been idle too long, skipping heartbeat');
            return;
        }

        // Create heartbeat data
        const heartbeat = {
            entity: this.projectInfo.entity,
            type: 'file',
            time: now / 1000, // Convert to seconds
            project: this.projectInfo.name,
            language: this.projectInfo.language,
            is_write: true
        };

        console.log('🕒 Sending heartbeat:', heartbeat);

        // Update when we last sent a heartbeat
        this.lastHeartbeat = now;

        // Add to queue
        this.heartbeatQueue.push(heartbeat);

        // Process queue
        this.processHeartbeatQueue();

        // Update the badge
        this.updateBadge('Sending...');
    },

    /**
     * Process the heartbeat queue
     */
    processHeartbeatQueue: function() {
        if (this.isProcessing || this.heartbeatQueue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const heartbeat = this.heartbeatQueue.shift();

        fetch('/hackatime/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(heartbeat)
        })
        .then(response => response.json())
        .then(data => {
            console.log('🕒 Heartbeat response:', data);

            if (data.success) {
                // Calculate time since last successful heartbeat
                const timeSinceLast = (heartbeat.time - (this.lastSuccessfulHeartbeat || heartbeat.time));

                // Update total time if reasonable (less than idle timeout)
                if (timeSinceLast <= this.idleTimeout / 1000) {
                    this.totalTime += timeSinceLast;
                }

                // Store this successful heartbeat time
                this.lastSuccessfulHeartbeat = heartbeat.time;

                // Format and display time
                const formattedTime = this.formatTime(this.totalTime);
                this.updateBadge(`Active: ${formattedTime}`);

                console.log(`🕒 Heartbeat successful! Total coding time: ${formattedTime}`);
            } else {
                console.error('🕒 Heartbeat failed:', data.message);
                this.updateBadge('Error sending heartbeat');
            }
        })
        .catch(error => {
            console.error('🕒 Error sending heartbeat:', error);
            this.updateBadge('Connection error');

            // Put the heartbeat back in the queue to retry
            this.heartbeatQueue.unshift(heartbeat);
        })
        .finally(() => {
            this.isProcessing = false;

            // Process next item in queue if available
            if (this.heartbeatQueue.length > 0) {
                setTimeout(() => this.processHeartbeatQueue(), 1000);
            }
        });
    },

    /**
     * Update the badge with current status
     */
    updateBadge: function(text) {
        const badge = document.getElementById('hackatime-badge');
        if (badge) {
            badge.innerHTML = `<i class="fas fa-clock"></i> ${text}`;

            // Show the badge if hidden
            badge.style.display = 'flex';
        }
    },

    /**
     * Format seconds into readable time
     */
    formatTime: function(seconds) {
        if (seconds < 60) {
            return `${Math.floor(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            return `${minutes}m`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
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