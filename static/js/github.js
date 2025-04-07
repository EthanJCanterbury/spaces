/**
 * GitHub Integration Manager
 * 
 * A comprehensive GitHub integration for managing repositories, pushing changes,
 * and handling GitHub-related operations for Hack Club Spaces.
 * Made by Ethan Canterbury
 */
const GitHubManager = {
  modal: null,
  currentSiteId: null,
  isLoading: false,
  githubStatus: null,


  init: function() {
    this.modal = document.getElementById('githubModal');

    const siteIdElement = document.getElementById('site-id');
    if (siteIdElement) {
      this.currentSiteId = siteIdElement.value;
      sessionStorage.setItem('current_site_id', this.currentSiteId);
    } else {
      const urlParams = new URLSearchParams(window.location.search);
      this.currentSiteId = urlParams.get('site_id');
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isModalOpen()) {
        this.closeModal();
      }
    });
  },


  openModal: function() {
    const modal = document.getElementById('githubModal');
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.visibility = 'visible';
    document.body.classList.add('modal-open');

    this.checkGitHubStatus();
  },


  closeModal: function() {
    if (this.modal) {
      this.modal.style.display = 'none';
      document.body.classList.remove('modal-open');
    }
  },


  isModalOpen: function() {
    return this.modal && this.modal.style.display === 'flex';
  },


  checkGitHubStatus: function() {
    const urlParams = new URLSearchParams(window.location.search);
    let siteId = urlParams.get('site_id') || sessionStorage.getItem('current_site_id');


    if (!siteId || siteId === 'null' || siteId === 'undefined') {
      const pathMatch = window.location.pathname.match(/\/(edit|python)\/(\d+)/);
      if (pathMatch && pathMatch[2]) {
        siteId = pathMatch[2];
        sessionStorage.setItem('current_site_id', siteId);
      }
    }

    if (siteId && siteId !== 'null' && siteId !== 'undefined') {
        this.isLoading = true;
        this.updateUI();

        fetch(`/api/github/status?site_id=${siteId}`)
          .then(response => response.json())
          .then(data => {
            this.isLoading = false;
            this.githubStatus = data;
            this.updateUI();
          })
          .catch(error => {
            this.isLoading = false;
            this.githubStatus = { connected: false, repo_connected: false, error: error.message };
            this.updateUI();
          });
    } else {
        this.isLoading = false;
        this.githubStatus = { 
          connected: false, 
          repo_connected: false, 
          error: "Unable to identify which project you're working on. Please try selecting a project from your dashboard first." 
        };
        console.warn("GitHub integration needs a site ID. Current URL:", window.location.href);
        this.updateUI();
    }
  },


  showLoading: function(message = 'Loading...') {
    const modalBody = document.getElementById('githubModalBody');
    if (!modalBody) return;

    modalBody.innerHTML = `
      <div class="github-loading">
        <div class="github-loading-spinner"></div>
        <div class="github-loading-text">${message}</div>
      </div>
    `;
  },


  showError: function(message) {
    const errorElement = document.createElement('div');
    errorElement.className = 'error-banner';
    errorElement.innerHTML = `<i class="fas fa-exclamation-circle"></i><span>${message}</span>`;

    const container = document.querySelector('#githubContainer');
    if (container) {
      container.insertBefore(errorElement, container.firstChild);

      setTimeout(() => {
        errorElement.remove();
      }, 5000);
    } else {
      console.error('GitHub container not found, error:', message);
    }
  },


  showFormError: function(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;

    const errorElement = document.createElement('div');
    errorElement.classList.add('form-error');
    errorElement.textContent = message;

    const existingError = field.parentNode.querySelector('.form-error');
    if (existingError) {
      existingError.remove();
    }

    field.classList.add('has-error');

    field.parentNode.insertBefore(errorElement, field.nextSibling);

    field.focus();

    field.addEventListener('input', () => {
      field.classList.remove('has-error');
      errorElement.remove();
    }, { once: true });
  },


  showSuccess: function(message) {
    const modalBody = document.getElementById('githubModalBody');
    if (!modalBody) return;

    const successBanner = document.createElement('div');
    successBanner.classList.add('success-message');
    successBanner.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <span>${message}</span>
    `;

    if (modalBody.firstChild) {
      modalBody.insertBefore(successBanner, modalBody.firstChild);
    } else {
      modalBody.appendChild(successBanner);
    }

    setTimeout(() => {
      if (successBanner.parentNode) {
        successBanner.remove();
      }
    }, 5000);
  },


  updateUI: function() {
    if (!this.modal) return;

    const modalBody = document.getElementById('githubModalBody');
    if (!modalBody) return;

    if (this.isLoading) {
      this.showLoading('Loading GitHub status...');
      return;
    }

    console.log("Updating UI with status:", this.githubStatus);

    if (!this.githubStatus || !this.githubStatus.connected) {
      modalBody.innerHTML = this.renderConnectScreen();
    } else if (this.githubStatus.connected && !this.githubStatus.repo_connected) {
      modalBody.innerHTML = this.renderCreateRepoForm();

      const form = document.getElementById('createRepoForm');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          this.createRepo();
        });
      }
    } else if (this.githubStatus.connected && this.githubStatus.repo_connected) {
      modalBody.innerHTML = `
        <div class="github-status-info">
          <div class="github-user-info">
            <p><i class="fas fa-check-circle text-success"></i> Connected as <strong>@${this.githubStatus.username}</strong></p>
          </div>

          <div class="github-repo-info">
            <div class="github-push-section">
            <h3><i class="fas fa-code-branch"></i> Repository Connected</h3>
            <p>
              Your site is connected to <a href="${this.githubStatus.repo_url}" target="_blank" class="github-repo-link">
                ${this.githubStatus.repo_name}
              </a> 
              <span class="repo-privacy-badge ${this.githubStatus.is_private ? 'private' : 'public'}">
                ${this.githubStatus.is_private ? '&#160;(Private)' : '&#160;(Public)'}
              </span>
            </p>
            </div>

            <div class="github-push-section">
              <div class="sync-buttons-container" style="display: flex; flex-direction: column; align-items: center; margin-bottom: 15px; width: 100%;">
                <div style="width: 100%; text-align: center;">
                  <h4>Sync with GitHub</h4>
                  <div class="sync-options" style="display: flex; justify-content: center; gap: 10px; margin-bottom: 10px; width: 100%;">
                    <button onclick="GitHubManager.syncChanges()" class="btn btn-primary" style="background: linear-gradient(135deg, #4e54c8, #8f94fb); width: 100%; max-width: 400px;">
                      <i class="fas fa-sync-alt"></i> Sync Changes
                    </button>
                  </div>
                  <input type="text" id="commitMessage" placeholder="Update from Hack Club Spaces" class="form-control" style="width: 100%; margin-bottom: 15px; max-width: 400px;">
                  <div class="commit-message-form" style="width: 100%;">
                    <div style="display: flex; gap: 10px; margin-bottom: 10px; justify-content: center; width: 100%;">
                      <button onclick="GitHubManager.pushChanges()" class="btn btn-primary" style="flex: 1; max-width: 200px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="fas fa-upload"></i> Push Changes
                      </button>
                      <button onclick="GitHubManager.pullChanges()" class="btn btn-primary" style="flex: 1; max-width: 200px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="fas fa-download"></i> Pull Changes
                      </button>
                    </div>
                  </div>
                  <div class="push-status" id="pushStatus" style="margin-top: 10px;"></div>
                </div>
              </div>
            </div>

            <div class="github-repo-actions">
              <h4>Repository Options</h4>
              <div class="repo-buttons">
                <button onclick="GitHubManager.viewRepoInfo()" class="btn btn-outline-info btn-sm">
                  <i class="fas fa-info-circle"></i> Details
                </button>
                <button onclick="GitHubManager.disconnectRepo()" class="btn btn-outline-warning btn-sm">
                  <i class="fas fa-unlink"></i> Disconnect
                </button>
                <button onclick="GitHubManager.showDeleteRepoConfirm()" class="btn btn-outline-danger btn-sm">
                  <i class="fas fa-trash-alt"></i> Delete
                </button>
              </div>
            </div>
          </div>

          <div class="github-disconnect">
            <button onclick="GitHubManager.disconnectAccount()" class="btn btn-outline-danger btn-sm disconnect-account-btn">
              <i class="fas fa-unlink"></i> Disconnect GitHub Account
            </button>
          </div>
        </div>
      `;
    }
  },


  createRepo: function() {
    const repoName = document.getElementById('repoName').value.trim();
    const repoDesc = document.getElementById('repoDesc').value.trim();
    const repoPrivate = document.getElementById('repoPrivate')?.checked || false;

    if (!repoName) {
      this.showFormError('repoName', 'Repository name is required');
      return;
    }


    if (!/^[a-zA-Z0-9_.-]+$/.test(repoName)) {
      this.showFormError('repoName', 'Repository name can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    const siteId = sessionStorage.getItem('current_site_id');
    if (!siteId) {
      this.showError('No site ID found. Please refresh the page and try again.');
      return;
    }

    this.showLoading('Creating repository...');

    fetch(`/api/github/create-repo?site_id=${siteId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: repoName,
        description: repoDesc,
        private: repoPrivate
      })
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(data => {
          throw new Error(data.error || 'Failed to create repository');
        });
      }
      return response.json();
    })
    .then(data => {
      this.showSuccess(`Repository "${data.repo_name}" created successfully`);
      this.checkGitHubStatus();
    })
    .catch(error => {
      this.showError(error.message);
    });
  },


  pushChanges: function() {
    const commitMsgElement = document.getElementById('commitMessage');
    if (!commitMsgElement) {
      this.showError('Commit message field not found');
      return;
    }

    const commitMsg = commitMsgElement.value.trim() || 'Commit from Hack Club Spaces';

    this.showPushStatus('Pushing changes to GitHub...', 'info');

    const data = {
      message: commitMsg
    };

    fetch('/api/github/push?site_id=' + this.currentSiteId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        this.showError(data.error);
        return;
      }



      const pushStatus = document.getElementById('pushStatus');
      if (pushStatus) {
        pushStatus.innerHTML = `
          <div class="success-banner">
            <i class="fas fa-check-circle"></i>
            <span>${data.results.summary}</span>
          </div>
        `;
      }

      setTimeout(() => {
        this.init(this.currentSiteId);
      }, 3000);
    })
    .catch(error => {
      this.showError('Failed to push changes: ' + error);
    });
  },


  showPushStatus: function(message, type) {
    const pushStatus = document.getElementById('pushStatus');
    if (!pushStatus) return;

    const className = type === 'success' ? 'success-banner' : 
                     type === 'error' ? 'error-banner' : 'info-banner';

    pushStatus.innerHTML = `
      <div class="${className}">
        ${message}
      </div>
    `;
  },


  viewRepoInfo: function() {
    const siteId = sessionStorage.getItem('current_site_id');
    if (!siteId) {
      this.showError('No site ID found. Please refresh the page and try again.');
      return;
    }

    this.showLoading('Loading repository information...');

    fetch(`/api/github/repo-info?site_id=${siteId}`)
      .then(response => {
        if (!response.ok) {
          return response.json().then(data => {
            throw new Error(data.error || 'Failed to get repository information');
          });
        }
        return response.json();
      })
      .then(data => {
        const modalBody = document.getElementById('githubModalBody');
        if (!modalBody) return;

        modalBody.innerHTML = `
          <div class="github-repo-details">
            <h3><i class="fab fa-github"></i> Repository Details</h3>
            <div class="repo-details-grid">
              <div class="details-card">
                <div class="details-item">
                  <span class="details-label">Repository Name</span>
                  <div class="details-value">${data.repo_name}</div>
                </div>
                <div class="details-item">
                  <span class="details-label">URL</span>
                  <div class="details-value">
                    <a href="${data.repo_url}" target="_blank">${data.repo_url}</a>
                  </div>
                </div>
                <div class="details-item">
                  <span class="details-label">Visibility</span>
                  <div class="details-value">
                    <span class="repo-badge ${data.is_private ? 'badge-private' : 'badge-public'}">
                      ${data.is_private ? 'Private' : 'Public'}
                    </span>
                  </div>
                </div>
              </div>

              <div class="details-card">
                <div class="details-item">
                  <span class="details-label">Created</span>
                  <div class="details-value">${new Date(data.created_at).toLocaleString()}</div>
                </div>
                <div class="details-item">
                  <span class="details-label">Last Commit</span>
                  <div class="details-value">${data.last_commit ? new Date(data.last_commit).toLocaleString() : 'None'}</div>
                </div>
                <div class="details-item">
                  <span class="details-label">Default Branch</span>
                  <div class="details-value">${data.default_branch}</div>
                </div>
              </div>

              <div class="details-card">
                <div class="details-item">
                  <span class="details-label">Contributors</span>
                  <div class="details-value">
                    <i class="fas fa-users"></i> ${data.contributors}
                  </div>
                </div>
                <div class="details-item">
                  <span class="details-label">Commits</span>
                  <div class="details-value">
                    <i class="fas fa-code-commit"></i> ${data.commits}
                  </div>
                </div>
              </div>
            </div>

            <div class="repo-details-actions">
              <button onclick="GitHubManager.checkGitHubStatus()" class="github-btn btn-back">
                <i class="fas fa-arrow-left"></i> Back
              </button>
              <a href="${data.repo_url}" target="_blank" class="github-btn btn-github">
                <i class="fab fa-github"></i> View on GitHub
              </a>
            </div>
          </div>
        `;
      })
      .catch(error => {
        this.showError(error.message);
      });
  },
  
  pullChanges: function() {
    this.showPushStatus('Pulling changes from GitHub...', 'info');
    
    const siteId = sessionStorage.getItem('current_site_id');
    if (!siteId) {
      this.showError('No site ID found. Please refresh the page and try again.');
      return;
    }
    
    fetch('/api/github/pull?site_id=' + siteId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        this.showError(data.error);
        return;
      }
      
      const pushStatus = document.getElementById('pushStatus');
      if (pushStatus) {
        let newFilesText = data.files_pulled && data.files_pulled.length > 0 ? 
          `<p>New files: ${data.files_pulled.length}</p>` : '';
        let updatedFilesText = data.files_updated && data.files_updated.length > 0 ? 
          `<p>Updated files: ${data.files_updated.length}</p>` : '';
        
        pushStatus.innerHTML = `
          <div class="success-banner">
            <i class="fas fa-check-circle"></i>
            <span>Successfully synced with GitHub</span>
            ${newFilesText}
            ${updatedFilesText}
          </div>
        `;
      }
      
      this.showSuccess(`Successfully synced changes with GitHub`);
      
      // Reload the editor content after 2 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    })
    .catch(error => {
      this.showError('Failed to pull changes: ' + error);
    });
  },
  
  syncChanges: function() {
    this.showPushStatus('Syncing changes with GitHub...', 'info');
    
    const commitMsgElement = document.getElementById('commitMessage');
    if (!commitMsgElement) {
      this.showError('Commit message field not found');
      return;
    }

    const commitMsg = commitMsgElement.value.trim() || 'Commit from Hack Club Spaces';
    const siteId = sessionStorage.getItem('current_site_id');
    
    if (!siteId) {
      this.showError('No site ID found. Please refresh the page and try again.');
      return;
    }

    let pushData = null;

    // First push local changes to GitHub
    fetch('/api/github/push?site_id=' + siteId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: commitMsg })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Push request failed with status ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      pushData = data;
      if (data.error) {
        throw new Error('Push failed: ' + data.error);
      }

      // Then pull any remote changes
      return fetch('/api/github/pull?site_id=' + siteId, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Pull request failed with status ${response.status}`);
      }
      return response.json();
    })
    .then(pullData => {
      if (pullData.error) {
        throw new Error('Pull failed: ' + pullData.error);
      }
      
      const pushStatus = document.getElementById('pushStatus');
      if (pushStatus) {
        let newFilesText = pullData.files_pulled && pullData.files_pulled.length > 0 ? 
          `<p>New files: ${pullData.files_pulled.length}</p>` : '';
        let updatedFilesText = pullData.files_updated && pullData.files_updated.length > 0 ? 
          `<p>Updated files: ${pullData.files_updated.length}</p>` : '';
        let pushedText = '';
        
        if (pushData && pushData.results) {
          let updatedCount = pushData.results.updated ? pushData.results.updated.length : 0;
          let createdCount = pushData.results.created ? pushData.results.created.length : 0;
          
          if (updatedCount > 0 || createdCount > 0) {
            pushedText = `<p>Pushed: ${updatedCount} updated, ${createdCount} created</p>`;
          }
        }
        
        pushStatus.innerHTML = `
          <div class="success-banner">
            <i class="fas fa-check-circle"></i>
            <span>Successfully synced changes with GitHub</span>
            ${pushedText}
            ${newFilesText}
            ${updatedFilesText}
          </div>
        `;
      }
      
      this.showSuccess('Successfully synced changes with GitHub');
      
      // Reload the editor content after 2 seconds
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    })
    .catch(error => {
      this.showError('Failed to sync changes: ' + error);
      // Clear the loading status
      const pushStatus = document.getElementById('pushStatus');
      if (pushStatus) {
        pushStatus.innerHTML = `
          <div class="error-banner">
            <i class="fas fa-exclamation-circle"></i>
            <span>Error: ${error.message}</span>
          </div>
        `;
      }
    });
  },


  disconnectRepo: function() {
    if (!confirm('Are you sure you want to disconnect this repository? This will not delete the repository from GitHub.')) {
      return;
    }

    const siteId = sessionStorage.getItem('current_site_id');
    if (!siteId) {
      this.showError('No site ID found. Please refresh the page and try again.');
      return;
    }

    this.showLoading('Disconnecting repository...');

    fetch(`/api/github/disconnect-repo?site_id=${siteId}`, {
      method: 'POST'
    })
      .then(response => {
        if (!response.ok) {
          return response.json().then(data => {
            throw new Error(data.error || 'Failed to disconnect repository');
          });
        }
        return response.json();
      })
      .then(data => {
        this.showSuccess(`Repository "${data.repo_name}" disconnected successfully`);
        this.checkGitHubStatus();
      })
      .catch(error => {
        this.showError(error.message);
      });
  },


  showDeleteRepoConfirm: function() {
    const modalBody = document.getElementById('githubModalBody');
    if (!modalBody) return;

    modalBody.innerHTML = `
      <div class="delete-repo-confirm">
        <h3 class="text-danger"><i class="fas fa-exclamation-triangle"></i> Delete Repository?</h3>
        <p class="warning-text">
          This action <strong>cannot be undone</strong>. This will permanently delete the 
          repository and all its contents from GitHub.
        </p>
        <div class="form-group">
          <label for="deleteConfirmation">Please type <strong>delete</strong> to confirm:</label>
          <input type="text" id="deleteConfirmation" class="form-control" placeholder="delete">
        </div>
        <div class="action-buttons">
          <button onclick="GitHubManager.checkGitHubStatus()" class="btn btn-secondary">
            <i class="fas fa-times"></i> Cancel
          </button>
          <button onclick="GitHubManager.deleteRepo()" class="btn btn-danger">
            <i class="fas fa-trash-alt"></i> Confirm Delete
          </button>
        </div>
      </div>
    `;
  },


  deleteRepo: function() {
    const confirmation = document.getElementById('deleteConfirmation');
    if (!confirmation || confirmation.value.trim().toLowerCase() !== 'delete') {
      this.showFormError('deleteConfirmation', 'Please type "delete" to confirm');
      return;
    }

    const siteId = sessionStorage.getItem('current_site_id');
    if (!siteId) {
      this.showError('No site ID found. Please refresh the page and try again.');
      return;
    }

    this.showLoading('Deleting repository...');

    fetch(`/api/github/delete-repo?site_id=${siteId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        confirmation: 'delete'
      })
    })
      .then(response => {
        if (!response.ok) {
          return response.json().then(data => {
            throw new Error(data.error || 'Failed to delete repository');
          });
        }
        return response.json();
      })
      .then(data => {
        this.showSuccess(`Repository "${data.repo_name}" deleted successfully`);
        this.checkGitHubStatus();
      })
      .catch(error => {
        this.showError(error.message);
      });
  },


  disconnectAccount: function() {
    if (!confirm('Are you sure you want to disconnect your GitHub account? You will need to reconnect to use GitHub features.')) {
      return;
    }

    this.showLoading('Disconnecting GitHub account...');

    fetch('/api/github/disconnect-account', {
      method: 'POST'
    })
      .then(response => {
        if (!response.ok) {
          return response.json().then(data => {
            throw new Error(data.error || 'Failed to disconnect GitHub account');
          });
        }
        return response.json();
      })
      .then(data => {
        this.showSuccess('GitHub account disconnected successfully');
        this.checkGitHubStatus();
      })
      .catch(error => {
        this.showError(error.message);
      });
  },

  authenticate: function() {
    window.location.href = '/api/github/login';
  },

  renderConnectScreen: function() {
    return `
      <div class="github-connect-container">
        <i class="fab fa-github github-connect-icon"></i>
        <h3>Connect to GitHub</h3>
        <p>Connect your GitHub account to push your site to a repository.</p>
        <button onclick="GitHubManager.authenticate()" class="github-btn github-btn-primary">
          <i class="fab fa-github"></i> Link GitHub Account
        </button>
      </div>
    `;
  },

  renderCreateRepoForm: function() {
    return `
      <div class="github-section github-repo-card">
        <h3>Create a Repository</h3>
        <p>Create a new GitHub repository to store your site.</p>
        <form class="github-form" id="createRepoForm">
          <div class="form-group">
            <label for="repoName">Repository Name</label>
            <input type="text" id="repoName" class="form-control" placeholder="my-awesome-site">
            <div class="form-error" id="repoNameError"></div>
          </div>
          <div class="form-group">
            <label for="repoDesc">Description (optional)</label>
            <input type="text" id="repoDesc" class="form-control" placeholder="A site built with Hack Club Spaces">
          </div>
          <div class="form-check">
            <input type="checkbox" id="repoPrivate" class="form-check-input">
            <label for="repoPrivate" class="form-check-label">Private Repository</label>
          </div>
          <button type="button" onclick="GitHubManager.createRepo()" class="github-btn github-btn-primary">
            <i class="fas fa-plus"></i> Create Repository
          </button>
        </form>
      </div>
    `;
  }
};

document.addEventListener('DOMContentLoaded', function() {
  GitHubManager.init();
  const gitBtn = document.getElementById('gitBtn');
  if (gitBtn) {
    gitBtn.addEventListener('click', () => {
        GitHubManager.openModal();
    });
  }
});