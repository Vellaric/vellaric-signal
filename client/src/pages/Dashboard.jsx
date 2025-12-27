import { useState, useEffect } from 'react';
import { deploymentsAPI, containersAPI, projectsAPI, databasesAPI } from '../services/api';
import { TrendingUp, TrendingDown, Activity, Loader } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    projects: 0,
    databases: 0,
    activeDeployments: 0,
    containers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [projects, databases, deployments, containers] = await Promise.all([
        projectsAPI.getAll(),
        databasesAPI.getAll(),
        deploymentsAPI.getActive(),
        containersAPI.getAll(),
      ]);

      setStats({
        projects: projects.data.length,
        databases: databases.data.length,
        activeDeployments: deployments.data.length,
        containers: containers.data.length,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
        Dashboard
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Projects"
          value={stats.projects}
          icon={<Activity className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Databases"
          value={stats.databases}
          icon={<Activity className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Active Deployments"
          value={stats.activeDeployments}
          icon={<TrendingUp className="w-6 h-6" />}
          color="purple"
        />
        <StatCard
          title="Containers"
          value={stats.containers}
          icon={<Activity className="w-6 h-6" />}
          color="orange"
        />
      </div>

      <div className="mt-8 card">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Welcome to Vellaric Signal
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Your deployment management dashboard is ready. Use the sidebar to navigate between different sections.
        </p>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  const colors = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          {icon}
        </div>
      </div>
      <h3 className="text-gray-600 dark:text-gray-400 text-sm font-medium mb-1">
        {title}
      </h3>
      <p className="text-3xl font-bold text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}
