import { calculateVoronoi } from "./voronoi-backend.js";
import {
  featureCollection,
  booleanIntersects,
  intersect,
  difference,
  area,
} from "@turf/turf";

/**
 * @typedef {import('geojson').FeatureCollection} FeatureCollection
  * @typedef {import('geojson').Feature} Feature
   * @typedef {import('geojson').Geometry} Geometry
    */

/**
 * Compute Voronoi cells and clip them by the oblast boundary and obstacles.
  * @param {Array<{id:string|number, name:string, x:number, y:number, [key:string]: any}>} shoppingCenters
   * @param {FeatureCollection|Feature|Geometry} oblastGeoJSON
    * @param {FeatureCollection|Feature|Geometry} obstaclesGeoJSON
     * @returns {Promise<FeatureCollection>}
      */
export async function computeVoronoiWithClipping(shoppingCenters, oblastGeoJSON, obstaclesGeoJSON) {
  try {
    const voronoiResult = await calculateVoronoi(shoppingCenters, oblastGeoJSON);
    if (!voronoiResult || !Array.isArray(voronoiResult.features)) {
      throw new Error("calculateVoronoi did not return a valid GeoJSON FeatureCollection");
    }

    const obstacles = normalizeGeoJsonFeatureArray(obstaclesGeoJSON);
    const clippedFeatures = [];

    for (const cell of voronoiResult.features) {
      if (!cell || !cell.geometry) {
        continue;
      }

      let clipped = intersect(cell, oblastGeoJSON);
      if (!clipped) {
        continue;
      }

      for (const obstacle of obstacles) {
        if (!obstacle || !booleanIntersects(clipped, obstacle)) {
          continue;
        }

        const differenceResult = difference(clipped, obstacle);
        if (!differenceResult) {
          clipped = null;
          break;
        }

        clipped = differenceResult;
      }

      if (!clipped) {
        continue;
      }

      const metadata = mapCellProperties(cell, shoppingCenters);
      clipped.properties = {
        ...clipped.properties,
        ...metadata,
        area: area(clipped),
      };

      clippedFeatures.push(clipped);
    }

    return featureCollection(clippedFeatures);
  } catch (error) {
    console.error("computeVoronoiWithClipping error:", error);
    throw error;
  }
}

/**
 * Normalize a GeoJSON object into an array of Feature objects.
  * @param {FeatureCollection|Feature|Geometry|null|undefined} geojson
   * @returns {Feature[]}
    */
function normalizeGeoJsonFeatureArray(geojson) {
  if (!geojson) {
    return [];
  }

  if (geojson.type === "FeatureCollection") {
    return geojson.features || [];
  }

  if (geojson.type === "Feature") {
    return [geojson];
  }

  return [
    {
      type: "Feature",
      geometry: geojson,
      properties: {},
    },
  ];
}

/**
 * Map a Voronoi cell to its source shopping center metadata.
  * @param {Feature} cell
   * @param {Array<{id:string|number, name:string, x:number, y:number, [key:string]: any}>} shoppingCenters
    * @returns {{id?: string|number, name?: string, source?: object}}
     */
function mapCellProperties(cell, shoppingCenters) {
  const props = (cell.properties && typeof cell.properties === "object") ? cell.properties : {};
  const candidate = shoppingCenters.find((center) => {
    if (props.id !== undefined && center.id === props.id) {
      return true;
    }
    if (props.name && center.name === props.name) {
      return true;
    }
    return false;
  });

  if (candidate) {
    return {
      id: candidate.id,
      name: candidate.name,
      source: { ...candidate },
    };
  }

  return {
    id: props.id,
    name: props.name,
  };
}

/**
 * Return a GeoJSON FeatureCollection of Voronoi polygons suitable for map rendering.
  * @param {FeatureCollection|Feature[]} voronoiData
   * @returns {FeatureCollection}
    */
export function getVoronoiPolygonsForMap(voronoiData) {
  if (!voronoiData) {
    return featureCollection([]);
  }

  if (Array.isArray(voronoiData)) {
    return featureCollection(voronoiData);
  }

  if (voronoiData.type === "FeatureCollection") {
    return voronoiData;
  }

  return featureCollection([]);
}

/**
 * Convert polygon Voronoi cells into edge features for map display.
  * @param {FeatureCollection|Feature[]} voronoiData
   * @returns {FeatureCollection}
    */
export function getEdgesForMap(voronoiData) {
  const features = [];
  const collection = Array.isArray(voronoiData) ? voronoiData : (voronoiData?.features || []);

  for (const feature of collection) {
    if (!feature || !feature.geometry) {
      continue;
    }

    const geometry = feature.geometry;
    if (geometry.type === "Polygon") {
      features.push({
        type: "Feature",
        properties: feature.properties || {},
        geometry: {
          type: "MultiLineString",
          coordinates: [geometry.coordinates[0]],
        },
      });
      continue;
    }

    if (geometry.type === "MultiPolygon") {
      features.push({
        type: "Feature",
        properties: feature.properties || {},
        geometry: {
          type: "MultiLineString",
          coordinates: geometry.coordinates.map((ring) => ring[0]),
        },
      });
    }
  }

  return featureCollection(features);
}