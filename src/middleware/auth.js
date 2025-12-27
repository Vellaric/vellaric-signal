const session = require('express-session');
const bcrypt = require('bcryptjs');
const { getAdminUser, createAdminUser } = require('../services/database');
const logger = require('../utils/logger');

// Initialize default admin user if not exists
async function initializeDefaultAdmin() {
  try {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
    
    const existingUser = await getAdminUser(adminUsername);
    
    if (!existingUser) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await createAdminUser(adminUsername, passwordHash);
      logger.info(`Default admin user created: ${adminUsername}`);
    }
  } catch (err) {
    logger.error('Error initializing default admin:', err);
  }
}

// Initialize on module load
initializeDefaultAdmin();

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
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  try {
    const user = await getAdminUser(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    req.session.authenticated = true;
    req.session.username = username;
    return res.json({ success: true });
  } catch (err) {
    logger.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
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

  try {
    const username = req.session.username;
    const user = await getAdminUser(username);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash and update new password
    const { updateAdminPassword } = require('../services/database');
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await updateAdminPassword(username, newPasswordHash);
    
    logger.info(`Password changed for user: ${username}`);
    
    return res.json({ 
      success: true,
      message: 'Password changed successfully'
    });
  } catch (err) {
    logger.error('Password change error:', err);
    return res.status(500).json({ error: 'Failed to change password' });
  }
}

module.exports = {
  sessionMiddleware,
  requireAuth,
  handleLogin,
  handleLogout,
  checkAuth,
  handleChangePassword
};
