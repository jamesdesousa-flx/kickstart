/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from "./supabaseClient";
import { extractFigmaFileKey, figmaFileUrlFromInput } from "./figjamMcpService";
import { CanvasEdge, CanvasNode } from "../types/artefacts";

export interface Project {
  id: string;
  name: string;
  figjamFileKey: string;
  figjamFileUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary extends Project {
  nodeCount: number;
}

interface ProjectRow {
  id: string;
  name: string;
  figjam_file_key: string;
  figjam_file_url: string;
  created_at: string;
  updated_at: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    figjamFileKey: row.figjam_file_key,
    figjamFileUrl: row.figjam_file_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PROJECT_COLUMNS = "id, name, figjam_file_key, figjam_file_url, created_at, updated_at";

export async function listProjects(): Promise<ProjectSummary[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(`${PROJECT_COLUMNS}, project_nodes(count)`)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
    ...toProject(row),
    nodeCount: row.project_nodes?.[0]?.count ?? 0,
  }));
}

export async function getProject(projectId: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toProject(data) : null;
}

export async function createProject(params: { name: string; figjamUrl: string }): Promise<Project> {
  const name = params.name.trim();
  if (!name) throw new Error("Give the project a name.");

  const figjamFileKey = extractFigmaFileKey(params.figjamUrl);
  if (!figjamFileKey || !/figma\.com\/(board|design|file)\//i.test(params.figjamUrl)) {
    throw new Error(
      "Paste a FigJam or Figma Design file link, like https://www.figma.com/board/abc123/My-Board or https://www.figma.com/design/abc123/My-File."
    );
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      figjam_file_key: figjamFileKey,
      figjam_file_url: figmaFileUrlFromInput(params.figjamUrl)!,
    })
    .select(PROJECT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toProject(data);
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
}

/* ==========================================================================
   Canvas persistence
   ========================================================================== */

/** Fields that only describe an in-flight request and must not survive a reload */
function toStoredNode(node: CanvasNode): Omit<CanvasNode, "isGenerating"> {
  const { isGenerating: _isGenerating, ...rest } = node;
  return rest;
}

export async function loadProjectCanvas(
  projectId: string
): Promise<{ nodes: CanvasNode[]; edges: CanvasEdge[] }> {
  const [nodesRes, edgesRes] = await Promise.all([
    supabase.from("project_nodes").select("id, type, position_x, position_y, data").eq("project_id", projectId),
    supabase.from("project_edges").select("id, from_node, to_node").eq("project_id", projectId),
  ]);
  if (nodesRes.error) throw new Error(nodesRes.error.message);
  if (edgesRes.error) throw new Error(edgesRes.error.message);

  const nodes: CanvasNode[] = (nodesRes.data || []).map((row: any) => ({
    ...(row.data as CanvasNode),
    id: row.id,
    type: row.type,
    position: { x: row.position_x, y: row.position_y },
  }));
  const edges: CanvasEdge[] = (edgesRes.data || []).map((row: any) => ({
    id: row.id,
    from: row.from_node,
    to: row.to_node,
  }));
  return { nodes, edges };
}

/**
 * Saves a project's canvas by diffing against the last saved snapshot,
 * so dragging one sticky only writes that one row.
 */
export class ProjectCanvasSaver {
  private savedNodes = new Map<string, string>();
  private savedEdges = new Map<string, string>();

  constructor(private projectId: string, initial: { nodes: CanvasNode[]; edges: CanvasEdge[] }) {
    initial.nodes.forEach((n) => this.savedNodes.set(n.id, JSON.stringify(toStoredNode(n))));
    initial.edges.forEach((e) => this.savedEdges.set(e.id, JSON.stringify(e)));
  }

  async save(nodes: CanvasNode[], edges: CanvasEdge[]): Promise<void> {
    const nodeJson = new Map(nodes.map((n) => [n.id, JSON.stringify(toStoredNode(n))]));
    const edgeJson = new Map(edges.map((e) => [e.id, JSON.stringify(e)]));

    const changedNodes = nodes.filter((n) => this.savedNodes.get(n.id) !== nodeJson.get(n.id));
    const removedNodeIds = [...this.savedNodes.keys()].filter((id) => !nodeJson.has(id));
    const changedEdges = edges.filter((e) => this.savedEdges.get(e.id) !== edgeJson.get(e.id));
    const removedEdgeIds = [...this.savedEdges.keys()].filter((id) => !edgeJson.has(id));

    // Order matters: edges reference nodes, so remove edges first and add nodes before edges
    if (removedEdgeIds.length > 0) {
      const { error } = await supabase
        .from("project_edges")
        .delete()
        .eq("project_id", this.projectId)
        .in("id", removedEdgeIds);
      if (error) throw new Error(error.message);
    }
    if (removedNodeIds.length > 0) {
      const { error } = await supabase
        .from("project_nodes")
        .delete()
        .eq("project_id", this.projectId)
        .in("id", removedNodeIds);
      if (error) throw new Error(error.message);
    }
    if (changedNodes.length > 0) {
      const { error } = await supabase.from("project_nodes").upsert(
        changedNodes.map((n) => ({
          project_id: this.projectId,
          id: n.id,
          type: n.type,
          position_x: n.position.x,
          position_y: n.position.y,
          data: toStoredNode(n),
          updated_at: new Date().toISOString(),
        }))
      );
      if (error) throw new Error(error.message);
    }
    if (changedEdges.length > 0) {
      const { error } = await supabase.from("project_edges").upsert(
        changedEdges.map((e) => ({
          project_id: this.projectId,
          id: e.id,
          from_node: e.from,
          to_node: e.to,
        }))
      );
      if (error) throw new Error(error.message);
    }

    // Only mark as saved once every write succeeded, so a failed save is retried in full
    this.savedNodes = nodeJson;
    this.savedEdges = edgeJson;
  }
}
