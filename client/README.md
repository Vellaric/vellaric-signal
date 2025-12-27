# Vellaric Signal - React Frontend

Modern React frontend for Vellaric Signal deployment management.

## Development

```bash
# Install dependencies
npm install

# Start development server (with API proxy)
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies API requests to the backend at `http://localhost:3000`.

## Build

```bash
# Build for production
npm run build
```

The build output goes to `../public-react` folder which the Express backend will serve in production.

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool
- **React Router** - Routing
- **TailwindCSS** - Styling
- **Socket.io Client** - Real-time updates
- **Axios** - HTTP client
- **Lucide React** - Icons

## Project Structure

```
src/
  components/       # Reusable components
  contexts/         # React contexts (Auth, Socket, Theme)
  pages/            # Page components
  services/         # API services
  App.jsx           # Main app component
  main.jsx          # Entry point
```

## Features

- ✅ Authentication with session management
- ✅ Dark mode support
- ✅ Real-time updates via WebSocket
- ✅ Responsive design
- ✅ Protected routes
- 🚧 Projects management
- 🚧 Deployments history
- 🚧 Environment variables
- 🚧 Container management
- 🚧 Database management
