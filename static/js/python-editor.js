// Python Editor Core Module
let pythonEditor;
let undoManager = {
    canUndo: false,
    canRedo: false
};

document.addEventListener('DOMContentLoaded', function() {
    initPythonEditor();
    setupEventListeners();
    startLoading();

    // Close loading overlay after short delay
    setTimeout(() => {
        endLoading();
    }, 1000);
});

function startLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';

    // Animate the progress bar
    const progressFill = document.querySelector('.loading-progress-fill');
    progressFill.style.width = '0%';

    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 5;
        progressFill.style.width = `${progress}%`;

        if (progress >= 100) {
            clearInterval(progressInterval);
            setTimeout(() => {
                document.getElementById('loading-overlay').classList.add('fade-out');
                setTimeout(() => {
                    document.getElementById('loading-overlay').style.display = 'none';
                    document.getElementById('loading-overlay').classList.remove('fade-out');
                }, 500);
            }, 200);
        }
    }, 50);

    // Random loading facts
    const facts = [
        "Python was named after Monty Python, not the snake!",
        "Python is one of the official languages at Google.",
        "Python was first released in 1991 by Guido van Rossum.",
        "Python uses indentation for code blocks, not braces.",
        "The Zen of Python has 19 guiding principles.",
        "Python's design philosophy emphasizes code readability.",
        "Python has a built-in package manager called pip.",
        "In Python, functions are first-class objects.",
        "Python supports multiple programming paradigms."
    ];

    const factContainer = document.querySelector('.loading-fact');
    let factIndex = 0;

    factContainer.textContent = facts[factIndex];

    const factInterval = setInterval(() => {
        factIndex = (factIndex + 1) % facts.length;
        factContainer.classList.add('fade-out');

        setTimeout(() => {
            factContainer.textContent = facts[factIndex];
            factContainer.classList.remove('fade-out');
        }, 500);
    }, 3000);

    // Store the interval so we can clear it later
    window.factInterval = factInterval;
}

function endLoading() {
    document.getElementById('loading-overlay').classList.add('fade-out');
    setTimeout(() => {
        document.getElementById('loading-overlay').style.display = 'none';
        document.getElementById('loading-overlay').classList.remove('fade-out');

        // Clear the fact changing interval
        if (window.factInterval) {
            clearInterval(window.factInterval);
        }
    }, 500);
}

function initPythonEditor() {
    const editorElement = document.getElementById('pythonEditor');

    pythonEditor = CodeMirror.fromTextArea(editorElement, {
        mode: 'python',
        theme: 'eclipse',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: true,
        viewportMargin: Infinity,
        foldGutter: true,
        styleActiveLine: true,
        showHint: true,
        hintOptions: {
            completeSingle: false,
            alignWithWord: true,
            closeOnUnfocus: false,
            hint: function(cm) {
                return new Promise(function(resolve) {
                    setTimeout(function() {
                        var cursor = cm.getCursor();
                        var token = cm.getTokenAt(cursor);
                        var hints = CodeMirror.pythonHint(cm) || CodeMirror.hint.anyword(cm, { word: /[\w\.$]+/ });
                        resolve(hints);
                    }, 100);
                });
            }
        },
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Ctrl-S": savePythonContent,
            "Ctrl-Enter": runPythonCode,
            "Shift-Alt-F": formatPythonCode,
            "Ctrl-/": "toggleComment",
            "Tab": function(cm) {
                // Smart tab behavior - indent by 4 spaces
                if (cm.somethingSelected()) {
                    cm.indentSelection("add");
                } else {
                    cm.execCommand("insertSoftTab");
                }
            }
        }
    });

    // Add auto-trigger for Python hints
    pythonEditor.on('keyup', function(cm, event) {
        var cursor = cm.getCursor();
        var line = cm.getLine(cursor.line);
        var prefix = line.slice(0, cursor.ch);
        var key = event.key || String.fromCharCode(event.keyCode);
        
        // Don't trigger on modifier keys, arrows, etc.
        var ignoreKeys = [16, 17, 18, 19, 20, 27, 33, 34, 35, 36, 37, 38, 39, 40, 45, 91, 93, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 144, 145];
        
        // Only show hints if:
        // 1. Autocomplete not already active
        // 2. Not a modifier key
        // 3. Pattern matches trigger characters or we have a minimum prefix length
        if (!cm.state.completionActive && 
            !ignoreKeys.includes(event.keyCode) &&
            (/[a-zA-Z0-9_\.\(\[\{]$/.test(prefix) || 
             (prefix.length >= 2 && /[a-zA-Z0-9_]$/.test(key)))) {
            
            cm.showHint({
                hint: function(cm) {
                    return new Promise(function(resolve) {
                        setTimeout(function() {
                            var cursor = cm.getCursor();
                            var line = cm.getLine(cursor.line);
                            var prefix = line.slice(0, cursor.ch);
                            
                            // Custom hint function that combines Python hints with any-word
                            var result = CodeMirror.hint.anyword(cm, { word: /[\w\.$]+/ });
                            
                            // Add Python-specific suggestions
                            var builtins = ["abs", "all", "any", "ascii", "bin", "bool", "bytearray", 
                                "bytes", "callable", "chr", "classmethod", "compile", "complex", 
                                "delattr", "dict", "dir", "divmod", "enumerate", "eval", "exec", 
                                "filter", "float", "format", "frozenset", "getattr", "globals", 
                                "hasattr", "hash", "help", "hex", "id", "input", "int", "isinstance", 
                                "issubclass", "iter", "len", "list", "locals", "map", "max", "memoryview", 
                                "min", "next", "object", "oct", "open", "ord", "pow", "print", "property", 
                                "range", "repr", "reversed", "round", "set", "setattr", "slice", "sorted", 
                                "staticmethod", "str", "sum", "super", "tuple", "type", "vars", "zip"];
                            
                            if (!result) {
                                result = {
                                    list: [],
                                    from: CodeMirror.Pos(cursor.line, cursor.ch),
                                    to: CodeMirror.Pos(cursor.line, cursor.ch)
                                };
                            }
                            
                            // Add Python keywords
                            if (/^[a-z]/i.test(prefix)) {
                                var keywords = ["and", "as", "assert", "async", "await", "break", 
                                    "class", "continue", "def", "del", "elif", "else", "except", 
                                    "finally", "for", "from", "global", "if", "import", "in", "is", 
                                    "lambda", "nonlocal", "not", "or", "pass", "raise", "return", 
                                    "try", "while", "with", "yield"];
                                
                                // Filter and add keywords
                                var prefix_lower = prefix.toLowerCase();
                                keywords.forEach(function(keyword) {
                                    if (keyword.indexOf(prefix_lower) === 0 && 
                                        result.list.indexOf(keyword) === -1) {
                                        result.list.push(keyword);
                                    }
                                });
                                
                                // Add builtins
                                builtins.forEach(function(builtin) {
                                    if (builtin.indexOf(prefix_lower) === 0 && 
                                        result.list.indexOf(builtin) === -1) {
                                        result.list.push(builtin);
                                    }
                                });
                            }
                            
                            // Sort results
                            result.list.sort();
                            resolve(result);
                        }, 100);
                    });
                },
                completeSingle: false,
                alignWithWord: true,
                closeOnUnfocus: false
            });
        }
    });
    
    // Enhance Tab and other key behaviors
    pythonEditor.setOption('extraKeys', Object.assign(pythonEditor.getOption('extraKeys') || {}, {
        "Ctrl-Space": function(cm) {
            cm.showHint({ 
                completeSingle: false,
                alignWithWord: true,
                closeOnUnfocus: false
            });
        },
        "Ctrl-S": savePythonContent,
        "Ctrl-Enter": runPythonCode,
        "Shift-Alt-F": formatPythonCode,
        "Ctrl-/": "toggleComment",
        "Tab": function(cm) {
            // If autocomplete is active, select the current item
            if (cm.state.completionActive) {
                cm.state.completionActive.pick();
                return;
            }
            // Smart tab behavior - indent by 4 spaces
            if (cm.somethingSelected()) {
                cm.indentSelection("add");
            } else {
                cm.execCommand("insertSoftTab");
            }
        }
    }));

    pythonEditor.on('changes', function() {
        // Update cursor position in status bar
        updateCursorPosition();

        // Update file size
        updateFileSize();

        // Update undo/redo buttons
        updateUndoRedoButtons();
    });

    pythonEditor.on('cursorActivity', function() {
        updateCursorPosition();
    });

    // Initial file size update
    updateFileSize();
}

function updateCursorPosition() {
    const cursor = pythonEditor.getCursor();
    const positionDisplay = document.getElementById('cursorPosition');
    positionDisplay.innerHTML = `<i class="fas fa-map-marker-alt"></i> Line ${cursor.line + 1}, Column ${cursor.ch + 1}`;
}

function updateFileSize() {
    const content = pythonEditor.getValue();
    const size = new Blob([content]).size;
    document.getElementById('fileSize').textContent = size;
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    undoManager.canUndo = pythonEditor.historySize().undo > 0;
    undoManager.canRedo = pythonEditor.historySize().redo > 0;

    undoBtn.disabled = !undoManager.canUndo;
    redoBtn.disabled = !undoManager.canRedo;
}

function setupEventListeners() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    undoBtn.addEventListener('click', function() {
        if (undoManager.canUndo) {
            pythonEditor.undo();
            updateUndoRedoButtons();
        }
    });

    redoBtn.addEventListener('click', function() {
        if (undoManager.canRedo) {
            pythonEditor.redo();
            updateUndoRedoButtons();
        }
    });

    // Save content when Ctrl+S is pressed
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            savePythonContent();
        }
    });
}

function changePythonEditorTheme(theme) {
    pythonEditor.setOption('theme', theme);

    // Save theme preference in local storage
    localStorage.setItem('pythonEditorTheme', theme);
}

function changePythonEditorFontSize(size) {
    document.querySelector('.CodeMirror').style.fontSize = size;

    // Save font size preference in local storage
    localStorage.setItem('pythonEditorFontSize', size);
}

function togglePythonWordWrap(enabled) {
    pythonEditor.setOption('lineWrapping', enabled);

    // Save word wrap preference in local storage
    localStorage.setItem('pythonEditorWordWrap', enabled.toString());
}

function togglePythonIndentWithTabs(enabled) {
    pythonEditor.setOption('indentWithTabs', enabled);

    // Save indent preference in local storage
    localStorage.setItem('pythonEditorIndentWithTabs', enabled.toString());
}

function focusPythonSearch() {
    CodeMirror.commands.find(pythonEditor);
}

function runPythonCode() {
    const siteId = document.getElementById('site-id').value;
    const code = pythonEditor.getValue();
    const outputConsole = document.getElementById('pythonOutput');

    // Show loading indicator in console
    outputConsole.innerHTML = 'Running code...\n';

    fetch(`/api/sites/${siteId}/run`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: code })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            outputConsole.innerHTML = `<span class="console-error">${data.output}</span>`;
        } else {
            outputConsole.innerHTML = data.output;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        outputConsole.innerHTML = `<span class="console-error">Error running code: ${error}</span>`;
    });
}

function formatPythonCode() {
    // Placeholder for code formatting functionality
    // In a real implementation, you might want to connect this to a Python formatter like Black
    showToast('info', 'Formatting code...');

    // Simplified indentation-based formatting
    const code = pythonEditor.getValue();
    const lines = code.split('\n');
    let formattedLines = [];

    // Simple formatting: adjust indentation and spacing around operators
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();

        if (line) {
            // Calculate indentation based on previous line
            let indentLevel = 0;
            if (i > 0) {
                let prevLine = lines[i-1].trim();
                if (prevLine.endsWith(':')) {
                    // Previous line ends with colon, increase indent
                    indentLevel = (lines[i-1].match(/^\s*/)[0].length / 4) + 1;
                } else {
                    // Maintain previous indentation
                    indentLevel = lines[i-1].match(/^\s*/)[0].length / 4;
                }
            }

            // Check for dedentation keywords
            if (line.startsWith('return') || line.startsWith('break') || line.startsWith('continue') || 
                line.startsWith('else:') || line.startsWith('elif') || line.startsWith('except') || 
                line.startsWith('finally:')) {
                indentLevel = Math.max(0, indentLevel - 1);
            }

            // Format line: fix spacing around operators
            line = line
                .replace(/\s*=\s*/g, ' = ')
                .replace(/\s*\+\s*/g, ' + ')
                .replace(/\s*-\s*/g, ' - ')
                .replace(/\s*\*\s*/g, ' * ')
                .replace(/\s*\/\s*/g, ' / ')
                .replace(/\s*==\s*/g, ' == ')
                .replace(/\s*!=\s*/g, ' != ')
                .replace(/\s*>=\s*/g, ' >= ')
                .replace(/\s*<=\s*/g, ' <= ')
                .replace(/\s*>\s*/g, ' > ')
                .replace(/\s*<\s*/g, ' < ')
                .replace(/\s*,\s*/g, ', ')
                .replace(/\s*:\s*/g, ': ')
                .replace(/\(\s+/g, '(')
                .replace(/\s+\)/g, ')')
                .replace(/\[\s+/g, '[')
                .replace(/\s+\]/g, ']');

            const indentation = '    '.repeat(indentLevel);
            formattedLines.push(indentation + line);
        } else {
            formattedLines.push('');
        }
    }

    // Apply formatted code back to editor
    const formattedCode = formattedLines.join('\n');
    pythonEditor.setValue(formattedCode);

    showToast('success', 'Code formatted');
}

function savePythonContent() {
    const siteId = document.getElementById('site-id').value;
    const code = pythonEditor.getValue();

    showToast('info', 'Saving...');

    fetch(`/api/sites/${siteId}/python`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ python_content: code })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            showToast('success', 'Saved successfully');
        } else {
            showToast('error', 'Failed to save');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('error', 'Error saving code');
    });
}

function clearPythonConsole() {
    document.getElementById('pythonOutput').textContent = 'Console cleared. Run your code to see output.';
}

function showPythonKeyboardShortcutsModal() {
    document.getElementById('pythonKeyboardShortcutsModal').style.display = 'flex';
}

function closePythonKeyboardShortcutsModal() {
    document.getElementById('pythonKeyboardShortcutsModal').style.display = 'none';
}

function togglePythonSplitView() {
    const container = document.querySelector('.editor-container');
    container.classList.toggle('vertical-split');

    // Save split view preference in local storage
    const isVerticalSplit = container.classList.contains('vertical-split');
    localStorage.setItem('pythonEditorVerticalSplit', isVerticalSplit.toString());
}

// Toast notification system
let toastTimeout = null;
function showToast(type, message) {
    const toastContainer = document.getElementById('toast-container');

    // Clear any existing toasts first
    while (toastContainer.firstChild) {
        toastContainer.removeChild(toastContainer.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? 'check-circle' : 
                type === 'error' ? 'exclamation-circle' : 'info-circle';

    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        </div>
    `;

    toastContainer.appendChild(toast);

    // Force reflow
    toast.offsetHeight;

    toast.classList.add('show');

    // Clear previous timeout
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    // Set new timeout
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Apply saved preferences when editor loads
document.addEventListener('DOMContentLoaded', function() {
    // Apply saved theme
    const savedTheme = localStorage.getItem('pythonEditorTheme');
    if (savedTheme) {
        changePythonEditorTheme(savedTheme);
        document.getElementById('themeSelector').value = savedTheme;
    }

    // Apply saved font size
    const savedFontSize = localStorage.getItem('pythonEditorFontSize');
    if (savedFontSize) {
        changePythonEditorFontSize(savedFontSize);
        document.getElementById('fontSizeSelector').value = savedFontSize;
    }

    // Apply saved word wrap setting
    const savedWordWrap = localStorage.getItem('pythonEditorWordWrap');
    if (savedWordWrap !== null) {
        const wordWrapEnabled = savedWordWrap === 'true';
        togglePythonWordWrap(wordWrapEnabled);
        document.getElementById('wordWrapToggle').checked = wordWrapEnabled;
    }

    // Apply saved indent setting
    const savedIndentWithTabs = localStorage.getItem('pythonEditorIndentWithTabs');
    if (savedIndentWithTabs !== null) {
        const indentWithTabsEnabled = savedIndentWithTabs === 'true';
        togglePythonIndentWithTabs(indentWithTabsEnabled);
        document.getElementById('pythonIndentWithTabsToggle').checked = indentWithTabsEnabled;
    }

    // Apply saved split view setting
    const savedVerticalSplit = localStorage.getItem('pythonEditorVerticalSplit');
    if (savedVerticalSplit === 'true') {
        document.querySelector('.editor-container').classList.add('vertical-split');
    }
});