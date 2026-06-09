/* ==========================================================================
   SyncPaste App Logic - Clean & Robust Refactoring
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // App State
  let currentRoom = localStorage.getItem('syncpaste_room');
  let currentDevice = localStorage.getItem('syncpaste_device');
  let syncInterval = parseInt(localStorage.getItem('syncpaste_interval'));
  let activeType = 'text'; 
  let pastesCache = [];
  let pollTimer = null;

  // Initialize Defaults
  if (currentRoom === null) {
    currentRoom = 'sync-default';
    localStorage.setItem('syncpaste_room', currentRoom);
    setTimeout(() => { openModal(); }, 600);
  }
  
  if (!currentDevice) {
    currentDevice = 'Device-' + Math.floor(100 + Math.random() * 900);
    localStorage.setItem('syncpaste_device', currentDevice);
  }

  if (isNaN(syncInterval)) {
    syncInterval = 5000;
    localStorage.setItem('syncpaste_interval', syncInterval.toString());
  }

  // DOM Elements
  const pasteForm = document.getElementById('pasteForm');
  const pasteContent = document.getElementById('pasteContent');
  const textInputWrapper = document.getElementById('textInputWrapper');
  const fileInputWrapper = document.getElementById('fileInputWrapper');
  const pasteFile = document.getElementById('pasteFile');
  const fileUploadBox = document.querySelector('.file-upload-box');
  const fileHelpText = document.getElementById('fileHelpText');
  const clearTextareaBtn = document.getElementById('clearTextareaBtn');
  const typePills = document.querySelectorAll('.type-pill');
  const languageSelectorRow = document.getElementById('languageSelectorRow');
  const pasteLanguage = document.getElementById('pasteLanguage');
  const pasteExpiration = document.getElementById('pasteExpiration');
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

  const API_ENDPOINT = '/api/paste';

  /* ==========================================================================
     Initialization
     ========================================================================== */
  
  function init() {
    currentRoomDisplay.textContent = currentRoom;
    currentDeviceDisplay.textContent = currentDevice;
    emptyRoomCodeDisplay.textContent = currentRoom;
    
    modalRoomInput.value = currentRoom;
    modalDeviceInput.value = currentDevice;
    syncIntervalSelect.value = syncInterval.toString();

    if (window.lucide) {
      lucide.createIcons();
    }

    fetchPastes();
    startPolling();
  }

  /* ==========================================================================
     Type Selection Logic
     ========================================================================== */
  
  typePills.forEach(pill => {
    pill.addEventListener('click', () => {
      typePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeType = pill.getAttribute('data-type') || 'text';

      if (activeType === 'code') {
        languageSelectorRow.classList.remove('hidden');
      } else {
        languageSelectorRow.classList.add('hidden');
      }

      if (activeType === 'file') {
        textInputWrapper.classList.add('hidden');
        fileInputWrapper.classList.remove('hidden');
        
        const neverOption = pasteExpiration.querySelector('option[value="never"]');
        if (neverOption) {
          neverOption.disabled = true;
          if (pasteExpiration.value === 'never') {
            pasteExpiration.value = '10';
            showToast('Files cannot be kept forever. Auto-delete set to 10 mins.', 'info');
          }
        }
      } else {
        textInputWrapper.classList.remove('hidden');
        fileInputWrapper.classList.add('hidden');
        
        const neverOption = pasteExpiration.querySelector('option[value="never"]');
        if (neverOption) {
          neverOption.disabled = false;
        }
      }
    });
  });

  clearTextareaBtn.addEventListener('click', () => {
    pasteContent.value = '';
    pasteContent.focus();
    showToast('Input cleared', 'info');
  });

  fileUploadBox.addEventListener('click', (e) => {
    if (e.target !== pasteFile) {
      pasteFile.click();
    }
  });

  pasteFile.addEventListener('change', () => {
    const file = pasteFile.files[0];
    if (!file) {
      fileHelpText.textContent = 'Max size: ~4MB (Serverless limit)';
      fileHelpText.style.color = 'var(--text-muted)';
      submitBtn.disabled = false;
      return;
    }
    
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    if (file.size > 4 * 1024 * 1024) {
      fileHelpText.textContent = `Selected: ${file.name} (${sizeInMB} MB) - Limit exceeds!`;
      fileHelpText.style.color = 'var(--danger)';
      submitBtn.disabled = true;
    } else {
      fileHelpText.textContent = `Selected: ${file.name} (${sizeInMB} MB)`;
      fileHelpText.style.color = 'var(--success)';
      submitBtn.disabled = false;
    }
  });

  /* ==========================================================================
     API Calls: Fetch, Submit, Delete
     ========================================================================== */

  async function fetchPastes(silent = false) {
    if (!silent) {
      showLoader();
    }
    
    const icon = syncIndicator.querySelector('i');
    if (icon) icon.classList.add('spin');
    syncStatusText.textContent = 'Syncing...';

    try {
      const response = await fetch(`${API_ENDPOINT}?room=${encodeURIComponent(currentRoom)}`);
      if (!response.ok) throw new Error('Network response error');
      
      const pastes = await response.json();
      pastesCache = Array.isArray(pastes) ? pastes : [];
      
      renderPastes(pastesCache);
      
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      syncStatusText.textContent = `Synced ${timeStr}`;
    } catch (err) {
      console.error('Error fetching pastes:', err);
      showToast('Error syncing with server', 'error');
      syncStatusText.textContent = 'Sync failed';
    } finally {
      if (icon) {
        setTimeout(() => { icon.classList.remove('spin'); }, 600);
      }
    }
  }

  pasteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    let content = '';
    let fileName = '';

    if (activeType === 'file') {
      const file = pasteFile.files[0];
      if (!file) {
        showToast('Please select a file', 'error');
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        showToast('File size must be less than 4MB', 'error');
        return;
      }
      content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      fileName = file.name;
    } else {
      content = pasteContent.value.trim();
      if (!content) {
        showToast('Please enter some content or select a file', 'warning');
        return;
      }
    }

    const originalBtnHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Sending...</span> <div class="spinner" style="width: 14px; height: 14px; border-width: 2px; border-top-color: white;"></div>`;

    const expirationValue = pasteExpiration.value;
    let expiresAt = null;
    if (expirationValue !== 'never') {
      const expiresInMinutes = parseInt(expirationValue) || 10;
      expiresAt = new Date(Date.now() + expiresInMinutes * 60000).toISOString();
    }

    const payload = {
      room: currentRoom,
      content: content,
      fileName: fileName,
      type: activeType,
      language: activeType === 'code' ? pasteLanguage.value : 'plaintext',
      deviceInfo: currentDevice,
      expiresAt: expiresAt
    };

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Error saving paste');

      pasteContent.value = '';
      pasteFile.value = '';
      if (fileHelpText) {
        fileHelpText.textContent = 'Max size: ~4MB (Serverless limit)';
        fileHelpText.style.color = 'var(--text-muted)';
      }
      showToast('Sent successfully!', 'success');
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

  async function deletePaste(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const response = await fetch(`${API_ENDPOINT}?room=${encodeURIComponent(currentRoom)}&id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Delete failed');

      showToast('Item deleted', 'success');
      await fetchPastes(true);
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Failed to delete item', 'error');
    }
  }

  async function clearRoomData() {
    if (!confirm('WARNING: This will permanently delete ALL pastes in this room. Are you sure?')) return;

    try {
      const response = await fetch(`${API_ENDPOINT}?room=${encodeURIComponent(currentRoom)}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Clear failed');

      showToast('Room feed cleared', 'success');
      closeModal();
      await fetchPastes(true);
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
    feedLoader.classList.add('hidden');
    pasteList.querySelectorAll('.paste-card').forEach(c => c.remove());

    // Sanitize and filter out nulls/invalid records
    const validPastes = (pastes || []).filter(p => p && typeof p === 'object' && p.id);

    const searchTerm = feedSearch.value.trim().toLowerCase();
    const filteredPastes = validPastes.filter(paste => {
      if (!searchTerm) return true;
      const content = (paste.content || '').toLowerCase();
      const deviceInfo = (paste.deviceInfo || '').toLowerCase();
      const type = (paste.type || '').toLowerCase();
      const language = (paste.language || '').toLowerCase();
      return (
        content.includes(searchTerm) ||
        deviceInfo.includes(searchTerm) ||
        type.includes(searchTerm) ||
        language.includes(searchTerm)
      );
    });

    if (filteredPastes.length === 0) {
      feedEmpty.classList.remove('hidden');
      return;
    }

    feedEmpty.classList.add('hidden');

    filteredPastes.forEach(paste => {
      const card = document.createElement('article');
      card.className = 'paste-card';
      card.setAttribute('data-id', paste.id);

      const content = paste.content || '';
      const type = paste.type || 'text';
      const language = paste.language || 'plaintext';
      const deviceInfo = paste.deviceInfo || 'Unknown Device';
      const timestamp = paste.timestamp || new Date().toISOString();

      let deviceIcon = 'laptop';
      const nameLower = deviceInfo.toLowerCase();
      if (nameLower.includes('server') || nameLower.includes('vm') || nameLower.includes('node')) {
        deviceIcon = 'server';
      } else if (nameLower.includes('phone') || nameLower.includes('mobile') || nameLower.includes('android') || nameLower.includes('ios')) {
        deviceIcon = 'tablet';
      }

      let headerHTML = `
        <div class="card-header">
          <div class="card-device-info">
            <i data-lucide="${deviceIcon}"></i>
            <span>${escapeHTML(deviceInfo)}</span>
          </div>
          <div class="card-meta">
            <span class="card-time" title="${new Date(timestamp).toLocaleString()}">${getRelativeTime(timestamp)}</span>
            <span class="type-tag ${type}">${type}</span>
          </div>
        </div>
      `;

      let bodyHTML = '<div class="card-body">';
      if (type === 'code') {
        bodyHTML += `
          <div class="code-container">
            <button class="code-copy-btn" data-action="code-copy" title="Copy Code Block">
              <i data-lucide="copy"></i>
            </button>
            <pre><code class="language-${language}">${escapeHTML(content)}</code></pre>
          </div>
        `;
      } else if (type === 'link') {
        let href = content.trim();
        if (!/^https?:\/\//i.test(href)) {
          href = 'http://' + href;
        }
        bodyHTML += `
          <div class="link-content">
            <a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer" class="link-anchor">
              <i data-lucide="external-link"></i> ${escapeHTML(content)}
            </a>
          </div>
        `;
      } else if (type === 'prompt') {
        bodyHTML += `<div class="prompt-content">${escapeHTML(content)}</div>`;
      } else if (type === 'file') {
        const fName = paste.fileName || 'download_file';
        bodyHTML += `
          <div class="file-content">
            <a href="${content}" download="${escapeHTML(fName)}" class="link-anchor" title="Download File">
              <i data-lucide="download-cloud"></i> ${escapeHTML(fName)}
            </a>
          </div>
        `;
      } else {
        bodyHTML += `<div class="text-content">${escapeHTML(content)}</div>`;
      }
      bodyHTML += '</div>';

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

      if (type === 'code') {
        const codeBlock = card.querySelector('pre code');
        if (codeBlock && window.hljs) {
          hljs.highlightElement(codeBlock);
        }
      }
    });

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  /* ==========================================================================
     Event Delegation for Card Actions (Clean & Efficient)
     ========================================================================== */

  pasteList.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const card = btn.closest('.paste-card');
    if (!card) return;

    const id = card.getAttribute('data-id');
    const pasteData = pastesCache.find(p => p.id === id);
    if (!pasteData) return;

    const action = btn.getAttribute('data-action');

    if (action === 'copy' || action === 'code-copy') {
      const success = await copyToClipboard(pasteData.content || '');
      if (success) {
        btn.classList.add('copied');
        const originalHTML = btn.innerHTML;
        if (action === 'copy') {
          btn.innerHTML = '<i data-lucide="check"></i> Copied!';
        } else {
          btn.innerHTML = '<i data-lucide="check"></i>';
        }
        if (window.lucide) lucide.createIcons();
        showToast('Copied to clipboard!', 'success');
        
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = originalHTML;
          if (window.lucide) lucide.createIcons();
        }, 2000);
      } else {
        showToast('Unable to copy', 'error');
      }
    } else if (action === 'delete') {
      deletePaste(id);
    }
  });

  /* ==========================================================================
     Search & Polling Utilities
     ========================================================================== */

  feedSearch.addEventListener('input', () => {
    if (feedSearch.value.trim()) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
    renderPastes(pastesCache);
  });

  clearSearchBtn.addEventListener('click', () => {
    feedSearch.value = '';
    clearSearchBtn.classList.add('hidden');
    renderPastes(pastesCache);
  });

  refreshBtn.addEventListener('click', () => {
    fetchPastes(false);
    showToast('Feed refreshed', 'info');
  });

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

  roomStatusBtn.addEventListener('click', openModal);
  closeModalBtn.addEventListener('click', closeModal);
  
  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) {
      closeModal();
    }
  });

  saveRoomBtn.addEventListener('click', () => {
    const rawVal = modalRoomInput.value.trim().toLowerCase();
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
      fetchPastes(false);
    }
    closeModal();
  });

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

  clearRoomDataBtn.addEventListener('click', clearRoomData);

  /* ==========================================================================
     General Helpers
     ========================================================================== */

  function getRelativeTime(isoString) {
    const now = new Date();
    const past = new Date(isoString);
    const msPerMinute = 60 * 1000;
    const msPerHour = msPerMinute * 60;
    const msPerDay = msPerHour * 24;
    
    const elapsed = now - past;
    
    if (isNaN(elapsed) || elapsed < msPerMinute) {
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

  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('navigator.clipboard failed, falling back', err);
      }
    }
    
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
    
    if (window.lucide) {
      lucide.createIcons();
    }

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => { toast.remove(); }, 200);
    }, 3500);
  }

  init();
});
