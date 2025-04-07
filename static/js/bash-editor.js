
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
