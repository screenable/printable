# Operational Notes for Unattended Operation

This document describes the stability improvements made to ensure reliable unattended operation for multiple weeks.

## Stability Features

### 1. Graceful Error Recovery
- **Print Worker Loop**: Continues running even if individual jobs fail
- **Printer Connection**: Automatic reconnection with exponential backoff
- **Network Failures**: Non-critical services (LED, Sound) fail gracefully without stopping the application

### 2. Resource Management
- **Memory Monitoring**: Periodic checks with warnings at 400MB and critical alerts at 700MB
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

### 5. Monitoring
- **Health Check Endpoint**: `/health` provides status and memory info
- **Structured Logging**: All errors logged with context for troubleshooting

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

## Monitoring Recommendations

### Health Checks
Monitor the `/health` endpoint to ensure the service is responsive:

```bash
curl http://localhost:3000/health
```

### Log Rotation
Configure log rotation to prevent disk space issues. Example with systemd:

```ini
[Service]
StandardOutput=journal
StandardError=journal
```

Then configure journald:
```ini
# /etc/systemd/journald.conf
SystemMaxUse=100M
RuntimeMaxUse=100M
```

### Process Management
Use a process manager like systemd to auto-restart on crashes:

```ini
[Unit]
Description=Printable Service
After=network.target

[Service]
Type=simple
User=printable
WorkingDirectory=/opt/printable
ExecStart=/usr/bin/node /opt/printable/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### Memory Management
If running with the `--expose-gc` flag, the application will automatically trigger garbage collection when memory usage is critical:

```bash
node --expose-gc dist/index.js
```

## Troubleshooting

### Common Issues

1. **Printer Connection Failures**
   - Check network connectivity to printer (192.168.100.200:9100)
   - Application will retry automatically with backoff

2. **High Memory Usage**
   - Monitor `/health` endpoint
   - Application will log warnings and attempt GC if available
   - Consider restarting if sustained above 700MB

3. **LED Controller Offline**
   - Non-critical - application continues without LED feedback
   - Check WLED_IP configuration

4. **Sound Playback Issues**
   - Non-critical - application continues without audio feedback
   - Check that aplay is installed and audio device is accessible

## Maintenance

### Weekly Checks
- Review logs for error patterns
- Check memory usage trends
- Verify printer paper and supplies

### Monthly Checks
- Review disk space usage
- Check for available system updates
- Verify database connectivity

### Before Extended Absence
- Test full workflow (button press → print)
- Verify all monitoring is in place
- Ensure adequate printer supplies
- Document emergency contact procedures
