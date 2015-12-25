/*
This script controls the music in the game.

1. The music is layered procedurally, based on events in the game.
2. The proximity and activities of enemies feed "danger" into an accumulator which is reset every frame.
2. The danger level slowly tapers off over time.
3. Playing tapes increases "mystical".
*/

#pragma strict

// outlets

var music_layers : AudioClip[];
var death_sting  : AudioClip;
var win_sting    : AudioClip;

// state

private var music_sources : AudioSource[];
private var music_volume  : float[];
private var sting_source  : AudioSource;
private var target_gain   : float[];

private var danger                  = 0.0;
private var danger_level_accumulate = 0.0;
private var mystical                = 0.0;
private var global_gain             = 1.0;
private var target_global_gain      = 1.0;
private var gain_recover_delay      = 0.0;
private var mod_controller          : ModController;

enum MusicEvent {DEAD, WON};
function HandleEvent(event : MusicEvent) {
    // TODO: instead of hardcoding gain_recover_delay, can we use the length of the audio clip itself?
    switch (event) {
        case MusicEvent.DEAD:
            target_global_gain = 0.0;
            gain_recover_delay = 1.0;
            sting_source.PlayOneShot(death_sting);
            break;
        case MusicEvent.WON:
            target_global_gain = 0.0;
            gain_recover_delay = 4.0;
            sting_source.PlayOneShot(GameObject.Find("gui_skin_holder").GetComponent(GUISkinHolder).win_sting);
            break;
    }
}

function AddDangerLevel(val : float) {
    danger_level_accumulate += val;
}

function SetMystical(val : float) {
    mystical = val;
}

function Start () {
    music_sources = new AudioSource[music_layers.Length];
    music_volume  = new float[music_layers.Length];
    target_gain   = new float[music_layers.Length];
    for (var i = 0; i < music_layers.length; ++i) {
        var source : AudioSource = gameObject.AddComponent(AudioSource);
        source.clip              = music_layers[i];

        music_sources[i]        = source;
        music_sources[i].loop   = true;
        music_sources[i].volume = 0.0;
        music_sources[i].Play();

        music_volume[i] = 0.0;
        target_gain[i]  = 0.0;
    }
    sting_source = gameObject.AddComponent(AudioSource);

    target_gain[0] = 1.0;

    //
    mod_controller = GameObject.Find("gui_skin_holder").GetComponent(GUISkinHolder).GetComponent(ModController);
}

function Update() {
    danger                  = Mathf.Max(danger_level_accumulate, danger);
    danger_level_accumulate = 0.0;

    // TODO: handle this through option menu onChange event instead
    for (var i = 0; i < music_layers.Length; ++i) {
        music_sources[i].volume = music_volume[i] * PlayerPrefs.GetFloat("music_volume");
    }
    sting_source.volume = PlayerPrefs.GetFloat("music_volume", 1.0);
}

function FixedUpdate () {
    if (mod_controller.hasPerk(Perk.MONOPHOBIA)) {
        target_gain[1] = 1.0 - Mathf.Min(1.0, danger);
        target_gain[2] = 1.0 - Mathf.Min(1.0, danger);
        target_gain[3] = 1.0 - Mathf.Clamp(danger - 0.5, 0.0, 1.0);
    } else {
        target_gain[1] = danger;
        target_gain[2] = danger;
        target_gain[3] = Mathf.Max(0.0, danger - 0.5);
    }
    target_gain[4] = mystical;

    danger   *= 0.99;
    mystical *= 0.99;

    // FIXME: constant should be based on Time.fixedDeltaTime
    global_gain = Mathf.Lerp(global_gain, target_global_gain, 0.01);
    if (gain_recover_delay > 0.0) {
        gain_recover_delay -= Time.deltaTime;
        if (gain_recover_delay <= 0.0) {
            target_global_gain = 1.0;
        }
    }

    for (var i = 0; i < music_layers.Length; ++i) {
        music_volume[i] = Mathf.Lerp(music_volume[i], target_gain[i], 0.01) * global_gain;
    }
}
