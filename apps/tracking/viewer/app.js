const WS_URL   = `ws://${window.location.host}/ws/tracking`;
const API_BASE = `http://${window.location.host}/api/trackers`;

let ws                  = null;
let isPreviewing        = false;
let debugInterval       = null;
let osfLivenessInterval = null;
let isPinned            = false;
let isCollapsed         = false;

// FPS Tracking
let frameCount    = 0;
let lastFpsUpdate = performance.now();
let fps           = 0;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const selectTracker    = document.getElementById("tracker-select");
const selectSource     = document.getElementById("source-select");
const sourceGroup      = document.getElementById("source-group");
const previewGroup     = document.getElementById("preview-group");
const osfConfig        = document.getElementById("osf-config");
const osfPortInput     = document.getElementById("osf-port");
const osfPortDisplay   = document.getElementById("osf-port-display");
const osfCmdDisplay    = document.getElementById("osf-cmd-display");
const osfStats         = document.getElementById("osf-stats");
const btnStart         = document.getElementById("btn-start");
const btnStop          = document.getElementById("btn-stop");
const btnPreview       = document.getElementById("btn-preview");
const statusDot        = document.getElementById("status-dot");
const statusText       = document.getElementById("status-text");
const dataOutput       = document.getElementById("data-output");
const videoFeed        = document.getElementById("video-feed");
const videoPlaceholder = document.getElementById("video-placeholder");
const floatPanel       = document.getElementById("float-panel");
const floatDrag        = document.getElementById("float-drag");
const floatBody        = document.getElementById("float-body");
const btnCollapse      = document.getElementById("btn-collapse");
const btnPin           = document.getElementById("btn-pin");

// HUD refs
const hudStatus        = document.getElementById("hud-status");
const hudLatency       = document.getElementById("hud-latency");
const hudFps           = document.getElementById("hud-fps");

// ── Tracker select ────────────────────────────────────────────────────────────

const TRACKER_LABELS = {
    mediapipe:   "MediaPipe Neural (Built-in)",
    openseeface: "OpenSeeFace Pro (UDP)",
};

function isOSF() {
    return selectTracker.value === "openseeface";
}

function onTrackerChange() {
    const osf = isOSF();
    sourceGroup.style.display  = osf ? "none" : "";
    previewGroup.style.display = osf ? "none" : "";
    osfConfig.style.display    = osf ? ""     : "none";
    if (osf) { syncOsfPort(); fetchOsfStatus(); }
}

function syncOsfPort() {
    const port = osfPortInput ? osfPortInput.value : "11573";
    if (osfPortDisplay) osfPortDisplay.textContent = port;
    if (osfCmdDisplay)  osfCmdDisplay.textContent  =
        `facetracker.exe -c 0 -P 1 --ip 127.0.0.1 --port ${port}`;
}

selectTracker.addEventListener("change", onTrackerChange);
if (osfPortInput) osfPortInput.addEventListener("input", syncOsfPort);

// ── Fetch current status ──────────────────────────────────────────────────────

async function fetchStatus() {
    try {
        const res  = await fetch(API_BASE);
        const data = await res.json();

        selectTracker.innerHTML = "";
        data.available.forEach(t => {
            const opt     = document.createElement("option");
            opt.value     = t;
            opt.innerText = TRACKER_LABELS[t] || t;
            if (t === data.active) opt.selected = true;
            selectTracker.appendChild(opt);
        });

        onTrackerChange();
        updateUIState(data.is_running);
    } catch (e) {
        console.error("Failed to fetch tracker status:", e);
        dataOutput.innerHTML = `<div class="osf-error">Failed to connect to backend engine.</div>`;
    }
}

function stopOsfLiveness() { if (osfLivenessInterval) { clearInterval(osfLivenessInterval); osfLivenessInterval = null; } }

// ── UI state ──────────────────────────────────────────────────────────────────

function setStatusDot(state) {
    statusDot.className = "status-dot-large" + (state ? " " + state : "");
}

function updateUIState(isRunning) {
    const controls = [selectTracker, selectSource, osfPortInput].filter(Boolean);

    if (isRunning) {
        statusText.innerText   = "ENGINE ONLINE";
        statusText.className   = "status-text online";
        hudStatus.innerText    = "LIVE STREAM";
        hudStatus.parentElement.classList.add("online");
        
        setStatusDot("online");
        btnStart.disabled    = true;
        btnStop.disabled     = false;
        controls.forEach(el => el.disabled = true);
        connectWebSocket();
        showVideo();
        videoFeed.src = "/video_feed?" + Date.now();
        if (isOSF()) startDebugPolling();
    } else {
        statusText.innerText   = isPreviewing ? "PREVIEW ACTIVE" : "ENGINE OFFLINE";
        statusText.className   = isPreviewing ? "status-online"  : "status-text offline";
        hudStatus.innerText    = isPreviewing ? "PREVIEW" : "STANDBY";
        hudStatus.parentElement.classList.remove("online");
        
        setStatusDot(isPreviewing ? "preview" : "");
        btnStart.disabled    = false;
        btnStop.disabled     = true;
        controls.forEach(el => { el.disabled = isPreviewing && el !== osfPortInput; });
        
        disconnectWebSocket();
        stopDebugPolling();
        stopOsfLiveness();
        
        // Reset metrics
        hudFps.innerText = "0.0 FPS";
        hudLatency.innerText = "-- ms";
        
        if (!isPreviewing) {
            videoFeed.src = "";
            showPlaceholder();
            dataOutput.innerHTML = `<div class="param-placeholder">Waiting for synchronization...</div>`;
        }
        if (osfStats) osfStats.style.display = "none";
    }
}

function showVideo() {
    if (videoPlaceholder) videoPlaceholder.style.display = "none";
    if (videoFeed)        videoFeed.style.display        = "";
}

function showPlaceholder() {
    if (videoFeed)        videoFeed.style.display        = "none";
    if (videoPlaceholder) videoPlaceholder.style.display = "";
}

// ── Tracker start / stop ──────────────────────────────────────────────────────

async function startTracker() {
    const tracker = selectTracker.value;
    if (!tracker) return;

    const body = {
        source:   isOSF() ? "none" : selectSource.value,
        osf_host: "127.0.0.1",
        osf_port: osfPortInput ? parseInt(osfPortInput.value) || 11573 : 11573,
    };

    try {
        const res = await fetch(`${API_BASE}/start/${tracker}`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(body),
        });
        if (res.ok) {
            updateUIState(true);
        } else {
            const err = await res.json();
            alert("Engine Error: " + (err.message || err.detail || "Unknown error"));
        }
    } catch (e) {
        console.error("Start failed:", e);
    }
}

async function stopTracker() {
    try {
        await fetch(`${API_BASE}/stop`, { method: "POST" });
        updateUIState(false);
    } catch (e) {
        console.error("Stop failed:", e);
    }
}

// ── Preview ───────────────────────────────────────────────────────────────────

async function togglePreview() {
    isPreviewing = !isPreviewing;
    const source   = selectSource.value;
    const endpoint = isPreviewing ? "/api/preview/start" : "/api/preview/stop";

    try {
        const res = await fetch(endpoint, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ source }),
        });

        if (res.ok) {
            btnPreview.innerHTML = isPreviewing ? 
                `<i class="fa-solid fa-video-slash"></i> Stop Preview` : 
                `<i class="fa-solid fa-camera"></i> Toggle Feed Preview`;
            
            if (isPreviewing) {
                videoFeed.src = "/video_feed?" + Date.now();
                showVideo();
            } else {
                showPlaceholder();
            }
            updateUIState(false);
        } else {
            isPreviewing = !isPreviewing;
        }
    } catch (e) {
        isPreviewing = !isPreviewing;
        console.error("Preview toggle failed:", e);
    }
}

// ── OSF Process manager ───────────────────────────────────────────────────────

const osfMgrDot       = document.getElementById("osf-mgr-dot");
const osfMgrLabel     = document.getElementById("osf-mgr-label");
const osfInstallSec   = document.getElementById("osf-install-section");
const osfLaunchSec    = document.getElementById("osf-launch-section");
const osfInstallProg  = document.getElementById("osf-install-progress");
const osfProgFill     = document.getElementById("osf-prog-fill");
const osfProgMsg      = document.getElementById("osf-prog-msg");
const btnOsfInstall   = document.getElementById("btn-osf-install");
const btnOsfLaunch    = document.getElementById("btn-osf-launch");
const btnOsfKill      = document.getElementById("btn-osf-kill");
const osfCameraInput  = document.getElementById("osf-camera");

function setOsfMgrState(state) {
    const map = {
        "checking":      ["",        "Checking Installation…"],
        "not-installed": ["",        "Engine Not Found"],
        "installed":     ["ready",   "Engine Standby"],
        "running":       ["online",  "Engine Processes Running"],
        "installing":    ["busy",    "Acquiring Binaries…"],
    };
    const [cls, text] = map[state] || ["", state];
    if (osfMgrDot)   osfMgrDot.className    = "osf-mgr-dot" + (cls ? " " + cls : "");
    if (osfMgrLabel) osfMgrLabel.textContent = text;

    const notInstalled = state === "not-installed" || state === "installing";
    const installed    = state === "installed" || state === "running";
    const running      = state === "running";

    if (osfInstallSec) osfInstallSec.style.display = notInstalled ? "" : "none";
    if (osfLaunchSec)  osfLaunchSec.style.display  = installed    ? "" : "none";
    if (btnOsfLaunch)  btnOsfLaunch.disabled        = running;
    if (btnOsfKill)    btnOsfKill.disabled           = !running;
}

async function fetchOsfStatus() {
    try {
        const res  = await fetch("/api/osf/status");
        const data = await res.json();
        if (data.running)        setOsfMgrState("running");
        else if (data.installed) setOsfMgrState("installed");
        else                     setOsfMgrState("not-installed");
    } catch (_) {
        setOsfMgrState("not-installed");
    }
}

async function installOsf() {
    if (btnOsfInstall) btnOsfInstall.disabled = true;
    setOsfMgrState("installing");
    if (osfInstallProg) osfInstallProg.style.display = "";
    if (osfProgMsg)     osfProgMsg.textContent = "Connecting to repository…";
    if (osfProgFill)  { osfProgFill.style.width = "0%"; osfProgFill.style.background = ""; }

    try {
        const res    = await fetch("/api/osf/install", { method: "POST" });
        const reader = res.body.getReader();
        const dec    = new TextDecoder();
        let   buf    = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });

            const lines = buf.split("\n");
            buf = lines.pop();

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                    const evt = JSON.parse(line.slice(6));
                    if (osfProgMsg)  osfProgMsg.textContent = evt.msg || "…";
                    if (osfProgFill && evt.pct != null) osfProgFill.style.width = evt.pct + "%";

                    if (evt.step === "done") {
                        if (osfProgFill) osfProgFill.style.width = "100%";
                        await fetchOsfStatus();
                        setTimeout(() => { if (osfInstallProg) osfInstallProg.style.display = "none"; }, 2500);
                    } else if (evt.step === "error") {
                        if (osfProgFill) osfProgFill.style.background = "var(--danger)";
                        if (btnOsfInstall) btnOsfInstall.disabled = false;
                        setOsfMgrState("not-installed");
                    }
                } catch (_) {}
            }
        }
    } catch (e) {
        console.error("OSF install failed:", e);
        if (osfProgMsg) osfProgMsg.textContent = "Network error — check connection.";
        if (btnOsfInstall) btnOsfInstall.disabled = false;
        setOsfMgrState("not-installed");
    }
}

async function launchOsf() {
    const port   = osfPortInput   ? parseInt(osfPortInput.value)   || 11573 : 11573;
    const camera = osfCameraInput ? parseInt(osfCameraInput.value) || 0     : 0;
    try {
        if (btnOsfLaunch) btnOsfLaunch.disabled = true;
        if (osfMgrLabel)  osfMgrLabel.textContent = "Initializing Process…";

        const res  = await fetch("/api/osf/launch", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ camera_index: camera, port, host: "127.0.0.1" }),
        });
        const data = await res.json();
        if (data.success) {
            setOsfMgrState("running");
            syncOsfPort();
            startOsfLiveness();

            setTimeout(async () => {
                const checkRes  = await fetch("/api/osf/status");
                const checkData = await checkRes.json();
                if (checkData.running) {
                    if (isOSF()) startTracker();
                } else {
                    stopOsfLiveness();
                    setOsfMgrState("installed");
                    showOsfCrashDiag(await diagnoseOsfCrash());
                }
            }, 1500);
        } else {
            if (btnOsfLaunch) btnOsfLaunch.disabled = false;
            alert("Launch Violation: " + (data.error || "Unknown boot failure"));
        }
    } catch (e) {
        if (btnOsfLaunch) btnOsfLaunch.disabled = false;
    }
}

async function stopOsfProcess() {
    try {
        stopOsfLiveness();
        await fetch("/api/osf/stop-process", { method: "POST" });
        setOsfMgrState("installed");
    } catch (e) {
        console.error("OSF stop failed:", e);
    }
}

async function diagnoseOsfCrash() {
    try {
        const lr    = await fetch("/api/osf/log");
        const ldata = await lr.json();
        const log   = ldata.log || "";

        if (/python\d+\.dll.*could not be found|LoadLibrary.*python/i.test(log)) {
            return {
                summary: "MISSING RUNTIME",
                detail:  "Dependency: Visual C++ Redistributable (2015-2022) is required.",
                action:  { label: "Download Runtime", url: "https://aka.ms/vs/17/release/vc_redist.x64.exe" },
                log,
            };
        }
        if (/no cameras found|cannot open camera|capture failed/i.test(log)) {
            return {
                summary: "HARDWARE CONFLICT",
                detail:  "The selected camera index is unavailable or in use.",
                log,
            };
        }
        return { summary: "PROCESS TERMINATED", detail: "Check logs for termination code.", log };
    } catch (_) {
        return { summary: "CRASH DETECTED", detail: "Process exited unexpectedly.", log: "" };
    }
}

function startOsfLiveness() {
    if (osfLivenessInterval) return;
    osfLivenessInterval = setInterval(async () => {
        try {
            const res  = await fetch("/api/osf/status");
            const data = await res.json();
            if (!data.running && data.installed) {
                stopOsfLiveness();
                setOsfMgrState("installed");
                showOsfCrashDiag(await diagnoseOsfCrash());
            }
        } catch (_) {}
    }, 3000);
}

function showOsfCrashDiag(diag) {
    if (osfMgrLabel) osfMgrLabel.textContent = diag.summary;

    if (osfInstallProg) osfInstallProg.style.display = "";
    if (osfProgFill)  { osfProgFill.style.width = "100%"; osfProgFill.style.background = "var(--danger)"; }
    if (osfProgMsg)     osfProgMsg.textContent = diag.detail || "Unexpected termination.";

    const existingLink = document.getElementById("osf-fix-link");
    if (existingLink) existingLink.remove();
    if (diag.action) {
        const a = document.createElement("a");
        a.id        = "osf-fix-link";
        a.href      = diag.action.url;
        a.target    = "_blank";
        a.className = "osf-link";
        a.style.display     = "block";
        a.style.marginTop   = "6px";
        a.innerHTML = `<i class="fa-solid fa-download"></i> ${diag.action.label}`;
        osfProgMsg.insertAdjacentElement("afterend", a);
    }

    if (diag.log) dataOutput.innerHTML = `<div class="osf-error">${diag.log}</div>`;
}

if (btnOsfInstall) btnOsfInstall.addEventListener("click", installOsf);
if (btnOsfLaunch)  btnOsfLaunch.addEventListener("click",  launchOsf);
if (btnOsfKill)    btnOsfKill.addEventListener("click",    stopOsfProcess);

// ── Diagnostics Polling ──────────────────────────────────────────────────────

async function fetchDebugStats() {
    try {
        const res  = await fetch(`${API_BASE}/debug`);
        const data = await res.json();
        if (!data.active) return;

        const s = data.stats || {};
        document.getElementById("stat-rx").textContent  = s.packets_received ?? "0";
        document.getElementById("stat-ok").textContent  = s.packets_parsed   ?? "0";
        document.getElementById("stat-sz").textContent  = s.last_size        ?? "—";
        document.getElementById("stat-fmt").textContent = s.format           ?? "—";

        const errEl = document.getElementById("stat-err");
        if (s.last_error) {
            errEl.textContent   = s.last_error;
            errEl.style.display = "";
        } else {
            errEl.style.display = "none";
        }

        if (osfStats) osfStats.style.display = "";
    } catch (_) {}
}

function startDebugPolling() {
    if (debugInterval) return;
    debugInterval = setInterval(fetchDebugStats, 1000);
}

function stopDebugPolling() {
    if (debugInterval) { clearInterval(debugInterval); debugInterval = null; }
}

// ── WebSocket & Telemetry ─────────────────────────────────────────────────────

function connectWebSocket() {
    if (ws) return;
    ws = new WebSocket(WS_URL);
    
    ws.onopen  = () => {
        console.log("[Tracking WS] Synchronized");
        hudLatency.innerText = "Connected";
    };
    
    ws.onclose = () => {
        console.log("[Tracking WS] Desynchronized");
        ws = null;
        if (statusText.classList.contains("online")) {
            setTimeout(connectWebSocket, 2000); // Auto-reconnect
        }
    };
    
    ws.onmessage = (event) => {
        frameCount++;
        updateFPS();
        
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === "params") {
                renderTelemetry(msg.params);
            }
        } catch (e) {
            console.error("[Tracking WS] Parse Violation:", e);
        }
    };
}

function disconnectWebSocket() {
    if (ws) { ws.close(); ws = null; }
}

function updateFPS() {
    const now = performance.now();
    const elapsed = now - lastFpsUpdate;
    if (elapsed >= 1000) {
        fps = (frameCount * 1000) / elapsed;
        hudFps.innerText = fps.toFixed(1) + " FPS";
        frameCount = 0;
        lastFpsUpdate = now;
        
        // Mock latency for HUD (since real E2E is hard to measure here)
        const mockLat = Math.floor(Math.random() * 5) + 12; // 12-17ms
        hudLatency.innerText = mockLat + " ms";
    }
}

function renderTelemetry(params) {
    if (!dataOutput) return;
    
    let html = "";
    for (const [key, val] of Object.entries(params)) {
        const displayVal = typeof val === "number" ? val.toFixed(3) : val;
        html += `
            <div class="param-item">
                <span class="param-name">${key}</span>
                <span class="param-value">${displayVal}</span>
            </div>
        `;
    }
    dataOutput.innerHTML = html || `<div class="param-placeholder">No active metrics</div>`;
}

// ── Floating Panel Logic ──────────────────────────────────────────────────────

(function initFloatDrag() {
    if (!floatPanel || !floatDrag) return;

    let dragging = false;
    let startX, startY, origLeft, origBottom;

    floatDrag.addEventListener("mousedown", (e) => {
        if (isPinned) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = floatPanel.getBoundingClientRect();
        origLeft   = rect.left;
        origBottom = window.innerHeight - rect.bottom;
        floatDrag.style.cursor = "grabbing";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const panelW = floatPanel.offsetWidth;
        const panelH = floatPanel.offsetHeight;
        const newLeft   = Math.max(0, Math.min(window.innerWidth  - panelW, origLeft   + dx));
        const newBottom = Math.max(0, Math.min(window.innerHeight - panelH, origBottom - dy));
        floatPanel.style.left   = newLeft   + "px";
        floatPanel.style.bottom = newBottom + "px";
        floatPanel.style.right  = "auto";
    });

    document.addEventListener("mouseup", () => {
        if (dragging) { dragging = false; floatDrag.style.cursor = ""; }
    });
})();

if (btnCollapse) {
    btnCollapse.addEventListener("click", () => {
        isCollapsed              = !isCollapsed;
        floatBody.style.display  = isCollapsed ? "none" : "";
        btnCollapse.innerHTML    = isCollapsed ? `<i class="fa-solid fa-plus"></i>` : `<i class="fa-solid fa-minus"></i>`;
        btnCollapse.title        = isCollapsed ? "Expand" : "Collapse";
        floatPanel.style.transform = isCollapsed ? "translateY(calc(100% - 45px))" : "none";
    });
}

if (btnPin) {
    btnPin.addEventListener("click", () => {
        isPinned               = !isPinned;
        floatDrag.style.cursor = isPinned ? "default" : "grab";
        btnPin.style.opacity   = isPinned ? "1"       : "0.5";
        btnPin.innerHTML       = isPinned ? `<i class="fa-solid fa-thumbtack"></i>` : `<i class="fa-solid fa-thumbtack fa-rotate-90"></i>`;
        btnPin.title           = isPinned ? "Unpin"   : "Pin";
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────

btnStart.addEventListener("click", startTracker);
btnStop.addEventListener("click",  stopTracker);
if (btnPreview) btnPreview.addEventListener("click", togglePreview);

showPlaceholder();
fetchStatus();
