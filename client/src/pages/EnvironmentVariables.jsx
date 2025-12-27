import { useState, useEffect } from 'react';
import { envAPI, projectsAPI } from '../services/api';
import { Key, Lock, FileText, Plus, Trash2, Loader, Rocket } from 'lucide-react';

export default function EnvironmentVariables() {
  const [envVars, setEnvVars] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const projectsRes = await projectsAPI.getAll();
      const projectsData = projectsRes.data.data || [];
      setProjects(projectsData);
      
      const allEnvVars = [];
      for (const project of projectsData) {
        try {
          const envRes = await envAPI.getAll(project.id);
          const vars = envRes.data.data || [];
          const varsWithProject = vars.map(v => ({ ...v, project_name: project.name }));
          allEnvVars.push(...varsWithProject);
        } catch (error) {
          console.error(`Error loading env vars for ${project.name}:`, error);
        }
      }
      
      setEnvVars(allEnvVars);
    } catch (error) {
      console.error('Failed to load environment variables:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, projectName, key) => {
    if (!window.confirm(`Delete ${key} from ${projectName}?`)) return;
    
    try {
      await envAPI.delete(id);
      alert('✅ Environment variable deleted successfully!');
      loadData();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || error.message));
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Environment Variables</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Configure environment variables for your projects</p>
        </div>
        <button
          onClick={() => {
            if (projects.length === 0) {
              alert('⚠️ Please add a project first before configuring environment variables.');
              window.location.href = '/projects';
            } else {
              setShowAddModal(true);
            }
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Variable
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Project</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Branch</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Key</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Value</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {envVars.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-12">
                  <div className="text-center">
                    <Key className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                      {projects.length === 0 ? 'No projects found' : 'No environment variables configured'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {projects.length === 0 
                        ? 'Add a project first to configure environment variables' 
                        : 'Add environment variables to configure your applications'}
                    </p>
                    <button
                      onClick={() => projects.length === 0 ? window.location.href = '/projects' : setShowAddModal(true)}
                      className="btn-primary mt-4"
                    >
                      {projects.length === 0 ? 'Add Project' : 'Add Variable'}
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              envVars.map((env) => (
                <tr key={env.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{env.project_name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{env.branch}</code>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-sm text-blue-600 dark:text-blue-400">{env.key}</code>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <code className="text-xs text-gray-600 dark:text-gray-400">{env.is_secret ? '••••••••' : env.value}</code>
                      {env.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">{env.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {env.is_secret ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400">
                        <Lock className="w-3 h-3 mr-1" />
                        Secret
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">
                        <FileText className="w-3 h-3 mr-1" />
                        Public
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    <button
                      onClick={() => handleDelete(env.id, env.project_name, env.key)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && <AddEnvVarModal projects={projects} onClose={() => setShowAddModal(false)} onSuccess={() => { setShowAddModal(false); loadData(); }} />}
    </div>
  );
}

function AddEnvVarModal({ projects, onClose, onSuccess }) {
  const [formData, setFormData] = useState({ projectId: '', branch: '', key: '', value: '', description: '', isSecret: false, triggerRedeploy: false });
  const [branches, setBranches] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const handleProjectChange = (projectId) => {
    const project = projects.find(p => p.id === parseInt(projectId));
    if (project) {
      const projectBranches = project.enabled_branches.split(',');
      setBranches(projectBranches);
      setFormData({ ...formData, projectId, branch: projectBranches[0] || '' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await envAPI.create(formData);
      if (formData.triggerRedeploy) {
        alert('✅ Environment variable saved and redeployment queued!');
      } else {
        alert('✅ Environment variable saved successfully!');
      }
      onSuccess();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || error.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Add Environment Variable</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Project *</label>
            <select required value={formData.projectId} onChange={(e) => handleProjectChange(e.target.value)} className="input">
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Branch *</label>
            <select required value={formData.branch} onChange={(e) => setFormData({...formData, branch: e.target.value})} className="input" disabled={!formData.projectId}>
              <option value="">Select project first</option>
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Key * <span className="text-gray-500 text-xs">(e.g., NODE_ENV, DATABASE_URL)</span></label>
            <input type="text" required pattern="[A-Z_][A-Z0-9_]*" placeholder="NODE_ENV" value={formData.key} onChange={(e) => setFormData({...formData, key: e.target.value.toUpperCase()})} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Value *</label>
            <textarea required rows="3" placeholder="production" value={formData.value} onChange={(e) => setFormData({...formData, value: e.target.value})} className="input font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description <span className="text-gray-500 text-xs">(optional)</span></label>
            <input type="text" placeholder="Environment mode for the application" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="input" />
          </div>
          <div className="flex items-center">
            <input type="checkbox" id="isSecret" checked={formData.isSecret} onChange={(e) => setFormData({...formData, isSecret: e.target.checked})} className="h-4 w-4 text-blue-600 rounded" />
            <label htmlFor="isSecret" className="ml-2 text-sm text-gray-700 dark:text-gray-300">🔒 Mark as secret (value will be masked)</label>
          </div>
          <div className="flex items-center">
            <input type="checkbox" id="triggerRedeploy" checked={formData.triggerRedeploy} onChange={(e) => setFormData({...formData, triggerRedeploy: e.target.checked})} className="h-4 w-4 text-blue-600 rounded" />
            <label htmlFor="triggerRedeploy" className="ml-2 text-sm text-gray-700 dark:text-gray-300">🚀 Redeploy after saving (applies changes immediately)</label>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Adding...' : 'Add Variable'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
