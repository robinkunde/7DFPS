#pragma strict

enum Perk {
    MOONSHOT,
};

private var perk_titles = {
    Perk.MOONSHOT : 'Moonshot'
};

private var available_perks = new Array(Perk.MOONSHOT);
private var active_perks    = new Hashtable();
private var kMaxPerks       = 3;

public function Awake() {
    for (var i = 0; i < kMaxPerks; ++i) {
        if (available_perks.length == 0) break;

        var index          = Random.Range(0, available_perks.length);
        var perk : Perk    = available_perks[index];
        active_perks[perk] = perk;
        available_perks.RemoveAt(index);
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
