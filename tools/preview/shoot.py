"""Screenshot the local preview with Playwright (runs in the ms-shooter image, see preview.sh).

    python shoot.py OUTDIR light|dark|both PAGE [PAGE ...]

A PAGE is a path, optionally followed by steps:  /messages/<id>@click:Reply with AI|fill:Steer the ideas=formal|wait:1500
Steps: click:<visible text>  fill:<placeholder or label>=<value>  press:<key>  hover:<visible text>  mouse:<x>,<y>  wait:<ms>
Env: FULL=1 for full-page shots, PHONE=0 to skip the 390px phone shot, API_LOG=path of the API log (for the OTP).
"""

import asyncio
import hashlib
import os
import re
import sys

from playwright.async_api import Page, async_playwright

BASE = "http://localhost:3000"
OUT, MODE, PAGES = sys.argv[1], sys.argv[2], sys.argv[3:]
MODES = ["light", "dark"] if MODE == "both" else [MODE]
FULL, PHONE = os.environ.get("FULL") == "1", os.environ.get("PHONE", "1") == "1"
DESK, MOBILE = {"width": 1440, "height": 900}, {"width": 390, "height": 844}
PUBLIC = ("/", "/login", "/admin/login")


def name_of(spec: str) -> str:
    name = re.sub(r"[^A-Za-z0-9]+", "_", spec.strip("/")).strip("_") or "home"
    # Long step lists would collide once cut short, so a cut name ends with a hash of the whole spec.
    return name if len(name) <= 90 else f"{name[:80]}_{hashlib.sha1(spec.encode()).hexdigest()[:8]}"


async def run_steps(page: Page, steps: list[str]) -> None:
    for step in steps:
        kind, _, arg = step.partition(":")
        if kind == "click":
            for target in (page.get_by_role("button", name=arg), page.get_by_role("link", name=arg),
                           page.get_by_role("tab", name=arg), page.get_by_text(arg, exact=False)):
                if await target.count() and await target.first.is_visible():
                    await target.first.click()
                    break
            else:
                raise RuntimeError(f"nothing visible to click: {arg!r}")
        elif kind == "hover":
            await page.get_by_text(arg, exact=False).first.hover()
        elif kind == "fill":
            label, _, value = arg.partition("=")
            # Placeholder first, then a text box by its accessible name (a section may share the label).
            for box in (page.get_by_placeholder(label), page.get_by_role("textbox", name=label), page.get_by_label(label)):
                if await box.count() and await box.first.is_visible():
                    break
            await box.first.fill(value)
        elif kind == "press":
            await page.keyboard.press(arg)
        elif kind == "mouse":
            x, _, y = arg.partition(",")
            await page.mouse.move(float(x), float(y), steps=8)
        elif kind == "wait":
            await page.wait_for_timeout(int(arg))
        await page.wait_for_timeout(400)


async def shoot(page: Page, spec: str, mode: str) -> None:
    path, _, steps = spec.partition("@")
    for viewport, tag in ((DESK, ""), (MOBILE, "m-")) if PHONE else ((DESK, ""),):
        await page.set_viewport_size(viewport)
        await page.emulate_media(color_scheme=mode)
        # Theme is set before the page's scripts run (the latest init script wins), so there's no reload:
        # a reload could cut off the sign-in refresh mid-flight and trip refresh-token reuse detection.
        await page.add_init_script(f"try {{ localStorage.setItem('theme', '{mode}') }} catch {{}}")
        await page.goto(BASE + path, wait_until="load", timeout=90_000)
        await page.wait_for_timeout(3000)
        if steps:
            await run_steps(page, steps.split("|"))
            await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/{mode}-{tag}{name_of(spec)}.png", full_page=FULL)


async def otp_login(page: Page) -> None:
    phone = "+919812345678"
    resp = await page.request.post(BASE + "/api/v1/auth/otp/request", data={"phone": phone})
    assert resp.ok, await resp.text()
    await asyncio.sleep(0.5)
    log = re.sub(r"\x1b\[[0-9;]*m", "", open(os.environ["API_LOG"]).read())
    code = re.findall(r"otp_dry_run\s+code=(\d{6})", log)[-1]
    resp = await page.request.post(BASE + "/api/v1/auth/otp/verify", data={"phone": phone, "code": code})
    assert resp.ok, await resp.text()


async def admin_login(page: Page) -> None:
    await page.goto(BASE + "/admin/login", wait_until="load")
    await page.wait_for_timeout(2000)
    await page.fill("#admin-username", "admin")
    await page.fill("#admin-password", "preview-admin-pass")
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(3000)


async def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    groups = {"public": [p for p in PAGES if p.partition("@")[0] in PUBLIC],
              "admin": [p for p in PAGES if p.startswith("/admin") and p.partition("@")[0] not in PUBLIC],
              "app": [p for p in PAGES if not p.startswith("/admin") and p.partition("@")[0] not in PUBLIC]}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        for group, specs in groups.items():
            if not specs:
                continue
            # One context (one sign-in) per group: refresh tokens rotate, so sessions can't be shared.
            context = await browser.new_context(viewport=DESK)
            page = await context.new_page()
            if group == "app":
                await otp_login(page)
            elif group == "admin":
                await admin_login(page)
            for mode in MODES:
                for spec in specs:
                    await shoot(page, spec, mode)
            await context.close()
        await browser.close()


asyncio.run(main())
