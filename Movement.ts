/**
 * 1. MOVEMENT SYSTEM — THE IRON SEAT (EASY & FORGIVING SWINGING EDITION)
 * Platform: Microsoft MakeCode Arcade (Static TypeScript / JavaScript)
 *
 * CONTROLS:
 * - A Button (Hold): Auto-targets the best ring, grapples & swings automatically!
 * - D-Pad (Left / Right): Steer your aim or pump extra swing speed
 * - D-Pad (Up / Down): Winch cable shorter / longer while swinging (or glide mid-air!)
 * - B Button: Return to Base Camp without losing your Peak altitude record
 */

namespace SpriteKind {
    export const Anchor = SpriteKind.create()
    export const Ledge = SpriteKind.create()
    export const Bumper = SpriteKind.create()
    export const SpireBeacon = SpriteKind.create()
}

// ============================================================================
// EASY PHYSICS & WORLD CONSTANTS (0m to 500m)
// ============================================================================
const PPM = 4
const SUMMIT_M = 500
const SUMMIT_Y = -SUMMIT_M * PPM // -2000

const GRAVITY = 195          // Gentle, floaty gravity for easy timing
const MAX_CABLE = 115        // Extra-long grappling cable reach
const MIN_CABLE = 16
const HOOK_SPEED = 620       // Fast, snappy hook projectile
const WINCH_SPEED = 105
const SWING_THRUST = 580

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
let aimAngle = -Math.PI / 2 // Default straight up so pressing A always grabs overhead!
let hasAimInput = false
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
// CONTROLLER INPUT HANDLERS
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
    showToast("Base Camp: Hold A to grapple & swing!")
}

// ============================================================================
// 360-DEGREE SMART AUTO-TARGETING (NO PRECISE AIMING NEEDED!)
// ============================================================================
function findBestTargetRing(): RingData {
    let bestRing: RingData = null
    let bestScore = -9999
    const aimDx = Math.cos(aimAngle)
    const aimDy = Math.sin(aimAngle)

    for (let r of rings) {
        // Don't re-lock onto the exact same ring we just let go of unless it's the only one
        const dx = r.sprite.x - player.x
        const dy = r.sprite.y - player.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist > 6 && dist <= MAX_CABLE) {
            const dot = (dx / dist) * aimDx + (dy / dist) * aimDy

            // If player isn't holding a direction, search full 360° and strongly favor rings ABOVE the player!
            if (!hasAimInput || dot > -0.25) {
                const heightBonus = -dy * 1.4 // Prefer higher rings so you naturally climb upward
                const dirBonus = hasAimInput ? dot * 90 : 0
                const score = heightBonus + dirBonus - dist * 0.35
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
    if (grappleMode == 2) {
        // Forgiving automatic upward hop when letting go so you always reach the next ring!
        if (player.vy > -75) {
            player.vy = -95
        } else {
            player.vy *= 1.25
        }
        player.vx *= 1.15
    }
    grappleMode = 0
    latchedRing = null
}

function latchOnto(lx: number, ly: number, ringObj: RingData) {
    const clutchSave = !grounded && player.vy > 95

    grappleMode = 2
    hookX = lx
    hookY = ly
    latchedRing = ringObj
    emberTimer = 0

    const dist = Math.sqrt((lx - player.x) ** 2 + (ly - player.y) ** 2)
    cableLength = Math.max(24, Math.min(MAX_CABLE, dist - 12))

    if (clutchSave) {
        midAirSaves++
        const dir = player.x < lx ? 1 : -1
        player.vx += dir * Math.min(140, player.vy * 0.45)
        player.vy = Math.min(player.vy, -40)
        music.playTone(980, 75)
        showToast("Mid-air catch! Saved!")
    } else {
        const swingDir = lx >= player.x ? 1 : -1
        if (Math.abs(player.vx) < 80) {
            player.vx += swingDir * 90
        }
        player.vy = Math.min(player.vy, -60)
        music.playTone(ringObj ? 780 : 340, 45)
    }
}

// ============================================================================
// MAIN PHYSICS, EASY SWINGING & CAMERA LOOP
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
            if (emberTimer >= 3.5) {
                music.playTone(190, 60)
                releaseGrapple()
            }
        }
    }

    // --- B. Easy Aiming, Auto-Swinging & Mid-Air Steering ---
    const ix = controller.dx(1)
    const iy = controller.dy(1)

    if (grappleMode == 0) {
        if (ix != 0 || iy != 0) {
            hasAimInput = true
            aimAngle = Math.atan2(iy, ix)
            if (ix < 0) player.setImage(IMG_CHAIR_LEFT)
            else if (ix > 0) player.setImage(IMG_CHAIR_RIGHT)
        } else {
            hasAimInput = false
            aimAngle = -Math.PI / 2 // Reset default aim upward
        }
        lockedTargetRing = findBestTargetRing()

        if (grounded) {
            player.vx += ix * 180 * dt
            player.vx *= 0.85
        } else if (ix != 0) {
            // Gentle mid-air steering so you can line up with rings easily!
            player.vx += ix * 140 * dt
        }
    } else if (grappleMode == 2) {
        lockedTargetRing = null
        if (iy < 0) {
            cableLength = Math.max(MIN_CABLE, cableLength - WINCH_SPEED * dt)
        } else if (iy > 0) {
            cableLength = Math.min(MAX_CABLE, cableLength + WINCH_SPEED * dt)
        } else if (cableLength > 34) {
            // Gently reel you up while swinging so you steadily gain height!
            cableLength -= 18 * dt
        }

        const rx = player.x - hookX
        const ry = player.y - hookY
        const rLen = Math.max(1, Math.sqrt(rx * rx + ry * ry))
        const tx = -ry / rLen
        const ty = rx / rLen

        if (ix != 0) {
            player.vx += (tx * ix * SWING_THRUST + ix * 200) * dt
            player.vy += ty * ix * SWING_THRUST * dt
            if (ix < 0) player.setImage(IMG_CHAIR_LEFT)
            else player.setImage(IMG_CHAIR_RIGHT)
        } else {
            // Smooth automatic pendulum swing even without D-Pad input
            const autoDir = player.vx >= 0 ? 1 : -1
            player.vx += tx * autoDir * 190 * dt
            player.vy += ty * autoDir * 190 * dt
        }
    }

    // --- C. Gentle Stratosphere Crosswind (Biome IV: >= 390m) ---
    if (currentAlt >= 390 && !grounded) {
        player.vx += Math.sin(elapsed * 0.85) * 40 * dt
    }

    // --- D. Grapple Projectile Flight (Generous 18px Capture Radius) ---
    if (grappleMode == 1) {
        hookX += hookVx * dt
        hookY += hookVy * dt

        if (Math.sqrt((hookX - player.x) ** 2 + (hookY - player.y) ** 2) >= MAX_CABLE) {
            grappleMode = 0
        } else {
            let hit = false
            for (let r of rings) {
                if (Math.sqrt((hookX - r.sprite.x) ** 2 + (hookY - r.sprite.y) ** 2) <= 18) {
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
            player.vy = Math.min(-185, ny * 220)
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

    // Cap max fall speed so falls are always easy to catch!
    if (player.vy > 210) {
        player.vy = 210
    }

    if (grappleMode != 2) {
        player.vx *= 0.992
        player.vy *= 0.996
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