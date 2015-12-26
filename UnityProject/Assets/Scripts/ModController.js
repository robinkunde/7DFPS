#pragma strict

enum Perk {
    MOONSHOT,
    _1850PSI,
    MONOPHOBIA,
    SHORT_SLEEVES,
    SHRAPNEL,
    MAGNIFICENT,
    DEJA_VU,
};

private var perk_titles = {
    Perk.MOONSHOT      : 'Moonshot',
    Perk._1850PSI      : '1850 psi',
    Perk.MONOPHOBIA    : 'Monophobia',
    Perk.SHORT_SLEEVES : 'Short Sleeves',
    Perk.SHRAPNEL      : 'Pocketful of Shrapnel',
    Perk.MAGNIFICENT   : 'Magnificent',
    Perk.DEJA_VU       : 'Déjà vu'
};

private var available_perks = new Array(Perk.MOONSHOT, Perk._1850PSI, Perk.MONOPHOBIA, Perk.SHORT_SLEEVES, Perk.SHRAPNEL, Perk.MAGNIFICENT, Perk.DEJA_VU);
private var active_perks    = new Hashtable();
private var kMaxPerks       = 1;

public function Awake() {
}

public function Init(weapon_holder : WeaponHolder, has_previous_seed : boolean) : Hashtable {
    var all_perks = new Array(available_perks);
    active_perks  = new Hashtable();

    mags_spawned   = 0;
    mags_picked_up = 0;

    if (!has_previous_seed) {
        all_perks.remove(Perk.DEJA_VU);
    }

    if (!weapon_holder.mag_object) {
        all_perks.remove(Perk.MAGNIFICENT);
    }

    for (var i = 0; i < kMaxPerks; ++i) {
        if (all_perks.length == 0) break;

        var index          = Random.Range(0, all_perks.length);
        var perk : Perk    = all_perks[index];
        active_perks[perk] = perk;
        all_perks.RemoveAt(index);

        // handle mutually exclusive perks and other perk specific actions
        if (perk == Perk.MOONSHOT) {
            all_perks.remove(Perk._1850PSI);
        } else if (perk == Perk._1850PSI) {
            all_perks.remove(Perk.MOONSHOT);
        }
    }

    return active_perks;
}

public function SetActivePerks(perks : Hashtable) {
    active_perks = perks;
}

public function AddActivePerk(perk : Perk) {
    active_perks[perk] = perk;
}

public function HasPerk(perk : Perk) : boolean {
    return active_perks.Contains(perk);
}

public function GetActivePerkTitles() : String[] {
    var titles = new String[active_perks.Count];
    var i = 0;
    for (var perk : Perk in active_perks.Keys) {
        titles[i] = perk_titles[perk];
        ++i;
    }

    return titles;
}

//
public function GetMoonshotForce(mass : float) : Vector3 {
    return Vector3(0.0, mass * -(Physics.gravity.y + 0.25), 0.0);
}

//
public function Get1850PSIForceMultiplier() : float {
    return 0.025;
}

//
public function GetShortSleevesGrabRange() : float {
    return 4.0;
}

//
private var mags_spawned   = 0;
private var mags_picked_up = 0;

public function GetMagSpawnChance() : int {
    return Mathf.Max(0, 50 - mags_spawned * 5 - mags_picked_up * 10);
}

public function DidSpawnMag() {
    ++mags_spawned;
}

public function DidPickupMag() {
    ++mags_picked_up;
}
