import { landmarkService } from './interfaces.js';
import { getSettings, SETTINGS_KEY } from './utils.js';
import { i18n } from './lion.js';

class CachingNotification {
  /**
   * Provides non-blocking UI feedback for background processing
   */

  constructor() {
    this.notification = document.getElementById('caching-notification');
    this.dismissButton = document.getElementById('dismiss-caching');
    this.isVisible = false;
    this.autoHideTimer = null;
    this.statusCheckTimer = null;
    this.activeRequests = new Set();
    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.dismissButton) {
      this.dismissButton.addEventListener('click', () => {
        this.hide();
      });
    }
  }

  /**
   * Show caching notification for background processing
   * @param {string} requestId - Unique identifier for the request
   */
  show(requestId = null) {
    if (requestId) {
      this.activeRequests.add(requestId);
    }

    if (this.isVisible) {
      // Already showing, just extend the timer
      this.resetAutoHideTimer();
      return;
    }

    this.isVisible = true;
    this.notification.classList.remove('hidden');

    // Auto-hide after 30 seconds (typical GPT processing time)
    this.resetAutoHideTimer();

    // Start checking for cache updates
    this.startStatusCheck();
  }

  /**
   * Hide the notification
   * @param {string} requestId - Optional request ID to remove from active set
   */
  hide(requestId = null) {
    if (requestId) {
      this.activeRequests.delete(requestId);

      // Don't hide if there are other active requests
      if (this.activeRequests.size > 0) return;
    } else {
      // Manual dismiss - clear all active requests
      this.activeRequests.clear();
    }

    this.isVisible = false;
    this.notification.classList.add('hidden');

    this.clearTimers();
  }

  /**
   * Reset the auto-hide timer
   */
  resetAutoHideTimer() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
    }

    this.autoHideTimer = setTimeout(() => {
      this.hide();
    }, 30000);
  }

  /**
   * Start periodic status checking
   */
  startStatusCheck() {
    // Check status every 3 seconds for more responsive updates
    this.statusCheckTimer = setInterval(() => {
      this.checkForUpdates();
    }, 3000);
  }

  /**
   * Check status and update UI if needed
   */
  async checkForUpdates() {
    try {
      if (await landmarkService.updateStatus()) {
        this.notifyUpdated();
        this.hide();
      }
    } catch (error) {
      console.warn('Failed to update notification:', error.message);
    }
  }

  /**
   * Notify other components on updated status
   */
  notifyUpdated() {
    // Dispatch a custom event that other components can listen to
    window.dispatchEvent(
      new CustomEvent('CachingNotification_updated', {
        detail: { timestamp: Date.now() },
      })
    );
  }

  /**
   * Clear all timers
   */
  clearTimers() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }

    if (this.statusCheckTimer) {
      clearInterval(this.statusCheckTimer);
      this.statusCheckTimer = null;
    }
  }

  /**
   * Clean up when component is destroyed
   */
  destroy() {
    this.clearTimers();
    this.activeRequests.clear();
  }
}

export const cachingNotification = new CachingNotification();

class SettingDialog {
  constructor() {
    this.dialog = document.getElementById('settings-dialog');
    this.tableBody = this.dialog?.querySelector('#settings-table tbody');
    this.addBtn = this.dialog?.querySelector('#add-setting-btn');
    this.closeBtn = this.dialog?.querySelector('#close-btn');
    this.statusMessage = this.dialog?.querySelector('#status-message');

    // List of required API keys
    this.requiredKeys = ['GOOGLE_MAPS_API_KEY', 'OPENAI_API_KEY'];
    this.settings = {};
    this.setupListeners();
  }

  setupListeners() {
    this.tableBody?.addEventListener('input', (event) => {
      if (event.target.tagName === 'INPUT') {
        this.settings[event.target.dataset.key] = event.target.value;
      }
    });

    this.tableBody?.addEventListener('click', (event) => {
      const deleteButton = event.target.closest('.icon-btn');
      if (deleteButton && deleteButton.dataset.action === 'delete-setting') {
        const keyToDelete = deleteButton.dataset.key;
        const confirmMessage = i18n.t('SettingDialog.delete_confirm', {
          key: keyToDelete,
        });
        if (confirm(confirmMessage)) {
          delete this.settings[keyToDelete];
          this.save();
          this.renderTable();
        }
      }
    });

    this.addBtn?.addEventListener('click', () => {
      const newKey = prompt(i18n.t('SettingDialog.new_setting_prompt'));
      if (newKey && newKey.trim() !== '') {
        if (Object.prototype.hasOwnProperty.call(this.settings, newKey)) {
          alert(i18n.t('SettingDialog.duplicate_key_alert'));
        } else {
          this.settings[newKey] = '';
          this.save();
          this.renderTable();
        }
      }
    });
  }

  save() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));

    if (this.statusMessage) {
      this.statusMessage.style.opacity = 1;

      // Hide it after a short delay
      setTimeout(() => {
        this.statusMessage.style.opacity = 0;
      }, 1500);
    }
  }

  renderTable() {
    if (!this.tableBody) return;
    this.tableBody.innerHTML = '';
    const keys = Object.keys(this.settings).sort();

    keys.forEach((key) => {
      const value = this.settings[key];
      const tr = document.createElement('tr');

      const tdLabel = document.createElement('td');
      const strkey = `Settings.${key}`;
      const strval = i18n.t(strkey);
      tdLabel.textContent = strval === strkey ? key : strval;
      tr.appendChild(tdLabel);

      const tdInput = document.createElement('td');
      tdInput.style.display = 'flex';
      tdInput.style.justifyContent = 'space-between';
      tdInput.style.alignItems = 'center';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = value || '';
      input.dataset.key = key;

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.dataset.action = 'delete-setting';
      delBtn.setAttribute('data-i18n-title', 'tooltips.delete_setting');
      delBtn.title = i18n.t('tooltips.delete_setting');
      delBtn.dataset.key = key;
      delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.134H8.09a2.09 2.09 0 00-2.09 2.134v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`;

      tdInput.appendChild(input);
      tdInput.appendChild(delBtn);
      tr.appendChild(tdInput);
      this.tableBody.appendChild(tr);
    });
  }

  async show() {
    this.settings = getSettings();
    this.renderTable();
    this.dialog.classList.remove('hidden');

    // Wait for user to save settings
    await this.waitForSave();
    this.dialog.classList.add('hidden');
  }

  waitForSave() {
    return new Promise((resolve) => {
      // Closure to handle both click and Esc key
      const onClose = () => {
        this.save();
        resolve();
      };

      this.closeBtn?.addEventListener('click', onClose, { once: true });

      const handleKeyDown = (event) => {
        if (event.key === 'Escape' || event.key === 'Esc') {
          onClose();
        }
      };
      document.addEventListener('keydown', handleKeyDown, { once: true });
    });
  }

  async require() {
    this.settings = getSettings();

    // Check for missing required keys
    const missingKeys = this.requiredKeys.filter(
      (key) =>
        !window.APP_CONFIG[key] &&
        (!this.settings[key] || this.settings[key].trim() === '')
    );

    if (missingKeys.length > 0) {
      // Add missing required keys with empty values
      missingKeys.forEach((key) => {
        this.settings[key] = '';
      });

      // Save the updated settings with empty values for missing keys
      this.save();

      // Show the dialog with prefilled empty values
      await this.show();
    }
  }
}

export const settingDialog = new SettingDialog();
