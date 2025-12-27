import { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { deploymentsAPI } from '../services/api';
import { Clock, CheckCircle, XCircle, Loader, Trash2, FileText, ChevronDown, Plus } from 'lucide-react';

export default function Deployments() {
  const [activeTab, setActiveTab] = useState('history');
  const [deployments, setDeployments] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState(null);
  const [logs, setLogs] = useState('');
  const { socket } = useSocket();

  // Initial load
  useEffect(() => {
    loadData();
  }, []);

  // Live websocket updates
  useEffect(() => {
    if (socket) {
      // Real-time deployment status updates
      socket.on('deployment:status', (data) => {
        console.log('Live deployment update:', data);
        // Update specific deployment in state
        setDeployments(prev => {
          const updated = prev.map(d => 
            d.id === data.deploymentId || d.project_name === data.projectName 
              ? { ...d, ...data, status: data.status } 
              : d
          );
          // Add new deployment if not exists
          if (!prev.find(d => d.id === data.deploymentId)) {
            return [...updated, data];
          }
          return updated;
        });
        
        // Update queue
        setQueue(prev => prev.filter(q => q.id !== data.deploymentId));
      });

      // Live log streaming
      socket.on('deployment:log', (data) => {
        if (selectedDeployment && data.deploymentId === selectedDeployment.id) {
          setLogs(prev => prev + `\n${data.log.timestamp?.substring(11, 19) || ''} [${data.log.level}] ${data.log.message}`);
        }
      });

      // Queue updates
      socket.on('deployment:queued', (data) => {
        console.log('New deployment queued:', data);
        setQueue(prev => [...prev, data]);
      });

      return () => {
        socket.off('deployment:status');
        socket.off('deployment:log');
        socket.off('deployment:queued');
      };
    }
  }, [socket, selectedDeployment]);

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
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Droplets</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Monitor and manage your deployments in real-time
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Create
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-5 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Deployments</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{deployments.length}</p>
            </div>
            <Clock className="w-7 h-7 text-muted-foreground" />
          </div>
        </div>
        
        <div className="bg-card p-5 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-semibold text-[hsl(var(--success))] mt-1">{activeDeployments.length}</p>
            </div>
            <CheckCircle className="w-7 h-7 text-[hsl(var(--success))]" />
          </div>
        </div>
        
        <div className="bg-card p-5 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Queue</p>
              <p className="text-2xl font-semibold text-[hsl(var(--warning))] mt-1">{queue.length}</p>
            </div>
            <Loader className="w-7 h-7 text-[hsl(var(--warning))]" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-card border border-border rounded-lg">
        <div className="flex gap-1 p-1.5 border-b border-border">
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
              activeTab === 'history'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            History ({deployments.length})
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
              activeTab === 'queue'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            Queue ({queue.length})
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
              activeTab === 'active'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            Active ({activeDeployments.length})
          </button>
        </div>

        {/* Deployments List */}
        <div className="divide-y divide-border">
          {filteredData.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
              <h3 className="mt-4 text-sm font-medium text-foreground">
                {activeTab === 'queue' ? 'No deployments in queue' :
                 activeTab === 'active' ? 'No active droplets' : 'No deployment history'}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
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
        color: 'text-muted-foreground', 
        bg: 'bg-muted/50', 
        label: 'Queued',
        dot: 'bg-muted-foreground'
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
    <div className="p-5 hover:bg-accent/50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          {/* Status Indicator */}
          <div className={`w-2 h-2 rounded-full ${statusConfig.dot}`}></div>
          
          {/* Project Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1.5">
              <h3 className="text-sm font-semibold text-foreground">
                {deployment.project_name}
              </h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                <StatusIcon className="w-3 h-3" />
                {statusConfig.label}
              </span>
            </div>
            
            <div className="flex items-center gap-5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">Region:</span>
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                  {deployment.region || 'NYC3'}
                </span>
              </div>
              
              <div className="flex items-center gap-1.5">
                <span className="font-medium">Branch:</span>
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                  {deployment.branch || 'main'}
                </span>
              </div>
              
              {deployment.commit && (
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">Commit:</span>
                  <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                    {deployment.commit.substring(0, 8)}
                  </code>
                </div>
              )}
              
              {deployment.domain && deployment.domain !== 'Pending...' && (
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">Domain:</span>
                  <a 
                    href={`https://${deployment.domain}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-primary hover:underline font-mono text-[10px]"
                  >
                    {deployment.domain}
                  </a>
                </div>
              )}
              
              <div className="ml-auto text-[10px]">
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
              className="p-1.5 rounded bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
              title="View Logs"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
          )}
          {isActive && (
            <button
              onClick={() => onDelete(deployment.project_name, deployment.branch)}
              className="p-1.5 rounded bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
              title="Delete Deployment"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LogsModal({ deployment, logs, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-card border border-border rounded-lg max-w-5xl w-full max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Deployment Logs
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {deployment.project_name} • {deployment.branch || 'main'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-5">
          <pre className="bg-[hsl(220,20%,5%)] text-gray-100 p-5 rounded-lg overflow-auto font-mono text-[10px] leading-relaxed border border-border">
            {logs || 'No logs available'}
          </pre>
        </div>
        
        <div className="flex gap-2 justify-end p-5 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-xs font-medium transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
