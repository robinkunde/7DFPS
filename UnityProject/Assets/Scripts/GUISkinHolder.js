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

function Awake() {
    // We need to reset the seed here to ensure the results are consistent with what we get if we reset it for the Deja Vu perk.
    var seed    = Random.seed;
    Random.seed = seed;

    weapon = weapons[Random.Range(0, weapons.length)];

    mod_controller    = gameObject.AddComponent(ModController);
    var previous_seed = PlayerPrefs.GetInt("previous_seed", 0);
    mod_controller.Init(weapon.GetComponent(WeaponHolder), (previous_seed != 0));

    if (mod_controller.HasPerk(Perk.DEJA_VU)) {
        Random.seed = previous_seed;
        weapon      = weapons[Random.Range(0, weapons.length)];

        mod_controller.Init(weapon.GetComponent(WeaponHolder), (PlayerPrefs.GetInt("had_previous_seed", 0) == 1));
        mod_controller.AddActivePerk(Perk.DEJA_VU);

        PlayerPrefs.SetInt("had_previous_seed", 0);
        PlayerPrefs.SetInt("previous_seed", 0);
    } else {
        PlayerPrefs.SetInt("had_previous_seed", (previous_seed == 0) ? 0 : 1);
        PlayerPrefs.SetInt("previous_seed", seed);
    }
}

function Start() {
}

function Update() {
}
