
let terminal;
let socket;
let fitAddon;

function initBashTerminal() {
    // Load the fit addon
    Terminal.applyAddon(fit);
    
    // Create terminal
    terminal = new Terminal({
        cursorBlink: true,
        theme: {
            background: '#1e1e1e',
            foreground: '#f0f0f0',
            cursor: '#ffffff',
            black: '#000000',
            red: '#e06c75',
            green: '#98c379',
            yellow: '#e5c07b',
            blue: '#61afef',
            magenta: '#c678dd',
            cyan: '#56b6c2',
            white: '#abb2bf',
            brightBlack: '#5c6370',
            brightRed: '#e06c75',
            brightGreen: '#98c379',
            brightYellow: '#e5c07b',
            brightBlue: '#61afef',
            brightMagenta: '#c678dd',
            brightCyan: '#56b6c2',
            brightWhite: '#ffffff'
        },
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 14,
        lineHeight: 1.2,
        scrollback: 5000
    });
    
    // Apply fit addon
    fitAddon = new Terminal.FitAddon();
    terminal.loadAddon(fitAddon);
    
    // Open terminal
    terminal.open(document.getElementById('terminal-container'));
    fitAddon.fit();
    
    // Connect to WebSocket
    connectWebSocket();
    
    // Terminal resize handler
    window.addEventListener('resize', () => {
        if (fitAddon) {
            fitAddon.fit();
            sendTerminalSize();
        }
    });
    
    // Terminal input handler
    terminal.onData(data => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'input',
                data: data
            }));
        }
    });
}

function connectWebSocket() {
    const siteId = document.getElementById('site-id').value;
    
    // Get the correct WebSocket protocol based on page protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/bash/${siteId}/terminal`;
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        terminal.writeln('\r\n\x1b[32m=== Connected to Bash Space ===\x1b[0m\r\n');
        sendTerminalSize();
    };
    
    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'output') {
                terminal.write(data.data);
            } else if (data.type === 'error') {
                terminal.writeln(`\r\n\x1b[31mError: ${data.message}\x1b[0m\r\n`);
            }
        } catch (e) {
            // If not JSON, assume it's raw output
            terminal.write(event.data);
        }
    };
    
    socket.onclose = () => {
        terminal.writeln('\r\n\x1b[31m=== Connection closed ===\x1b[0m');
        terminal.writeln('\x1b[33mReconnecting in 3 seconds...\x1b[0m');
        
        setTimeout(() => {
            connectWebSocket();
        }, 3000);
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        terminal.writeln('\r\n\x1b[31m=== WebSocket error ===\x1b[0m');
    };
}

function sendTerminalSize() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'resize',
            rows: terminal.rows,
            cols: terminal.cols
        }));
    }
}

function sendCommand(command) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'input',
            data: command + '\n'
        }));
    }
}
// Bash editor functionality
let term;
let currentSiteId;
let selectedFilePath = null;
let fileExplorerVisible = false;

document.addEventListener('DOMContentLoaded', function() {
    currentSiteId = document.getElementById('site-id').value;
    initTerminal();
    loadFileTree();
    
    // Set up event listeners
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
});

function initTerminal() {
    // Initialize xterm.js terminal
    term = new Terminal({
        cursorBlink: true,
        theme: {
            background: '#1e1e1e',
            foreground: '#f0f0f0'
        },
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        rows: 30
    });
    
    term.open(document.getElementById('terminal-container'));
    term.writeln('Debian QEMU Terminal');
    term.writeln('Type commands to interact with the system');
    term.writeln('');
    term.write('$ ');
    
    // Set up terminal input handling
    term.onKey(e => {
        const ev = e.domEvent;
        const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey;
        
        if (ev.keyCode === 13) { // Enter
            term.write('\r\n');
            // Process command would be here
            term.write('$ ');
        } else if (ev.keyCode === 8) { // Backspace
            // Do not delete the prompt
            if (term._core.buffer.x > 2) {
                term.write('\b \b');
            }
        } else if (printable) {
            term.write(e.key);
        }
    });
    
    // Make terminal responsive
    window.addEventListener('resize', function() {
        updateTerminalSize();
    });
    
    setTimeout(updateTerminalSize, 100);
}

function updateTerminalSize() {
    const container = document.getElementById('terminal-container');
    const dimensions = {
        cols: Math.floor(container.clientWidth / 9), // Approximate char width
        rows: Math.floor(container.clientHeight / 20) // Approximate char height
    };
    
    if (term && dimensions.cols > 0 && dimensions.rows > 0) {
        term.resize(dimensions.cols, dimensions.rows);
    }
}

function toggleFileExplorer() {
    const fileExplorer = document.getElementById('fileExplorer');
    fileExplorerVisible = !fileExplorerVisible;
    
    if (fileExplorerVisible) {
        fileExplorer.classList.add('show');
    } else {
        fileExplorer.classList.remove('show');
    }
    
    // Adjust terminal size after transition
    setTimeout(updateTerminalSize, 300);
}

function loadFileTree() {
    fetch(`/api/bash/${currentSiteId}/files`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderFileTree(data.files);
            } else {
                console.error('Failed to load file tree:', data.message);
            }
        })
        .catch(error => {
            console.error('Error loading file tree:', error);
        });
}

function renderFileTree(files) {
    const fileTreeList = document.getElementById('fileTreeList');
    fileTreeList.innerHTML = '';
    
    // Sort files (directories first, then alphabetically)
    const sortedFiles = files.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
    });
    
    // Add root directory
    const rootLi = document.createElement('li');
    rootLi.className = 'folder-item';
    rootLi.innerHTML = '<i class="fas fa-folder-open"></i> /';
    rootLi.addEventListener('click', () => {
        // Handle root directory click
    });
    fileTreeList.appendChild(rootLi);
    
    // Create a hierarchical structure
    const fileSystem = {};
    
    // Group files by directory
    sortedFiles.forEach(file => {
        const parts = file.path.split('/').filter(part => part);
        let current = fileSystem;
        
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
        }
        
        if (file.type === 'directory') {
            const dirName = parts[parts.length - 1];
            if (!current[dirName]) {
                current[dirName] = {};
            }
        } else {
            const fileName = parts[parts.length - 1];
            current[fileName] = file;
        }
    });
    
    // Render hierarchical tree starting with root level files
    renderDirectory(fileTreeList, fileSystem, '/');
}

function renderDirectory(parentElement, directory, path) {
    for (const [name, item] of Object.entries(directory)) {
        const li = document.createElement('li');
        const fullPath = path === '/' ? `/${name}` : `${path}/${name}`;
        
        if (typeof item === 'object' && !item.path) {
            // This is a directory
            li.className = 'folder-item';
            li.innerHTML = `<i class="fas fa-folder"></i> ${name}`;
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleDirectory(li, fullPath);
            });
            
            // Create a nested ul for subdirectories/files
            const ul = document.createElement('ul');
            ul.className = 'file-tree-list nested';
            ul.style.display = 'none';
            li.appendChild(ul);
            
            // Recursively render contents
            renderDirectory(ul, item, fullPath);
        } else {
            // This is a file
            li.className = 'file-item';
            li.innerHTML = `<i class="fas fa-file-code"></i> ${name}`;
            li.addEventListener('click', () => openFile(fullPath));
        }
        
        parentElement.appendChild(li);
    }
}

function toggleDirectory(dirElement, path) {
    const icon = dirElement.querySelector('i');
    const sublist = dirElement.querySelector('ul');
    
    if (sublist.style.display === 'none') {
        sublist.style.display = 'block';
        icon.className = 'fas fa-folder-open';
    } else {
        sublist.style.display = 'none';
        icon.className = 'fas fa-folder';
    }
}

function openFile(path) {
    selectedFilePath = path;
    fetch(`/api/bash/${currentSiteId}/file/${path}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('fileEditTitle').textContent = `Edit ${path}`;
                document.getElementById('fileEditContent').value = data.content;
                openFileEditModal();
            } else {
                console.error('Failed to open file:', data.message);
            }
        })
        .catch(error => {
            console.error('Error opening file:', error);
        });
}

function openFileEditModal() {
    const modal = document.getElementById('fileEditModal');
    modal.style.display = 'flex';
}

function closeFileEditModal() {
    const modal = document.getElementById('fileEditModal');
    modal.style.display = 'none';
    selectedFilePath = null;
}

function saveFile() {
    if (!selectedFilePath) return;
    
    const content = document.getElementById('fileEditContent').value;
    
    fetch(`/api/bash/${currentSiteId}/file/${selectedFilePath}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeFileEditModal();
                term.writeln(`\r\nFile ${selectedFilePath} saved\r\n$ `);
            } else {
                console.error('Failed to save file:', data.message);
            }
        })
        .catch(error => {
            console.error('Error saving file:', error);
        });
}

function createNewFile() {
    document.getElementById('newFilePath').value = '/home/user/newfile.sh';
    document.getElementById('newFileContent').value = '#!/bin/bash\n# New bash script';
    document.getElementById('newFileModal').style.display = 'flex';
}

function closeNewFileModal() {
    document.getElementById('newFileModal').style.display = 'none';
}

function createFile() {
    const path = document.getElementById('newFilePath').value;
    const content = document.getElementById('newFileContent').value;
    
    fetch(`/api/bash/${currentSiteId}/file`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path, content })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeNewFileModal();
                loadFileTree();
                term.writeln(`\r\nFile ${path} created\r\n$ `);
            } else {
                console.error('Failed to create file:', data.message);
            }
        })
        .catch(error => {
            console.error('Error creating file:', error);
        });
}

function createNewFolder() {
    document.getElementById('newFolderPath').value = '/home/user/newfolder';
    document.getElementById('newFolderModal').style.display = 'flex';
}

function closeNewFolderModal() {
    document.getElementById('newFolderModal').style.display = 'none';
}

function createFolder() {
    const path = document.getElementById('newFolderPath').value;
    
    fetch(`/api/bash/${currentSiteId}/folder`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeNewFolderModal();
                loadFileTree();
                term.writeln(`\r\nFolder ${path} created\r\n$ `);
            } else {
                console.error('Failed to create folder:', data.message);
            }
        })
        .catch(error => {
            console.error('Error creating folder:', error);
        });
}

function closeAllModals() {
    document.getElementById('fileEditModal').style.display = 'none';
    document.getElementById('newFileModal').style.display = 'none';
    document.getElementById('newFolderModal').style.display = 'none';
    selectedFilePath = null;
}

function restartBashInstance() {
    term.writeln('\r\nRestarting bash instance...\r\n');
    
    fetch(`/api/bash/${currentSiteId}/restart`, {
        method: 'POST'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                term.clear();
                term.writeln('Bash instance restarted successfully');
                term.writeln('');
                term.write('$ ');
            } else {
                term.writeln(`\r\nError: ${data.message}\r\n$ `);
            }
        })
        .catch(error => {
            console.error('Error restarting bash instance:', error);
            term.writeln(`\r\nError: Failed to restart bash instance\r\n$ `);
        });
}
