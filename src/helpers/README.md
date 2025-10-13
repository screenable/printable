# Voucher Helper

The `VoucherHelper` class provides a simple interface for fetching voucher codes from the Screenable Voucher API.

## Configuration

Add the following environment variables to your `.env` file:

```env
VOUCHER_API_BASE_URL=https://api.screenable.io
VOUCHER_API_KEY=your-api-key-here
```

## Usage

### Basic Usage

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

### Multiple Categories

```typescript
// Fetch voucher codes for multiple categories at once
const categories = ['5001', '5002', '5003'];
const results = await voucherHelper.getVoucherCodes(categories);

results.forEach((code, category) => {
  console.log(`Category ${category}: ${code}`);
});
```

### Integration with Webhook Plugin

The `VoucherHelper` is automatically initialized in the webhook plugin when `VOUCHER_API_KEY` is configured. When a button press occurs, it will:

1. Check if VoucherHelper is available
2. Fetch a voucher code from the API for the specified category
3. Use the voucher code in the webhook request
4. Fall back to random code generation if the API request fails

## API Reference

### `VoucherHelper`

#### Constructor

```typescript
constructor(baseURL: string, apiKey: string)
```

- `baseURL`: The base URL of the voucher API (e.g., `https://api.screenable.io`)
- `apiKey`: Your API key for authentication

#### Methods

##### `getVoucherCode(category: string): Promise<string | null>`

Fetches a valid voucher code for a specific category.

- **Parameters:**
  - `category`: The category identifier for the voucher (e.g., '5001')
- **Returns:** The voucher code as a string, or `null` if the request fails

##### `getVoucherCodes(categories: string[]): Promise<Map<string, string | null>>`

Fetches voucher codes for multiple categories in parallel.

- **Parameters:**
  - `categories`: Array of category identifiers
- **Returns:** A Map with category as key and voucher code (or `null`) as value

## Error Handling

The `VoucherHelper` handles errors gracefully:

- Network errors are caught and logged to the console
- Failed requests return `null` instead of throwing exceptions
- This allows your application to continue functioning even when the voucher API is unavailable

## Example: Custom Category Selection

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
