async function saveContent() {
    if (!currentFile) return;

    try {
        const content = editor.getValue();
        fileContents[currentFile] = content;

        const siteId = document.getElementById('site-id').value;

        const response = await fetch(`/api/site/${siteId}/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename: currentFile,
                content: content
            }),
        });

        if (!response.ok) throw new Error(`Failed to save ${currentFile}`);
        showNotification(`Changes to ${currentFile} saved successfully!`, 'success');

        // Use delayed update to ensure server has time to process changes
        if (siteType === 'web') {
            delayedUpdatePreview();
        }
    } catch (error) {
        console.error(`Error saving ${currentFile}`);
        showNotification(`Error saving ${currentFile}`, 'error');
    }
}


function updatePreview() {
    // Get the preview iframe
    const previewFrame = document.getElementById('preview');
    if (!previewFrame) return;

    // Force reload by setting the same src again
    const currentSrc = previewFrame.src;
    if (currentSrc) {
        // Add or update a timestamp parameter to prevent caching
        const timestamp = new Date().getTime();
        const srcUrl = new URL(currentSrc);
        srcUrl.searchParams.set('t', timestamp);
        previewFrame.src = srcUrl.toString();
    }
}

function delayedUpdatePreview() {
    setTimeout(updatePreview, 500); // Adjust delay as needed
}

function showNotification(message, type) {
    // Call the global showToast with correct parameter order
    window.showToast(type, message);
}

// ... rest of the file (assumed to contain declarations for currentFile, editor, fileContents, siteType, showToast, and potentially the preview-frame element) ...