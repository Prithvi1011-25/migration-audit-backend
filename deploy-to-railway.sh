#!/bin/bash
# Deploy Backend to Railway

echo "🚀 Deploying Backend to Railway"
echo "================================"

# Check if git is initialized
if [ ! -d .git ]; then
    echo "Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit - Migration Audit Backend"
    echo "✅ Git initialized"
else
    echo "✅ Git already initialized"
fi

echo ""
echo "Next steps (manual):"
echo ""
echo "1. Create GitHub repository:"
echo "   - Go to: https://github.com/new"
echo "   - Repository name: migration-audit-backend"
echo "   - Click 'Create repository'"
echo ""
echo "2. Push to GitHub:"
echo "   git remote add origin https://github.com/YOUR_USERNAME/migration-audit-backend.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "3. Deploy to Railway:"
echo "   - Go to: https://railway.app"
echo "   - Click 'Start a New Project'"
echo "   - Choose 'Deploy from GitHub repo'"
echo "   - Select 'migration-audit-backend'"
echo ""
echo "4. Add environment variables in Railway:"
echo "   - MONGODB_URI"
echo "   - JWT_SECRET"
echo "   - NODE_ENV=production"
echo "   - FRONTEND_URL"
echo ""
echo "See DEPLOYMENT_WALKTHROUGH.md for detailed instructions!"
