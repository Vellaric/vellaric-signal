# Vellaric Signal - Frontend & Backend Separation

The project now has a separated frontend and backend architecture:

## Structure

```
vellaric-signal/
├── client/                 # React frontend (NEW)
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── contexts/      # Auth, Socket, Theme contexts
│   │   ├── pages/         # Page components
│   │   ├── services/      # API client
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
├── src/                    # Express backend
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── server.js
│
├── public/                 # Legacy HTML dashboard (backup)
└── public-react/          # React build output (production)
```

## Development

### Backend Only
```bash
npm start          # Start Express server on port 3000
```

### Frontend Only
```bash
cd client
npm install
npm run dev        # Start Vite dev server on port 5173
```

The Vite dev server proxies API requests to the backend at `localhost:3000`.

### Full Stack Development
```bash
# Terminal 1 - Backend
npm start

# Terminal 2 - Frontend  
cd client
npm run dev
```

Then open `http://localhost:5173` for the React app with hot reload.

## Production Build

```bash
# Build React frontend
cd client
npm run build      # Outputs to ../public-react/

# Start backend (serves React build)
cd ..
npm start
```

The Express server automatically serves the React build from `public-react/` if it exists, otherwise falls back to the legacy HTML dashboard.

## Migration Status

### ✅ Completed
- Project structure setup
- React + Vite + TailwindCSS
- Authentication (login/logout/password change)
- Protected routes
- Dark mode
- Socket.io integration
- API service layer
- Responsive layout with sidebar

### 🚧 In Progress (Placeholders)
- Projects management UI
- Deployments history UI
- Environment variables UI
- Containers management UI
- Databases management UI

## Benefits

1. **Modern Development** - React with hot reload, component-based architecture
2. **Better Performance** - Virtual DOM, optimized re-renders
3. **Type Safety Ready** - Easy to migrate to TypeScript
4. **Better State Management** - React Context + hooks
5. **Real-time Updates** - Socket.io integration ready
6. **Maintainable** - Separated concerns, reusable components
7. **Scalable** - Easy to add new features and pages

## API Endpoints

All API endpoints remain the same - the frontend just consumes them differently:

- `POST /api/login` - Authentication
- `GET /api/projects` - List projects
- `GET /api/deployments` - Deployment history
- `GET /api/containers` - Container list
- `WebSocket` - Real-time updates

## Next Steps

1. Implement Projects page with full CRUD
2. Implement Deployments page with logs viewer
3. Implement Environment Variables management
4. Implement Containers management with stats
5. Implement Databases management
6. Add notifications/toasts for user feedback
7. Add loading states and error boundaries
8. Optimize bundle size

## Backward Compatibility

The old HTML dashboard remains available at `/dashboard-old.html` for backward compatibility.
