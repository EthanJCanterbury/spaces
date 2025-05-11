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

    // Create toast content
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        </div>
    `;

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