import { useCallback, useEffect, useState } from "react";
import { AGENT_MANAGER_URL } from "../../shared/messages";

export interface Project {
  id: string;
  name: string;
  dev_server_url?: string;
}

interface ProjectSelectorProps {
  selectedProjectId: string | null;
  onProjectChange: (projectId: string) => void;
  onProjectsLoaded?: (projects: Project[]) => void;
}

export function ProjectSelector({ selectedProjectId, onProjectChange, onProjectsLoaded }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(AGENT_MANAGER_URL + "/api/projects", {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = (await res.json()) as Project[];
      setProjects(data);
      onProjectsLoaded?.(data);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [onProjectsLoaded]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (loading) {
    return (
      <div className="project-selector">
        <span className="project-label">Project:</span>
        <span className="project-loading">Loading...</span>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="project-selector">
        <span className="project-label">Project:</span>
        <span className="project-empty">No projects</span>
      </div>
    );
  }

  return (
    <div className="project-selector">
      <span className="project-label">Project:</span>
      <select
        className="project-select"
        value={selectedProjectId ?? ""}
        onChange={(e) => onProjectChange(e.target.value)}
      >
        <option value="" disabled>Select project...</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}
