/*
This script governs the behavior of turrets and kill drones.

General notes:
1. There was a hint here that kill drones were supposed to return to their orginal position after losing track of the player, but it's no implemented.
2. Robots bullets are faster than player bullets.
3. Drone can take damage from collisions, if their speed is high enough. In practice, that threshold doesn't seem to be ever met though, unless it falls from a great height.

*/
#pragma strict

// outlets

enum RobotType {SHOCK_DRONE, STATIONARY_TURRET, MOBILE_TURRET, GUN_DRONE};
var robot_type : RobotType;

var sound_gunshot             : AudioClip[];
var sound_damage_camera       : AudioClip[];
var sound_damage_gun          : AudioClip[];
var sound_damage_battery      : AudioClip[];
var sound_damage_ammo         : AudioClip[];
var sound_damage_motor        : AudioClip[];
var sound_bump                : AudioClip[];
var sound_alert               : AudioClip;
var sound_unalert             : AudioClip;
var sound_engine_loop         : AudioClip;
var sound_damaged_engine_loop : AudioClip;

var electric_spark_obj : GameObject;
var muzzle_flash       : GameObject;
var bullet_obj         : GameObject;

// state

private var object_audiosource_motor : GameObject;
private var audiosource_taser        : AudioSource;
private var audiosource_motor        : AudioSource;
private var audiosource_effect       : AudioSource;
private var audiosource_foley        : AudioSource;
private var sound_line_of_sight      = 0.0;

enum AIState {IDLE, ALERT, ALERT_COOLDOWN, AIMING, FIRING, DEACTIVATING, DEAD};
private var ai_state                   : AIState = AIState.IDLE;
private var target_pos                 : Vector3;
// cooldown between shots
private var gun_delay                  = 0.0;
private var alive                      = true;
private var battery_alive              = true;
private var motor_alive                = true;
private var camera_alive               = true;
private var trigger_alive              = true;
private var barrel_alive               = true;
private var ammo_alive                 = true;
private var trigger_down               = false;
private var bullets                    = 15;
// time between moving from alert state to aiming state
private var alert_delay                = 0.0;
// time between moving from cooldown state to idle state
private var alert_cooldown_delay       = 0.0;
private var rotor_speed                = 0.0;
private var top_rotor_rotation         = 0.0;
private var bottom_rotor_rotation      = 0.0;
private var stuck                      = false;
private var stuck_delay                = 0.0;
private var distance_sleep             = false;
// mod related state
private var has_seen_player            = false;
private var local_delta_time           = 0.0;
private var local_time_scale           = 0.0;
var being_aimed_at                     = false;
private var last_frame_aimed_at        = false;

private var rotation_x                 = Spring(0.0, 0.0, 100.0, 0.0001);
private var rotation_y                 = Spring(0.0, 0.0, 100.0, 0.0001);
private var initial_turret_orientation : Quaternion;
private var initial_turret_position    : Vector3;
private var tilt_correction            : Vector3;

private var gun_pivot                  : Transform;
private var mod_controller             : ModController;

// drone
enum CameraPivotState {DOWN, WAIT_UP, UP, WAIT_DOWN};
private var camera_pivot_state = CameraPivotState.WAIT_DOWN;
private var camera_pivot_delay = 0.0;
private var camera_pivot_angle = 0.0;

// constants
private var kAlertDelay         = 0.6;
private var kAlertCooldownDelay = 2.0;
private var kMaxRange           = 20.0;
private var kSleepDistance      = 20.0;

function PlaySoundFromGroup(group : AudioClip[], volume : float) {
    if (group.length == 0) {
        return;
    }

    var which_shot = Random.Range(0, group.length);
    audiosource_effect.PlayOneShot(group[which_shot], volume * PlayerPrefs.GetFloat("sound_volume", 1.0));
}

function GetTurretLightObject() : GameObject {
    return transform.FindChild("gun pivot").FindChild("camera").FindChild("light").gameObject;
}

function GetDroneLightObject() : GameObject {
    return transform.FindChild("camera_pivot").FindChild("camera").FindChild("light").gameObject;
}

function GetDroneLensFlareObject() : GameObject {
    return transform.FindChild("camera_pivot").FindChild("camera").FindChild("lens flare").gameObject;
}

function RandomOrientation() : Quaternion {
    return Quaternion.EulerAngles(Random.Range(0,360),Random.Range(0,360),Random.Range(0,360));
}

function Damage(obj : GameObject) {
    var damage_done = false;
    if (obj.name == "battery" && battery_alive) {
        battery_alive = false;
        camera_alive  = false;
        motor_alive   = false;
        trigger_alive = false;
        if (robot_type == RobotType.SHOCK_DRONE) {
            barrel_alive = false;
        }
        damage_done = true;
        PlaySoundFromGroup(sound_damage_battery, 1.0);
        rotation_x.target_state = 40.0;
    } else if ((obj.name == "pivot motor" || obj.name == "motor") && motor_alive) {
        motor_alive = false;
        damage_done = true;
        PlaySoundFromGroup(sound_damage_motor, 1.0);
    } else if (obj.name == "power cable" && (camera_alive || trigger_alive)) {
        camera_alive  = false;
        trigger_alive = false;
        damage_done   = true;
        PlaySoundFromGroup(sound_damage_battery, 1.0);
    } else if (obj.name == "ammo box" && ammo_alive) {
        ammo_alive  = false;
        damage_done = true;
        PlaySoundFromGroup(sound_damage_ammo, 1.0);
    } else if ((obj.name == "gun" || obj.name == "shock prod") && barrel_alive) {
        barrel_alive = false;
        damage_done  = true;
        PlaySoundFromGroup(sound_damage_gun, 1.0);
    } else if (obj.name == "camera" && camera_alive) {
        camera_alive = false;
        damage_done  = true;
        PlaySoundFromGroup(sound_damage_camera, 1.0);
    } else if (obj.name == "camera armor" && camera_alive) {
        camera_alive = false;
        damage_done  = true;
        PlaySoundFromGroup(sound_damage_camera, 1.0);
    }

    if (damage_done) {
        Instantiate(electric_spark_obj, obj.transform.position, RandomOrientation());
    }
}

function WasShotInternal(obj : GameObject) {
    Damage(obj);
}

function WasShot(obj : GameObject, pos : Vector3, vel : Vector3) {
    // FIXME: should be obj.transform, so this condition is never true
    if (transform.parent && transform.parent.gameObject.name == "gun pivot") {
        var x_axis = transform.FindChild("point_pivot").rotation * Vector3(1, 0, 0);
        var y_axis = transform.FindChild("point_pivot").rotation * Vector3(0, 1, 0);
        var z_axis = transform.FindChild("point_pivot").rotation * Vector3(0, 0, 1);

        var y_plane_vel = Vector3(Vector3.Dot(vel, x_axis), 0.0, Vector3.Dot(vel, z_axis));
        var rel_pos     = pos - transform.FindChild("point_pivot").position;
        var y_plane_pos = Vector3(Vector3.Dot(rel_pos, z_axis), 0.0, -Vector3.Dot(rel_pos, x_axis));
        rotation_y.vel += Vector3.Dot(y_plane_vel, y_plane_pos) * 10.0;

        var x_plane_vel = Vector3(Vector3.Dot(vel, y_axis), 0.0, Vector3.Dot(vel, z_axis));
        rel_pos         = pos - transform.FindChild("point_pivot").position;
        var x_plane_pos = Vector3(-Vector3.Dot(rel_pos, z_axis), 0.0, Vector3.Dot(rel_pos, y_axis));
        rotation_x.vel += Vector3.Dot(x_plane_vel, x_plane_pos) * 10.0;
    }

    var critical_hit_chance = (robot_type == RobotType.SHOCK_DRONE) ? 0.5 : 0.25;
    if (!has_seen_player && mod_controller.HasPerk(Perk.UNSEEN)) {
        critical_hit_chance = 1.0;
    }
    if (Random.Range(0.0, 1.0) < critical_hit_chance) {
        Damage(transform.FindChild("battery").gameObject);
    }

    Damage(obj);
}

function Start() {
    audiosource_effect             = gameObject.AddComponent(AudioSource);
    audiosource_effect.rolloffMode = AudioRolloffMode.Linear;
    audiosource_effect.maxDistance = 30;

    object_audiosource_motor                         = new GameObject("motor audiosource object");
    object_audiosource_motor.transform.parent        = transform;
    object_audiosource_motor.transform.localPosition = Vector3(0, 0, 0);

    audiosource_motor        = object_audiosource_motor.AddComponent(AudioSource);
    audiosource_motor.loop   = true;
    audiosource_motor.volume = 0.4 * PlayerPrefs.GetFloat("sound_volume", 1.0);
    audiosource_motor.clip   = sound_engine_loop;

    object_audiosource_motor.AddComponent(AudioLowPassFilter);

    switch (robot_type) {
        case RobotType.STATIONARY_TURRET:
            gun_pivot                     = transform.FindChild("gun pivot");
            initial_turret_orientation    = gun_pivot.transform.localRotation;
            initial_turret_position       = gun_pivot.transform.localPosition;
            audiosource_motor.rolloffMode = AudioRolloffMode.Linear;
            audiosource_motor.maxDistance = 4;
            break;
        case RobotType.SHOCK_DRONE:
            audiosource_foley             = gameObject.AddComponent(AudioSource);
            audiosource_taser             = gameObject.AddComponent(AudioSource);
            audiosource_taser.rolloffMode = AudioRolloffMode.Linear;
            audiosource_taser.loop        = true;
            audiosource_taser.clip        = sound_gunshot[0];
            audiosource_motor.maxDistance = 8;
            break;
    }

    target_pos  = transform.position;

    //
    mod_controller = GameObject.Find("gui_skin_holder").GetComponent(GUISkinHolder).mod_controller;
    if (mod_controller.HasPerk(Perk.MOONSHOT) && robot_type == RobotType.STATIONARY_TURRET) {
        var constant_force   = gameObject.AddComponent(ConstantForce);
        constant_force.force = mod_controller.GetMoonshotForce(rigidbody.mass);
    }
}

function UpdateStationaryTurret() {
    var turret_light = GetTurretLightObject().light;

    // disable/enable sound and shadows of turrets depending on distance
    if (Vector3.Distance(GameObject.Find("Player").transform.position, transform.position) > kSleepDistance) {
        turret_light.shadows = LightShadows.None;
        if (audiosource_motor.isPlaying) {
            audiosource_motor.Stop();
        }
        return;
    } else {
        if (!audiosource_motor.isPlaying) {
            audiosource_motor.Play();
        }
        audiosource_motor.volume = 0.4 * PlayerPrefs.GetFloat("sound_volume", 1.0);
        if (turret_light.intensity > 0.0) {
            turret_light.shadows = LightShadows.Hard;
        } else {
            turret_light.shadows = LightShadows.None;
        }
    }

    var point_pivot  = transform.FindChild("point_pivot");
    // motor related processing
    if (motor_alive) {
        switch (ai_state) {
            case AIState.IDLE:
                rotation_y.target_state += local_delta_time * 100.0;
                // guard against overflow
                if (rotation_y.target_state > 360.0) {
                    rotation_y.target_state -= 360.0;
                    rotation_y.state        -= 360.0;
                }
                break;
            case AIState.AIMING:
            case AIState.ALERT:
            case AIState.ALERT_COOLDOWN:
            case AIState.FIRING:
                // vector between target and pivot
                var rel_pos = target_pos - point_pivot.position;
                // Calculate the rotation target angle around the pivot's y axis based on pivot orientation.
                // This is an specialized version of the regular formula.
                var target_y = Mathf.Atan2(Vector3.Dot(rel_pos, point_pivot.right), Vector3.Dot(rel_pos, point_pivot.forward)) * Mathf.Rad2Deg;

                // ensure rotation direction is always shortest way to target
                while (target_y > rotation_y.state + 180) {
                    target_y -= 360.0;
                }
                while (target_y < rotation_y.state - 180) {
                    target_y += 360.0;
                }
                rotation_y.target_state = target_y;

                // calculate angle between x-z plane and target y pos
                var target_x            = -Mathf.Asin(Vector3.Dot(rel_pos.normalized, point_pivot.up)) * Mathf.Rad2Deg;
                rotation_x.target_state = Mathf.Clamp(target_x, -40, 40);
                break;
        }
    }

    //
    if (battery_alive) {
        switch (ai_state) {
            case AIState.FIRING:
                trigger_down = true;
                break;
            default:
                trigger_down = false;
                break;
        }
    }

    //
    if (barrel_alive) {
        if (trigger_down && gun_delay <= 0.0) {
            gun_delay += 0.1;
            var point_muzzle_flash = gun_pivot.FindChild("gun").FindChild("point_muzzleflash");
            Instantiate(muzzle_flash, point_muzzle_flash.position, point_muzzle_flash.rotation);
            PlaySoundFromGroup(sound_gunshot, 1.0);

            var bullet = Instantiate(bullet_obj, point_muzzle_flash.position, point_muzzle_flash.rotation);
            bullet.GetComponent(BulletScript).SetVelocity(point_muzzle_flash.forward * 300.0);
            bullet.GetComponent(BulletScript).SetHostile();
            rotation_x.vel += Random.Range(-50, 50);
            rotation_y.vel += Random.Range(-50, 50);
            --bullets;
        }
        if (gun_delay > 0.0 && ammo_alive && bullets > 0) {
            gun_delay -= local_delta_time;
        }
    }

    var danger = 0.0;
    var player = GameObject.Find("Player");
    var dist   = Vector3.Distance(player.transform.position, transform.position);
    if (battery_alive) {
        danger += Mathf.Max(0.0, 1.0 - dist / kMaxRange);
    }

    if (camera_alive) {
        if (danger > 0.0) {
            danger = Mathf.Min(0.2, danger);
        }
        if (ai_state == AIState.AIMING || ai_state == AIState.FIRING) {
            danger = 1.0;
        } else if (ai_state == AIState.ALERT || ai_state == AIState.ALERT_COOLDOWN) {
            danger += 0.5;
        }

        var camera      = transform.FindChild("gun pivot").FindChild("camera");
        rel_pos         = player.transform.position - camera.position;
        var sees_target = false;
        // the camera transform is misaligned in the model/prefab, so -up is actually forward
        // calculate if the the player center point is visible inside a 90 degree FOV
        if (dist < kMaxRange && Vector3.Dot(-camera.transform.up, rel_pos.normalized) > 0.7) {
            var hit:RaycastHit;
            if (!Physics.Linecast(camera.position, player.transform.position, hit, 1<<0)) {
                sees_target     = true;
                has_seen_player = true;
            }
        }

        if (sees_target) {
            switch (ai_state) {
                case AIState.IDLE:
                    ai_state    = AIState.ALERT;
                    alert_delay = kAlertDelay;
                    audiosource_effect.PlayOneShot(sound_alert, 0.3 * PlayerPrefs.GetFloat("sound_volume", 1.0));
                    break;
                case AIState.AIMING:
                    // only fire if the player is within a 50 degree FOV
                    if (Vector3.Dot(-camera.transform.up, rel_pos.normalized) > 0.9) {
                        ai_state = AIState.FIRING;
                    }
                    target_pos = player.transform.position;
                    break;
                case AIState.FIRING:
                    target_pos = player.transform.position;
                    break;
                case AIState.ALERT:
                    alert_delay -= local_delta_time;
                    if (alert_delay <= 0.0) {
                        ai_state = AIState.AIMING;
                    }
                    target_pos = player.transform.position;
                    break;
                case AIState.ALERT_COOLDOWN:
                    ai_state    = AIState.ALERT;
                    alert_delay = kAlertDelay;
                    break;
            }
        } else {
            switch (ai_state) {
                case AIState.AIMING:
                case AIState.FIRING:
                case AIState.ALERT:
                    ai_state             = AIState.ALERT_COOLDOWN;
                    alert_cooldown_delay = kAlertCooldownDelay;
                    break;
                case AIState.ALERT_COOLDOWN:
                    alert_cooldown_delay -= local_delta_time;
                    if (alert_cooldown_delay <= 0.0) {
                        ai_state = AIState.IDLE;
                        audiosource_effect.PlayOneShot(sound_unalert, 0.3 * PlayerPrefs.GetFloat("sound_volume", 1.0));
                    }
                    break;
            }
        }
        switch (ai_state) {
            case AIState.IDLE:
                turret_light.color = Color(0, 0, 1);
                break;
            case AIState.AIMING:
                turret_light.color = Color(1, 0, 0);
                break;
            case AIState.ALERT:
            case AIState.ALERT_COOLDOWN:
                turret_light.color = Color(1, 1, 0);
                break;
        }
    } else {
        turret_light.intensity *= Mathf.Pow(0.01, local_delta_time);
    }
    player.GetComponent(MusicScript).AddDangerLevel(danger);

    // adjust motor pitch depending on rotation speed
    var target_pitch        = (Mathf.Abs(rotation_y.vel) + Mathf.Abs(rotation_x.vel)) * 0.01;
    target_pitch            = Mathf.Clamp(target_pitch, 0.2, 2.0);
    audiosource_motor.pitch = Mathf.Lerp(audiosource_motor.pitch, target_pitch, Mathf.Pow(0.0001, local_delta_time));

    //
    rotation_x.Update();
    rotation_y.Update();
    gun_pivot.localRotation = initial_turret_orientation;
    gun_pivot.localPosition = initial_turret_position;
    gun_pivot.RotateAround(
        point_pivot.position,
        point_pivot.forward,
        rotation_x.state);
    gun_pivot.RotateAround(
        point_pivot.position,
        point_pivot.up,
        rotation_y.state);
}

function UpdateDrone() {
    var drone_light = GetDroneLightObject();

    if (Vector3.Distance(GameObject.Find("Player").transform.position, transform.position) > kSleepDistance) {
        drone_light.light.shadows = LightShadows.None;
        if (motor_alive) {
            distance_sleep = true;
            rigidbody.Sleep();
        }
        if (audiosource_motor.isPlaying) {
            audiosource_motor.Stop();
        }
        return;
    } else {
        if (drone_light.light.intensity > 0.0) {
            drone_light.light.shadows = LightShadows.Hard;
        } else {
            drone_light.light.shadows = LightShadows.None;
        }
        if (motor_alive && distance_sleep) {
            rigidbody.WakeUp();
            distance_sleep = false;
        }
        if (!audiosource_motor.isPlaying) {
            audiosource_motor.volume = PlayerPrefs.GetFloat("sound_volume", 1.0);
            audiosource_motor.Play();
        }
    }

    if (motor_alive) {
        // the following constant and formulas are tuned to create the bobbing movements of drones
        var kFlyDeadZone = 0.2;
        var kFlySpeed    = 10.0;

        // get vector to target
        var rel_pos    = target_pos - transform.position;
        // magnify vector to bias towards overshooting target
        var target_vel = rel_pos / kFlyDeadZone;
        // clamp to maximum magnitude of 1
        if (target_vel.magnitude > 1.0) {
            target_vel = target_vel.normalized;
        }

        // multiply base speed
        target_vel *= kFlySpeed;
        // get delta between desired vector and physics vector
        var target_accel = target_vel - rigidbody.velocity;
        // reduce to drifting speed in idle state
        if (ai_state == AIState.IDLE) {
            target_accel *= 0.1;
        } else if (ai_state == AIState.FIRING && mod_controller.HasPerk(Perk.BROWNOUT)) {
            target_accel *= 0.0;
        }
        // base upward acceleration against gravity
        target_accel.y -= Physics.gravity.y;

        rotor_speed = Mathf.Clamp(target_accel.magnitude, 0.0, 14.0);

        //
        var correction_vec   : Vector3;
        var correction_angle : float;
        Quaternion.FromToRotation(transform.up, target_accel.normalized).ToAngleAxis(correction_angle, correction_vec);
        tilt_correction  = correction_vec * correction_angle;
        tilt_correction -= rigidbody.angularVelocity;

        //
        if (ai_state == AIState.IDLE) {
            tilt_correction += transform.up;
            tilt_correction *= 0.1;
        } else {
            var target_y = Mathf.Atan2(Vector3.Dot(rel_pos, transform.right), Vector3.Dot(rel_pos, transform.forward)) * Mathf.Rad2Deg;
            while (target_y > 180.0) {
                target_y -= 360.0;
            }
            while (target_y < -180.0) {
                target_y += 360.0;
            }
            tilt_correction += transform.up * target_y;
            tilt_correction *= 5.0;
        }

        if (rigidbody.velocity.magnitude < 0.2) {
            stuck_delay += local_delta_time;
            if (stuck_delay > 1.0) {
                target_pos  = transform.position + Vector3(Random.Range(-1.0, 1.0), Random.Range(-1.0, 1.0), Random.Range(-1.0, 1.0));
                stuck_delay = 0.0;
            }
        } else {
            stuck_delay = 0.0;
        }
    } else {
        rotor_speed           = Mathf.Max(0.0, rotor_speed - local_delta_time * 5.0);
        rigidbody.angularDrag = 0.05;
    }

    if (barrel_alive && ai_state == AIState.FIRING) {
        audiosource_taser.volume = PlayerPrefs.GetFloat("sound_volume", 1.0);
        if (!audiosource_taser.isPlaying) {
            audiosource_taser.Play();
        }
        if (gun_delay <= 0.0) {
            gun_delay = 0.1;
            Instantiate(muzzle_flash, transform.FindChild("point_spark").position, RandomOrientation());
            if (Vector3.Distance(transform.FindChild("point_spark").position, GameObject.Find("Player").transform.position) < 1) {
                GameObject.Find("Player").GetComponent(AimScript).Shock();
            }
        }
    } else {
        audiosource_taser.Stop();
    }
    gun_delay = Mathf.Max(0.0, gun_delay - local_delta_time);

    top_rotor_rotation                                              += rotor_speed * local_delta_time * 1000.0;
    bottom_rotor_rotation                                           -= rotor_speed * local_delta_time * 1000.0;
    var render_rotors                                               = (rotor_speed * local_time_scale) < 7.0;
    transform.FindChild("bottom rotor").gameObject.renderer.enabled = render_rotors;
    transform.FindChild("top rotor").gameObject.renderer.enabled    = render_rotors;
    transform.FindChild("bottom rotor").localEulerAngles.y          = bottom_rotor_rotation;
    transform.FindChild("top rotor").localEulerAngles.y             = top_rotor_rotation;

    if (camera_alive) {
        if (ai_state == AIState.IDLE) {
            switch (camera_pivot_state) {
                case CameraPivotState.DOWN:
                    camera_pivot_angle += local_delta_time * 25.0;
                    if (camera_pivot_angle > 50) {
                        camera_pivot_angle = 50;
                        camera_pivot_state = CameraPivotState.WAIT_UP;
                        camera_pivot_delay = 0.2;
                    }
                    break;
                case CameraPivotState.UP:
                    camera_pivot_angle -= local_delta_time * 25.0;
                    if (camera_pivot_angle < 0) {
                        camera_pivot_angle = 0;
                        camera_pivot_state = CameraPivotState.WAIT_DOWN;
                        camera_pivot_delay = 0.2;
                    }
                    break;
                case CameraPivotState.WAIT_DOWN:
                    camera_pivot_delay -= local_delta_time;
                    if (camera_pivot_delay < 0) {
                        camera_pivot_state = CameraPivotState.DOWN;
                    }
                    break;
                case CameraPivotState.WAIT_UP:
                    camera_pivot_delay -= local_delta_time;
                    if (camera_pivot_delay < 0) {
                        camera_pivot_state = CameraPivotState.UP;
                    }
                    break;
            }
        } else {
            camera_pivot_angle -= local_delta_time * 25.0;
            if (camera_pivot_angle < 0) {
                camera_pivot_angle = 0;
            }
        }

        var cam_pivot                = transform.FindChild("camera_pivot");
        cam_pivot.localEulerAngles.x = camera_pivot_angle;
        var player                   = GameObject.Find("Player");
        var dist                     = Vector3.Distance(player.transform.position, transform.position);
        var danger                   = Mathf.Max(0.0, 1.0 - dist / kMaxRange);
        if (danger > 0.0) {
            danger = Mathf.Min(0.2, danger);
        }
        if (ai_state == AIState.AIMING || ai_state == AIState.FIRING) {
            danger = 1.0;
        } else if (ai_state == AIState.ALERT || ai_state == AIState.ALERT_COOLDOWN) {
            danger += 0.5;
        }
        player.GetComponent(MusicScript).AddDangerLevel(danger);

        var camera      = cam_pivot.FindChild("camera");
        rel_pos         = player.transform.position - camera.position;
        var sees_target = false;
        if (dist < kMaxRange && Vector3.Dot(-camera.transform.up, rel_pos.normalized) > 0.7) {
            var hit:RaycastHit;
            if (!Physics.Linecast(camera.position, player.transform.position, hit, 1<<0)) {
                sees_target     = true;
                has_seen_player = true;
            }
        }

        if (sees_target) {
            var new_target = player.transform.position + player.GetComponent(CharacterMotor).GetVelocity() *
                             Mathf.Clamp(Vector3.Distance(player.transform.position, transform.position) * 0.1, 0.5, 1.0);
            switch (ai_state) {
                case AIState.IDLE:
                    ai_state    = AIState.ALERT;
                    alert_delay = kAlertDelay;
                    audiosource_effect.PlayOneShot(sound_alert, 0.3 * PlayerPrefs.GetFloat("sound_volume", 1.0));
                    break;
                case AIState.AIMING:
                    target_pos = new_target;
                    if (Vector3.Distance(transform.position, target_pos) < 4) {
                        ai_state = AIState.FIRING;
                    }
                    target_pos.y += 1.0;
                    break;
                case AIState.FIRING:
                    target_pos = new_target;
                    if (Vector3.Distance(transform.position, target_pos) > 4) {
                        ai_state = AIState.AIMING;
                    }
                    break;
                case AIState.ALERT:
                    target_pos    = new_target;
                    target_pos.y += 1.0;
                    alert_delay  -= local_delta_time;
                    if (alert_delay <= 0.0) {
                        ai_state = AIState.AIMING;
                    }
                    break;
                case AIState.ALERT_COOLDOWN:
                    ai_state    = AIState.ALERT;
                    alert_delay = kAlertDelay;
                    break;
            }
        } else {
            switch (ai_state) {
                case AIState.AIMING:
                case AIState.FIRING:
                case AIState.ALERT:
                    ai_state             = AIState.ALERT_COOLDOWN;
                    alert_cooldown_delay = kAlertCooldownDelay;
                    break;
                case AIState.ALERT_COOLDOWN:
                    alert_cooldown_delay -= local_delta_time;
                    if (alert_cooldown_delay <= 0.0) {
                        ai_state = AIState.IDLE;
                        audiosource_effect.PlayOneShot(sound_unalert, 0.3 * PlayerPrefs.GetFloat("sound_volume", 1.0));
                    }
                    break;
            }
        }
        switch (ai_state) {
            case AIState.IDLE:
                drone_light.light.color = Color(0.0, 0.0, 1.0);
                break;
            case AIState.AIMING:
                drone_light.light.color = Color(1.0, 0.0, 0.0);
                break;
            case AIState.ALERT:
            case AIState.ALERT_COOLDOWN:
                drone_light.light.color = Color(1.0, 1.0, 0.0);
                break;
        }
    } else {
        drone_light.light.intensity *= Mathf.Pow(0.01, local_delta_time);
    }
    var lens_flare : LensFlare = GetDroneLensFlareObject().GetComponent(LensFlare);
    lens_flare.color           = drone_light.light.color;
    lens_flare.brightness      = drone_light.light.intensity;

    //
    var main_camera_position  = GameObject.Find("Main Camera").transform.position;
    var target_pitch          = rotor_speed * 0.2;
    target_pitch              = Mathf.Clamp(target_pitch, 0.2, 3.0);
    audiosource_motor.pitch   = Mathf.Lerp(audiosource_motor.pitch, target_pitch, Mathf.Pow(0.0001, local_delta_time));

    audiosource_motor.volume  = rotor_speed * 0.1 * PlayerPrefs.GetFloat("sound_volume", 1.0);
    audiosource_motor.volume -= Vector3.Distance(main_camera_position, transform.position) * 0.0125 * PlayerPrefs.GetFloat("sound_volume", 1.0);

    //
    if (Physics.Linecast(transform.position, main_camera_position, hit, 1<<0)) {
        sound_line_of_sight += local_delta_time * 3.0;
    } else {
        sound_line_of_sight -= local_delta_time * 3.0;
    }
    sound_line_of_sight = Mathf.Clamp(sound_line_of_sight, 0.0, 1.0);

    audiosource_motor.volume                                                  *= 0.5 + sound_line_of_sight * 0.5;
    object_audiosource_motor.GetComponent(AudioLowPassFilter).cutoffFrequency = Mathf.Lerp(5000.0, 44000.0, sound_line_of_sight);
}

function Update() {
    if (being_aimed_at || last_frame_aimed_at) {
        local_delta_time = Time.deltaTime * mod_controller.GetGlacialStareTimeMutliplier();
        local_time_scale = Time.timeScale * mod_controller.GetGlacialStareTimeMutliplier();
    } else {
        local_delta_time = Time.deltaTime;
        local_time_scale = Time.timeScale;
    }
    switch (robot_type) {
        case RobotType.STATIONARY_TURRET:
            UpdateStationaryTurret();
            break;
        case RobotType.SHOCK_DRONE:
            UpdateDrone();
            break;
    }
}

function OnCollisionEnter(collision : Collision) {
    if (robot_type == RobotType.SHOCK_DRONE) {
        var impact_damage_threshold = 10;
        if (mod_controller.HasPerk(Perk.CONSUMER_GRADE)) {
            impact_damage_threshold = mod_controller.GetConsumerGradeDamageThreshold();
        }
        if (collision.impactForceSum.magnitude > impact_damage_threshold) {
            if (Random.Range(0.0, 1.0) < 0.5 && motor_alive) {
                Damage(transform.FindChild("motor").gameObject);
            } else if (Random.Range(0.0, 1.0) < 0.5 && camera_alive) {
                Damage(transform.FindChild("camera_pivot").FindChild("camera").gameObject);
            } else if (Random.Range(0.0, 1.0) < 0.5 && battery_alive) {
                Damage(transform.FindChild("battery").gameObject);
            } else {
                motor_alive = true;
                Damage(transform.FindChild("motor").gameObject);
            }
        } else {
            var which_shot = Random.Range(0, sound_bump.length);
            audiosource_foley.PlayOneShot(sound_bump[which_shot], collision.impactForceSum.magnitude * 0.15 * PlayerPrefs.GetFloat("sound_volume", 1.0));
        }
    }
}

function FixedUpdate() {
    if (robot_type == RobotType.SHOCK_DRONE && !distance_sleep) {
        rigidbody.AddForce(transform.up * rotor_speed, ForceMode.Force);
        if (motor_alive) {
            rigidbody.AddTorque(tilt_correction, ForceMode.Force);
        }
        if ((being_aimed_at || last_frame_aimed_at) && mod_controller.HasPerk(Perk.GLACIAL_STARE)) {
            rigidbody.velocity *= mod_controller.GetGlacialStareTimeMutliplier();
        }
    }
}

function LateUpdate() {
    last_frame_aimed_at = being_aimed_at;
    being_aimed_at = false;
}
