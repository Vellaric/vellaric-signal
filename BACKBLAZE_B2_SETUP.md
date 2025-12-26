# Backblaze B2 Setup for Vellaric Signal

## Your Backblaze B2 Credentials Mapping

Backblaze gives you these credentials:
- **keyID** → Use as `S3_ACCESS_KEY`
- **applicationKey** → Use as `S3_SECRET_KEY`  
- **keyName** → (Not needed for S3 API)

## Step-by-Step Setup

### 1. Find Your Bucket Endpoint

In Backblaze B2 dashboard:
1. Go to your bucket
2. Look for "Endpoint" or "S3 Compatible Endpoint"
3. It looks like: `https://s3.us-west-002.backblazeb2.com`

Common endpoints:
- `https://s3.us-west-001.backblazeb2.com`
- `https://s3.us-west-002.backblazeb2.com`
- `https://s3.us-west-004.backblazeb2.com`
- `https://s3.eu-central-003.backblazeb2.com`

### 2. Update Your `.env` File

Add these lines to your `.env`:

```bash
# Backup Configuration
BACKUP_LOCAL_DIR=/var/vellaric/backups

# Backblaze B2 Configuration
S3_BUCKET=your-bucket-name
S3_ACCESS_KEY=your-keyID-here
S3_SECRET_KEY=your-applicationKey-here
S3_ENDPOINT=https://s3.us-west-002.backblazeb2.com
S3_REGION=us-west-002
```

### Example with Real Values:

```bash
# Backup Configuration
BACKUP_LOCAL_DIR=/var/vellaric/backups

# Backblaze B2 Configuration
S3_BUCKET=vellaric-backups
S3_ACCESS_KEY=0025e3fb8cd9a0d0000000001
S3_SECRET_KEY=K0025Yg4cD9xT8zN7hP2qW3sX1vB4mA5n
S3_ENDPOINT=https://s3.us-west-002.backblazeb2.com
S3_REGION=us-west-002
```

### 3. Install AWS CLI on Your Server

```bash
sudo apt update
sudo apt install awscli -y
aws --version
```

### 4. Test the Connection

```bash
# Set environment variables
export AWS_ACCESS_KEY_ID=your-keyID
export AWS_SECRET_ACCESS_KEY=your-applicationKey
export AWS_DEFAULT_REGION=us-west-002

# Test list buckets
aws s3 ls --endpoint-url https://s3.us-west-002.backblazeb2.com

# Test upload
echo "test" > test.txt
aws s3 cp test.txt s3://your-bucket-name/test.txt --endpoint-url https://s3.us-west-002.backblazeb2.com

# Test list files
aws s3 ls s3://your-bucket-name/ --endpoint-url https://s3.us-west-002.backblazeb2.com
```

### 5. Restart Vellaric Signal

```bash
# If running with npm
npm restart

# If running with PM2
pm2 restart vellaric-signal

# If running with systemd
sudo systemctl restart vellaric-signal
```

### 6. Create Your First Backup

1. Go to dashboard → **Database Backups**
2. Select a database container
3. Click **"Create Backup"**
4. Backup will be uploaded to Backblaze B2

## Bucket Lifecycle Rules (Optional)

To automatically delete old backups in Backblaze:

1. Go to your B2 bucket settings
2. Add Lifecycle Rule:
   - **Keep only the last versions**: 30 days
   - **File name prefix**: backups/
   
This will automatically delete backups older than 30 days, saving you money!

## Pricing

Backblaze B2 costs:
- **Storage**: $0.005/GB/month ($0.05 for 10GB)
- **Download**: $0.01/GB (free if < 3x storage)
- **API calls**: Essentially free (2500 free per day)

### Cost Examples:

| Backup Size | Monthly Cost |
|-------------|--------------|
| 1 GB        | $0.005       |
| 10 GB       | $0.05        |
| 100 GB      | $0.50        |
| 1 TB        | $5.00        |

## Troubleshooting

### Error: "Unable to locate credentials"
- Double-check your keyID and applicationKey in `.env`
- Make sure there are no extra spaces

### Error: "The specified bucket does not exist"
- Verify bucket name is correct (case-sensitive)
- Check you're using the right endpoint for your bucket's region

### Error: "Access Denied"
- Make sure the application key has read/write permissions
- Check bucket is set to "Private" not "Public"

### Backups not appearing in B2
- Check the "backups/" folder in your bucket
- Look in B2 dashboard → Browse Files

## Security Best Practices

1. **Use Application Keys with limited scope**
   - Create a key specific to this bucket
   - Set permissions to only what's needed

2. **Enable bucket encryption**
   - Go to bucket settings → Enable Server-Side Encryption

3. **Keep your applicationKey secret**
   - Never commit `.env` to Git
   - Add `.env` to `.gitignore`

4. **Regularly test restores**
   - Monthly: Test restoring a backup
   - Verify data integrity

## Next Steps

1. Set up automated daily backups (see BACKUP_SETUP.md)
2. Test restore functionality
3. Configure lifecycle rules to manage old backups
4. Monitor backup success in dashboard
