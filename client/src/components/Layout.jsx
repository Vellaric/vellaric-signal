import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSocket } from '../contexts/SocketContext';
import { 
  LayoutDashboard, 
  FolderGit2, 
  Rocket, 
  Variable, 
  Container, 
  Database,
  Moon,
  Sun,
  LogOut,
  Lock,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useState } from 'react';
import ChangePasswordModal from './ChangePasswordModal';

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { connected } = useSocket();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/projects', icon: FolderGit2, label: 'Projects' },
    { path: '/deployments', icon: Rocket, label: 'Deployments' },
    { path: '/environment', icon: Variable, label: 'Environment' },
    { path: '/containers', icon: Container, label: 'Containers' },
    { path: '/databases', icon: Database, label: 'Databases' },
  ];

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 z-40 w-64 h-screen bg-[hsl(var(--card))] border-r border-[hsl(var(--border))]">
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="p-6 border-b border-[hsl(var(--border))]">
            <h1 className="text-2xl font-bold text-[hsl(var(--primary))]">Vellaric Signal</h1>
            <div className="flex items-center gap-2 mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              {connected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-500" />
                  <span>Disconnected</span>
                </>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map(({ path, icon: Icon, label }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[hsl(var(--primary))] text-white'
                      : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-[hsl(var(--border))]">
            <div className="text-sm text-[hsl(var(--muted-foreground))] mb-3">
              Signed in as <span className="font-medium">{user?.username}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={toggleTheme}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--muted))] hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--muted))] hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="Change password"
              >
                <Lock className="w-4 h-4" />
              </button>
              <button
                onClick={logout}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--destructive))/10] text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <Outlet />
      </main>

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}
