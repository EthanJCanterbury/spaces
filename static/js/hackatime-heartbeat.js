
// Hackatime Heartbeat Tracker
const HackatimeTracker = {
  lastHeartbeat: null,
  interval: null,
  timeout: null,
  isActive: false,
  sessionStart: new Date(),
  totalSeconds: 0,
  
  // Initialize the tracker
  init: function() {
    // Check if already initialized
    if (this.interval) return;
    
    console.log('🕒 Initializing Hackatime tracker...');
    
    this.isActive = true;
    this.lastHeartbeat = new Date();
    this.sessionStart = new Date();
    this.totalSeconds = 0;
    
    // Send initial heartbeat
    this.sendHeartbeat();
    
    // Set interval to check activity every minute
    this.interval = setInterval(() => {
      const now = new Date();
      const timeSinceLastHeartbeat = now - this.lastHeartbeat;
      
      // If it's been more than 5 minutes since last activity, stop tracking
      if (timeSinceLastHeartbeat > 5 * 60 * 1000) {
        console.log('🕒 Inactive for over 5 minutes, pausing tracking');
        this.isActive = false;
        this.updateBadgeStatus(false);
      }
      
      // Only send heartbeat if active
      if (this.isActive) {
        // Update total tracked time
        if (this.lastHeartbeat) {
          // Only count time since last heartbeat (max 1 minute per interval)
          this.totalSeconds += 60;
          console.log(`🕒 Session time: ${this.formatTime(this.totalSeconds)}`);
        }
        
        this.sendHeartbeat();
      }
    }, 60 * 1000); // Check every minute
    
    this.updateBadgeStatus(true);
    console.log('🕒 Hackatime tracker started successfully');
  },
  
  // Record activity and send heartbeat
  recordActivity: function() {
    this.lastHeartbeat = new Date();
    
    // If we were inactive, log resuming
    if (!this.isActive) {
      console.log('🕒 Activity detected, resuming tracking');
    }
    
    this.isActive = true;
    this.updateBadgeStatus(true);
    
    // Clear existing timeout if there is one
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    
    // Set timeout to check for inactivity after 5 minutes
    this.timeout = setTimeout(() => {
      this.isActive = false;
      this.updateBadgeStatus(false);
      console.log('🕒 No activity detected for 5 minutes, pausing tracking');
    }, 5 * 60 * 1000);
  },
  
  // Send heartbeat to server
  sendHeartbeat: function() {
    const now = new Date();
    const editor = document.querySelector('.CodeMirror') ? 
      document.querySelector('.CodeMirror').CodeMirror : null;
    
    if (!editor) {
      console.log('🕒 No editor found, skipping heartbeat');
      return;
    }
    
    // Get current filename and editor content
    const filename = this.getCurrentFilename();
    const language = this.detectLanguage(filename);
    
    console.log(`🕒 Sending heartbeat for file: ${filename} (${language})`);
    
    // Construct heartbeat data
    const heartbeat = {
      type: 'file',
      time: now.getTime() / 1000, // Convert to Unix timestamp
      file: filename,
      language: language,
      is_write: false, // We're just tracking editing time, not writes
      project: window.location.pathname,
      editor_name: 'Hack Club Spaces'
    };
    
    // Send to server
    fetch('/hackatime/heartbeat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(heartbeat)
    })
    .then(response => {
      if (response.ok) {
        console.log('✅ Heartbeat sent successfully');
        return response.json();
      } else {
        console.error('❌ Failed to send heartbeat:', response.status);
        throw new Error('Heartbeat request failed');
      }
    })
    .then(data => {
      if (data && data.success) {
        this.updateBadge(`Active: ${this.formatTime(this.totalSeconds)}`);
      }
    })
    .catch(error => {
      console.error('❌ Error sending heartbeat:', error);
      this.updateBadge('Error sending heartbeat');
    });
  },
  
  // Get current filename being edited
  getCurrentFilename: function() {
    // Try to get from active tab
    const activeTab = document.querySelector('.file-tab.active');
    if (activeTab) {
      return activeTab.getAttribute('data-filename');
    }
    
    // For Python editor (single file)
    const siteType = document.getElementById('site-type')?.value;
    const siteSlug = document.getElementById('site-slug')?.value;
    
    if (siteType === 'python') {
      return `${siteSlug || 'main'}.py`;
    }
    
    // Default fallback
    return 'index.html';
  },
  
  // Detect language from filename
  detectLanguage: function(filename) {
    if (!filename) return 'text';
    
    const extension = filename.split('.').pop().toLowerCase();
    const languageMap = {
      'py': 'python',
      'js': 'javascript',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown'
    };
    
    return languageMap[extension] || 'text';
  },
  
  // Update badge status
  updateBadgeStatus: function(isActive) {
    const badge = document.getElementById('hackatime-badge');
    if (!badge) return;
    
    if (isActive) {
      badge.classList.add('active');
    } else {
      badge.classList.remove('active');
    }
    
    this.updateBadge(isActive ? 
      `Active: ${this.formatTime(this.totalSeconds)}` : 
      'Inactive - Click to resume');
  },
  
  // Update badge text
  updateBadge: function(text) {
    const badge = document.getElementById('hackatime-badge');
    if (!badge) return;
    
    badge.innerHTML = `<i class="fas fa-clock"></i> ${text}`;
  },
  
  // Format seconds as HH:MM:SS
  formatTime: function(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    let result = '';
    if (hrs > 0) {
      result += `${hrs}h `;
    }
    if (mins > 0 || hrs > 0) {
      result += `${mins}m `;
    }
    result += `${secs}s`;
    
    return result.trim();
  },
  
  // Get session stats
  getStats: function() {
    const now = new Date();
    const sessionDuration = (now - this.sessionStart) / 1000;
    
    return {
      totalTrackedSeconds: this.totalSeconds,
      sessionStartTime: this.sessionStart,
      sessionDuration: sessionDuration,
      isActive: this.isActive,
      formattedTime: this.formatTime(this.totalSeconds)
    };
  }
};

// Add click handler to resume tracking if it's paused
document.addEventListener('DOMContentLoaded', function() {
  const badge = document.getElementById('hackatime-badge');
  if (badge) {
    badge.addEventListener('click', function() {
      if (!HackatimeTracker.isActive) {
        console.log('🕒 Manually resuming tracking');
        HackatimeTracker.recordActivity();
        HackatimeTracker.sendHeartbeat();
      } else {
        console.log('🕒 Current session stats:', HackatimeTracker.getStats());
      }
    });
  }
});
