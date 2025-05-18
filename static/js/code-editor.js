/**
 * Code Editor for Piston Languages
 * Handles code editing, execution, and file management for multiple programming languages
 */

let editor; // CodeMirror instance
let currentLanguage = ''; // Current programming language
let currentVersion = ''; // Current language version
let files = {}; // Object to store multiple files
let currentFile = ''; // Currently active file
let undoManager = null; // For undo/redo functionality
let splitView = true; // Track split view state

// Initialize the editor when the document is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeEditor();
    setupEventListeners();
    hideLoadingOverlay();
});

/**
 * Initialize the CodeMirror editor with appropriate settings
 */
function initializeEditor() {
    // Get the current language from the hidden input
    currentLanguage = document.getElementById('current-language').value || 'python';
    
    // Initialize CodeMirror
    editor = CodeMirror.fromTextArea(document.getElementById('codeEditor'), {
        lineNumbers: true,
        mode: getLanguageMode(currentLanguage),
        theme: 'eclipse',
        indentUnit: 4,
        smartIndent: true,
        tabSize: 4,
        indentWithTabs: false,
        lineWrapping: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        autoRefresh: true,
        styleActiveLine: true,
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Ctrl-S": saveContent,
            "Ctrl-Enter": runCode,
            "Shift-Alt-F": formatCode,
            "Tab": function(cm) {
                if (cm.somethingSelected()) {
                    cm.indentSelection("add");
                } else {
                    cm.replaceSelection(Array(cm.getOption("indentUnit") + 1).join(" "), "end", "+input");
                }
            }
        }
    });
    
    // Set up undo/redo functionality
    setupUndoRedo();
    
    // Load files from localStorage if they exist
    loadFiles();
    
    // Set up the initial file tab
    setupInitialFile();
}

/**
 * Set up event listeners for various UI elements
 */
function setupEventListeners() {
    // Add file button
    const addFileBtn = document.getElementById('addFileBtn');
    if (addFileBtn) {
        console.log('Setting up new file button click handler');
        addFileBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('New file button clicked');
            openNewFileModal();
        });
    } else {
        console.error('Add file button not found in the DOM');
    }
    
    // New file modal
    const newFileModal = document.getElementById('new-file-modal');
    if (newFileModal) {
        newFileModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeNewFileModal();
            }
        });
    } else {
        console.error('New file modal not found in the DOM');
    }
    
    // Keyboard shortcuts modal
    const keyboardShortcutsModal = document.getElementById('keyboardShortcutsModal');
    if (keyboardShortcutsModal) {
        keyboardShortcutsModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeKeyboardShortcutsModal();
            }
        });
    }
    
    // Handle window resize
    window.addEventListener('resize', function() {
        if (editor) {
            editor.refresh();
        }
    });
    
    // Handle beforeunload to warn about unsaved changes
    window.addEventListener('beforeunload', function(e) {
        if (hasUnsavedChanges()) {
            e.preventDefault();
            e.returnValue = '';
            return '';
        }
    });
}

/**
 * Set up the initial file tab based on the current language
 */
function setupInitialFile() {
    const fileExtension = getFileExtension(currentLanguage);
    const initialFileName = `main.${fileExtension}`;
    
    // Create the initial file if it doesn't exist
    if (!files[initialFileName]) {
        const initialContent = editor.getValue();
        files[initialFileName] = {
            content: initialContent,
            language: currentLanguage
        };
    }
    
    // Set the current file
    currentFile = initialFileName;
    
    // Create the file tab
    createFileTab(initialFileName, true);
    
    // Update editor content
    editor.setValue(files[initialFileName].content);
    editor.setOption('mode', getLanguageMode(files[initialFileName].language));
}

/**
 * Create a new file tab in the UI
 * @param {string} fileName - Name of the file
 * @param {boolean} isActive - Whether this tab should be active
 */
function createFileTab(fileName, isActive = false) {
    const fileTabs = document.querySelector('.file-tabs');
    const addBtn = document.getElementById('addFileBtn');
    
    // Check if tab already exists
    const existingTab = document.querySelector(`.file-tab[data-filename="${fileName}"]`);
    if (existingTab) {
        activateTab(existingTab);
        return;
    }
    
    // Create new tab
    const tab = document.createElement('button');
    tab.className = `file-tab ${isActive ? 'active' : ''}`;
    tab.setAttribute('data-filename', fileName);
    
    // Get file extension for icon
    const fileExt = fileName.split('.').pop();
    const iconClass = getFileIconClass(fileExt);
    
    tab.innerHTML = `
        <i class="${iconClass}"></i>
        <span>${fileName}</span>
        <button class="file-tab-close" title="Close file">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Insert before the add button
    fileTabs.insertBefore(tab, addBtn);
    
    // Add event listeners
    tab.addEventListener('click', function(e) {
        if (!e.target.closest('.file-tab-close')) {
            activateTab(this);
        }
    });
    
    tab.querySelector('.file-tab-close').addEventListener('click', function(e) {
        e.stopPropagation();
        closeFile(fileName);
    });
    
    // Activate the tab if needed
    if (isActive) {
        activateTab(tab);
    }
}

/**
 * Activate a file tab and load its content
 * @param {HTMLElement} tab - The tab element to activate
 */
function activateTab(tab) {
    // Save current file content
    if (currentFile) {
        files[currentFile].content = editor.getValue();
    }
    
    // Deactivate all tabs
    document.querySelectorAll('.file-tab').forEach(t => t.classList.remove('active'));
    
    // Activate this tab
    tab.classList.add('active');
    
    // Update current file
    const fileName = tab.getAttribute('data-filename');
    currentFile = fileName;
    
    // Update editor content and mode
    if (files[fileName]) {
        editor.setValue(files[fileName].content);
        editor.setOption('mode', getLanguageMode(files[fileName].language));
        
        // Update language indicator
        updateLanguageIndicator(files[fileName].language);
    }
    
    // Refresh editor to prevent rendering issues
    setTimeout(() => editor.refresh(), 1);
}

/**
 * Close a file tab
 * @param {string} fileName - Name of the file to close
 */
function closeFile(fileName) {
    // Don't allow closing the last file
    if (Object.keys(files).length <= 1) {
        showToast('warning', 'Cannot close the last file');
        return;
    }
    
    // Remove the tab
    const tab = document.querySelector(`.file-tab[data-filename="${fileName}"]`);
    if (tab) {
        // If closing the active tab, activate another tab first
        if (tab.classList.contains('active')) {
            // Find the next tab to activate
            let nextTab = tab.nextElementSibling;
            if (!nextTab || nextTab.id === 'addFileBtn') {
                nextTab = tab.previousElementSibling;
            }
            
            if (nextTab) {
                activateTab(nextTab);
            }
        }
        
        tab.remove();
    }
    
    // Remove the file from files object
    delete files[fileName];
    
    // Save files to localStorage
    saveFiles();
}

/**
 * Show the new file modal
 */
function openNewFileModal() {
    console.log('Opening new file modal');
    const modal = document.getElementById('new-file-modal');
    if (!modal) {
        console.error('New file modal element not found');
        return;
    }
    
    // Show the modal
    modal.style.display = 'flex';
    
    // Center the modal content
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.style.marginTop = '15vh';
    }
    
    // Clear and focus the input field
    const fileNameInput = document.getElementById('new-file-name');
    if (fileNameInput) {
        fileNameInput.value = '';
        setTimeout(() => {
            fileNameInput.focus();
        }, 100);
    } else {
        console.error('File name input not found');
    }
}

/**
 * Close the new file modal
 */
function closeNewFileModal() {
    const modal = document.getElementById('new-file-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    const fileNameInput = document.getElementById('new-file-name');
    if (fileNameInput) {
        fileNameInput.value = '';
    }
}

/**
 * Create a new file from the modal input
 */
function createNewFile() {
    const fileName = document.getElementById('new-file-name').value.trim();
    
    // Validate file name
    if (!fileName) {
        showToast('error', 'Please enter a file name');
        return;
    }
    
    // Check if file already exists
    if (files[fileName]) {
        showToast('error', 'A file with this name already exists');
        return;
    }
    
    // Create the file
    files[fileName] = {
        content: '',
        language: detectLanguageFromFileName(fileName)
    };
    
    // Create the tab
    createFileTab(fileName, true);
    
    // Close the modal
    closeModal('new-file-modal');
    
    // Save files to localStorage
    saveFiles();
    
    // Show success message
    showToast('success', `Created file ${fileName}`);
}

/**
 * Detect language based on file extension
 * @param {string} fileName - Name of the file
 * @returns {string} - Detected language
 */
function detectLanguageFromFileName(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    
    const extensionMap = {
        'py': 'python',
        'js': 'javascript',
        'ts': 'typescript',
        'html': 'html',
        'css': 'css',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'cs': 'csharp',
        'go': 'go',
        'rb': 'ruby',
        'rs': 'rust',
        'php': 'php',
        'swift': 'swift',
        'kt': 'kotlin',
        'sh': 'bash'
    };
    
    return extensionMap[ext] || currentLanguage;
}

/**
 * Get file extension for a language
 * @param {string} language - Programming language
 * @returns {string} - File extension
 */
function getFileExtension(language) {
    const extensionMap = {
        'python': 'py',
        'javascript': 'js',
        'typescript': 'ts',
        'html': 'html',
        'css': 'css',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'c++': 'cpp',
        'csharp': 'cs',
        'go': 'go',
        'ruby': 'rb',
        'rust': 'rs',
        'php': 'php',
        'swift': 'swift',
        'kotlin': 'kt',
        'bash': 'sh'
    };
    
    // Special case handling for C++ variants
    if (language === 'c++' || language === 'cpp') {
        return 'cpp';
    }
    
    return extensionMap[language.toLowerCase()] || 'txt';
}

/**
 * Get the appropriate icon class for a file extension
 * @param {string} extension - File extension
 * @returns {string} - Font Awesome icon class
 */
function getFileIconClass(extension) {
    const iconMap = {
        'py': 'fab fa-python',
        'js': 'fab fa-js',
        'ts': 'fab fa-js',
        'html': 'fab fa-html5',
        'css': 'fab fa-css3',
        'java': 'fab fa-java',
        'c': 'fas fa-code',
        'cpp': 'fas fa-code',
        'cs': 'fab fa-microsoft',
        'go': 'fas fa-code',
        'rb': 'fas fa-gem',
        'rs': 'fas fa-cogs',
        'php': 'fab fa-php',
        'swift': 'fab fa-swift',
        'kt': 'fab fa-android',
        'sh': 'fas fa-terminal'
    };
    
    return iconMap[extension] || 'fas fa-file-code';
}

/**
 * Get the appropriate CodeMirror mode for a language
 * @param {string} language - Programming language
 * @returns {string} - CodeMirror mode
 */
function getLanguageMode(language) {
    // Normalize language to lowercase
    language = language.toLowerCase();
    
    // Special handling for variants
    if (language === 'c++') language = 'cpp';
    if (language === 'c#') language = 'csharp';
    if (language === 'python3' || language === 'python2') language = 'python';
    if (language === 'typescript') language = 'text/typescript';
    if (language === 'shell') language = 'bash';
    if (language === 'f#' || language === 'fsharp') language = 'text/x-fsharp';
    
    const modeMap = {
        'python': 'python',
        'javascript': 'javascript',
        'typescript': 'text/typescript',
        'html': 'htmlmixed',
        'css': 'css',
        'java': 'text/x-java',
        'c': 'text/x-csrc',
        'cpp': 'text/x-c++src',
        'csharp': 'text/x-csharp',
        'go': 'text/x-go',
        'ruby': 'ruby',
        'rust': 'rust',
        'php': 'php',
        'swift': 'swift',
        'kotlin': 'text/x-kotlin',
        'dart': 'dart',
        'scala': 'text/x-scala',
        'r': 'r',
        'rscript': 'r',
        'bash': 'shell',
        'powershell': 'powershell',
        'lua': 'lua',
        'perl': 'perl',
        'haskell': 'haskell',
        'elixir': 'elixir',
        'erlang': 'erlang',
        'clojure': 'clojure',
        'lisp': 'commonlisp',
        'scheme': 'scheme',
        'racket': 'scheme',
        'ocaml': 'text/x-ocaml',
        'fortran': 'fortran',
        'pascal': 'pascal',
        'sql': 'sql',
        'sqlite3': 'sql',
        'yaml': 'yaml',
        'yml': 'yaml',
        'markdown': 'markdown',
        'md': 'markdown',
        'coffeescript': 'coffeescript',
        'groovy': 'groovy',
        'nim': 'nim',
        'd': 'd'
    };
    
    return modeMap[language] || 'plaintext';
}

/**
 * Update the language indicator in the status bar
 * @param {string} language - Programming language
 */
function updateLanguageIndicator(language) {
    const languageIcon = document.getElementById('language-icon');
    const languageName = document.getElementById('language-name');
    
    // Get the icon class
    const iconClass = getPistonLanguageIcon(language);
    
    // Update the elements
    languageIcon.className = iconClass;
    languageName.textContent = language;
}

/**
 * Get the Font Awesome icon class for a Piston language
 * @param {string} language - Programming language
 * @returns {string} - Font Awesome icon class
 */
function getPistonLanguageIcon(language) {
    const iconMap = {
        'python': 'fab fa-python',
        'javascript': 'fab fa-js',
        'typescript': 'fab fa-js',
        'java': 'fab fa-java',
        'c': 'fas fa-code',
        'cpp': 'fas fa-code',
        'csharp': 'fab fa-microsoft',
        'go': 'fas fa-code',
        'ruby': 'fas fa-gem',
        'rust': 'fas fa-cogs',
        'php': 'fab fa-php',
        'swift': 'fab fa-swift',
        'kotlin': 'fab fa-android',
        'bash': 'fas fa-terminal'
    };
    
    return iconMap[language] || 'fas fa-code';
}

/**
 * Save files to localStorage
 */
function saveFiles() {
    // Save current file content
    if (currentFile && files[currentFile]) {
        files[currentFile].content = editor.getValue();
    }
    
    const siteId = document.getElementById('site-id').value;
    localStorage.setItem(`files_${siteId}`, JSON.stringify(files));
}

/**
 * Load files from localStorage
 */
function loadFiles() {
    const siteId = document.getElementById('site-id').value;
    const savedFiles = localStorage.getItem(`files_${siteId}`);
    
    if (savedFiles) {
        files = JSON.parse(savedFiles);
        
        // Create tabs for all loaded files
        const fileTabsContainer = document.querySelector('.file-tabs');
        if (fileTabsContainer) {
            // Clear existing tabs except the add button
            const addFileBtn = document.querySelector('.file-tab-add');
            fileTabsContainer.innerHTML = '';
            if (addFileBtn) {
                fileTabsContainer.appendChild(addFileBtn);
            }
            
            // Create tabs for each file
            let firstFile = Object.keys(files)[0];
            Object.keys(files).forEach(fileName => {
                createFileTab(fileName, fileName === currentFile);
                
                // If no current file is set, use the first file
                if (!currentFile) {
                    currentFile = firstFile;
                }
            });
            
            // Make sure the current file's tab is active
            const activeTab = document.querySelector(`.file-tab[data-filename="${currentFile}"]`);
            if (activeTab) {
                activateTab(activeTab);
            }
        }
    } else {
        // Initialize with the current content
        const fileExtension = getFileExtension(currentLanguage);
        const initialFileName = `main.${fileExtension}`;
        
        files = {
            [initialFileName]: {
                content: editor.getValue(),
                language: currentLanguage
            }
        };
        
        currentFile = initialFileName;
    }
}

/**
 * Get the appropriate file extension for a language
 * @param {string} language - The programming language
 * @returns {string} The file extension (without the dot)
 */
function getFileExtension(language) {
    if (!language) return 'txt';
    
    language = language.toLowerCase();
    
    const extensionMap = {
        // Mainstream languages
        "python": "py",
        "python2": "py",
        "python3": "py",
        "javascript": "js",
        "typescript": "ts",
        "java": "java",
        "c": "c",
        "cpp": "cpp",
        "c++": "cpp",
        "csharp": "cs",
        "c#": "cs",
        "go": "go",
        "ruby": "rb",
        "rust": "rs",
        "php": "php",
        "swift": "swift",
        "kotlin": "kt",
        "dart": "dart",
        "scala": "scala",
        "groovy": "groovy",
        
        // Scripting languages
        "lua": "lua",
        "perl": "pl",
        "r": "r",
        "rscript": "r",
        "bash": "sh",
        "shell": "sh",
        "powershell": "ps1",
        
        // Functional languages
        "haskell": "hs",
        "elixir": "ex",
        "erlang": "erl",
        "clojure": "clj",
        "lisp": "lisp",
        "scheme": "scm",
        "racket": "rkt",
        "fsharp": "fs",
        "ocaml": "ml",
        
        // Systems languages
        "zig": "zig",
        "vlang": "v",
        "nim": "nim",
        "crystal": "cr",
        "d": "d",
        "fortran": "f90",
        "cobol": "cbl",
        "pascal": "pas",
        "ada": "adb",
        "assembly": "asm",
        "nasm": "asm",
        "nasm64": "asm",
        
        // Database languages
        "sql": "sql",
        "sqlite3": "sql",
        
        // Other languages
        "matlab": "m",
        "octave": "m",
        "prolog": "pl",
        "lolcode": "lol",
        "brainfuck": "bf",
        "befunge93": "b93",
        "emojicode": "emojic",
        "rockstar": "rock",
        "vyxal": "vy",
        "jelly": "jelly",
        "osabie": "osabie",
        "paradoc": "pdc",
        "ponylang": "pony",
        "samarium": "sm",
        "smalltalk": "st",
        "tcl": "tcl",
        "verilog": "v",
        "vhdl": "vhd",
        "coffeescript": "coffee",
        "html": "html",
        "css": "css",
        "elm": "elm",
        "solidity": "sol",
        "llvm_ir": "ll",
        "yeethon": "py",
        "basic": "bas",
        "basic.net": "vb"
    };
    
    return extensionMap[language] || 'txt';
}

/**
 * Get the appropriate CodeMirror mode for a language or file
 * @param {string} language - The programming language or filename
 * @returns {string} The CodeMirror mode
 */
function getCodeMirrorMode(language) {
    // If we have a filename, extract the extension
    if (language.includes('.')) {
        const extension = language.split('.').pop().toLowerCase();
        return getCodeMirrorModeFromExtension(extension);
    }
    
    // Handle direct language names
    language = language.toLowerCase();
    
    const modeMap = {
        // Mainstream languages with specific modes
        "python": "python",
        "python2": "python",
        "python3": "python",
        "javascript": "javascript",
        "typescript": "javascript",
        "java": "clike",
        "c": "clike",
        "c++": "clike",
        "cpp": "clike",
        "csharp": "clike",
        "c#": "clike",
        "go": "go",
        "ruby": "ruby",
        "rust": "rust",
        "php": "php",
        "swift": "swift",
        "kotlin": "clike",
        "dart": "dart",
        "scala": "clike",
        "rscript": "r",
        "matlab": "octave",
        "octave": "octave",
        "bash": "shell",
        "powershell": "powershell",
        "lua": "lua",
        "perl": "perl",
        "haskell": "haskell",
        "elixir": "ruby",
        "erlang": "erlang",
        "clojure": "clojure",
        "lisp": "commonlisp",
        "racket": "scheme",
        "fsharp": "mllike",
        "ocaml": "mllike",
        "nim": "python",
        "crystal": "ruby",
        "groovy": "groovy",
        "basic": "vb",
        "fortran": "fortran",
        "cobol": "cobol",
        "pascal": "pascal",
        "prolog": "prolog",
        "smalltalk": "smalltalk",
        "sqlite3": "sql",
        "coffeescript": "coffeescript",
        "julia": "julia",
        "html": "htmlmixed",
        "css": "css",
        "xml": "xml",
        "sql": "sql"
    };
    
    return modeMap[language] || "text/plain";
}

/**
 * Get the CodeMirror mode from a file extension
 * @param {string} extension - The file extension (without the dot)
 * @returns {string} The CodeMirror mode
 */
function getCodeMirrorModeFromExtension(extension) {
    const extensionModeMap = {
        // Common file extensions
        "js": "javascript",
        "ts": "javascript", 
        "jsx": "javascript",
        "tsx": "javascript",
        "py": "python",
        "java": "clike",
        "c": "clike",
        "cpp": "clike",
        "h": "clike",
        "hpp": "clike",
        "cs": "clike",
        "go": "go",
        "rb": "ruby",
        "rs": "rust",
        "php": "php",
        "swift": "swift",
        "kt": "clike",
        "dart": "dart",
        "scala": "clike",
        "r": "r",
        "m": "octave",
        "sh": "shell",
        "ps1": "powershell",
        "lua": "lua",
        "pl": "perl",
        "hs": "haskell",
        "ex": "ruby",
        "erl": "erlang",
        "clj": "clojure",
        "lisp": "commonlisp",
        "rkt": "scheme",
        "fs": "mllike",
        "ml": "mllike",
        "html": "htmlmixed",
        "htm": "htmlmixed",
        "xml": "xml",
        "css": "css",
        "sql": "sql",
        "json": "javascript",
        "md": "markdown",
        "txt": "text/plain"
    };
    
    return extensionModeMap[extension] || "text/plain";
}

/**
 * Set up undo/redo functionality
 */
function setupUndoRedo() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    // Update button states
    function updateUndoRedoButtons() {
        undoBtn.disabled = !editor.historySize().undo;
        redoBtn.disabled = !editor.historySize().redo;
    }
    
    // Initial state
    updateUndoRedoButtons();
    
    // Add event listeners
    editor.on('change', updateUndoRedoButtons);
    
    // Set up button actions
    undoBtn.addEventListener('click', function() {
        editor.undo();
        editor.focus();
    });
    
    redoBtn.addEventListener('click', function() {
        editor.redo();
        editor.focus();
    });
}

/**
 * Run the code using the Piston API
 */
function runCode() {
    // Save current file content
    if (currentFile) {
        files[currentFile].content = editor.getValue();
    }
    
    // Get the code to run
    const code = editor.getValue();
    const language = files[currentFile].language;
    
    // Show loading in console
    const consoleOutput = document.getElementById('consoleOutput');
    consoleOutput.innerHTML = '<span class="info">Running code...</span>';
    
    // Prepare the request
    const siteId = document.getElementById('site-id').value;
    
    // Make the API request
    fetch(`/api/run/${siteId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            language: language,
            code: code
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Format and display the output
            let output = '';
            
            if (data.compile_output) {
                output += `<span class="info">Compilation Output:</span>\n${escapeHtml(data.compile_output)}\n\n`;
            }
            
            if (data.run_output) {
                output += `<span class="info">Program Output:</span>\n${escapeHtml(data.run_output)}`;
            }
            
            consoleOutput.innerHTML = output || '<span class="success">Program executed successfully with no output.</span>';
        } else {
            // Display error
            consoleOutput.innerHTML = `<span class="error">Error: ${escapeHtml(data.error || 'Unknown error')}</span>`;
        }
    })
    .catch(error => {
        consoleOutput.innerHTML = `<span class="error">Error: ${escapeHtml(error.message)}</span>`;
    });
}

/**
 * Format the code
 */
function formatCode() {
    // Get the code to format
    const code = editor.getValue();
    const language = files[currentFile].language;
    
    // Prepare the request
    const siteId = document.getElementById('site-id').value;
    
    // Make the API request
    fetch(`/api/format/${siteId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            language: language,
            code: code
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.formatted_code) {
            // Update the editor with formatted code
            editor.setValue(data.formatted_code);
            showToast('success', 'Code formatted successfully');
        } else {
            showToast('error', data.error || 'Failed to format code');
        }
    })
    .catch(error => {
        showToast('error', `Error: ${error.message}`);
    });
}

/**
 * Save the content to the server
 */
function saveContent() {
    // Save current file content
    if (currentFile) {
        files[currentFile].content = editor.getValue();
    }
    
    // Save files to localStorage
    saveFiles();
    
    // Get the main file content (the one that should be executed)
    const mainFileExt = getFileExtension(currentLanguage);
    const mainFileName = `main.${mainFileExt}`;
    const mainContent = files[mainFileName] ? files[mainFileName].content : editor.getValue();
    
    // Prepare the request
    const siteId = document.getElementById('site-id').value;
    
    // Make the API request
    fetch(`/api/site/${siteId}/save`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            language: currentLanguage,
            content: mainContent,
            files: files
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('success', 'Changes saved successfully');
        } else {
            showToast('error', data.error || 'Failed to save changes');
        }
    })
    .catch(error => {
        showToast('error', `Error: ${error.message}`);
    });
}

/**
 * Check if there are unsaved changes
 * @returns {boolean} - Whether there are unsaved changes
 */
function hasUnsavedChanges() {
    // Check if current file content is different from saved content
    if (currentFile && files[currentFile]) {
        const currentContent = editor.getValue();
        return currentContent !== files[currentFile].content;
    }
    return false;
}

/**
 * Toggle split view
 */
function toggleSplitView() {
    const container = document.querySelector('.editor-container');
    splitView = !splitView;
    
    if (splitView) {
        container.classList.add('split-layout');
    } else {
        container.classList.remove('split-layout');
    }
    
    // Refresh editor to prevent rendering issues
    setTimeout(() => editor.refresh(), 1);
}

/**
 * Show keyboard shortcuts modal
 */
function openKeyboardShortcutsModal() {
    const modal = document.getElementById('keyboardShortcutsModal');
    modal.style.display = 'block';
}

/**
 * Close keyboard shortcuts modal
 */
function closeKeyboardShortcutsModal() {
    const modal = document.getElementById('keyboardShortcutsModal');
    modal.style.display = 'none';
}

/**
 * Clear the console output
 */
function clearConsole() {
    const consoleOutput = document.getElementById('consoleOutput');
    consoleOutput.innerHTML = 'Console cleared. Run your code to see output.';
}

/**
 * Hide the loading overlay
 */
function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 500);
    }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} unsafe - Unsafe string that might contain HTML
 * @returns {string} - Escaped string
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Change editor theme
 * @param {string} theme - CodeMirror theme name
 */
function changeEditorTheme(theme) {
    editor.setOption('theme', theme);
    localStorage.setItem('editor_theme', theme);
}

/**
 * Change editor font size
 * @param {string} size - Font size with unit (e.g., '14px')
 */
function changeEditorFontSize(size) {
    const editorElement = editor.getWrapperElement();
    editorElement.style.fontSize = size;
    localStorage.setItem('editor_font_size', size);
    
    // Refresh editor to prevent rendering issues
    setTimeout(() => editor.refresh(), 1);
}

/**
 * Toggle word wrap
 * @param {boolean} enabled - Whether word wrap should be enabled
 */
function toggleWordWrap(enabled) {
    editor.setOption('lineWrapping', enabled);
    localStorage.setItem('editor_word_wrap', enabled ? 'true' : 'false');
}

/**
 * Toggle code linting
 * @param {boolean} enabled - Whether linting should be enabled
 */
function toggleLinting(enabled) {
    // This would require additional linting libraries for each language
    // For now, just save the preference
    localStorage.setItem('editor_linting', enabled ? 'true' : 'false');
    showToast('info', `Linting ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Toggle indentation with tabs
 * @param {boolean} enabled - Whether to indent with tabs
 */
function toggleIndentWithTabs(enabled) {
    editor.setOption('indentWithTabs', enabled);
    localStorage.setItem('editor_indent_with_tabs', enabled ? 'true' : 'false');
}

/**
 * Focus the search dialog
 */
function focusSearch() {
    CodeMirror.commands.find(editor);
}

/**
 * Show a toast message
 * @param {string} type - Type of toast (success, error, info)
 * @param {string} message - Message to display
 */
function showToast(type, message) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        // Create toast container if it doesn't exist
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.getElementById('toast-container').appendChild(toast);
    
    // Force reflow
    toast.offsetHeight;
    
    // Show the toast
    toast.classList.add('show');
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Load saved preferences
function loadSavedPreferences() {
    // Theme
    const savedTheme = localStorage.getItem('editor_theme');
    if (savedTheme) {
        changeEditorTheme(savedTheme);
        const themeSelector = document.getElementById('themeSelector');
        if (themeSelector) themeSelector.value = savedTheme;
    }
    
    // Font size
    const savedFontSize = localStorage.getItem('editor_font_size');
    if (savedFontSize) {
        changeEditorFontSize(savedFontSize);
        const fontSizeSelector = document.getElementById('fontSizeSelector');
        if (fontSizeSelector) fontSizeSelector.value = savedFontSize;
    }
    
    // Word wrap
    const savedWordWrap = localStorage.getItem('editor_word_wrap');
    const wordWrapEnabled = savedWordWrap !== 'false';
    toggleWordWrap(wordWrapEnabled);
    const wordWrapToggle = document.getElementById('wordWrapToggle');
    if (wordWrapToggle) wordWrapToggle.checked = wordWrapEnabled;
    
    // Linting
    const savedLinting = localStorage.getItem('editor_linting');
    const lintingEnabled = savedLinting === 'true';
    const lintToggle = document.getElementById('lintToggle');
    if (lintToggle) lintToggle.checked = lintingEnabled;
    
    // Indent with tabs
    const savedIndentWithTabs = localStorage.getItem('editor_indent_with_tabs');
    const indentWithTabsEnabled = savedIndentWithTabs === 'true';
    toggleIndentWithTabs(indentWithTabsEnabled);
    const indentWithTabsToggle = document.getElementById('indentWithTabsToggle');
    if (indentWithTabsToggle) indentWithTabsToggle.checked = indentWithTabsEnabled;
}

// Call this after the editor is initialized
document.addEventListener('DOMContentLoaded', function() {
    // Load preferences after editor is initialized
    setTimeout(loadSavedPreferences, 100);
});
