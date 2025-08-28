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

    function displayDialogIds(dialogIds) {
        if (!dialogIds || dialogIds.length === 0) {
            return '<div class="no-data">No dialog IDs found</div>';
        }

        return dialogIds.map(item => `
            <div class="appeal-item dialog-item">
                <div class="appeal-id">Dialog ID: <strong>${item.dialogId}</strong></div>
                <div class="appeal-time">${item.isoTimestamp}</div>
                <div class="appeal-url">${item.url}</div>
            </div>
        `).join('');
    }

    function displayAllData(appealIds, dialogIds) {
        let html = '<h3>Appeal IDs</h3>';
        if (!appealIds || appealIds.length === 0) {
            html += '<div class="no-data">No appeal IDs found</div>';
        } else {
            html += appealIds.map(item => `
                <div class="appeal-item">
                    <div class="appeal-id">Appeal ID: <strong>${item.appealId}</strong></div>
                    <div class="appeal-time">${item.isoTimestamp}</div>
                    <div class="appeal-url">${item.url}</div>
                </div>
            `).join('');
        }

        html += '<h3>Dialog IDs</h3>';
        html += displayDialogIds(dialogIds);

        appealsList.innerHTML = html;
    }

    function loadAppealIds() {
        chrome.storage.local.get(['appealIds', 'dialogIds'], function(result) {
            const appealIds = result.appealIds || [];
            const dialogIds = result.dialogIds || [];
            displayAllData(appealIds, dialogIds);
            status.textContent = `Found ${appealIds.length} appeal IDs and ${dialogIds.length} dialog IDs`;
            status.className = (appealIds.length > 0 || dialogIds.length > 0) ? 'success' : '';
        });
    }

    actionBtn.addEventListener('click', function() {
        status.textContent = 'Loading data...';
        status.className = '';

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const activeTab = tabs[0];
            
            chrome.tabs.sendMessage(activeTab.id, {
                action: 'getAllData'
            }, function(response) {
                if (chrome.runtime.lastError) {
                    status.textContent = 'Error: Make sure you are on omnichat.rt.ru';
                    status.className = 'error';
                } else if (response && response.success) {
                    displayAllData(response.appealIds, response.dialogIds);
                    status.textContent = `Found ${response.appealIds.length} appeal IDs and ${response.dialogIds.length} dialog IDs`;
                    status.className = (response.appealIds.length > 0 || response.dialogIds.length > 0) ? 'success' : '';
                } else {
                    loadAppealIds();
                }
            });
        });
    });

    clearBtn.addEventListener('click', function() {
        chrome.storage.local.remove(['appealIds', 'dialogIds'], function() {
            appealsList.innerHTML = '<div class="no-data">All data cleared</div>';
            status.textContent = 'History cleared';
            status.className = 'success';
        });
    });

    loadAppealIds();
});