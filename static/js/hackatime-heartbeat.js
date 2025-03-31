
// Hackatime Heartbeat Tracker
const HackatimeTracker = {
  lastHeartbeat: null,
  interval: null,
  timeout: null,
  isActive: false,
  sessionStart: new Date(),
  totalSeconds: 0,
  lastActivityTime: null,
  
  // Initialize the tracker
  init: function() {
    // Check if already initialized
    if (this.interval) {
      console.log('🕒 Hackatime tracker already initialized, skipping');
      return;
    }
    
    console.log('🕒 Initializing Hackatime tracker...');
    
    this.isActive = true;
    this.lastHeartbeat = new Date();
    this.lastActivityTime = new Date();
    this.sessionStart = new Date();
    this.totalSeconds = 0;
    
    // Create badge if it doesn't exist
    this.createBadgeIfNeeded();
    
    // Send initial heartbeat
    this.sendHeartbeat();
    
    // Set interval to check activity every minute
    this.interval = setInterval(() => {
      const now = new Date();
      const timeSinceLastActivity = now - this.lastActivityTime;
      
      console.log(`🕒 Time since last activity: ${Math.round(timeSinceLastActivity / 1000)} seconds`);
      
      // If it's been more than 5 minutes since last activity, stop tracking
      if (timeSinceLastActivity > 5 * 60 * 1000) {
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
  
  // Create the badge element if it doesn't exist
  createBadgeIfNeeded: function() {
    if (!document.getElementById('hackatime-badge')) {
      console.log('🕒 Creating Hackatime badge');
      const badge = document.createElement('div');
      badge.id = 'hackatime-badge';
      badge.className = 'hackatime-badge';
      badge.innerHTML = '<i class="fas fa-clock"></i> <span>Initializing...</span>';
      document.body.appendChild(badge);
      
      // Add click handler
      badge.addEventListener('click', () => {
        if (!this.isActive) {
          console.log('🕒 Manually resuming tracking');
          this.recordActivity();
          this.sendHeartbeat();
        } else {
          console.log('🕒 Current session stats:', {
            totalTime: this.formatTime(this.totalSeconds),
            sessionStart: this.sessionStart,
            isActive: this.isActive
          });
        }
      });
    }
  },
  
  // Record user activity
  recordActivity: function() {
    console.log('🕒 Activity detected');
    this.lastActivityTime = new Date();
    
    // If tracking was inactive, restart it
    if (!this.isActive) {
      console.log('🕒 Resuming tracking after inactivity');
      this.isActive = true;
      this.updateBadgeStatus(true);
    }
    
    // Reset inactivity timeout
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
  },
  
  // Update badge content
  updateBadge: function(text) {
    const badge = document.getElementById('hackatime-badge');
    if (badge) {
      const span = badge.querySelector('span');
      if (span) {
        span.textContent = text;
      } else {
        badge.innerHTML = `<i class="fas fa-clock"></i> <span>${text}</span>`;
      }
    }
  },
  
  // Update badge status (active/inactive)
  updateBadgeStatus: function(active) {
    const badge = document.getElementById('hackatime-badge');
    if (badge) {
      if (active) {
        badge.classList.add('active');
        this.updateBadge(`Active: ${this.formatTime(this.totalSeconds)}`);
      } else {
        badge.classList.remove('active');
        this.updateBadge('Inactive (click to resume)');
      }
    }
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
    
    return result;
  },
  
  // Send heartbeat to server
  sendHeartbeat: function() {
    console.log('🕒 Preparing to send heartbeat...');
    
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);
    
    // Get current filename and language
    const currentFile = this.getCurrentFilename();
    const language = this.detectLanguage(currentFile);
    
    console.log(`🕒 Current file: ${currentFile}, Language: ${language}`);
    
    // Prepare heartbeat data
    const heartbeat = {
      type: 'file',
      time: timestamp,
      entity: currentFile,
      category: 'coding',
      language: language,
      is_write: false, // Track reading time, not writes
      project: window.location.pathname,
      editor_name: 'Hack Club Spaces',
      user_agent: navigator.userAgent
    };
    
    console.log('🕒 Heartbeat payload:', JSON.stringify(heartbeat));
    
    // Send to server
    fetch('/hackatime/heartbeat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(heartbeat)
    })
    .then(response => {
      console.log(`🕒 Heartbeat response status: ${response.status}`);
      return response.json().catch(e => {
        console.error('🕒 Error parsing JSON response:', e);
        return { success: false, error: 'Invalid JSON response' };
      });
    })
    .then(data => {
      console.log('🕒 Heartbeat response data:', JSON.stringify(data));
      
      if (data && data.success) {
        console.log(`✅ Heartbeat sent successfully at ${new Date().toISOString()}`);
        this.lastHeartbeat = now;
        this.updateBadge(`Active: ${this.formatTime(this.totalSeconds)}`);
      } else {
        console.error('❌ Heartbeat rejected:', data);
        this.updateBadge(`Error: ${data.message || 'Failed to send'}`);
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
      const filename = activeTab.getAttribute('data-filename');
      console.log(`🕒 Found active tab: ${filename}`);
      return filename;
    }
    
    // For Python editor (single file)
    const siteType = document.getElementById('site-type')?.value;
    const siteSlug = document.getElementById('site-slug')?.value;
    
    if (siteType === 'python') {
      console.log(`🕒 Python site detected: ${siteSlug}.py`);
      return `${siteSlug || 'main'}.py`;
    }
    
    // Default fallback
    console.log('🕒 No specific file detected, using default: index.html');
    return 'index.html';
  },
  
  // Detect language from filename
  detectLanguage: function(filename) {
    if (!filename) return 'unknown';
    
    const ext = filename.split('.').pop().toLowerCase();
    
    const languageMap = {
      'py': 'Python',
      'js': 'JavaScript',
      'html': 'HTML',
      'css': 'CSS',
      'json': 'JSON',
      'md': 'Markdown',
      'sql': 'SQL',
      'java': 'Java',
      'cpp': 'C++',
      'c': 'C',
      'php': 'PHP',
      'rb': 'Ruby',
      'go': 'Go',
      'ts': 'TypeScript',
      'jsx': 'React',
      'tsx': 'React',
    };
    
    return languageMap[ext] || 'unknown';
  },
  
  // Stop tracking
  stop: function() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    
    this.isActive = false;
    this.updateBadgeStatus(false);
    console.log('🕒 Hackatime tracker stopped');
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
        console.log('🕒 Current session stats:', {
          totalTime: HackatimeTracker.formatTime(HackatimeTracker.totalSeconds),
          sessionStart: HackatimeTracker.sessionStart,
          isActive: HackatimeTracker.isActive
        });
      }
    });
  }
});
