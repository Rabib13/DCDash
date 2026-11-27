"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { dataset, sitePosition, stageGroup, STAGE_LABEL } from "@/lib/sites";
import type { Site } from "@/lib/types";
import SitePanel from "./SitePanel";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const BAY_AREA: [[number, number], [number, number]] = [
  [-122.6, 37.2],
  [-121.6, 38.0],
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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
      bounds: BAY_AREA,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.current = m;

    for (const site of dataset.sites) {
      const { lngLat, offset } = sitePosition(site, dataset.sites);
      const operator = String(site.facts.operator?.value ?? site.name);
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
      new maplibregl.Marker({ element: el, offset }).setLngLat(lngLat).addTo(m);
    }
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
          DC Dash <span className="badge">Beta · {dataset.sites.length} AI sites</span>
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
