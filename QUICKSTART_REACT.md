# Quick Start - React Frontend

## Setup

1. **Install Frontend Dependencies**
```bash
cd client
npm install
```

2. **Start Development Servers**

Terminal 1 (Backend):
```bash
npm start
```

Terminal 2 (Frontend):
```bash
cd client
npm run dev
```

3. **Open Browser**
Go to `http://localhost:5173`

## Production Build

```bash
cd client
npm run build
cd ..
npm start
```

The backend will automatically serve the React build.

## Features

- ✅ Modern React 18 + Hooks
- ✅ Vite for fast development
- ✅ TailwindCSS for styling
- ✅ Dark mode support
- ✅ Socket.io real-time updates
- ✅ Protected routes
- ✅ Session-based auth
- 🚧 Feature pages (in progress)

## Development Tips

- Hot reload works automatically
- API requests proxy to `localhost:3000`
- Use React DevTools for debugging
- TailwindCSS classes autocomplete in VS Code

## Next: Migrate Features

Start migrating features from the old HTML dashboard to React components:

1. **Projects Management** - `client/src/pages/Projects.jsx`
2. **Deployments History** - `client/src/pages/Deployments.jsx`
3. **Environment Variables** - `client/src/pages/EnvironmentVariables.jsx`
4. **Containers** - `client/src/pages/Containers.jsx`
5. **Databases** - `client/src/pages/Databases.jsx`

Each page has a placeholder ready for implementation.
