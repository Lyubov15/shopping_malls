/**
 * @typedef {Object} Site
 * @property {string|number} [id]
 * @property {string} [name]
 * @property {number} x
 * @property {number} y
 */

class VoronoiDiagram {
	constructor(points, width, height) {
		this.point_list = points;
		this.reset();
		this.box_x = width;
		this.box_y = height;
	}

	reset() {
		this.event_list = new SortedQueue();
		this.beachline_root = null;
		this.voronoi_vertex = [];
		this.edges = [];
	}

	update() {
		this.reset();
		let points = [];
		let e = null;
		for (const p of this.point_list) points.push(new Event("point", p));
		this.event_list.points = points;

		while (this.event_list.length > 0) {
			e = this.event_list.extract_first();
			if (e.type == "point") this.point_event(e.position);
			else if (e.active) this.circle_event(e);
		}
		this.complete_segments(e.position);
	}

	point_event(p) {
		let q = this.beachline_root;
		if (q == null) this.beachline_root = new Arc(null, null, p, null, null);
		else {
			while (
				q.right != null &&
				this.parabola_intersection(p.y, q.focus, q.right.focus) <= p.x
			) {
				q = q.right;
			}

			let e_qp = new Edge(q.focus, p, p.x);
			let e_pq = new Edge(p, q.focus, p.x);

			let arc_p = new Arc(q, null, p, e_qp, e_pq);
			let arc_qr = new Arc(arc_p, q.right, q.focus, e_pq, q.edge.right);
			if (q.right) q.right.left = arc_qr;
			arc_p.right = arc_qr;
			q.right = arc_p;
			q.edge.right = e_qp;

			if (q.event) q.event.active = false;

			this.add_circle_event(p, q);
			this.add_circle_event(p, arc_qr);

			this.edges.push(e_qp);
			this.edges.push(e_pq);
		}
	}

	circle_event(e) {
		let arc = e.caller;
		let p = e.position;
		let edge_new = new Edge(arc.left.focus, arc.right.focus);

		if (arc.left.event) arc.left.event.active = false;
		if (arc.right.event) arc.right.event.active = false;

		arc.left.edge.right = edge_new;
		arc.right.edge.left = edge_new;
		arc.left.right = arc.right;
		arc.right.left = arc.left;

		this.edges.push(edge_new);

		if (!this.point_outside(e.vertex)) this.voronoi_vertex.push(e.vertex);
		arc.edge.left.end = arc.edge.right.end = edge_new.start = e.vertex;

		this.add_circle_event(p, arc.left);
		this.add_circle_event(p, arc.right);
	}

	add_circle_event(p, arc) {
		if (arc.left && arc.right) {
			let a = arc.left.focus;
			let b = arc.focus;
			let c = arc.right.focus;

			if ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y) > 0) {
				let new_inters = this.edge_intersection(
					arc.edge.left,
					arc.edge.right
				);
				let circle_radius = Math.sqrt(
					(new_inters.x - arc.focus.x) ** 2 +
					(new_inters.y - arc.focus.y) ** 2
				);
				let event_pos = circle_radius + new_inters.y;
				if (event_pos > p.y && new_inters.y < this.box_y) {
					let e = new Event(
						"circle",
						new Point(new_inters.x, event_pos),
						arc,
						new_inters
					);
					arc.event = e;
					this.event_list.insert(e);
				}
			}
		}
	}

	parabola_intersection(y, f1, f2) {
		let fyDiff = f1.y - f2.y;
		if (fyDiff == 0) return (f1.x + f2.x) / 2;
		let fxDiff = f1.x - f2.x;
		let b1md = f1.y - y;
		let b2md = f2.y - y;
		let h1 = (-f1.x * b2md + f2.x * b1md) / fyDiff;
		let h2 = Math.sqrt(b1md * b2md * (fxDiff ** 2 + fyDiff ** 2)) / fyDiff;

		return h1 + h2;
	}

	edge_intersection(e1, e2) {
		if (e1.m == Infinity) return new Point(e1.start.x, e2.getY(e1.start.x));
		else if (e2.m == Infinity)
			return new Point(e2.start.x, e1.getY(e2.start.x));
		else {
			let mdif = e1.m - e2.m;
			if (mdif == 0) return null;
			let x = (e2.q - e1.q) / mdif;
			let y = e1.getY(x);
			return new Point(x, y);
		}
	}

	complete_segments(last) {
		let r = this.beachline_root;
		let e, x, y;
		while (r.right) {
			e = r.edge.right;
			x = this.parabola_intersection(
				last.y * 1.1,
				e.arc.left,
				e.arc.right
			);
			y = e.getY(x);

			if (
				(e.start.y < 0 && y < e.start.y) ||
				(e.start.x < 0 && x < e.start.x) ||
				(e.start.x > this.box_x && x > e.start.x)
			) {
				e.end = e.start;
			} else {
				if (e.m == 0) {
					x - e.start.x <= 0 ? (x = 0) : (x = this.box_x);
					e.end = new Point(x, e.start.y);
					this.voronoi_vertex.push(e.end);
				} else {
					if (e.m == Infinity) y = this.box_y;
					else
						e.m * (x - e.start.x) <= 0 ? (y = 0) : (y = this.box_y);
					e.end = this.edge_end(e, y);
				}
			}
			r = r.right;
		}

		let option;

		for (let i = 0; i < this.edges.length; i++) {
			e = this.edges[i];
			option =
				1 * this.point_outside(e.start) + 2 * this.point_outside(e.end);

			switch (option) {
				case 3:
					this.edges[i] = null;
					break;
				case 1:
					e.start.y < e.end.y ? (y = 0) : (y = this.box_y);
					e.start = this.edge_end(e, y);
					break;
				case 2:
					e.end.y <= e.start.y ? (y = 0) : (y = this.box_y);

					e.end = this.edge_end(e, y);
					break;
				default:
					break;
			}
		}
	}

	edge_end(e, y_lim) {
		let x = Math.min(this.box_x, Math.max(0, e.getX(y_lim)));
		let y = e.getY(x);
		if (!y) y = y_lim;
		let p = new Point(x, y);
		this.voronoi_vertex.push(p);
		return p;
	}

	point_outside(p) {
		return p.x < 0 || p.x > this.box_x || p.y < 0 || p.y > this.box_y;
	}
}

class Arc {
	constructor(l, r, f, el, er) {
		this.left = l;
		this.right = r;
		this.focus = f;
		this.edge = { left: el, right: er };
		this.event = null;
	}
}

class Point {
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}
}

class Edge {
	constructor(p1, p2, startx) {
		this.m = -(p1.x - p2.x) / (p1.y - p2.y);
		this.q =
			(0.5 * (p1.x ** 2 - p2.x ** 2 + p1.y ** 2 - p2.y ** 2)) /
			(p1.y - p2.y);
		this.arc = { left: p1, right: p2 };
		this.end = null;
		this.start = null;
		if (startx)
			this.start = new Point(
				startx,
				this.m != Infinity ? this.getY(startx) : null
			);
	}
	getY(x) {
		if (this.m == Infinity) return null;
		return x * this.m + this.q;
	}
	getX(y) {
		if (this.m == Infinity) return this.start.x;
		return (y - this.q) / this.m;
	}
}

class Event {
	constructor(type, position, caller, vertex) {
		this.type = type;
		this.caller = caller;
		this.position = position;
		this.vertex = vertex;
		this.active = true;
	}
}

class SortedQueue {
	constructor(events) {
		this.list = [];
		if (events) this.list = events;
		this.sort();
	}

	get length() {
		return this.list.length;
	}

	extract_first() {
		if (this.list.length > 0) {
			let elm = this.list[0];
			this.list.splice(0, 1);
			return elm;
		}
		return null;
	}

	insert(event) {
		this.list.push(event);
		this.sort();
	}

	set points(events) {
		this.list = events;
		this.sort();
	}

	sort() {
		this.list.sort(function (a, b) {
			let diff = a.position.y - b.position.y;
			if (diff == 0) return a.position.x - b.position.x;
			return diff;
		});
	}
}

/**
 * Calculate Voronoi diagram for a set of points and return GeoJSON FeatureCollection.
 * @param {Array<Site>} points - array of sites with fields x and y (and optional id, name)
 * @param {Object|null} oblastGeoJSON - optional GeoJSON used to derive bounding box
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
export async function calculateVoronoi(points, oblastGeoJSON = null) {
	try {
		if (!Array.isArray(points)) points = [];

		// Determine bounding box / canvas size
		let maxX = -Infinity,
			maxY = -Infinity,
			minX = Infinity,
			minY = Infinity;

		if (Array.isArray(points) && points.length > 0) {
			for (const p of points) {
				if (typeof p.x === 'number' && typeof p.y === 'number') {
					maxX = Math.max(maxX, p.x);
					maxY = Math.max(maxY, p.y);
					minX = Math.min(minX, p.x);
					minY = Math.min(minY, p.y);
				}
			}
		}

		// If oblast provided, expand bbox to it
		if (oblastGeoJSON && oblastGeoJSON.type) {
			try {
				const coords = extractAllCoordsFromGeoJSON(oblastGeoJSON);
				for (const c of coords) {
					minX = Math.min(minX, c[0]);
					minY = Math.min(minY, c[1]);
					maxX = Math.max(maxX, c[0]);
					maxY = Math.max(maxY, c[1]);
				}
			} catch (e) {
				// ignore
			}
		}

		if (!isFinite(minX)) minX = 0;
		if (!isFinite(minY)) minY = 0;
		if (!isFinite(maxX)) maxX = 1000;
		if (!isFinite(maxY)) maxY = 1000;

		const width = maxX - minX || 1000;
		const height = maxY - minY || 1000;

		// Normalize points for the diagram (we keep original objects as focus references)
		const diagramPoints = points.map(p => ({ x: p.x - minX, y: p.y - minY, __source: p }));

		const vd = new VoronoiDiagram(diagramPoints, width, height);
		vd.update();

		// Build polygons per site
		const features = [];

		for (const site of diagramPoints) {
			const siteSegments = [];
			for (const e of vd.edges) {
				if (!e || !e.start || !e.end) continue;
				if (e.arc.left === site || e.arc.right === site) {
					siteSegments.push([e.start, e.end]);
				}
			}

			// collect unique vertices
			const uniq = {};
			const verts = [];
			for (const seg of siteSegments) {
				for (const v of seg) {
					const key = `${v.x},${v.y}`;
					if (!uniq[key]) {
						uniq[key] = true;
						verts.push([v.x + minX, v.y + minY]); // restore original coords
					}
				}
			}

			if (verts.length < 3) continue; // not enough to form polygon

			// compute centroid to sort points radially
			let cx = 0, cy = 0;
			for (const v of verts) { cx += v[0]; cy += v[1]; }
			cx /= verts.length; cy /= verts.length;

			verts.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));

			// ensure closed ring
			if (verts.length > 0) {
				if (verts[0][0] !== verts[verts.length - 1][0] || verts[0][1] !== verts[verts.length - 1][1]) {
					verts.push(verts[0]);
				}
			}

			const props = site.__source ? { ...site.__source } : {};
			features.push({
				type: 'Feature',
				properties: props,
				geometry: {
					type: 'Polygon',
					coordinates: [verts]
				}
			});
		}

		return { type: 'FeatureCollection', features };
	} catch (err) {
		throw err;
	}
}

/**
 * Extract all coordinate pairs [x,y] from a GeoJSON object recursively.
 */
function extractAllCoordsFromGeoJSON(geo) {
	const out = [];
	if (!geo) return out;
	if (geo.type === 'FeatureCollection') {
		for (const f of geo.features || []) out.push(...extractAllCoordsFromGeoJSON(f));
		return out;
	}
	if (geo.type === 'Feature') return extractAllCoordsFromGeoJSON(geo.geometry);
	if (geo.type === 'Point') return [[geo.coordinates[0], geo.coordinates[1]]];
	if (geo.type === 'MultiPoint' || geo.type === 'LineString') return geo.coordinates.map(c => [c[0], c[1]]);
	if (geo.type === 'MultiLineString' || geo.type === 'Polygon') return geo.coordinates.flat().map(c => [c[0], c[1]]);
	if (geo.type === 'MultiPolygon') return geo.coordinates.flat(2).map(c => [c[0], c[1]]);
	return out;
}
