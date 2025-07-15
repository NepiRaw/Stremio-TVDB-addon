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
   # Edit .env with your TVDB API key
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open installation page**
   ```
   http://localhost:3000
   ```

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
   
   # Configure environment
   cp .env.example .env
   # Edit .env with production values
   
   # Start with PM2
   pm2 start server.js --name "tvdb-addon"
   pm2 save
   pm2 startup
   ```

3. **Nginx Configuration**
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
   docker build -t tvdb-addon .
   docker run -d -p 3000:3000 --env-file .env tvdb-addon
   ```

### Option 3: Serverless (Vercel/Netlify)

The addon is designed to work with serverless platforms:

1. **Vercel**
   - Connect GitHub repository
   - Add environment variables in dashboard
   - Deploy automatically on push

2. **Netlify**
   - Similar process to Vercel
   - Supports Node.js functions

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
