import { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { deploymentsAPI } from '../services/api';
import { Clock, CheckCircle, XCircle, AlertCircle, FileText, Loader, Trash2, RefreshCw } from 'lucide-react';

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
      console.log('Loading deployments data...');
      const [deploymentsRes, queueRes] = await Promise.all([
        deploymentsAPI.getAll(),
        deploymentsAPI.getQueue()
      ]);
      
      console.log('Deployments response:', deploymentsRes.data);
      console.log('Queue response:', queueRes.data);
      
      setDeployments(deploymentsRes.data.deployments || []);
      setQueue(queueRes.data.queue || []);
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
        <Loader className="w-8 h-8 animate-spin text-[hsl(var(--primary))]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Droplets</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 text-sm">
            Monitor and manage your deployments
          </p>
        </div>
        <button 
          onClick={loadData} 
          className="btn-primary flex items-center gap-2"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[hsl(var(--card))] p-6 rounded-lg border border-[hsl(var(--border))]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Total Deployments</p>
              <p className="text-3xl font-bold text-[hsl(var(--foreground))] mt-1">{deployments.length}</p>
            </div>
            <Clock className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
          </div>
        </div>
        
        <div className="bg-[hsl(var(--card))] p-6 rounded-lg border border-[hsl(var(--border))]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Active</p>
              <p className="text-3xl font-bold text-[hsl(var(--success))] mt-1">{activeDeployments.length}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-[hsl(var(--success))]" />
          </div>
        </div>
        
        <div className="bg-[hsl(var(--card))] p-6 rounded-lg border border-[hsl(var(--border))]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Queue</p>
              <p className="text-3xl font-bold text-[hsl(var(--warning))] mt-1">{queue.length}</p>
            </div>
            <Loader className="w-8 h-8 text-[hsl(var(--warning))]" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg">
        <div className="flex gap-1 p-2 border-b border-[hsl(var(--border))]">
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded font-medium text-sm transition-all ${
              activeTab === 'history'
                ? 'bg-[hsl(var(--primary))] text-white'
                : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            History ({deployments.length})
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2 rounded font-medium text-sm transition-all ${
              activeTab === 'queue'
                ? 'bg-[hsl(var(--primary))] text-white'
                : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            Queue ({queue.length})
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded font-medium text-sm transition-all ${
              activeTab === 'active'
                ? 'bg-[hsl(var(--primary))] text-white'
                : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            Active ({activeDeployments.length})
          </button>
        </div>

        {/* Deployments List */}
        <div className="divide-y divide-[hsl(var(--border))]">
          {filteredData.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="mx-auto h-16 w-16 text-[hsl(var(--muted-foreground))] opacity-50" />
              <h3 className="mt-4 text-lg font-semibold text-[hsl(var(--foreground))]">
                {activeTab === 'queue' ? 'No deployments in queue' :
                 activeTab === 'active' ? 'No active droplets' : 'No deployment history'}
              </h3>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                Deploy a project to see it here
              </p>
            </div>
          ) : (
            filteredData.map((deployment) => (
              <DeploymentCard
                key={deployment.id || `${deployment.project_name}-${deployment.branch}`}
                deployment={deployment}
                onShowLogs={handleShowLogs}
                onDelete={handleDeleteDeployment}
                isActive={activeTab === 'active'}
              />
            ))
          )}
        </div>
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

function DeploymentCard({ deployment, onShowLogs, onDelete, isActive }) {
  const getStatusConfig = (status) => {
    if (status === 'success' || status === 'deployed' || status === 'active') {
      return { 
        icon: CheckCircle, 
        color: 'text-[hsl(var(--success))]', 
        bg: 'bg-[hsl(var(--success))]/10', 
        label: 'Running',
        dot: 'bg-[hsl(var(--success))]'
      };
    } else if (status === 'failed') {
      return { 
        icon: XCircle, 
        color: 'text-[hsl(var(--destructive))]', 
        bg: 'bg-[hsl(var(--destructive))]/10', 
        label: 'Failed',
        dot: 'bg-[hsl(var(--destructive))]'
      };
    } else if (status === 'building' || status === 'in-progress') {
      return { 
        icon: Loader, 
        color: 'text-[hsl(var(--warning))]', 
        bg: 'bg-[hsl(var(--warning))]/10', 
        label: 'Building',
        dot: 'bg-[hsl(var(--warning))] animate-pulse'
      };
    } else {
      return { 
        icon: Clock, 
        color: 'text-[hsl(var(--muted-foreground))]', 
        bg: 'bg-[hsl(var(--muted))]/50', 
        label: 'Queued',
        dot: 'bg-[hsl(var(--muted-foreground))]'
      };
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
    <div className="p-6 hover:bg-[hsl(var(--accent))] transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          {/* Status Indicator */}
          <div className={`w-3 h-3 rounded-full ${statusConfig.dot}`}></div>
          
          {/* Project Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                {deployment.project_name}
              </h3>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                <StatusIcon className="w-3.5 h-3.5" />
                {statusConfig.label}
              </span>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-[hsl(var(--muted-foreground))]">
              <div className="flex items-center gap-2">
                <span className="font-medium">Region:</span>
                <span className="font-mono text-xs bg-[hsl(var(--muted))] px-2 py-0.5 rounded">
                  {deployment.region || 'NYC3'}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="font-medium">Branch:</span>
                <span className="font-mono text-xs bg-[hsl(var(--muted))] px-2 py-0.5 rounded">
                  {deployment.branch || 'main'}
                </span>
              </div>
              
              {deployment.commit && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Commit:</span>
                  <code className="font-mono text-xs bg-[hsl(var(--muted))] px-2 py-0.5 rounded">
                    {deployment.commit.substring(0, 8)}
                  </code>
                </div>
              )}
              
              {deployment.domain && deployment.domain !== 'Pending...' && (
                <div className="flex items-center gap-2">
                  <span className="font-medium">Domain:</span>
                  <a 
                    href={`https://${deployment.domain}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[hsl(var(--primary))] hover:underline font-mono text-xs"
                  >
                    {deployment.domain}
                  </a>
                </div>
              )}
              
              <div className="ml-auto text-xs">
                {formatTime(deployment.created_at || deployment.updated_at || deployment.queuedAt)}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-6">
          {deployment.id && (
            <button
              onClick={() => onShowLogs(deployment)}
              className="p-2 rounded-lg bg-[hsl(var(--secondary))] hover:bg-[hsl(220,16%,20%)] text-[hsl(var(--foreground))] transition-colors"
              title="View Logs"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
          {isActive && (
            <button
              onClick={() => onDelete(deployment.project_name, deployment.branch)}
              className="p-2 rounded-lg bg-[hsl(var(--destructive))]/10 hover:bg-[hsl(var(--destructive))]/20 text-[hsl(var(--destructive))] transition-colors"
              title="Delete Deployment"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LogsModal({ deployment, logs, onClose, onRefresh }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg max-w-5xl w-full max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-[hsl(var(--border))]">
          <div>
            <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">
              Deployment Logs
            </h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              {deployment.project_name} • {deployment.branch || 'main'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-6">
          <pre className="bg-[hsl(220,20%,5%)] text-gray-100 p-6 rounded-lg overflow-auto font-mono text-xs leading-relaxed border border-[hsl(var(--border))]">
            {logs || 'No logs available'}
          </pre>
        </div>
        
        <div className="flex gap-3 justify-end p-6 border-t border-[hsl(var(--border))]">
          <button onClick={onRefresh} className="btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button onClick={onClose} className="btn-primary">Close</button>
        </div>
      </div>
    </div>
  );
}
