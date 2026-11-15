// React Flow parts graph. Loaded from CDN as UMD globals (React, ReactDOM, ReactFlow).
// Exposes window.MotorsportFlow.render(container, props).
(function () {
  const RF = window.ReactFlow;
  if (!window.React || !window.ReactDOM || !RF) {
    window.MotorsportFlow = { available: false, render() {}, renderProcess() {} };
    return;
  }
  const h = React.createElement;
  const Flow = RF.default || RF.ReactFlow;
  const { Background, Controls, MiniMap, MarkerType, Position, useNodesState, useEdgesState, ReactFlowProvider, useReactFlow } = RF;
  const COLORS = { EV: ["#e0ecff", "#2563eb"], ICE: ["#fff1e0", "#d97706"], Both: ["#e6f4f1", "#0d8273"] };

  // Tidy left-to-right tree layout: leaves stack vertically, parents centre on their children.
  function layout(parts, parentIdOf) {
    const kids = {};
    const roots = [];
    parts.forEach((p) => { const pid = parentIdOf(p); pid ? (kids[pid] ||= []).push(p) : roots.push(p); });
    const pos = {}; let row = 0;
    const place = (p, depth, seen) => {
      if (seen.has(p.id)) return 0;
      seen.add(p.id);
      const children = kids[p.id] || [];
      let y;
      if (!children.length) { y = row++ * 64; }
      else { const ys = children.map((c) => place(c, depth + 1, seen)); y = (Math.min(...ys) + Math.max(...ys)) / 2; }
      pos[p.id] = { x: depth * 250, y };
      return y;
    };
    const seen = new Set();
    roots.forEach((r) => { place(r, 0, seen); row += 0.5; });
    parts.forEach((p) => { if (!pos[p.id]) place(p, 0, seen); }); // anything stuck in a cycle
    return pos;
  }

  function build({ parts, platform }) {
    const visible = parts.filter((p) => platform === "All" || [platform, "Both"].includes(p.platform || "Both"));
    const firstIdByName = {};
    visible.forEach((p) => { if (!(p.name in firstIdByName)) firstIdByName[p.name] = p.id; });
    const parentIdOf = (p) => { const id = p.parent && firstIdByName[p.parent]; return id && id !== p.id ? id : null; };
    const pos = layout(visible, parentIdOf);
    const nodes = visible.map((p) => {
      const plat = p.platform || "Both"; const [bg, border] = COLORS[plat] || COLORS.Both;
      return {
        id: p.id, position: pos[p.id] || { x: 0, y: 0 },
        sourcePosition: Position.Right, targetPosition: Position.Left,
        data: { label: h("div", { className: "flow-node" }, h("strong", null, p.name), h("small", null, `${plat} · ×${p.quantity} · ${p.status}`)) },
        style: { background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: 6, width: 190, fontSize: 12 }
      };
    });
    const edges = visible.filter(parentIdOf).map((p) => ({
      id: `e-${p.id}`, source: parentIdOf(p), target: p.id, type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#94a3b8" }
    }));
    return { nodes, edges };
  }

  function Graph(props) {
    const built = React.useMemo(() => build(props), [props.parts, props.platform]);
    const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges);
    const rf = useReactFlow();
    React.useEffect(() => { setNodes(built.nodes); setEdges(built.edges); requestAnimationFrame(() => rf.setViewport({ x: 30, y: 30, zoom: 0.9 })); }, [built]);
    const onConnect = (c) => { if (props.canReparent) props.onReparent(c.target, c.source); };
    return h(Flow, {
      nodes, edges, onNodesChange, onEdgesChange, onConnect, defaultViewport: { x: 30, y: 30, zoom: 0.9 }, minZoom: 0.1,
      nodesConnectable: !!props.canReparent, proOptions: { hideAttribution: false }
    }, h(Background, { gap: 18, color: "#e2e8f0" }), h(Controls), h(MiniMap, { pannable: true, zoomable: true, nodeColor: (n) => n.style?.border?.split(" ").pop() || "#94a3b8" }));
  }

  // Process map: stages laid out left to right, live item counts, role-gated transitions.
  const { Handle } = RF;
  // Stage node: in on the left, out on the right, plus top handles so loop-back edges arc over the row.
  function StageNode({ data }) {
    return h(React.Fragment, null,
      h(Handle, { type: "target", position: Position.Left, id: "in" }),
      h(Handle, { type: "source", position: Position.Right, id: "out" }),
      h(Handle, { type: "source", position: Position.Top, id: "top-out" }),
      h(Handle, { type: "target", position: Position.Top, id: "top-in" }),
      data.label);
  }
  const stageTypes = { stage: StageNode };
  function Process({ stages, edges }) {
    const nodes = stages.map((s, i) => ({
      id: s.id, type: "stage", position: { x: i * 310, y: 0 }, draggable: false,
      sourcePosition: Position.Right, targetPosition: Position.Left,
      data: { label: h("div", { className: "stage" },
        h("div", { className: "stage-top" }, h("span", null, s.label), h("b", null, s.items.length)),
        s.items.length ? h("ul", null, s.items.slice(0, 3).map((t, k) => h("li", { key: k }, t)), s.items.length > 3 ? h("li", { className: "more" }, `+${s.items.length - 3} more`) : null) : h("p", null, "Empty")) },
      className: `stage-node${s.items.length ? "" : " empty"}${s.final ? " final" : ""}`,
      style: { width: 190 }
    }));
    const flowEdges = edges.map((e, i) => {
      const back = stages.findIndex((s) => s.id === e.to) < stages.findIndex((s) => s.id === e.from);
      return {
        id: `p${i}`, source: e.from, target: e.to, label: e.label, type: back ? "smoothstep" : "default", sourceHandle: back ? "top-out" : "out", targetHandle: back ? "top-in" : "in",
        animated: !!e.mine, markerEnd: { type: MarkerType.ArrowClosed, color: e.mine ? "#e11d48" : "#94a3b8" },
        style: { stroke: e.mine ? "#e11d48" : "#94a3b8", strokeWidth: e.mine ? 2 : 1.5, strokeDasharray: back ? "5 4" : undefined },
        labelStyle: { fontSize: 10, fontWeight: 600, fill: e.mine ? "#be123c" : "#64748b" },
        labelBgStyle: { fill: "var(--surface, #fff)" }, labelBgPadding: [4, 2], labelBgBorderRadius: 4,
        ...(back ? { pathOptions: { offset: 40, borderRadius: 14 } } : {})
      };
    });
    return h(Flow, {
      nodes, edges: flowEdges, nodeTypes: stageTypes, fitView: true, fitViewOptions: { padding: 0.12 }, nodesDraggable: false, nodesConnectable: false,
      elementsSelectable: false, zoomOnScroll: false, panOnScroll: false, preventScrolling: false, panOnDrag: true, minZoom: 0.3, maxZoom: 1.2
    }, h(Background, { gap: 18, size: 1, color: "rgba(148,163,184,.35)" }));
  }

  const roots = new WeakMap();
  window.MotorsportFlow = {
    available: true,
    renderProcess(container, props) {
      let root = roots.get(container);
      if (!root) { root = ReactDOM.createRoot(container); roots.set(container, root); }
      root.render(h(ReactFlowProvider, null, h(Process, { ...props, key: Date.now() })));
    },
    render(container, props) {
      let root = roots.get(container);
      if (!root) { root = ReactDOM.createRoot(container); roots.set(container, root); }
      root.render(h(ReactFlowProvider, null, h(Graph, props)));
    }
  };
})();
