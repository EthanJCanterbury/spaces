
// Hackatime Heartbeat Tracker
const HackatimeTracker = {
  lastHeartbeat: null,
  interval: null,
  timeout: null,
  isActive: false,
  sessionStart: new Date(),
  
  // Initialize the tracker
  init: function() {
    // Check if already initialized
    if (this.interval) return;
    
    this.isActive = true;
    this.lastHeartbeat = new Date();
    
    // Send initial heartbeat
    this.sendHeartbeat();
    
    // Set interval to check activity every minute
    this.interval = setInterval(() => {
      const now = new Date();
      const timeSinceLastHeartbeat = now - this.lastHeartbeat;
      
      // If it's been more than 5 minutes since last activity, stop tracking
      if (timeSinceLastHeartbeat > 5 * 60 * 1000) {
        this.isActive = false;
        this.updateBadgeStatus(false);
      }
      
      // Only send heartbeat if active
      if (this.isActive) {
        this.sendHeartbeat();
      }
    }, 60 * 1000); // Check every minute
    
    this.updateBadgeStatus(true);
  },
  
  // Record activity and send heartbeat
  recordActivity: function() {
    this.lastHeartbeat = new Date();
    this.isActive = true;
    
    // If we weren't previously active, send a heartbeat right away
    if (!this.isActive) {
      this.sendHeartbeat();
    }
    
    this.updateBadgeStatus(true);
    
    // Clear existing timeout if there is one
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    
    // Set timeout to check for inactivity after 5 minutes
    this.timeout = setTimeout(() => {
      this.isActive = false;
      this.updateBadgeStatus(false);
    }, 5 * 60 * 1000);
  },
  
  // Send heartbeat to server
  sendHeartbeat: function() {
    const now = new Date();
    const editor = document.querySelector('.CodeMirror') ? 
      document.querySelector('.CodeMirror').CodeMirror : null;
    
    if (!editor) return;
    
    // Get current filename and editor content
    const filename = this.getCurrentFilename();
    const language = this.detectLanguage(filename);
    
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
      if (!response.ok) {
        console.log('Failed to send heartbeat:', response.status);
      }
    })
    .catch(error => {
      console.log('Error sending heartbeat:', error);
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
    const siteType = document.getElementById('site-type');
    if (siteType && siteType.value === 'python') {
      return 'main.py';
    }
    
    return 'index.html'; // Default fallback
  },
  
  // Detect language based on file extension
  detectLanguage: function(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const languageMap = {
      'py': 'Python',
      'js': 'JavaScript',
      'html': 'HTML',
      'css': 'CSS',
      'md': 'Markdown',
      'json': 'JSON',
      'txt': 'Text'
    };
    
    return languageMap[extension] || 'Unknown';
  },
  
  // Update the badge status
  updateBadgeStatus: function(isActive) {
    const badge = document.getElementById('hackatime-badge');
    if (!badge) return;
    
    if (isActive) {
      badge.classList.add('active');
      badge.innerHTML = '<i class="fas fa-clock"></i> Tracking Time';
    } else {
      badge.classList.remove('active');
      badge.innerHTML = '<i class="fas fa-clock"></i> Idle';
    }
  },
  
  // Stop the tracker
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
  }
};
