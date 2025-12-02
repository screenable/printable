# Deployment Checklist for Unattended Operation

Use this checklist before deploying the Printable service for long-term unattended operation as a cronjob.

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
- [ ] Environment variables configured in `.env`
- [ ] Crontab configured for @reboot
- [ ] Log rotation configured

### Configuration Verification
```bash
# Test environment variables
cat .env

# Verify critical settings:
# - SUPABASE_URL and SUPABASE_KEY
# - WEBHOOK_URL
# - GPIO_PIN=17
# - Printer IP in code
```

### Pre-Flight Tests
- [ ] Manual button press test
- [ ] Test print job from start to finish
- [ ] Verify LED feedback (if used)
- [ ] Verify sound feedback (if used)
- [ ] Review logs: `tail -f /var/log/printable.log`
- [ ] Test graceful shutdown: Kill process and verify cleanup

## Deployment

### Cronjob Setup
```bash
# Edit crontab
sudo crontab -e

# Add entry:
@reboot cd /path/to/printable && export $(cat .env | xargs) && /usr/bin/node dist/index.js >> /var/log/printable.log 2>&1
```

### Initial Startup
```bash
# Test manual start first
cd /path/to/printable
export $(cat .env | xargs)
node dist/index.js

# Monitor logs
tail -f /var/log/printable.log
```

### Validation (30 minutes)
- [ ] Service starts successfully
- [ ] No errors in logs
- [ ] Button press works
- [ ] Print job completes successfully
- [ ] No resource leaks detected

### Burn-In Period (24 hours)
- [ ] Process multiple print jobs
- [ ] Check for any error patterns in logs
- [ ] Verify printer stays connected
- [ ] Test network interruption recovery (if possible)

## Post-Deployment

### Monitoring Setup
- [ ] Set up log monitoring
- [ ] Document emergency procedures
- [ ] Provide contact information for issues

### Ongoing Maintenance Schedule

**Daily (Automated)**
- Review logs for errors: `grep -i error /var/log/printable.log`

**Weekly**
- Review logs in detail
- Verify printer supplies
- Check that jobs are processing

**Monthly**
- Review disk space usage
- Check for system updates
- Test manual restart procedure

### Emergency Procedures

**Service Not Responding**
```bash
# Check if running
ps aux | grep node

# View recent logs
tail -n 100 /var/log/printable.log

# Restart via reboot or:
sudo killall node
# Will auto-restart via cron on next reboot
```

**Printer Connection Issues**
```bash
# Test printer connectivity
nc -zv 192.168.100.200 9100

# Check logs for printer errors
grep -i printer /var/log/printable.log | tail -20

# Restart: power cycle printer, then restart application
```

## Rollback Plan

If issues occur after deployment:

1. Stop the service:
   ```bash
   sudo killall node
   ```

2. Review logs to identify issue:
   ```bash
   tail -n 500 /var/log/printable.log > /tmp/printable-logs.txt
   ```

3. Roll back to previous version if needed:
   ```bash
   cd /path/to/printable
   git checkout <previous-commit>
   npm install
   npm run build
   # Reboot or manually start
   ```

## Success Criteria

The deployment is considered successful when:
- [ ] Service runs continuously for 7 days without manual intervention
- [ ] No critical errors in logs
- [ ] All print jobs process successfully
- [ ] Average response time < 2 seconds

## Notes

**Date Deployed:** __________

**Deployed By:** __________

**Version:** __________

**Special Configuration:** __________

**Issues Encountered:** __________

**Resolution:** __________
