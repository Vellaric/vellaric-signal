# Database Backup Setup Guide

## Overview
Vellaric Signal now supports automated database backups with cloud storage integration. Backups can be stored locally or uploaded to S3-compatible storage services.

## Prerequisites

### 1. Install AWS CLI on your server

```bash
# For Ubuntu/Debian
sudo apt update
sudo apt install awscli -y

# Verify installation
aws --version
```

### 2. Choose a Storage Provider

**Option A: AWS S3** (Most popular)
- Create an S3 bucket
- Create IAM user with S3 access
- Get Access Key and Secret Key

**Option B: Backblaze B2** (Cheapest - $0.005/GB/month)
1. Sign up at backblaze.com
2. Create a B2 bucket
3. Generate application key
4. Note the endpoint URL (e.g., `https://s3.us-west-002.backblazeb2.com`)

**Option C: DigitalOcean Spaces**
- Create a Space
- Generate API keys (Spaces access keys)

**Option D: Local Storage Only**
- No cloud storage needed
- Backups stored in `/var/vellaric/backups`
- ⚠️ Not recommended for production (single point of failure)

## Configuration

### 1. Update Environment Variables

Edit your `.env` file:

```bash
# Backup Configuration
BACKUP_LOCAL_DIR=/var/vellaric/backups

# S3-Compatible Storage
S3_BUCKET=your-bucket-name
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_REGION=us-east-1

# For Backblaze B2 or DigitalOcean Spaces
S3_ENDPOINT=https://s3.us-west-002.backblazeb2.com
```

### 2. Create Backup Directory (Local Storage)

```bash
sudo mkdir -p /var/vellaric/backups
sudo chown -R $USER:$USER /var/vellaric/backups
sudo chmod 755 /var/vellaric/backups
```

### 3. Test AWS CLI Configuration

```bash
# Test with your credentials
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_DEFAULT_REGION=us-east-1

# Test upload
echo "test" > test.txt
aws s3 cp test.txt s3://your-bucket/test.txt --endpoint-url https://your-endpoint
aws s3 ls s3://your-bucket/
```

## Usage

### From Dashboard

1. Navigate to **"Database Backups"** in the sidebar
2. Select a database from the dropdown
3. Click **"Create Backup"**
4. View all backups with timestamps and sizes
5. **Restore** or **Delete** backups as needed

### From API

```bash
# List database containers
curl http://localhost:3000/api/backups/databases

# Create backup
curl -X POST http://localhost:3000/api/backups/create \
  -H "Content-Type: application/json" \
  -d '{"containerName": "my-app-postgres-production"}'

# List all backups
curl http://localhost:3000/api/backups

# Restore backup
curl -X POST http://localhost:3000/api/backups/restore \
  -H "Content-Type: application/json" \
  -d '{"filename": "backup.sql.gz", "containerName": "my-app-postgres-production"}'

# Delete backup
curl -X DELETE http://localhost:3000/api/backups/backup.sql.gz
```

## Automated Backups with Cron

### Daily Backups

Create a backup script `/usr/local/bin/vellaric-backup.sh`:

```bash
#!/bin/bash
CONTAINERS=$(docker ps --filter "ancestor=postgres" --format "{{.Names}}")

for container in $CONTAINERS; do
    curl -X POST http://localhost:3000/api/backups/create \
      -H "Content-Type: application/json" \
      -d "{\"containerName\": \"$container\"}" \
      -s
done

echo "Backups completed: $(date)"
```

Make it executable:
```bash
sudo chmod +x /usr/local/bin/vellaric-backup.sh
```

Add to crontab:
```bash
crontab -e

# Add this line for daily backups at 2 AM
0 2 * * * /usr/local/bin/vellaric-backup.sh >> /var/log/vellaric-backup.log 2>&1
```

## Storage Costs (Approximate)

### For 10 GB of backup data:

| Provider | Monthly Cost | Notes |
|----------|-------------|-------|
| Backblaze B2 | $0.05 | Cheapest, reliable |
| AWS S3 Standard | $0.23 | Most popular |
| DigitalOcean Spaces | $5.00 | Includes 250GB |
| Local Storage | Free | ⚠️ Not safe - single point of failure |

### Recommendations:
- **Development**: Local storage is fine
- **Production**: Use Backblaze B2 (cheapest) or AWS S3
- Keep 30 days of backups (configurable)

## Backup Retention

Backups are stored with timestamp filenames:
```
container-name_2025-12-24T02-00-00-000Z.sql.gz
```

To implement automatic cleanup of old backups, add to your cron script:

```bash
# Delete backups older than 30 days (from S3)
aws s3 ls s3://your-bucket/backups/ \
  | awk '{print $4}' \
  | while read file; do
      aws s3 rm s3://your-bucket/backups/$file --endpoint-url https://your-endpoint
    done
```

## Disaster Recovery

### Full Recovery Procedure:

1. **Set up new server**
2. **Install Vellaric Signal**
3. **Configure storage credentials** (same S3 bucket)
4. **List available backups** from dashboard
5. **Create empty database** (will be done automatically if using managed DB)
6. **Restore latest backup**

### Testing Recovery:

Test your backup/restore process quarterly:

```bash
# 1. Create test backup
curl -X POST http://localhost:3000/api/backups/create \
  -H "Content-Type: application/json" \
  -d '{"containerName": "test-db"}'

# 2. Verify backup exists
curl http://localhost:3000/api/backups | jq

# 3. Restore to test container
curl -X POST http://localhost:3000/api/backups/restore \
  -H "Content-Type: application/json" \
  -d '{"filename": "test-db_2025-12-24.sql.gz", "containerName": "test-db"}'
```

## Troubleshooting

### Error: "aws: command not found"
```bash
sudo apt install awscli -y
```

### Error: "Access Denied"
- Check your S3 credentials
- Verify bucket permissions
- Test with AWS CLI manually

### Error: "Container not found"
- Ensure container is running: `docker ps`
- Check container name matches exactly

### Backup Takes Too Long
- Database is large
- Consider scheduled backups during low-traffic hours
- Compress backups (already done automatically)

## Security Notes

1. **Encrypt backups at rest** - Most S3 services support encryption
2. **Restrict S3 bucket access** - Use IAM policies for AWS
3. **Secure credentials** - Never commit `.env` file to Git
4. **Test restores regularly** - Ensure backups are actually recoverable
5. **Monitor backup success** - Check logs regularly

## Support

For issues or questions:
- Check logs: `/var/log/vellaric-backup.log`
- Server logs: `docker logs vellaric-signal`
- GitHub Issues: [Your repo URL]
