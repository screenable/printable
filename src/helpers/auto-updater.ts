import axios from 'axios';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

/**
 * Gets the current version from package.json
 */
export function getCurrentVersion(): string {
  const packageJsonPath = join(process.cwd(), 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error('package.json not found');
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.version || '0.0.0';
}

/**
 * Fetches the latest release from GitHub
 */
export async function getLatestRelease(
  owner: string,
  repo: string,
  token?: string,
): Promise<GitHubRelease | null> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const headers: Record<string, string> = {
      'User-Agent': 'printable-auto-updater',
      Accept: 'application/vnd.github.v3+json',
    };
    
    // Add authorization header if token is provided (required for private repos)
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    const response = await axios.get<GitHubRelease>(url, {
      headers,
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      // No releases found
      return null;
    }
    throw error;
  }
}

/**
 * Compares two semantic versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const normalize = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const parts1 = normalize(v1);
  const parts2 = normalize(v2);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Checks if an update is available
 */
export async function checkForUpdates(
  owner: string,
  repo: string,
  token?: string,
): Promise<{ updateAvailable: boolean; latestVersion?: string; currentVersion: string }> {
  const currentVersion = getCurrentVersion();
  const latestRelease = await getLatestRelease(owner, repo, token);

  if (!latestRelease) {
    return { updateAvailable: false, currentVersion };
  }

  const latestVersion = latestRelease.tag_name.replace(/^v/, '');
  const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;

  return {
    updateAvailable,
    latestVersion,
    currentVersion,
  };
}

/**
 * Updates the application by pulling the latest changes from git
 * This assumes the application is running in a git repository
 */
export function updateApplication(): void {
  try {
    console.log('Fetching latest changes from git...');
    execSync('git fetch --tags', { stdio: 'inherit' });
    
    const latestTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim();
    
    // Validate tag format (should match semantic versioning pattern)
    if (!/^v?\d+\.\d+\.\d+/.test(latestTag)) {
      throw new Error(`Invalid tag format: ${latestTag}`);
    }
    
    console.log(`Checking out latest tag: ${latestTag}`);
    
    execSync(`git checkout ${latestTag}`, { stdio: 'inherit' });
    
    console.log('Installing dependencies...');
    execSync('npm ci', { stdio: 'inherit' });
    
    console.log('Building application...');
    execSync('npm run build', { stdio: 'inherit' });
    
    console.log('Update completed successfully!');
    console.log('Restarting application is required to use the new version.');
    console.log('The application will now exit. Please restart it manually or via your process manager.');
    
    // Exit to allow process manager (systemd, pm2, etc.) to restart the app
    process.exit(0);
  } catch (error) {
    console.error('Error during update:', error);
    throw error;
  }
}

/**
 * Main auto-update function
 * Checks for updates and applies them if available
 */
export async function autoUpdate(
  owner: string,
  repo: string,
  autoApply = false,
  token?: string,
): Promise<void> {
  console.log('Checking for updates...');
  
  const updateInfo = await checkForUpdates(owner, repo, token);
  
  if (updateInfo.updateAvailable) {
    console.log(`Update available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}`);
    
    if (autoApply) {
      console.log('Auto-applying update...');
      updateApplication();
      // Note: updateApplication() will exit the process, so this line won't be reached
    } else {
      console.log('To update, run: git fetch --tags && git checkout <latest-tag> && npm ci && npm run build');
    }
  } else {
    console.log(`Application is up to date (version ${updateInfo.currentVersion})`);
  }
}
