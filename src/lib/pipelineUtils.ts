import { v4 as uuidv4 } from "uuid";
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  AgentNodeData,
  LoopNodeData,
} from "../types";
import { newAgentNodeData } from "./defaults";

// Returns top-level pipeline steps in execution order (skips start/end, skips child nodes)
// Uses topological sort to handle branching pipelines correctly.
export function getOrderedSteps(workflow: Workflow): WorkflowNode[] {
  const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]));
  const topLevel = workflow.nodes.filter((n) => !n.parentId);
  const topLevelIds = new Set(topLevel.map((n) => n.id));

  // Build adjacency and indegree only for top-level nodes
  const adj = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const n of topLevel) {
    adj.set(n.id, []);
    indegree.set(n.id, 0);
  }

  for (const e of workflow.edges) {
    if (!topLevelIds.has(e.sourceNodeId) || !topLevelIds.has(e.targetNodeId))
      continue;
    adj.get(e.sourceNodeId)!.push(e.targetNodeId);
    indegree.set(e.targetNodeId, (indegree.get(e.targetNodeId) ?? 0) + 1);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) queue.push(id);
  }

  const ordered: WorkflowNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;

    const node = nodeMap.get(id);
    if (!node) continue;

    // Skip start/end nodes
    if (node.type !== "start" && node.type !== "end") {
      ordered.push(node);
    }

    for (const neighbor of adj.get(id) ?? []) {
      const newDeg = (indegree.get(neighbor) ?? 1) - 1;
      indegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  return ordered;
}

// Returns child agent nodes for a loop group
export function getLoopChildren(
  workflow: Workflow,
  loopNodeId: string,
): WorkflowNode[] {
  return workflow.nodes.filter((n) => n.parentId === loopNodeId);
}

// Get the edge that points to the End node
function getEdgeToEnd(workflow: Workflow): WorkflowEdge | undefined {
  const endNode = workflow.nodes.find((n) => n.type === "end");
  if (!endNode) return undefined;
  return workflow.edges.find((e) => e.targetNodeId === endNode.id);
}

// Get the start node id (for when pipeline is empty)
function getStartNodeId(workflow: Workflow): string | undefined {
  return workflow.nodes.find((n) => n.type === "start")?.id;
}

// Insert a new agent at the end of the pipeline (before End node)
export function appendAgentToPipeline(
  workflow: Workflow,
  overrides?: Partial<AgentNodeData>,
  defaultModel?: import("../types").ModelConfig,
): Workflow {
  const endNode = workflow.nodes.find((n) => n.type === "end");
  if (!endNode) return workflow;

  const edgeToEnd = getEdgeToEnd(workflow);
  const prevNodeId = edgeToEnd?.sourceNodeId ?? getStartNodeId(workflow);
  if (!prevNodeId) return workflow;

  const newNode: WorkflowNode = {
    id: uuidv4(),
    type: "agent",
    position: { x: 0, y: 0 },
    data: newAgentNodeData({
      ...(defaultModel ? { model: defaultModel } : {}),
      ...overrides,
    }),
  };

  const edge1: WorkflowEdge = {
    id: uuidv4(),
    sourceNodeId: prevNodeId,
    targetNodeId: newNode.id,
    contextMode: "full",
  };

  const edge2: WorkflowEdge = {
    id: uuidv4(),
    sourceNodeId: newNode.id,
    targetNodeId: endNode.id,
    contextMode: "full",
  };

  return {
    ...workflow,
    nodes: [...workflow.nodes, newNode],
    edges: [
      ...(edgeToEnd
        ? workflow.edges.filter((e) => e.id !== edgeToEnd.id)
        : workflow.edges),
      edge1,
      edge2,
    ],
  };
}

// Append a loop group to the end of the pipeline
export function appendLoopToPipeline(
  workflow: Workflow,
  _defaultModel?: import("../types").ModelConfig,
): Workflow {
  const endNode = workflow.nodes.find((n) => n.type === "end");
  if (!endNode) return workflow;

  const edgeToEnd = getEdgeToEnd(workflow);
  const prevNodeId = edgeToEnd?.sourceNodeId ?? getStartNodeId(workflow);
  if (!prevNodeId) return workflow;

  const groupId = uuidv4();
  const workerId = uuidv4();
  const reviewerId = uuidv4();

  const groupNode: WorkflowNode = {
    id: groupId,
    type: "loop",
    position: { x: 0, y: 0 },
    data: {
      targetNodeId: workerId,
      reviewerNodeId: reviewerId,
      maxRetries: 3,
      exitCondition: "reviewer_approves",
    } satisfies LoopNodeData,
  };

  const workerNode: WorkflowNode = {
    id: workerId,
    type: "agent",
    position: { x: 30, y: 70 },
    parentId: groupId,
    extent: "parent",
    data: newAgentNodeData({
      name: "Worker",
      roleDescription: "Does the task",
      systemPrompt:
        "## Role\nYou are a skilled worker agent.\n\n## Objective\nComplete the given task thoroughly. If given reviewer feedback, revise accordingly.\n\n## Output format\nComplete, well-structured response.\n\n## Constraints\n- Be specific and actionable\n- Address all feedback points when revising",
      contextMode: "full_chain",
    }),
  };

  const reviewerNode: WorkflowNode = {
    id: reviewerId,
    type: "agent",
    position: { x: 280, y: 70 },
    parentId: groupId,
    extent: "parent",
    data: newAgentNodeData({
      name: "Reviewer",
      roleDescription: "Reviews and provides feedback",
      systemPrompt:
        '## Role\nYou are a critical reviewer.\n\n## Objective\nReview the output and provide structured feedback.\n\n## Output format\nEnd with either "APPROVED" or "NEEDS REVISION" followed by numbered feedback points.\n\n## Constraints\n- Only say APPROVED when genuinely satisfied',
      contextMode: "full_chain",
    }),
  };

  const edge1: WorkflowEdge = {
    id: uuidv4(),
    sourceNodeId: prevNodeId,
    targetNodeId: groupId,
    contextMode: "full",
  };

  const edge2: WorkflowEdge = {
    id: uuidv4(),
    sourceNodeId: groupId,
    targetNodeId: endNode.id,
    contextMode: "full",
  };

  return {
    ...workflow,
    nodes: [...workflow.nodes, groupNode, workerNode, reviewerNode],
    edges: [
      ...(edgeToEnd
        ? workflow.edges.filter((e) => e.id !== edgeToEnd.id)
        : workflow.edges),
      edge1,
      edge2,
    ],
  };
}

// Remove a step (agent or loop group + children) from the pipeline, rewiring edges
export function removeStepFromPipeline(
  workflow: Workflow,
  nodeId: string,
): Workflow {
  const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]));
  const node = nodeMap.get(nodeId);
  if (!node) return workflow;

  const toRemove = new Set([nodeId]);
  // collect children (loop group)
  for (const n of workflow.nodes) {
    if (n.parentId === nodeId) toRemove.add(n.id);
  }

  // find incoming and outgoing edges for this node
  const inEdge = workflow.edges.find((e) => e.targetNodeId === nodeId);
  const outEdge = workflow.edges.find((e) => e.sourceNodeId === nodeId);

  let newEdges = workflow.edges.filter(
    (e) => !toRemove.has(e.sourceNodeId) && !toRemove.has(e.targetNodeId),
  );

  // rewire: if both exist, connect previous → next
  if (inEdge && outEdge) {
    newEdges.push({
      id: uuidv4(),
      sourceNodeId: inEdge.sourceNodeId,
      targetNodeId: outEdge.targetNodeId,
      contextMode: inEdge.contextMode,
    });
  }

  return {
    ...workflow,
    nodes: workflow.nodes.filter((n) => !toRemove.has(n.id)),
    edges: newEdges,
  };
}

// Move a step up in the pipeline (swap with predecessor)
export function moveStepUp(workflow: Workflow, nodeId: string): Workflow {
  const steps = getOrderedSteps(workflow);
  const idx = steps.findIndex((s) => s.id === nodeId);
  if (idx <= 0) return workflow;
  return swapSteps(workflow, steps[idx - 1].id, steps[idx].id);
}

// Move a step down in the pipeline (swap with successor)
export function moveStepDown(workflow: Workflow, nodeId: string): Workflow {
  const steps = getOrderedSteps(workflow);
  const idx = steps.findIndex((s) => s.id === nodeId);
  if (idx < 0 || idx >= steps.length - 1) return workflow;
  return swapSteps(workflow, steps[idx].id, steps[idx + 1].id);
}

// Swap two adjacent steps in the pipeline by rewiring edges
function swapSteps(workflow: Workflow, aId: string, bId: string): Workflow {
  // A → B becomes B → A
  // Find: prev → A → B → next
  const edgeBefore = workflow.edges.find((e) => e.targetNodeId === aId);
  const edgeAB = workflow.edges.find(
    (e) => e.sourceNodeId === aId && e.targetNodeId === bId,
  );
  const edgeAfter = workflow.edges.find((e) => e.sourceNodeId === bId);

  if (!edgeAB) return workflow;

  const newEdges = workflow.edges.filter(
    (e) =>
      e.id !== edgeBefore?.id && e.id !== edgeAB.id && e.id !== edgeAfter?.id,
  );

  if (edgeBefore) newEdges.push({ ...edgeBefore, targetNodeId: bId });
  newEdges.push({ ...edgeAB, sourceNodeId: bId, targetNodeId: aId });
  if (edgeAfter) newEdges.push({ ...edgeAfter, sourceNodeId: aId });

  return { ...workflow, edges: newEdges };
}
