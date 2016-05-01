/*
Main game script.

1. rotation vs view_rotation: The game has two modes of handling camera rotation. When the gun is lowered, inputs are mapped 1:1 to movement of the camera. When aiming, inputs can move the gun in a small zone around the center of the current viewport without causing the viewport to shift.
    Rotation is the abstract representation of the rotation of the aiming gun around the player.
    View_rotation is the abstract representation of the rotation of the viewport around the player.
2. The help text doesn't make this very apparent, but you can quick-insert a magazine by double tapping the respective inventory key.
3. *_delay properties are usually intervals that are decreased every frame.

*/

#pragma strict

// Prefabs

private var magazine_obj       : GameObject;
private var gun_obj            : GameObject;
private var casing_with_bullet : GameObject;

// Outlets

var texture_death_screen : Texture;

var sound_bullet_grab : AudioClip[];
var sound_body_fall   : AudioClip[];
var sound_electrocute : AudioClip[];

var audiosource_tape_background : AudioSource;
var audiosource_audio_content   : AudioSource;

// Shortcuts to components

private var main_camera          : GameObject;
private var character_controller : CharacterController;
private var holder               : GUISkinHolder;
private var weapon_holder        : WeaponHolder;
private var mod_controller       : ModController;

// state

private var show_help          = false;
private var show_advanced_help = false;
private var help_hold_time     = 0.0;
private var help_ever_shown    = false;
private var just_started_help  = false;

// Instances

private var gun_instance : GameObject;

// Private parameters

private var sensitivity_x = 2.0;
private var sensitivity_y = 2.0;
private var min_angle_y   = -89.0;
private var max_angle_y   = 89.0;

// Animation parameters
private var disable_springs = false;
private var disable_recoil  = false;

public class Spring {
    var state        : float;
    var target_state : float;
    var vel          : float;
    var strength     : float;
    var damping      : float;

    public function Spring(state : float, target_state : float, strength : float, damping : float) {
        this.Set(state, target_state, strength, damping);
    }

    public function Set(state : float, target_state : float, strength : float, damping : float) {
        this.state        = state;
        this.target_state = target_state;
        this.strength     = strength;
        this.damping      = damping;
        this.vel          = 0.0;
    }

    public function Update() {
        var linear_springs = false;
        if (linear_springs) {
            this.state = Mathf.MoveTowards(this.state, this.target_state, this.strength * Time.deltaTime * 0.05);
        } else {
            this.vel   += (this.target_state - this.state) * this.strength * Time.deltaTime;
            this.vel   *= Mathf.Pow(this.damping, Time.deltaTime);
            this.state += this.vel * Time.deltaTime;
        }
    }
};

// Game state and params

private var aim_toggle         = false;
private var kAimSpringStrength = 100.0;
private var kAimSpringDamping  = 0.00001;
private var aim_spring         = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);

private var held_flashlight          : GameObject = null;
private var flashlight_aim_pos       : Vector3;
private var flashlight_aim_rot       : Quaternion;

// Spring for holding flashlight in mouth
private var flashlight_mouth_spring  = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);

// Properties for moving flashlight from ground into off hand
private var flash_ground_pose_spring = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);
private var flash_ground_pos         : Vector3;
private var flash_ground_rot         : Quaternion;

private var rotation_x_leeway     = 0.0;
private var rotation_y_min_leeway = 0.0;
private var rotation_y_max_leeway = 0.0;
private var kRotationXLeeway      = 5.0;
private var kRotationYMinLeeway   = 20.0;
private var kRotationYMaxLeeway   = 10.0;

private var rotation_x      = 0.0;
private var rotation_y      = 0.0;
private var view_rotation_x = 0.0;
private var view_rotation_y = 0.0;

private var kRecoilSpringStrength = 800.0;
private var kRecoilSpringDamping  = 0.000001;
private var x_recoil_spring       = new Spring(0, 0, kRecoilSpringStrength, kRecoilSpringDamping);
private var y_recoil_spring       = new Spring(0, 0, kRecoilSpringStrength, kRecoilSpringDamping);
private var head_recoil_spring_x  = new Spring(0, 0, kRecoilSpringStrength, kRecoilSpringDamping);
private var head_recoil_spring_y  = new Spring(0, 0, kRecoilSpringStrength, kRecoilSpringDamping);

private var mag_pos : Vector3;
private var mag_rot : Quaternion;

private var magazine_instance_in_hand :GameObject;
private var kGunDistance              = 0.3;

// Spring for slide pull pose
private var slide_pose_spring            = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);
// Spring for reload pose
private var reload_pose_spring           = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);
private var press_check_pose_spring      = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);
private var inspect_cylinder_pose_spring = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);

// Pose revolver when adding rounds (unused)
private var add_rounds_pose_spring       = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);
private var eject_rounds_pose_spring     = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);

// Spring for objects in off hand
private var hold_pose_spring       = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);

// Properties for moving magazine from ground into off hand
private var mag_ground_pos         : Vector3;
private var mag_ground_rot         : Quaternion;
private var mag_ground_pose_spring = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);

private var left_hand_occupied     = false;
// The vars are used to introduce a delay between a gun firing and the screen shaking from the recoil. Static array to cut down on allocations.
private var kMaxHeadRecoil         = 10;
private var head_recoil_delay      : float[] = new float[kMaxHeadRecoil];
private var next_head_recoil_delay = 0;

enum HandMagStage {HOLD, HOLD_TO_INSERT, EMPTY};
private var mag_stage = HandMagStage.EMPTY;

// List of objects the player grabbed, that are still on their way.
private var collected_rounds = new Array();

// Which inventory slot are we currently interacting with? (-2 means none)
private var target_weapon_slot     = -2;

private var queue_drop             = false;
private var loose_bullets          : Array;
private var loose_bullet_spring    : Array;
private var show_bullet_spring     = new Spring(0, 0, kAimSpringStrength, kAimSpringDamping);

// How long to show loose bullet display. Hide on 0.0.
private var picked_up_bullet_delay = 0.0;

private var head_fall        = 0.0;
private var head_fall_vel    = 0.0;
private var head_tilt        = 0.0;
private var head_tilt_vel    = 0.0;
private var head_tilt_x_vel  = 0.0;
private var head_tilt_y_vel  = 0.0;
private var dead_fade        = 1.0;
private var win_fade         = 0.0;
private var dead_volume_fade = 0.0;
private var dead_body_fell   = false;

private var start_tape_delay = 0.0;
private var stop_tape_delay  = 0.0;
private var tapes_heard      = new Array();
private var tapes_remaining  = new Array();
private var total_tapes      = new Array();
private var tape_in_progress = false;
private var unplayed_tapes   = 0;

private var god_mode             = false;
private var slomo_mode           = false;
private var iddqd_progress       = 0;
private var idkfa_progress       = 0;
private var slomo_progress       = 0;
private var cheat_delay          = 0.0;
private var level_reset_hold     = 0.0;
private var orig_fixedDeltaTime  = 0.02;

enum WeaponSlotType {GUN, MAGAZINE, FLASHLIGHT, EMPTY, EMPTYING};

class WeaponSlot {
    var obj       : GameObject     = null;
    var type      : WeaponSlotType = WeaponSlotType.EMPTY;
    var start_pos : Vector3        = Vector3(0, 0, 0);
    var start_rot : Quaternion     = Quaternion.identity;
    var spring                     = new Spring(1, 1, 100, 0.000001);
};

private var kWeaponSlotNum              = 10;
private var weapon_slots : WeaponSlot[] = new WeaponSlot[kWeaponSlotNum];

private var health = 1.0;
private var dying  = false;
private var dead   = false;
private var won    = false;

// Mod: Perks
private var display_perks     = true;
private var perk_title_index  = 0;
private var kPerkDisplayDelay = 3.0;
private var perk_delay        = kPerkDisplayDelay;

function IsAiming() : boolean {
    return (gun_instance != null && aim_spring.target_state == 1.0);
}

function IsDead() : boolean {
    return dead;
}

/**
 * Bobs the flashlight around when moving.
 */
function StepRecoil(amount : float) {
    x_recoil_spring.vel += Random.Range(100, 400) * amount;
    y_recoil_spring.vel += Random.Range(-200, 200) * amount;
}

function WasShot() {
    head_recoil_spring_x.vel += Random.Range(-400, 400);
    head_recoil_spring_y.vel += Random.Range(-400, 400);
    x_recoil_spring.vel      += Random.Range(-400, 400);
    y_recoil_spring.vel      += Random.Range(-400, 400);
    rotation_x               += Random.Range(-4, 4);
    rotation_y               += Random.Range(-4, 4);
    if (!god_mode && !won) {
        dying = true;
        // % chance of instant death
        if (Random.Range(0.0, 1.0) < 0.3) {
            SetDead(true);
        }
        // % chance of darkening the screen on hit
        if (dead && Random.Range(0.0, 1.0) < 0.3) {
            dead_fade += 0.3;
        }
    }
}

function FallDeath(vel : Vector3) {
    if (!god_mode && !won) {
        SetDead(true);
        head_fall_vel             = vel.y;
        dead_fade                 = Mathf.Max(dead_fade, 0.5);
        head_recoil_spring_x.vel += Random.Range(-400, 400);
        head_recoil_spring_y.vel += Random.Range(-400, 400);
    }
}

function InstaKill() {
    SetDead(true);
    dead_fade = 1.0;
}

function Shock() {
    if (!god_mode && !won) {
        if (!dead) {
            PlaySoundFromGroup(sound_electrocute, 1.0);
        }
        SetDead(true);
    }
    head_recoil_spring_x.vel += Random.Range(-400, 400);
    head_recoil_spring_y.vel += Random.Range(-400, 400);
}

function SetDead(new_dead : boolean) {
    if (new_dead == dead) {
        return;
    }
    dead = new_dead;
    if (dead) {
        GetComponent(MusicScript).HandleEvent(MusicEvent.DEAD);
        head_tilt_vel   = Random.Range(-100, 100);
        head_tilt_x_vel = Random.Range(-100, 100);
        head_tilt_y_vel = Random.Range(-100, 100);
        head_fall       = 0.0;
        head_fall_vel   = 0.0;
        dead_body_fell  = false;
    } else {
        head_tilt_vel   = 0.0;
        head_tilt_x_vel = 0.0;
        head_tilt_y_vel = 0.0;
        head_tilt       = 0.0;
        head_fall       = 0.0;
    }
}

function PlaySoundFromGroup(group : AudioClip[], volume : float) {
    var which_shot = Random.Range(0, group.length);
    audio.PlayOneShot(group[which_shot], volume * PlayerPrefs.GetFloat("sound_volume", 1.0));
}

function AddLooseBullet(spring : boolean) {
    loose_bullets.push(Instantiate(casing_with_bullet));
    var new_spring = new Spring(0.3, 0.3, kAimSpringStrength, kAimSpringDamping);
    loose_bullet_spring.push(new_spring);
    if (spring) {
        new_spring.vel         = 3.0;
        picked_up_bullet_delay = 2.0;
    }
}

function Start() {
    // override params from prefab
    disable_springs = false;
    disable_recoil  = false;

    // get gui instance from scene
    holder             = GameObject.Find("gui_skin_holder").GetComponent(GUISkinHolder);
    weapon_holder      = holder.weapon.GetComponent(WeaponHolder);
    magazine_obj       = weapon_holder.mag_object;
    gun_obj            = weapon_holder.gun_object;
    casing_with_bullet = weapon_holder.bullet_object;
    mod_controller     = holder.mod_controller;

    main_camera          = GameObject.Find("Main Camera").gameObject;
    character_controller = GetComponent(CharacterController);

    // % chance player spawns with flashlight
    if (Random.Range(0.0, 1.0) < 0.35) {
        held_flashlight = Instantiate(holder.flashlight_object);
        Destroy(held_flashlight.rigidbody);
        held_flashlight.GetComponent(FlashlightScript).TurnOn();
        holder.has_flashlight = true;
    }

    // load player start orientation of spawn point rotation
    rotation_x      = transform.rotation.eulerAngles.y;
    view_rotation_x = transform.rotation.eulerAngles.y;

    // Instantiate the gun the player will actually use and disable shadows
    gun_instance  = Instantiate(gun_obj);
    var renderers = gun_instance.GetComponentsInChildren(Renderer);
    for (var renderer : Renderer in renderers){
        renderer.castShadows = false;
    }

    for (var i = 0; i < kMaxHeadRecoil; ++i) {
        head_recoil_delay[i] = -1.0;
    }

    for (i = 0; i < kWeaponSlotNum; ++i) {
        weapon_slots[i] = new WeaponSlot();
    }

    var min_start_bullets = 0;
    var max_start_bullets = 10;
    if (GetGunScript().gun_type == GunType.AUTOMATIC) {
        var num_start_mags = Random.Range(0, 3);
        for (i = 1; i <= num_start_mags; ++i) {
            weapon_slots[i].type                                       = WeaponSlotType.MAGAZINE;
            weapon_slots[i].obj                                        = Instantiate(magazine_obj);
            weapon_slots[i].obj.GetComponent(mag_script).has_been_held = true;
        }
    } else {
        min_start_bullets = 0;
        max_start_bullets = 20;
    }
    if (mod_controller.HasPerk(Perk.SHRAPNEL)) {
        min_start_bullets += 10;
        max_start_bullets += 10;
    }
    var num_start_bullets = Random.Range(min_start_bullets, max_start_bullets);

    loose_bullets       = new Array();
    loose_bullet_spring = new Array();
    for (i = 0; i < num_start_bullets; ++i) {
        AddLooseBullet(false);
    }

    audiosource_tape_background      = gameObject.AddComponent(AudioSource);
    audiosource_tape_background.loop = true;
    audiosource_tape_background.clip = holder.sound_tape_background;

    audiosource_audio_content      = gameObject.AddComponent(AudioSource);
    audiosource_audio_content.loop = false;

    for (var tape in holder.sound_tape_content) {
        total_tapes.push(tape);
    }

    // randomize order of tapes for pickup
    var temp_total_tapes = new Array(total_tapes);
    while (temp_total_tapes.length > 0) {
        var rand_tape_id = Random.Range(0, temp_total_tapes.length);
        tapes_remaining.push(temp_total_tapes[rand_tape_id]);
        temp_total_tapes.RemoveAt(rand_tape_id);
    }

    //
    orig_fixedDeltaTime = Time.fixedDeltaTime;
}

function GunDist() {
    return kGunDistance * (0.5 + PlayerPrefs.GetFloat("gun_distance", 1.0) * 0.5);
}

function AimPos() : Vector3 {
    var aim_dir = AimDir();
    return main_camera.transform.position + aim_dir * GunDist();
}

function AimDir() : Vector3 {
    var aim_rot = Quaternion();
    aim_rot.SetEulerAngles(-rotation_y * Mathf.PI / 180.0, rotation_x * Mathf.PI / 180.0, 0.0);
    return aim_rot * Vector3(0.0, 0.0, 1.0);
}

function GetGunScript() : GunScript {
    return gun_instance.GetComponent(GunScript);
}

/**
 * Linear interpolation for Vector3
 */
function mix(a : Vector3, b : Vector3, val : float) : Vector3 {
    return a + (b - a) * val;
}

/**
 * Linear interpolation for Quaternions(?)
 */
function mix(a : Quaternion, b : Quaternion, val : float) : Quaternion{
    var angle = 0.0;
    var axis  = Vector3();
    (Quaternion.Inverse(b) * a).ToAngleAxis(angle, axis);
    if (angle > 180) {
        angle -= 360;
    }
    if (angle < -180) {
        angle += 360;
    }
    if (angle == 0) {
        return a;
    }
    return a * Quaternion.AngleAxis(angle * -val, axis);
}

/**
 * Check if there are any nearby objects that can be picked up. The method only checks for magazines the player might have dropped and usable bullets. There's no check for flashlights or tapes, since these will always be accompanied by bullets.
 */
function ShouldPickUpNearby() : boolean {
    var colliders        = Physics.OverlapSphere(main_camera.transform.position, 2.0, 1 << 8);
    for (var collider in colliders) {
        // only check for magazines if the current weapon uses them
        if (magazine_obj && collider.gameObject.name == magazine_obj.name+"(Clone)" && collider.gameObject.rigidbody) {
            // Can't pick up magazines if the player is currently holding one
            if (mag_stage == HandMagStage.EMPTY) {
                return true;
            }
        }
        // we check for the presence of a rigidbody here to exclude bullets in the inventory
        else if ((collider.gameObject.name == casing_with_bullet.name || collider.gameObject.name == casing_with_bullet.name+"(Clone)") && collider.gameObject.rigidbody) {
            return true;
        }
    }

    return false;
}

/**
 * This method handles object pickup.
 */
function HandleGetControl() {
    var nearest_mag      = null;
    var nearest_mag_dist = 0.0;

    var grab_range = mod_controller.HasPerk(Perk.SHORT_SLEEVES) ? mod_controller.GetShortSleevesGrabRange() : 2.0;
    var colliders  = Physics.OverlapSphere(main_camera.transform.position, grab_range, 1 << 8);
    for (var collider in colliders) {
        if (!collider.gameObject.rigidbody) {
            continue;
        }

        if (magazine_obj && collider.gameObject.name == (magazine_obj.name + "(Clone)")) {
            var dist = Vector3.Distance(collider.transform.position, main_camera.transform.position);
            if (!nearest_mag || dist < nearest_mag_dist) {
                nearest_mag_dist = dist;
                nearest_mag      = collider.gameObject;
            }
        }
        // TODO: the original bullet should never be available for pickup?
        else if (collider.gameObject.name == casing_with_bullet.name || collider.gameObject.name == (casing_with_bullet.name + "(Clone)")) {
            collected_rounds.push(collider.gameObject);
            collider.gameObject.rigidbody.useGravity = false;
            collider.gameObject.rigidbody.WakeUp();
            collider.enabled = false;
        } else if (collider.gameObject.name == "cassette_tape(Clone)"){
            collected_rounds.push(collider.gameObject);
            collider.gameObject.rigidbody.useGravity = false;
            collider.gameObject.rigidbody.WakeUp();
            collider.enabled = false;
        } else if (!held_flashlight && collider.gameObject.name == "flashlight_object(Clone)") {
            holder.has_flashlight = true;

            held_flashlight = collider.gameObject;
            Destroy(held_flashlight.rigidbody);
            held_flashlight.GetComponent(FlashlightScript).TurnOn();

            flash_ground_pos               = held_flashlight.transform.position;
            flash_ground_rot               = held_flashlight.transform.rotation;
            flash_ground_pose_spring.state = 1.0;
            flash_ground_pose_spring.vel   = 1.0;
        }
    }

    if (nearest_mag && mag_stage == HandMagStage.EMPTY) {
        magazine_instance_in_hand = nearest_mag;
        Destroy(magazine_instance_in_hand.rigidbody);

        var mag_script = magazine_instance_in_hand.GetComponent(mag_script);
        if (!mag_script.has_been_held) {
            mag_script.has_been_held = true;
            mod_controller.DidPickupMag();
        }

        mag_ground_pos                = magazine_instance_in_hand.transform.position;
        mag_ground_rot                = magazine_instance_in_hand.transform.rotation;
        mag_ground_pose_spring.state  = 1.0;
        mag_ground_pose_spring.vel    = 1.0;
        hold_pose_spring.state        = 1.0;
        hold_pose_spring.vel          = 0.0;
        hold_pose_spring.target_state = 1.0;
        mag_stage                     = HandMagStage.HOLD;
    }
}

//
function HandleInventoryControls() : boolean {
    // Since 99% of the time, none of these buttons are pressed, there's little to be gained from changing this to "else if"
    if (Input.GetButtonDown("Holster")) {
        target_weapon_slot = -1;
    }
    if (Input.GetButtonDown("Inventory 1")) {
        target_weapon_slot = 0;
    }
    if (Input.GetButtonDown("Inventory 2")) {
        target_weapon_slot = 1;
    }
    if (Input.GetButtonDown("Inventory 3")) {
        target_weapon_slot = 2;
    }
    if (Input.GetButtonDown("Inventory 4")) {
        target_weapon_slot = 3;
    }
    if (Input.GetButtonDown("Inventory 5")) {
        target_weapon_slot = 4;
    }
    if (Input.GetButtonDown("Inventory 6")) {
        target_weapon_slot = 5;
    }
    if (Input.GetButtonDown("Inventory 7")) {
        target_weapon_slot = 6;
    }
    if (Input.GetButtonDown("Inventory 8")) {
        target_weapon_slot = 7;
    }
    if (Input.GetButtonDown("Inventory 9")) {
        target_weapon_slot = 8;
    }
    if (Input.GetButtonDown("Inventory 10")) {
        target_weapon_slot = 9;
    }

    var gun_script = gun_instance ? gun_instance.GetComponent(GunScript) : null;
    if (gun_instance && (gun_script.IsMagCurrentlyEjecting() || gun_script.ready_to_remove_mag)){
        return false;
    }

    if (target_weapon_slot == -2 || mag_stage == HandMagStage.HOLD_TO_INSERT) {
        return false;
    }

    // if we can't act on an input right now, but will be able to in the future, buffer it
    var buffer_input = false;

    // for a short time after removing a magazine from the inventory, the player can insert it into the gun by hitting the same
    // inventory button again
    var insert_mag_with_number_key = false;

    // (un)holster gun
    if (target_weapon_slot == -1) {
        if (gun_instance) {
            for (var i = 0; i < kWeaponSlotNum; ++i) {
                if (weapon_slots[i].type == WeaponSlotType.EMPTY) {
                    target_weapon_slot = i;
                    break;
                }
            }
            if (target_weapon_slot == -1) {
                for (i = 0; i < kWeaponSlotNum; ++i) {
                    if (weapon_slots[i].type == WeaponSlotType.EMPTYING) {
                        buffer_input = true;
                        break;
                    }
                }
            } else {
                weapon_slots[target_weapon_slot].type                = WeaponSlotType.GUN;
                weapon_slots[target_weapon_slot].obj                 = gun_instance;
                weapon_slots[target_weapon_slot].spring.state        = 0.0;
                weapon_slots[target_weapon_slot].spring.target_state = 1.0;
                weapon_slots[target_weapon_slot].start_pos           = gun_instance.transform.position - main_camera.transform.position;
                weapon_slots[target_weapon_slot].start_rot           = Quaternion.Inverse(main_camera.transform.rotation) * gun_instance.transform.rotation;

                gun_instance = null;
            }
        } else {
            for (i = 0; i < kWeaponSlotNum; ++i) {
                if (weapon_slots[i].type == WeaponSlotType.GUN) {
                    target_weapon_slot = i;
                    break;
                }
            }
            if (target_weapon_slot >= 0) {
                gun_instance = weapon_slots[target_weapon_slot].obj;

                weapon_slots[target_weapon_slot].type                = WeaponSlotType.EMPTYING;
                weapon_slots[target_weapon_slot].spring.target_state = 0.0;
                weapon_slots[target_weapon_slot].spring.state        = 1.0;
            }
        }
    }
    // if we're holding a mag and the target inventory slot is empty
    else if (mag_stage == HandMagStage.HOLD && weapon_slots[target_weapon_slot].type == WeaponSlotType.EMPTY) {
        weapon_slots[target_weapon_slot].type                = WeaponSlotType.MAGAZINE;
        weapon_slots[target_weapon_slot].obj                 = magazine_instance_in_hand;
        weapon_slots[target_weapon_slot].spring.state        = 0.0;
        weapon_slots[target_weapon_slot].spring.target_state = 1.0;
        weapon_slots[target_weapon_slot].start_pos           = magazine_instance_in_hand.transform.position - main_camera.transform.position;
        weapon_slots[target_weapon_slot].start_rot           = Quaternion.Inverse(main_camera.transform.rotation) * magazine_instance_in_hand.transform.rotation;
        magazine_instance_in_hand = null;
        mag_stage                 = HandMagStage.EMPTY;
    }
    // if we're in the process of removing a magazine from an inventory slot, and the player hit the same inventory button again
    else if (mag_stage == HandMagStage.HOLD && weapon_slots[target_weapon_slot].type == WeaponSlotType.EMPTYING && weapon_slots[target_weapon_slot].obj == magazine_instance_in_hand && gun_instance && !gun_script.IsThereAMagInGun()) {
        insert_mag_with_number_key = true;
    }
    // Take mag from inventory
    else if (mag_stage == HandMagStage.EMPTY && weapon_slots[target_weapon_slot].type == WeaponSlotType.MAGAZINE) {
        magazine_instance_in_hand = weapon_slots[target_weapon_slot].obj;
        mag_stage                 = HandMagStage.HOLD;
        hold_pose_spring.state        = 1.0;
        hold_pose_spring.target_state = 1.0;
        weapon_slots[target_weapon_slot].type                = WeaponSlotType.EMPTYING;
        weapon_slots[target_weapon_slot].spring.target_state = 0.0;
        weapon_slots[target_weapon_slot].spring.state        = 1.0;
    }
    // put flashlight away, if we're targeting an empty slot and our off hand is empty
    else if (mag_stage == HandMagStage.EMPTY && weapon_slots[target_weapon_slot].type == WeaponSlotType.EMPTY && held_flashlight){
        held_flashlight.GetComponent(FlashlightScript).TurnOff();
        weapon_slots[target_weapon_slot].type                = WeaponSlotType.FLASHLIGHT;
        weapon_slots[target_weapon_slot].obj                 = held_flashlight;
        weapon_slots[target_weapon_slot].spring.state        = 0.0;
        weapon_slots[target_weapon_slot].spring.target_state = 1.0;
        weapon_slots[target_weapon_slot].start_pos           = held_flashlight.transform.position - main_camera.transform.position;
        weapon_slots[target_weapon_slot].start_rot           = Quaternion.Inverse(main_camera.transform.rotation) * held_flashlight.transform.rotation;

        held_flashlight = null;
    }
    // Take flashlight from inventory
    else if (!held_flashlight && weapon_slots[target_weapon_slot].type == WeaponSlotType.FLASHLIGHT) {
        held_flashlight = weapon_slots[target_weapon_slot].obj;
        held_flashlight.GetComponent(FlashlightScript).TurnOn();

        weapon_slots[target_weapon_slot].type                = WeaponSlotType.EMPTYING;
        weapon_slots[target_weapon_slot].spring.target_state = 0.0;
        weapon_slots[target_weapon_slot].spring.state        = 1.0;
    }

    if (!buffer_input) {
        target_weapon_slot = -2;
    }

    return insert_mag_with_number_key;
}


enum GunTilt {LEFT, CENTER, RIGHT};
function HandleGunControls(insert_mag_with_number_key : boolean) {
    var gun_script = GetGunScript();
    if (Input.GetButton("Trigger")) {
        gun_script.ApplyPressureToTrigger();
    } else {
        gun_script.ReleasePressureFromTrigger();
    }
    if (Input.GetButtonDown("Slide Lock")) {
        gun_script.ReleaseSlideLock();
    }
    if (Input.GetButtonUp("Slide Lock")) {
        gun_script.ReleasePressureOnSlideLock();
    }
    if (Input.GetButton("Slide Lock")) {
        gun_script.PressureOnSlideLock();
    }
    if (Input.GetButtonDown("Safety")) {
        gun_script.ToggleSafety();
    }
    if (Input.GetButtonDown("Auto Mod Toggle")) {
        gun_script.ToggleAutoMod();
    }
    if (Input.GetButtonDown("Pull Back Slide")) {
        gun_script.PullBackSlide();
    }
    if (Input.GetButtonUp("Pull Back Slide")) {
        gun_script.ReleaseSlide();
    }
    if (Input.GetButtonDown("Swing Out Cylinder")) {
        gun_script.SwingOutCylinder();
    }
    if (Input.GetButtonDown("Close Cylinder")) {
        gun_script.CloseCylinder();
    }
    if (Input.GetButton("Extractor Rod")) {
        gun_script.ExtractorRod();
    }
    if (Input.GetButton("Hammer")) {
        gun_script.PressureOnHammer();
    }
    if (Input.GetButtonUp("Hammer")) {
        gun_script.ReleaseHammer();
    }
    if (Input.GetAxis("Mouse ScrollWheel")) {
        gun_script.RotateCylinder(Input.GetAxis("Mouse ScrollWheel"));
    }
    if (Input.GetButtonDown("Insert")) {
        if (loose_bullets.length > 0) {
            if (gun_script.AddRoundToCylinder()) {
                GameObject.Destroy(loose_bullets.pop());
                loose_bullet_spring.pop();
            }
        }
    }

    // Apply tilt poses based on safety and slide actions
    // Manual slidepull applies left tilt, automatic slidelock applies right tilt.
    var gun_tilt : GunTilt;
    if (slide_pose_spring.target_state < 0.1 && reload_pose_spring.target_state < 0.1) {
        gun_tilt = GunTilt.CENTER;
    } else if (slide_pose_spring.target_state > reload_pose_spring.target_state) {
        gun_tilt = GunTilt.LEFT;
    } else {
        gun_tilt = GunTilt.RIGHT;
    }

    slide_pose_spring.target_state       = 0.0;
    reload_pose_spring.target_state      = 0.0;
    press_check_pose_spring.target_state = 0.0;

    // TODO: some of these are mutually exclusive I think
    if (gun_script.IsSafetyOn()) {
        reload_pose_spring.target_state = 0.2;
        gun_tilt                        = GunTilt.RIGHT;
    }
    if (gun_script.IsSlideLocked()) {
        // if the gun was in center or right tilt when the slide locked, set reload pose
        // this is how we enter reload pose after the last bullet was fired
        if (gun_tilt == GunTilt.LEFT) {
            slide_pose_spring.target_state = 0.7;
        } else {
            reload_pose_spring.target_state = 0.7;
        }
    }
    if (gun_script.IsSlidePulledBack()) {
        // depnding on which pose we're in, extend it fully if slide is pulled back
        if (gun_tilt == GunTilt.RIGHT) {
            reload_pose_spring.target_state = 1.0;
        } else {
            slide_pose_spring.target_state  = 1.0;
        }
    }
    if (gun_script.IsPressCheck()) {
        slide_pose_spring.target_state       = 0.0;
        reload_pose_spring.target_state      = 0.0;
        press_check_pose_spring.target_state = 0.6;
    }

    add_rounds_pose_spring.target_state       = 0.0;
    eject_rounds_pose_spring.target_state     = 0.0;
    inspect_cylinder_pose_spring.target_state = 0.0;
    if (gun_script.IsEjectingRounds()) {
        eject_rounds_pose_spring.target_state = 1.0;
    //} else if(gun_script.IsAddingRounds()){
    //    add_rounds_pose_spring.target_state = 1.0;
    } else if (gun_script.IsCylinderOpen()) {
        inspect_cylinder_pose_spring.target_state = 1.0;
    }

    x_recoil_spring.vel           += gun_script.recoil_transfer_x;
    y_recoil_spring.vel           += gun_script.recoil_transfer_y;
    rotation_x                    += gun_script.rotation_transfer_x;
    rotation_y                    += gun_script.rotation_transfer_y;
    gun_script.recoil_transfer_x   = 0.0;
    gun_script.recoil_transfer_y   = 0.0;
    gun_script.rotation_transfer_x = 0.0;
    gun_script.rotation_transfer_y = 0.0;

    if (gun_script.add_head_recoil) {
        head_recoil_delay[next_head_recoil_delay] = 0.1;
        next_head_recoil_delay                    = (next_head_recoil_delay + 1) % kMaxHeadRecoil;
        gun_script.add_head_recoil                = false;
    }

    if (gun_script.ready_to_remove_mag && !magazine_instance_in_hand) {
        magazine_instance_in_hand     = gun_script.RemoveMag();
        mag_stage                     = HandMagStage.HOLD;
        hold_pose_spring.state        = 0.0;
        hold_pose_spring.vel          = 0.0;
        hold_pose_spring.target_state = 1.0;
    }

    // start magazine insertion process if we're holding a mag and pressed the button or completed the inventory double tap
    if ((Input.GetButtonDown("Insert") && mag_stage == HandMagStage.HOLD && !gun_script.IsThereAMagInGun()) || insert_mag_with_number_key) {
        hold_pose_spring.target_state = 0.0;
        mag_stage                     = HandMagStage.HOLD_TO_INSERT;
    }

    // transfer magazine from hand to gun once it gets close enough
    if (mag_stage == HandMagStage.HOLD_TO_INSERT && hold_pose_spring.state < 0.01) {
        gun_script.InsertMag(magazine_instance_in_hand);
        magazine_instance_in_hand = null;
        mag_stage                 = HandMagStage.EMPTY;
    }
}

function HandleControls() {
    if (Input.GetButton("Get")) {
        HandleGetControl();
    }

    // transfer delayed head recoil from gun (TODO: is this in the right place?)
    for (var i = 0; i < kMaxHeadRecoil; ++i) {
        if (head_recoil_delay[i] == -1.0) {
            continue;
        }

        head_recoil_delay[i] -= Time.deltaTime;
        if (head_recoil_delay[i] <= 0.0) {
            head_recoil_spring_x.vel += Random.Range(-30.0, 30.0);
            head_recoil_spring_y.vel += Random.Range(-30.0, 30.0);
            head_recoil_delay[i]      = -1.0;
        }
    }

    // did the player queue a mag insert with double tap?
    var insert_mag_with_number_key = HandleInventoryControls();

    if ((Input.GetButtonDown("Eject/Drop") || queue_drop) && mag_stage == HandMagStage.HOLD) {
        magazine_instance_in_hand.AddComponent(Rigidbody);
        magazine_instance_in_hand.rigidbody.interpolation = RigidbodyInterpolation.Interpolate;
        magazine_instance_in_hand.rigidbody.velocity      = character_controller.velocity;

        mag_stage                 = HandMagStage.EMPTY;
        magazine_instance_in_hand = null;
        queue_drop                = false;
    }

    if (Input.GetButtonDown("Eject/Drop")) {
        if (mag_stage == HandMagStage.EMPTY && gun_instance) {
            if (gun_instance.GetComponent(GunScript).IsMagCurrentlyEjecting()) {
                queue_drop = true;
            } else {
                gun_instance.GetComponent(GunScript).MagEject();
            }
        }
        // cancel mag insert
        else if (mag_stage == HandMagStage.HOLD_TO_INSERT) {
            mag_stage = HandMagStage.HOLD;
            hold_pose_spring.target_state = 1.0;
        }
    }

    if (gun_instance) {
        HandleGunControls(insert_mag_with_number_key);
    } else if (mag_stage == HandMagStage.HOLD) {
        if (Input.GetButtonDown("Insert")) {
            if (loose_bullets.length > 0 && magazine_instance_in_hand.GetComponent(mag_script).AddRound()) {
                GameObject.Destroy(loose_bullets.pop());
                loose_bullet_spring.pop();
            }
        }
        if (Input.GetButtonDown("Pull Back Slide")) {
            if (magazine_instance_in_hand.GetComponent(mag_script).RemoveRoundAnimated()) {
                AddLooseBullet(true);
                PlaySoundFromGroup(sound_bullet_grab, 0.2);
            }
        }
    }

    if (Input.GetButtonDown("Aim Toggle")) {
        aim_toggle = !aim_toggle;
    }
    if (Input.GetButtonDown("Slow Motion Toggle") && slomo_mode) {
        if (Time.timeScale == 1.0) {
            SlomoOn();
        } else {
            SlomoOff();
        }
    }
}

function StartTapePlay() {
    audio.PlayOneShot(holder.sound_tape_start, 1.0 * PlayerPrefs.GetFloat("voice_volume", 1.0));
    audiosource_tape_background.Play();
    if (tape_in_progress && start_tape_delay == 0.0) {
        audiosource_audio_content.Play();
    }
    if (!tape_in_progress && tapes_remaining.length > 0) {
        audiosource_audio_content.clip = tapes_remaining.shift();
        start_tape_delay               = Random.Range(0.5, 3.0);
        stop_tape_delay                = 0.0;
        tape_in_progress               = true;
    }
    audiosource_tape_background.pitch = 0.1;
    audiosource_audio_content.pitch   = 0.1;
}

function StopTapePlay() {
    audio.PlayOneShot(holder.sound_tape_end, 1.0 * PlayerPrefs.GetFloat("voice_volume", 1.0));
    if (tape_in_progress) {
        audiosource_tape_background.Pause();
        audiosource_audio_content.Pause();
    } else {
        audiosource_tape_background.Stop();
        audiosource_audio_content.Stop();
    }
}

function StartWin() {
    GetComponent(MusicScript).HandleEvent(MusicEvent.WON);
    won = true;
}

function ApplyPose(name : String, amount : float){
    var pose = gun_instance.transform.FindChild(name);
    if (amount == 0.0 || !pose) {
        return;
    }
    gun_instance.transform.position = mix(
        gun_instance.transform.position,
        pose.position,
        amount
    );
    gun_instance.transform.rotation = mix(
        gun_instance.transform.rotation,
        pose.rotation,
        amount
    );
}

function UpdateCheats() {
    if (iddqd_progress == 0 && Input.GetKeyDown('i')) {
        ++iddqd_progress; cheat_delay = 1.0;
    } else if (iddqd_progress == 1 && Input.GetKeyDown('d')) {
        ++iddqd_progress; cheat_delay = 1.0;
    } else if (iddqd_progress == 2 && Input.GetKeyDown('d')) {
        ++iddqd_progress; cheat_delay = 1.0;
    } else if (iddqd_progress == 3 && Input.GetKeyDown('q')) {
        ++iddqd_progress; cheat_delay = 1.0;
    } else if (iddqd_progress == 4 && Input.GetKeyDown('d')) {
        iddqd_progress = 0;
        god_mode       = !god_mode;
        PlaySoundFromGroup(holder.sound_scream, 1.0);
    }

    if (idkfa_progress == 0 && Input.GetKeyDown('i')) {
        ++idkfa_progress; cheat_delay = 1.0;
    } else if (idkfa_progress == 1 && Input.GetKeyDown('d')) {
        ++idkfa_progress; cheat_delay = 1.0;
    } else if (idkfa_progress == 2 && Input.GetKeyDown('k')) {
        ++idkfa_progress; cheat_delay = 1.0;
    } else if (idkfa_progress == 3 && Input.GetKeyDown('f')) {
        ++idkfa_progress; cheat_delay = 1.0;
    } else if (idkfa_progress == 4 && Input.GetKeyDown('a')) {
        idkfa_progress = 0;
        if (loose_bullets.length < 30) {
            PlaySoundFromGroup(sound_bullet_grab, 0.2);
        }
        while (loose_bullets.length < 30) {
            AddLooseBullet(true);
        }
        PlaySoundFromGroup(holder.sound_scream, 1.0);
    }

    if (slomo_progress == 0 && Input.GetKeyDown('s')) {
        ++slomo_progress; cheat_delay = 1.0;
    } else if (slomo_progress == 1 && Input.GetKeyDown('l')) {
        ++slomo_progress; cheat_delay = 1.0;
    } else if (slomo_progress == 2 && Input.GetKeyDown('o')) {
        ++slomo_progress; cheat_delay = 1.0;
    } else if (slomo_progress == 3 && Input.GetKeyDown('m')) {
        ++slomo_progress; cheat_delay = 1.0;
    } else if (slomo_progress == 4 && Input.GetKeyDown('o')) {
        slomo_progress = 0;
        slomo_mode     = true;
        if (Time.timeScale == 1.0) {
            SlomoOn();
        } else {
            SlomoOff();
        }
        PlaySoundFromGroup(holder.sound_scream, 1.0);
    }

    if (cheat_delay > 0.0) {
        cheat_delay -= Time.deltaTime;
        if (cheat_delay <= 0.0) {
            cheat_delay    = 0.0;
            iddqd_progress = 0;
            idkfa_progress = 0;
            slomo_progress = 0;
        }
    }
}

function SlomoOn() {
    Time.fixedDeltaTime = orig_fixedDeltaTime / 10;
    Time.timeScale      = 0.1;
}

function SlomoOff() {
    Time.fixedDeltaTime = orig_fixedDeltaTime;
    Time.timeScale      = 1.0;
}

function UpdateTape() {
    if (!tape_in_progress && unplayed_tapes > 0) {
        --unplayed_tapes;
        StartTapePlay();
    }
    if (Input.GetButtonDown("Tape Player") && tape_in_progress) {
        if (!audiosource_tape_background.isPlaying) {
            StartTapePlay();
        } else {
            StopTapePlay();
        }
    }
    if (tape_in_progress && audiosource_tape_background.isPlaying) {
        GetComponent(MusicScript).SetMystical((tapes_heard.length + 1.0) / total_tapes.length);
        audiosource_tape_background.volume = PlayerPrefs.GetFloat("voice_volume", 1.0);
        audiosource_tape_background.pitch  = Mathf.Min(1.0,audiosource_audio_content.pitch + Time.deltaTime * 3.0);
        audiosource_audio_content.volume   = PlayerPrefs.GetFloat("voice_volume", 1.0);
        audiosource_audio_content.pitch    = Mathf.Min(1.0,audiosource_audio_content.pitch + Time.deltaTime * 3.0);
        if (start_tape_delay > 0.0) {
            if (!audiosource_audio_content.isPlaying) {
                start_tape_delay -= Time.deltaTime;
                if (start_tape_delay <= 0.0) {
                    audiosource_audio_content.Play();
                }
            }
        } else if (stop_tape_delay > 0.0) {
            stop_tape_delay -= Time.deltaTime;
            if (stop_tape_delay <= 0.0) {
                tape_in_progress = false;
                tapes_heard.push(audiosource_audio_content.clip);
                StopTapePlay();
                if (tapes_heard.length == total_tapes.length) {
                    StartWin();
                }
            }
        } else if (!audiosource_audio_content.isPlaying) {
            stop_tape_delay = Random.Range(0.5, 3.0);
        }
    }
}

function UpdateHealth() {
    if (dying) {
        health -= Time.deltaTime;
    }
    if (health <= 0.0) {
        health = 0.0;
        SetDead(true);
        dying = false;
    }
}

function UpdateHelpToggle() {
    if (Input.GetButton("Help Toggle")) {
        help_hold_time += Time.deltaTime;
        if (show_help && help_hold_time >= 1.0) {
            show_advanced_help = true;
        }
    }
    if (Input.GetButtonDown("Help Toggle")) {
        if (!show_help) {
            show_help         = true;
            help_ever_shown   = true;
            just_started_help = true;
        }
        help_hold_time = 0.0;
    }
    if (Input.GetButtonUp("Help Toggle")) {
        if (show_help && help_hold_time < 1.0 && !just_started_help) {
            show_help          = false;
            show_advanced_help = false;
        }
        just_started_help = false;
    }
}

// The logic is written this way to stop the accumulator after the reset threshold has been reached
function UpdateLevelResetButton() {
    if (Input.GetButtonDown("Level Reset")) {
        level_reset_hold = 0.01;
    }
    if (level_reset_hold != 0.0 && Input.GetButton("Level Reset")) {
        level_reset_hold += Time.deltaTime;
        dead_volume_fade = Mathf.Min(1.0 - level_reset_hold * 0.5, dead_volume_fade);
        dead_fade        = level_reset_hold * 0.5;
        if (level_reset_hold >= 2.0) {
            SlomoOff();
            Application.LoadLevel(Application.loadedLevel);
            level_reset_hold = 0.0;
        }
    } else {
        level_reset_hold = 0.0;
    }
}

function UpdateLevelEndEffects() {
    if (won) {
        win_fade         = Mathf.Min(1.0, win_fade + Time.deltaTime * 0.1);
        dead_volume_fade = Mathf.Max(0.0, dead_volume_fade - Time.deltaTime * 0.1);
    } else if (dead) {
        dead_fade        = Mathf.Min(1.0, dead_fade + Time.deltaTime * 0.3);
        dead_volume_fade = Mathf.Max(0.0, dead_volume_fade - Time.deltaTime * 0.23);

        // here we simulate the player's body falling since there's no actual model
        // accelerate downward
        head_fall_vel   -= 9.8 * Time.deltaTime;
        // increase distance fallen
        head_fall       += head_fall_vel * Time.deltaTime;
        // apply twist and tilt generated on death
        head_tilt       += head_tilt_vel * Time.deltaTime;
        view_rotation_x += head_tilt_x_vel * Time.deltaTime;
        view_rotation_y += head_tilt_y_vel * Time.deltaTime;
        // calculate minimum fall distance before simulating body hitting floor
        var min_fall     = character_controller.height * character_controller.transform.localScale.y * -1.0;
        // if min distance met and still moving downward
        if (head_fall < min_fall && head_fall_vel < 0.0) {
            // if falling speed is high enough, bounce head and play sound
            if (Mathf.Abs(head_fall_vel) > 0.5) {
                head_recoil_spring_x.vel += Random.Range(-10, 10) * Mathf.Abs(head_fall_vel);
                head_recoil_spring_y.vel += Random.Range(-10, 10) * Mathf.Abs(head_fall_vel);
                head_tilt_vel             = 0.0;
                head_tilt_x_vel           = 0.0;
                head_tilt_y_vel           = 0.0;
                if (!dead_body_fell) {
                    PlaySoundFromGroup(sound_body_fall, 1.0);
                    dead_body_fell = true;
                }
            }
            // bounce
            head_fall_vel *= -0.3;
        }
        // clamp distance fallen to mininum to keep bouncing once met
        head_fall = Mathf.Max(min_fall, head_fall);
    } else {
        dead_fade        = Mathf.Max(0.0, dead_fade - Time.deltaTime * 1.5);
        dead_volume_fade = Mathf.Min(1.0, dead_volume_fade + Time.deltaTime * 1.5);
    }
}

function UpdateLevelChange() {
    if (dead && dead_volume_fade <= 0.0) {
        Application.LoadLevel(Application.loadedLevel);
    }
    if (won && dead_volume_fade <= 0.0) {
        Application.LoadLevel("winscene");
    }
}

function UpdateFallOffMapDeath() {
    if (transform.position.y < -1) {
        InstaKill();
    }
}

function UpdateAimSpring() {
    // check if gun is hitting geometry
    var offset_aim_target = false;
    if (gun_instance && (Input.GetButton("Hold To Aim") || aim_toggle) && !dead) {
        aim_spring.target_state = 1.0;
        var hit : RaycastHit;
        if (Physics.Linecast(main_camera.transform.position, AimPos() + AimDir() * 0.2, hit, 1 << 0)) {
            aim_spring.target_state = Mathf.Clamp(
                1.0 - (Vector3.Distance(hit.point, main_camera.transform.position) / (GunDist() + 0.2)),
                0.0,
                1.0
            );
            offset_aim_target = true;
        }
    } else {
        aim_spring.target_state = 0.0;
    }
    aim_spring.Update();
    if (offset_aim_target) {
        aim_spring.target_state = 1.0;
    }
}

function UpdateCameraRotationControls() {
    if (PlayerPrefs.GetInt("lock_gun_to_center", 0) == 1) {
        rotation_y_min_leeway = 0;
        rotation_y_max_leeway = 0;
        rotation_x_leeway     = 0;
    } else {
        rotation_y_min_leeway = Mathf.Lerp(0.0, kRotationYMinLeeway, aim_spring.state);
        rotation_y_max_leeway = Mathf.Lerp(0.0, kRotationYMaxLeeway, aim_spring.state);
        rotation_x_leeway     = Mathf.Lerp(0.0, kRotationXLeeway, aim_spring.state);
    }

    sensitivity_x = PlayerPrefs.GetFloat("mouse_sensitivity", 1.0) * 10.0;
    sensitivity_y = PlayerPrefs.GetFloat("mouse_sensitivity", 1.0) * 10.0;
    if (PlayerPrefs.GetInt("mouse_invert", 0) == 1) {
        sensitivity_y = -Mathf.Abs(sensitivity_y);
    } else {
        sensitivity_y = Mathf.Abs(sensitivity_y);
    }

    var in_menu = GameObject.Find("gui_skin_holder").GetComponent(optionsmenuscript).IsMenuShown();
    if (!dead && !in_menu) {
        rotation_x += Input.GetAxis("Mouse X") * sensitivity_x;
        rotation_y += Input.GetAxis("Mouse Y") * sensitivity_y;
        rotation_y  = Mathf.Clamp (rotation_y, min_angle_y, max_angle_y);

        if ((Input.GetButton("Hold To Aim") || aim_toggle) && gun_instance) {
            view_rotation_y = Mathf.Clamp(view_rotation_y, rotation_y - rotation_y_min_leeway, rotation_y + rotation_y_max_leeway);
            view_rotation_x = Mathf.Clamp(view_rotation_x, rotation_x - rotation_x_leeway, rotation_x + rotation_x_leeway);
        } else {
            view_rotation_x += Input.GetAxis("Mouse X") * sensitivity_x;
            view_rotation_y += Input.GetAxis("Mouse Y") * sensitivity_y;
            view_rotation_y  = Mathf.Clamp (view_rotation_y, min_angle_y, max_angle_y);

            rotation_y = Mathf.Clamp(rotation_y, view_rotation_y - rotation_y_max_leeway, view_rotation_y + rotation_y_min_leeway);
            rotation_x = Mathf.Clamp(rotation_x, view_rotation_x - rotation_x_leeway, view_rotation_x + rotation_x_leeway);
        }
    }
}

function UpdateCameraAndPlayerTransformation() {
    main_camera.transform.localEulerAngles = Vector3(-view_rotation_y, view_rotation_x, head_tilt);
    if (!disable_recoil) {
        main_camera.transform.localEulerAngles += Vector3(head_recoil_spring_y.state, head_recoil_spring_x.state, 0);
    }
    character_controller.transform.localEulerAngles.y = view_rotation_x;
    main_camera.transform.position                    = transform.position;
    main_camera.transform.position.y                 += character_controller.height * character_controller.transform.localScale.y - 0.1;
    main_camera.transform.position.y                 += head_fall;
}

function UpdateGunTransformation() {
    var aim_dir = AimDir();
    var aim_pos = AimPos();

    var unaimed_dir = (transform.forward + Vector3(0, -1,0)).normalized;
    var unaimed_pos = main_camera.transform.position + unaimed_dir * GunDist();

    if (disable_springs) {
        gun_instance.transform.position = mix(unaimed_pos, aim_pos, aim_spring.target_state);
        gun_instance.transform.forward  = mix(unaimed_dir, aim_dir, aim_spring.target_state);
    } else {
        gun_instance.transform.position = mix(unaimed_pos, aim_pos, aim_spring.state);
        gun_instance.transform.forward  = mix(unaimed_dir, aim_dir, aim_spring.state);
    }

    if (disable_springs) {
        ApplyPose("pose_slide_pull",       slide_pose_spring.target_state);
        ApplyPose("pose_reload",           reload_pose_spring.target_state);
        ApplyPose("pose_press_check",      press_check_pose_spring.target_state);
        ApplyPose("pose_inspect_cylinder", inspect_cylinder_pose_spring.target_state);
        ApplyPose("pose_add_rounds",       add_rounds_pose_spring.target_state);
        ApplyPose("pose_eject_rounds",     eject_rounds_pose_spring.target_state);
    } else {
        ApplyPose("pose_slide_pull",       slide_pose_spring.state);
        ApplyPose("pose_reload",           reload_pose_spring.state);
        ApplyPose("pose_press_check",      press_check_pose_spring.state);
        ApplyPose("pose_inspect_cylinder", inspect_cylinder_pose_spring.state);
        ApplyPose("pose_add_rounds",       add_rounds_pose_spring.state);
        ApplyPose("pose_eject_rounds",     eject_rounds_pose_spring.state);
    }

    if (!disable_recoil) {
        gun_instance.transform.RotateAround(
            gun_instance.transform.FindChild("point_recoil_rotate").position,
            gun_instance.transform.rotation * Vector3(1, 0, 0),
            x_recoil_spring.state
        );

        gun_instance.transform.RotateAround(
            gun_instance.transform.FindChild("point_recoil_rotate").position,
            Vector3(0, 1, 0),
            y_recoil_spring.state
        );
    }
}

function UpdateFlashlightTransformation() {
    var flashlight_hold_pos = main_camera.transform.position + main_camera.transform.rotation * Vector3(-0.15, -0.01, 0.15);
    var flashlight_hold_rot = main_camera.transform.rotation;

    var flashlight_pos = flashlight_hold_pos;
    var flashlight_rot = flashlight_hold_rot;

    held_flashlight.transform.position = flashlight_pos;
    held_flashlight.transform.rotation = flashlight_rot;

    held_flashlight.transform.RotateAround(
        held_flashlight.transform.FindChild("point_recoil_rotate").position,
        held_flashlight.transform.rotation * Vector3(1, 0, 0),
        x_recoil_spring.state * 0.3
    );

    held_flashlight.transform.RotateAround(
        held_flashlight.transform.FindChild("point_recoil_rotate").position,
        Vector3(0, 1, 0),
        y_recoil_spring.state * 0.3
    );

    flashlight_pos = held_flashlight.transform.position;
    flashlight_rot = held_flashlight.transform.rotation;

    if (gun_instance) {
        flashlight_aim_pos = gun_instance.transform.position + gun_instance.transform.rotation*Vector3(0.07, -0.03, 0.0);
        flashlight_aim_rot = gun_instance.transform.rotation;

        flashlight_aim_pos -= main_camera.transform.position;
        flashlight_aim_pos  = Quaternion.Inverse(main_camera.transform.rotation) * flashlight_aim_pos;
        flashlight_aim_rot  = Quaternion.Inverse(main_camera.transform.rotation) * flashlight_aim_rot;
    }

    if (disable_springs) {
        flashlight_pos = mix(flashlight_pos, main_camera.transform.rotation * flashlight_aim_pos + main_camera.transform.position, aim_spring.target_state);
        flashlight_rot = mix(flashlight_rot, main_camera.transform.rotation * flashlight_aim_rot, aim_spring.target_state);
    } else {
        flashlight_pos = mix(flashlight_pos, main_camera.transform.rotation * flashlight_aim_pos + main_camera.transform.position, aim_spring.state);
        flashlight_rot = mix(flashlight_rot, main_camera.transform.rotation * flashlight_aim_rot, aim_spring.state);
    }

    var flashlight_mouth_pos = main_camera.transform.position + main_camera.transform.rotation * Vector3(0.0, -0.08, 0.05);
    var flashlight_mouth_rot = main_camera.transform.rotation;

    flashlight_mouth_spring.target_state = 0.0;
    if (magazine_instance_in_hand) {
        flashlight_mouth_spring.target_state = 1.0;
    }
    flashlight_mouth_spring.target_state = Mathf.Max(
        flashlight_mouth_spring.target_state,
        (inspect_cylinder_pose_spring.state + eject_rounds_pose_spring.state + (press_check_pose_spring.state / 0.6) + (reload_pose_spring.state / 0.7) + slide_pose_spring.state) * aim_spring.state
    );
    flashlight_mouth_spring.Update();

    if (disable_springs) {
        flashlight_pos = mix(flashlight_pos, flashlight_mouth_pos, flashlight_mouth_spring.target_state);
        flashlight_rot = mix(flashlight_rot, flashlight_mouth_rot, flashlight_mouth_spring.target_state);

        flashlight_pos = mix(flashlight_pos, flash_ground_pos, flash_ground_pose_spring.target_state);
        flashlight_rot = mix(flashlight_rot, flash_ground_rot, flash_ground_pose_spring.target_state);
    } else {
        flashlight_pos = mix(flashlight_pos, flashlight_mouth_pos, flashlight_mouth_spring.state);
        flashlight_rot = mix(flashlight_rot, flashlight_mouth_rot, flashlight_mouth_spring.state);

        flashlight_pos = mix(flashlight_pos, flash_ground_pos, flash_ground_pose_spring.state);
        flashlight_rot = mix(flashlight_rot, flash_ground_rot, flash_ground_pose_spring.state);
    }

    held_flashlight.transform.position = flashlight_pos;
    held_flashlight.transform.rotation = flashlight_rot;
}

function UpdateMagazineTransformation() {
    if (gun_instance) {
        mag_rot = gun_instance.transform.rotation;
        mag_pos = gun_instance.transform.position + (gun_instance.transform.FindChild("point_mag_to_insert").position - gun_instance.transform.FindChild("point_mag_inserted").position);
    }
    if (mag_stage == HandMagStage.HOLD || mag_stage == HandMagStage.HOLD_TO_INSERT) {
        var mag_script = magazine_instance_in_hand.GetComponent(mag_script);
        var hold_pos   = main_camera.transform.position + main_camera.transform.rotation * mag_script.hold_offset;
        var hold_rot   = main_camera.transform.rotation * Quaternion.AngleAxis(mag_script.hold_rotation.x, Vector3(0, 1, 0)) * Quaternion.AngleAxis(mag_script.hold_rotation.y, Vector3(1, 0, 0));
        if (disable_springs) {
            hold_pos = mix(hold_pos, mag_ground_pos, mag_ground_pose_spring.target_state);
            hold_rot = mix(hold_rot, mag_ground_rot, mag_ground_pose_spring.target_state);
        } else {
            hold_pos = mix(hold_pos, mag_ground_pos, mag_ground_pose_spring.state);
            hold_rot = mix(hold_rot, mag_ground_rot, mag_ground_pose_spring.state);
        }
        if (hold_pose_spring.state != 1.0) {
            var amount = hold_pose_spring.state;
            if (disable_springs) {
                amount = hold_pose_spring.target_state;
            }
            magazine_instance_in_hand.transform.position = mix(mag_pos, hold_pos, amount);
            magazine_instance_in_hand.transform.rotation = mix(mag_rot, hold_rot, amount);
        } else {
            magazine_instance_in_hand.transform.position = hold_pos;
            magazine_instance_in_hand.transform.rotation = hold_rot;
        }
    } else {
        magazine_instance_in_hand.transform.position = mag_pos;
        magazine_instance_in_hand.transform.rotation = mag_rot;
    }
}

function UpdateInventoryTransformation() {
    var i = 0;
    for (i = 0; i < kWeaponSlotNum; ++i) {
        var slot = weapon_slots[i];
        if (slot.type == WeaponSlotType.EMPTY) {
            continue;
        }
        slot.obj.transform.localScale = Vector3(1.0, 1.0, 1.0);
    }
    var camera = main_camera.camera;
    for (i = 0; i < kWeaponSlotNum; ++i) {
        slot = weapon_slots[i];
        if (slot.type == WeaponSlotType.EMPTY) {
            continue;
        }
        var start_pos = main_camera.transform.position + slot.start_pos;
        var start_rot = main_camera.transform.rotation * slot.start_rot;
        if (slot.type == WeaponSlotType.EMPTYING) {
            start_pos = slot.obj.transform.position;
            start_rot = slot.obj.transform.rotation;
            if (Mathf.Abs(slot.spring.vel) <= 0.01 && slot.spring.state <= 0.01) {
                slot.type = WeaponSlotType.EMPTY;
                slot.spring.state = 0.0;
            }
        }
        var scale = 0.0;
        if (disable_springs) {
            slot.obj.transform.position = mix(
                start_pos,
                main_camera.transform.position + camera.ScreenPointToRay(Vector3(camera.pixelWidth * (0.05 + i * 0.15), camera.pixelHeight * 0.17, 0)).direction * 0.3,
                slot.spring.target_state
            );
            scale = 0.3 * slot.spring.target_state + (1.0 - slot.spring.target_state);
            slot.obj.transform.localScale.x *= scale;
            slot.obj.transform.localScale.y *= scale;
            slot.obj.transform.localScale.z *= scale;
            slot.obj.transform.rotation = mix(
                start_rot,
                main_camera.transform.rotation * Quaternion.AngleAxis(90, Vector3(0, 1, 0)),
                slot.spring.target_state
            );
        } else {
            slot.obj.transform.position = mix(
                start_pos,
                main_camera.transform.position + camera.ScreenPointToRay(Vector3(camera.pixelWidth * (0.05 + i * 0.15), camera.pixelHeight * 0.17, 0)).direction * 0.3,
                slot.spring.state);
            scale = 0.3 * slot.spring.state + (1.0 - slot.spring.state);
            slot.obj.transform.localScale.x *= scale;
            slot.obj.transform.localScale.y *= scale;
            slot.obj.transform.localScale.z *= scale;
            slot.obj.transform.rotation = mix(
                start_rot,
                main_camera.transform.rotation * Quaternion.AngleAxis(90, Vector3(0, 1, 0)),
                slot.spring.state);
        }
        var renderers = slot.obj.GetComponentsInChildren(Renderer);
        for (var renderer : Renderer in renderers) {
            renderer.castShadows = false;
        }
        slot.spring.Update();
    }
}

function UpdateLooseBulletDisplay() {
    if ((mag_stage == HandMagStage.HOLD && !gun_instance) || picked_up_bullet_delay > 0.0 || (gun_instance && gun_instance.GetComponent(GunScript).IsCylinderOpen())) {
        show_bullet_spring.target_state = 1.0;
        picked_up_bullet_delay         -= Time.deltaTime;
    } else {
        show_bullet_spring.target_state = 0.0;
    }
    show_bullet_spring.Update();

    var c = loose_bullets.length;
    var camera_component = main_camera.camera;
    for (var i = 0; i < c; ++i) {
        var spring : Spring = loose_bullet_spring[i];
        spring.Update();
        var bullet : GameObject       = loose_bullets[i];
        bullet.transform.position     = main_camera.transform.position + camera_component.ScreenPointToRay(Vector3(0.0, camera_component.pixelHeight, 0)).direction * 0.3;
        bullet.transform.position    += main_camera.transform.rotation * Vector3(0.02, -0.01, 0.0);
        bullet.transform.position    += main_camera.transform.rotation * Vector3(0.006 * i, 0.0, 0.0);
        bullet.transform.position    += main_camera.transform.rotation * Vector3(-0.03, 0.03, 0) * (1.0 - show_bullet_spring.state);
        bullet.transform.localScale.x = spring.state;
        bullet.transform.localScale.y = spring.state;
        bullet.transform.localScale.z = spring.state;
        bullet.transform.rotation     = main_camera.transform.rotation * Quaternion.AngleAxis(90, Vector3(-1, 0, 0));
        var renderers = bullet.GetComponentsInChildren(Renderer);
        for (var renderer : Renderer in renderers) {
            renderer.castShadows = false;
        }
    }
}

function UpdateSprings() {
    slide_pose_spring.Update();
    reload_pose_spring.Update();
    press_check_pose_spring.Update();
    inspect_cylinder_pose_spring.Update();
    add_rounds_pose_spring.Update();
    eject_rounds_pose_spring.Update();
    x_recoil_spring.Update();
    y_recoil_spring.Update();
    head_recoil_spring_x.Update();
    head_recoil_spring_y.Update();
    if (mag_stage == HandMagStage.HOLD || mag_stage == HandMagStage.HOLD_TO_INSERT) {
        hold_pose_spring.Update();
        mag_ground_pose_spring.Update();
    }
    flash_ground_pose_spring.Update();
}

function UpdatePickupMagnet() {
    var attract_pos = transform.position - Vector3(0, character_controller.height * 0.2, 0);
    for (var i = 0; i < collected_rounds.length; ++i) {
        var round = collected_rounds[i] as GameObject;
        if (!round) {
            continue;
        }
        round.rigidbody.velocity += (attract_pos - round.transform.position) * Time.deltaTime * 20.0;
        round.rigidbody.velocity *= Mathf.Pow(0.1, Time.deltaTime);
        if (Vector3.Distance(round.transform.position, attract_pos) < 0.5) {
            if (round.gameObject.name == "cassette_tape(Clone)") {
                ++unplayed_tapes;
            } else {
                AddLooseBullet(true);
                // this causes us to skip the next object and leave it for the next frame
                // limiting the number of bullets absorbed per frame
                // TODO: why not just bump up i?
                collected_rounds.splice(i, 1);
                PlaySoundFromGroup(sound_bullet_grab, 0.2);
            }
            GameObject.Destroy(round);
        }
    }
    // remove all null references
    collected_rounds.remove(null);
}

function Update() {
    UpdateTape();
    UpdateCheats();
    UpdateFallOffMapDeath();
    UpdateHealth();
    UpdateHelpToggle();
    UpdateLevelResetButton();
    UpdateLevelChange();
    UpdateLevelEndEffects();
    AudioListener.volume = dead_volume_fade * PlayerPrefs.GetFloat("master_volume", 1.0);
    UpdateAimSpring();
    UpdateCameraRotationControls();
    UpdateCameraAndPlayerTransformation();
    if (gun_instance) {
        UpdateGunTransformation();
    }
    if (held_flashlight) {
        UpdateFlashlightTransformation();
    }
    if (magazine_instance_in_hand) {
        UpdateMagazineTransformation();
    }
    UpdateInventoryTransformation();
    UpdateLooseBulletDisplay();
    var in_menu = GameObject.Find("gui_skin_holder").GetComponent(optionsmenuscript).IsMenuShown();
    if (!dead && !in_menu) {
        HandleControls();
    }
    UpdateSprings();
    UpdatePickupMagnet();

    //
    if (display_perks && Time.timeSinceLevelLoad > 2.0) {
        perk_delay -= Time.deltaTime;
        if (perk_delay <= 0.0) {
            perk_delay = kPerkDisplayDelay;
            ++perk_title_index;
        }
    }
}

function FixedUpdate() {
}

class DisplayLine {
    var str : String;
    var bold: boolean;
    function DisplayLine(_str : String, _bold : boolean) {
        bold = _bold;
        str  = _str;
    }
};

function ShouldHolsterGun() : boolean {
    if (!loose_bullets) {
        return false;
    }

    if (loose_bullets.length == 0) {
        return false;
    }

    if (!magazine_instance_in_hand) {
        return false;
    }

    if (magazine_instance_in_hand.GetComponent(mag_script).NumRounds() != 0) {
        return false;
    }

    return true;
}

function CanLoadBulletsInMag() : boolean {
    return (!gun_instance && mag_stage == HandMagStage.HOLD && loose_bullets.length > 0 && !magazine_instance_in_hand.GetComponent(mag_script).IsFull());
}

function CanRemoveBulletFromMag() : boolean {
    return (!gun_instance && mag_stage == HandMagStage.HOLD && magazine_instance_in_hand.GetComponent(mag_script).NumRounds() > 0);
}

function ShouldDrawWeapon() : boolean {
    return (!gun_instance && !CanLoadBulletsInMag());
}

function GetMostLoadedMag() : int {
    var max_rounds      = 0;
    var max_rounds_slot = -1;
    for (var i = 0; i < kWeaponSlotNum; ++i) {
        if (weapon_slots[i].type != WeaponSlotType.MAGAZINE) {
            continue;
        }

        var rounds = weapon_slots[i].obj.GetComponent(mag_script).NumRounds();
        if (rounds > max_rounds) {
            max_rounds_slot = i + 1;
            max_rounds      = rounds;
        }
    }

    return max_rounds_slot;
}

function ShouldPutMagInInventory() : boolean {
    var rounds      = magazine_instance_in_hand.GetComponent(mag_script).NumRounds();
    var most_loaded = GetMostLoadedMag();
    if (most_loaded == -1) {
        return false;
    }
    if (weapon_slots[most_loaded - 1].obj.GetComponent(mag_script).NumRounds() > rounds) {
        return true;
    }
    return false;
}

function GetEmptySlot() : int {
    var empty_slot = -1;
    for (var i = 0; i < kWeaponSlotNum; ++i) {
        if (weapon_slots[i].type == WeaponSlotType.EMPTY) {
            empty_slot = i + 1;
            break;
        }
    }
    return empty_slot;
}

function GetFlashlightSlot() : int {
    var flashlight_slot = -1;
    for (var i = 0; i < kWeaponSlotNum; ++i) {
        if (weapon_slots[i].type == WeaponSlotType.FLASHLIGHT) {
            flashlight_slot = i + 1;
            break;
        }
    }
    return flashlight_slot;
}

function OnGUI() {
    var display_text = new Array();
    var gun_script : GunScript = gun_instance ? gun_instance.GetComponent(GunScript) : null;
    display_text.push(new DisplayLine(tapes_heard.length + " tapes absorbed out of " + total_tapes.length, true));
    if (!show_help) {
        display_text.push(new DisplayLine("View help: Press [ ? ]", !help_ever_shown));
    } else {
        display_text.push(new DisplayLine("Hide help: Press [ ? ]", false));
        display_text.push(new DisplayLine("", false));
        if (tape_in_progress) {
            display_text.push(new DisplayLine("Pause/Resume tape player: [ x ]", false));
        }

        display_text.push(new DisplayLine("Look: [ move mouse ]", false));
        display_text.push(new DisplayLine("Move: [ WASD ]", false));
        display_text.push(new DisplayLine("Jump: [ space ]", false));
        display_text.push(new DisplayLine("Pick up nearby: hold [ g ]", ShouldPickUpNearby()));
        if (held_flashlight) {
            var empty_slot = GetEmptySlot();
            if (empty_slot != -1) {
                display_text.push(new DisplayLine("Put flashlight in inventory: tap [ " + empty_slot + " ]", false));
            }
        } else {
            var flashlight_slot = GetFlashlightSlot();
            if (flashlight_slot != -1) {
                display_text.push(new DisplayLine("Equip flashlight: tap [ " + flashlight_slot + " ]", true));
            }
        }
        if (gun_instance) {
            display_text.push(new DisplayLine("Fire weapon: tap [ left mouse button ]", false));
            var should_aim = (aim_spring.state < 0.5);
            display_text.push(new DisplayLine("Aim weapon: hold [ right mouse button ]", should_aim));
            display_text.push(new DisplayLine("Aim weapon: tap [ q ]", should_aim));
            display_text.push(new DisplayLine("Holster weapon: tap [ ~ ]", ShouldHolsterGun()));
        } else {
            display_text.push(new DisplayLine("Draw weapon: tap [ ~ ]", ShouldDrawWeapon()));
        }
        if (gun_instance) {
            if (gun_script.HasSlide()) {
                display_text.push(new DisplayLine("Pull back slide: hold [ r ]", gun_script.ShouldPullSlide() ? true : false));
                display_text.push(new DisplayLine("Release slide lock: tap [ t ]", gun_script.ShouldReleaseSlideLock() ? true : false));
            }
            if (gun_script.HasSafety()) {
                display_text.push(new DisplayLine("Toggle safety: tap [ v ]", gun_script.IsSafetyOn() ? true : false));
            }
            if (gun_script.HasAutoMod()) {
                display_text.push(new DisplayLine("Toggle full-automatic: tap [ v ]", gun_script.ShouldToggleAutoMod() ? true : false));
            }
            if (gun_script.HasHammer()) {
                display_text.push(new DisplayLine("Pull back hammer: hold [ f ]", gun_script.ShouldPullBackHammer() ? true : false));
            }
            if (gun_script.gun_type == GunType.REVOLVER) {
                if (!gun_script.IsCylinderOpen()) {
                    display_text.push(new DisplayLine("Open cylinder: tap [ e ]", (gun_script.ShouldOpenCylinder() && loose_bullets.length > 0) ? true : false));
                } else {
                    display_text.push(new DisplayLine("Close cylinder: tap [ r ]", (gun_script.ShouldCloseCylinder() || loose_bullets.length == 0) ? true : false));
                    display_text.push(new DisplayLine("Extract casings: hold [ v ]", gun_script.ShouldExtractCasings() ? true : false));
                    display_text.push(new DisplayLine("Insert bullet: tap [ z ]", (gun_script.ShouldInsertBullet() && loose_bullets.length > 0) ? true : false));
                }
                display_text.push(new DisplayLine("Spin cylinder: [ mousewheel ]", false));
            }
            if (mag_stage == HandMagStage.HOLD && !gun_script.IsThereAMagInGun()) {
                var should_insert_mag = (magazine_instance_in_hand.GetComponent(mag_script).NumRounds() >= 1);
                display_text.push(new DisplayLine("Insert magazine: tap [ z ]", should_insert_mag));
            } else if (mag_stage == HandMagStage.EMPTY && gun_script.IsThereAMagInGun()) {
                display_text.push(new DisplayLine("Eject magazine: tap [ e ]", gun_script.ShouldEjectMag() ? true : false));
            } else if (mag_stage == HandMagStage.EMPTY && !gun_script.IsThereAMagInGun()) {
                var max_rounds_slot = GetMostLoadedMag();
                if (max_rounds_slot != -1) {
                    display_text.push(new DisplayLine("Equip magazine: tap [ " + max_rounds_slot + " ]", true));
                }
            }
        } else {
            if (CanLoadBulletsInMag()) {
                display_text.push(new DisplayLine("Insert bullet in magazine: tap [ z ]", true));
            }
            if (CanRemoveBulletFromMag()) {
                display_text.push(new DisplayLine("Remove bullet from magazine: tap [ r ]", false));
            }
        }
        if (mag_stage == HandMagStage.HOLD) {
            empty_slot = GetEmptySlot();
            if (empty_slot != -1) {
                display_text.push(new DisplayLine("Put magazine in inventory: tap [ " + empty_slot + " ]", ShouldPutMagInInventory()));
            }
            display_text.push(new DisplayLine("Drop magazine: tap [ e ]", false));
        }

        display_text.push(new DisplayLine("", false));
        if (show_advanced_help) {
            display_text.push(new DisplayLine("Advanced help:", false));
            display_text.push(new DisplayLine("Toggle crouch: [ c ]", false));
            if (aim_spring.state < 0.5) {
                display_text.push(new DisplayLine("Run: tap repeatedly [ w ]", false));
            }
            if (gun_instance) {
                if (!gun_script.IsSafetyOn() && gun_script.IsHammerCocked()) {
                    display_text.push(new DisplayLine("Decock: Hold [f], hold [LMB], release [f]", ShouldPickUpNearby()));
                }
                if (!gun_script.IsSlideLocked() && !gun_script.IsSafetyOn()) {
                    display_text.push(new DisplayLine("Inspect chamber: hold [ t ] and then [ r ]", false));
                }
                if (mag_stage == HandMagStage.EMPTY && !gun_script.IsThereAMagInGun()) {
                    max_rounds_slot = GetMostLoadedMag();
                    if (max_rounds_slot != -1) {
                        display_text.push(new DisplayLine("Quick load magazine: double tap [ " + max_rounds_slot + " ]", false));
                    }
                }
            }
            display_text.push(new DisplayLine("Reset game: hold [ l ]", false));
        } else {
            display_text.push(new DisplayLine("Advanced help: Hold [ ? ]", false));
        }
    }

    var style : GUIStyle = holder.gui_skin.label;
    var width            = Screen.width * 0.5;
    var offset           = 0.0;
    for (var line : DisplayLine in display_text) {
        if (line.bold) {
            style.fontStyle = FontStyle.Bold;
        } else {
            style.fontStyle = FontStyle.Normal;
        }
        style.fontSize = 18;
        style.normal.textColor = Color(0.0, 0.0, 0.0);
        GUI.Label(Rect(width + 0.5, offset + 0.5, width + 0.5, 24.0 + 0.5), line.str, style);
        if (line.bold) {
            style.normal.textColor = Color(1.0, 1.0, 1.0);
        } else {
            style.normal.textColor = Color(0.7, 0.7, 0.7);
        }
        GUI.Label(Rect(width, offset, width, 24.0), line.str, style);
        offset += 20.0;
    }

    //
    if (display_perks && Time.timeSinceLevelLoad > 2.0) {
        var perk_titles = mod_controller.GetActivePerkTitles();
        if (perk_title_index >= perk_titles.Length) {
            display_perks = false;
        } else {
            style           = new GUIStyle(style);
            style.fontStyle = FontStyle.Bold;
            style.alignment = TextAnchor.UpperLeft;

            var title              = perk_titles[perk_title_index];
            style.normal.textColor = Color(0.0, 0.0, 0.0, perk_delay / kPerkDisplayDelay);
            GUI.Label(Rect(5.5, 20.0 * perk_title_index + 0.5, width + 0.5, 24.0 + 0.5), title, style);
            style.normal.textColor = Color(1.0, 1.0, 1.0, perk_delay / kPerkDisplayDelay);
            GUI.Label(Rect(5.0, 20.0 * perk_title_index + 0.0, width, 24.0), title, style);
        }
    }

    if (dead_fade > 0.0) {
        if (!texture_death_screen) {
            Debug.LogError("Assign a Texture in the inspector.");
            return;
        }
        GUI.color = Color(0.0, 0.0, 0.0, dead_fade);
        GUI.DrawTexture(Rect(0.0, 0.0, Screen.width, Screen.height), texture_death_screen, ScaleMode.StretchToFill, true);
    }

    if (win_fade > 0.0) {
        GUI.color = Color(1.0, 1.0, 1.0, win_fade);
        GUI.DrawTexture(Rect(0.0, 0.0, Screen.width, Screen.height), texture_death_screen, ScaleMode.StretchToFill, true);
    }
}
