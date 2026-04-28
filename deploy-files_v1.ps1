# ============================================
# TRUST NETWORK - POWERSHELL DEPLOYMENT SCRIPT (FIXED)
# Run this script to create all necessary files
# ============================================

Write-Host "🚀 Trust Network - PowerShell Deployment Script" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Verify we're in the trust-network directory
if (-not (Test-Path "frontend") -or -not (Test-Path "backend") -or -not (Test-Path "database")) {
    Write-Host "❌ Error: Please run this script from the trust-network directory" -ForegroundColor Red
    Write-Host "   Expected structure: trust-network/frontend, trust-network/backend, trust-network/database" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Directory structure verified" -ForegroundColor Green
Write-Host "📝 Creating project files..." -ForegroundColor Cyan
Write-Host ""

# ============================================
# FRONTEND FILES
# ============================================

Write-Host "Creating frontend files..." -ForegroundColor Yellow

# Create frontend/public/index.html
@'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#1e40af">
  <meta name="description" content="Trust Network - Connect through trusted recommendations">
  <title>Trust Network</title>
  <link rel="icon" type="image/svg+xml" href="/shield.svg">
  <link rel="manifest" href="/manifest.json">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      min-height: 100vh;
      color: #f1f5f9;
    }
    #loading-screen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      z-index: 9999;
    }
    .loading-logo {
      width: 80px;
      height: 80px;
      margin-bottom: 24px;
      animation: pulse 2s ease-in-out infinite;
    }
    .loading-text {
      font-size: 24px;
      font-weight: 700;
      color: #f1f5f9;
      margin-bottom: 8px;
    }
    .loading-subtitle {
      font-size: 14px;
      color: #cbd5e1;
      margin-bottom: 32px;
    }
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #334155;
      border-top-color: #60a5fa;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.05); opacity: 0.8; }
    }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="loading-screen">
    <svg class="loading-logo" viewBox="0 0 100 100" fill="none">
      <path d="M50 10L20 30V70L50 90L80 70V30L50 10Z" stroke="#60a5fa" stroke-width="3" fill="#1e40af" opacity="0.8"/>
      <path d="M40 45L47 52L62 37" stroke="#f1f5f9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div class="loading-text">Trust Network</div>
    <div class="loading-subtitle">Connecting trusted professionals...</div>
    <div class="loading-spinner"></div>
  </div>
  <div id="root"></div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
          loadingScreen.style.opacity = '0';
          loadingScreen.style.transition = 'opacity 0.3s ease-out';
          setTimeout(() => loadingScreen.style.display = 'none', 300);
        }
      }, 500);
    });
  </script>
</body>
</html>
'@ | Set-Content -Path "frontend/public/index.html" -Encoding UTF8
Write-Host "  ✓ frontend/public/index.html" -ForegroundColor Green

# Create frontend/public/manifest.json
@'
{
  "name": "Trust Network",
  "short_name": "TrustNet",
  "description": "Connect through trusted recommendations",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#1e40af",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
'@ | Set-Content -Path "frontend/public/manifest.json" -Encoding UTF8
Write-Host "  ✓ frontend/public/manifest.json" -ForegroundColor Green

# Create frontend/public/shield.svg
@'
<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M50 10L20 30V70L50 90L80 70V30L50 10Z" stroke="#60a5fa" stroke-width="3" fill="#1e40af" opacity="0.8"/>
  <path d="M40 45L47 52L62 37" stroke="#f1f5f9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'@ | Set-Content -Path "frontend/public/shield.svg" -Encoding UTF8
Write-Host "  ✓ frontend/public/shield.svg" -ForegroundColor Green

# Create frontend/src/App.js
@'
import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [apiStatus, setApiStatus] = useState('checking');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setApiStatus('connected');
        return fetch('/api/stats');
      })
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => {
        console.error('API Error:', err);
        setApiStatus('error');
      });
  }, []);

  return (
    <div className="App">
      <div className="container">
        <svg className="logo" viewBox="0 0 100 100" fill="none">
          <path d="M50 10L20 30V70L50 90L80 70V30L50 10Z" stroke="#60a5fa" strokeWidth="3" fill="#1e40af" opacity="0.8"/>
          <path d="M40 45L47 52L62 37" stroke="#f1f5f9" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        
        <h1>Trust Network</h1>
        <p className="subtitle">Your trusted professional network</p>
        
        <div className="status-card">
          <div className={`status-indicator ${apiStatus}`}>
            {apiStatus === 'connected' && '✓ Connected'}
            {apiStatus === 'checking' && '⏳ Connecting...'}
            {apiStatus === 'error' && '✗ Connection Error'}
          </div>
          
          {stats && (
            <div className="stats">
              <div className="stat">
                <div className="stat-value">{stats.totalUsers || 0}</div>
                <div className="stat-label">Users</div>
              </div>
              <div className="stat">
                <div className="stat-value">{stats.totalConnections || 0}</div>
                <div className="stat-label">Connections</div>
              </div>
              <div className="stat">
                <div className="stat-value">{stats.activeUsers24h || 0}</div>
                <div className="stat-label">Active Today</div>
              </div>
            </div>
          )}
        </div>

        <div className="features">
          <div className="feature">
            <span className="feature-icon">📱</span>
            <h3>Phone Verification</h3>
            <p>Secure SMS-based authentication</p>
          </div>
          <div className="feature">
            <span className="feature-icon">🔒</span>
            <h3>Trusted Network</h3>
            <p>Connect through verified contacts</p>
          </div>
          <div className="feature">
            <span className="feature-icon">📊</span>
            <h3>Analytics</h3>
            <p>Track your network growth</p>
          </div>
        </div>

        <button className="cta-button">Get Started →</button>
      </div>
    </div>
  );
}

export default App;
'@ | Set-Content -Path "frontend/src/App.js" -Encoding UTF8
Write-Host "  ✓ frontend/src/App.js" -ForegroundColor Green

# Create frontend/src/App.css
Get-Content -Raw -Path "$PSScriptRoot/app.css.txt" -ErrorAction SilentlyContinue | Out-Null
$appCssContent = @"
.App {
  min-height: 100vh;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: #f1f5f9;
  padding: 2rem;
}
.container {
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
}
.logo {
  width: 100px;
  height: 100px;
  margin: 0 auto 2rem;
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
h1 {
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #60a5fa, #93c5fd);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.subtitle {
  font-size: 1.25rem;
  color: #cbd5e1;
  margin-bottom: 3rem;
}
.status-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 1rem;
  padding: 2rem;
  margin-bottom: 3rem;
}
.status-indicator {
  font-size: 1.125rem;
  font-weight: 600;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  display: inline-block;
  margin-bottom: 2rem;
}
.status-indicator.connected {
  background: #10b981;
  color: #f1f5f9;
}
.status-indicator.checking {
  background: #f59e0b;
  color: #111827;
}
.status-indicator.error {
  background: #ef4444;
  color: #f1f5f9;
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 2rem;
}
.stat {
  text-align: center;
}
.stat-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: #60a5fa;
}
.stat-label {
  font-size: 0.875rem;
  color: #94a3b8;
  margin-top: 0.5rem;
}
.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
}
.feature {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 1rem;
  padding: 2rem;
  transition: transform 0.2s, border-color 0.2s;
}
.feature:hover {
  transform: translateY(-5px);
  border-color: #60a5fa;
}
.feature-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 1rem;
}
.feature h3 {
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
  color: #f1f5f9;
}
.feature p {
  color: #cbd5e1;
  font-size: 0.875rem;
}
.cta-button {
  background: linear-gradient(135deg, #1e40af, #3b82f6);
  color: #f1f5f9;
  border: none;
  padding: 1rem 3rem;
  font-size: 1.125rem;
  font-weight: 600;
  border-radius: 0.75rem;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.cta-button:hover {
  transform: scale(1.05);
  box-shadow: 0 20px 40px rgba(59, 130, 246, 0.3);
}
"@
$appCssContent | Set-Content -Path "frontend/src/App.css" -Encoding UTF8
Write-Host "  ✓ frontend/src/App.css" -ForegroundColor Green

# Create frontend/src/index.js
@'
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
'@ | Set-Content -Path "frontend/src/index.js" -Encoding UTF8
Write-Host "  ✓ frontend/src/index.js" -ForegroundColor Green

# Create frontend/src/index.css
@'
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace;
}
'@ | Set-Content -Path "frontend/src/index.css" -Encoding UTF8
Write-Host "  ✓ frontend/src/index.css" -ForegroundColor Green

# Create frontend/package.json
@'
{
  "name": "trust-network-frontend",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1",
    "axios": "^1.6.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": ["react-app"]
  },
  "browserslist": {
    "production": [">0.2%", "not dead", "not op_mini all"],
    "development": ["last 1 chrome version"]
  },
  "proxy": "http://localhost:3000"
}
'@ | Set-Content -Path "frontend/package.json" -Encoding UTF8
Write-Host "  ✓ frontend/package.json" -ForegroundColor Green

# Create frontend/Dockerfile
@'
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget --quiet --tries=1 --spider http://localhost:80/health || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
'@ | Set-Content -Path "frontend/Dockerfile" -Encoding UTF8
Write-Host "  ✓ frontend/Dockerfile" -ForegroundColor Green

# Create frontend/nginx.conf  
$nginxConf = @"
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location /api/ {
        proxy_pass http://backend:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto `$scheme;
    }
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
    location / {
        try_files `$uri `$uri/ /index.html;
    }
}
"@
$nginxConf | Set-Content -Path "frontend/nginx.conf" -Encoding UTF8
Write-Host "  ✓ frontend/nginx.conf" -ForegroundColor Green

# Create frontend/.dockerignore
@'
node_modules
npm-debug.log
build
.env
.env.local
.git
.gitignore
README.md
.DS_Store
'@ | Set-Content -Path "frontend/.dockerignore" -Encoding UTF8
Write-Host "  ✓ frontend/.dockerignore" -ForegroundColor Green

# ============================================
# BACKEND FILES
# ============================================

Write-Host ""
Write-Host "Creating backend files..." -ForegroundColor Yellow

# Create backend/package.json
@'
{
  "name": "trust-network-backend",
  "version": "1.0.0",
  "description": "Trust Network Backend API",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "helmet": "^7.1.0"
  }
}
'@ | Set-Content -Path "backend/package.json" -Encoding UTF8
Write-Host "  ✓ backend/package.json" -ForegroundColor Green

# Create backend/server.js
$serverJs = @"
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err.stack);
  } else {
    console.log('Database connected successfully');
    release();
  }
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/stats', async (req, res) => {
  try {
    const usersResult = await pool.query('SELECT COUNT(*) FROM users');
    const connectionsResult = await pool.query('SELECT COUNT(*) FROM connections');
    const activeUsersResult = await pool.query(
      ``SELECT COUNT(*) FROM users WHERE last_active > NOW() - INTERVAL '24 hours'``
    );
    
    res.json({
      totalUsers: parseInt(usersResult.rows[0].count),
      totalConnections: parseInt(connectionsResult.rows[0].count),
      activeUsers24h: parseInt(activeUsersResult.rows[0].count)
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.json({
      totalUsers: 0,
      totalConnections: 0,
      activeUsers24h: 0
    });
  }
});

app.listen(PORT, () => {
  console.log(``Server running on port ``+PORT);
});

process.on('SIGTERM', () => {
  pool.end();
  process.exit(0);
});
"@
$serverJs | Set-Content -Path "backend/server.js" -Encoding UTF8
Write-Host "  ✓ backend/server.js" -ForegroundColor Green

# Create backend/Dockerfile
@'
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1
EXPOSE 3000
CMD ["node", "server.js"]
'@ | Set-Content -Path "backend/Dockerfile" -Encoding UTF8
Write-Host "  ✓ backend/Dockerfile" -ForegroundColor Green

# Create backend/.dockerignore
@'
node_modules
npm-debug.log
.env
.git
.gitignore
README.md
.DS_Store
'@ | Set-Content -Path "backend/.dockerignore" -Encoding UTF8
Write-Host "  ✓ backend/.dockerignore" -ForegroundColor Green

# ============================================
# DATABASE FILES
# ============================================

Write-Host ""
Write-Host "Creating database files..." -ForegroundColor Yellow

# Create database/schema.sql
$schemaSql = @"
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  job_role VARCHAR(255) NOT NULL,
  industry VARCHAR(255) NOT NULL,
  experience TEXT NOT NULL,
  contacts JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  profile_views INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS connections (
  id SERIAL PRIMARY KEY,
  user1_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user2_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  strength INTEGER DEFAULT 1,
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id < user2_id)
);

CREATE TABLE IF NOT EXISTS access_requests (
  id SERIAL PRIMARY KEY,
  requester_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  intermediary_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_connections_user1 ON connections(user1_id);
CREATE INDEX IF NOT EXISTS idx_connections_user2 ON connections(user2_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_intermediary ON access_requests(intermediary_id);

INSERT INTO users (phone, name, job_role, industry, experience, contacts) VALUES
  ('+1234567890', 'John Doe', 'Software Engineer', 'Technology', '5 years of experience in web development', '[]'),
  ('+0987654321', 'Jane Smith', 'Product Manager', 'Technology', '8 years of experience in product management', '[]')
ON CONFLICT (phone) DO NOTHING;
"@
$schemaSql | Set-Content -Path "database/schema.sql" -Encoding UTF8
Write-Host "  ✓ database/schema.sql" -ForegroundColor Green

# ============================================
# ROOT FILES
# ============================================

Write-Host ""
Write-Host "Creating root configuration files..." -ForegroundColor Yellow

# Create docker-compose.yml
$dockerComposeYml = @"
version: '3.8'

services:
  database:
    image: postgres:15-alpine
    container_name: trust-network-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: trustnetwork
      POSTGRES_PASSWORD: changeme123
      POSTGRES_DB: trust_network
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U trustnetwork"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - trust-network

  backend:
    build: ./backend
    container_name: trust-network-api
    restart: unless-stopped
    depends_on:
      database:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://trustnetwork:changeme123@database:5432/trust_network
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - trust-network

  frontend:
    build: ./frontend
    container_name: trust-network-web
    restart: unless-stopped
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - "80:80"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:80/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - trust-network

volumes:
  postgres_data:
    driver: local

networks:
  trust-network:
    driver: bridge
"@
$dockerComposeYml | Set-Content -Path "docker-compose.yml" -Encoding UTF8
Write-Host "  ✓ docker-compose.yml" -ForegroundColor Green

# Create .env
@'
POSTGRES_PASSWORD=changeme123
NODE_ENV=production
'@ | Set-Content -Path ".env" -Encoding UTF8
Write-Host "  ✓ .env" -ForegroundColor Green

# Create README.md
@'
# Trust Network - Docker Deployment

## Quick Start

1. Ensure Docker Desktop is running
2. Open PowerShell in this directory
3. Run: docker-compose up -d --build
4. Access: http://localhost

## Commands

- Start: docker-compose up -d
- Stop: docker-compose down
- Logs: docker-compose logs -f
- Status: docker-compose ps
- Restart: docker-compose restart

## Ports

- Frontend: http://localhost
- Backend API: http://localhost:3000
- Database: localhost:5432
'@ | Set-Content -Path "README.md" -Encoding UTF8
Write-Host "  ✓ README.md" -ForegroundColor Green

# ============================================
# SUMMARY
# ============================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "✅ All files created successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Ensure Docker Desktop is running" -ForegroundColor White
Write-Host "   2. Run: docker-compose up -d --build" -ForegroundColor Cyan
Write-Host "   3. Wait 2-3 minutes for build" -ForegroundColor White
Write-Host "   4. Open: http://localhost" -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Quick Commands:" -ForegroundColor Yellow
Write-Host "   docker-compose up -d         # Start" -ForegroundColor White
Write-Host "   docker-compose down          # Stop" -ForegroundColor White
Write-Host "   docker-compose logs -f       # View logs" -ForegroundColor White
Write-Host "   docker-compose ps            # Check status" -ForegroundColor White
Write-Host ""
