#pragma strict

private var opac = 0.0;

function UpdateColor() {
    var color = Vector4(0, 0, 0, opac * 0.2);

    for (var renderer : MeshRenderer in transform.GetComponentsInChildren(MeshRenderer)) {
        renderer.material.SetColor("_TintColor", color);
    }
}

function Start () {
    opac = Random.Range(0.0, 1.0);
    UpdateColor();

    transform.localRotation.eulerAngles.z = Random.Range(0.0, 360.0);
    transform.localScale.x                = Random.Range(0.8, 2.0);
    transform.localScale.y                = Random.Range(0.8, 2.0);
    transform.localScale.z                = Random.Range(0.8, 2.0);
}

function Update() {
    UpdateColor();
    transform.localScale += Vector3(1, 1, 1) * Time.deltaTime * 30.0;

    opac -= Time.deltaTime * 10.0;
    if (opac <= 0.0) {
        Destroy(gameObject);
    }
}
