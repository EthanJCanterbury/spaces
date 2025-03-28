let editor;
let currentFile = 'index.html';
let files = {
    'index.html': null,
    'styles.css': null,
    'script.js': null
};

const fileExtToMode = {
    'html': 'html',
    'css': 'css',
    'js': 'javascript'
};

document.addEventListener('DOMContentLoaded', async function() {
    editor = CodeMirror.fromTextArea(document.getElementById('code'), {
        mode: 'html',
        theme: 'ayu-dark',
        lineNumbers: true,
        autoCloseTags: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: true,
        extraKeys: {
            'Ctrl-Space': 'autocomplete',
        },
        extraKeys: {
            'Ctrl-S': saveCurrentFile,
            'Cmd-S': saveCurrentFile,
            'Tab': function(cm) {
                if (cm.somethingSelected()) {
                    cm.indentSelection('add');
                } else {
                    const cursor = cm.getCursor();
                    const line = cm.getLine(cursor.line);
                    const textBeforeCursor = line.slice(0, cursor.ch);
                    
                    if (!textBeforeCursor.trim()) {
                        cm.replaceSelection('    ', 'end');
                    } else {
                        CodeMirror.commands.autocomplete(cm);
                    }
                }
            }
        }
    });

    await Promise.all([
        loadFile('index.html'),
        loadFile('styles.css'),
        loadFile('script.js')
    ]);

    const fileButtons = document.querySelectorAll('.file-tab');
    fileButtons.forEach(btn => {
        btn.addEventListener('click', () => switchFile(btn.dataset.filename));
    });

    switchFile('index.html');

    editor.on('change', debounce(updatePreview, 1000));

    document.getElementById('deploy-btn').addEventListener('click', deploySite);

    updatePreview();
    
    editor.on('inputRead', function(cm, change) {
        if (change.origin !== 'complete' && change.text[0] !== ' ' && change.text[0] !== '\t') {
            CodeMirror.commands.autocomplete(cm, null, {completeSingle: false});
        }
    });
});

async function loadFile(filename) {
    const siteId = document.getElementById('site-id').value;
    try {
        const response = await fetch(`/api/sites/${siteId}/files/${filename}`);
        if (!response.ok) throw new Error(`Failed to load ${filename}`);
        const data = await response.json();
        files[filename] = data.content;
    } catch (error) {
        console.error(`Error loading ${filename}:`, error);
        showNotification(`Error loading ${filename}`, 'error');
    }
}

function switchFile(filename) {
    files[currentFile] = editor.getValue();

    const ext = filename.split('.').pop();
    editor.setOption('mode', fileExtToMode[ext]);

    currentFile = filename;
    editor.setValue(files[filename] || '');

    document.querySelectorAll('.file-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filename === filename);
    });
}

async function saveCurrentFile() {
    const siteId = document.getElementById('site-id').value;
    const content = editor.getValue();
    files[currentFile] = content;

    try {
        const response = await fetch(`/api/sites/${siteId}/files/${currentFile}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content })
        });

        if (!response.ok) throw new Error(`Failed to save ${currentFile}`);
        showNotification(`${currentFile} saved successfully`, 'success');
    } catch (error) {
        console.error(`Error saving ${currentFile}:`, error);
        showNotification(`Error saving ${currentFile}`, 'error');
    }
}

function updatePreview() {
    const previewFrame = document.getElementById('preview-frame');
    if (!previewFrame) return;

    const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>${files['styles.css']}</style>
        </head>
        <body>
            ${files['index.html']}
            <script>${files['script.js']}</script>
        </body>
        </html>
    `);
    doc.close();
}

async function deploySite() {
    const siteId = document.getElementById('site-id').value;
    
    await saveCurrentFile();

    try {
        const response = await fetch(`/api/sites/${siteId}/deploy`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to deploy site');
        
        const data = await response.json();
        // Call the showDeployModal function from editor.html
        if (typeof window.showDeployModal === 'function') {
            window.showDeployModal();
        } else {
            // Fallback to the local implementation if the function doesn't exist
            showDeployModal(data.url);
        }
    } catch (error) {
        console.error('Error deploying site:', error);
        showNotification('Error deploying site', 'error');
    }
}

function showDeployModal(siteUrl) {
    const modal = document.createElement('div');
    modal.className = 'modal show-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Site Deployed Successfully!</h2>
            <p>Your site is now live at:</p>
            <div class="site-url">
                <input type="text" value="${siteUrl}" readonly>
                <button onclick="navigator.clipboard.writeText('${siteUrl}')">Copy</button>
            </div>
            <div class="modal-buttons">
                <a href="${siteUrl}" target="_blank" class="btn primary">View Site</a>
                <button onclick="this.closest('.modal').remove()" class="btn">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Orphy AI Assistant
let orphy = {
    isVisible: false,
    isFetching: false,
    messages: [
        {
            role: "system",
            content: "You are Orphy, a coding assistant created by Hack Club. Your goal is to help users understand code better, not to give them complete solutions. Use emojis occasionally to make your responses friendly. Be concise but helpful."
        }
    ],
    
    init() {
        // Create Orphy UI if it doesn't exist
        if (!document.getElementById('orphy-container')) {
            this.createUI();
        }
        
        document.getElementById('formatterBtn').disabled = false;
        document.getElementById('formatterBtn').style.opacity = '1';
        document.getElementById('formatterBtn').style.cursor = 'pointer';
        document.getElementById('formatterBtn').addEventListener('click', () => this.toggle());
    },
    
    createUI() {
        const container = document.createElement('div');
        container.id = 'orphy-container';
        container.className = 'orphy-container';
        container.style.display = 'none';
        
        container.innerHTML = `
            <div class="orphy-header">
                <div class="orphy-title">
                    <i class="fas fa-robot"></i> Orphy AI
                </div>
                <div class="orphy-actions">
                    <button class="orphy-minimize-btn" title="Minimize">
                        <i class="fas fa-minus"></i>
                    </button>
                    <button class="orphy-close-btn" title="Close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="orphy-chat">
                <div class="orphy-messages"></div>
            </div>
            <div class="orphy-input">
                <textarea placeholder="Ask Orphy something about your code..."></textarea>
                <button class="orphy-send-btn" title="Send">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(container);
        
        // Make Orphy draggable
        this.makeDraggable(container);
        
        // Add event listeners
        container.querySelector('.orphy-close-btn').addEventListener('click', () => this.hide());
        container.querySelector('.orphy-minimize-btn').addEventListener('click', () => this.minimize());
        container.querySelector('.orphy-send-btn').addEventListener('click', () => this.sendMessage());
        container.querySelector('textarea').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Add welcome message
        this.addMessage('assistant', 'Hi there! I\'m Orphy, your coding assistant 🚀 Ask me anything about your code, and I\'ll try to help you understand it better!');
    },
    
    makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        element.querySelector('.orphy-header').addEventListener('mousedown', dragMouseDown);
        
        function dragMouseDown(e) {
            e.preventDefault();
            // Get mouse position at startup
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.addEventListener('mouseup', closeDragElement);
            document.addEventListener('mousemove', elementDrag);
        }
        
        function elementDrag(e) {
            e.preventDefault();
            // Calculate new position
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            // Set element's new position
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }
        
        function closeDragElement() {
            document.removeEventListener('mouseup', closeDragElement);
            document.removeEventListener('mousemove', elementDrag);
        }
    },
    
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    },
    
    show() {
        const container = document.getElementById('orphy-container');
        container.style.display = 'flex';
        this.isVisible = true;
        
        // Position in center-right if not already positioned
        if (!container.style.top) {
            container.style.top = '100px';
            container.style.right = '20px';
        }
    },
    
    hide() {
        document.getElementById('orphy-container').style.display = 'none';
        this.isVisible = false;
    },
    
    minimize() {
        const container = document.getElementById('orphy-container');
        const chat = container.querySelector('.orphy-chat');
        const input = container.querySelector('.orphy-input');
        
        if (chat.style.display === 'none') {
            chat.style.display = 'block';
            input.style.display = 'flex';
            container.style.height = '';
        } else {
            chat.style.display = 'none';
            input.style.display = 'none';
            container.style.height = 'auto';
        }
    },
    
    addMessage(role, content) {
        const messagesContainer = document.querySelector('.orphy-messages');
        const messageElement = document.createElement('div');
        messageElement.className = `orphy-message orphy-${role}`;
        
        // Convert links to anchors and preserve newlines
        const formattedContent = content
            .replace(/https?:\/\/\S+/g, url => `<a href="${url}" target="_blank">${url}</a>`)
            .replace(/\n/g, '<br>');
            
        messageElement.innerHTML = `<div class="orphy-message-content">${formattedContent}</div>`;
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        if (role !== 'thinking') {
            this.messages.push({ role, content });
        }
    },
    
    async sendMessage() {
        const textarea = document.querySelector('#orphy-container textarea');
        const userMessage = textarea.value.trim();
        
        if (!userMessage || this.isFetching) return;
        
        textarea.value = '';
        this.addMessage('user', userMessage);
        this.addMessage('thinking', 'Thinking... 🤔');
        this.isFetching = true;
        
        // Get current code to provide context
        const currentCode = editor.getValue();
        const fileName = currentFile;
        const userQuery = `File: ${fileName}\n\nCode:\n${currentCode}\n\nQuestion: ${userMessage}`;
        
        // Prepare messages for API
        const apiMessages = [
            ...this.messages.filter(m => m.role !== 'thinking'),
            { role: 'user', content: userQuery }
        ];
        
        try {
            const response = await fetch('https://ai.hackclub.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: apiMessages })
            });
            
            if (!response.ok) {
                throw new Error(`Error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Remove thinking message
            document.querySelector('.orphy-thinking').remove();
            
            // Add response
            if (data.choices && data.choices.length > 0) {
                const responseContent = data.choices[0].message.content;
                this.addMessage('assistant', responseContent);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error querying Orphy:', error);
            document.querySelector('.orphy-thinking').remove();
            this.addMessage('assistant', 'Sorry, I encountered an error. Please try again later. 😓');
        } finally {
            this.isFetching = false;
        }
    }
};

// Initialize Orphy when document is loaded
document.addEventListener('DOMContentLoaded', function() {
    orphy.init();
});
