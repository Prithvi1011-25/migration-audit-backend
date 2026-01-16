# Migration Audit Backend

Backend API service for the Migration Audit Platform - a comprehensive web audit and monitoring tool.

## Features

- 🚀 Performance auditing using Lighthouse API
- 📊 Core Web Vitals monitoring (LCP, FID, CLS)
- 🔍 SEO analysis and metadata extraction
- ♿ Accessibility testing
- 🕷️ Web crawling with Cheerio and Puppeteer
- 📧 Email and Slack notifications
- 💾 MongoDB for persistent storage
- ⚡ Redis for caching
- 📈 Historical data tracking and statistics

## Prerequisites

- Node.js 18+ 
- MongoDB 4.4+
- Redis 6+

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
- MongoDB URI
- Redis URL
- Email credentials (SMTP)
- Slack webhook URL

3. Start MongoDB and Redis (if running locally):
```bash
# MongoDB
mongod

# Redis
redis-server
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Run Tests
```bash
npm test
```

## API Endpoints

### Health Check
```
GET /health
```

### Create Audit
```
POST /api/audits
Body: {
  "url": "https://example.com",
  "triggeredBy": "manual",
  "useHeadless": false
}
```

### Get Audit by ID
```
GET /api/audits/:id
```

### List Audits
```
GET /api/audits?page=1&limit=20&status=completed
```

### Get Statistics
```
GET /api/audits/stats?days=7
```

### Get Audit History for URL
```
GET /api/audits/history/:url?limit=10
```

### Delete Audit
```
DELETE /api/audits/:id
```

## Architecture

```
backend/
├── src/
│   ├── config/          # Database connections
│   ├── controllers/     # Request handlers
│   ├── models/          # MongoDB schemas
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   │   ├── lighthouseService.js  # Performance testing
│   │   ├── crawlerService.js     # Web crawling
│   │   └── notificationService.js # Alerts
│   └── server.js        # Express app
└── package.json
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 5000 |
| `MONGODB_URI` | MongoDB connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:3000 |
| `EMAIL_HOST` | SMTP host | - |
| `EMAIL_PORT` | SMTP port | 587 |
| `EMAIL_USER` | Email username | - |
| `EMAIL_PASSWORD` | Email password | - |
| `SLACK_WEBHOOK_URL` | Slack webhook URL | - |
| `MAX_CONCURRENT_AUDITS` | Max concurrent audits | 3 |
| `CACHE_TTL` | Cache time-to-live (seconds) | 3600 |

## Technologies

- **Express.js** - Web framework
- **Mongoose** - MongoDB ODM
- **Redis** - Caching
- **Lighthouse** - Performance auditing
- **Puppeteer** - Browser automation
- **Cheerio** - HTML parsing
- **Nodemailer** - Email notifications
- **Slack Webhook** - Slack integration
