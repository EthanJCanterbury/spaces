function getFileTypeFromName(filename) {
  if (typeof filename !== 'string') {
    return 'text'; 
  }

  const extension = filename.split('.').pop().toLowerCase();

  if (extension === 'html' || extension === 'htm') {
    return 'html';
  } else if (extension === 'css') {
    return 'css';
  } else if (extension === 'js') {
    return 'javascript';
  } else {
    return 'text';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const createNewFileBtn = document.getElementById('createNewFile');
  if (createNewFileBtn) {
    createNewFileBtn.addEventListener('click', function() {
      const filenameInput = document.getElementById('newFilename');
      if (!filenameInput) {
        showToast('Filename input not found', 'error');
        return;
      }

      const filename = filenameInput.value.trim();

      if (!filename) {
        showToast('Please enter a filename with extension', 'error');
        return;
      }

      if (!filename.includes('.')) {
        showToast('Please include a file extension (e.g., .html, .css, .js)', 'error');
        return;
      }

      const fileType = getFileTypeFromName(filename);
      createNewFile(filename, fileType);

      closeModal('new-file-modal');
    });
  }
});

function createNewFile() {
  const filename = document.getElementById('newFilename').value.trim();

  if (!filename) {
    showToast('Please enter a filename', 'error');
    return;
  }

  const fileType = filename.split('.').pop().toLowerCase();

  if (fileContents[filename]) {
    showToast(`File ${filename} already exists`, 'error');
    return;
  }

  const data = {
    filename: filename,
    file_type: fileType
  };

  // Check if this is a YSWS site type
  const isYSWS = window.siteType === 'ysws';

  if (isYSWS) {
    // For YSWS sites, use empty content for all file types
    if (fileType === 'html') {
      data.content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filename}</title>
</head>
<body>
  <!-- Put your content here -->
</body>
</html>`;
    } else if (fileType === 'css') {
      data.content = `/* CSS for ${filename} */`;
    } else if (fileType === 'js') {
      data.content = `// JavaScript for ${filename}`;
    } else {
      data.content = '';
    }
  } else {
    // For regular sites, use the default templates
    if (fileType === 'html') {
      data.content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filename}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>${filename}</h1>
  <p>This is a new page.</p>
</body>
</html>`;
    } else if (fileType === 'css') {
      data.content = `/* Styles for ${filename} */
body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 20px;
}`;
    } else if (fileType === 'js') {
      data.content = `// JavaScript for ${filename}
document.addEventListener('DOMContentLoaded', function() {
  console.log('${filename} loaded');
});`;
    } else {
      data.content = '';
    }
  }


  const siteId = document.getElementById('site-id').value;

  fetch('/api/sites/' + siteId + '/files', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Error creating file');
    }
    return response.json();
  })
  .then(data => {
    addFileTab(filename, fileType);
    showToast('File created successfully', 'success');
    switchToFile(filename);
  })
  .catch(error => {
    console.error('Error:', error);
    showToast('Failed to create file: ' + error.message, 'error');
  });
}

// Update save message to show "Changes Saved" instead of "success"
function saveMessage(message) {
  return message || "Changes Saved";
}

// Add a small delay before updating preview to ensure the server has processed the changes
function delayedUpdatePreview() {
  setTimeout(() => {
    updatePreview();
  }, 500);
}

function addFileTab(filename, filetype) {
  const fileTabsContainer = document.querySelector('.file-tabs');
  const addButton = document.querySelector('.file-tab-add');

  const newTab = document.createElement('button');
  newTab.className = 'file-tab';
  newTab.setAttribute('data-filename', filename);
  newTab.setAttribute('data-filetype', filetype || getFileType(filename));

  newTab.textContent = filename;

  newTab.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    showTabContextMenu(filename, e.clientX, e.clientY);
  });

  fileTabsContainer.insertBefore(newTab, addButton);

  newTab.addEventListener('click', function() {
    switchToFile(this.getAttribute('data-filename'));
  });
}

function deleteFile(filename) {
  const siteId = document.getElementById('site-id').value;

  if (filename === 'index.html') {
    showToast('error', 'Cannot delete index.html');
    return;
  }

  if (!confirm(`Are you sure you want to delete ${filename}?`)) {
    return;
  }

  fetch(`/api/site/${siteId}/page/${filename}`, {
    method: 'DELETE'
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      const tab = document.querySelector(`.file-tab[data-filename="${filename}"]`);
      if (tab) {
        tab.remove();
      }

      if (currentFilename === filename) {
        switchToFile('index.html');
      }

      showToast('success', `File ${filename} deleted successfully`);
    } else {
      showToast('error', data.message || 'Error deleting file');
    }
  })
  .catch(error => {
    console.error('Error deleting file:', error);
    showToast('error', 'Error deleting file');
  });
}


let contextMenu = null;
let renameDialog = null;

function setupTabContextMenu() {
  if (!contextMenu) {
    contextMenu = document.createElement('div');
    contextMenu.className = 'tab-context-menu';
    document.body.appendChild(contextMenu);
  }

  if (!renameDialog) {
    renameDialog = document.createElement('div');
    renameDialog.className = 'file-rename-dialog';
    renameDialog.innerHTML = `
      <input type="text" id="newFilenameInput">
      <div class="file-rename-dialog-actions">
        <button class="btn-secondary" id="cancelRename">Cancel</button>
        <button class="btn-primary" id="confirmRename">Rename</button>
      </div>
    `;
    document.body.appendChild(renameDialog);

    document.getElementById('cancelRename').addEventListener('click', () => {
      renameDialog.classList.remove('visible');
    });

    document.getElementById('confirmRename').addEventListener('click', () => {
      const oldFilename = renameDialog.getAttribute('data-filename');
      const newFilename = document.getElementById('newFilenameInput').value.trim();
      renameFile(oldFilename, newFilename);
      renameDialog.classList.remove('visible');
    });
  }

  document.querySelectorAll('.file-tab').forEach(tab => {
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const filename = tab.getAttribute('data-filename');
      showTabContextMenu(filename, e.clientX, e.clientY);
    });
  });

  document.addEventListener('click', () => {
    if (contextMenu) {
      contextMenu.classList.remove('visible');
    }
  });
}

function showTabContextMenu(filename, x, y) {
  if (contextMenu) {
    contextMenu.classList.remove('visible');
  }

  // Build menu items based on file (dont delete this, future Ethan!)
  let menuItems = '';

  menuItems += `<div class="context-menu-item rename-item" data-filename="${filename}">
    <i class="fas fa-edit"></i> Rename
  </div>`;

  if (filename !== 'index.html') {
    menuItems += `<div class="context-menu-item danger delete-item" data-filename="${filename}">
      <i class="fas fa-trash"></i> Delete
    </div>`;
  }

  contextMenu.innerHTML = menuItems;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.add('visible');

  contextMenu.querySelectorAll('.rename-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      showRenameDialog(filename, x, y);
    });
  });

  contextMenu.querySelectorAll('.delete-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFile(filename);
    });
  });
}

function showRenameDialog(filename, x, y) {
  if (contextMenu) {
    contextMenu.classList.remove('visible');
  }

  renameDialog.setAttribute('data-filename', filename);
  document.getElementById('newFilenameInput').value = filename;

  renameDialog.style.left = `${x}px`;
  renameDialog.style.top = `${y}px`;
  renameDialog.classList.add('visible');

  document.getElementById('newFilenameInput').focus();
  document.getElementById('newFilenameInput').select();
}

document.addEventListener('DOMContentLoaded', function() {
  setupTabContextMenu();
});
function renameFile(oldFilename, newFilename) {
  const siteId = document.getElementById('site-id').value;

  if (!newFilename || newFilename.trim() === '') {
    showToast('Filename cannot be empty', 'error');
    return;
  }

  if (oldFilename === 'index.html' && newFilename !== 'index.html') {
    showToast('Cannot rename index.html', 'error');
    return;
  }

  if (oldFilename === newFilename) {
    return;
  }

  const existingTab = document.querySelector(`.file-tab[data-filename="${newFilename}"]`);
  if (existingTab) {
    showToast(`File ${newFilename} already exists`, 'error');
    return;
  }

  const content = fileContents[oldFilename] || '';

  fetch(`/api/site/${siteId}/page/${newFilename}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: content
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      fetch(`/api/site/${siteId}/page/${oldFilename}`, {
        method: 'DELETE'
      })
      .then(response => response.json())
      .then(deleteData => {
        if (deleteData.success) {
          const tab = document.querySelector(`.file-tab[data-filename="${oldFilename}"]`);
          if (tab) {
            tab.setAttribute('data-filename', newFilename);
            tab.textContent = newFilename;

            const fileType = getFileType(newFilename);
            tab.setAttribute('data-filetype', fileType);
          }

          fileContents[newFilename] = content;
          delete fileContents[oldFilename];

          if (currentFilename === oldFilename) {
            currentFilename = newFilename;
            switchToFile(newFilename);
          }

          showToast(`File renamed to ${newFilename}`, 'success');
        } else {
          showToast('Error deleting original file', 'error');
        }
      });
    } else {
      showToast(data.message || 'Error renaming file', 'error');
    }
  })
  .catch(error => {
    console.error('Error renaming file:', error);
    showToast('Error renaming file', 'error');
  });
}