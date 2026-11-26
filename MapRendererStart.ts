// Add your code here
/**
 * 3. MAP, LEVEL GENERATOR, RENDERER & GAME START — THE IRON SEAT
 * Builds the 4-biome 500m vertical mountain (Rusted Foundry, Spring Clocktower,
 * Glacial Viaduct, Stratosphere Spire), renders the cable/HUD, and starts the run.
 */

// ============================================================================
// LEDGE, RING & SPRING BUMPER FACTORIES
// ============================================================================
function addLedge(x: number, y: number, w: number, h: number, kind: string) {
    const pic = image.create(w, h)
    if (kind == "timber") {
        pic.fill(4)
        pic.fillRect(0, 0, w, 2, 5)
        pic.fillRect(0, h - 2, w, 2, 14)
    } else if (kind == "ice") {
        pic.fill(8)
        pic.fillRect(0, 0, w, 2, 9)
        pic.fillRect(0, h - 2, w, 2, 6)
    } else if (kind == "gold_deck") {
        pic.fill(4)
        pic.fillRect(0, 0, w, 2, 1)
        pic.fillRect(0, h - 2, w, 2, 5)
    } else {
        // Industrial steel
        pic.fill(11)
        pic.fillRect(0, 0, w, 2, 13)
        pic.fillRect(0, h - 2, w, 2, 12)
    }

    const sp = sprites.create(pic, SpriteKind.Ledge)
    sp.setPosition(x, y)
    ledges.push({ sprite: sp, kind: kind })
}

function addRing(x: number, y: number, amp: number, spd: number, kind: string) {
    let imgRef = IMG_RING_GOLD
    if (kind == "cyan") imgRef = IMG_RING_CYAN
    else if (kind == "ember") imgRef = IMG_RING_EMBER

    const sp = sprites.create(imgRef, SpriteKind.Anchor)
    sp.setPosition(x, y)
    rings.push({
        sprite: sp,
        baseX: x,
        baseY: y,
        amp: amp,
        spd: spd,
        phase: rings.length * 1.15,
        kind: kind
    })
}

function addBumper(x: number, y: number) {
    const sp = sprites.create(IMG_SPRING_BUMPER, SpriteKind.Bumper)
    sp.setPosition(x, y)
    bumpers.push({ sprite: sp })
}

// ============================================================================
// 4-BIOME MOUNTAIN BUILDER (0m TO 500m)
// ============================================================================
function buildWorld() {
    // Ground Steel Deck
    addLedge(0, 8, 220, 16, "steel")

    // BIOME I: 0m - 120m (Rusted Foundry — Continuous Swing Ring Chains)
    addRing(-22, -46, 0, 0, "gold")
    addRing(26, -82, 0, 0, "gold")
    addRing(-28, -118, 0, 0, "gold")

    for (let m = 36; m < 120; m += 15) {
        const y = -m * PPM
        const step = Math.round((m - 36) / 15)
        const side = step % 2 == 0 ? 1 : -1
        addRing(side * 34, y, 0, 0, "gold")
        if (step % 3 == 0) {
            addLedge(-side * 54, y + 14, 34, 7, "timber")
        }
    }

    // BIOME II: 120m - 260m (Springwork Clocktower - Brass Bumpers + Swing Rings)
    for (let m = 126; m < 260; m += 20) {
        const y = -m * PPM
        const step = Math.round((m - 126) / 20)
        const side = step % 2 == 0 ? 1 : -1

        addRing(side * 42, y - 16, 0, 0, "gold")
        addRing(-side * 10, y + 16, 0, 0, "cyan")
        addBumper(-side * 54, y - 4)

        if (step % 2 == 0) {
            addLedge(side * 52, y + 12, 38, 7, "timber")
        }
    }

    // BIOME III: 260m - 390m (Glacial Viaduct - Moving Rings & Slick Ice Shelves)
    for (let m = 266; m < 390; m += 21) {
        const y = -m * PPM
        const step = Math.round((m - 266) / 21)
        const side = step % 2 == 0 ? -1 : 1

        addRing(side * 32, y - 18, 24, 1.7 + (step % 3) * 0.2, step % 3 == 1 ? "ember" : "gold")
        addLedge(-side * 48, y, 36, 7, step % 2 == 0 ? "ice" : "steel")
    }

    // BIOME IV: 390m - 500m (Stratosphere Spire - Crosswinds & Final Ascent)
    for (let m = 396; m < 490; m += 22) {
        const y = -m * PPM
        const step = Math.round((m - 396) / 22)
        const side = step % 2 == 0 ? 1 : -1

        addRing(side * 36, y - 16, 28, 2.1, step % 2 == 0 ? "gold" : "ember")
        addRing(0, y + 18, 0, 0, "cyan")
        addBumper(-side * 58, y - 8)
    }

    // 500m SUMMIT SANCTUARY
    addLedge(0, SUMMIT_Y, 100, 10, "gold_deck")
    beaconSprite = sprites.create(IMG_SPIRE_BEACON, SpriteKind.SpireBeacon)
    beaconSprite.setPosition(0, SUMMIT_Y - 9)
}

// ============================================================================
// CUSTOM RENDERER (CANYON WALLS, CABLE, AIM RETICLE & HUD)
// ============================================================================
game.onPaint(function () {
    const ox = scene.cameraProperty(CameraProperty.Left)
    const oy = scene.cameraProperty(CameraProperty.Top)

    // 1. Industrial Steel Canyon Walls
    screen.fillRect(0, 0, 6, screen.height, 11)
    screen.fillRect(screen.width - 6, 0, 6, screen.height, 11)

    // 2. Aim Reticle or Taut Grapple Cable
    const px = player.x - ox
    const py = player.y - oy

    if (grappleMode == 0) {
        if (lockedTargetRing) {
            // Snap aim line directly to the locked ring & highlight it in green!
            const tx = lockedTargetRing.sprite.x - ox
            const ty = lockedTargetRing.sprite.y - oy
            for (let t = 0.25; t <= 0.85; t += 0.2) {
                screen.setPixel(px + (tx - px) * t, py + (ty - py) * t, 7)
            }
            screen.drawRect(tx - 6, ty - 6, 13, 13, 7)
        } else {
            for (let d = 12; d <= 52; d += 12) {
                const ax = px + Math.cos(aimAngle) * d
                const ay = py + Math.sin(aimAngle) * d
                screen.setPixel(ax, ay, 5)
            }
            const tipX = px + Math.cos(aimAngle) * 56
            const tipY = py + Math.sin(aimAngle) * 56
            screen.drawCircle(tipX, tipY, 2, 5)
        }
    } else {
        const hx = hookX - ox
        const hy = hookY - oy
        screen.drawLine(px, py, hx, hy, 5)
        screen.fillRect(hx - 1, hy - 1, 3, 3, 1)
    }

    // 3. Top-Right Altitude & Peak HUD
    const alt = Math.max(0, Math.round(-player.y / PPM))
    screen.fillRect(82, 2, 76, 19, 15)
    screen.print("ALT: " + alt + "m", 85, 4, 5)
    screen.print("PEAK:" + bestAlt + "m", 85, 12, 7)

    // 4. Bottom Feedback Toast
    if (toastTimer > 0 && toastText.length > 0) {
        screen.fillRect(4, screen.height - 13, screen.width - 8, 11, 15)
        screen.print(toastText, 7, screen.height - 11, 7)
    }
})

// ============================================================================
// INITIALIZE & START THE IRON SEAT
// ============================================================================
scene.setBackgroundColor(12)
buildWorld()

player = sprites.create(IMG_CHAIR_RIGHT, SpriteKind.Player)
player.setPosition(0, -10)
player.ay = GRAVITY

showToast("Just Hold A to Auto-Target & Swing!")