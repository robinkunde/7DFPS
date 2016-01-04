#pragma strict

enum Perk {
    MOONSHOT,
    _1850PSI,
    MONOPHOBIA,
    SHORT_SLEEVES,
    SHRAPNEL,
    MAGNIFICENT,
    DEJA_VU,
    SLOW_DAY,
    UNSEEN,
    CONSUMER_GRADE,
};

private var perk_titles = {
    Perk.MOONSHOT       : 'Moonshot',
    Perk._1850PSI       : '1850 psi',
    Perk.MONOPHOBIA     : 'Monophobia',
    Perk.SHORT_SLEEVES  : 'Short Sleeves',
    Perk.SHRAPNEL       : 'Pocketful of Shrapnel',
    Perk.MAGNIFICENT    : 'Magnificent',
    Perk.DEJA_VU        : 'Déjà vu',
    Perk.SLOW_DAY       : 'Slow Day',
    Perk.UNSEEN         : 'The Unseen Bullet is the Deadliest',
    Perk.CONSUMER_GRADE : 'Consumer Grade'
};

private var available_perks = {
    Perk.MOONSHOT       : 1.0,
    Perk._1850PSI       : 1.0,
    Perk.MONOPHOBIA     : 1.0,
    Perk.SHORT_SLEEVES  : 1.0,
    Perk.SHRAPNEL       : 1.0,
    Perk.MAGNIFICENT    : 1.0,
    Perk.DEJA_VU        : 0.25,
    Perk.SLOW_DAY       : 1.0,
    Perk.UNSEEN         : 1.0,
    Perk.CONSUMER_GRADE : 1.0
};

private var active_perks    = new Hashtable();
private var kMaxPerks       = 1;

public function Awake() {
}

public function Init(weapon_holder : WeaponHolder, has_previous_seed : boolean) : Hashtable {
    var all_perks = new Hashtable(available_perks);
    active_perks  = new Hashtable();

    mags_spawned   = 0;
    mags_picked_up = 0;

    if (!has_previous_seed) {
        all_perks.Remove(Perk.DEJA_VU);
    }

    if (!weapon_holder.mag_object) {
        all_perks.Remove(Perk.MAGNIFICENT);
    }

    for (var i = 0; i < kMaxPerks; ++i) {
        if (all_perks.Count == 0) break;

        var perk : Perk    = weightedRandom(all_perks);
        active_perks[perk] = perk;
        all_perks.Remove(perk);

        // handle mutually exclusive perks and other perk specific actions
        if (perk == Perk.MOONSHOT) {
            all_perks.Remove(Perk._1850PSI);
        } else if (perk == Perk._1850PSI) {
            all_perks.Remove(Perk.MOONSHOT);
        }
    }

    return active_perks;
}

public function weightedRandom(hash : Hashtable) : Perk {
    var total_weight = 0.0;
    for (var i : float in hash.Values) {
        total_weight += i;
    }

    var random_num = Random.Range(0.0, total_weight);

    var acc_weight = 0.0;
    var i : Perk;
    for (i in hash.Keys) {
        var val : float = hash[i];
        acc_weight     += val;
        if (random_num < acc_weight) {
            return i;
        }
    }

    // guard against float inaccuracies
    return i;
}

public function weightedRandomTest() {
    var all_perks = new Hashtable(available_perks);

    var results = new Hashtable();
    for (var p : Perk in all_perks.Keys) {
        results[p] = 0;
    }

    var perk : Perk;
    for (var i = 0; i < 10000; ++i) {
        perk = weightedRandom(all_perks);
        var f : float = results[perk];
        results[perk] = f + 1;
    }

    for (var p : Perk in results.Keys) {
        Debug.Log(p + ' ' + results[p]);
    }
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

//
public function GetSlowDayTimescale() : float {
    return 0.95;
}

//
public function GetConsumerGradeDamageThreshold() : float {
    return 2.5;
}
