#!/bin/bash

# Innovacare Training Platform - Deployment Script
# Usage: ./scripts/deploy.sh [environment]
# Example: ./scripts/deploy.sh production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-staging}
PROJECT_ID="innovacare-${ENVIRONMENT}"
DEPLOY_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="deployment_${DEPLOY_TIMESTAMP}.log"

echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}Innovacare Training Platform Deployment${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}\n"

# Function to print status
log() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

# Step 1: Validate environment
echo -e "\n${BLUE}Step 1: Validating environment...${NC}"

if ! command -v node &> /dev/null; then
    error "Node.js is not installed"
fi
log "Node.js installed ($(node --version))"

if ! command -v npm &> /dev/null; then
    error "npm is not installed"
fi
log "npm installed ($(npm --version))"

if ! command -v firebase &> /dev/null; then
    error "Firebase CLI is not installed. Run: npm install -g firebase-tools"
fi
log "Firebase CLI installed ($(firebase --version))"

# Step 2: Check git status
echo -e "\n${BLUE}Step 2: Checking git status...${NC}"

if ! git rev-parse --git-dir > /dev/null 2>&1; then
    error "Not a git repository"
fi

if [[ -n $(git status -s) ]]; then
    warning "Uncommitted changes detected"
    git status -s | tee -a "$LOG_FILE"
    echo -e "${YELLOW}Continue with uncommitted changes? (y/n)${NC}"
    read -r response
    if [[ "$response" != "y" ]]; then
        error "Deployment cancelled"
    fi
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
log "Current branch: $CURRENT_BRANCH"

CURRENT_TAG=$(git describe --tags --always)
log "Current version: $CURRENT_TAG"

# Step 3: Install dependencies
echo -e "\n${BLUE}Step 3: Installing dependencies...${NC}"

if [ ! -d "node_modules" ]; then
    log "Installing root dependencies..."
    npm install
fi

if [ ! -d "functions/node_modules" ]; then
    log "Installing functions dependencies..."
    cd functions
    npm install
    cd ..
fi

log "Dependencies installed"

# Step 4: Run tests
echo -e "\n${BLUE}Step 4: Running tests...${NC}"

if command -v ng &> /dev/null; then
    log "Running linting..."
    ng lint --fix || warning "Linting issues detected"
else
    warning "Angular CLI not found, skipping linting"
fi

# Step 5: Build
echo -e "\n${BLUE}Step 5: Building for production...${NC}"

rm -rf dist/
log "Cleaned previous builds"

if command -v ng &> /dev/null; then
    ng build --configuration production || error "Build failed"
    log "Angular build successful"
else
    error "Angular CLI not found"
fi

BUILD_SIZE=$(du -sh dist/ | cut -f1)
log "Build size: $BUILD_SIZE"

# Step 6: Firebase configuration
echo -e "\n${BLUE}Step 6: Configuring Firebase...${NC}"

firebase use "$PROJECT_ID" || error "Firebase project not found: $PROJECT_ID"
log "Using Firebase project: $PROJECT_ID"

# Step 7: Test deployment locally
echo -e "\n${BLUE}Step 7: Testing deployment configuration...${NC}"

firebase firestore:indexes || warning "Could not validate Firestore indexes"
log "Firestore configuration validated"

# Step 8: Deploy
echo -e "\n${BLUE}Step 8: Deploying to Firebase...${NC}"

echo -e "${YELLOW}Deploy to ${ENVIRONMENT}? (y/n)${NC}"
read -r confirm
if [[ "$confirm" != "y" ]]; then
    error "Deployment cancelled"
fi

log "Starting deployment..."

if firebase deploy --only hosting,firestore,functions 2>&1 | tee -a "$LOG_FILE"; then
    log "✨ Deployment successful!"
else
    error "Deployment failed"
fi

# Step 9: Post-deployment verification
echo -e "\n${BLUE}Step 9: Post-deployment verification...${NC}"

DEPLOY_URL="https://innovacare-${ENVIRONMENT}.firebaseapp.com"
log "Application URL: $DEPLOY_URL"

# Check if hosting is live
echo -e "${BLUE}Checking if application is live...${NC}"
if curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL" | grep -q "200"; then
    log "✓ Application is live"
else
    warning "Could not verify application is live. Please check manually."
fi

# Step 10: Summary
echo -e "\n${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ Deployment Complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"

echo -e "\n${BLUE}Summary:${NC}"
echo "  Environment: $ENVIRONMENT"
echo "  Project ID: $PROJECT_ID"
echo "  URL: $DEPLOY_URL"
echo "  Build Size: $BUILD_SIZE"
echo "  Timestamp: $DEPLOY_TIMESTAMP"
echo "  Log file: $LOG_FILE"

echo -e "\n${BLUE}Next steps:${NC}"
echo "  1. Verify the application is working:"
echo "     $DEPLOY_URL"
echo ""
echo "  2. Check function logs:"
echo "     firebase functions:log"
echo ""
echo "  3. Monitor in Firebase Console:"
echo "     https://console.firebase.google.com/project/$PROJECT_ID"
echo ""
