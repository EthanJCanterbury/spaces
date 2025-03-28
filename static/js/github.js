document.addEventListener('DOMContentLoaded', function() {
    const disconnectBtn = document.querySelector('.disconnect-github');
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('Are you sure you want to disconnect your GitHub account?')) {
                window.location.href = '/api/github/disconnect';
            }
        });
    }

    fetch('/api/github/status')
        .then(response => response.json())
        .then(data => {
            const githubStatus = document.querySelector('.github-status');
            if (githubStatus) {
                if (data.connected) {
                    githubStatus.innerHTML = `
                        <div class="connected-status">
                            <i class="fab fa-github"></i>
                            Connected as ${data.username}
                            <button class="btn disconnect-github">Disconnect</button>
                        </div>
                    `;
                } else {
                    githubStatus.innerHTML = `
                        <div class="disconnected-status">
                            <i class="fab fa-github"></i>
                            Not connected
                            <a href="/api/github/login" class="btn btn-github">Connect GitHub</a>
                        </div>
                    `;
                }
            }
        })
        .catch(error => {
            console.error('Error checking GitHub status:', error);
        });
});

const githubModal = document.getElementById('githubModal');
const githubModalBody = document.getElementById('githubModalBody');

function closeGitHubModal() {
    if (githubModal) {
        githubModal.classList.remove('show');
        githubModal.style.display = 'none';
        isSubmitting = false;
        const buttons = githubModal.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('btn-loading');
        });
    }
}

if (githubModal) {
    githubModal.addEventListener('click', (e) => {
        if (e.target === githubModal) {
            closeGitHubModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && githubModal.classList.contains('show')) {
            closeGitHubModal();
        }
    });

    const closeButtons = githubModal.querySelectorAll('.close-button, .close-btn, .close-modal');
    closeButtons.forEach(button => {
        if (button) {
            button.addEventListener('click', closeGitHubModal);
        }
    });
}

async function handleGitAction() {
    if (!githubModal || !githubModalBody) {
        console.error('GitHub modal elements not found');
        return;
    }

    try {
        githubModal.classList.add('show');
        githubModalBody.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

        const pathParts = window.location.pathname.split('/');
        const siteId = pathParts[pathParts.indexOf('edit') + 1];

        if (!siteId) {
            showToast('error', 'Could not determine site ID');
            return;
        }

        const repoResponse = await fetch(`/api/github/repo-info?site_id=${siteId}`);
        if (repoResponse.ok) {
            showPushChanges();
            return;
        }

        const statusResponse = await fetch('/api/github/status');
        const statusData = await statusResponse.json();

        if (!statusData.connected) {
            showGitHubConnect();
        } else {
            showRepoSetup();
        }
    } catch (error) {
        console.error('GitHub error:', error);
        showToast('error', 'Failed to check GitHub status');
        githubModal.classList.remove('show');
    }
}

function showGitHubConnect() {
    githubModalBody.innerHTML = `
        <div class="repo-setup text-center">
            <h3><i class="fab fa-github"></i> Connect GitHub</h3>
            <p>Connect your GitHub account to enable version control for your space.</p>
            <p class="text-muted">This will allow you to:</p>
            <ul class="text-left">
                <li>Create repositories for your spaces</li>
                <li>Push changes directly from the editor</li>
                <li>Manage your code with version control</li>
            </ul>
            <div class="modal-actions">
                <a href="/api/github/login" class="btn-github">
                    <i class="fab fa-github"></i> Connect GitHub Account
                </a>
            </div>
        </div>
    `;
}

function showRepoSetup() {
    githubModalBody.innerHTML = `
        <div class="repo-setup">
            <h3><i class="fas fa-plus-circle"></i> Create Repository</h3>
            <p class="text-muted">Create a new GitHub repository for your space.</p>
            <form id="createRepoForm" onsubmit="createRepository(event)">
                <div class="form-group">
                    <label for="repoName">Repository Name <span class="required">*</span></label>
                    <input type="text" id="repoName" required 
                           placeholder="my-awesome-space"
                           title="Only letters, numbers, hyphens, and underscores are allowed">
                </div>
                <div class="form-group">
                    <label for="repoDescription">Description (optional)</label>
                    <input type="text" id="repoDescription" 
                           placeholder="A space created with HackClub Spaces">
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="privateRepo" checked>
                    <label for="privateRepo">Make repository private</label>
                    <small class="text-muted">Private repositories are only visible to you</small>
                </div>
                <div class="modal-actions">
                    <button type="submit" class="btn-github">
                        <i class="fas fa-plus"></i> Create Repository
                    </button>
                    <button type="button" class="btn-secondary" 
                            onclick="githubModal.classList.remove('show')">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    `;
}

async function showPushChanges() {
    try {
        const pathParts = window.location.pathname.split('/');
        const siteId = pathParts[pathParts.indexOf('edit') + 1];

        if (!siteId) {
            showToast('error', 'Could not determine site ID');
            return;
        }

        const response = await fetch(`/api/github/repo-info?site_id=${siteId}`);
        if (!response.ok) {
            if (response.status === 401) {
                showGitHubConnect();
                return;
            }
            const error = await response.json();
            throw new Error(error.error || 'Failed to fetch repository information');
        }

        const data = await response.json();
        githubModalBody.innerHTML = `
            <div class="push-changes">
                <div class="repo-info" onclick="window.open('${data.repo_url}', '_blank')" style="cursor: pointer">
                    <i class="fab fa-github"></i>
                    <div class="repo-details">
                        <div class="repo-name">${data.repo_name}</div>
                        <div class="repo-url">${data.repo_url}</div>
                    </div>
                    <div class="repo-actions">
                        <button onclick="event.stopPropagation(); disconnectRepo()" title="Disconnect">
                            <i class="fas fa-unlink" style="color: white; font-size: 14px;"></i>
                        </button>
                        <button onclick="event.stopPropagation(); deleteRepo()" title="Delete">
                            <i class="fas fa-trash" style="color: white; font-size: 14px;"></i>
                        </button>
                    </div>
                </div>
                <div class="form-group">
                    <label for="commitMessage">Commit Message</label>
                    <input type="text" id="commitMessage" required 
                           placeholder="Update from Spaces"
                           value="Update from Spaces">
                </div>
                <div class="modal-actions" style="display: flex; justify-content: center; margin-top: 16px;">
                    <button class="btn-github" onclick="pushChanges(event)" style="width: 200px;">
                        <i class="fas fa-upload"></i> Push Changes
                    </button>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Failed to fetch repo info:', error);
        showToast('error', 'Failed to load repository information');
    }
}

let isSubmitting = false;

function setButtonLoading(button, isLoading, loadingText = 'Loading...', originalHtml = '') {
    if (!button) return;
    
    if (isLoading) {
        button.disabled = true;
        button.classList.add('btn-loading');
        button.setAttribute('data-original-html', button.innerHTML);
        button.innerHTML = `<span>${loadingText}</span>`;
    } else {
        button.disabled = false;
        button.classList.remove('btn-loading');
        button.innerHTML = originalHtml || button.getAttribute('data-original-html');
        button.removeAttribute('data-original-html');
    }
}

async function createRepository(event) {
    event.preventDefault();

    if (isSubmitting) return;

    const button = event.target.closest('button') || event.target;
    const repoName = document.getElementById('repoName').value;
    const description = document.getElementById('repoDescription').value;
    const isPrivate = document.getElementById('privateRepo').checked;

    if (!repoName) {
        showToast('error', 'Please enter a repository name');
        return;
    }

    const pathParts = window.location.pathname.split('/');
    const siteId = pathParts[pathParts.indexOf('edit') + 1];

    if (!siteId) {
        showToast('error', 'Could not determine site ID');
        return;
    }

    isSubmitting = true;
    setButtonLoading(button, true, 'Creating Repository...');

    const modalButtons = document.querySelectorAll('#githubModal button');
    modalButtons.forEach(btn => btn.disabled = true);

    try {
        const response = await fetch(`/api/github/create-repo?site_id=${siteId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: repoName,
                description: description,
                private: isPrivate
            })
        });

        if (response.ok) {
            showToast('success', 'Repository created successfully');
            showPushChanges();
        } else {
            const error = await response.json();
            showToast('error', error.message || 'Failed to create repository');
        }
    } catch (error) {
        console.error('Create repository error:', error);
        showToast('error', 'Failed to create repository');
    } finally {
        isSubmitting = false;
        setButtonLoading(button, false);
        modalButtons.forEach(btn => btn.disabled = false);
    }
}

async function pushChanges(event) {
    event.preventDefault();

    if (isSubmitting) return;

    const pathParts = window.location.pathname.split('/');
    const siteId = pathParts[pathParts.indexOf('edit') + 1];

    if (!siteId) {
        showToast('error', 'Could not determine site ID');
        return;
    }

    const button = event.target.closest('button') || event.target;
    const commitMessage = document.getElementById('commitMessage').value;

    if (!commitMessage) {
        showToast('error', 'Please enter a commit message');
        return;
    }

    isSubmitting = true;
    setButtonLoading(button, true, 'Pushing Changes...');

    const modalButtons = document.querySelectorAll('#githubModal button');
    modalButtons.forEach(btn => btn.disabled = true);

    try {
        if (window.location.pathname.includes('/python/')) {
            if (typeof editor !== 'undefined' && editor) {
                const content = editor.getValue();
                await fetch('/api/save-python', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
            }
        } else {
            if (typeof webEditor !== 'undefined' && webEditor) {
                const content = webEditor.getValue();
                await fetch('/api/save-html', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
            }
        }

        const response = await fetch(`/api/github/push?site_id=${siteId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: commitMessage,
                preserveReadme: true
            })
        });

        if (response.ok) {
            const data = await response.json();
            showToast('success', 'Changes pushed to GitHub! 🚀');
            closeGitHubModal();
        } else {
            const error = await response.json();
            showToast('error', error.message || 'Failed to push changes');
        }
    } catch (error) {
        console.error('Push error:', error);
        showToast('error', 'Failed to push changes');
    } finally {
        isSubmitting = false;
        setButtonLoading(button, false);
        modalButtons.forEach(btn => btn.disabled = false);
    }
}

async function deleteRepo() {
    event.preventDefault();
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this repository? This action cannot be undone.')) {
        return;
    }

    if (isSubmitting) return;

    const button = event.target.closest('button') || document.querySelector('#githubModal .btn-danger-delete');
    if (!button) return;
    
    isSubmitting = true;
    setButtonLoading(button, true, 'Deleting...');

    const pathParts = window.location.pathname.split('/');
    const siteId = pathParts[pathParts.indexOf('edit') + 1] || pathParts[pathParts.indexOf('python') + 1];

    if (!siteId) {
        showToast('error', 'Could not determine site ID');
        return;
    }

    const modalButtons = document.querySelectorAll('#githubModal button');
    modalButtons.forEach(btn => btn.disabled = true);

    try {
        const response = await fetch(`/api/github/delete-repo?site_id=${siteId}`, {
            method: 'POST'
        });

        if (response.ok) {
            showToast('success', 'Repository deleted successfully');
            closeGitHubModal();
            window.location.reload();
        } else {
            const error = await response.json();
            showToast('error', error.message || 'Failed to delete repository');
            isSubmitting = false;
            setButtonLoading(button, false);
            modalButtons.forEach(btn => btn.disabled = false);
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('error', 'Failed to delete repository');
        isSubmitting = false;
        setButtonLoading(button, false);
        modalButtons.forEach(btn => btn.disabled = false);
    }
}

async function disconnectRepo() {
    event.preventDefault();
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to disconnect this repository? This will not delete the repository from GitHub.')) {
        return;
    }

    if (isSubmitting) return;

    const button = event.target.closest('button') || document.querySelector('#githubModal .btn-danger');
    if (!button) return;
    
    isSubmitting = true;
    setButtonLoading(button, true, 'Disconnecting...');

    const pathParts = window.location.pathname.split('/');
    const siteId = pathParts[pathParts.indexOf('edit') + 1] || pathParts[pathParts.indexOf('python') + 1];

    if (!siteId) {
        showToast('error', 'Could not determine site ID');
        return;
    }

    const modalButtons = document.querySelectorAll('#githubModal button');
    modalButtons.forEach(btn => btn.disabled = true);

    try {
        const response = await fetch(`/api/github/disconnect-repo?site_id=${siteId}`, {
            method: 'POST'
        });

        if (response.ok) {
            showToast('success', 'Repository disconnected');
            closeGitHubModal();
            window.location.reload();
        } else {
            const error = await response.json();
            showToast('error', error.message || 'Failed to disconnect repository');
            isSubmitting = false;
            setButtonLoading(button, false);
            modalButtons.forEach(btn => btn.disabled = false);
        }
    } catch (error) {
        console.error('Disconnect error:', error);
        showToast('error', 'Failed to disconnect repository');
        isSubmitting = false;
        setButtonLoading(button, false);
        modalButtons.forEach(btn => btn.disabled = false);
    }
}