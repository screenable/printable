# Helpers

This directory contains utility helpers for the application.

## Voucher Helper

The `VoucherHelper` class provides a simple interface for fetching voucher codes from the Screenable Voucher API.

### Configuration

Add the following environment variables to your `.env` file:

```env
VOUCHER_API_BASE_URL=https://api.screenable.io
VOUCHER_API_KEY=your-api-key-here
```

### Usage

#### Basic Usage

```typescript
import { VoucherHelper } from './helpers/voucher-helper';

// Initialize the helper
const voucherHelper = new VoucherHelper(
  'https://api.screenable.io',
  'your-api-key-here'
);

// Fetch a voucher code for a specific category
const code = await voucherHelper.getVoucherCode('5001');
console.log('Voucher code:', code);
```

#### Multiple Categories

```typescript
// Fetch voucher codes for multiple categories at once
const categories = ['5001', '5002', '5003'];
const results = await voucherHelper.getVoucherCodes(categories);

results.forEach((code, category) => {
  console.log(`Category ${category}: ${code}`);
});
```

#### Integration with Webhook Plugin

The `VoucherHelper` is automatically initialized in the webhook plugin when `VOUCHER_API_KEY` is configured. When a button press occurs, it will:

1. Check if VoucherHelper is available
2. Fetch a voucher code from the API for the specified category
3. Use the voucher code in the webhook request
4. Fall back to random code generation if the API request fails

### API Reference

#### `VoucherHelper`

##### Constructor

```typescript
constructor(baseURL: string, apiKey: string)
```

- `baseURL`: The base URL of the voucher API (e.g., `https://api.screenable.io`)
- `apiKey`: Your API key for authentication

##### Methods

###### `getVoucherCode(category: string): Promise<string | null>`

Fetches a valid voucher code for a specific category.

- **Parameters:**
  - `category`: The category identifier for the voucher (e.g., '5001')
- **Returns:** The voucher code as a string, or `null` if the request fails

###### `getVoucherCodes(categories: string[]): Promise<Map<string, string | null>>`

Fetches voucher codes for multiple categories in parallel.

- **Parameters:**
  - `categories`: Array of category identifiers
- **Returns:** A Map with category as key and voucher code (or `null`) as value

### Error Handling

The `VoucherHelper` handles errors gracefully:

- Network errors are caught and logged to the console
- Failed requests return `null` instead of throwing exceptions
- This allows your application to continue functioning even when the voucher API is unavailable

### Example: Custom Category Selection

You can modify the category based on your business logic:

```typescript
const onPress = async () => {
  const category = determineCategory(); // Your custom logic
  const code = await voucherHelper.getVoucherCode(category);
  
  if (code) {
    // Use the code
  } else {
    // Handle fallback
  }
};
```

## Auto-Updater

The `auto-updater` module provides automatic update checking and installation from GitHub releases.

### Configuration

Add the following environment variables to your `.env` file:

```env
GITHUB_OWNER=screenable
GITHUB_REPO=printable
GITHUB_TOKEN=ghp_your_github_token_here
AUTO_UPDATE_ENABLED=true
AUTO_UPDATE_APPLY=false
```

- `GITHUB_OWNER`: The GitHub repository owner
- `GITHUB_REPO`: The GitHub repository name
- `GITHUB_TOKEN`: GitHub personal access token (required for private repositories)
- `AUTO_UPDATE_ENABLED`: Set to `true` to enable auto-update checks on startup
- `AUTO_UPDATE_APPLY`: Set to `true` to automatically apply updates (default: `false`)

#### GitHub Token for Private Repositories

For private repositories, you must provide a GitHub personal access token with `repo` scope:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `repo` scope
3. Add the token to your `.env` file as `GITHUB_TOKEN`

Without a token, the auto-updater will fail to fetch releases from private repositories.

### How It Works

When the application starts:

1. If `AUTO_UPDATE_ENABLED=true`, it checks the GitHub API for the latest release
2. Compares the current version (from `package.json`) with the latest release version
3. If a newer version is available:
   - **AUTO_UPDATE_APPLY=false**: Logs the update availability and instructions
   - **AUTO_UPDATE_APPLY=true**: Automatically downloads and applies the update using git

### Usage

The auto-updater runs automatically on application startup. No code changes are needed.

### API Reference

#### `getCurrentVersion(): string`

Returns the current version from `package.json`.

#### `getLatestRelease(owner: string, repo: string, token?: string): Promise<GitHubRelease | null>`

Fetches the latest release from GitHub.

- **Parameters:**
  - `owner`: GitHub repository owner
  - `repo`: GitHub repository name
  - `token`: Optional GitHub personal access token (required for private repos)
- **Returns:** The latest release object or `null` if no releases exist

#### `compareVersions(v1: string, v2: string): number`

Compares two semantic versions.

- **Parameters:**
  - `v1`: First version string
  - `v2`: Second version string
- **Returns:** `1` if v1 > v2, `-1` if v1 < v2, `0` if equal

#### `checkForUpdates(owner: string, repo: string, token?: string): Promise<UpdateInfo>`

Checks if an update is available.

- **Parameters:**
  - `owner`: GitHub repository owner
  - `repo`: GitHub repository name
  - `token`: Optional GitHub personal access token (required for private repos)
- **Returns:** Object with `updateAvailable`, `latestVersion`, and `currentVersion`

#### `autoUpdate(owner: string, repo: string, autoApply?: boolean, token?: string): Promise<void>`

Main auto-update function that checks and optionally applies updates.

- **Parameters:**
  - `owner`: GitHub repository owner
  - `repo`: GitHub repository name
  - `autoApply`: If `true`, automatically applies the update (default: `false`)
  - `token`: Optional GitHub personal access token (required for private repos)

### Security Considerations

- The auto-updater only works with git repositories
- Updates are applied via `git checkout <tag>`, ensuring authenticity
- Always review changes before setting `AUTO_UPDATE_APPLY=true`
- Failed updates won't crash the application; it will continue with the current version

