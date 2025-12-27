import { useState, useEffect } from 'react';
import { projectsAPI } from '../services/api';
import { Package, GitBranch, Settings, Trash2, Rocket, Plus, GitFork, CheckCircle, XCircle, Loader } from 'lucide-react';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await projectsAPI.getAll();
      setProjects(response.data.data || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId, projectName) => {
    if (!window.confirm(`Delete project "${projectName}"?\n\nThis will also delete all environment variables and deployment history.`)) {
      return;
    }

    try {
      await projectsAPI.delete(projectId);
      alert('✅ Project deleted successfully!');
      loadProjects();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeploy = (project) => {
    setSelectedProject(project);
    setShowDeployModal(true);
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Manage your deployment projects and configure repositories</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowImportModal(true)} className="btn flex items-center gap-2">
            <GitFork className="w-4 h-4" />
            Import from GitLab
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Project Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Repository</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Default Branch</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Auto Deploy</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {projects.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-6 py-12">
                  <div className="text-center">
                    <Package className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No projects</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Get started by adding your first project</p>
                    <button onClick={() => setShowAddModal(true)} className="btn-primary mt-4">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Project
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              projects.map((project) => (
                <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                        <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{project.name}</div>
                        {project.description && <div className="text-sm text-gray-500 dark:text-gray-400">{project.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{project.repo_url}</code>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                      <GitBranch className="w-3 h-3 mr-1" />
                      {project.default_branch}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {project.auto_deploy ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        On
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-400">
                        <XCircle className="w-3 h-3 mr-1" />
                        Off
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleDeploy(project)} className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300" title="Deploy">
                        <Rocket className="w-4 h-4" />
                      </button>
                      <button onClick={() => window.location.href = '/environment'} className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200" title="Environment Variables">
                        <Settings className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteProject(project.id, project.name)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300" title="Delete">
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

      {showAddModal && <AddProjectModal onClose={() => setShowAddModal(false)} onSuccess={() => { setShowAddModal(false); loadProjects(); }} />}
      {showDeployModal && selectedProject && <DeployModal project={selectedProject} onClose={() => { setShowDeployModal(false); setSelectedProject(null); }} />}
      {showImportModal && <ImportGitLabModal onClose={() => setShowImportModal(false)} onSuccess={() => { setShowImportModal(false); loadProjects(); }} />}
    </div>
  );
}

function AddProjectModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({ name: '', repoUrl: '', defaultBranch: 'production', enabledBranches: 'production,master,dev', description: '', autoDeploy: true });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await projectsAPI.create(formData);
      alert('✅ Project added successfully!');
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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Add New Project</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Project Name * <span className="text-gray-500 text-xs">(alphanumeric, hyphens, underscores)</span></label>
            <input type="text" required pattern="[a-zA-Z0-9_-]+" placeholder="my-awesome-app" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Repository URL *</label>
            <input type="url" required placeholder="https://gitlab.com/username/repo.git" value={formData.repoUrl} onChange={(e) => setFormData({...formData, repoUrl: e.target.value})} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Default Branch</label>
            <select value={formData.defaultBranch} onChange={(e) => setFormData({...formData, defaultBranch: e.target.value})} className="input">
              <option value="production">production</option>
              <option value="master">master</option>
              <option value="dev">dev</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Enabled Branches <span className="text-gray-500 text-xs">(comma-separated)</span></label>
            <input type="text" placeholder="production,master,dev" value={formData.enabledBranches} onChange={(e) => setFormData({...formData, enabledBranches: e.target.value})} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description <span className="text-gray-500 text-xs">(optional)</span></label>
            <textarea rows="2" placeholder="Brief description of this project" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="input" />
          </div>
          <div className="flex items-center">
            <input type="checkbox" id="autoDeploy" checked={formData.autoDeploy} onChange={(e) => setFormData({...formData, autoDeploy: e.target.checked})} className="h-4 w-4 text-blue-600 rounded" />
            <label htmlFor="autoDeploy" className="ml-2 text-sm text-gray-700 dark:text-gray-300">🚀 Enable automatic deployment on push</label>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">{submitting ? 'Adding...' : 'Add Project'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeployModal({ project, onClose }) {
  const [branch, setBranch] = useState(project.default_branch);
  const [deploying, setDeploying] = useState(false);
  const branches = project.enabled_branches.split(',');

  const handleDeploy = async (e) => {
    e.preventDefault();
    setDeploying(true);
    try {
      await projectsAPI.deploy(project.id, branch);
      alert(`✅ Deployment queued successfully!\nProject: ${project.name}\nBranch: ${branch}`);
      onClose();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || error.message));
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg p-8 max-w-lg w-full">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Deploy {project.name}</h2>
        <form onSubmit={handleDeploy} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Branch</label>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className="input">
              {branches.map((b) => (<option key={b} value={b}>{b}</option>))}
            </select>
          </div>
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400"><strong>Repository:</strong><br /><code className="text-xs">{project.repo_url}</code></p>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="submit" disabled={deploying} className="btn-primary">{deploying ? 'Deploying...' : '🚀 Deploy Now'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportGitLabModal({ onClose, onSuccess }) {
  const [gitlabProjects, setGitlabProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(null);

  useEffect(() => {
    loadGitLabProjects();
  }, []);

  const loadGitLabProjects = async () => {
    try {
      const response = await projectsAPI.getGitLabProjects();
      setGitlabProjects(response.data.data || []);
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || 'Failed to load GitLab projects'));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (proj) => {
    setImporting(proj.id);
    try {
      await projectsAPI.create({ name: proj.name, repoUrl: proj.httpUrl, gitlabProjectId: proj.id, defaultBranch: proj.defaultBranch || 'production', enabledBranches: 'production,master,dev', autoDeploy: true, description: proj.description || '' });
      alert(`✅ Project "${proj.name}" imported successfully!`);
      onSuccess();
    } catch (error) {
      alert('❌ Error: ' + (error.response?.data?.error || error.message));
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Import from GitLab</h2>
        {loading ? (
          <div className="text-center py-12"><Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto" /><p className="text-gray-600 dark:text-gray-400 mt-4">Loading GitLab projects...</p></div>
        ) : gitlabProjects.length === 0 ? (
          <div className="text-center py-12"><Package className="w-12 h-12 text-gray-400 mx-auto mb-4" /><p className="text-gray-600 dark:text-gray-400">No GitLab projects found</p></div>
        ) : (
          <div className="space-y-3">
            {gitlabProjects.map((proj) => (
              <div key={proj.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{proj.fullName}</h3>
                    {proj.description && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{proj.description}</p>}
                    <code className="text-xs text-gray-500 dark:text-gray-500 mt-2 block">{proj.httpUrl}</code>
                  </div>
                  <button onClick={() => handleImport(proj)} disabled={importing === proj.id} className="btn-primary ml-4">{importing === proj.id ? 'Importing...' : 'Import'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="btn">Close</button>
        </div>
      </div>
    </div>
  );
}
