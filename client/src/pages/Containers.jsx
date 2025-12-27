import { useState, useEffect } from 'react';
import { containersAPI, deploymentsAPI } from '../services/api';
import { Container, Play, Square, RotateCw, FileText, Loader, Cpu, HardDrive } from 'lucide-react';

export default function Containers() {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [logs, setLogs] = useState('');

  useEffect(() => {
    loadContainers();
  }, []);

  const loadContainers = async () => {
    try {
      const deploymentsRes = await deploymentsAPI.getActive();
      const activeDeployments = deploymentsRes.data.data || [];
      
      const containersWithStats = await Promise.all(
        activeDeployments.map(async (deployment) => {
          try {
            const containerName = deployment.container_name || `${deployment.project_name.replace(/\s+/g, '-').toLowerCase()}-${deployment.branch || 'main'}`;
            const statsRes = await containersAPI.getStats(containerName);
            return {
              ...deployment,
              containerName,
              stats: statsRes.data
            };
          } catch (error) {
            return {
              ...deployment,
              containerName: deployment.container_name || `${deployment.project_name.replace(/\s+/g, '-').toLowerCase()}-${deployment.branch || 'main'}`,
              stats: { error: error.message }
            };
          }
        })
      );
      
      setContainers(containersWithStats);
    } catch (error) {
      console.error('Failed to load containers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (containerName) => {
    try {
      await containersAPI.start(containerName);
      alert('✅ Container started successfully');
      loadContainers();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleStop = async (containerName) => {
    if (!window.confirm(`Stop container ${containerName}?`)) return;
    
    try {
      await containersAPI.stop(containerName);
      alert('✅ Container stopped successfully');
      loadContainers();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleRestart = async (containerName) => {
    if (!window.confirm(`Restart container ${containerName}?`)) return;
    
    try {
      await containersAPI.restart(containerName);
      alert('✅ Container restarted successfully');
      loadContainers();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleShowLogs = async (container) => {
    setSelectedContainer(container);
    setShowLogsModal(true);
    setLogs('Loading logs...');
    
    try {
      const response = await containersAPI.getLogs(container.containerName);
      setLogs(response.data || 'No logs available');
    } catch (error) {
      setLogs('Failed to load logs: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Containers</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Monitor and manage Docker containers</p>
        </div>
        <button onClick={loadContainers} className="btn flex items-center gap-2">
          <Loader className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Container</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">CPU</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Memory</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Disk Size</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Controls</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Logs</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {containers.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-12">
                  <div className="text-center">
                    <Container className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No active containers</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Deploy a project to see containers here
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              containers.map((container) => (
                <tr key={container.containerName} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{container.project_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        <code>{container.containerName}</code>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {container.stats.cpu || 'N/A'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {container.stats.memory || 'N/A'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {container.stats.diskSize || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStop(container.containerName)}
                        className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                        title="Stop"
                      >
                        <Square className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStart(container.containerName)}
                        className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                        title="Start"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRestart(container.containerName)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Restart"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleShowLogs(container)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      title="View Logs"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showLogsModal && selectedContainer && (
        <LogsModal
          container={selectedContainer}
          logs={logs}
          onClose={() => {
            setShowLogsModal(false);
            setSelectedContainer(null);
            setLogs('');
          }}
          onRefresh={() => handleShowLogs(selectedContainer)}
        />
      )}
    </div>
  );
}

function LogsModal({ container, logs, onClose, onRefresh }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg p-8 max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Container Logs: {container.containerName}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            ✕
          </button>
        </div>
        <pre className="flex-1 bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto font-mono text-sm mb-4">
          {logs}
        </pre>
        <div className="flex gap-3 justify-end">
          <button onClick={onRefresh} className="btn">Refresh</button>
          <button onClick={onClose} className="btn-primary">Close</button>
        </div>
      </div>
    </div>
  );
}
