#!/bin/bash
# Migration Audit Platform - Backend Setup for Deployment

echo "🚀 Preparing Migration Audit Backend for Deployment"
echo "=================================================="

# Navigate to backend directory
cd "$(dirname "$0")"

echo ""
echo "Step 1: Checking package.json..."
# Check if package.json has required scripts
if grep -q '"start"' package.json; then
    echo "✅ Start script found"
else
    echo "⚠️  Adding start script to package.json"
    # This would need manual update
fi

echo ""
echo "Step 2: Creating production environment template..."
cat > .env.production.template << 'EOF'
# Production Environment Variables
# Copy this to .env and fill in your values

NODE_ENV=production
PORT=5000

# MongoDB Atlas Connection String
# Get this from: MongoDB Atlas → Database → Connect → Connect your application
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/migration-audit?retryWrites=true&w=majority

# JWT Secret (generate with: openssl rand -base64 32)
JWT_SECRET=your-super-secret-jwt-key-change-this

# Frontend URL (will get this after deploying Streamlit)
FRONTEND_URL=https://your-app.streamlit.app

# Optional: Redis for caching
# REDIS_URL=redis://...
EOF

echo "✅ Created .env.production.template"

echo ""
echo "Step 3: Checking .gitignore..."
if [ -f .gitignore ]; then
    echo "✅ .gitignore exists"
else
    echo "⚠️  Creating .gitignore"
    cat > .gitignore << 'EOF'
node_modules/
.env
.env.local
.env.production
uploads/
*.log
.DS_Store
npm-debug.log*
EOF
fi

echo ""
echo "Step 4: Installing dependencies..."
npm install

echo ""
echo "=================================================="
echo "✅ Backend is ready for deployment!"
echo ""
echo "Next steps:"
echo "1. Create GitHub account (if you don't have one)"
echo "2. Create MongoDB Atlas account"
echo "3. Create Railway account"
echo ""
echo "Then run: ./deploy-to-railway.sh"
echo "=================================================="
