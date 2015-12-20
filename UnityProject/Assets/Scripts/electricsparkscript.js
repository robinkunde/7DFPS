/*
This script controlls the behavior of the electrical sparks emitted by destroyed drones and turrets.

General notes:
1. opac var is used to both set the color/opacity of the spark as well as determine its lifetime.
*/

#pragma strict

private var opac = 0.0;

function UpdateColor() {
    var color = Vector4(opac, opac, opac, opac);
    for (var renderer : MeshRenderer in transform.GetComponentsInChildren(MeshRenderer)) {
        renderer.material.SetColor("_TintColor", color);
    }
    for (var light : Light in transform.GetComponentsInChildren(Light)) {
        light.intensity = opac * 2.0;
    }
}

function Start() {
    // The color vector uses values between 0 and 1 for RGBA.
    opac = Random.Range(0.4, 1.0);
    UpdateColor();

    // Set random z axis orientation.
    transform.localRotation.eulerAngles.z = Random.Range(0.0, 360.0);
    // Randomly scale spark size, along each axis individually.
    transform.localScale.x = Random.Range(0.8, 2.0);
    transform.localScale.y = Random.Range(0.8, 2.0);
    transform.localScale.z = Random.Range(0.8, 2.0);
}

function Update() {
    UpdateColor();
    transform.localScale += Vector3(1, 1, 1) * Time.deltaTime * 30.0;

    opac -= Time.deltaTime * 5.0;
    if (opac <= 0.0) {
        Destroy(gameObject);
    }
}
