"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { dataset, MAP_BOUNDS, onMap, runBy, siteBounds, sitePosition, stageGroup, STAGE_LABEL } from "@/lib/sites";
import type { Site } from "@/lib/types";
import { spreadApart } from "@/lib/layout";
import SitePanel from "./SitePanel";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const SITES = dataset.sites.filter(onMap);
/** Marker width plus a small gap, in pixels. */
const MARKER_GAP = 46;

export default function SiteMap() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [selected, setSelected] = useState<Site | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return;
    maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
    const m = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      bounds: siteBounds(SITES),
      fitBoundsOptions: { padding: 80 },
      maxBounds: [
        [MAP_BOUNDS[0][0] - 1, MAP_BOUNDS[0][1] - 1],
        [MAP_BOUNDS[1][0] + 1, MAP_BOUNDS[1][1] + 1],
      ],
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.current = m;
    // Exposed for browser tests, which move the map the way a visitor would.
    (window as unknown as { __dcMap?: maplibregl.Map }).__dcMap = m;

    const placed: { marker: maplibregl.Marker; lngLat: [number, number]; seed: [number, number] }[] = [];
    for (const site of SITES) {
      const { lngLat, offset } = sitePosition(site, SITES);
      const operator = runBy(site)?.name ?? site.name;
      const el = document.createElement("button");
      el.type = "button";
      el.className = `marker marker--${stageGroup(site.stage)}`;
      el.setAttribute("aria-label", `${site.name}, ${operator}, ${STAGE_LABEL[site.stage]}`);
      el.innerHTML = `<span class="marker__ring"><span class="marker__logo">${initials(operator)}</span></span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelected(site);
        m.easeTo({ center: lngLat, zoom: Math.max(m.getZoom(), 12), duration: 400 });
      });
      markers.current.set(site.id, el);
      const marker = new maplibregl.Marker({ element: el, offset }).setLngLat(lngLat).addTo(m);
      placed.push({ marker, lngLat, seed: offset });
    }
    // After each move or zoom, nudge markers apart on screen so none covers another.
    const layout = () => {
      const anchors = placed.map(({ lngLat }) => m.project(lngLat));
      const spread = spreadApart(
        placed.map(({ seed }, i) => [anchors[i].x + seed[0], anchors[i].y + seed[1]]),
        MARKER_GAP,
      );
      placed.forEach(({ marker }, i) => marker.setOffset([spread[i][0] - anchors[i].x, spread[i][1] - anchors[i].y]));
    };
    m.on("load", layout);
    m.on("moveend", layout);
    m.on("resize", layout);
    m.on("click", () => setSelected(null));

    return () => {
      m.remove();
      map.current = null;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    markers.current.forEach((el, id) => el.classList.toggle("marker--selected", selected?.id === id));
  }, [selected]);

  return (
    <>
      <div className={selected ? "map-wrap map-wrap--panel" : "map-wrap"}>
        <div ref={container} className="map" />
      </div>
      <header className="topbar">
        <div className="brand">
          DC Dash <span className="badge">Beta · {SITES.length} sites</span>
        </div>
      </header>
      <div className="legend">
        <span><i className="swatch swatch--operating" />Operating</span>
        <span><i className="swatch swatch--building" />Building or waiting for power</span>
        <span><i className="swatch swatch--planned" />Proposed</span>
      </div>
      {selected && <SitePanel site={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
