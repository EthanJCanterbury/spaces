
// Mobile detection script
document.addEventListener('DOMContentLoaded', function() {
    function isMobileDevice() {
        return (window.innerWidth <= 768) || 
               (navigator.userAgent.match(/Android/i) ||
                navigator.userAgent.match(/webOS/i) ||
                navigator.userAgent.match(/iPhone/i) ||
                navigator.userAgent.match(/iPad/i) ||
                navigator.userAgent.match(/iPod/i) ||
                navigator.userAgent.match(/BlackBerry/i) ||
                navigator.userAgent.match(/Windows Phone/i));
    }
    
    function showMobileWarning() {
        const modal = document.getElementById('mobileWarningModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }
    
    function dismissMobileWarning() {
        const modal = document.getElementById('mobileWarningModal');
        if (modal) {
            modal.style.display = 'none';
            
            // Set a cookie to remember user's choice
            document.cookie = "dismissedMobileWarning=true; path=/; max-age=86400"; // 24 hours
        }
    }
    
    // Check if warning was already dismissed
    function hasWarningBeenDismissed() {
        return document.cookie.split(';').some(cookie => {
            return cookie.trim().startsWith('dismissedMobileWarning=');
        });
    }
    
    // Attach event listener to continue button
    const continueBtn = document.getElementById('continueMobileBtn');
    if (continueBtn) {
        continueBtn.addEventListener('click', dismissMobileWarning);
    }
    
    // Show warning if on mobile and not dismissed
    if (isMobileDevice() && !hasWarningBeenDismissed()) {
        showMobileWarning();
    }
});
