/*
This script is run when a level area is spawned.

1. This is where randomness and level design meet. The level prefabs contain all the possible spawn locations for items, enemies, and the player.
2. All 10 are loaded when the game starts. When a new tile is created, a subset of all enemies and items is cloned for the new instance.
3. For some reason, cloning the enemies is very slow. If that can't be fixed, it might be worth limiting the number of enemies spawned per frame.
4. There's no code to de-spawn far away level tiles.
5. Because of that, this script keeps accumulating lights to evaluate in update().
*/

#pragma strict

// outlets

var level_tiles : GameObject[];

// state

private var shadowed_lights : Array;
private var tiles           : Array;

// constants

private var kMaxChallenge = 0.6;

function SpawnTile(where:int, challenge:float , player:boolean) {
    var level_obj = level_tiles[Random.Range(0, level_tiles.Length)];
    var level     = new GameObject(level_obj.name + " (Clone)");

    for (var child : Transform in level_obj.transform) {
        if (child.gameObject.name != "enemies" && child.gameObject.name != "player_spawn" && child.gameObject.name != "items") {
            var child_obj              = Instantiate(child.gameObject, Vector3(0, 0, where * 20) + child.localPosition, child.localRotation);
            child_obj.transform.parent = level.transform;
        }
    }

    var enemies = level_obj.transform.FindChild("enemies");
    if (enemies) {
        for (var child : Transform in enemies) {
            if (Random.Range(0.0, 1.0) <= challenge) {
                child_obj                  = Instantiate(child.gameObject, Vector3(0, 0, where * 20) + child.localPosition + enemies.localPosition, child.localRotation);
                child_obj.transform.parent = level.transform;
            }
        }
    }

    var items = level_obj.transform.FindChild("items");
    if (items) {
        for (var child : Transform in items) {
            if (Random.Range(0.0, 1.0) <= (player ? challenge + 0.3 : challenge)) {
                child_obj                  = Instantiate(child.gameObject, Vector3(0, 0, where * 20) + child.localPosition + items.localPosition, items.localRotation);
                child_obj.transform.parent = level.transform;
            }
        }
    }

    if (player) {
        var players = level_obj.transform.FindChild("player_spawn");
        if (players) {
            // FIXME
            var num = 0;
            for (var child : Transform in players) {
                ++num;
            }
            var save = Random.Range(0, num);
            var j    = 0;
            for (var child : Transform in players) {
                if (j == save) {
                    child_obj                  = Instantiate(child.gameObject, Vector3(0, 0, where * 20) + child.localPosition + players.localPosition, child.localRotation);
                    child_obj.transform.parent = level.transform;
                    child_obj.name             = "Player";
                }
                ++j;
            }
        }
    }

    level.transform.parent = this.gameObject.transform;


    // FIXME: this re-adds ALL spawned lights to the array
    var lights = GetComponentsInChildren(Light);
    for (var light : Light in lights) {
        if (light.enabled && light.shadows == LightShadows.Hard) {
            shadowed_lights.push(light);
        }
    }
    tiles.push(where);
}

function Start () {
    shadowed_lights = new Array();
    tiles = new Array();
    SpawnTile(0, 0.0, true);
    for (var i = -3; i <= 3; ++i) {
        CreateTileIfNeeded(i);
    }
}

function CreateTileIfNeeded(which:int){
    var found = false;
    for (var tile:int in tiles) {
        if (tile == which) {
            found = true;
        }
    }
    if (!found) {
        SpawnTile(which, Mathf.Min(kMaxChallenge, 0.1 * Mathf.Abs(which)), false);
    }
}

function Update () {
    var main_camera  = GameObject.Find("Main Camera").transform;
    var tile_x : int = main_camera.position.z / 20.0 + 0.5;
    for (var i = -2; i <= 2; ++i) {
        CreateTileIfNeeded(tile_x + i);
    }
    // fade/disable light shadows depending on distance
    for (var light : Light in shadowed_lights) {
        if (light) {
            var shadowed_amount  = Vector3.Distance(main_camera.position, light.gameObject.transform.position);
            var shadow_threshold = Mathf.Min(30, light.range * 2.0);
            var fade_threshold   = shadow_threshold * 0.75;
            if (shadowed_amount < shadow_threshold) {
                light.shadows        = LightShadows.Hard;
                light.shadowStrength = Mathf.Min(1.0, 1.0 - (fade_threshold - shadowed_amount) / (fade_threshold - shadow_threshold));
            } else {
                light.shadows = LightShadows.None;
            }
        } else {
            Debug.Log("LIGHT IS MISSING");
        }
    }
}
