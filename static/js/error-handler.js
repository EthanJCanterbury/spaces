window.onerror = function(msg, url, lineNo, columnNo, error) {
    handleError({
        type: 'JavaScript Error',
        message: msg,
        file: url,
        line: lineNo,
        column: columnNo,
        stack: error ? error.stack : null
    });
    return false;
};

window.addEventListener('error', function(event) {
  console.error('Caught error:', event.error);
  
  event.preventDefault();
  
  if (typeof showToast === 'function') {
    showToast('error', 'An error occurred: ' + (event.error?.message || 'Unknown error'));
  }
  
  return true;
});


window.addEventListener('unhandledrejection', function(event) {
    handleError({
        type: 'Promise Error',
        message: event.reason.message || 'Unhandled Promise Rejection',
        stack: event.reason.stack
    });
});

$(document).ajaxError(function(event, jqXHR, settings, error) {
    handleError({
        type: 'AJAX Error',
        message: error || 'Network Error',
        status: jqXHR.status,
        responseText: jqXHR.responseText,
        url: settings.url
    });
});

function handleError(errorInfo) {
    let modal = document.getElementById('errorModal');
    if (!modal) {
        modal = createErrorModal();
    }

    updateErrorModal(modal, errorInfo);

    modal.style.display = 'block';
}

function createErrorModal() {
    const modal = document.createElement('div');
    modal.id = 'errorModal';
    modal.className = 'error-modal';
    modal.innerHTML = `
        <div class="error-modal-content">
            <div class="error-modal-header">
                <h2><i class="fas fa-exclamation-circle"></i> <span id="errorType">Error</span></h2>
                <button class="close-button" onclick="closeErrorModal()">&times;</button>
            </div>
            <div class="error-modal-body">
                <div id="errorMessage" class="error-message"></div>
                <div id="errorDetails" class="error-details">
                    <div id="errorLocation" class="error-location"></div>
                    <pre id="errorStack" class="error-stack"></pre>
                </div>
            </div>
            <div class="error-modal-footer">
                <button onclick="closeErrorModal()" class="error-btn">Close</button>
                <button onclick="reportError()" class="error-btn error-btn-primary">
                    <i class="fas fa-bug"></i> Report Issue
                </button>
            </div>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        .error-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            animation: fadeIn 0.3s ease-out;
        }

        .error-modal-content {
            position: relative;
            background: white;
            margin: 5% auto;
            padding: 0;
            width: 90%;
            max-width: 600px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            animation: slideIn 0.3s ease-out;
        }

        .error-modal-header {
            padding: 1rem;
            background: #ff4757;
            color: white;
            border-radius: 8px 8px 0 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .error-modal-header h2 {
            margin: 0;
            font-size: 1.2rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .close-button {
            background: none;
            border: none;
            color: white;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0;
            line-height: 1;
        }

        .error-modal-body {
            padding: 1.5rem;
            max-height: 70vh;
            overflow-y: auto;
        }

        .error-message {
            font-size: 1.1rem;
            margin-bottom: 1rem;
            color: #2d3436;
        }

        .error-location {
            font-family: monospace;
            background: #f1f2f6;
            padding: 0.5rem;
            border-radius: 4px;
            margin-bottom: 1rem;
            font-size: 0.9rem;
        }

        .error-stack {
            background: #2d3436;
            color: #dfe6e9;
            padding: 1rem;
            border-radius: 4px;
            overflow-x: auto;
            margin: 0;
            font-size: 0.9rem;
            white-space: pre-wrap;
        }

        .error-modal-footer {
            padding: 1rem;
            border-top: 1px solid #eee;
            display: flex;
            justify-content: flex-end;
            gap: 1rem;
        }

        .error-btn {
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.2s;
        }

        .error-btn-primary {
            background: #ff4757;
            color: white;
        }

        .error-btn:hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes slideIn {
            from {
                transform: translateY(-20px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }
    `;

    document.head.appendChild(style);
    document.body.appendChild(modal);
    return modal;
}

function updateErrorModal(modal, errorInfo) {
    modal.querySelector('#errorType').textContent = errorInfo.type;
    modal.querySelector('#errorMessage').textContent = errorInfo.message;

    const locationEl = modal.querySelector('#errorLocation');
    if (errorInfo.file) {
        locationEl.innerHTML = `
            <strong>File:</strong> ${errorInfo.file}
            ${errorInfo.line ? `<br><strong>Line:</strong> ${errorInfo.line}` : ''}
            ${errorInfo.column ? `<strong>Column:</strong> ${errorInfo.column}` : ''}
        `;
        locationEl.style.display = 'block';
    } else {
        locationEl.style.display = 'none';
    }

    const stackEl = modal.querySelector('#errorStack');
    if (errorInfo.stack) {
        stackEl.textContent = errorInfo.stack;
        stackEl.style.display = 'block';
    } else {
        stackEl.style.display = 'none';
    }
}

function closeErrorModal() {
    const modal = document.getElementById('errorModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function reportError() {
    const errorDetails = {
        type: document.getElementById('errorType').textContent,
        message: document.getElementById('errorMessage').textContent,
        location: document.getElementById('errorLocation').textContent,
        stack: document.getElementById('errorStack').textContent,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString()
    };

    fetch('/api/report-error', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(errorDetails)
    }).then(() => {
        alert('Error report sent successfully. Thank you for helping us improve!');
        closeErrorModal();
    }).catch(err => {
        console.error('Failed to send error report:', err);
        alert('Failed to send error report. Please try again later.');
    });
}

function testError(type) {
    switch(type) {
        case 'syntax':
            eval('this is not valid javascript');
            break;
        case 'reference':
            nonExistentFunction();
            break;
        case 'type':
            null.foo();
            break;
        case 'promise':
            Promise.reject(new Error('Test Promise Error'));
            break;
        case 'async':
            setTimeout(() => { throw new Error('Test Async Error'); }, 0);
            break;
    }
}
