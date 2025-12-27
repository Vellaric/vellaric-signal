import { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { deploymentsAPI } from '../services/api';
import { Clock, CheckCircle, XCircle, AlertCircle, FileText, Loader, Trash2 } from 'lucide-react';

export default function Deployments() {
  const [activeTab, setActiveTab] = useState('history');
  const [deployments, setDeployments] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState(null);
  const [logs, setLogs] = useState('');
  const socket = useSocket();

  useEffect(() => {
    loadData();
    
    if (socket) {
      socket.on('deployment:status', handleDeploymentUpdate);
      socket.on('deployment:log', handleLogUpdate);
    }

    return () => {
      if (socket) {
        socket.off('deployment:status', handleDeploymentUpdate);
        socket.off('deployment:log', handleLogUpdate);
      }
    };
  }, [socket]);

  const handleDeploymentUpdate = (data) => {
    console.log('Deployment update:', data);
    loadData();
  };

  const handleLogUpdate = (data) => {
    if (selectedDeployment && data.deploymentId === selectedDeployment.id) {
      setLogs(prev => prev + `\n${data.log.timestamp?.substring(11, 19) || ''} [${data.log.level}] ${data.log.message}`);
    }
  };

  const loadData = async () => {
    try {
      const [deploymentsRes, queueRes] = await Promise.all([
        deploymentsAPI.getAll(),
        deploymentsAPI.getQueue()
      ]);
      
      setDeployments(deploymentsRes.data.data || []);
      setQueue(queueRes.data.data || []);
    } catch (error) {
      console.error('Failed to load deployments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShowLogs = async (deployment) => {
    setSelectedDeployment(deployment);
    setShowLogsModal(true);
    setLogs('Loading logs...');
    
    try {
      const response = await deploymentsAPI.getLogs(deployment.id);
      const logsData = response.data.logs || [];
      const logsText = logsData.map(log => 
        `${log.timestamp ? log.timestamp.substring(11, 19) : ''} [${log.level || 'info'}] ${log.message}`
      ).join('\n');
      setLogs(logsText || 'No logs available');
    } catch (error) {
      setLogs('Failed to load logs: ' + error.message);
    }
  };

  const handleDeleteDeployment = async (project, branch) => {
    if (!window.confirm(`Delete deployment for ${project} (${branch})?\n\nThis will:\n- Stop the container\n- Remove nginx config\n- Delete SSL certificate`)) {
      return;
    }

    try {
      await deploymentsAPI.delete(project, branch);
      alert('✅ Deployment deleted successfully');
      loadData();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const activeDeployments = deployments.filter(d => 
    d.status === 'success' || d.status === 'deployed' || d.status === 'active'
  );

  const filteredData = activeTab === 'queue' ? queue : 
                       activeTab === 'active' ? activeDeployments : deployments;

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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Deployments</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Monitor and manage your deployments</p>
        </div>
        <button onClick={loadData} className="btn flex items-center gap-2">
          <Loader className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'history'
              ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          History ({deployments.length})
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'queue'
              ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Queue ({queue.length})
        </button>
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'active'
              ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          Active ({activeDeployments.length})
        </button>
      </div>

      {/* Deployments Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Project</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Domain</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Branch</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-12">
                  <div className="text-center">
                    <Clock className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                      {activeTab === 'queue' ? 'No deployments in queue' :
                       activeTab === 'active' ? 'No active deployments' : 'No deployment history'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Deploy a project to see it here
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredData.map((deployment) => (
                <DeploymentRow
                  key={deployment.id}
                  deployment={deployment}
                  onShowLogs={handleShowLogs}
                  onDelete={handleDeleteDeployment}
                  isActive={activeTab === 'active'}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Logs Modal */}
      {showLogsModal && selectedDeployment && (
        <LogsModal
          deployment={selectedDeployment}
          logs={logs}
          onClose={() => {
            setShowLogsModal(false);
            setSelectedDeployment(null);
            setLogs('');
          }}
          onRefresh={() => handleShowLogs(selectedDeployment)}
        />
      )}
    </div>
  );
}

function DeploymentRow({ deployment, onShowLogs, onDelete, isActive }) {
  const getStatusConfig = (status) => {
    if (status === 'success' || status === 'deployed' || status === 'active') {
      return { icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', label: 'Success' };
    } else if (status === 'failed') {
      return { icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', label: 'Failed' };
    } else if (status === 'building' || status === 'in-progress') {
      return { icon: Loader, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', label: 'Building' };
    } else {
      return { icon: Clock, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', label: 'Queued' };
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const statusConfig = getStatusConfig(deployment.status);
  const StatusIcon = statusConfig.icon;

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <td className="px-6 py-4">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">{deployment.project_name}</div>
          {deployment.commit && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <code>{deployment.commit.substring(0, 8)}</code>
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
          <StatusIcon className="w-3 h-3 mr-1" />
          {statusConfig.label}
        </span>
      </td>
      <td className="px-6 py-4">
        {deployment.domain && deployment.domain !== 'Pending...' ? (
          <a href={`https://${deployment.domain}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm">
            {deployment.domain}
          </a>
        ) : (
          <span className="text-gray-500 dark:text-gray-400 text-sm">-</span>
        )}
      </td>
      <td className="px-6 py-4">
        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{deployment.branch || 'main'}</code>
      </td>
      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
        {formatTime(deployment.created_at || deployment.updated_at)}
      </td>
      <td className="px-6 py-4 text-sm font-medium">
        <div className="flex items-center gap-2">
          {deployment.id && (
            <button
              onClick={() => onShowLogs(deployment)}
              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
              title="View Logs"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
          {isActive && (
            <button
              onClick={() => onDelete(deployment.project_name, deployment.branch)}
              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function LogsModal({ deployment, logs, onClose, onRefresh }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg p-8 max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Deployment Logs: {deployment.project_name}
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
