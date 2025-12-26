# Vellaric-Signal - GitLab Webhook Deployment Server

## Project Overview
Automated deployment system that listens for GitLab webhook events and automatically deploys Node.js applications - similar to Digital Ocean App Platform.

## Architecture
- Express.js webhook server
- GitLab webhook signature verification
- Automatic git pull, npm install, and app restart
- Deployment queue with build logs
- Health monitoring and rollback support

## Tech Stack
- Node.js with Express
- child_process for git and npm commands
- PM2 for process management
- SQLite for deployment history

## Development Guidelines
- Use async/await for all async operations
- Validate webhook signatures before processing
- Log all deployment steps for debugging
- Handle errors gracefully with rollback capability
- Use environment variables for configuration
