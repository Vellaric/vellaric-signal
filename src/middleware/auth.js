const session = require('express-session');
const bcrypt = require('bcryptjs');

// Session middleware configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'vellaric-signal-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});

// Authentication middleware - check if user is logged in
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  
  // For API requests, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // For page requests, redirect to login
  res.redirect('/login.html');
}

// Login handler
async function handleLogin(req, res) {
  const { username, password } = req.body;
  
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin'; // Default for development
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  // Simple comparison (in production, use bcrypt for hashed passwords)
  if (username === adminUsername && password === adminPassword) {
    req.session.authenticated = true;
    req.session.username = username;
    return res.json({ success: true });
  }
  
  res.status(401).json({ error: 'Invalid credentials' });
}

// Logout handler
function handleLogout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
}

// Check auth status
function checkAuth(req, res) {
  if (req.session && req.session.authenticated) {
    return res.json({ authenticated: true, username: req.session.username });
  }
  res.json({ authenticated: false });
}

// Change password handler
async function handleChangePassword(req, res) {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  
  // Verify current password
  if (currentPassword !== adminPassword) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  // In production, you should update this in a database or config file
  // For now, we'll just update the environment variable (requires restart)
  return res.status(501).json({ 
    error: 'Password change requires updating ADMIN_PASSWORD in .env file and restarting the server',
    message: 'Please update ADMIN_PASSWORD in your .env file with the new password and restart Signal'
  });
}

module.exports = {
  sessionMiddleware,
  requireAuth,
  handleLogin,
  handleLogout,
  checkAuth,
  handleChangePassword
};
