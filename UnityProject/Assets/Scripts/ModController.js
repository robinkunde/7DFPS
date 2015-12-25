#pragma strict

enum Perk {
    MOONSHOT,
    _1850PSI,
    MONOPHOBIA,
    SHORT_SLEEVES,
    SHRAPNEL,
    MAGNIFICENT,
};

private var perk_titles = {
    Perk.MOONSHOT      : 'Moonshot',
    Perk._1850PSI      : '1850 psi',
    Perk.MONOPHOBIA    : 'Monophobia',
    Perk.SHORT_SLEEVES : 'Short Sleeves',
    Perk.SHRAPNEL      : 'Pocketful of Shrapnel',
    Perk.MAGNIFICENT   : 'Magnificent'
};

private var available_perks = new Array(Perk.MOONSHOT, Perk._1850PSI, Perk.MONOPHOBIA, Perk.SHORT_SLEEVES, Perk.SHRAPNEL, Perk.MAGNIFICENT);
private var active_perks    = new Hashtable();
private var kMaxPerks       = 3;

public function Awake() {
}

public function Init(weapon_holder : WeaponHolder) {
    if (!weapon_holder.mag_object) {
        available_perks.remove(Perk.MAGNIFICENT);
    }

    for (var i = 0; i < kMaxPerks; ++i) {
        if (available_perks.length == 0) break;

        var index          = Random.Range(0, available_perks.length);
        var perk : Perk    = available_perks[index];
        active_perks[perk] = perk;
        available_perks.RemoveAt(index);

        // handle mutually exclusive perks and other perk specific actions
        if (perk == Perk.MOONSHOT) {
            available_perks.remove(Perk._1850PSI);
        } else if (perk == Perk._1850PSI) {
            available_perks.remove(Perk.MOONSHOT);
        }
    }
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
private var magsSpawned  = 0;
private var magsPickedUp = 0;

public function GetMagSpawnChance() : int {
    return Mathf.Max(0, 50 - magsSpawned * 5 - magsPickedUp * 10);
}

public function DidSpawnMag() {
    ++magsSpawned;
}

public function DidPickupMag() {
    ++magsPickedUp;
}
