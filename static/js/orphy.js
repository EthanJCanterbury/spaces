let isThinking = false;

document.addEventListener('DOMContentLoaded', function() {
    displayOrphyMessage('assistant', "👋 Hi there! I'm Orphy, your coding assistant. Ask me anything about your code or for suggestions to improve it!");

    const orphyInput = document.getElementById('orphyInput');
    if (orphyInput) {
        orphyInput.addEventListener('input', function() {
            resizeTextarea(this);
        });

        orphyInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendOrphyMessage();
            }
        });

        resizeTextarea(orphyInput);
    }

    makeOrphyDraggable();

    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'O') {
            e.preventDefault();
            openOrphyChat();
        }
    });
});

function openOrphyChat() {
    const orphyWidget = document.getElementById('orphy-widget');
    if (!orphyWidget) return;

    orphyWidget.classList.add('active');

    const orphyInput = document.getElementById('orphyInput');
    if (orphyInput) orphyInput.focus();

    scrollOrphyToBottom();

    const container = orphyWidget.querySelector('.orphy-container');
    if (!container) return;

    if (!container.style.left || container.style.left === '0px') {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;

        const leftPos = Math.max(20, viewportWidth - containerWidth - 40);
        const topPos = Math.max(20, (viewportHeight - containerHeight) / 2);

        container.style.left = leftPos + 'px';
        container.style.top = topPos + 'px';
    }
}

function closeOrphyChat() {
    const orphyWidget = document.getElementById('orphy-widget');
    if (orphyWidget) orphyWidget.classList.remove('active');
}

let lastOrphyRequest = 0;
const ORPHY_RATE_LIMIT = 500;

function sendOrphyMessage() {
    const orphyInput = document.getElementById('orphyInput');
    if (!orphyInput) return;

    const message = orphyInput.value.trim();
    if (!message || isThinking) return;

    const now = Date.now();
    if (now - lastOrphyRequest < ORPHY_RATE_LIMIT) {
        // Show the warning in the Orphy chat instead
        appendMessage('Please wait a moment before sending another message', 'orphy-assistant');
        return;
    }
    lastOrphyRequest = now;

    displayOrphyMessage('user', message);

    orphyInput.value = '';
    resizeTextarea(orphyInput);

    isThinking = true;
    const thinkingId = showThinkingIndicator();

    const editorContent = editor.getValue();
    const filename = document.querySelector('.topbar-left h1').textContent;
    
    // Fetch documentation content via an AJAX request
    const fetchDocContent = fetch('/documentation')
        .then(response => response.text())
        .then(html => {
            // Extract content from HTML using a simple regex approach
            const docContentMatch = html.match(/<main class="docs-content">([\s\S]*?)<\/main>/);
            return docContentMatch ? docContentMatch[1] : '';
        })
        .catch(error => {
            console.error('Error fetching documentation:', error);
            return '';
        });
    
    // Wait for the documentation content to be fetched
    fetchDocContent.then(docContent => {
        fetch('/api/orphy/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                code: editorContent,
                filename: filename,
                documentation: docContent
            })
        })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        removeThinkingIndicator(thinkingId);
        isThinking = false;

        displayOrphyMessage('assistant', data.response);
        // Assuming showToast takes a message parameter
        // Don't show toast for Orphy messages
    })
    .catch(error => {
        console.error('Error communicating with Orphy:', error);

        removeThinkingIndicator(thinkingId);
        isThinking = false;

        displayOrphyMessage('assistant', `🤔 Hmm, I'm having a bit of trouble right now. Please try again in a moment.`);
        // Show error in the Orphy chat instead
        appendMessage('Error: An error occurred. Please try again later.', 'orphy-assistant');
    })
    .finally(() => {
        scrollOrphyToBottom();
    });
    });
}

function displayOrphyMessage(role, message) {
    const orphyMessages = document.getElementById('orphyMessages');
    if (!orphyMessages) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `orphy-message orphy-${role}`;
    messageDiv.id = `orphy-msg-${Date.now()}`; 

    const contentDiv = document.createElement('div');
    contentDiv.className = 'orphy-message-content';
    
    if (role === 'assistant') {
        // Process markdown-like syntax safely
        let processedMessage = message;
        const fragments = [];
        
        // Process code blocks first (most specific)
        const codeBlockRegex = /```(.*?)\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let match;
        
        while ((match = codeBlockRegex.exec(message)) !== null) {
            // Add text before the match
            if (match.index > lastIndex) {
                fragments.push({ type: 'text', content: message.substring(lastIndex, match.index) });
            }
            
            // Add the code block
            const language = match[1].trim();
            const code = match[2];
            fragments.push({ type: 'code', language, content: code });
            
            lastIndex = match.index + match[0].length;
        }
        
        // Add any remaining text
        if (lastIndex < message.length) {
            fragments.push({ type: 'text', content: message.substring(lastIndex) });
        }
        
        // Process each fragment
        fragments.forEach(fragment => {
            if (fragment.type === 'code') {
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                if (fragment.language) {
                    code.className = `language-${fragment.language}`;
                }
                code.textContent = fragment.content;
                pre.appendChild(code);
                contentDiv.appendChild(pre);
            } else {
                // Process inline formatting
                let text = fragment.content
                    .replace(/\*\*(.*?)\*\*/g, '**$1**')
                    .replace(/\*(.*?)\*/g, '*$1*')
                    .replace(/`([^`]+)`/g, '`$1`');
                
                // Split by line breaks and add <br> elements
                const lines = text.split('\n');
                lines.forEach((line, i) => {
                    if (i > 0) contentDiv.appendChild(document.createElement('br'));
                    
                    // Process inline formatting
                    const parts = line.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
                    parts.forEach(part => {
                        if (!part) return;
                        
                        if (part.startsWith('**') && part.endsWith('**')) {
                            const strong = document.createElement('strong');
                            strong.textContent = part.slice(2, -2);
                            contentDiv.appendChild(strong);
                        } else if (part.startsWith('*') && part.endsWith('*')) {
                            const em = document.createElement('em');
                            em.textContent = part.slice(1, -1);
                            contentDiv.appendChild(em);
                        } else if (part.startsWith('`') && part.endsWith('`')) {
                            const code = document.createElement('code');
                            code.textContent = part.slice(1, -1);
                            contentDiv.appendChild(code);
                        } else {
                            contentDiv.appendChild(document.createTextNode(part));
                        }
                    });
                });
            }
        });
    } else {
        // For user messages, just add text content
        contentDiv.textContent = message;
    }
    
    messageDiv.appendChild(contentDiv);

    orphyMessages.appendChild(messageDiv);

    scrollOrphyToBottom();

    setTimeout(() => {
        scrollOrphyToBottom();
        messageDiv.scrollIntoView({block: 'end', behavior: 'auto'});
    }, 100);
}

function scrollOrphyToBottom() {
    const orphyMessages = document.getElementById('orphyMessages');
    if (!orphyMessages) return;

    const chatContainer = document.querySelector('.orphy-chat');

    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    orphyMessages.scrollTop = orphyMessages.scrollHeight;

    [50, 150, 300].forEach(delay => {
        setTimeout(() => {
            if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
            orphyMessages.scrollTop = orphyMessages.scrollHeight;
        }, delay);
    });
}

function showThinkingIndicator() {
    const orphyMessages = document.getElementById('orphyMessages');
    if (!orphyMessages) return null;

    const id = 'thinking-' + Date.now();
    const thinkingDiv = document.createElement('div');
    thinkingDiv.id = id;
    thinkingDiv.className = 'orphy-message orphy-assistant';
    
    // Create message content
    const messageContent = document.createElement('div');
    messageContent.className = 'orphy-message-content';
    
    // Create typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    
    // Create typing dots
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'typing-dot';
        typingIndicator.appendChild(dot);
    }
    
    // Assemble the thinking indicator
    messageContent.appendChild(typingIndicator);
    thinkingDiv.appendChild(messageContent);
    orphyMessages.appendChild(thinkingDiv);

    setTimeout(() => {
        scrollOrphyToBottom();
    }, 10);

    return id;
}

function removeThinkingIndicator(id) {
    if (!id) return;

    const thinkingElement = document.getElementById(id);
    if (thinkingElement) {
        thinkingElement.remove();

        setTimeout(() => {
            scrollOrphyToBottom();
        }, 10);
    }
}

function resizeTextarea(textarea) {
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

function makeOrphyDraggable() {
    const container = document.querySelector('.orphy-container');
    const header = document.getElementById('orphy-header');

    if (!container || !header) return;

    let pos = { left: 0, top: 0 };
    let offset = { x: 0, y: 0 };

    function setPosition(left, top) {
        pos.left = left;
        pos.top = top;
        container.style.left = pos.left + 'px';
        container.style.top = pos.top + 'px';
    }

    function onMouseDown(e) {
        if (e.target !== header && !header.contains(e.target)) return;

        e.preventDefault();

        const rect = container.getBoundingClientRect();
        offset.x = e.clientX - rect.left;
        offset.y = e.clientY - rect.top;

        container.classList.add('dragging');

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
        e.preventDefault();

        const left = e.clientX - offset.x;
        const top = e.clientY - offset.y;

        const maxLeft = window.innerWidth - container.offsetWidth;
        const maxTop = window.innerHeight - container.offsetHeight;

        setPosition(
            Math.max(0, Math.min(left, maxLeft)),
            Math.max(0, Math.min(top, maxTop))
        );
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        container.classList.remove('dragging');
    }

    header.addEventListener('mousedown', onMouseDown);
}

function showDeployModal() {
    const modal = document.getElementById('deployModal');
    if (modal) {
        modal.style.display = 'flex';
        showToast('success', 'Site deployed successfully');
    }
}