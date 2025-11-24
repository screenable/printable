# LED Plugin

The LED plugin provides integration with WLED (Wireless LED Controller) to control LED strips via the WLED JSON API. This plugin replaces the previous GPIO-based LED control with a more flexible network-based approach.

## Configuration

Add the following environment variable to your `.env` file:

```env
WLED_IP=192.168.1.100
```

The `WLED_IP` should be the IP address of your WLED device on your local network. If this value is not set, the LED plugin will still initialize but won't control any LEDs.

### Optional LED Timing Configuration

You can also configure the timing for different LED states:

```env
LED_DONE_HOLD_MS=2200
LED_ERROR_HOLD_MS=3000
LED_WORKING_FALLBACK_MS=10000
```

## Features

The LED plugin automatically responds to system events and displays different effects for each state:

### LED States

1. **Ready State** - Breathing amber effect (255, 205, 0)
   - Triggered when the system is idle and waiting for input
   - Uses WLED effect 2 (Breathe)

2. **Working State** - Rainbow effect
   - Triggered when a print job starts or button is pressed
   - Uses WLED effect 9 (Rainbow)
   - Continues until print completion or timeout

3. **Done State** - Solid green
   - Triggered when a print job completes successfully
   - Shows solid green color for `LED_DONE_HOLD_MS` milliseconds
   - Automatically returns to ready state

4. **Error State** - Blinking red
   - Triggered when an error occurs during printing
   - Uses WLED effect 1 (Blink) with red color (220, 0, 40)
   - Shows for `LED_ERROR_HOLD_MS` milliseconds before returning to ready state

## WLED Setup

### Prerequisites

1. Install WLED on your ESP8266 or ESP32 device following the [WLED Installation Guide](https://kno.wled.ge/basics/install-binary/)
2. Connect your device to the same network as the printing system
3. Configure your LED strip settings in the WLED web interface
4. Note the IP address assigned to your WLED device

### WLED JSON API

This plugin uses the [WLED JSON API](https://kno.wled.ge/interfaces/json-api/) to control the LED strip. The API allows for:

- Setting colors and brightness
- Controlling built-in effects
- Adjusting effect speed and intensity
- Turning LEDs on/off

## Event Integration

The LED plugin listens to the following events on the event bus:

- `button.press` - Triggers working state
- `print.start` - Triggers working state
- `print.progress` - Updates progress (stored for potential future use)
- `print.done` - Triggers done state
- `print.error` - Triggers error state

## WLEDClient Class

The plugin includes a `WLEDClient` class that provides methods for controlling WLED:

### Methods

- `turnOff()` - Turn off all LEDs
- `setSolidColor(r, g, b, brightness)` - Set a solid color
- `setEffect(effectId, speed, intensity, colors)` - Set a WLED effect with parameters
- `setBreathing(r, g, b)` - Set breathing effect with color
- `setBlink(r, g, b, speed)` - Set blinking effect with color
- `setRainbow(speed)` - Set rainbow effect
- `setChase(r, g, b, speed)` - Set chase effect with color

### Effect IDs

Common WLED effect IDs (may vary by WLED version):
- 0: Solid
- 1: Blink
- 2: Breathe
- 9: Rainbow
- 28: Chase

For a complete list of effects, refer to your WLED device's web interface or the [WLED documentation](https://kno.wled.ge/features/effects/).

## Customization

To customize the LED effects for different states, edit the `applyState` function in `src/plugins/led.plugin.ts`:

```typescript
case 'ready': {
  // Change to a different color or effect
  await wled.setBreathing(0, 100, 255); // Blue breathing
  break;
}
```

You can also add new effects by using the `WLEDClient` methods or calling the WLED API directly through `setState()`.

## Troubleshooting

### LEDs don't respond
- Verify WLED_IP is correctly set in your .env file
- Check that the WLED device is on the same network
- Test WLED directly by accessing `http://<WLED_IP>` in a browser
- Check console logs for "WLED API error" messages

### Wrong colors displayed
- Different LED strips use different color orders (RGB vs GRB vs BGR)
- Configure the correct LED type in WLED settings
- Adjust colors in the plugin code if necessary

### Effects don't look right
- Effect IDs may vary between WLED versions
- Check available effects in your WLED web interface
- Update effect IDs in the plugin code to match your WLED version
