"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Popup } from "maplibre-gl";
import Link from "next/link";

export interface IncidentGeoFeature {
  id: string;
  code: string;
  disasterType: string;
  state: string;
  lga: string;
  ward: string | null;
  community: string | null;
  status: string;
  severity: string | null;
  verification: string;
  lat: number;
  lon: number;
  affected: number;
  displaced: number;
  fatalities: number;
  missing: number;
  injured: number;
  firstReported: string;
  lastUpdated: string;
}

// `as const` (not Record<string, string>) so dot-access on these four known
// keys resolves to plain `string`, not `string | undefined` — the same
// noUncheckedIndexedAccess issue that broke earlier builds, this time in a
// spot (MapLibre's expression type) that doesn't tolerate `undefined` at all.
const SEVERITY_HEX = {
  CRITICAL: "#D64545",
  HIGH: "#E8843D",
  MEDIUM: "#E8C33D",
  LOW: "#4A9B6E",
} as const;

// A free, no-API-key OSM raster source, chosen so this ships working out of
// the box. Swap the `sources.osm.tiles` URL for a NEMA-hosted tile service
// or a Mapbox/MapTiler style later without touching any other map logic —
// see README "GIS configuration".
const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

export default function IncidentMap({ incidents }: { incidents: IncidentGeoFeature[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [popupIncident, setPopupIncident] = useState<IncidentGeoFeature | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [8.6753, 9.082], // Nigeria centroid
      zoom: 5.2,
      attributionControl: {},
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: incidents.map((inc) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [inc.lon, inc.lat] },
          properties: { id: inc.id, severity: inc.severity ?? "LOW" },
        })),
      };

      map.addSource("incidents", {
        type: "geojson",
        data: geojson,
        cluster: true,
        clusterMaxZoom: 9,
        clusterRadius: 45,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "incidents",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#1F3A80",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#3D6FE0",
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "incidents",
        filter: ["has", "point_count"],
        layout: { "text-field": "{point_count_abbreviated}", "text-size": 12 },
        paint: { "text-color": "#DCE6FB" },
      });
      map.addLayer({
        id: "unclustered",
        type: "circle",
        source: "incidents",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "severity"],
            "CRITICAL", SEVERITY_HEX.CRITICAL,
            "HIGH", SEVERITY_HEX.HIGH,
            "MEDIUM", SEVERITY_HEX.MEDIUM,
            SEVERITY_HEX.LOW,
          ],
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0A0E14",
        },
      });

      map.on("click", "clusters", async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const feature = features[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = map.getSource("incidents") as maplibregl.GeoJSONSource;
        if (clusterId == null || !feature) return;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });

      map.on("click", "unclustered", (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        const inc = incidents.find((i) => i.id === id);
        if (inc) setPopupIncident(inc);
      });

      map.on("mouseenter", "unclustered", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "unclustered", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full h-[460px] rounded overflow-hidden border border-eoc-border" />
      {popupIncident && (
        <div className="absolute top-3 right-3 w-72 bg-[#0D121B] border border-eoc-border rounded shadow-xl p-3.5 text-[12.5px]">
          <button
            className="absolute top-2 right-2.5 text-eoc-muted text-base leading-none"
            onClick={() => setPopupIncident(null)}
          >
            ×
          </button>
          <div className="font-mono text-[10.5px] text-eoc-muted">{popupIncident.code}</div>
          <div className="font-bold mt-0.5">{popupIncident.disasterType}</div>
          <div className="text-eoc-muted">
            {popupIncident.community ? `${popupIncident.community}, ` : ""}
            {popupIncident.lga}, {popupIncident.state}
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2.5">
            <Kv k="Status" v={popupIncident.status.replace("_", " ")} />
            <Kv k="Severity" v={popupIncident.severity ?? "—"} />
            <Kv k="Verification" v={popupIncident.verification.replace("_", " ")} />
            <Kv k="First reported" v={new Date(popupIncident.firstReported).toLocaleDateString("en-GB")} />
            <Kv k="Affected" v={popupIncident.affected.toLocaleString()} />
            <Kv k="Displaced" v={popupIncident.displaced.toLocaleString()} />
            <Kv k="Fatalities" v={popupIncident.fatalities.toLocaleString()} />
            <Kv k="Missing" v={popupIncident.missing.toLocaleString()} />
            <Kv k="Injured" v={popupIncident.injured.toLocaleString()} />
            <Kv k="Last updated" v={new Date(popupIncident.lastUpdated).toLocaleDateString("en-GB")} />
          </div>
          <Link
            href={`/incidents/${popupIncident.id}`}
            className="block text-center mt-3 bg-[#1F3A80] border border-[#3D6FE0] text-[#DCE6FB] font-semibold rounded py-1.5 text-[12px]"
          >
            VIEW INCIDENT
          </Link>
        </div>
      )}
      <div className="text-[10px] text-eoc-muted mt-1">
        Base map: OpenStreetMap contributors. Incident positions from Supabase (real query). Swap tile source in
        IncidentMap.tsx for a NEMA-hosted or licensed tile service in production.
      </div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-eoc-muted">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
