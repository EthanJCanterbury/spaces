
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
