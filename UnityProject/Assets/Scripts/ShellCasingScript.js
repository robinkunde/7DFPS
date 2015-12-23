/*
This script controls the physics behavior of shellcasings and unfired bullets. Part of this behavior is a "glinting" of the object at random intervals.

General notes of about code:

1. CollisionSound() should probably be inlined for performance reasons.
2. For some reason collisions are handled in 2 different places. Since the tweaks in FixedUpdate() are dependent on collisions anyway, I don't know why they can't be applied inside OnCollisionEnter().
3. Rigidbody component is attached to the bullets/casings when they are spawned as part of a pile or ejected from the gun.
4. Unity's physics engine isn't granular enough for small objects like bullets and casings, so without the extra code in fixedUpdate(), these objects can fall through then floor.
*/

#pragma strict

// outlets

var sound_shell_bounce : AudioClip[];

// state

@HideInInspector
// Is the collision complete?
var collided = false;
// End position from last physics update.
private var old_pos : Vector3;
// Used to limit length of physics simulation.
private var life_time = 0.0;
// Glint variables.
private var glint_delay    = 0.0;
private var glint_progress = 0.0;
private var glint_light    : Light;

// Play random sound from array with volume relative to global sound volume.
function PlaySoundFromGroup(group : AudioClip[], volume : float) {
    var which_shot = Random.Range(0, group.length);
    audio.PlayOneShot(group[which_shot], volume * PlayerPrefs.GetFloat("sound_volume", 1.0));
}

// Record start position for physics and disable glint light.
function Start() {
    old_pos = transform.position;
    // ligth_pos comes from the prefab and is only attached to rounds, not casings
    if (transform.FindChild("light_pos")) {
        glint_light         = transform.FindChild("light_pos").GetComponent(Light);
        glint_light.enabled = false;
    }
}

// Play collision sound once.
function CollisionSound() {
    if (!collided) {
        collided = true;
        PlaySoundFromGroup(sound_shell_bounce, 0.3);
    }
}

function FixedUpdate() {
    // Perform physics for until life_time reaches threshold.
    if (rigidbody && !rigidbody.IsSleeping() && collider && collider.enabled) {
        life_time += Time.deltaTime;
        var hit : RaycastHit;
        // If the object collides with any collidable objects, set position to position of hit and invert and scale velocity.
        if (Physics.Linecast(old_pos, transform.position, hit, 1)) {
            // This is to prevent the bullets from falling through the floor.
            transform.position = hit.point;
            // This appears to be an aestetic choice. On collision, shells will bounce in the opposite direction and settle much faster.
            transform.rigidbody.velocity *= -0.3;
        }
        // Stop physics calculations after 2 seconds. This means the bullets might sometimes come to rest in midair. (Bug)
        if (life_time > 2.0) {
            rigidbody.Sleep();
        }
    }

    // Compute gling for resting objects.
    if (rigidbody && rigidbody.IsSleeping() && glint_light) {
        if (glint_delay == 0.0) {
            glint_delay = Random.Range(1.0, 5.0);
        }
        glint_delay = Mathf.Max(0.0, glint_delay - Time.deltaTime);
        if (glint_delay == 0.0) {
            glint_progress = 1.0;
        }
        // Perform glint on a sine wave in 1s.
        if (glint_progress > 0.0) {
            glint_light.enabled   = true;
            glint_light.intensity = Mathf.Sin(glint_progress * Mathf.PI);
            glint_progress        = Mathf.Max(0.0, glint_progress - Time.deltaTime * 2.0);
        } else {
            glint_light.enabled = false;
        }
    }
    old_pos = transform.position;
}

// TODO: remove parameter since it's not used and it has a performance impact
function OnCollisionEnter(collision : Collision) {
    CollisionSound();
}
