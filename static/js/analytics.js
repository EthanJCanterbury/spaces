

async function loadSiteAnalytics() {
    try {
        const siteId = document.getElementById('site-id').value;
        if (!siteId) {
            showToast('error', 'Could not determine site ID');
            return;
        }

        const response = await fetch(`/api/sites/${siteId}/analytics`);
        if (!response.ok) {
            throw new Error('Failed to fetch analytics data');
        }

        const data = await response.json();

        const analyticsToggle = document.getElementById('analytics-toggle');
        if (analyticsToggle) {
            analyticsToggle.checked = data.analytics_enabled;
        }

        updateViewCount(data.total_views);

    } catch (error) {
        console.error('Error loading analytics:', error);
        showToast('error', 'Failed to load analytics data');
    }
}

function updateViewCount(count) {
    const viewCountElement = document.querySelector('.analytics-count span');
    if (viewCountElement) {
        viewCountElement.textContent = count || 0;
    }
}

async function toggleAnalytics(enabled) {
    try {
        const siteId = document.getElementById('site-id').value;
        if (!siteId) {
            showToast('error', 'Could not determine site ID');
            return;
        }

        const response = await fetch(`/api/sites/${siteId}/analytics/toggle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enabled })
        });

        if (!response.ok) {
            throw new Error('Failed to update analytics settings');
        }

        showToast('success', `Analytics ${enabled ? 'enabled' : 'disabled'} successfully`);
        loadSiteAnalytics();
    } catch (error) {
        console.error('Error toggling analytics:', error);
        showToast('error', 'Failed to update analytics settings');
    }
}

async function clearAnalytics() {
    try {
        const siteId = document.getElementById('site-id').value;
        if (!siteId) {
            showToast('error', 'Could not determine site ID');
            return;
        }

        const response = await fetch(`/api/sites/${siteId}/analytics/clear`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to clear analytics data');
        }

        showToast('success', 'Analytics data cleared successfully');
        loadSiteAnalytics();
    } catch (error) {
        console.error('Error clearing analytics:', error);
        showToast('error', 'Failed to clear analytics data');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const analyticsModal = document.getElementById('analyticsModal');
    if (!analyticsModal) return;
    
    const analyticsToggle = document.getElementById('analytics-toggle');
    if (analyticsToggle) {
        analyticsToggle.addEventListener('change', function() {
            toggleAnalytics(this.checked);
        });
    }

    const clearAnalyticsBtn = document.getElementById('clearAnalyticsBtn');
    if (clearAnalyticsBtn) {
        clearAnalyticsBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to clear all analytics data? This action cannot be undone.')) {
                clearAnalytics();
            }
        });
    }
    
    const analyticsBtn = document.getElementById('analyticsBtn');
    if (analyticsBtn) {
        analyticsBtn.addEventListener('click', function() {
            loadSiteAnalytics();
        });
    }
});
