/**
 * PWA Update Service
 * Checks for app updates without forcing reload
 */
import { API_PREFIX } from '../lib/constants';

const APP_VERSION_KEY = 'app-version';

export async function checkForUpdates(): Promise<{
  updateAvailable: boolean;
  newVersion?: string;
}> {
  try {
    const response = await fetch(`${API_PREFIX}/health`);
    if (!response.ok) throw new Error('Health check failed');

    const { version } = await response.json();
    const currentVersion = localStorage.getItem(APP_VERSION_KEY);

    if (version && version !== currentVersion) {
      console.log(`Update available: ${currentVersion} → ${version}`);
      localStorage.setItem(APP_VERSION_KEY, version);

      // Trigger service worker update
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SKIP_WAITING',
        });
        return { updateAvailable: true, newVersion: version };
      }
    }

    return { updateAvailable: false };
  } catch (error) {
    console.error('Failed to check for updates:', error);
    return { updateAvailable: false };
  }
}

export function initUpdateChecker(intervalMs = 3600000): void {
  // Check on load
  checkForUpdates();

  // Check hourly
  setInterval(checkForUpdates, intervalMs);

  // Listen for service worker updates
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'UPDATE_AVAILABLE') {
        console.log('Update ready, will apply on next reload');
        // Optionally show notification to user
      }
    });
  }
}
