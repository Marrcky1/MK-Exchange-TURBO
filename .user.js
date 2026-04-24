// ==UserScript==
// @name         Triburile.ro - MK Exchange TURBO
// @namespace    http://tampermonkey.net/
// @version      5.0
// @author       Marrcky
// @description  Refresh la 2-3s pana apare stoc, cumpara MAX instant
// @match        https://*.triburile.ro/game.php*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ─── CONFIGURARE ────────────────────────────────────────
    let RESURSE_ACTIVE = { wood: true, stone: true, iron: true };
    let REFRESH_MIN = 1;
    let REFRESH_MAX = 2;
    let MIN_STOC    = 250;

    const ENTER_APASARI        = 2;
    const DELAY_INTRE_ENTER    = 50;
    const DELAY_DUPA_BUY_CLICK = 50;
    const DELAY_POST_BUY       = 50;
    // ────────────────────────────────────────────────────────

    const params     = new URLSearchParams(window.location.search);
    const village    = params.get('village');
    const peExchange = params.get('screen') === 'market' && params.get('mode') === 'exchange';

    let ocupat       = false;
    let scriptActiv  = true;
    let buyCnt       = 0;
    let refreshCnt   = 0;
    let sesiuneStart = Date.now();
    let refreshTimer = null;
    let countdownEnd = 0;
    let countdownIv  = null;

    const logLines = [];
    const log = (...args) => {
        console.debug('[turbo]', ...args);
        const msg = args.join(' ');
        logLines.push({ time: Date.now(), msg });
        if (logLines.length > 100) logLines.shift();
        actualizareLog();
    };

    const delay  = (ms) => new Promise(r => setTimeout(r, ms));
    const delayR = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

    // ─── CITIRE STOC ─────────────────────────────────────────
    function citesteStoc(r) {
        return parseInt(document.getElementById(`premium_exchange_stock_${r}`)?.textContent?.trim().replace(/\./g, '') || '0');
    }

    function getResurseActive() {
        return Object.keys(RESURSE_ACTIVE).filter(r => RESURSE_ACTIVE[r]);
    }

    function existaStoc() {
        return getResurseActive().some(r => citesteStoc(r) >= MIN_STOC);
    }

    // ─── REFRESH LOOP ─────────────────────────────────────────
    function pornestRefreshLoop() {
        clearTimeout(refreshTimer);
        if (!scriptActiv) return;
        const sec = Math.floor(Math.random() * (REFRESH_MAX - REFRESH_MIN + 1)) + REFRESH_MIN;
        log(`Stoc gol — refresh in ${sec}s.`);
        setStare('waiting', `refresh in ${sec}s`);
        pornestCountdown(sec);
        refreshTimer = setTimeout(() => {
            if (!scriptActiv) return;
            if (existaStoc()) { log('Stoc aparut — cumpar!'); declanseaza(); return; }
            refreshCnt++;
            actualizareUI();
            log(`Refresh #${refreshCnt}.`);
            location.reload();
        }, sec * 1000);
    }

    function anuleazaRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = null;
        clearInterval(countdownIv);
    }

    function pornestCountdown(sec) {
        clearInterval(countdownIv);
        countdownEnd = Date.now() + sec * 1000;
        countdownIv = setInterval(() => {
            const ramas = Math.max(0, Math.ceil((countdownEnd - Date.now()) / 1000));
            const cd = document.getElementById('t-countdown');
            if (cd) cd.textContent = `refresh in ${ramas}s`;
            if (ramas === 0) clearInterval(countdownIv);
        }, 200);
    }

    // ─── VIZIBILITATE ────────────────────────────────────────
    function esteVizibil(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    }

    // ─── CLICK ROBUST (fix focus) ────────────────────────────
    function click(el) {
        if (!el) return;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        try { el.focus(); } catch(e) {}
        ['mouseover','mousemove','mousedown','mouseup','click'].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true, cancelable: true,
                view: window, button: 0,
                buttons: type === 'mousedown' ? 1 : 0
            }));
        });
    }

    // ─── CONFIRMARE DIRECTA (fix focus secundar) ─────────────
    // Nu se bazeaza pe Enter ci cauta butonul direct in DOM
    function apasaConfirmareDirecta() {
        const selectori = [
            'button.evt-confirm-btn.btn-confirm-yes',
            '.confirmation-box button.btn-confirm-yes',
            '.confirmation-box .evt-confirm-btn',
            '#fader button.evt-confirm-btn',
            '#fader button.btn-confirm-yes',
            '#fader .btn-confirm-yes',
            '.premium-exchange-dialog button'
        ];
        for (const sel of selectori) {
            const btn = [...document.querySelectorAll(sel)].find(esteVizibil);
            if (btn && !btn.disabled) { click(btn); return true; }
        }
        return false;
    }

    async function bombardeazaEnter(de = ENTER_APASARI) {
        for (let i = 0; i < de; i++) {
            // Incearca mai intai confirmare directa prin DOM
            const ok = apasaConfirmareDirecta();
            if (!ok) {
                // Fallback: KeyboardEvent (mai putin sigur fara focus)
                const ev = new KeyboardEvent('keydown', {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                    bubbles: true, cancelable: true
                });
                document.dispatchEvent(ev);
                document.body.dispatchEvent(ev);
            }
            await delay(DELAY_INTRE_ENTER);
        }
    }

    // ─── SETEAZA INPUT ────────────────────────────────────────
    function seteazaInput(input, val) {
        input.focus();
        input.value = String(val);
        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
    }

    // ─── ASTEAPTA BUTON BUY ──────────────────────────────────
    function asteaptaButon(ms = 4000) {
        return new Promise(res => {
            const t0 = Date.now();
            const iv = setInterval(() => {
                const b = document.querySelector('.btn-premium-exchange-buy');
                if (!b) { clearInterval(iv); res(null); return; }
                const dis = b.disabled || b.classList.contains('btn-disabled');
                const txt = b.value || b.textContent || '';
                const cd  = txt.includes('așteptați') || txt.includes('asteptati');
                if (!dis && !cd) { clearInterval(iv); res(b); return; }
                if (Date.now() - t0 > ms) { clearInterval(iv); res(null); }
            }, 80);
        });
    }

    function areEroareStoc() {
        const texte = ['nu are suficient', 'schimbul nu are', 'insufficient'];
        for (const el of document.querySelectorAll('.confirmation-box, #fader, .premium-exchange-dialog')) {
            if (!esteVizibil(el)) continue;
            if (texte.some(t => (el.textContent || '').toLowerCase().includes(t))) return true;
        }
        return false;
    }

    function asteaptaFereastra(ms = 4000) {
        return new Promise(res => {
            function gaseste() {
                if (areEroareStoc()) return { tip: 'eroare' };
                const da = document.querySelector('button.evt-confirm-btn.btn-confirm-yes');
                if (esteVizibil(da)) return { tip: 'da', el: da };
                const nu = document.querySelector('button.evt-cancel-btn.btn-confirm-no');
                if (esteVizibil(nu)) return { tip: 'nu', el: nu };
                const box = [...document.querySelectorAll('.confirmation-box .confirmation-buttons button, #premium_exchange .confirmation-buttons button')].find(esteVizibil);
                if (box) return { tip: 'box', el: box };
                const fader = [...document.querySelectorAll('#fader button, #fader a.btn')].find(esteVizibil);
                if (fader) return { tip: 'fader', el: fader };
                return null;
            }
            const imediat = gaseste();
            if (imediat) { res(imediat); return; }
            const obs = new MutationObserver(() => {
                const g = gaseste();
                if (g) { obs.disconnect(); res(g); }
            });
            obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
            setTimeout(() => { obs.disconnect(); res(null); }, ms);
        });
    }

    // ─── CUMPARARE RESURSA ────────────────────────────────────
    async function cumpara(resursa) {
        const stoc = citesteStoc(resursa);
        if (stoc < MIN_STOC) return false;

        document.querySelectorAll('input.premium-exchange-input[data-type="buy"]').forEach(i => {
            i.value = '';
            i.dispatchEvent(new Event('input', { bubbles: true }));
        });

        const input = document.querySelector(`input[name="buy_${resursa}"]`);
        if (!input || input.disabled) { log(`${resursa}: input indisponibil.`); return false; }

        log(`${resursa}: cumpar TOT = ${stoc}`);
        seteazaInput(input, stoc);

        const buton = await asteaptaButon(3000);
        if (!buton) { log(`${resursa}: buton indisponibil.`); return false; }

        click(buton);
        await delay(DELAY_DUPA_BUY_CLICK);
        await bombardeazaEnter();

        const fereastra = await asteaptaFereastra(3000);
        if (fereastra) {
            if (fereastra.tip === 'eroare') {
                log(`${resursa}: eroare stoc — refresh.`);
                await delay(200);
                location.reload();
                return false;
            }
            if (fereastra.el) click(fereastra.el);
            await bombardeazaEnter();
            log(`${resursa}: confirmat!`);
        } else {
            log(`${resursa}: confirmat (pre-enter).`);
        }

        buyCnt++;
        actualizareUI();
        afiseazaNotificare(resursa, stoc);
        return true;
    }

    // ─── CICLU PRINCIPAL ─────────────────────────────────────
    async function ruleazaCiclu() {
        if (!scriptActiv) return;
        const captcha = document.querySelector('.bot-check, .captcha, [class*="captcha"], [id*="captcha"]');
        if (captcha && captcha.offsetParent !== null) {
            log('CAPTCHA! Script oprit.');
            scriptActiv = false;
            actualizeazaStatus();
            return;
        }
        if (!existaStoc()) { pornestRefreshLoop(); return; }
        anuleazaRefresh();
        setStare('buying', 'cumparare activa...');
        const resurse = getResurseActive()
            .map(r => ({ r, stoc: citesteStoc(r) }))
            .filter(x => x.stoc >= MIN_STOC)
            .sort((a, b) => b.stoc - a.stoc);
        for (const { r } of resurse) {
            if (!scriptActiv) break;
            const ok = await cumpara(r);
            if (!ok) continue;
            await delay(DELAY_POST_BUY);
            await asteaptaButon(2000);
        }
        log('Ciclu complet.');
        if (existaStoc()) { await delay(150); await ruleazaCiclu(); }
        else pornestRefreshLoop();
    }

    async function declanseaza() {
        if (!scriptActiv || ocupat) return;
        ocupat = true;
        await ruleazaCiclu();
        ocupat = false;
    }

    // ─── OBSERVER ────────────────────────────────────────────
    function pornestObserver() {
        getResurseActive().forEach(r => {
            const el = document.getElementById(`premium_exchange_stock_${r}`);
            if (!el) return;
            new MutationObserver(async () => {
                if (!scriptActiv || ocupat || citesteStoc(r) < MIN_STOC) return;
                log(`Stoc nou: ${r} = ${citesteStoc(r)} — cumpar instant!`);
                anuleazaRefresh();
                await declanseaza();
            }).observe(el, { childList: true, subtree: true, characterData: true });
        });
        setInterval(async () => {
            if (!scriptActiv || ocupat || !existaStoc()) return;
            anuleazaRefresh();
            await declanseaza();
        }, 800);
    }

    // ─── FOCUS TRACKER (fix monitor secundar) ────────────────
    window.addEventListener('blur', () => {
        log('Fereastra fara focus — confirmare prin DOM activa.');
        setStare('waiting', 'fara focus / monitor 2');
    });
    window.addEventListener('focus', () => {
        log('Fereastra are focus din nou.');
        if (scriptActiv && !ocupat) declanseaza();
    });

    // ─── NOTIFICARI (stil medieval) ──────────────────────────
    function afiseazaNotificare(r, cant) {
        const nume = { wood: 'Lemn', stone: 'Argila', iron: 'Fier' };
        const n = document.createElement('div');
        n.style.cssText = `
            position:fixed;bottom:80px;right:16px;z-index:9999999;
            background:linear-gradient(135deg,#f9eecc,#eedfa0);
            border:1px solid #9a7a2a;border-left:3px solid #8a5a10;
            padding:8px 14px;font-family:Arial,sans-serif;font-size:12px;
            color:#3a2800;border-radius:6px;
            box-shadow:0 3px 12px rgba(0,0,0,0.3);
            transition:opacity 0.4s;opacity:1;pointer-events:none;`;
        n.textContent = `✓ Cumparat: ${nume[r]} × ${cant}`;
        document.body.appendChild(n);
        setTimeout(() => { n.style.opacity='0'; setTimeout(() => n.remove(), 400); }, 2500);
    }

    // ─── UI HELPERS ───────────────────────────────────────────
    function setStare(tip, msg) {
        const bar = document.getElementById('t-state-bar');
        const txt = document.getElementById('t-state-txt');
        const cd  = document.getElementById('t-countdown');
        if (bar) bar.className = 'tk-status-bar' + (tip === 'waiting' ? ' waiting' : '');
        if (txt) txt.textContent = msg;
        if (cd && tip !== 'waiting') cd.textContent = '';
    }

    function actualizareUI() {
        ['mk-buy-cnt','mk-buy-footer'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = buyCnt;
        });
        const rc = document.getElementById('t-ref-cnt');
        if (rc) rc.textContent = refreshCnt;
    }

    function actualizeazaStatus() {
        const dot = document.getElementById('t-dot');
        const txt = document.getElementById('t-status-txt');
        if (dot) dot.classList.toggle('off', !scriptActiv);
        if (txt) txt.textContent = scriptActiv ? 'ACTIV' : 'OPRIT';
    }

    function togglePanou() {
        const p = document.getElementById('tk-panel');
        if (!p) return;
        const open = p.style.display === 'none' || !p.style.display;
        p.style.display = open ? 'block' : 'none';
    }

    function actualizareLog() {
        const box = document.getElementById('t-log-box');
        if (!box) return;
        box.innerHTML = logLines.map(l => {
            const d = new Date(l.time - sesiuneStart);
            const t = `${String(Math.floor(d/60000)).padStart(2,'0')}:${String(Math.floor((d%60000)/1000)).padStart(2,'0')}`;
            const c = l.msg.includes('cumpar') || l.msg.includes('confirmat') ? 'ok'
                    : l.msg.includes('refresh') || l.msg.includes('Refresh') || l.msg.includes('gol') || l.msg.includes('focus') ? 'warn'
                    : l.msg.includes('OPRIT') || l.msg.includes('CAPTCHA') || l.msg.includes('eroare') ? 'err' : '';
            return `<div class="tk-log-entry"><span class="tk-log-time">${t}</span><span class="tk-log-msg ${c}">${l.msg}</span></div>`;
        }).join('');
        box.scrollTop = box.scrollHeight;
    }

    // ─── CSS MEDIEVAL ────────────────────────────────────────
    const CSS = `
    #tk-float{position:fixed!important;bottom:10px!important;left:10px!important;z-index:2147483646!important;
        background:linear-gradient(90deg,#8a5a10,#c4922a);border:none;border-radius:8px;
        color:#fff;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;
        padding:8px 14px;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,.4);
        text-shadow:0 1px 2px rgba(0,0,0,.4);}
    #tk-float:hover{filter:brightness(1.1);}

    #tk-panel{position:fixed!important;bottom:60px!important;left:10px!important;z-index:2147483647!important;
        width:300px;background:linear-gradient(160deg,#f9eecc,#eedfa0);
        border:2px solid #9a7a2a;border-radius:10px;
        box-shadow:0 6px 24px rgba(0,0,0,.45);font-family:Arial,sans-serif;
        font-size:13px;color:#3a2800;display:none;}

    #tk-header{background:linear-gradient(90deg,#8a5a10,#c4922a);border-radius:8px 8px 0 0;
        padding:9px 12px;display:flex;justify-content:space-between;align-items:center;cursor:move;}
    #tk-header-title{font-weight:bold;font-size:14px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.5);}
    #tk-header-right{display:flex;align-items:center;gap:8px;}
    .tk-dot{width:7px;height:7px;border-radius:50%;background:#7fff7f;
        animation:tk-pulse 1.4s infinite;flex-shrink:0;}
    .tk-dot.off{background:#ff7f7f;animation:none;}
    @keyframes tk-pulse{0%,100%{opacity:1}50%{opacity:.3}}
    #t-status-txt{font-size:11px;color:rgba(255,255,255,.85);}
    #tk-close{background:rgba(0,0,0,.25);border:none;color:#fff;width:22px;height:22px;
        border-radius:50%;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;}

    #tk-body{padding:10px 12px 10px;display:flex;flex-direction:column;gap:8px;}

    .tk-sect{font-size:10px;font-weight:bold;color:#7a5a10;text-transform:uppercase;
        letter-spacing:.05em;margin-bottom:5px;border-bottom:1px solid #c8a84e;padding-bottom:2px;}

    .tk-stat-row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;}
    .tk-stat-lbl{color:#7a5a10;}
    .tk-stat-val{font-weight:bold;color:#3a2800;}

    .tk-res-row{display:flex;gap:10px;margin-bottom:2px;}
    .tk-rc{display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;}
    .tk-rc input{display:none;}
    .tk-rb{width:14px;height:14px;border:1px solid #c8a84e;border-radius:3px;
        background:#fdf6e0;display:flex;align-items:center;justify-content:center;
        font-size:9px;color:transparent;transition:.15s;}
    .tk-rc input:checked ~ .tk-rb{background:#c8a84e;color:#3a2800;border-color:#9a7a2a;}
    .tk-rl{color:#5a3a00;transition:.15s;}
    .tk-rc input:checked ~ .tk-rl{color:#3a2800;font-weight:bold;}

    .tk-sl-row{display:flex;align-items:center;gap:8px;margin-bottom:4px;}
    .tk-sl-lbl{font-size:11px;color:#7a5a10;width:85px;flex-shrink:0;}
    .tk-sl-val{font-size:11px;font-weight:bold;color:#3a2800;width:36px;text-align:right;flex-shrink:0;}
    .tk-range{flex:1;-webkit-appearance:none;height:3px;background:#c8a84e;border-radius:2px;outline:none;cursor:pointer;}
    .tk-range::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;
        background:linear-gradient(135deg,#c4922a,#8a5a10);cursor:pointer;border:1px solid #6a3a00;}

    .tk-status-bar{padding:6px 10px;background:rgba(139,94,30,.12);
        border-left:3px solid #c4922a;border-radius:0 4px 4px 0;
        font-size:11px;color:#5a3a00;display:flex;align-items:center;justify-content:space-between;}
    .tk-status-bar.waiting{border-left-color:#c4922a;color:#7a5a10;}

    .tk-cmd-row{display:flex;gap:5px;}
    .tk-cmd{flex:1;padding:7px 0;border-radius:6px;font-family:Arial,sans-serif;
        font-size:11px;font-weight:bold;cursor:pointer;border:1px solid;transition:.18s;}
    .tk-cmd:active{transform:scale(.97);}
    .tk-cmd.run{background:linear-gradient(90deg,#1a6b10,#2ea822);color:#fff;border-color:#145010;}
    .tk-cmd.run:hover{filter:brightness(1.1);}
    .tk-cmd.stop{background:linear-gradient(90deg,#8a1010,#c43020);color:#fff;border-color:#6a0808;}
    .tk-cmd.stop:hover{filter:brightness(1.1);}

    .tk-log-box{background:rgba(139,94,30,.08);border:1px solid #c8a84e;border-radius:6px;
        padding:7px 9px;height:90px;overflow-y:auto;font-size:10px;
        display:flex;flex-direction:column;gap:2px;}
    .tk-log-entry{display:flex;gap:6px;}
    .tk-log-time{color:#b8983a;min-width:38px;flex-shrink:0;font-size:9px;}
    .tk-log-msg{color:#5a3a00;word-break:break-all;line-height:1.4;}
    .tk-log-msg.ok{color:#1a6b10;font-weight:bold;}
    .tk-log-msg.warn{color:#8a6a00;}
    .tk-log-msg.err{color:#8a1010;font-weight:bold;}

    #tk-footer{display:flex;justify-content:space-between;padding:5px 12px;
        border-top:1px solid #c8a84e;font-size:10px;color:#9a7a2a;}
    `;

    // ─── BUILD PANOU ─────────────────────────────────────────
    function creeazaPanou() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        // Buton flotant
        const floatBtn = document.createElement('button');
        floatBtn.id = 'tk-float';
        floatBtn.textContent = '⚡ Turbo';
        floatBtn.addEventListener('click', togglePanou);
        document.body.appendChild(floatBtn);

        // Panou
        const panel = document.createElement('div');
        panel.id = 'tk-panel';
        panel.innerHTML = `
            <div id="tk-header">
                <span id="tk-header-title">⚡ MK Turbo Exchange</span>
                <div id="tk-header-right">
                    <div class="tk-dot" id="t-dot"></div>
                    <span id="t-status-txt">ACTIV</span>
                    <button id="tk-close">✕</button>
                </div>
            </div>
            <div id="tk-body">

                <div>
                    <div class="tk-sect">Statistici</div>
                    <div class="tk-stat-row"><span class="tk-stat-lbl">Cumparari</span><span class="tk-stat-val" id="mk-buy-cnt">0</span></div>
                    <div class="tk-stat-row"><span class="tk-stat-lbl">Refresh-uri</span><span class="tk-stat-val" id="t-ref-cnt">0</span></div>
                    <div class="tk-stat-row"><span class="tk-stat-lbl">Uptime</span><span class="tk-stat-val" id="t-up">0s</span></div>
                </div>

                <div>
                    <div class="tk-sect">Resurse active</div>
                    <div class="tk-res-row">
                        <label class="tk-rc"><input type="checkbox" id="tr-wood" checked><div class="tk-rb">✓</div><span class="tk-rl">Lemn</span></label>
                        <label class="tk-rc"><input type="checkbox" id="tr-stone" checked><div class="tk-rb">✓</div><span class="tk-rl">Argila</span></label>
                        <label class="tk-rc"><input type="checkbox" id="tr-iron" checked><div class="tk-rb">✓</div><span class="tk-rl">Fier</span></label>
                    </div>
                </div>

                <div>
                    <div class="tk-sect">Parametri refresh</div>
                    <div class="tk-sl-row">
                        <span class="tk-sl-lbl">Refresh min</span>
                        <input type="range" class="tk-range" min="1" max="30" value="2" step="1" id="t-sl-rmin">
                        <span class="tk-sl-val" id="t-sl-rmin-val">2s</span>
                    </div>
                    <div class="tk-sl-row">
                        <span class="tk-sl-lbl">Refresh max</span>
                        <input type="range" class="tk-range" min="2" max="60" value="3" step="1" id="t-sl-rmax">
                        <span class="tk-sl-val" id="t-sl-rmax-val">3s</span>
                    </div>
                    <div class="tk-sl-row">
                        <span class="tk-sl-lbl">Stoc minim</span>
                        <input type="range" class="tk-range" min="1" max="5000" value="250" step="1" id="t-sl-minstoc">
                        <span class="tk-sl-val" id="t-sl-minstoc-val">250</span>
                    </div>
                </div>

                <div class="tk-status-bar" id="t-state-bar">
                    <span id="t-state-txt">Initializare...</span>
                    <span id="t-countdown" style="font-size:10px;opacity:.7"></span>
                </div>

                <div class="tk-cmd-row">
                    <button class="tk-cmd run" id="t-btn-run">▶ Run acum</button>
                    <button class="tk-cmd stop" id="t-btn-stop">■ Stop</button>
                </div>

                <div>
                    <div class="tk-sect">Log activitate</div>
                    <div class="tk-log-box" id="t-log-box"></div>
                </div>

            </div>
            <div id="tk-footer">
                <span>by <b>Marrcky</b> · turbo v5.0</span>
                <span>buy: <b id="mk-buy-footer">0</b></span>
            </div>
        `;
        document.body.appendChild(panel);

        // Drag
        makeDraggable(panel, document.getElementById('tk-header'));

        document.getElementById('tk-close').addEventListener('click', togglePanou);

        ['wood','stone','iron'].forEach(r => {
            document.getElementById(`tr-${r}`).addEventListener('change', e => {
                RESURSE_ACTIVE[r] = e.target.checked;
                log(`${r}: ${e.target.checked ? 'activa' : 'dezactivata'}.`);
            });
        });

        document.getElementById('t-sl-rmin').addEventListener('input', e => {
            REFRESH_MIN = parseInt(e.target.value);
            document.getElementById('t-sl-rmin-val').textContent = e.target.value + 's';
        });
        document.getElementById('t-sl-rmax').addEventListener('input', e => {
            REFRESH_MAX = parseInt(e.target.value);
            document.getElementById('t-sl-rmax-val').textContent = e.target.value + 's';
        });
        document.getElementById('t-sl-minstoc').addEventListener('input', e => {
            MIN_STOC = parseInt(e.target.value);
            document.getElementById('t-sl-minstoc-val').textContent = e.target.value;
        });

        document.getElementById('t-btn-run').addEventListener('click', async () => {
            if (!scriptActiv) { log('Script oprit.'); return; }
            log('Run manual.');
            await declanseaza();
        });

        document.getElementById('t-btn-stop').addEventListener('click', () => {
            scriptActiv = false;
            anuleazaRefresh();
            actualizeazaStatus();
            log('Script OPRIT.');
        });

        setInterval(() => {
            const sec = Math.floor((Date.now() - sesiuneStart) / 1000);
            const up = document.getElementById('t-up');
            if (up) up.textContent = sec < 60 ? sec+'s' : Math.floor(sec/60)+'m'+String(sec%60).padStart(2,'0')+'s';
            const cl = document.getElementById('t-clock');
            if (cl) cl.textContent = new Date().toTimeString().slice(0,8);
            const bf = document.getElementById('mk-buy-footer');
            if (bf) bf.textContent = buyCnt;
        }, 1000);
    }

    function makeDraggable(el, handle) {
        let ox=0,oy=0,mx=0,my=0;
        handle.addEventListener('mousedown', function(e) {
            e.preventDefault(); mx=e.clientX; my=e.clientY;
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onStop);
        });
        function onDrag(e) {
            ox=mx-e.clientX; oy=my-e.clientY; mx=e.clientX; my=e.clientY;
            el.style.bottom='auto'; el.style.top=(el.offsetTop-oy)+'px';
            el.style.left=(el.offsetLeft-ox)+'px';
        }
        function onStop() {
            document.removeEventListener('mousemove',onDrag);
            document.removeEventListener('mouseup',onStop);
        }
    }

    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'm') { e.preventDefault(); togglePanou(); }
    });

    // ─── PORNIRE ─────────────────────────────────────────────
    window.addEventListener('load', async () => {
        creeazaPanou();
        if (!peExchange) {
            log('Redirectez pe Exchange...');
            await delayR(200, 400);
            window.location.href = `game.php?village=${village}&screen=market&mode=exchange`;
            return;
        }
        await delayR(150, 300);
        log('MK_TURBO v5.0 pornit. Ctrl+M = panou.');
        if (existaStoc()) { await declanseaza(); }
        else { pornestRefreshLoop(); }
        pornestObserver();
    });

})();
