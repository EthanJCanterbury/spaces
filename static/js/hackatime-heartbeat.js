/**
 * Hackatime Heartbeat Tracker
 * Tracks coding activity and sends heartbeats to the Hackatime API
 * API Endpoint: https://hackatime.hackclub.com/api/hackatime/v1
 */

if (typeof HackatimeTracker === 'undefined') {
    const HackatimeTracker = {
        lastActivity: null,
        lastHeartbeat: null,
        idleTimeout: 5 * 60 * 1000, 
        heartbeatInterval: 2 * 60 * 1000, 
        totalTime: 0, 
        heartbeatQueue: [],
        isProcessing: false,
        apiUrl: 'https://waka.hackclub.com/api/v1/users/current/heartbeats', // Updated API URL
        projectInfo: {
            name: document.title || 'Unknown Project',
            language: null,
            entity: null,
        },


        init: function() {
            console.log('🕒 Initializing Hackatime tracker');

            const siteId = document.getElementById('site-id')?.value;
            const siteType = document.getElementById('site-type')?.value;

            this.projectInfo.language = siteType === 'web' ? 'HTML' : 'Python';

            const activeTab = document.querySelector('.file-tab.active');
            if (activeTab) {
                this.projectInfo.entity = activeTab.dataset.filename;
            } else {
                this.projectInfo.entity = siteType === 'web' ? 'index.html' : 'main.py';
            }

            this.updateBadge("Initializing...");

            this.startHeartbeatTimer();

            this.recordActivity();

            setTimeout(() => this.sendHeartbeat(), 2000);

            console.log('🕒 Hackatime tracker initialized with:', this.projectInfo);
        },


        startHeartbeatTimer: function() {
            console.log('🕒 Starting heartbeat timer');
            setInterval(() => {
                if (this.lastActivity && (!this.lastHeartbeat || this.lastActivity > this.lastHeartbeat)) {
                    this.sendHeartbeat();
                }
            }, this.heartbeatInterval);
        },


        recordActivity: function() {
            this.lastActivity = Date.now();
        },


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


        sendHeartbeat: function() {
            if (!this.lastActivity) {
                console.log('🕒 No activity to report');
                return;
            }

            // this.apiUrl = 'https://waka.hackclub.com/api/v1/users/current/heartbeats'; //Redundant, already set in object.
            const now = Date.now();
            if (now - this.lastActivity > this.idleTimeout) {
                console.log('🕒 User has been idle for too long, skipping heartbeat');
                return;
            }

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

            // Send to our server-side proxy endpoint  - Assuming API key is accessible via this method.  This is a vulnerability risk in production!
            const apiKey =  document.getElementById('wakatime-api-key')?.value || "NO_API_KEY_FOUND"; //Improved error handling

            fetch('/hackatime/heartbeat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}` // Add Authorization header with API key
                },
                body: JSON.stringify(heartbeat),
                credentials: 'same-origin' // Ensure cookies are sent for authentication
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
                    // Check for authentication errors
                    if (data.message && data.message.includes('401')) {
                        console.error('🕒 Heartbeat failed: Authentication error. Your API key may be invalid.');
                        console.error('Debug - Invalid API key:', apiKey); // Log the actual API key (for debugging purposes only, remove in production!)
                        // Display a more visible error in the badge
                        document.getElementById('hackatime-badge').innerHTML = 
                            '<i class="fas fa-exclamation-triangle"></i> Auth Error - Check Settings';
                        document.getElementById('hackatime-badge').style.backgroundColor = '#e74c3c';
                    } else {
                        console.log('🕒 Heartbeat failed:', data.message);
                    }
                }
            })
            .catch(error => {
                console.log('🕒 Heartbeat failed: API error:', error);
                // Update badge to show error state
                document.getElementById('hackatime-badge').innerHTML = 
                    '<i class="fas fa-exclamation-circle"></i> Connection Error';
                document.getElementById('hackatime-badge').style.backgroundColor = '#e74c3c';
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

    // Expose the tracker to the global scope for easy access
    window.HackatimeTracker = HackatimeTracker;
}