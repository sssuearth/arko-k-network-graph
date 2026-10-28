// Differential growth: closed/open polylines that simultaneously (a) repel
// nearby points (separation), (b) pull toward the midpoint of their chain
// neighbors (cohesion/alignment), and (c) subdivide edges that stretch past
// a threshold. The interplay of repulsion + continuous subdivision is what
// produces the coral/maze-like folding seen in differential-growth art.
export const defaultOptions = {
  separationRadius: 7,
  separationStrength: 1.8,
  springStrength: 0.08,
  alignStrength: 0.03,
  maxEdgeLength: 6,
  minEdgeLength: 1.5,
  growthProbability: 0.6,
  growthInterval: 2,
  maxNodes: 16000,
  maxStep: 1.4,
  jitter: 0.15,
  constrainToShape: true,
  spreadEnabled: true,
  spreadStartSteps: 700,
  spreadRampSteps: 1500,
};

export class DifferentialGrowth {
  constructor(chains, options = {}) {
    this.options = { ...defaultOptions, ...options };
    this.mask = options.mask ?? null;
    this._growthCounter = 0;
    this.stepCount = 0;
    this.spreadT = 0;
    this.setChains(chains);
  }

  setChains(chains) {
    this.chains = chains.map((c) => ({
      closed: c.closed,
      nodes: c.points.map((p) => ({ x: p.x, y: p.y, nx: 0, ny: 0 })),
    }));
    this._growthCounter = 0;
    this.stepCount = 0;
    this.spreadT = 0;
  }

  get totalNodes() {
    let n = 0;
    for (const c of this.chains) n += c.nodes.length;
    return n;
  }

  step() {
    this.stepCount++;
    this._updateSpread();
    this._buildGrid();
    this._applyForces();
    this._growthCounter++;
    if (this._growthCounter >= this.options.growthInterval && this.totalNodes < this.options.maxNodes) {
      this._growthCounter = 0;
      this._grow();
    }
  }

  // After spreadStartSteps (by which the interior has had time to pack
  // solid), ramp spreadT from 0 to 1 over spreadRampSteps — _applyForces reads
  // this to index progressively further into the mask's dilation levels, letting
  // the coral spill past the source SVG's original boundary instead of staying
  // hard-clipped to it forever. Driven by elapsed steps rather than a fill-ratio
  // threshold, since dense shapes can plateau well under 100% of maxNodes once
  // the interior is as packed as the given separation radius allows.
  _updateSpread() {
    const { spreadEnabled, spreadStartSteps, spreadRampSteps } = this.options;
    if (!spreadEnabled || !this.mask || !this.mask.levelCount || this.stepCount < spreadStartSteps) {
      this.spreadT = 0;
      return;
    }
    this.spreadT = Math.min(1, (this.stepCount - spreadStartSteps) / Math.max(1, spreadRampSteps));
  }

  _buildGrid() {
    const cellSize = Math.max(1, this.options.separationRadius);
    this.cellSize = cellSize;
    const grid = new Map();
    this.grid = grid;
    for (const chain of this.chains) {
      for (const node of chain.nodes) {
        const key = this._cellKeyFor(node.x, node.y);
        let arr = grid.get(key);
        if (!arr) {
          arr = [];
          grid.set(key, arr);
        }
        arr.push(node);
      }
    }
  }

  _cellKeyFor(x, y) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return cx * 100003 + cy;
  }

  _forEachNeighbor(x, y, callback) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = this.grid.get((cx + dx) * 100003 + (cy + dy));
        if (!arr) continue;
        for (const other of arr) callback(other);
      }
    }
  }

  _applyForces() {
    const { separationRadius, separationStrength, springStrength, alignStrength, maxStep, jitter } = this.options;
    const r2 = separationRadius * separationRadius;

    for (const chain of this.chains) {
      const nodes = chain.nodes;
      const n = nodes.length;
      for (let i = 0; i < n; i++) {
        const node = nodes[i];
        let fx = 0;
        let fy = 0;

        let sepX = 0;
        let sepY = 0;
        let sepCount = 0;
        this._forEachNeighbor(node.x, node.y, (other) => {
          if (other === node) return;
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < r2 && d2 > 1e-9) {
            const d = Math.sqrt(d2);
            const w = (separationRadius - d) / separationRadius;
            sepX += (dx / d) * w;
            sepY += (dy / d) * w;
            sepCount++;
          }
        });
        if (sepCount > 0) {
          fx += (sepX / sepCount) * separationStrength;
          fy += (sepY / sepCount) * separationStrength;
        }

        const hasPrev = chain.closed || i > 0;
        const hasNext = chain.closed || i < n - 1;
        if (hasPrev && hasNext) {
          const prev = nodes[chain.closed ? (i - 1 + n) % n : i - 1];
          const next = nodes[chain.closed ? (i + 1) % n : i + 1];
          const midX = (prev.x + next.x) / 2;
          const midY = (prev.y + next.y) / 2;
          fx += (midX - node.x) * springStrength;
          fy += (midY - node.y) * springStrength;
          fx += (midX - node.x) * alignStrength;
          fy += (midY - node.y) * alignStrength;
        }

        if (jitter > 0) {
          fx += (Math.random() - 0.5) * jitter;
          fy += (Math.random() - 0.5) * jitter;
        }

        const flen = Math.hypot(fx, fy);
        if (flen > maxStep) {
          fx = (fx / flen) * maxStep;
          fy = (fy / flen) * maxStep;
        }

        node.nx = node.x + fx;
        node.ny = node.y + fy;
      }
    }

    const { constrainToShape } = this.options;
    const mask = this.mask;
    const levelIndex = mask && mask.levelCount ? Math.round(this.spreadT * (mask.levelCount - 1)) : 0;
    for (const chain of this.chains) {
      for (const node of chain.nodes) {
        if (constrainToShape && mask && !mask.isInsideAtLevel(node.nx, node.ny, levelIndex)) {
          continue; // reject the move, keep previous position
        }
        node.x = node.nx;
        node.y = node.ny;
      }
    }
  }

  _grow() {
    // Growth is only partly gated by edge length: beyond the hard maxEdgeLength
    // threshold a split always happens, but edges are also split probabilistically
    // below that, so arc length keeps being pumped into the system continuously.
    // That steady material addition is what forces the curve to buckle/fold once
    // separation can no longer keep it spread flat (the coral/maze look).
    const { maxEdgeLength, minEdgeLength, growthProbability } = this.options;
    for (const chain of this.chains) {
      const nodes = chain.nodes;
      const n = nodes.length;
      if (n < 2) continue;
      const grown = [];
      const limit = chain.closed ? n : n - 1;
      for (let i = 0; i < n; i++) {
        const a = nodes[i];
        grown.push(a);
        if (i >= limit) continue;
        const b = nodes[(i + 1) % n];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        // The soft threshold must leave both post-split halves safely above
        // minEdgeLength, otherwise _prune() deletes the new midpoint on the
        // same pass it was created (growth would silently never stick).
        const softThreshold = Math.max(minEdgeLength * 2.4, maxEdgeLength * 0.7);
        const shouldGrow =
          d > maxEdgeLength || (d > softThreshold && Math.random() < growthProbability);
        if (shouldGrow) {
          grown.push({
            x: (a.x + b.x) / 2 + (Math.random() - 0.5) * 0.05,
            y: (a.y + b.y) / 2 + (Math.random() - 0.5) * 0.05,
            nx: 0,
            ny: 0,
          });
        }
      }
      chain.nodes = this._prune(grown, minEdgeLength, chain.closed);
    }
  }

  _prune(nodes, minEdgeLength, closed) {
    if (nodes.length <= 4) return nodes;
    const result = [nodes[0]];
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i];
      const prev = result[result.length - 1];
      if (Math.hypot(a.x - prev.x, a.y - prev.y) >= minEdgeLength) result.push(a);
    }
    if (closed && result.length > 3) {
      const first = result[0];
      const last = result[result.length - 1];
      if (Math.hypot(last.x - first.x, last.y - first.y) < minEdgeLength) result.pop();
    }
    return result.length >= 3 ? result : nodes;
  }
}
