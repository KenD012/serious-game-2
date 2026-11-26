/**
 * 1. MOVEMENT SYSTEM — THE IRON SEAT (Ascent of the Chairbound)
 * Platform: Microsoft MakeCode Arcade (Static TypeScript / JavaScript)
 *
 * CONTROLS:
 * - Mouse Move & Left-Click (Hold): Aim reticle & fire/swing grappling cable
 * - D-Pad (Arrows / WASD): Aim direction (idle) & pump swing / winch cable (attached)
 * - A Button (Hold): Fire grappling hook & swing; release near top of arc to slingshot!
 * - B Button: Return to Base Camp without losing your Peak altitude record
 */

namespace SpriteKind {
    export const Anchor = SpriteKind.create()
    export const Ledge = SpriteKind.create()
    export const Bumper = SpriteKind.create()
    export const SpireBeacon = SpriteKind.create()
}

// ============================================================================
// PHYSICS & WORLD CONSTANTS (0m to 500m)
// ============================================================================
const PPM = 4
const SUMMIT_M = 500
const SUMMIT_Y = -SUMMIT_M * PPM // -2000

const GRAVITY = 260
const MAX_CABLE = 92
const MIN_CABLE = 14
const HOOK_SPEED = 480
const WINCH_SPEED = 88
const SWING_THRUST = 380

// ============================================================================
// DATA STRUCTURES & GAME STATE
// ============================================================================
interface RingData {
    sprite: Sprite
    baseX: number
    baseY: number
    amp: number
    spd: number
    phase: number
    kind: string // "gold" | "cyan" | "ember"
}

interface LedgeData {
    sprite: Sprite
    kind: string // "steel" | "timber" | "ice" | "gold_deck"
}

interface BumperData {
    sprite: Sprite
}

let player: Sprite = null
let beaconSprite: Sprite = null

let rings: RingData[] = []
let ledges: LedgeData[] = []
let bumpers: BumperData[] = []

let grappleMode = 0 // 0 = idle, 1 = shooting, 2 = latched
let hookX = 0
let hookY = 0
let hookVx = 0
let hookVy = 0
let cableLength = 0
let aimAngle = -Math.PI / 4
let lockedTargetRing: RingData = null

let latchedRing: RingData = null
let emberTimer = 0
let grounded = false

let camX = 0
let camY = -40

let bestAlt = 0
let midAirSaves = 0
let won = false

let toastText = ""
let toastTimer = 0

function showToast(msg: string) {
    toastText = msg
    toastTimer = 2.8
}

// ============================================================================
// CONTROLLER & MOUSE INPUT HANDLERS
// ============================================================================
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    shootGrapple()
})

controller.A.onEvent(ControllerButtonEvent.Released, function () {
    releaseGrapple()
})

controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    resetToBaseCamp()
})

function resetToBaseCamp() {
    grappleMode = 0
    latchedRing = null
    lockedTargetRing = null
    player.setPosition(0, -10)
    player.vx = 0
    player.vy = 0
    showToast("Base Camp: Roll & grapple!")
}

// ============================================================================
// SMART LOCK-ON & GRAPPLE SHOOTING, LATCHING & RELEASING
// ============================================================================
function findBestTargetRing(): RingData {
    let bestRing: RingData = null
    let bestScore = -999
    const aimDx = Math.cos(aimAngle)
    const aimDy = Math.sin(aimAngle)

    for (let r of rings) {
        const dx = r.sprite.x - player.x
        const dy = r.sprite.y - player.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 4 && dist <= MAX_CABLE) {
            const dot = (dx / dist) * aimDx + (dy / dist) * aimDy
            // Generous ~140-degree cone (dot > 0.35), preferring aligned & closer rings
            if (dot > 0.35) {
                const score = dot * 120 - dist * 0.4
                if (score > bestScore) {
                    bestScore = score
                    bestRing = r
                }
            }
        }
    }
    return bestRing
}

function shootGrapple() {
    // Snap directly to the locked-on ring if one is highlighted
    let targetAngle = aimAngle
    const bestRing = findBestTargetRing()
    if (bestRing) {
        targetAngle = Math.atan2(bestRing.sprite.y - player.y, bestRing.sprite.x - player.x)
    }

    if (Math.cos(targetAngle) < 0) player.setImage(IMG_CHAIR_LEFT)
    else player.setImage(IMG_CHAIR_RIGHT)

    grappleMode = 1
    hookX = player.x
    hookY = player.y
    hookVx = Math.cos(targetAngle) * HOOK_SPEED
    hookVy = Math.sin(targetAngle) * HOOK_SPEED
    latchedRing = null
    emberTimer = 0
    music.playTone(620, 35)
}

function releaseGrapple() {
    if (grappleMode == 2 && player.vy < -25) {
        // Slingshot upward boost near arc apex
        player.vy *= 1.18
        player.vx *= 1.08
    }
    grappleMode = 0
    latchedRing = null
}

function latchOnto(lx: number, ly: number, ringObj: RingData) {
    const clutchSave = !grounded && player.vy > 120

    grappleMode = 2
    hookX = lx
    hookY = ly
    latchedRing = ringObj
    emberTimer = 0

    const dist = Math.sqrt((lx - player.x) ** 2 + (ly - player.y) ** 2)
    // Pull cable slightly taut on latch so you immediately lift off ledges & start swinging!
    cableLength = Math.max(MIN_CABLE, Math.min(MAX_CABLE, dist - 8))

    if (clutchSave) {
        midAirSaves++
        const dir = player.x < lx ? 1 : -1
        player.vx += dir * Math.min(115, player.vy * 0.4)
        music.playTone(980, 75)
        showToast("Clutch mid-air catch!")
    } else {
        // Give a gentle initial pendulum swing kick toward the anchor if nearly stationary
        if (Math.abs(player.vx) < 25 && ly < player.y) {
            player.vx += (lx >= player.x ? 1 : -1) * 55
            player.vy = Math.min(player.vy, -35)
        }
        music.playTone(ringObj ? 780 : 340, 45)
    }
}

// ============================================================================
// MAIN PHYSICS, SPRING BUMPERS, CROSSWIND & CAMERA LOOP
// ============================================================================
game.onUpdate(function () {
    const dt = game.eventContext().deltaTime
    const elapsed = game.runtime() / 1000
    const currentAlt = Math.max(0, Math.round(-player.y / PPM))

    if (toastTimer > 0) toastTimer -= dt

    // --- A. Oscillating Anchor Rings & Ember Timer ---
    for (let r of rings) {
        if (r.amp > 0) {
            r.sprite.x = r.baseX + Math.sin(elapsed * r.spd + r.phase) * r.amp
        }
    }
    if (grappleMode == 2 && latchedRing) {
        hookX = latchedRing.sprite.x
        hookY = latchedRing.sprite.y
        if (latchedRing.kind == "ember") {
            emberTimer += dt
            if (emberTimer >= 2.8) {
                music.playTone(190, 60)
                releaseGrapple()
            }
        }
    }

    // --- B. Aiming, Winching & Pendulum Swing Thrust ---
    const ix = controller.dx(1)
    const iy = controller.dy(1)

    if (grappleMode == 0) {
        if (ix != 0 || iy != 0) {
            aimAngle = Math.atan2(iy, ix)
            if (ix < 0) player.setImage(IMG_CHAIR_LEFT)
            else if (ix > 0) player.setImage(IMG_CHAIR_RIGHT)
        }
        lockedTargetRing = findBestTargetRing()
        if (grounded) {
            player.vx += ix * 150 * dt
            player.vx *= 0.85
        }
    } else if (grappleMode == 2) {
        lockedTargetRing = null
        if (iy < 0) {
            cableLength = Math.max(MIN_CABLE, cableLength - WINCH_SPEED * dt)
        } else if (iy > 0) {
            cableLength = Math.min(MAX_CABLE, cableLength + WINCH_SPEED * dt)
        }

        const rx = player.x - hookX
        const ry = player.y - hookY
        const rLen = Math.max(1, Math.sqrt(rx * rx + ry * ry))
        // Tangential pendulum vector (counter-clockwise when player is below hook)
        const tx = -ry / rLen
        const ty = rx / rLen

        if (ix != 0) {
            // Combine tangential pendulum pump + direct horizontal impulse for effortless swinging
            player.vx += (tx * ix * SWING_THRUST + ix * 140) * dt
            player.vy += ty * ix * SWING_THRUST * dt
            if (ix < 0) player.setImage(IMG_CHAIR_LEFT)
            else player.setImage(IMG_CHAIR_RIGHT)
        }
    }

    // --- C. Stratosphere Crosswind (Biome IV: >= 390m) ---
    if (currentAlt >= 390 && !grounded) {
        player.vx += Math.sin(elapsed * 0.85) * 70 * dt
    }

    // --- D. Grapple Projectile Flight ---
    if (grappleMode == 1) {
        hookX += hookVx * dt
        hookY += hookVy * dt

        if (Math.sqrt((hookX - player.x) ** 2 + (hookY - player.y) ** 2) >= MAX_CABLE) {
            grappleMode = 0
        } else {
            let hit = false
            for (let r of rings) {
                if (Math.sqrt((hookX - r.sprite.x) ** 2 + (hookY - r.sprite.y) ** 2) <= 15) {
                    latchOnto(r.sprite.x, r.sprite.y, r)
                    hit = true
                    break
                }
            }
            if (!hit) {
                for (let l of ledges) {
                    const hw = l.sprite.width / 2
                    const hh = l.sprite.height / 2
                    if (Math.abs(hookX - l.sprite.x) <= hw && Math.abs(hookY - l.sprite.y) <= hh) {
                        if (l.kind == "ice") {
                            music.playTone(1200, 40)
                            grappleMode = 0
                        } else {
                            latchOnto(hookX, hookY, null)
                        }
                        break
                    }
                }
            }
        }
    }

    // --- E. Taut Cable Circular Constraint ---
    if (grappleMode == 2) {
        const dx = player.x - hookX
        const dy = player.y - hookY
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist > cableLength && dist > 0.01) {
            const nx = dx / dist
            const ny = dy / dist
            const excess = dist - cableLength
            player.x -= nx * excess
            player.y -= ny * excess

            const radialV = player.vx * nx + player.vy * ny
            if (radialV > 0) {
                player.vx -= radialV * nx
                player.vy -= radialV * ny
            }
        }
    }

    // --- F. Brass Spring Bumper Collisions ---
    for (let b of bumpers) {
        const dx = player.x - b.sprite.x
        const dy = player.y - b.sprite.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = 11
        if (dist < minDist && dist > 0.01) {
            const nx = dx / dist
            const ny = dy / dist
            player.x = b.sprite.x + nx * minDist
            player.y = b.sprite.y + ny * minDist
            player.vx = nx * 190
            player.vy = Math.min(-165, ny * 210)
            music.playTone(880, 60)
        }
    }

    // --- G. Solid Ledge Collisions & Canyon Wall Bounds ---
    grounded = false
    for (let l of ledges) {
        const hw = l.sprite.width / 2 + 4
        const hh = l.sprite.height / 2 + 4
        const dx = player.x - l.sprite.x
        const dy = player.y - l.sprite.y

        if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
            const overlapX = hw - Math.abs(dx)
            const overlapY = hh - Math.abs(dy)
            if (overlapY < overlapX) {
                if (dy < 0) {
                    player.y = l.sprite.y - hh
                    if (player.vy > 0) player.vy = 0
                    grounded = true
                    if (l.kind == "ice") player.vx *= 0.99
                    else player.vx *= 0.85
                } else {
                    player.y = l.sprite.y + hh
                    if (player.vy < 0) player.vy = 0
                }
            } else {
                player.x = l.sprite.x + (dx > 0 ? hw : -hw)
                player.vx = 0
            }
        }
    }

    // Keep player inside canyon walls (-74 to +74)
    if (player.x < -74) {
        player.x = -74
        if (player.vx < 0) player.vx = 0
    } else if (player.x > 74) {
        player.x = 74
        if (player.vx > 0) player.vx = 0
    }

    // Preserve pendulum momentum while swinging; only apply air drag when free-falling
    if (grappleMode != 2) {
        player.vx *= 0.994
        player.vy *= 0.997
    }

    // --- H. Peak Altitude & 500m Spire Victory Check ---
    if (currentAlt > bestAlt) {
        bestAlt = currentAlt
    }

    if (currentAlt >= SUMMIT_M && grounded && !won) {
        won = true
        music.baDing.play()
        game.splash("SPIRE CONQUERED!", "500m Reached! Mid-Air Saves: " + midAirSaves)
    }

    // --- I. Smooth Vertical Camera Tracking ---
    camX += (player.x * 0.35 - camX) * 6 * dt
    camY += ((player.y - 16) - camY) * 6 * dt
    scene.centerCameraAt(camX, camY)
})


/**
 * 2. PIXEL-ART SPRITE ASSETS — THE IRON SEAT
 * 16-color pixel art for the aviator armchair climber, gold/cyan/ember rings,
 * brass spring bumpers, and the 500m Spire Beacon.
 */

const IMG_CHAIR_RIGHT = img`
    . . . 5 5 5 . . . . . .
    . . . d d d . . . . . .
    . 4 4 8 8 8 . . . . . .
    . 4 4 8 8 8 5 . . . . .
    . 4 4 4 4 4 4 . . . . .
    . 4 4 c c c 4 . . . . .
    . . 5 1 . 5 1 . . . . .
    . . 1 5 . 1 5 . . . . .
`

const IMG_CHAIR_LEFT = img`
    . . . . . . 5 5 5 . . .
    . . . . . . d d d . . .
    . . . . . . 8 8 8 4 4 .
    . . . . . 5 8 8 8 4 4 .
    . . . . . 4 4 4 4 4 4 .
    . . . . . 4 c c c 4 4 .
    . . . . . 1 5 . 1 5 . .
    . . . . . 5 1 . 5 1 . .
`

const IMG_RING_GOLD = img`
    . . 5 5 5 5 . .
    . 5 4 . . 4 5 .
    5 4 . . . . 4 5
    5 . . . . . . 5
    5 . . . . . . 5
    5 4 . . . . 4 5
    . 5 4 . . 4 5 .
    . . 5 5 5 5 . .
`

const IMG_RING_CYAN = img`
    . . 9 9 9 9 . .
    . 9 8 . . 8 9 .
    9 8 . . . . 8 9
    9 . . . . . . 9
    9 . . . . . . 9
    9 8 . . . . 8 9
    . 9 8 . . 8 9 .
    . . 9 9 9 9 . .
`

const IMG_RING_EMBER = img`
    . . 2 2 2 2 . .
    . 2 4 . . 4 2 .
    2 4 . . . . 4 2
    2 . . . . . . 2
    2 . . . . . . 2
    2 4 . . . . 4 2
    . 2 4 . . 4 2 .
    . . 2 2 2 2 . .
`

const IMG_SPRING_BUMPER = img`
    . . . 5 5 5 5 . . .
    . . 5 1 1 1 1 5 . .
    . 5 1 4 4 4 4 1 5 .
    5 1 4 5 5 5 5 4 1 5
    5 1 4 5 1 1 5 4 1 5
    5 1 4 5 1 1 5 4 1 5
    5 1 4 5 5 5 5 4 1 5
    . 5 1 4 4 4 4 1 5 .
    . . 5 1 1 1 1 5 . .
    . . . 5 5 5 5 . . .
`

const IMG_SPIRE_BEACON = img`
    . . . 1 . . .
    . . 5 1 5 . .
    . . 4 5 4 . .
    . 5 5 5 5 5 .
    . b c c c b .
    . b c c c b .
    b b c c c b b
    b b b b b b b
`




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

    // BIOME I: 0m - 120m (Rusted Foundry)
    addLedge(-44, -26, 44, 7, "timber")
    addLedge(44, -52, 44, 7, "timber")
    addRing(-16, -68, 0, 0, "gold")
    addRing(32, -96, 0, 0, "gold")

    for (let m = 24; m < 120; m += 18) {
        const y = -m * PPM
        const side = Math.round(m / 18) % 2 == 0 ? -1 : 1
        addLedge(side * 46, y, 44, 7, m % 36 == 0 ? "steel" : "timber")
        addRing(side * 14, y - 30, 0, 0, "gold")
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

showToast("D-Pad to Aim & Hold A to Grapple!")