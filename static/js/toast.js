
/**
 * Displays a toast notification
 * 
 * @param {string} type - Type of toast: 'success', 'error', 'warning', or 'info'
 * @param {string} message - The message to display
 * @param {number} duration - Optional duration in milliseconds (default: 3000)
 */
function showToast(type, message, duration = 3000) {
    // Make sure a toast container exists
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    // Create the toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Determine the icon based on toast type
    const icon = type === 'success' ? 'check-circle' : 
                 type === 'error' ? 'exclamation-circle' :
                 type === 'warning' ? 'exclamation-triangle' : 'info-circle';

    // Set the toast content
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        </div>
    `;

    // Add the toast to the container
    toastContainer.appendChild(toast);

    // Force reflow to ensure transitions work properly
    toast.offsetHeight;

    // Show the toast
    toast.classList.add('show');

    // Automatically remove after the specified duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Make showToast available globally
window.showToast = showToast;
