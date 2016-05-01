#pragma strict

// outlets

var gui_skin : GUISkin;

var sound_scream : AudioClip[];

var sound_tape_content    : AudioClip[];
var sound_tape_start      : AudioClip;
var sound_tape_end        : AudioClip;
var sound_tape_background : AudioClip;
var tape_object           : GameObject;

var win_sting : AudioClip;

var weapons : GameObject[];

var flashlight_object : GameObject;

// state

@HideInInspector
var has_flashlight = false;
@HideInInspector
var weapon : GameObject;
@HideInInspector
var mod_controller : ModController;

function Awake () {
	weapon = weapons[Random.Range(0, weapons.length)];

    mod_controller = gameObject.AddComponent(ModController);
    mod_controller.Init(weapon.GetComponent(WeaponHolder));
}

function Start () {
}

function Update () {
}
