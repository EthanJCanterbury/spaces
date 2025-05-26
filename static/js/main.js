document.addEventListener('DOMContentLoaded', function() {
    // Add CSRF token to all AJAX requests
    const tokenMeta = document.querySelector('meta[name="csrf-token"]');
    const token = tokenMeta ? tokenMeta.getAttribute('content') : null;

    if (token) {
        // Add CSRF token to all fetch requests
        const originalFetch = window.fetch;
        window.fetch = function(url, options = {}) {
            // Only add headers for same-origin requests
            const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);

            if (sameOrigin) {
                options.headers = options.headers || {};
                options.headers['X-CSRF-Token'] = token;
            }

            return originalFetch(url, options);
        };

        // Add CSRF token to XMLHttpRequest
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function() {
            const result = originalOpen.apply(this, arguments);
            const url = arguments[1];
            const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);

            if (sameOrigin) {
                this.setRequestHeader('X-CSRF-Token', token);
            }

            return result;
        };
    } else {
        console.warn('CSRF token not found. AJAX requests may fail.');
    }
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#') {
            e.preventDefault();
            return;
        }

        e.preventDefault();
        const targetElement = document.querySelector(href);
        if (targetElement) {
            targetElement.scrollIntoView({
                behavior: 'smooth'
            });
        }
    });
});

window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(255, 255, 255, 0.95)';
        navbar.style.backdropFilter = 'blur(12px) saturate(180%)';
        navbar.style.borderBottom = '1px solid rgba(236, 55, 80, 0.1)';
    } else {
        navbar.style.background = 'rgba(255, 255, 255, 0.8)';
        navbar.style.backdropFilter = 'blur(12px) saturate(180%)';
        navbar.style.borderBottom = '1px solid rgba(236, 55, 80, 0.1)';
    }
});

function openNewSiteModal() {
    const modal = document.querySelector('.modal');
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 0);
}

function closeNewSiteModal() {
    const modal = document.querySelector('.modal');
    modal.style.opacity = '0';
    setTimeout(() => {
        modal.style.display = 'none';
    }, 200);
}

async function createNewSite(event) {
    event.preventDefault();
    const siteName = document.getElementById('siteName').value;

    if (!siteName) {
        showToast('warning', 'Please enter a site name');
        return;
    }

    try {
        const response = await fetch('/api/sites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: siteName })
        });

        const data = await response.json();
        if (response.ok) {
            window.location.href = `/edit/${data.site_id}`;
        } else {
            showToast('error', data.message || 'Failed to create website');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('error', 'Failed to create website');
    }
}

function toggleFolder(header) {
    if (!header) return;
    const content = header.nextElementSibling;
    if (content && content.classList.contains('folder-content')) {
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
    }
}

function openFile(element) {
    if (!element) return;
    document.querySelectorAll('.file').forEach(f => f.classList.remove('active'));
    element.classList.add('active');
}

// Handle "Learn More" click safely
function scrollToSection(event, id) {
    if (!id) return;
    const element = document.getElementById(id);
    if (element) {
        event.preventDefault();
        element.scrollIntoView({ behavior: 'smooth' });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    document.body.classList.add('loaded');

    // Safely bind folder headers
    document.querySelectorAll('.folder-header').forEach(header => {
        if (header) {
            header.addEventListener('click', () => toggleFolder(header));
        }
    });

    // Safely bind file clicks
    document.querySelectorAll('.file').forEach(file => {
        if (file) {
            file.addEventListener('click', () => openFile(file));
        }
    });

    // Bind Learn More links
    const learnMoreLinks = document.querySelectorAll('a[href="#features"]');
    learnMoreLinks.forEach(link => {
        if (link) {
            link.addEventListener('click', (e) => scrollToSection(e, 'features'));
        }
    });

    // Hamburger menu toggle - improved with direct event binding
    function setupHamburgerMenu() {
        const hamburger = document.querySelector('.hamburger');
        const navLinks = document.getElementById('navLinks');

        if (!hamburger || !navLinks) return;

        console.log("Hamburger menu setup initialized");

        // Toggle menu when hamburger is clicked
        hamburger.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            navLinks.classList.toggle('active');
            hamburger.classList.toggle('active');
            console.log("Hamburger clicked, menu active:", navLinks.classList.contains('active'));
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(event) {
            if (!navLinks.contains(event.target) && !hamburger.contains(event.target) && navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                hamburger.classList.remove('active');
            }
        });

        // Close menu when clicking on a link
        const navLinkElements = navLinks.querySelectorAll('a');
        navLinkElements.forEach(link => {
            link.addEventListener('click', function() {
                navLinks.classList.remove('active');
                hamburger.classList.remove('active');
            });
        });
    }

    // Call the setup function
    setupHamburgerMenu();
});

// Improved animation observer with faster transition
const observerOptions = {
    threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.feature-card').forEach(card => {
        if (card) {
            card.style.opacity = '0';
            card.style.transform = 'translateY(10px)';
            card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            observer.observe(card);
        }
    });
});

// Unified Toast Notification System
function showToast(type, message, duration = 4000) {
    // Make sure toast container exists
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Select icon based on type
    const icon = type === 'success' ? 'check-circle' : 
                 type === 'error' ? 'exclamation-circle' :
                 type === 'warning' ? 'exclamation-triangle' : 'info-circle';

    // Create toast content using safe DOM methods
    const toastContent = document.createElement('div');
    toastContent.className = 'toast-content';
    
    // Create icon element
    const iconElement = document.createElement('i');
    iconElement.className = `fas fa-${icon}`;
    
    // Create message element safely
    const messageElement = document.createElement('span');
    messageElement.textContent = message;
    
    // Assemble the toast
    toastContent.appendChild(iconElement);
    toastContent.appendChild(document.createTextNode(' '));
    toastContent.appendChild(messageElement);
    toast.appendChild(toastContent);

    // Add to container
    toastContainer.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
}

// For backward compatibility with other toast systems
window.showToast = showToast;

// Function to view club details in admin panel
async function viewClubDetails(clubId) {
    try {
        showToast('info', 'Loading club details...');
        
        const response = await fetch(`/api/admin/clubs/${clubId}`);
        const club = await response.json();
        
        if (!response.ok) {
            throw new Error(club.error || 'Failed to load club details');
        }
        
        // Create or get modal
        let modal = document.getElementById('clubDetailsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'clubDetailsModal';
            modal.className = 'modal club-details-modal';
            document.body.appendChild(modal);
            
            // Add CSS styles if not already added
            if (!document.getElementById('clubDetailsStyles')) {
                const styles = document.createElement('style');
                styles.id = 'clubDetailsStyles';
                styles.textContent = `
                    .club-details-modal .modal-content {
                        max-width: 900px;
                        width: 90vw;
                        max-height: 90vh;
                        overflow-y: auto;
                        border-radius: 12px;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    }
                    
                    .club-details-modal .modal-header {
                        background: linear-gradient(135deg, #ec3750 0%, #d63447 100%);
                        color: white;
                        padding: 20px 30px;
                        border-radius: 12px 12px 0 0;
                        position: relative;
                        overflow: hidden;
                    }
                    
                    .club-details-modal .modal-header::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
                        opacity: 0.3;
                    }
                    
                    .club-details-modal .modal-header h2 {
                        margin: 0;
                        font-size: 1.8rem;
                        font-weight: 600;
                        position: relative;
                        z-index: 1;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }
                    
                    .club-details-modal .modal-header .close {
                        position: relative;
                        z-index: 1;
                        background: rgba(255, 255, 255, 0.2);
                        border-radius: 50%;
                        width: 35px;
                        height: 35px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s ease;
                    }
                    
                    .club-details-modal .modal-header .close:hover {
                        background: rgba(255, 255, 255, 0.3);
                        transform: rotate(90deg);
                    }
                    
                    .club-details-container {
                        padding: 30px;
                        background: #f8f9fa;
                    }
                    
                    .club-info-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 25px;
                        margin-bottom: 30px;
                    }
                    
                    .club-info-card {
                        background: white;
                        border-radius: 10px;
                        padding: 25px;
                        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
                        border: 1px solid #e9ecef;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                    }
                    
                    .club-info-card:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12);
                    }
                    
                    .club-info-card h3 {
                        margin: 0 0 20px 0;
                        color: #2c3e50;
                        font-size: 1.3rem;
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding-bottom: 15px;
                        border-bottom: 2px solid #f1f3f4;
                    }
                    
                    .club-info-card h3 i {
                        color: #ec3750;
                        font-size: 1.2rem;
                    }
                    
                    .club-detail-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px 0;
                        border-bottom: 1px solid #f1f3f4;
                    }
                    
                    .club-detail-item:last-child {
                        border-bottom: none;
                    }
                    
                    .club-detail-label {
                        font-weight: 600;
                        color: #495057;
                        font-size: 0.95rem;
                    }
                    
                    .club-detail-value {
                        color: #2c3e50;
                        font-weight: 500;
                        text-align: right;
                        max-width: 60%;
                        word-break: break-word;
                    }
                    
                    .club-join-code {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white !important;
                        padding: 8px 15px;
                        border-radius: 20px;
                        font-family: 'Courier New', monospace;
                        font-weight: bold;
                        letter-spacing: 1px;
                        box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);
                    }
                    
                    .club-members-section {
                        background: white;
                        border-radius: 10px;
                        padding: 25px;
                        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
                        border: 1px solid #e9ecef;
                        grid-column: 1 / -1;
                    }
                    
                    .club-members-section h3 {
                        margin: 0 0 20px 0;
                        color: #2c3e50;
                        font-size: 1.3rem;
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding-bottom: 15px;
                        border-bottom: 2px solid #f1f3f4;
                    }
                    
                    .club-members-section h3 i {
                        color: #ec3750;
                        font-size: 1.2rem;
                    }
                    
                    .members-table-container {
                        overflow-x: auto;
                        border-radius: 8px;
                        border: 1px solid #e9ecef;
                    }
                    
                    .members-table {
                        width: 100%;
                        border-collapse: collapse;
                        background: white;
                    }
                    
                    .members-table th {
                        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                        color: #495057;
                        font-weight: 600;
                        padding: 15px 12px;
                        text-align: left;
                        border-bottom: 2px solid #dee2e6;
                        font-size: 0.9rem;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .members-table td {
                        padding: 15px 12px;
                        border-bottom: 1px solid #f1f3f4;
                        color: #495057;
                        vertical-align: middle;
                    }
                    
                    .members-table tr:hover {
                        background: #f8f9fa;
                    }
                    
                    .member-role-badge {
                        display: inline-block;
                        padding: 4px 12px;
                        border-radius: 15px;
                        font-size: 0.8rem;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    .role-leader {
                        background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
                        color: #8b7000;
                    }
                    
                    .role-co-leader {
                        background: linear-gradient(135deg, #ff9500 0%, #ffad33 100%);
                        color: #8b5a00;
                    }
                    
                    .role-member {
                        background: linear-gradient(135deg, #28a745 0%, #34ce57 100%);
                        color: #155724;
                    }
                    
                    .no-members-message {
                        text-align: center;
                        padding: 40px 20px;
                        color: #6c757d;
                        font-style: italic;
                    }
                    
                    .club-stats-row {
                        display: flex;
                        gap: 15px;
                        margin-bottom: 25px;
                    }
                    
                    .club-stat-card {
                        flex: 1;
                        background: white;
                        border-radius: 10px;
                        padding: 20px;
                        text-align: center;
                        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
                        border: 1px solid #e9ecef;
                        transition: transform 0.2s ease;
                    }
                    
                    .club-stat-card:hover {
                        transform: translateY(-2px);
                    }
                    
                    .club-stat-number {
                        font-size: 2rem;
                        font-weight: bold;
                        color: #ec3750;
                        margin-bottom: 5px;
                    }
                    
                    .club-stat-label {
                        color: #6c757d;
                        font-size: 0.9rem;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    
                    @media (max-width: 768px) {
                        .club-info-grid {
                            grid-template-columns: 1fr;
                        }
                        
                        .club-stats-row {
                            flex-direction: column;
                        }
                        
                        .club-details-modal .modal-content {
                            width: 95vw;
                            margin: 10px;
                        }
                        
                        .club-details-container {
                            padding: 20px;
                        }
                    }
                `;
                document.head.appendChild(styles);
            }
        }
        
        // Show modal
        modal.style.display = 'flex';
        
        // Format club details
        const memberCount = club.members ? club.members.length : 0;
        const createdDate = new Date(club.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        // Count different roles
        const leaderCount = club.members ? club.members.filter(m => m.role === 'leader' || m.user_id === club.leader_id).length : 0;
        const coLeaderCount = club.members ? club.members.filter(m => m.role === 'co-leader').length : 0;
        const regularMemberCount = memberCount - leaderCount - coLeaderCount;
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-users"></i> ${club.name}</h2>
                    <span class="close" onclick="document.getElementById('clubDetailsModal').style.display='none'">&times;</span>
                </div>
                <div class="club-details-container">
                    <div class="club-stats-row">
                        <div class="club-stat-card">
                            <div class="club-stat-number">${memberCount}</div>
                            <div class="club-stat-label">Total Members</div>
                        </div>
                        <div class="club-stat-card">
                            <div class="club-stat-number">${leaderCount + coLeaderCount}</div>
                            <div class="club-stat-label">Leaders</div>
                        </div>
                        <div class="club-stat-card">
                            <div class="club-stat-number">${Math.floor((Date.now() - new Date(club.created_at)) / (1000 * 60 * 60 * 24))}</div>
                            <div class="club-stat-label">Days Active</div>
                        </div>
                    </div>
                    
                    <div class="club-info-grid">
                        <div class="club-info-card">
                            <h3><i class="fas fa-info-circle"></i> Club Information</h3>
                            <div class="club-detail-item">
                                <span class="club-detail-label">Club ID</span>
                                <span class="club-detail-value">#${club.id}</span>
                            </div>
                            <div class="club-detail-item">
                                <span class="club-detail-label">Description</span>
                                <span class="club-detail-value">${club.description || 'No description provided'}</span>
                            </div>
                            <div class="club-detail-item">
                                <span class="club-detail-label">Location</span>
                                <span class="club-detail-value">${club.location || 'No location specified'}</span>
                            </div>
                            <div class="club-detail-item">
                                <span class="club-detail-label">Join Code</span>
                                <span class="club-detail-value club-join-code">${club.join_code}</span>
                            </div>
                            <div class="club-detail-item">
                                <span class="club-detail-label">Created</span>
                                <span class="club-detail-value">${createdDate}</span>
                            </div>
                        </div>
                        
                        <div class="club-info-card">
                            <h3><i class="fas fa-user-shield"></i> Leadership</h3>
                            <div class="club-detail-item">
                                <span class="club-detail-label">Leader ID</span>
                                <span class="club-detail-value">#${club.leader_id}</span>
                            </div>
                            <div class="club-detail-item">
                                <span class="club-detail-label">Leader Name</span>
                                <span class="club-detail-value">${club.leader_username || 'Unknown'}</span>
                            </div>
                            <div class="club-detail-item">
                                <span class="club-detail-label">Co-Leaders</span>
                                <span class="club-detail-value">${coLeaderCount}</span>
                            </div>
                            <div class="club-detail-item">
                                <span class="club-detail-label">Regular Members</span>
                                <span class="club-detail-value">${regularMemberCount}</span>
                            </div>
                        </div>
                        
                        <div class="club-members-section">
                            <h3><i class="fas fa-users"></i> Club Members</h3>
                            <div class="members-table-container">
                                ${club.members && club.members.length > 0 ? `
                                    <table class="members-table">
                                        <thead>
                                            <tr>
                                                <th>Member</th>
                                                <th>Email</th>
                                                <th>Role</th>
                                                <th>Joined</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${club.members.map(member => {
                                                const roleClass = member.user_id === club.leader_id ? 'role-leader' : 
                                                                member.role === 'co-leader' ? 'role-co-leader' : 'role-member';
                                                const roleText = member.user_id === club.leader_id ? 'Leader' : 
                                                               member.role === 'co-leader' ? 'Co-Leader' : 'Member';
                                                const joinedDate = new Date(member.joined_at).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric'
                                                });
                                                
                                                return `
                                                    <tr>
                                                        <td>
                                                            <div style="display: flex; align-items: center; gap: 10px;">
                                                                <div style="width: 35px; height: 35px; border-radius: 50%; background: linear-gradient(135deg, #ec3750, #d63447); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
                                                                    ${member.username ? member.username.charAt(0).toUpperCase() : 'U'}
                                                                </div>
                                                                <div>
                                                                    <div style="font-weight: 600; color: #2c3e50;">${member.username || 'Unknown'}</div>
                                                                    <div style="font-size: 0.8rem; color: #6c757d;">ID: ${member.user_id}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>${member.email || 'No email'}</td>
                                                        <td><span class="member-role-badge ${roleClass}">${roleText}</span></td>
                                                        <td>${joinedDate}</td>
                                                    </tr>
                                                `;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                ` : `
                                    <div class="no-members-message">
                                        <i class="fas fa-users-slash" style="font-size: 2rem; margin-bottom: 10px; color: #dee2e6;"></i>
                                        <p>No members found in this club</p>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error viewing club details:', error);
        showToast('error', error.message || 'Failed to load club details');
    }
}

// Function to toggle club leader status (Admin Panel)
async function toggleClubLeader(userId, username, isCurrentlyLeader) {
    // Always pass the opposite of the current state to change to that state
    const makeLeader = !isCurrentlyLeader;
    const action = makeLeader ? 'make' : 'remove';
    const confirmation = confirm(`Are you sure you want to ${action} ${username} ${makeLeader ? 'a' : 'as a'} club leader?`);
    if (!confirmation) return;

    try {
        showToast('info', `Processing request...`);

        const response = await fetch(`/api/admin/users/${userId}/club-leader`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ is_club_leader: makeLeader })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('success', data.message || `Successfully ${makeLeader ? 'made' : 'removed'} ${username} ${makeLeader ? 'a' : 'as a'} club leader.`);

            // Force reload to update UI
            setTimeout(() => {
                location.reload();
            }, 1500);
        } else {
            showToast('error', data.message || `Failed to ${action} club leader status.`);
        }
    } catch (error) {
        console.error('Error toggling club leader status:', error);
        showToast('error', `An error occurred while trying to ${action} club leader status.`);
    }
}