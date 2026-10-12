// ===== pages/mobile.js – 移动端控制（跟手摇杆版） =====
document.write(`
    <div id="mobile-controls" style="position:fixed;inset:0;z-index:20;pointer-events:none;display:none;">

        <div id="touch-left-zone"
             style="position:absolute;left:0;bottom:0;width:40%;height:70%;
                    pointer-events:auto;touch-action:none;"></div>

        <div id="touch-left-hint"
             style="position:absolute;left:24px;bottom:110px;
                    width:110px;height:110px;border-radius:50%;
                    background:rgba(255,255,255,0.06);
                    border:2px dashed rgba(255,255,255,0.22);
                    pointer-events:none;transition:opacity 0.15s;">
            <div style="position:absolute;left:50%;top:50%;
                        width:44px;height:44px;margin-left:-22px;margin-top:-22px;
                        border-radius:50%;
                        background:rgba(255,255,255,0.16);
                        border:1.5px solid rgba(255,255,255,0.32);"></div>
        </div>

        <div id="touch-left-base"
             style="position:absolute;left:0;top:0;
                    width:130px;height:130px;
                    margin-left:-65px;margin-top:-65px;
                    border-radius:50%;
                    background:rgba(255,255,255,0.12);
                    border:2px solid rgba(255,255,255,0.35);
                    pointer-events:none;display:none;
                    box-shadow:0 4px 20px rgba(0,0,0,0.45);">
            <div id="touch-left-knob"
                 style="position:absolute;left:50%;top:50%;
                        width:56px;height:56px;margin-left:-28px;margin-top:-28px;
                        border-radius:50%;
                        background:rgba(255,255,255,0.42);
                        border:2px solid rgba(255,255,255,0.62);
                        box-shadow:0 2px 8px rgba(0,0,0,0.5);
                        transition:transform 0.04s linear;"></div>
        </div>

        <div id="touch-right" style="position:absolute;right:0;top:0;width:60%;height:100%;pointer-events:auto;background:transparent;touch-action:none;"></div>

        <div id="btn-fire" style="position:absolute;right:20px;bottom:40px;width:90px;height:90px;border-radius:50%;background:rgba(255,50,50,0.7);border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;font-weight:bold;pointer-events:auto;box-shadow:0 4px 10px rgba(0,0,0,0.5);touch-action:manipulation;">开火</div>

        <div style="position:absolute;left:20px;bottom:250px;display:flex;gap:10px;flex-wrap:wrap;max-width:55%;pointer-events:none;">
            <div id="btn-jump"   style="pointer-events:auto;padding:10px 16px;background:rgba(0,0,0,0.6);border-radius:8px;color:#fff;border:1px solid #aaa;font-size:15px;touch-action:manipulation;">跳跃</div>
            <div id="btn-aim"    style="pointer-events:auto;padding:10px 16px;background:rgba(0,0,0,0.6);border-radius:8px;color:#fff;border:1px solid #aaa;font-size:15px;touch-action:manipulation;">开镜</div>
            <div id="btn-reload" style="pointer-events:auto;padding:10px 16px;background:rgba(0,0,0,0.6);border-radius:8px;color:#fff;border:1px solid #aaa;font-size:15px;touch-action:manipulation;">换弹</div>
            <div id="btn-weapon" style="pointer-events:auto;padding:10px 16px;background:rgba(255,210,74,0.85);border-radius:8px;color:#08131f;border:1px solid #ffd24a;font-size:15px;font-weight:bold;touch-action:manipulation;">换枪</div>
        </div>
    </div>
`);