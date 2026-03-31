// ==UserScript==
// @name        K-ID Bypasser
// @namespace   Violentmonkey Scripts
// @match       *://d3ogqhtsivkon3.cloudfront.net/*
// @grant       none
// @run-at      document-start
// @version     1.0
// ==/UserScript==

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════
    const IFRAME_SRC = "https://mollomm1.github.io/ageman/";
    const SPOOF_NAME = "HP Integrated Camera";
    const TARGET_NAME = "OBS Virtual Camera";

    const RES_X = 640;
    const RES_Y = 320;
    const FPS = 20;

    const SPOOF_ID = "6237b779a957827e8a936a7e583996646549219602a8323281087";
    const SPOOF_GROUP = "52637b779a957827e8a936a7e583996646549219602a8323281087";

    let controlMode = false;
    let infrastructureReady = false;
    let receiverCanvas, bitmapCtx, iframeRef;

    // Mapping for legacy libraries
    const keyToCode = {"w":87,"a":65,"s":83,"d":68,"ArrowUp":38,"ArrowDown":40,"ArrowLeft":37,"ArrowRight":39," ":32,"Enter":13,"Shift":16,"Control":17};

    // ═══════════════════════════════════════════════════════
    // CONTROL MODE (KEYBOARD/WHEEL TUNNELING)
    // ═══════════════════════════════════════════════════════

    const ui = document.createElement('div');
    function updateUI() {
        ui.innerHTML = controlMode ? "🎮 CONTROL MODE: ACTIVE (Press 'N' to exit)" : "";
        ui.style.cssText = controlMode ? `
            position: fixed; bottom: 20px; right: 20px; padding: 10px 20px;
            background: rgba(255, 0, 0, 0.9); color: white; font-weight: bold;
            z-index: 1000000; border-radius: 5px; font-family: sans-serif; box-shadow: 0 0 10px rgba(0,0,0,0.5);
        ` : "display:none;";
    }

    function forwardEvent(action, data) {
        if (iframeRef) {
            iframeRef.contentWindow.postMessage({ type: 'REMOTE_CONTROL', action, data }, '*');
        }
    }

    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'n') {
            controlMode = !controlMode;
            updateUI();
            e.preventDefault(); e.stopImmediatePropagation();
            return;
        }
        if (controlMode) {
            forwardEvent('KEYDOWN', {
                key: e.key, code: e.code, keyCode: keyToCode[e.key] || e.keyCode,
                shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey
            });
            e.preventDefault(); e.stopImmediatePropagation();
        }
    }, true);

    window.addEventListener('keyup', (e) => {
        if (controlMode) {
            forwardEvent('KEYUP', { key: e.key, code: e.code, keyCode: keyToCode[e.key] || e.keyCode });
            e.preventDefault(); e.stopImmediatePropagation();
        }
    }, true);

    window.addEventListener('wheel', (e) => {
        if (controlMode) {
            forwardEvent('SCROLL', { deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode });
            e.preventDefault(); e.stopImmediatePropagation();
        }
    }, { passive: false, capture: true });

    // ═══════════════════════════════════════════════════════
    // INFRASTRUCTURE (HIGH-PERF STEALH IFRAME)
    // ═══════════════════════════════════════════════════════

    function setupInfrastructure() {
        if (infrastructureReady) return;

        // 1. Setup Receiver Canvas
        receiverCanvas = document.createElement('canvas');
        receiverCanvas.width = RES_X;
        receiverCanvas.height = RES_Y;
        bitmapCtx = receiverCanvas.getContext('bitmaprenderer');

        // 2. High-Perf Listener (Handshake/ACK)
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'CAMERA_FRAME' && event.data.bitmap) {
                if (bitmapCtx) {
                    bitmapCtx.transferFromImageBitmap(event.data.bitmap);
                    // Signal Iframe: Ready for next frame (Prevents lag queue)
                    event.source.postMessage({ type: 'FRAME_ACK' }, event.origin);
                }
            }
        });

        // 3. Stealth Visibility Style
        const style = document.createElement('style');
        style.innerHTML = `
            html, body { background: white; }
            #vc-stealth-frame {
                position: fixed; top: 0; left: 0;
                width: ${RES_X}px; height: ${RES_Y}px;
                z-index: -999999 !important;
                border: none; pointer-events: none;
                visibility: visible; display: block;
            }
        `;
        document.head.appendChild(style);

        // 4. Create Iframe
        iframeRef = document.createElement('iframe');
        iframeRef.id = "vc-stealth-frame";
        iframeRef.src = IFRAME_SRC;
        iframeRef.allow = "autoplay; camera; microphone";
        document.body.appendChild(iframeRef);

        document.documentElement.appendChild(ui);
        infrastructureReady = true;
    }

    // ═══════════════════════════════════════════════════════
    // DEEP HOOKS (SPOOFING ENGINE)
    // ═══════════════════════════════════════════════════════

    function createFakeDevice(kind, label, deviceId, groupId) {
        const device = Object.create(MediaDeviceInfo.prototype);
        Object.defineProperties(device, {
            kind: { value: kind, enumerable: true },
            label: { value: label, enumerable: true },
            deviceId: { value: deviceId, enumerable: true },
            groupId: { value: groupId, enumerable: true }
        });
        return device;
    }

    // --- enumerateDevices Hook ---
    const originalEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async function() {
        const devices = await originalEnumerate();
        const fakeList = [];
        let cameraAdded = false;

        for (const device of devices) {
            if (device.kind === 'videoinput') {
                // If OBS or empty (Firefox hidden), replace with HP
                if (device.label.includes(TARGET_NAME) || device.label === "") {
                    fakeList.push(createFakeDevice('videoinput', SPOOF_NAME, SPOOF_ID, SPOOF_GROUP));
                    cameraAdded = true;
                } else {
                    fakeList.push(device);
                }
            } else {
                fakeList.push(device);
            }
        }
        if (!cameraAdded) {
            fakeList.push(createFakeDevice('videoinput', SPOOF_NAME, SPOOF_ID, SPOOF_GROUP));
        }
        return fakeList;
    };

    // --- getUserMedia Hook ---
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function(constraints) {
        if (constraints && constraints.video) {
            console.log("VC: Hijacking Video Stream...");
            setupInfrastructure();

            const stream = receiverCanvas.captureStream(FPS);
            const vTrack = stream.getVideoTracks()[0];

            // Hook Track Metadata
            Object.defineProperties(vTrack, {
                label: { get: () => SPOOF_NAME },
                enabled: { value: true, writable: true }
            });

            // Hook Settings
            vTrack.getSettings = () => ({
                width: RES_X, height: RES_Y, frameRate: FPS,
                deviceId: SPOOF_ID, groupId: SPOOF_GROUP,
                aspectRatio: RES_X / RES_Y, facingMode: "user"
            });

            const finalStream = new MediaStream([vTrack]);

            if (constraints.audio) {
                try {
                    const audioStream = await originalGetUserMedia({ audio: constraints.audio });
                    audioStream.getAudioTracks().forEach(t => finalStream.addTrack(t));
                } catch(e) { console.warn("VC: Audio mix failed"); }
            }
            return finalStream;
        }
        return originalGetUserMedia(constraints);
    };

    // --- Permissions API Hook ---
    if (navigator.permissions && navigator.permissions.query) {
        const originalQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = function(params) {
            if (params.name === 'camera') {
                return Promise.resolve({ name: 'camera', state: 'granted', onchange: null });
            }
            return originalQuery(params);
        };
    }

    // --- Legacy Polyfills ---
    const legacyHandler = (c, s, e) => navigator.mediaDevices.getUserMedia(c).then(s).catch(e);
    navigator.getUserMedia = legacyHandler;
    navigator.webkitGetUserMedia = legacyHandler;
    navigator.mozGetUserMedia = legacyHandler;
})();
