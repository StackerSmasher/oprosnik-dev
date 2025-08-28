document.addEventListener('DOMContentLoaded', function() {
    const actionBtn = document.getElementById('actionBtn');
    const clearBtn = document.getElementById('clearBtn');
    const status = document.getElementById('status');
    const appealsList = document.getElementById('appealsList');

    function displayAppealIds(appealIds) {
        if (!appealIds || appealIds.length === 0) {
            appealsList.innerHTML = '<div class="no-data">No appeal IDs found</div>';
            return;
        }

        const html = appealIds.map(item => `
            <div class="appeal-item">
                <div class="appeal-id">Appeal ID: <strong>${item.appealId}</strong></div>
                <div class="appeal-time">${item.isoTimestamp}</div>
                <div class="appeal-url">${item.url}</div>
            </div>
        `).join('');

        appealsList.innerHTML = html;
    }

    function loadAppealIds() {
        chrome.storage.local.get(['appealIds'], function(result) {
            const appealIds = result.appealIds || [];
            displayAppealIds(appealIds);
            status.textContent = `Found ${appealIds.length} appeal IDs`;
            status.className = appealIds.length > 0 ? 'success' : '';
        });
    }

    actionBtn.addEventListener('click', function() {
        status.textContent = 'Loading appeal IDs...';
        status.className = '';

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const activeTab = tabs[0];
            
            chrome.tabs.sendMessage(activeTab.id, {
                action: 'getAppealIds'
            }, function(response) {
                if (chrome.runtime.lastError) {
                    status.textContent = 'Error: Make sure you are on omnichat.rt.ru';
                    status.className = 'error';
                } else if (response && response.success) {
                    displayAppealIds(response.appealIds);
                    status.textContent = `Found ${response.appealIds.length} appeal IDs`;
                    status.className = response.appealIds.length > 0 ? 'success' : '';
                } else {
                    loadAppealIds();
                }
            });
        });
    });

    clearBtn.addEventListener('click', function() {
        chrome.storage.local.remove(['appealIds'], function() {
            appealsList.innerHTML = '<div class="no-data">Appeal IDs cleared</div>';
            status.textContent = 'History cleared';
            status.className = 'success';
        });
    });

    loadAppealIds();
});