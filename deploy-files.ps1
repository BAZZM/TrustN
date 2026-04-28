<#
deploy-files.ps1
Creates the Trust Network project skeleton and optionally starts Docker Compose.
Run:
  PowerShell -ExecutionPolicy Bypass -File .\deploy-files.ps1
#>

# Clear, ASCII-only output to avoid encoding issues
Write-Host "Trust Network - PowerShell Deployment Script" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Use current folder as project root (script should be run from trust-network)
$Root = (Get-Location).Path

# Create directories
$dirs = @(
  'frontend\public\icons',
  'frontend\src',
  'backend',
  'database'
)
foreach ($d in $dirs) {
  $full = Join-Path $Root $d
  if (-not (Test-Path $full)) {
    New-Item -Path $full -ItemType Directory -Force | Out-Null
  }
}

Write-Host "Directory structure ready under $Root" -ForegroundColor Green
Write-Host "Creating project files..." -ForegroundColor Cyan
Write-Host ""

# -------------------------
# FRONTEND: public files
# -------------------------
@'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#1e40af" />
  <meta name="description" content="Trust Network - Connect through trusted recommendations" />
  <title>Trust Network</title>
  <link rel="icon" type="image/svg+xml" href="/shield.svg" />
  <link rel="manifest" href="/manifest.json" />
</head>
<body>
  <div id="root">Loading Trust Network...</div>
  <script>
    window.addEventListener('load', () => {
      const root = document.getElementById('root');
      if (root) root.innerText = 'Trust Network (frontend placeholder)';
    });
  </script>
</body>
</html>
'@ | Set-Content -Path (Join-Path $Root 'frontend\public\index.html') -Encoding UTF8
Write-Host "  created: frontend/public/index.html" -ForegroundColor Green

@'
{
  "name": "Trust Network",
  "short_name": "TrustNet",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#1e40af",
  "icons": [
    { "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
'@ | Set-Content -Path (Join-Path $Root 'frontend\public\manifest.json') -Encoding UTF8
Write-Host "  created: frontend/public/manifest.json" -ForegroundColor Green

@'
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none">
  <path d="M50 10L20 30V70L50 90L80 70V30L50 10Z" stroke="#60a5fa" stroke-width="3" fill="#1e40af" opacity="0.9"/>
  <path d="M40 45L47 52L62 37" stroke="#f1f5f9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'@ | Set-Content -Path (Join-Path $Root 'frontend\public\shield.svg') -Encoding UTF8
Write-Host "  created: frontend/public/shield.svg" -ForegroundColor Green

# small PNG placeholder (blue square) base64 -> write two files
$pngBlueBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAKUlEQVR4AWMY2BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYABBgAAB0qA0nQAAAABJRU5ErkJggg=='
[IO.File]::WriteAllBytes((Join-Path $Root 'frontend\public\icons\icon-192x192.png'), [Convert]::FromBase64String($pngBlueBase64))
[IO.File]::WriteAllBytes((Join-Path $Root 'frontend\public\icons\icon-512x512.png'), [Convert]::FromBase64String($pngBlueBase64))
Write-Host "  created: frontend/public/icons/icon-192x192.png" -ForegroundColor Green
Write-Host "  created: frontend/public/icons/icon-512x512.png" -ForegroundColor Green

# -------------------------
# FRONTEND: src files
# -------------------------
@'
import React, { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [apiStatus, setApiStatus] = useState("checking");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(() => {
        setApiStatus("connected");
        return fetch("/api/stats");
      })
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch((err) => {
        console.error("API Error:", err);
        setApiStatus("error");
      });
  }, []);

  return (
    <div className="App">
      <div className="container">
        <h1>Trust Network</h1>
        <p className="subtitle">Your trusted professional network</p>
        <div className="status-card">
          <div className={`status-indicator ${apiStatus}`}>
            {apiStatus === "connected" && "✓ Connected"}
            {apiStatus === "checking" && "⏳ Connecting..."}
            {apiStatus === "error" && "✗ Connection Error"}
          </div>
          {stats && (
            <div className="stats">
              <div className="stat">
                <div className="stat-value">{stats.totalUsers || 0}</div>
                <div className="stat-label">Users</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
'@ | Set-Content -Path (Join-Path $Root 'frontend\src\App.js') -Encoding UTF8
Write-Host "  created: frontend/src/App.js" -ForegroundColor Green

@'
.App { min-height: 100vh; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #f1f5f9; padding: 2rem; }
.container { max-width: 900px; margin: 0 auto; text-align: center; }
h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
.subtitle { color: #cbd5e1; margin-bottom: 1.5rem; }
.status-card { background: #1e293b; padding: 1.5rem; border-radius: 8px; border: 1px solid #334155; }
.status-indicator { display: inline-block; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; }
.status-indicator.connected { background: #10b981; color: #fff; }
.status-indicator.checking { background: #f59e0b; color: #111827; }
.status-indicator.error { background: #ef4444; color: #fff; }
'@ | Set-Content -Path (Join-Path $Root 'frontend\src\App.css') -Encoding UTF8
Write-Host "  created: frontend/src/App.css" -ForegroundColor Green

@'
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
'@ | Set-Content -Path (Join-Path $Root 'frontend\src\index.js') -Encoding UTF8
Write-Host "  created: frontend/src/index.js" -ForegroundColor Green

@'
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
'@ | Set-Content -Path (Join-Path $Root 'frontend\src\index.css') -Encoding UTF8
Write-Host "  created: frontend/src/index.css" -ForegroundColor Green

@'
{
  "name": "trust-network-frontend",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build"
  },
  "proxy": "http://localhost:3000"
}
'@ | Set-Content -Path (Join-Path $Root 'frontend\package.json') -Encoding UTF8
Write-Host "  created: frontend/package.json" -ForegroundColor Green

@'
node_modules
build
.env
.env.local
.git
.gitignore
README.md
.DS_Store
'@ | Set-Content -Path (Join-Path $Root 'frontend\.dockerignore') -Encoding UTF8
Write-Host "  created: frontend/.dockerignore" -ForegroundColor Green

# nginx.conf (single-quoted here-string keeps $host literal)
@'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location /api/ {
        proxy_pass http://backend:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
'@ | Set-Content -Path (Join-Path $Root 'frontend\nginx.conf') -Encoding UTF8
Write-Host "  created: frontend/nginx.conf" -ForegroundColor Green

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
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
'@ | Set-Content -Path (Join-Path $Root 'frontend\Dockerfile') -Encoding UTF8
Write-Host "  created: frontend/Dockerfile" -ForegroundColor Green

# -------------------------
# BACKEND files
# -------------------------
@'
{
  "name": "trust-network-backend",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "helmet": "^7.1.0"
  }
}
'@ | Set-Content -Path (Join-Path $Root 'backend\package.json') -Encoding UTF8
Write-Host "  created: backend/package.json" -ForegroundColor Green

@'
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

pool.connect((err, client, release) => {
  if (err) {
    console.error("Error connecting to database:", err.stack);
  } else {
    console.log("Database connected successfully");
    release();
  }
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/stats", async (req, res) => {
  try {
    const usersResult = await pool.query("SELECT COUNT(*) FROM users");
    const connectionsResult = await pool.query("SELECT COUNT(*) FROM connections");
    const activeUsersResult = await pool.query("SELECT COUNT(*) FROM users WHERE last_active > NOW() - INTERVAL '24 hours'");

    res.json({
      totalUsers: parseInt(usersResult.rows[0].count || 0),
      totalConnections: parseInt(connectionsResult.rows[0].count || 0),
      activeUsers24h: parseInt(activeUsersResult.rows[0].count || 0)
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.json({ totalUsers: 0, totalConnections: 0, activeUsers24h: 0 });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
'@ | Set-Content -Path (Join-Path $Root 'backend\server.js') -Encoding UTF8
Write-Host "  created: backend/server.js" -ForegroundColor Green

@'
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
'@ | Set-Content -Path (Join-Path $Root 'backend\Dockerfile') -Encoding UTF8
Write-Host "  created: backend/Dockerfile" -ForegroundColor Green

@'
node_modules
npm-debug.log
.env
.git
.gitignore
README.md
.DS_Store
'@ | Set-Content -Path (Join-Path $Root 'backend\.dockerignore') -Encoding UTF8
Write-Host "  created: backend/.dockerignore" -ForegroundColor Green

# -------------------------
# DATABASE files
# -------------------------
$schemaSql = @'
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  job_role VARCHAR(255) NOT NULL,
  industry VARCHAR(255) NOT NULL,
  experience TEXT NOT NULL,
  contacts JSONB DEFAULT ''[]'',
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
  status VARCHAR(20) DEFAULT ''pending'',
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_connections_user1 ON connections(user1_id);
CREATE INDEX IF NOT EXISTS idx_connections_user2 ON connections(user2_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_intermediary ON access_requests(intermediary_id);

INSERT INTO users (phone, name, job_role, industry, experience, contacts) VALUES
  (''+1234567890'', ''John Doe'', ''Software Engineer'', ''Technology'', ''5 years of experience in web development'', ''[]''),
  (''+0987654321'', ''Jane Smith'', ''Product Manager'', ''Technology'', ''8 years of experience in product management'', ''[]'')
ON CONFLICT (phone) DO NOTHING;
'@
$schemaSql | Set-Content -Path (Join-Path $Root 'database\schema.sql') -Encoding UTF8
Write-Host "  created: database/schema.sql" -ForegroundColor Green

# -------------------------
# Root files: docker-compose, .env, README
# -------------------------
$dockerCompose = @'
version: "3.8"

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
    networks:
      - trust-network

volumes:
  postgres_data:
    driver: local

networks:
  trust-network:
    driver: bridge
'@
$dockerCompose | Set-Content -Path (Join-Path $Root 'docker-compose.yml') -Encoding UTF8
Write-Host "  created: docker-compose.yml" -ForegroundColor Green

@'
POSTGRES_PASSWORD=changeme123
NODE_ENV=production
'@ | Set-Content -Path (Join-Path $Root '.env') -Encoding UTF8
Write-Host "  created: .env" -ForegroundColor Green

@'
# Trust Network - Docker Deployment

## Quick Start

1. Ensure Docker Desktop is running
2. Open PowerShell in this directory
3. Run: docker compose up -d --build
4. Access: http://localhost

'@ | Set-Content -Path (Join-Path $Root 'README.md') -Encoding UTF8
Write-Host "  created: README.md" -ForegroundColor Green

# -------------------------
# Final: attempt to start Docker Compose
# -------------------------
Write-Host ""
Write-Host "All files created successfully." -ForegroundColor Green
Write-Host ""

try {
  Write-Host "Attempting to run: docker compose up -d --build" -ForegroundColor Yellow
  $proc = Start-Process -FilePath 'docker' -ArgumentList 'compose','up','-d','--build' -NoNewWindow -PassThru -Wait -ErrorAction Stop
  if ($proc.ExitCode -eq 0) {
    Write-Host "Docker Compose started successfully." -ForegroundColor Green
    Write-Host "Frontend: http://localhost" -ForegroundColor Cyan
    Write-Host "Backend health: http://localhost:3000/health" -ForegroundColor Cyan
  } else {
    Write-Host "Docker Compose exited with code $($proc.ExitCode). Start Docker Desktop and run 'docker compose up -d --build' manually." -ForegroundColor Yellow
  }
} catch {
  Write-Host "Could not run Docker Compose automatically. Run these commands manually from this folder:" -ForegroundColor Yellow
  Write-Host "  docker compose up -d --build" -ForegroundColor Cyan
}

Write-Host "Done." -ForegroundColor Green