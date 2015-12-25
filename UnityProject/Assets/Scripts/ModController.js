#pragma strict

enum Perk {
    MOONSHOT,
    _1850PSI,
    MONOPHOBIA,
};

private var perk_titles = {
    Perk.MOONSHOT   : 'Moonshot',
    Perk._1850PSI   : '1850 psi',
    Perk.MONOPHOBIA : 'Monophobia'
};

private var available_perks = new Array(Perk.MOONSHOT, Perk._1850PSI, Perk.MONOPHOBIA);
private var active_perks    = new Hashtable();
private var kMaxPerks       = 3;

public function Awake() {
    for (var i = 0; i < kMaxPerks; ++i) {
        if (available_perks.length == 0) break;

        var index          = Random.Range(0, available_perks.length);
        var perk : Perk    = available_perks[index];
        active_perks[perk] = perk;
        available_perks.RemoveAt(index);

        if (perk == Perk.MOONSHOT) {
            Debug.Log(available_perks.length);
            available_perks.remove(Perk._1850PSI);
            Debug.Log(available_perks.length);
        } else if (perk == Perk._1850PSI) {
            available_perks.remove(Perk.MOONSHOT);
        }
    }
}

public function Init(weapon_holder : WeaponHolder) {

}

public function hasPerk(perk : Perk) : boolean {
    return active_perks.Contains(perk);
}

public function getActivePerkTitles() : String[] {
    var titles = new String[active_perks.Count];
    var i = 0;
    for (var perk : Perk in active_perks.Keys) {
        titles[i] = perk_titles[perk];
        ++i;
    }

    return titles;
}

public function getMoonshotForce(mass : float) : Vector3 {
    return Vector3(0.0, mass * -(Physics.gravity.y + 0.25), 0.0);
}

public function get1850PSIForceMultiplier() : float {
    return 0.025;
}
