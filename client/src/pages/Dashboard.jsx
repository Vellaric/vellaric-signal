import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { deploymentsAPI, containersAPI, projectsAPI, databasesAPI } from '../services/api';
import { 
  Server, 
  Database, 
  HardDrive,
  DollarSign,
  TrendingUp, 
  TrendingDown, 
  Activity,
  Package,
  Globe,
  Layers,
  Zap,
  CheckCircle,
  Clock,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    activeProjects: 0,
    databases: 0,
    storageUsed: 256,
    monthlyCost: 127.50,
    projectsTrend: 12,
    databasesTrend: 5,
    storageTrend: -8,
    costTrend: -3,
  });
  const [recentDeployments, setRecentDeployments] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const [projectsRes, databasesRes, deploymentsRes] = await Promise.all([
        projectsAPI.getAll(),
        databasesAPI.getAll(),
        deploymentsAPI.getAll(),
      ]);

      const projects = projectsRes.data || [];
      const databases = databasesRes.data || [];
      const deployments = deploymentsRes.data || [];

      // Filter active deployments
      const activeDeployments = deployments.filter(d => 
        d.status === 'success' || d.status === 'deployed' || d.status === 'active'
      );

      setStats({
        activeProjects: activeDeployments.length,
        databases: databases.length,
        storageUsed: 256, // Mock data - implement real storage calculation
        monthlyCost: 127.50, // Mock data - implement real cost calculation
        projectsTrend: 12,
        databasesTrend: 5,
        storageTrend: -8,
        costTrend: -3,
      });

      // Set recent deployments (last 4)
      setRecentDeployments(deployments.slice(0, 4));

      // Generate recent activity from deployments
      const activity = deployments.slice(0, 5).map(d => ({
        id: d.id,
        type: getActivityType(d.status),
        message: getActivityMessage(d),
        timestamp: d.updated_at || d.created_at,
      }));
      setRecentActivity(activity);

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityType = (status) => {
    if (status === 'success' || status === 'deployed' || status === 'active') return 'success';
    if (status === 'failed') return 'error';
    if (status === 'building' || status === 'in-progress') return 'warning';
    return 'info';
  };

  const getActivityMessage = (deployment) => {
    const project = deployment.project_name;
    const status = deployment.status;
    
    if (status === 'success' || status === 'deployed' || status === 'active') {
      return `Droplet ${project} is now running`;
    } else if (status === 'failed') {
      return `High CPU usage detected on ${project}`;
    } else if (status === 'building' || status === 'in-progress') {
      return `Deployment ${project} in progress`;
    }
    return `New deployment for ${project}`;
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Just now';
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now - time) / 1000);

    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[hsl(var(--foreground))] mb-2">Dashboard</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Welcome back, John. Here's what's happening with your infrastructure.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Active Droplets"
          value={stats.activeProjects}
          subtitle="3 in NYC, 5 in SFO"
          icon={<Server className="w-5 h-5" />}
          trend={stats.projectsTrend}
          color="blue"
        />
        <StatCard
          title="Databases"
          value={stats.databases}
          subtitle="PostgreSQL, Redis"
          icon={<Database className="w-5 h-5" />}
          trend={stats.databasesTrend}
          color="green"
        />
        <StatCard
          title="Storage Used"
          value={`${stats.storageUsed} GB`}
          subtitle="of 500 GB allocated"
          icon={<HardDrive className="w-5 h-5" />}
          trend={stats.storageTrend}
          color="purple"
        />
        <StatCard
          title="Monthly Cost"
          value={`$${stats.monthlyCost}`}
          subtitle="Estimated this month"
          icon={<DollarSign className="w-5 h-5" />}
          trend={stats.costTrend}
          color="orange"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <QuickActionCard
            title="Deploy Droplet"
            subtitle="Spin up a new virtual machine"
            icon={<Server className="w-5 h-5" />}
            onClick={() => navigate('/projects')}
          />
          <QuickActionCard
            title="Create Database"
            subtitle="Managed PostgreSQL, MySQL, Redis"
            icon={<Database className="w-5 h-5" />}
            onClick={() => navigate('/databases')}
          />
          <QuickActionCard
            title="Launch App"
            subtitle="Deploy from Git repository"
            icon={<Globe className="w-5 h-5" />}
            onClick={() => navigate('/projects')}
          />
          <QuickActionCard
            title="New Space"
            subtitle="Object storage for your files"
            icon={<HardDrive className="w-5 h-5" />}
            onClick={() => navigate('/databases')}
          />
          <QuickActionCard
            title="Kubernetes"
            subtitle="Managed K8s cluster"
            icon={<Layers className="w-5 h-5" />}
            onClick={() => navigate('/containers')}
          />
          <QuickActionCard
            title="Function"
            subtitle="Serverless compute"
            icon={<Zap className="w-5 h-5" />}
            onClick={() => navigate('/projects')}
          />
        </div>
      </div>

      {/* Your Resources & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Your Resources */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">Your Resources</h2>
            <button
              onClick={() => navigate('/projects')}
              className="text-sm text-[hsl(var(--primary))] hover:text-[hsl(211,100%,45%)]"
            >
              View all →
            </button>
          </div>
          <div className="space-y-4">
            {recentDeployments.length === 0 ? (
              <div className="card text-center py-12">
                <Package className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                <p className="text-[hsl(var(--muted-foreground))]">No resources yet</p>
                <button
                  onClick={() => navigate('/projects')}
                  className="mt-4 text-sm text-[hsl(var(--primary))] hover:text-blue-700"
                >
                  Deploy your first app
                </button>
              </div>
            ) : (
              recentDeployments.map((deployment) => (
                <ResourceCard key={deployment.id} deployment={deployment} />
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))] mb-4">Recent Activity</h2>
          <div className="card">
            <div className="space-y-4">
              {recentActivity.length === 0 ? (
                <p className="text-[hsl(var(--muted-foreground))] text-sm text-center py-4">No recent activity</p>
              ) : (
                recentActivity.map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} formatTimeAgo={formatTimeAgo} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon, trend, color }) {
  const colors = {
    blue: 'bg-blue-500/10 text-[hsl(var(--primary))]',
    green: 'bg-green-500/10 text-[hsl(var(--success))]',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  };

  const isPositive = trend > 0;

  return (
    <div className="card hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${colors[color]}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-sm font-semibold ${isPositive ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--destructive))]'}`}>
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {Math.abs(trend)}%
        </div>
      </div>
      <h3 className="text-[hsl(var(--muted-foreground))] text-sm font-medium mb-1">
        {title}
      </h3>
      <p className="text-3xl font-bold text-[hsl(var(--foreground))] mb-1">
        {value}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-500">
        {subtitle}
      </p>
    </div>
  );
}

function QuickActionCard({ title, subtitle, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card hover:shadow-lg hover:scale-105 transition-all text-left group"
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="p-3 rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] group-hover:bg-blue-500/10 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {icon}
        </div>
        <div>
          <p className="font-semibold text-sm text-[hsl(var(--foreground))] mb-1">{title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-500">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}

function ResourceCard({ deployment }) {
  const navigate = useNavigate();
  const isRunning = deployment.status === 'success' || deployment.status === 'deployed' || deployment.status === 'active';
  const isStopped = deployment.status === 'stopped';
  const isBuilding = deployment.status === 'building' || deployment.status === 'in-progress';
  const isFailed = deployment.status === 'failed';

  const statusConfig = {
    running: { color: 'text-[hsl(var(--success))]', bg: 'bg-green-500/10', label: 'Running', icon: CheckCircle },
    stopped: { color: 'text-[hsl(var(--muted-foreground))]', bg: 'bg-gray-500/10', label: 'Stopped', icon: Activity },
    building: { color: 'text-[hsl(var(--warning))]', bg: 'bg-yellow-500/10', label: 'Building', icon: Clock },
    failed: { color: 'text-[hsl(var(--destructive))]', bg: 'bg-red-500/10', label: 'Failed', icon: AlertCircle },
  };

  let status = 'stopped';
  if (isRunning) status = 'running';
  else if (isBuilding) status = 'building';
  else if (isFailed) status = 'failed';

  const StatusIcon = statusConfig[status].icon;

  return (
    <div className="card hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          <div className="p-3 rounded-xl bg-blue-500/10">
            <Server className="w-5 h-5 text-[hsl(var(--primary))]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-[hsl(var(--foreground))] truncate">
                {deployment.project_name}
              </h3>
              <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig[status].bg} ${statusConfig[status].color}`}>
                <StatusIcon className="w-3 h-3" />
                {statusConfig[status].label}
              </span>
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mb-2">
              Droplet • Ubuntu 22.04
            </p>
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
              <span>Region: <strong className="text-[hsl(var(--foreground))]">{deployment.branch || 'NYC3'}</strong></span>
              {deployment.domain && (
                <>
                  <span>•</span>
                  <span>IP: <strong className="text-[hsl(var(--foreground))]">{deployment.domain}</strong></span>
                </>
              )}
            </div>
            {deployment.created_at && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                Created: {new Date(deployment.created_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        {deployment.domain && isRunning && (
          <button
            onClick={() => window.open(`https://${deployment.domain}`, '_blank')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-[hsl(var(--muted-foreground))] hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            title="Open Site"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function ActivityItem({ activity, formatTimeAgo }) {
  const iconConfig = {
    success: { icon: CheckCircle, color: 'text-[hsl(var(--success))]' },
    error: { icon: AlertCircle, color: 'text-[hsl(var(--destructive))]' },
    warning: { icon: Clock, color: 'text-[hsl(var(--warning))]' },
    info: { icon: Activity, color: 'text-[hsl(var(--primary))]' },
  };

  const config = iconConfig[activity.type] || iconConfig.info;
  const Icon = config.icon;

  return (
    <div className="flex gap-3">
      <div className={`mt-0.5 ${config.color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[hsl(var(--foreground))]">{activity.message}</p>
        <p className="text-xs text-gray-500 dark:text-gray-500 flex items-center gap-1 mt-1">
          <Clock className="w-3 h-3" />
          {formatTimeAgo(activity.timestamp)}
        </p>
      </div>
    </div>
  );
}
