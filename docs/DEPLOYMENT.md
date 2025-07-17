# Deployment Instructions

## Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Stremio-TVDB-addon
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration:
   # TVDB_API_KEY=your_tvdb_api_key
   # ADMIN_API_KEY=your_secure_admin_key_for_development
   # PORT=3000
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open installation page**
   ```
   http://localhost:3000
   ```

## Environment Variables

### Required Variables
- `TVDB_API_KEY` - Your TVDB API v4 key
- `PORT` - Server port (default: 3000)

### Optional Variables  
- `ADMIN_API_KEY` - Enables secured admin endpoints for monitoring
- `TVDB_BASE_URL` - TVDB API base URL (default: https://api4.thetvdb.com/v4)
- `LOG_LEVEL` - Logging level (default: info)

### Security Configuration
- Set `ADMIN_API_KEY` for production monitoring access
- Use strong random keys (recommended: 32+ characters)
- Never commit API keys to version control

## Production Deployment

### Option 1: Traditional Server

1. **Server Requirements**
   - Node.js 16+
   - PM2 for process management
   - Reverse proxy (nginx/Apache)

2. **Deployment Steps**
   ```bash
   # Install PM2
   npm install -g pm2
   
   # Clone and setup
   git clone <repository-url>
   cd Stremio-TVDB-addon
   npm install --production
   
   # Configure production environment
   cp .env.example .env
   # Edit .env with production values:
   # TVDB_API_KEY=your_production_key
   # ADMIN_API_KEY=your_secure_production_admin_key
   # PORT=3000
   
   # Start with PM2
   pm2 start server.js --name "tvdb-addon"
   pm2 save
   pm2 startup
   ```

3. **Performance Monitoring**
   ```bash
   # Monitor cache performance (requires ADMIN_API_KEY)
   curl -H "X-Admin-Key: your-admin-key" https://your-domain.com/admin/cache/stats
   
   # Check updates service status  
   curl -H "X-Admin-Key: your-admin-key" https://your-domain.com/admin/updates/status
   
   # PM2 process monitoring
   pm2 monit
   pm2 logs tvdb-addon
   ```

4. **Nginx Configuration**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

### Option 2: Docker

1. **Create Dockerfile**
   ```dockerfile
   FROM node:18-alpine
   
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   
   COPY . .
   
   EXPOSE 3000
   USER node
   
   CMD ["npm", "start"]
   ```

2. **Deploy with Docker**
   ```bash
   # Build and run with environment file
   docker build -t tvdb-addon .
   docker run -d -p 3000:3000 --env-file .env tvdb-addon
   
   # Or with inline environment variables
   docker run -d -p 3000:3000 \
     -e TVDB_API_KEY=your_key \
     -e ADMIN_API_KEY=your_admin_key \
     -e PORT=3000 \
     tvdb-addon
   ```

### Option 3: Serverless (Vercel/Netlify)

The addon supports serverless deployment:

1. **Vercel**
   - Connect GitHub repository  
   - Add environment variables in dashboard:
     - `TVDB_API_KEY` - Your TVDB API key
     - `ADMIN_API_KEY` - Admin endpoints access (optional)
   - Deploy automatically on push

2. **Netlify**
   - Similar process to Vercel
   - Supports Node.js functions
   - Configure build settings for Express app

**Note**: Admin endpoints work in serverless but may have cold start delays.

## Security Considerations

### Production Security

1. **API Key Protection**
   ```bash
   # Use strong, unique keys
   ADMIN_API_KEY=$(openssl rand -base64 32)
   
   # Never commit keys to version control
   echo ".env" >> .gitignore
   ```

2. **Admin Endpoints Security**
   - Enable only when monitoring is needed
   - Use HTTPS in production
   - Rotate admin keys regularly
   - Monitor for unauthorized access attempts

3. **Rate Limiting**
   - Admin endpoints: 10 requests/minute per IP
   - Consider additional reverse proxy rate limiting
   - Monitor for abuse patterns

4. **Network Security**
   ```nginx
   # Example nginx security headers
   add_header X-Content-Type-Options nosniff;
   add_header X-Frame-Options DENY;
   add_header X-XSS-Protection "1; mode=block";
   ```

## Environment Variables

Required environment variables:

```
TVDB_API_KEY=your_tvdb_api_key_here
PORT=3000
TVDB_BASE_URL=https://api4.thetvdb.com/v4
NODE_ENV=production
```

## Monitoring and Maintenance

### Health Checks
- Endpoint: `/health`
- Monitor API response times
- Check TVDB API connectivity

### Logs
- Application logs via console
- Error tracking recommended (Sentry, etc.)
- Monitor API rate limits

### Backups
- No database currently required
- Backup configuration files
- Monitor TVDB API changes

## Troubleshooting

### Common Issues

1. **TVDB Authentication Errors**
   - Verify API key is correct
   - Check if key has expired
   - Monitor rate limits

2. **Stremio Installation Issues**
   - Ensure manifest URL is accessible
   - Check CORS headers
   - Verify manifest format

3. **Performance Issues**
   - Implement response caching
   - Add MongoDB for data caching
   - Monitor memory usage

### Debug Mode
```bash
NODE_ENV=development npm start
```

This enables detailed logging and error reporting.
