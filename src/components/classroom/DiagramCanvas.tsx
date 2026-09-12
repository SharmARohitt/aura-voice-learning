import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { layoutDiagram, type DiagramNodeKind, type DiagramSpec } from "@/lib/diagram/spec";

interface Props {
  spec: DiagramSpec;
  activeNodeIds: string[];
  height: number;
}

type AuraNodeData = {
  label: string;
  detail?: string | undefined;
  kind: DiagramNodeKind;
  active: boolean;
};

const KIND_STYLE: Record<DiagramNodeKind, string> = {
  source: "border-amber/45 bg-amber/12 text-amber",
  process: "border-cream/20 bg-surface/70 text-cream",
  sink: "border-rose/40 bg-rose/10 text-rose",
  concept: "border-cream/15 bg-surface/60 text-cream/90",
  result: "border-mint/40 bg-mint/10 text-mint",
  note: "border-cream/10 bg-canvas/60 text-muted",
};

function AuraNode({ data }: NodeProps) {
  const d = data as AuraNodeData;
  return (
    <div
      className={`diagram-node rounded-xl border px-3 py-2 text-center backdrop-blur-xl transition-all duration-500 ${
        KIND_STYLE[d.kind]
      } ${d.active ? "diagram-node-active scale-[1.04]" : ""}`}
      style={{ minWidth: 108, maxWidth: 150 }}
    >
      <Handle type="target" position={Position.Top} className="!size-1 !border-0 !bg-cream/30" />
      <p className="text-[11px] font-semibold leading-tight">{d.label}</p>
      {d.detail && <p className="mt-0.5 text-[9px] leading-tight text-muted">{d.detail}</p>}
      <Handle type="source" position={Position.Bottom} className="!size-1 !border-0 !bg-cream/30" />
    </div>
  );
}

const nodeTypes = { aura: AuraNode };

export default function DiagramCanvas({ spec, activeNodeIds, height }: Props) {
  const positions = useMemo(() => layoutDiagram(spec), [spec]);

  const nodes = useMemo<Node[]>(
    () =>
      spec.nodes.map((n) => ({
        id: n.id,
        type: "aura",
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        draggable: false,
        data: {
          label: n.label,
          detail: n.detail,
          kind: n.kind,
          active: activeNodeIds.includes(n.id),
        } satisfies AuraNodeData,
      })),
    [spec, positions, activeNodeIds],
  );

  const edges = useMemo<Edge[]>(
    () =>
      spec.edges.map((e, i) => {
        const active = activeNodeIds.includes(e.from) && activeNodeIds.includes(e.to);
        return {
          id: `e-${i}-${e.from}-${e.to}`,
          source: e.from,
          target: e.to,
          ...(e.label ? { label: e.label } : {}),
          animated: active,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: {
            stroke: active ? "var(--forest)" : "var(--sage)",
            strokeWidth: active ? 1.8 : 1.2,
          },
          labelStyle: { fill: "var(--forest)", fontSize: 9 },
          labelBgStyle: { fill: "var(--paper)", fillOpacity: 0.9 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        } satisfies Edge;
      }),
    [spec, activeNodeIds],
  );

  return (
    <div style={{ height }} className="diagram-canvas w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable={false}
        panOnScroll={false}
        zoomOnScroll={false}
        preventScrolling={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--sage)" />
      </ReactFlow>
    </div>
  );
}
