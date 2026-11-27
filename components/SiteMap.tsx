"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { dataset, MAP_BOUNDS, onMap, runBy, siteBounds, sitePosition, stageGroup, STAGE_LABEL } from "@/lib/sites";
import type { Site } from "@/lib/types";
import { spreadApart } from "@/lib/layout";
import { CATEGORY_LABEL, citiesWithin, type Category } from "@/lib/jobfeeds";
import { bubbleSize, bubbleText, CATEGORY_COLOR, NEAR_MILES, cityBubbles, EMPTY_VIEW, matchesView, parseJobsView, ringGradient, viewQuery, type JobsView } from "@/lib/jobs-view";
import { useJobs } from "@/lib/useJobs";
import { buildoutSummary } from "@/lib/buildout";
import BuildoutBanner from "./BuildoutBanner";
import JobsPanel from "./JobsPanel";
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
/** Job circles may overlap a little, but never sit right on top of each other. */
const BUBBLE_GAP = 48;
const BANNER_KEY = "dcdash.summaryHidden";

export default function SiteMap() {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [selected, setSelected] = useState<Site | null>(null);
  // The jobs layer: null when closed. It lives in the address, so a filtered view can be shared.
  const [jobs, setJobs] = useState<JobsView | null>(null);
  const [ready, setReady] = useState(false);
  const snap = useJobs();
  const bubbleMarkers = useRef<maplibregl.Marker[]>([]);

  // The summary banner shows until a visitor hides it; that choice is remembered on this device.
  const [bannerHidden, setBannerHidden] = useState<boolean | null>(null);
  const hideBanner = (hidden: boolean) => {
    setBannerHidden(hidden);
    try {
      if (hidden) localStorage.setItem(BANNER_KEY, "1");
      else localStorage.removeItem(BANNER_KEY);
    } catch {
      // Storage can be blocked; the banner then just shows again next visit.
    }
  };

  useEffect(() => {
    setJobs(parseJobsView(window.location.search));
    setReady(true);
    let hidden = false;
    try {
      hidden = localStorage.getItem(BANNER_KEY) === "1";
    } catch {
      // ignore
    }
    setBannerHidden(hidden);
  }, []);
  useEffect(() => {
    if (ready) window.history.replaceState(null, "", `/${viewQuery(jobs)}`);
  }, [jobs, ready]);

  const changeJobs = (patch: Partial<JobsView>) => setJobs((v) => ({ ...(v ?? EMPTY_VIEW), ...patch }));
  const openJobs = (view: Partial<JobsView>) => {
    setSelected(null);
    setJobs({ ...EMPTY_VIEW, ...view });
  };
  const openSite = useRef<(site: Site) => void>(() => {});
  openSite.current = (site: Site) => {
    setJobs(null);
    setSelected(site);
  };

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
        openSite.current(site);
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

  // Circles follow the role and employer filters; the place filter only highlights.
  const filtered = useMemo(
    () => (snap && jobs ? snap.jobs.filter((j) => matchesView(j, { ...jobs, city: "", near: "" })) : []),
    [snap, jobs?.role, jobs?.employer], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const bubbles = useMemo(() => cityBubbles(filtered), [filtered]);
  const highlighted = jobs?.city ? [jobs.city] : jobs?.near ? citiesWithin(jobs.near, NEAR_MILES) : [];

  useEffect(() => {
    const m = map.current;
    bubbleMarkers.current.forEach((b) => b.remove());
    bubbleMarkers.current = [];
    if (!m || !jobs) return;
    const placed = bubbles.map((b) => {
      const el = document.createElement("button");
      el.type = "button";
      const size = bubbleSize(b.count);
      el.className = b.elsewhere ? "jobbubble jobbubble--elsewhere" : "jobbubble";
      el.style.width = el.style.height = `${size}px`;
      el.style.backgroundImage = ringGradient(b.roles);
      el.setAttribute(
        "aria-label",
        `${b.city}: ${b.count} open job${b.count === 1 ? "" : "s"}${b.elsewhere ? `, plus ${b.elsewhere} also listed elsewhere` : ""}`,
      );
      el.innerHTML = `<span class="jobbubble__count">${bubbleText(b)}</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setJobs((v) => ({ ...(v ?? EMPTY_VIEW), city: b.city, near: "" }));
      });
      const marker = new maplibregl.Marker({ element: el }).setLngLat(b.lngLat).addTo(m);
      return { marker, el, lngLat: b.lngLat };
    });
    bubbleMarkers.current = placed.map((p) => p.marker);
    const layout = () => {
      const anchors = placed.map(({ lngLat }) => m.project(lngLat));
      const spread = spreadApart(anchors.map((a) => [a.x, a.y] as [number, number]), BUBBLE_GAP);
      placed.forEach(({ marker }, i) => marker.setOffset([spread[i][0] - anchors[i].x, spread[i][1] - anchors[i].y]));
    };
    layout();
    m.on("moveend", layout);
    m.on("resize", layout);
    return () => {
      m.off("moveend", layout);
      m.off("resize", layout);
    };
  }, [bubbles, jobs === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the layer opens, frame every circle in the part of the map the panel doesn't cover.
  const framed = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!jobs) {
      framed.current = false;
      return;
    }
    if (!m || framed.current || bubbles.length === 0) return;
    framed.current = true;
    const phone = window.innerWidth <= 640;
    const lngs = bubbles.map((b) => b.lngLat[0]);
    const lats = bubbles.map((b) => b.lngLat[1]);
    m.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      {
        padding: phone
          ? { top: 90, bottom: window.innerHeight * 0.52 + 40, left: 48, right: 48 }
          : { top: 100, bottom: 120, left: 80, right: 500 },
        maxZoom: 11,
        duration: 0,
      },
    );
  }, [bubbles, jobs === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const highlightKey = highlighted.join("|");
  useEffect(() => {
    const on = new Set(highlightKey ? highlightKey.split("|") : []);
    bubbleMarkers.current.forEach((mk) => {
      const el = mk.getElement();
      const city = el.getAttribute("aria-label")?.split(":")[0] ?? "";
      el.classList.toggle("jobbubble--selected", on.has(city));
      el.classList.toggle("jobbubble--faded", on.size > 0 && !on.has(city));
    });
  }, [highlightKey, bubbles, jobs === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const localCount = snap ? snap.jobs.filter((j) => !j.alsoElsewhere).length : null;
  const legendRoles = (Object.keys(CATEGORY_LABEL) as Category[]).filter((c) => filtered.some((j) => j.category === c));

  return (
    <>
      <div className={["map-wrap", selected || jobs ? "map-wrap--panel" : "", jobs ? "map-wrap--jobs" : ""].filter(Boolean).join(" ")}>
        <div ref={container} className="map" />
      </div>
      <header className="topbar">
        <div className="brand">
          DC Dash <span className="badge">Beta · {SITES.length} sites</span>
        </div>
        <button
          type="button"
          className="topbar__link"
          aria-pressed={jobs !== null}
          onClick={() => (jobs ? setJobs(null) : openJobs({}))}
        >
          {localCount === null ? "Jobs" : `Jobs · ${localCount} open`}
        </button>
        {bannerHidden && (
          <button type="button" className="topbar__link topbar__link--quiet" onClick={() => hideBanner(false)}>
            What&apos;s in it for me?
          </button>
        )}
      </header>
      {jobs ? (
        <div className="legend legend--jobs">
          <span>Circle: jobs based in that city · gray halo: more that also list other places</span>
          {legendRoles.map((c) => (
            <span key={c}>
              <i className="swatch" style={{ background: CATEGORY_COLOR[c] }} />
              {CATEGORY_LABEL[c]}
            </span>
          ))}
        </div>
      ) : (
        <div className="legend">
          <span><i className="swatch swatch--operating" />Operating</span>
          <span><i className="swatch swatch--building" />Building or waiting for power</span>
          <span><i className="swatch swatch--planned" />Proposed</span>
        </div>
      )}
      {bannerHidden === false && !selected && !jobs && (
        <BuildoutBanner summary={buildoutSummary(snap, SITES)} onSeeJobs={() => openJobs({})} onHide={() => hideBanner(true)} />
      )}
      {selected && <SitePanel site={selected} onClose={() => setSelected(null)} onOpenJobs={openJobs} />}
      {jobs && !selected && <JobsPanel snap={snap} view={jobs} onChange={changeJobs} onClose={() => setJobs(null)} />}
    </>
  );
}
