# Operational Notes for Unattended Operation

This document describes the stability improvements made to ensure reliable unattended operation for multiple weeks when running as a cronjob.

## Stability Features

### 1. Graceful Error Recovery
- **Print Worker Loop**: Continues running even if individual jobs fail
- **Printer Connection**: Automatic reconnection with exponential backoff (3 attempts, 5s delay)
- **Network Failures**: Non-critical services (LED, Sound) fail gracefully without stopping the application

### 2. Resource Management
- **Connection Pooling**: Persistent printer connection (only reconnects on errors)
- **Cleanup Handlers**: All plugins properly clean up resources on shutdown

### 3. Error Handling
- **Uncaught Exceptions**: Logged and allow graceful shutdown
- **Unhandled Rejections**: Logged and allow graceful shutdown
- **Network Timeouts**: All network operations have 10-second timeouts
- **Database Errors**: Logged but don't stop the polling loop

### 4. Graceful Shutdown
- **SIGTERM/SIGINT handlers**: Proper cleanup of resources
- **onClose hooks**: Each plugin cleans up its resources

### 5. Logging
- **Structured Logging**: All errors logged with context for troubleshooting
- **Log Levels**: Configurable via LOG_LEVEL environment variable

## Environment Variables

Key configuration for stability:

```bash
# Logging
LOG_LEVEL=info  # Use 'debug' for troubleshooting, 'warn' for production

# Database
SUPABASE_URL=<your-url>
SUPABASE_KEY=<your-key>

# Hardware
GPIO_PIN=17
DEBOUNCE_MS=10

# API
WEBHOOK_URL=<your-webhook>
WEBHOOK_COOLDOWN_MS=1000
VOUCHER_API_KEY=<your-key>

# LED Controller (optional)
WLED_IP=192.168.1.100
```

## Running as Cronjob

When running as a cronjob with sudo, ensure:

1. **Environment Variables**: Set in crontab or load from .env file
2. **Logging**: Configure LOG_LEVEL appropriately
3. **Permissions**: Ensure sudo access for GPIO and hardware

Example crontab entry:
```cron
# Replace /opt/printable with your actual installation path
@reboot cd /opt/printable && /usr/bin/node dist/index.js >> /var/log/printable.log 2>&1
```

Or with environment file (safer method):
```cron
# Replace /opt/printable with your actual installation path
@reboot cd /opt/printable && set -a && . ./.env && set +a && /usr/bin/node dist/index.js >> /var/log/printable.log 2>&1
```

## Log Management

Since the application runs continuously, consider log rotation:

```bash
# /etc/logrotate.d/printable
/var/log/printable.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
```

## Troubleshooting

### Common Issues

1. **Printer Connection Failures**
   - Check network connectivity to printer (192.168.100.200:9100)
   - Application will retry automatically with backoff
   - Check logs: `tail -f /var/log/printable.log | grep printer`

2. **LED Controller Offline**
   - Non-critical - application continues without LED feedback
   - Check WLED_IP configuration

3. **Sound Playback Issues**
   - Non-critical - application continues without audio feedback
   - Check that aplay is installed and audio device is accessible

4. **Database Connection Issues**
   - Check SUPABASE_URL and SUPABASE_KEY
   - Verify network connectivity
   - Application will log errors but continue polling

## Maintenance

### Weekly Checks
- Review logs for error patterns: `grep -i error /var/log/printable.log`
- Verify printer paper and supplies
- Check that jobs are processing

### Monthly Checks
- Review disk space usage
- Verify database connectivity
- Test full workflow (button press → print)

### Before Extended Absence
- Test full workflow
- Verify adequate printer supplies
- Ensure logs are rotating properly
- Document emergency contact procedures
