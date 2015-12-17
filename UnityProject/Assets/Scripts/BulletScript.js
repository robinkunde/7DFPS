/*
This script governs the behavior of all bullets in the game.

Notes:
1. Ricocheting creates a new bullet object that acts independently, while the original that spwaned it slowly expires. It looks to me like this was done mainly to simplify handling of the tracer lines.
2. The "hostile" setting influences bullet sounds only. So the player can theoretically die from their own ricochets.
3. The line renderer used for the trail is a bit overkill given how short each trail is visible.

*/

#pragma strict

// outlets
var sound_hit_concrete    : AudioClip[];
var sound_hit_metal       : AudioClip[];
var sound_hit_glass       : AudioClip[];
var sound_hit_body        : AudioClip[];
var sound_hit_ricochet    : AudioClip[];
var sound_glass_break     : AudioClip[];
var sound_flyby           : AudioClip[];
var bullet_obj            : GameObject;
var bullet_hole_obj       : GameObject;
var glass_bullet_hole_obj : GameObject;
var metal_bullet_hole_obj : GameObject;
var spark_effect          : GameObject;
var puff_effect           : GameObject;

// state
private var last_pos;
private var hit_something = false;
private var line_renderer : LineRenderer;
private var velocity      : Vector3;
private var life_time     = 0.0;
private var death_time    = 0.0;
private var segment       = 1;
private var hostile       = false;

function SetVelocity(vel : Vector3) {
    this.velocity = vel;
}

function SetHostile() {
    audio.rolloffMode = AudioRolloffMode.Logarithmic;
    PlaySoundFromGroup(sound_flyby, 0.4);
    hostile = true;
}

function Start () {
    line_renderer = GetComponent(LineRenderer);
    line_renderer.SetPosition(0, transform.position);
    line_renderer.SetPosition(1, transform.position);
    last_pos = transform.position;
}

function RecursiveHasScript(obj : GameObject, script : String, depth : int) : MonoBehaviour {
    if (obj.GetComponent(script)) {
        return obj.GetComponent(script);
    } else if (depth > 0 && obj.transform.parent) {
        return RecursiveHasScript(obj.transform.parent.gameObject, script, depth - 1);
    } else {
        return null;
    }
}

static function RandomOrientation() : Quaternion {
    return Quaternion.EulerAngles(Random.Range(0, 360), Random.Range(0, 360), Random.Range(0, 360));
}

function PlaySoundFromGroup(group : AudioClip[], volume : float) {
    var which_shot = Random.Range(0, group.length);
    audio.PlayOneShot(group[which_shot], volume * PlayerPrefs.GetFloat("sound_volume", 1.0));
}

function Update () {
    life_time += Time.deltaTime;
    if (!hit_something) {
        if (life_time > 1.5) {
            hit_something = true;
        }
        transform.position += velocity * Time.deltaTime;
        velocity           += Physics.gravity * Time.deltaTime;
        var hit: RaycastHit;
        if (Physics.Linecast(last_pos, transform.position, hit, 1<<0 | 1<<9 | 1<<11)) {
            hit_something                   = true;
            transform.position              = hit.point;
            var hit_obj                     = hit.collider.gameObject;
            var turret_script : RobotScript = RecursiveHasScript(hit_obj, "RobotScript", 3);
            // The normal of the hit always extends from the surface of the collider that was hit.
            // Therefore, the dot product is always negative.
            var ricochet_amount = Vector3.Dot(velocity.normalized, hit.normal) * -1.0;
            // The smaller the angle between normal and bullet vector, the smaller the chance of ricochet. Also, if the
            // resulting velocity is too small, don't bother.
            if (Random.Range(0.0, 1.0) > ricochet_amount && velocity.magnitude * (1.0 - ricochet_amount) > 10.0) {
                // Instantiate separate ricochet bullet.
                var ricochet     = Instantiate(bullet_obj, hit.point, transform.rotation);
                var ricochet_vel = velocity * 0.3 * (1.0 - ricochet_amount);
                ricochet_vel     = Vector3.Reflect(ricochet_vel, hit.normal);
                ricochet.GetComponent(BulletScript).SetVelocity(ricochet_vel);
                PlaySoundFromGroup(sound_hit_ricochet, hostile ? 1.0 : 0.6);
                // The original bullet won't move after this, but the remaining velocity is used for impact calculations below.
                velocity -= ricochet_vel;
            }
            // non-ricochet hits above a certain speed have the chance to do internal damage
            else if (turret_script && velocity.magnitude > 100.0) {
                var new_hit: RaycastHit;
                if (Physics.Linecast(hit.point + velocity.normalized * 0.001, hit.point + velocity.normalized, new_hit, 1<<11 | 1<<12)) {
                    if (new_hit.collider.gameObject.layer == 12) {
                        turret_script.WasShotInternal(new_hit.collider.gameObject);
                    }
                }
            }

            // hits will transfer a certain amount of force to the object
            var hit_rigidbody = hit.transform.gameObject.rigidbody;
            if (hit_rigidbody) {
                hit_rigidbody.AddForceAtPosition(velocity * 0.01, hit.point, ForceMode.Impulse);
            }
            var light_script : ShootableLight = RecursiveHasScript(hit_obj, "ShootableLight", 1);
            if (light_script) {
                light_script.WasShot(hit_obj, hit.point, velocity);
                if (hit.collider.material.name == "glass (Instance)") {
                    PlaySoundFromGroup(sound_glass_break, 1.0);
                }
            }
            if (velocity.magnitude > 50) {
                var hole:       GameObject;
                var effect:     GameObject;
                var aim_script: AimScript = RecursiveHasScript(hit_obj, "AimScript", 1);
                if (turret_script) {
                    PlaySoundFromGroup(sound_hit_metal, hostile ? 1.0 : 0.8);
                    hole   = Instantiate(metal_bullet_hole_obj, hit.point, RandomOrientation());
                    effect = Instantiate(spark_effect, hit.point, RandomOrientation());
                    turret_script.WasShot(hit_obj, hit.point, velocity);
                } else if (aim_script) {
                    PlaySoundFromGroup(sound_hit_body, 1.0);
                    hole   = Instantiate(bullet_hole_obj, hit.point, RandomOrientation());
                    effect = Instantiate(puff_effect, hit.point, RandomOrientation());
                    aim_script.WasShot();
                } else if (hit.collider.material.name == "metal (Instance)") {
                    PlaySoundFromGroup(sound_hit_metal, hostile ? 1.0 : 0.4);
                    hole   = Instantiate(metal_bullet_hole_obj, hit.point, RandomOrientation());
                    effect = Instantiate(spark_effect, hit.point, RandomOrientation());
                } else if (hit.collider.material.name == "glass (Instance)") {
                    PlaySoundFromGroup(sound_hit_glass, hostile ? 1.0 : 0.4);
                    hole   = Instantiate(glass_bullet_hole_obj, hit.point, RandomOrientation());
                    effect = Instantiate(spark_effect, hit.point, RandomOrientation());
                } else {
                    PlaySoundFromGroup(sound_hit_concrete, hostile ? 1.0 : 0.4);
                    hole   = Instantiate(bullet_hole_obj, hit.point, RandomOrientation());
                    effect = Instantiate(puff_effect, hit.point, RandomOrientation());
                }
                effect.transform.position += hit.normal * 0.05;
                hole.transform.position   += hit.normal * 0.01;
                if (aim_script) {
                    hole.transform.parent = GameObject.Find("Main Camera").transform;
                } else {
                    hole.transform.parent = hit_obj.transform;
                }
            }
        }
        line_renderer.SetVertexCount(segment + 1);
        line_renderer.SetPosition(segment, transform.position);
        ++segment;
    } else {
        death_time += Time.deltaTime;
    }

    var start_color = Color(1, 1, 1, (1.0 - life_time * 5.0) * 0.05);
    var end_color   = Color(1, 1, 1, (1.0 - death_time * 5.0) * 0.05);
    line_renderer.SetColors(start_color, end_color);

    if (death_time > 1.0) {
        Destroy(this.gameObject);
    }
}
