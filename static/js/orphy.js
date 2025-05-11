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

    if (role === 'assistant') {
        let htmlContent = message
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/```(.*?)\n([\s\S]*?)```/g, '<pre><code class="$1">$2</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');

        messageDiv.innerHTML = `<div class="orphy-message-content">${htmlContent}</div>`;
    } else {
        messageDiv.innerHTML = `<div class="orphy-message-content">${message}</div>`;
    }

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
    thinkingDiv.innerHTML = `
        <div class="orphy-message-content">
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;
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