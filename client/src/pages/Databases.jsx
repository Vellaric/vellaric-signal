import { useState, useEffect } from 'react';
import { databasesAPI } from '../services/api';
import { Database, Plus, Play, Square, RotateCw, Trash2, Info, Loader, HardDrive, Activity } from 'lucide-react';

export default function Databases() {
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState(null);

  useEffect(() => {
    loadDatabases();
  }, []);

  const loadDatabases = async () => {
    try {
      const response = await databasesAPI.getAll();
      const databaseList = response.data.databases || [];
      
      const databasesWithStats = await Promise.all(
        databaseList.map(async (db) => {
          try {
            const statsRes = await fetch(`/api/databases/${db.id}/stats`);
            const stats = await statsRes.json();
            return { ...db, stats };
          } catch (error) {
            return { ...db, stats: { status: 'error' } };
          }
        })
      );
      
      setDatabases(databasesWithStats);
    } catch (error) {
      console.error('Failed to load databases:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete database "${name}"?\n\nThis action cannot be undone. All data will be lost.`)) {
      return;
    }
    
    try {
      await databasesAPI.delete(id);
      alert('✅ Database deleted successfully');
      loadDatabases();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleControl = async (id, action) => {
    try {
      const response = await fetch(`/api/databases/${id}/${action}`, { method: 'POST' });
      const data = await response.json();
      
      if (response.ok) {
        alert(`✅ ${data.message}`);
        loadDatabases();
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      alert('❌ Error: ' + error.message);
    }
  };

  const handleShowConnection = (db) => {
    setSelectedDatabase(db);
    setShowConnectionModal(true);
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
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">Databases</h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-2">Manage PostgreSQL databases</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Database
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-[hsl(var(--muted))] border-b border-[hsl(var(--border))]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Environment</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Connection</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Stats</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-[hsl(var(--card))] divide-y divide-[hsl(var(--border))]">
            {databases.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-12">
                  <div className="text-center">
                    <Database className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-[hsl(var(--foreground))]">No databases</h3>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Create your first PostgreSQL database</p>
                    <button onClick={() => setShowCreateModal(true)} className="btn-primary mt-4">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Database
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              databases.map((db) => (
                <tr key={db.id} className="hover:bg-[hsl(var(--accent))]">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-[hsl(var(--foreground))]">{db.name}</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{db.container_name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      db.environment === 'production' 
                        ? 'bg-[hsl(var(--success))/10] text-green-800 dark:text-green-400'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                    }`}>
                      {db.environment}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => handleShowConnection(db)} className="btn text-xs">
                      View Connection
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      db.stats.status === 'running'
                        ? 'bg-[hsl(var(--success))/10] text-green-800 dark:text-green-400'
                        : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                    }`}>
                      <Activity className="w-3 h-3 mr-1" />
                      {db.stats.status || 'unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-[hsl(var(--muted-foreground))]">
                    {db.stats.status === 'running' ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <HardDrive className="w-3 h-3" />
                          {db.stats.size}
                        </div>
                        <div>🔌 {db.stats.connections} connections</div>
                        <div>⏱️ {db.stats.uptime}</div>
                      </div>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {db.stats.status === 'running' ? (
                        <>
                          <button onClick={() => handleControl(db.id, 'stop')} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" title="Stop">
                            <Square className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleControl(db.id, 'restart')} className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300" title="Restart">
                            <RotateCw className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => handleControl(db.id, 'start')} className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300" title="Start">
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(db.id, db.name)} className="text-[hsl(var(--destructive))] hover:text-red-700" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && <CreateDatabaseModal onClose={() => setShowCreateModal(false)} onSuccess={() => { setShowCreateModal(false); loadDatabases(); }} />}
      {showConnectionModal && selectedDatabase && <ConnectionModal database={selectedDatabase} onClose={() => { setShowConnectionModal(false); setSelectedDatabase(null); }} />}
    </div>
  );
}

function CreateDatabaseModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({ name: '', environment: 'production' });
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!/^[a-z0-9-]+$/.test(formData.name)) {
      alert('Database name must contain only lowercase letters, numbers, and hyphens');
      return;
    }
    
    setCreating(true);
    try {
      await databasesAPI.create(formData);
      alert('✅ Database created successfully!');
      onSuccess();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || error.message));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[hsl(var(--card))] rounded-lg p-8 max-w-lg w-full">
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-6">Create Database</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">Database Name</label>
            <input type="text" required pattern="[a-z0-9-]+" placeholder="my-database" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="input" />
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Lowercase letters, numbers, and hyphens only</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">Environment</label>
            <select value={formData.environment} onChange={(e) => setFormData({...formData, environment: e.target.value})} className="input">
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="submit" disabled={creating} className="btn-primary">{creating ? 'Creating...' : 'Create Database'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConnectionModal({ database, onClose }) {
  const [copied, setCopied] = useState(false);
  
  const connectionString = `postgresql://${database.username}:${database.password}@localhost:${database.port}/${database.name}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(connectionString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[hsl(var(--card))] rounded-lg p-8 max-w-2xl w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">Connection Information</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-[hsl(var(--foreground))]">✕</button>
        </div>
        
        <div className="space-y-4">
          <div className="bg-[hsl(var(--muted))] p-4 rounded-lg">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">Host</label>
            <code className="text-sm text-[hsl(var(--foreground))]">localhost</code>
          </div>
          
          <div className="bg-[hsl(var(--muted))] p-4 rounded-lg">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">Port</label>
            <code className="text-sm text-[hsl(var(--foreground))]">{database.port}</code>
          </div>
          
          <div className="bg-[hsl(var(--muted))] p-4 rounded-lg">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">Database</label>
            <code className="text-sm text-[hsl(var(--foreground))]">{database.name}</code>
          </div>
          
          <div className="bg-[hsl(var(--muted))] p-4 rounded-lg">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">Username</label>
            <code className="text-sm text-[hsl(var(--foreground))]">{database.username}</code>
          </div>
          
          <div className="bg-[hsl(var(--muted))] p-4 rounded-lg">
            <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">Password</label>
            <code className="text-sm text-[hsl(var(--foreground))]">{database.password}</code>
          </div>
          
          <div className="bg-[hsl(var(--muted))] p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-[hsl(var(--foreground))]">Connection String</label>
              <button onClick={copyToClipboard} className="text-xs btn">
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
            <code className="text-xs text-[hsl(var(--foreground))] break-all">{connectionString}</code>
          </div>
        </div>
        
        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="btn-primary">Close</button>
        </div>
      </div>
    </div>
  );
}
