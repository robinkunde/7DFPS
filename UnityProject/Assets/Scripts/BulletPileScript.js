/*
This script is executed when a new bullet pile is spawned. It decides the number of bullets the piles contain, and randomizes
their position and orientation to give them a scattered look.

The code also spawns a tape and/or flashlight some of the time.

General notes of about code:

1. BulletScript.RandomOrientation() is used for all spawned objects and so should be broken out or go into a base class if applicable.
*/

#pragma strict

function Start () {
    var holder = GameObject.Find("gui_skin_holder").GetComponent(GUISkinHolder);
    // The weapon holder is required here because conceptually, it owns the bullet object.
    var weapon_holder = holder.weapon.GetComponent(WeaponHolder);
    var num_bullets   = Random.Range(1, 6);
    for (var i = 0; i < num_bullets; i++) {
        var bullet : GameObject = Instantiate(weapon_holder.bullet_object);
        // random offset from the piles' position
        bullet.transform.position = transform.position +
            Vector3(Random.Range(-0.1, 0.1),
                    Random.Range(0.0, 0.2),
                    Random.Range(-0.1, 0.1));
        bullet.transform.rotation = BulletScript.RandomOrientation();
        // Enable physics. This will make sure the bullets are in proper resting positions when the player
        // comes across them and don't float.
        bullet.AddComponent(Rigidbody);
        // By marking the bullets as collided, we make sure no sounds are played when the bullets are settled by physics.
        bullet.GetComponent(ShellCasingScript).collided = true;
    }
    // 25% chance to spawn tape
    if (Random.Range(0, 4) == 0) {
        var tape : GameObject = Instantiate(holder.tape_object);
        tape.transform.position = transform.position +
            Vector3(Random.Range(-0.1, 0.1),
                    Random.Range(0.0, 0.2),
                    Random.Range(-0.1, 0.1));
        tape.transform.rotation = BulletScript.RandomOrientation();
    }
    // 25% chance to spawn flashlight if the player has none.
    if (!holder.has_flashlight && Random.Range(0, 4) == 0) {
        var flashlight : GameObject = Instantiate(holder.flashlight_object);
        flashlight.transform.position = transform.position +
            Vector3(Random.Range(-0.1, 0.1),
                    Random.Range(0.2, 0.4),
                    Random.Range(-0.1, 0.1));
        flashlight.transform.rotation = BulletScript.RandomOrientation();
    }

    var mod_controller   = holder.mod_controller;
    var mag_spawn_chance = mod_controller.GetMagSpawnChance();
    if (weapon_holder.mag_object && mod_controller.HasPerk(Perk.MAGNIFICENT) && Random.Range(0, 100) < mag_spawn_chance) {
        mod_controller.DidSpawnMag();

        var mag : GameObject   = Instantiate(weapon_holder.mag_object);
        mag.transform.position = transform.position +
            Vector3(Random.Range(0.1, 0.2),
                    Random.Range(0.2, 0.4),
                    Random.Range(0.1, 0.2));
        mag.transform.rotation = BulletScript.RandomOrientation();
        mag.AddComponent(Rigidbody);
        mag.GetComponent(mag_script).collided = true;
    }
}

// Pile is inert
function Update () {
}
