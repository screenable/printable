# Deployment Checklist for Unattended Operation

Use this checklist before deploying the Printable service for long-term unattended operation.

## Pre-Deployment

### Hardware Setup
- [ ] Raspberry Pi properly mounted and secured
- [ ] Power supply connected with surge protection
- [ ] Network cable connected (prefer wired over WiFi for stability)
- [ ] Printer connected and powered on (IP: 192.168.100.200)
- [ ] Button/GPIO connected to pin 17
- [ ] WLED LED controller connected (if used)
- [ ] Audio output configured and tested (if used)
- [ ] Adequate ventilation for all devices

### Software Setup
- [ ] Node.js 22.15.0 installed
- [ ] Application built: `npm install && npm run build`
- [ ] Environment variables configured in `/opt/printable/.env`
- [ ] systemd service file installed
- [ ] Log rotation configured
- [ ] Firewall rules configured (if needed)

### Configuration Verification
```bash
# Test environment variables
cat /opt/printable/.env

# Verify critical settings:
# - SUPABASE_URL and SUPABASE_KEY
# - WEBHOOK_URL
# - GPIO_PIN=17
# - Printer IP in code or env
```

### Pre-Flight Tests
- [ ] Manual button press test
- [ ] Test print job from start to finish
- [ ] Verify LED feedback (if used)
- [ ] Verify sound feedback (if used)
- [ ] Check health endpoint: `curl http://localhost:3000/health`
- [ ] Review logs: `sudo journalctl -u printable -n 100`
- [ ] Test graceful shutdown: `sudo systemctl stop printable`
- [ ] Test automatic restart: Manually kill process, verify restart

## Deployment

### Initial Startup
```bash
# Enable service for auto-start
sudo systemctl enable printable

# Start service
sudo systemctl start printable

# Check status
sudo systemctl status printable

# Monitor logs in real-time
sudo journalctl -u printable -f
```

### Validation (30 minutes)
- [ ] Service starts successfully
- [ ] No errors in logs
- [ ] Health endpoint responding
- [ ] Button press works
- [ ] Print job completes successfully
- [ ] Memory usage stable
- [ ] No resource leaks detected

### Burn-In Period (24 hours)
- [ ] Process multiple print jobs
- [ ] Monitor memory usage trends
- [ ] Check for any error patterns in logs
- [ ] Verify printer stays connected
- [ ] Test network interruption recovery (if possible)

## Post-Deployment

### Monitoring Setup
- [ ] Configure external health check monitoring
- [ ] Set up alerting for service down
- [ ] Set up alerting for high memory usage
- [ ] Document emergency procedures
- [ ] Provide contact information for issues

### Ongoing Maintenance Schedule

**Daily (Automated)**
- Monitor health endpoint
- Check service status

**Weekly**
- Review logs for errors: `sudo journalctl -u printable --since "1 week ago" | grep -i error`
- Check memory trends: Review health endpoint history
- Verify printer supplies

**Monthly**
- Review disk space usage
- Check for system updates
- Verify backups (if applicable)
- Test manual restart procedure

### Emergency Procedures

**Service Not Responding**
```bash
# Check status
sudo systemctl status printable

# View recent logs
sudo journalctl -u printable -n 100 --no-pager

# Restart service
sudo systemctl restart printable
```

**High Memory Usage**
```bash
# Check current memory
curl http://localhost:3000/health | jq .memory

# Restart to clear memory
sudo systemctl restart printable
```

**Printer Connection Issues**
```bash
# Test printer connectivity
nc -zv 192.168.100.200 9100

# Check logs for printer errors
sudo journalctl -u printable -n 100 | grep -i printer

# Restart both printer and service
# 1. Power cycle printer
# 2. sudo systemctl restart printable
```

## Rollback Plan

If issues occur after deployment:

1. Stop the service:
   ```bash
   sudo systemctl stop printable
   ```

2. Review logs to identify issue:
   ```bash
   sudo journalctl -u printable -n 500 > /tmp/printable-logs.txt
   ```

3. Roll back to previous version if needed:
   ```bash
   cd /opt/printable
   git checkout <previous-commit>
   npm install
   npm run build
   sudo systemctl start printable
   ```

## Success Criteria

The deployment is considered successful when:
- [ ] Service runs continuously for 7 days without manual intervention
- [ ] Memory usage remains stable (< 500MB)
- [ ] No critical errors in logs
- [ ] All print jobs process successfully
- [ ] Average response time < 2 seconds
- [ ] System uptime > 99.9%

## Notes

**Date Deployed:** __________

**Deployed By:** __________

**Version:** __________

**Special Configuration:** __________

**Issues Encountered:** __________

**Resolution:** __________
