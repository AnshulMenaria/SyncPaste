/* ==========================================================================
   SyncPaste App Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // App State
  let currentRoom = localStorage.getItem('syncpaste_room');
  let currentDevice = localStorage.getItem('syncpaste_device');
  let syncInterval = parseInt(localStorage.getItem('syncpaste_interval'));
  let activeType = 'text'; // default type
  let pastesCache = [];
  let pollTimer = null;

  // If variables are not initialized in localStorage, set defaults
  if (currentRoom === null) {
    currentRoom = 'sync-default';
    localStorage.setItem('syncpaste_room', currentRoom);
    // Show settings modal on first-time load to guide the user
    setTimeout(() => { openModal(); }, 600);
  }
  
  if (!currentDevice) {
    // Generate a default device name (e.g., Device-452)
    currentDevice = 'Device-' + Math.floor(100 + Math.random() * 900);
    localStorage.setItem('syncpaste_device', currentDevice);
  }

  if (isNaN(syncInterval)) {
    syncInterval = 5000; // default to 5 seconds
    localStorage.setItem('syncpaste_interval', syncInterval.toString());
  }

  // DOM Elements
  const pasteForm = document.getElementById('pasteForm');
  const pasteContent = document.getElementById('pasteContent');
  const clearTextareaBtn = document.getElementById('clearTextareaBtn');
  const typePills = document.querySelectorAll('.type-pill');
  const languageSelectorRow = document.getElementById('languageSelectorRow');
  const pasteLanguage = document.getElementById('pasteLanguage');
  const submitBtn = document.getElementById('submitBtn');
  
  const currentRoomDisplay = document.getElementById('currentRoomDisplay');
  const roomStatusBtn = document.getElementById('roomStatusBtn');
  const currentDeviceDisplay = document.getElementById('currentDeviceDisplay');
  
  const refreshBtn = document.getElementById('refreshBtn');
  const syncIndicator = document.getElementById('syncIndicator');
  const syncStatusText = document.getElementById('syncStatusText');
  const feedSearch = document.getElementById('feedSearch');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  
  const pasteList = document.getElementById('pasteList');
  const feedLoader = document.getElementById('feedLoader');
  const feedEmpty = document.getElementById('feedEmpty');
  const emptyRoomCodeDisplay = document.querySelector('.empty-room-code');
  
  // Modal Elements
  const configModal = document.getElementById('configModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalRoomInput = document.getElementById('modalRoomInput');
  const saveRoomBtn = document.getElementById('saveRoomBtn');
  const modalDeviceInput = document.getElementById('modalDeviceInput');
  const saveDeviceBtn = document.getElementById('saveDeviceBtn');
  const syncIntervalSelect = document.getElementById('syncIntervalSelect');
  const clearRoomDataBtn = document.getElementById('clearRoomDataBtn');
  const toastContainer = document.getElementById('toastContainer');

  // API Config
  const API_ENDPOINT = '/api/paste';

  /* ==========================================================================
     Initialization
     ========================================================================== */
  
  function init() {
    // Render initial state displays
    currentRoomDisplay.textContent = currentRoom;
    currentDeviceDisplay.textContent = currentDevice;
    emptyRoomCodeDisplay.textContent = currentRoom;
    
    // Set inputs in modal
    modalRoomInput.value = currentRoom;
    modalDeviceInput.value = currentDevice;
    syncIntervalSelect.value = syncInterval.toString();

    // Trigger Lucide SVG replacements
    if (window.lucide) {
      lucide.createIcons();
    }

    // Load feed
    fetchPastes();

    // Start auto polling
    startPolling();
  }

  /* ==========================================================================
     Type Selection Logic
     ========================================================================== */
  
  typePills.forEach(pill => {
    pill.addEventListener('click', () => {
      // Deactivate other pills
      typePills.forEach(p => p.classList.remove('active'));
      
      // Activate clicked pill
      pill.classList.add('active');
      activeType = pill.getAttribute('data-type');

      // Toggle code language selector
      if (activeType === 'code') {
        languageSelectorRow.classList.remove('hidden');
      } else {
        languageSelectorRow.classList.add('hidden');
      }
    });
  });

  // Clear Textarea Action
  clearTextareaBtn.addEventListener('click', () => {
    pasteContent.value = '';
    pasteContent.focus();
    showToast('Input cleared', 'info');
  });

  /* ==========================================================================
     API Calls: Fetch, Submit, Delete
     ========================================================================== */

  // Fetch Feed Pastes
  async function fetchPastes(silent = false) {
    if (!silent) {
      showLoader();
    }
    
    // Animate sync indicator icon
    const icon = syncIndicator.querySelector('i');
    if (icon) icon.classList.add('spin');
    syncStatusText.textContent = 'Syncing...';

    try {
      const response = await fetch(`${API_ENDPOINT}?room=${encodeURIComponent(currentRoom)}`);
      
      if (!response.ok) {
        throw new Error('Network response error');
      }
      
      const pastes = await response.json();
      pastesCache = pastes;
      
      // Render data
      renderPastes(pastes);
      
      // Update sync time text
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      syncStatusText.textContent = `Synced ${timeStr}`;
    } catch (err) {
      console.error('Error fetching pastes:', err);
      showToast('Error syncing with server', 'error');
      syncStatusText.textContent = 'Sync failed';
    } finally {
      if (icon) {
        // Stop spinning after a brief delay for user feedback
        setTimeout(() => {
          icon.classList.remove('spin');
        }, 600);
      }
    }
  }

  // Submit New Paste
  pasteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const content = pasteContent.value.trim();
    if (!content) return;

    // Show loading on submit button
    const originalBtnHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Sending...</span> <div class="spinner" style="width: 14px; height: 14px; border-width: 2px; border-top-color: white;"></div>`;

    const payload = {
      room: currentRoom,
      content: content,
      type: activeType,
      language: activeType === 'code' ? pasteLanguage.value : 'plaintext',
      deviceInfo: currentDevice
    };

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Error saving paste');
      }

      // Clear textarea and reset
      pasteContent.value = '';
      showToast('Sent successfully!', 'success');
      
      // Fetch feed immediately
      await fetchPastes(true);
    } catch (err) {
      console.error('Submission failed:', err);
      showToast('Failed to send paste', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHTML;
      if (window.lucide) lucide.createIcons();
    }
  });

  // Delete Paste
  async function deletePaste(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const response = await fetch(`${API_ENDPOINT}?room=${encodeURIComponent(currentRoom)}&id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Delete failed');
      }

      showToast('Item deleted', 'success');
      // Fetch feed immediately
      fetchPastes(true);
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Failed to delete item', 'error');
    }
  }

  // Clear Room Data
  async function clearRoomData() {
    if (!confirm('WARNING: This will permanently delete ALL pastes in this room. Are you sure you want to continue?')) return;

    try {
      const response = await fetch(`${API_ENDPOINT}?room=${encodeURIComponent(currentRoom)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Clear failed');
      }

      showToast('Room feed cleared', 'success');
      closeModal();
      fetchPastes(true);
    } catch (err) {
      console.error('Clear failed:', err);
      showToast('Failed to clear feed', 'error');
    }
  }

  /* ==========================================================================
     Rendering & UI Formatting
     ========================================================================== */
  
  function showLoader() {
    feedLoader.classList.remove('hidden');
    feedEmpty.classList.add('hidden');
    pasteList.querySelectorAll('.paste-card').forEach(c => c.remove());
  }

  function renderPastes(pastes) {
    // Hide loader
    feedLoader.classList.add('hidden');
    
    // Clear old pastes
    pasteList.querySelectorAll('.paste-card').forEach(c => c.remove());

    // Apply client-side search filter
    const searchTerm = feedSearch.value.trim().toLowerCase();
    const filteredPastes = pastes.filter(paste => {
      if (!searchTerm) return true;
      return (
        paste.content.toLowerCase().includes(searchTerm) ||
        paste.deviceInfo.toLowerCase().includes(searchTerm) ||
        paste.type.toLowerCase().includes(searchTerm) ||
        (paste.language && paste.language.toLowerCase().includes(searchTerm))
      );
    });

    if (filteredPastes.length === 0) {
      feedEmpty.classList.remove('hidden');
      return;
    }

    feedEmpty.classList.add('hidden');

    // Render cards
    filteredPastes.forEach(paste => {
      const card = document.createElement('article');
      card.className = 'paste-card';
      card.setAttribute('data-id', paste.id);

      // Icon determination based on device name
      let deviceIcon = 'laptop';
      const nameLower = paste.deviceInfo.toLowerCase();
      if (nameLower.includes('server') || nameLower.includes('vm') || nameLower.includes('node')) {
        deviceIcon = 'server';
      } else if (nameLower.includes('phone') || nameLower.includes('mobile') || nameLower.includes('android') || nameLower.includes('ios')) {
        deviceIcon = 'tablet';
      }

      // Card Header HTML
      let headerHTML = `
        <div class="card-header">
          <div class="card-device-info">
            <i data-lucide="${deviceIcon}"></i>
            <span>${escapeHTML(paste.deviceInfo)}</span>
          </div>
          <div class="card-meta">
            <span class="card-time" title="${new Date(paste.timestamp).toLocaleString()}">${getRelativeTime(paste.timestamp)}</span>
            <span class="type-tag ${paste.type}">${paste.type}</span>
          </div>
        </div>
      `;

      // Card Body HTML
      let bodyHTML = '<div class="card-body">';
      if (paste.type === 'code') {
        bodyHTML += `
          <div class="code-container">
            <button class="code-copy-btn" data-action="code-copy" title="Copy Code Block">
              <i data-lucide="copy"></i>
            </button>
            <pre><code class="language-${paste.language}">${escapeHTML(paste.content)}</code></pre>
          </div>
        `;
      } else if (paste.type === 'link') {
        // Link checking
        let href = paste.content.trim();
        if (!/^https?:\/\//i.test(href)) {
          href = 'http://' + href;
        }
        bodyHTML += `
          <div class="link-content">
            <a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer" class="link-anchor">
              <i data-lucide="external-link"></i> ${escapeHTML(paste.content)}
            </a>
          </div>
        `;
      } else if (paste.type === 'prompt') {
        bodyHTML += `<div class="prompt-content">${escapeHTML(paste.content)}</div>`;
      } else {
        bodyHTML += `<div class="text-content">${escapeHTML(paste.content)}</div>`;
      }
      bodyHTML += '</div>';

      // Card Footer HTML
      let footerHTML = `
        <div class="card-footer">
          <button class="action-btn delete-btn" data-action="delete" title="Delete from Feed">
            <i data-lucide="trash"></i> Delete
          </button>
          <button class="action-btn copy-btn" data-action="copy" title="Copy to Clipboard">
            <i data-lucide="copy"></i> Copy
          </button>
        </div>
      `;

      card.innerHTML = headerHTML + bodyHTML + footerHTML;
      pasteList.appendChild(card);

      // Trigger Highlight.js if it is code
      if (paste.type === 'code') {
        const codeBlock = card.querySelector('pre code');
        if (codeBlock && window.hljs) {
          hljs.highlightElement(codeBlock);
        }
      }
    });

    // Re-create icons for new elements
    if (window.lucide) {
      lucide.createIcons();
    }

    // Attach event listeners to card buttons
    attachCardListeners();
  }

  // Attach card click handlers
  function attachCardListeners() {
    const cards = pasteList.querySelectorAll('.paste-card');
    cards.forEach(card => {
      const id = card.getAttribute('data-id');
      const pasteData = pastesCache.find(p => p.id === id);
      if (!pasteData) return;

      // Copy Action
      const copyBtn = card.querySelector('.copy-btn');
      copyBtn.addEventListener('click', async () => {
        const success = await copyToClipboard(pasteData.content);
        if (success) {
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = '<i data-lucide="check"></i> Copied!';
          if (window.lucide) lucide.createIcons();
          showToast('Copied to clipboard!', 'success');
          
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = '<i data-lucide="copy"></i> Copy';
            if (window.lucide) lucide.createIcons();
          }, 2000);
        } else {
          showToast('Unable to copy', 'error');
        }
      });

      // Copy Action (Floating Code Block Copy)
      const codeCopyBtn = card.querySelector('.code-copy-btn');
      if (codeCopyBtn) {
        codeCopyBtn.addEventListener('click', async () => {
          const success = await copyToClipboard(pasteData.content);
          if (success) {
            codeCopyBtn.classList.add('copied');
            codeCopyBtn.innerHTML = '<i data-lucide="check"></i>';
            if (window.lucide) lucide.createIcons();
            showToast('Copied code block!', 'success');
            
            setTimeout(() => {
              codeCopyBtn.classList.remove('copied');
              codeCopyBtn.innerHTML = '<i data-lucide="copy"></i>';
              if (window.lucide) lucide.createIcons();
            }, 2000);
          } else {
            showToast('Unable to copy', 'error');
          }
        });
      }

      // Delete Action
      const deleteBtn = card.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', () => {
        deletePaste(id);
      });
    });
  }

  /* ==========================================================================
     Search & Polling Utilities
     ========================================================================== */

  // Search input listeners
  feedSearch.addEventListener('input', () => {
    if (feedSearch.value.trim()) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
    // Filter currently loaded cards
    renderPastes(pastesCache);
  });

  clearSearchBtn.addEventListener('click', () => {
    feedSearch.value = '';
    clearSearchBtn.classList.add('hidden');
    renderPastes(pastesCache);
  });

  // Sync / Refresh buttons
  refreshBtn.addEventListener('click', () => {
    fetchPastes(false);
    showToast('Feed refreshed', 'info');
  });

  // Background Polling Management
  function startPolling() {
    stopPolling();
    if (syncInterval > 0) {
      pollTimer = setInterval(() => {
        fetchPastes(true);
      }, syncInterval);
    }
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /* ==========================================================================
     Modal Config Handlers
     ========================================================================== */

  function openModal() {
    configModal.classList.remove('hidden');
    modalRoomInput.value = currentRoom;
    modalDeviceInput.value = currentDevice;
    syncIntervalSelect.value = syncInterval.toString();
  }

  function closeModal() {
    configModal.classList.add('hidden');
  }

  // Room status badge trigger click
  roomStatusBtn.addEventListener('click', openModal);
  closeModalBtn.addEventListener('click', closeModal);
  
  // Close modal when clicking outside card
  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) {
      closeModal();
    }
  });

  // Save Room Configuration
  saveRoomBtn.addEventListener('click', () => {
    const rawVal = modalRoomInput.value.trim().toLowerCase();
    // Validate: alphanumeric and hyphens/underscores only
    const cleanVal = rawVal.replace(/[^a-z0-9-_]/g, '');
    
    if (!cleanVal) {
      showToast('Invalid Room Code', 'error');
      return;
    }

    if (cleanVal !== currentRoom) {
      currentRoom = cleanVal;
      localStorage.setItem('syncpaste_room', currentRoom);
      currentRoomDisplay.textContent = currentRoom;
      emptyRoomCodeDisplay.textContent = currentRoom;
      
      showToast(`Switched to Room: ${currentRoom}`, 'success');
      // Fetch new room items
      fetchPastes(false);
    }
    
    closeModal();
  });

  // Save Device Configuration
  saveDeviceBtn.addEventListener('click', () => {
    const val = modalDeviceInput.value.trim();
    if (!val) {
      showToast('Device name cannot be empty', 'error');
      return;
    }

    currentDevice = val;
    localStorage.setItem('syncpaste_device', currentDevice);
    currentDeviceDisplay.textContent = currentDevice;
    showToast(`Device name saved: ${currentDevice}`, 'success');
    closeModal();
  });

  // Save Sync Interval Configuration
  syncIntervalSelect.addEventListener('change', () => {
    const val = parseInt(syncIntervalSelect.value);
    syncInterval = val;
    localStorage.setItem('syncpaste_interval', syncInterval.toString());
    
    startPolling();
    
    if (val === 0) {
      showToast('Auto sync disabled. Manual refresh only.', 'warning');
    } else {
      showToast(`Sync rate updated: every ${val/1000}s`, 'success');
    }
  });

  // Dangerous clear room action
  clearRoomDataBtn.addEventListener('click', clearRoomData);

  /* ==========================================================================
     General Helpers
     ========================================================================== */

  // Relative Time String Generator
  function getRelativeTime(isoString) {
    const now = new Date();
    const past = new Date(isoString);
    const msPerMinute = 60 * 1000;
    const msPerHour = msPerMinute * 60;
    const msPerDay = msPerHour * 24;
    
    const elapsed = now - past;
    
    // Prevent negative bounds due to laptop clock deviations
    if (elapsed < 0) {
      return 'Just now';
    }
    
    if (elapsed < msPerMinute) {
      return 'Just now';
    } else if (elapsed < msPerHour) {
      const mins = Math.round(elapsed / msPerMinute);
      return `${mins}m ago`;
    } else if (elapsed < msPerDay) {
      const hours = Math.round(elapsed / msPerHour);
      return `${hours}h ago`;
    } else {
      const days = Math.round(elapsed / msPerDay);
      return `${days}d ago`;
    }
  }

  // HTML Escaping Utility
  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // Copy Clipboard Helper with Fallback
  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('navigator.clipboard failed, falling back', err);
      }
    }
    
    // Fallback: create temporary text area
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-99999px';
    textArea.style.top = '-99999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      textArea.remove();
      return successful;
    } catch (err) {
      console.error('Fallback copy failed', err);
      textArea.remove();
      return false;
    }
  }

  // Toast System Generator
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-triangle';
    if (type === 'warning') iconName = 'alert-circle';

    toast.innerHTML = `
      <div class="toast-icon ${type}">
        <i data-lucide="${iconName}"></i>
      </div>
      <div class="toast-message">${escapeHTML(message)}</div>
    `;

    toastContainer.appendChild(toast);
    
    // Refresh icons inside toast
    if (window.lucide) {
      lucide.createIcons();
    }

    // Auto-remove toast
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => {
        toast.remove();
      }, 200);
    }, 3500);
  }

  // Initialize App
  init();
});
