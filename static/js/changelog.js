
async function showChangelogModal() {
    const lastVersion = getCookie('changelog_version');
    const response = await fetch('/api/changelog');
    const data = await response.json();
    
    if (data.version === lastVersion) {
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'changelog-modal';
    modal.innerHTML = `
        <div class="changelog-content">
            <div class="changelog-body">${data.content}</div>
            <button class="btn-primary" onclick="closeChangelogModal(this)">Okay Cool!</button>
        </div>
    `;
    document.body.appendChild(modal);
    setCookie('changelog_version', data.version, 365);
}

function closeChangelogModal(btn) {
    btn.closest('.changelog-modal').remove();
}

function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${date.toUTCString()};path=/`;
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

document.addEventListener('DOMContentLoaded', showChangelogModal);
