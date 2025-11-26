# Webhook Template Configuration

## Overview

The webhook plugin has been refactored to support configurable templates with probability-based selection and per-template cooldowns. This allows flexible configuration of webhook events without modifying the core plugin code.

## Features

### 1. Template Configuration
Templates are now externalized in `/src/config/webhook-templates.config.ts`. Each template includes:
- **name**: Unique template identifier
- **probability**: Weight for random selection (higher = more likely)
- **cooldownSeconds**: Minimum seconds between uses (0 = no cooldown)
- **data**: Template-specific data to send
- **voucherCategory** (optional): Category ID for voucher lookup

### 2. Weighted Random Selection
Templates are selected based on their probability weights. For example:
- Template A with probability 70
- Template B with probability 40  
- Template C with probability 10

Results in approximately:
- 58.3% chance for Template A (70/120)
- 33.3% chance for Template B (40/120)
- 8.3% chance for Template C (10/120)

### 3. Per-Template Cooldowns
Individual templates can have cooldown periods to prevent overuse. If a template's cooldown is active, it will be excluded from selection until the cooldown expires.

Example: Template C with a 90-second cooldown can only be selected if the last press was more than 90 seconds ago, preventing button smashing.

### 4. Global Cooldown
In addition to per-template cooldowns, a global cooldown (configured via `WEBHOOK_COOLDOWN_MS` environment variable) prevents any webhook from firing too frequently.

## Configuration Example

```typescript
export const WEBHOOK_TEMPLATES: WebhookTemplate[] = [
  {
    name: 'edeka-voucher-peanut',
    probability: 70,
    cooldownSeconds: 0, // No cooldown
    data: {
      price: 'Peanut & Choco',
    },
    voucherCategory: '6001',
  },
  {
    name: 'edeka-voucher-chips',
    probability: 10,
    cooldownSeconds: 90, // 90 second cooldown
    data: {
      price: 'Gitter Chips',
    },
    voucherCategory: '6004',
  },
];
```

## How It Works

1. **Button Press**: When a button press event occurs, the global cooldown is checked first
2. **Template Selection**: The `TemplateSelector` filters templates based on their individual cooldowns
3. **Weighted Selection**: From eligible templates, one is selected using weighted random probability
4. **Voucher Lookup**: If the template has a `voucherCategory`, a voucher code is fetched
5. **Webhook Call**: The selected template data (with voucher code if applicable) is sent to the webhook URL

## Adding New Templates

To add a new template:

1. Open `/src/config/webhook-templates.config.ts`
2. Add a new template to the `WEBHOOK_TEMPLATES` array
3. Configure the probability, cooldown, and data fields
4. Rebuild the project with `npm run build`

## Testing

The template selector includes comprehensive tests covering:
- Probability-based selection
- Cooldown enforcement
- Multiple template management
- Edge cases (no eligible templates, cooldown expiration)

Run tests with: `npm test`

## Architecture

### New Files
- `/src/types/webhook-template.types.ts` - Type definitions
- `/src/config/webhook-templates.config.ts` - Template configuration
- `/src/helpers/template-selector.ts` - Template selection logic
- `/src/helpers/template-selector.test.ts` - Unit tests

### Modified Files
- `/src/plugins/webhook.plugin.ts` - Refactored to use new template system
- `/tsconfig.json` - Added node types support
