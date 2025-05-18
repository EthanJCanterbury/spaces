// Code Editor Functionality
document.addEventListener('DOMContentLoaded', function() {
    // File tab functionality
    const addFileTab = document.getElementById('add-file-tab');
    if (addFileTab) {
        addFileTab.addEventListener('click', function() {
            openNewFileModal();
        });
    }

    // Initialize the new file modal
    function openNewFileModal() {
        // Create modal if it doesn't exist
        if (!document.getElementById('new-file-modal')) {
            createNewFileModal();
        }
        
        // Open the modal
        openModal('new-file-modal');
    }

    function createNewFileModal() {
        const modal = document.createElement('div');
        modal.id = 'new-file-modal';
        modal.className = 'modal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Create New File</h2>
                    <span class="close-btn" onclick="closeModal('new-file-modal')">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="new-file-name">File Name:</label>
                        <input type="text" id="new-file-name" placeholder="e.g., utils.js">
                    </div>
                    <div class="form-group">
                        <label for="new-file-type">File Type:</label>
                        <select id="new-file-type">
                            <option value="js">JavaScript (.js)</option>
                            <option value="py">Python (.py)</option>
                            <option value="html">HTML (.html)</option>
                            <option value="css">CSS (.css)</option>
                            <option value="json">JSON (.json)</option>
                            <option value="txt">Text (.txt)</option>
                        </select>
                    </div>
                    <div class="form-actions">
                        <button id="create-file-btn" class="btn-primary">Create File</button>
                        <button onclick="closeModal('new-file-modal')" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listener to create file button
        document.getElementById('create-file-btn').addEventListener('click', function() {
            createNewFile();
        });
    }

    function createNewFile() {
        const fileName = document.getElementById('new-file-name').value;
        const fileType = document.getElementById('new-file-type').value;
        
        if (!fileName) {
            showToast('error', 'Please enter a file name');
            return;
        }
        
        // Create the file name with extension if not provided
        let fullFileName = fileName;
        if (!fullFileName.includes('.')) {
            fullFileName += '.' + fileType;
        }
        
        // Add file tab
        addFileTab(fullFileName);
        
        // Close modal
        closeModal('new-file-modal');
        
        // Show success message
        showToast('success', `File ${fullFileName} created successfully`);
    }

    function addFileTab(fileName) {
        const fileTabs = document.querySelector('.file-tabs');
        const addFileTab = document.getElementById('add-file-tab');
        
        // Create new tab
        const newTab = document.createElement('div');
        newTab.className = 'file-tab';
        
        // Determine icon based on file extension
        let iconClass = 'fa-file';
        const ext = fileName.split('.').pop().toLowerCase();
        
        if (ext === 'js') iconClass = 'fa-js';
        else if (ext === 'py') iconClass = 'fa-python';
        else if (ext === 'html') iconClass = 'fa-html5';
        else if (ext === 'css') iconClass = 'fa-css3-alt';
        else if (ext === 'json') iconClass = 'fa-file-code';
        
        newTab.innerHTML = `
            <i class="fab ${iconClass}"></i>
            <span>${fileName}</span>
            <i class="fas fa-times close-tab" title="Close file"></i>
        `;
        
        // Insert before the add tab button
        fileTabs.insertBefore(newTab, addFileTab);
        
        // Add event listener to close button
        const closeBtn = newTab.querySelector('.close-tab');
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            removeFileTab(newTab, fileName);
        });
        
        // Add event listener to switch to this file
        newTab.addEventListener('click', function() {
            switchToFile(fileName);
        });
        
        // Switch to the new file
        switchToFile(fileName);
    }

    function removeFileTab(tabElement, fileName) {
        // Ask for confirmation if file has unsaved changes
        if (confirm(`Are you sure you want to close ${fileName}?`)) {
            tabElement.remove();
            
            // Switch to first tab if available
            const firstTab = document.querySelector('.file-tab:not(#add-file-tab)');
            if (firstTab) {
                switchToFile(firstTab.querySelector('span').textContent);
            }
        }
    }

    function switchToFile(fileName) {
        // Update active tab
        const fileTabs = document.querySelectorAll('.file-tab');
        fileTabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.querySelector('span') && tab.querySelector('span').textContent === fileName) {
                tab.classList.add('active');
            }
        });
        
        // Here you would load the file content
        // For now, we'll just update the editor mode based on file extension
        const ext = fileName.split('.').pop().toLowerCase();
        updateEditorMode(ext);
    }

    function updateEditorMode(fileExtension) {
        let mode = 'text/plain';
        
        // Map extensions to CodeMirror modes
        if (fileExtension === 'js') mode = 'javascript';
        else if (fileExtension === 'py') mode = 'python';
        else if (fileExtension === 'html') mode = 'htmlmixed';
        else if (fileExtension === 'css') mode = 'css';
        else if (fileExtension === 'json') mode = 'application/json';
        
        // Update editor mode if editor is defined
        if (window.editor) {
            editor.setOption('mode', mode);
        }
    }

    // Modal functionality
    window.openModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
        }
    };

    window.closeModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    };

    // Toast notification
    window.showToast = function(type, message) {
        const toastContainer = document.getElementById('toast-container') || createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = type === 'success' ? 'check-circle' : 
                     type === 'error' ? 'exclamation-circle' :
                     type === 'warning' ? 'exclamation-triangle' : 'info-circle';
        
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${icon}"></i>
                <span>${message}</span>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove toast after 3 seconds
        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    };

    function createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    // Run code functionality
    const runBtn = document.getElementById('runBtn');
    if (runBtn) {
        runBtn.addEventListener('click', function() {
            runCode();
        });
    }

    function runCode() {
        const consoleOutput = document.getElementById('console-output');
        const language = document.getElementById('site-language').value;
        const content = editor.getValue();
        const siteId = document.getElementById('site-id').value;
        const stdinInput = document.getElementById('stdinInput')?.value || '';
        const argsInput = document.getElementById('argsInput')?.value || '';
        
        // Clear previous output
        consoleOutput.innerHTML = '<div class="console-running"><span class="console-prompt">></span> Running code...</div>';
        
        // Start execution timer
        const startTime = performance.now();
        
        // Update run button
        runBtn.disabled = true;
        const originalBtnContent = runBtn.innerHTML;
        runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
        
        // Call API to execute code
        fetch(`/api/run_code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                site_id: siteId,
                language: language,
                code: content,
                stdin: stdinInput,
                args: argsInput
            })
        })
        .then(response => response.json())
        .then(data => {
            // Calculate execution time
            const endTime = performance.now();
            const executionTime = ((endTime - startTime) / 1000).toFixed(2);
            document.getElementById('time-value').textContent = executionTime + 's';
            
            // Display output
            if (data.success) {
                let output = data.output || 'No output';
                
                // Format output with syntax highlighting
                consoleOutput.innerHTML = `<pre class="code-output">${escapeHtml(output)}</pre>`;
                
                if (data.errors) {
                    consoleOutput.innerHTML += `<pre class="error-output">${escapeHtml(data.errors)}</pre>`;
                }
            } else {
                consoleOutput.innerHTML = `<pre class="error-output">Error: ${escapeHtml(data.error || 'Unknown error')}</pre>`;
            }
        })
        .catch(error => {
            console.error('Error running code:', error);
            consoleOutput.innerHTML = `<pre class="error-output">Error: ${error.message}</pre>`;
        })
        .finally(() => {
            // Restore run button
            runBtn.disabled = false;
            runBtn.innerHTML = originalBtnContent;
        });
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Add CSS for new elements
    addStyles();

    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                z-index: 1000;
                justify-content: center;
                align-items: center;
            }
            
            .modal-content {
                background-color: #fff;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                width: 500px;
                max-width: 90%;
                max-height: 90vh;
                overflow-y: auto;
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px 20px;
                border-bottom: 1px solid #eee;
            }
            
            .modal-header h2 {
                margin: 0;
                font-size: 1.2rem;
                color: #333;
            }
            
            .close-btn {
                font-size: 1.5rem;
                cursor: pointer;
                color: #999;
                transition: color 0.2s;
            }
            
            .close-btn:hover {
                color: #333;
            }
            
            .modal-body {
                padding: 20px;
            }
            
            .form-group {
                margin-bottom: 15px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
            }
            
            .form-group input,
            .form-group select {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
            }
            
            .form-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 20px;
            }
            
            .btn-primary {
                background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px 16px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .btn-secondary {
                background-color: #f5f5f5;
                color: #333;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 8px 16px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .btn-primary:hover {
                background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
            }
            
            .btn-secondary:hover {
                background-color: #e9e9e9;
            }
            
            #toast-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
            }
            
            .toast {
                margin-top: 10px;
                padding: 12px 15px;
                border-radius: 4px;
                background-color: #333;
                color: #fff;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                min-width: 250px;
                max-width: 350px;
                opacity: 1;
                transition: opacity 0.3s;
            }
            
            .toast-content {
                display: flex;
                align-items: center;
            }
            
            .toast-content i {
                margin-right: 10px;
                font-size: 1.1rem;
            }
            
            .toast-success {
                background-color: #4caf50;
            }
            
            .toast-error {
                background-color: #f44336;
            }
            
            .toast-warning {
                background-color: #ff9800;
            }
            
            .toast-info {
                background-color: #2196f3;
            }
            
            .toast-fade-out {
                opacity: 0;
            }
            
            .code-output {
                color: #8bc34a;
                margin: 0;
                white-space: pre-wrap;
                word-break: break-word;
            }
            
            .error-output {
                color: #f44336;
                margin: 0;
                white-space: pre-wrap;
                word-break: break-word;
            }
            
            .console-running {
                color: #64b5f6;
                margin-bottom: 10px;
            }
        `;
        document.head.appendChild(style);
    }
});
