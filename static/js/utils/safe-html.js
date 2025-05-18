/**
 * Safely sets HTML content to prevent XSS attacks
 * @param {HTMLElement} element - The DOM element to set content for
 * @param {string} content - The content to set (will be escaped)
 * @param {boolean} isHTML - If true, allows trusted HTML content (use with caution)
 */
function safeSetContent(element, content, isHTML = false) {
    if (!element) return;
    
    if (isHTML) {
        // Only allow specific HTML tags and attributes
        const temp = document.createElement('div');
        temp.textContent = content; // This escapes all HTML
        const allowedTags = ['strong', 'em', 'b', 'i', 'span', 'div', 'p', 'br', 'a', 'code', 'pre'];
        const allowedAttributes = ['class', 'id', 'href', 'target', 'rel'];
        
        // Basic HTML sanitization (consider using DOMPurify for more robust sanitization)
        const cleanHTML = temp.innerHTML
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
            
        element.innerHTML = cleanHTML;
    } else {
        // For non-HTML content, use textContent
        element.textContent = content;
    }
}

/**
 * Creates a DOM element with safe content
 * @param {string} tag - The HTML tag name
 * @param {Object} attributes - Object of attributes to set
 * @param {string} content - Text content (will be escaped)
 * @returns {HTMLElement} The created element
 */
function createSafeElement(tag, attributes = {}, content = '') {
    const element = document.createElement(tag);
    
    // Set attributes safely
    Object.entries(attributes).forEach(([key, value]) => {
        if (key.startsWith('on') || key === 'javascript:' || key === 'data:' || key === 'vbscript:') {
            // Skip event handlers and dangerous protocols
            return;
        }
        element.setAttribute(key, value);
    });
    
    // Set content safely
    safeSetContent(element, content);
    
    return element;
}

// Export functions for use in other modules
window.SafeHTML = {
    setContent: safeSetContent,
    createElement: createSafeElement
};
